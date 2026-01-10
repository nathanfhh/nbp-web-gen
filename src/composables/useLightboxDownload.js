import { ref, computed } from 'vue'
import JSZip from 'jszip'

const DOWNLOAD_PREF_KEY = 'nbp-download-format'

/**
 * Composable for lightbox download functionality
 * Supports single image download, batch ZIP, and batch PDF export
 *
 * @param {Object} deps - Dependencies
 * @param {Object} deps.imageStorage - Image storage composable instance
 * @param {Object} deps.pdfGenerator - PDF generator composable instance
 * @param {Object} deps.toast - Toast notification composable instance
 * @param {Function} deps.t - i18n translation function
 * @returns {Object} Download state and methods
 */
export function useLightboxDownload(deps) {
  const { imageStorage, pdfGenerator, toast, t } = deps

  // Download state
  const downloadFormat = ref(localStorage.getItem(DOWNLOAD_PREF_KEY) || 'original')
  const showDownloadMenu = ref(false)
  const isDownloading = ref(false)
  const isBatchDownloading = ref(false)

  // Combined loading state
  const isAnyDownloading = computed(() => isDownloading.value || isBatchDownloading.value)

  /**
   * Toggle unified download menu
   */
  const toggleDownloadMenu = () => {
    showDownloadMenu.value = !showDownloadMenu.value
  }

  /**
   * Close download menu
   */
  const closeDownloadMenu = () => {
    showDownloadMenu.value = false
  }

  /**
   * Convert image to blob
   * @param {Object} image - Image object with url or data property
   * @returns {Promise<Blob|null>} Image blob or null
   */
  const imageToBlob = async (image) => {
    if (image.url) {
      // Historical images - fetch from Object URL
      const response = await fetch(image.url)
      return await response.blob()
    }
    if (image.data) {
      // Fresh images - convert base64 to blob
      const byteString = atob(image.data)
      const arrayBuffer = new ArrayBuffer(byteString.length)
      const uint8Array = new Uint8Array(arrayBuffer)
      for (let i = 0; i < byteString.length; i++) {
        uint8Array[i] = byteString.charCodeAt(i)
      }
      return new Blob([arrayBuffer], { type: image.mimeType || 'image/png' })
    }
    return null
  }

  /**
   * Get image source URL for display
   * @param {Object} image - Image object
   * @returns {string} Image source URL
   */
  const getImageSrc = (image) => {
    if (image.url) {
      return image.url
    }
    if (image.data) {
      return `data:${image.mimeType};base64,${image.data}`
    }
    return ''
  }

  /**
   * Download current image with specified format
   * @param {string} format - 'original' or 'webp'
   * @param {Function} downloadFn - Actual download function to execute
   */
  const downloadWithFormat = async (format, downloadFn) => {
    downloadFormat.value = format
    localStorage.setItem(DOWNLOAD_PREF_KEY, format)
    showDownloadMenu.value = false
    await downloadFn()
  }

  /**
   * Download current image
   * @param {Object} params - Download parameters
   * @param {Object} params.currentImage - Current image object
   * @param {Object} params.currentMetadata - Current image metadata
   * @param {number} params.currentIndex - Current image index
   * @param {boolean} params.isHistorical - Whether image is from history
   */
  const downloadCurrentImage = async ({ currentImage, currentMetadata, currentIndex, isHistorical }) => {
    if (!currentImage || isDownloading.value) return

    isDownloading.value = true
    showDownloadMenu.value = false

    const link = document.createElement('a')
    const timestamp = Date.now()
    const imageNum = currentIndex + 1

    try {
      if (isHistorical) {
        // Historical images: always download WebP from OPFS
        if (currentMetadata?.opfsPath) {
          const base64 = await imageStorage.getImageBase64(currentMetadata.opfsPath)
          if (base64) {
            link.href = `data:image/webp;base64,${base64}`
            link.download = `generated-image-${timestamp}-${imageNum}.webp`
          }
        }
      } else if (downloadFormat.value === 'webp') {
        // Fresh image, download WebP
        if (currentMetadata?.opfsPath) {
          // WebP already saved in OPFS
          const base64 = await imageStorage.getImageBase64(currentMetadata.opfsPath)
          if (base64) {
            link.href = `data:image/webp;base64,${base64}`
            link.download = `generated-image-${timestamp}-${imageNum}.webp`
          }
        } else {
          // WebP not ready yet, compress on-the-fly
          const { compressToWebP, blobToBase64 } = await import('@/composables/useImageCompression')
          const compressed = await compressToWebP(currentImage, { quality: 0.85 })
          const base64 = await blobToBase64(compressed.blob)
          link.href = `data:image/webp;base64,${base64}`
          link.download = `generated-image-${timestamp}-${imageNum}.webp`
        }
      } else {
        // Fresh image, download original
        link.href = getImageSrc(currentImage)
        const ext = currentImage.mimeType?.split('/')[1] || 'png'
        link.download = `generated-image-${timestamp}-${imageNum}.${ext}`
      }

      if (link.href) {
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }
    } finally {
      isDownloading.value = false
    }
  }

  /**
   * Download all images as ZIP
   * @param {Object} params - Download parameters
   * @param {Array} params.images - Array of image objects
   * @param {number|null} params.historyId - History ID for naming
   */
  const downloadAllAsZip = async ({ images, historyId }) => {
    if (images.length === 0 || isBatchDownloading.value) return

    isBatchDownloading.value = true
    showDownloadMenu.value = false

    try {
      const zip = new JSZip()
      const prefix = historyId ? `${historyId}-` : ''

      for (let i = 0; i < images.length; i++) {
        const image = images[i]
        const blob = await imageToBlob(image)
        if (blob) {
          const ext = image.mimeType?.split('/')[1] || 'png'
          zip.file(`image-${prefix}${i + 1}.${ext}`, blob)
        }
      }

      const content = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(content)

      const link = document.createElement('a')
      link.href = url
      link.download = `images-${prefix}${Date.now()}.zip`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('ZIP generation failed:', err)
      toast.error(t('lightbox.zipError'))
    } finally {
      isBatchDownloading.value = false
    }
  }

  /**
   * Download all images as PDF (using Web Worker via composable)
   * @param {Object} params - Download parameters
   * @param {Array} params.images - Array of image objects
   * @param {number|null} params.historyId - History ID for naming
   */
  const downloadAllAsPdf = async ({ images, historyId }) => {
    if (images.length === 0 || isBatchDownloading.value) return

    isBatchDownloading.value = true
    showDownloadMenu.value = false

    try {
      // Prepare image data for worker
      const imageDataArray = []
      for (const image of images) {
        const blob = await imageToBlob(image)
        if (!blob) continue

        const arrayBuffer = await blob.arrayBuffer()
        const mimeType = image.mimeType || blob.type || 'image/png'
        imageDataArray.push({ data: arrayBuffer, mimeType })
      }

      const prefix = historyId ? `${historyId}-` : ''
      await pdfGenerator.generateAndDownload(imageDataArray, `images-${prefix}${Date.now()}`)
    } catch (err) {
      console.error('PDF generation failed:', err)
      toast.error(t('lightbox.pdfError'))
    } finally {
      isBatchDownloading.value = false
    }
  }

  return {
    // State
    downloadFormat,
    showDownloadMenu,
    isDownloading,
    isBatchDownloading,
    isAnyDownloading,

    // Methods
    toggleDownloadMenu,
    closeDownloadMenu,
    imageToBlob,
    getImageSrc,
    downloadWithFormat,
    downloadCurrentImage,
    downloadAllAsZip,
    downloadAllAsPdf,
  }
}
