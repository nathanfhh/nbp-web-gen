import { ref } from 'vue'
import { useOPFS } from './useOPFS'
import {
  compressToWebP,
  generateThumbnail,
  generateThumbnailFromBlob,
  blobToBase64,
  formatFileSize,
} from './useImageCompression'

/**
 * Get image dimensions from a Blob
 * @param {Blob} blob - Image blob
 * @returns {Promise<{width: number, height: number}>}
 */
const getImageDimensionsFromBlob = (blob) => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(blob)

    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight,
      })
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image for dimensions'))
    }

    img.src = url
  })
}

/**
 * Image Storage Composable
 *
 * Integrates OPFS storage with WebP compression.
 * Handles saving, loading, and deleting images with metadata.
 */
export function useImageStorage() {
  const opfs = useOPFS()
  const isProcessing = ref(false)
  const error = ref(null)

  // Cache for loaded image URLs (to avoid reloading)
  const urlCache = new Map()

  /**
   * Save generated images to OPFS with compression
   * @param {number} historyId - History record ID
   * @param {Array<{data: string, mimeType: string}>} images - Base64 images from API
   * @param {Object} options - Options
   * @param {number} options.quality - WebP quality (default 0.85)
   * @returns {Promise<Array<Object>>} Image metadata for IndexedDB
   */
  const saveGeneratedImages = async (historyId, images, options = {}) => {
    const { quality = 0.85 } = options

    if (!images || images.length === 0) {
      return []
    }

    isProcessing.value = true
    error.value = null

    try {
      // Ensure OPFS is initialized
      await opfs.initOPFS()

      // Create directory for this history record
      const dirPath = `images/${historyId}`
      await opfs.getOrCreateDirectory(dirPath)

      const savedImages = []

      for (let i = 0; i < images.length; i++) {
        const image = images[i]

        // Compress to WebP
        const compressed = await compressToWebP(image, { quality })

        // Generate thumbnail
        const thumbnail = await generateThumbnail(image)

        // Save WebP to OPFS
        const opfsPath = `/${dirPath}/${i}.webp`
        await opfs.writeFile(opfsPath, compressed.blob)

        // Build metadata
        savedImages.push({
          index: i,
          // Preserve pageNumber for slides mode (if present)
          ...(image.pageNumber !== undefined && { pageNumber: image.pageNumber }),
          originalSize: compressed.originalSize,
          compressedSize: compressed.compressedSize,
          originalFormat: image.mimeType,
          compressedFormat: 'image/webp',
          width: compressed.width,
          height: compressed.height,
          opfsPath,
          thumbnail,
        })
      }

      return savedImages
    } catch (err) {
      error.value = err
      console.error('Failed to save images:', err)
      throw err
    } finally {
      isProcessing.value = false
    }
  }

  /**
   * Load a single image from OPFS as Object URL
   * @param {string} opfsPath - OPFS file path
   * @returns {Promise<string|null>} Object URL or null
   */
  const loadImage = async (opfsPath) => {
    // Check cache first
    if (urlCache.has(opfsPath)) {
      return urlCache.get(opfsPath)
    }

    const url = await opfs.getFileURL(opfsPath)
    if (url) {
      urlCache.set(opfsPath, url)
    }
    return url
  }

  /**
   * Load a single image from OPFS as Blob
   * @param {string} opfsPath - OPFS file path
   * @returns {Promise<Blob|null>}
   */
  const loadImageBlob = async (opfsPath) => {
    return opfs.readFile(opfsPath)
  }

  /**
   * Load all images for a history record
   * @param {Object} historyRecord - History record with images array
   * @returns {Promise<Array<Object>>} Images with loaded URLs
   */
  const loadHistoryImages = async (historyRecord) => {
    if (!historyRecord.images || historyRecord.images.length === 0) {
      return []
    }

    const loadedImages = []

    for (const img of historyRecord.images) {
      const url = await loadImage(img.opfsPath)
      loadedImages.push({
        ...img,
        url,
        // For compatibility with existing lightbox
        data: null, // Not using base64
        mimeType: 'image/webp',
      })
    }

    return loadedImages
  }

  /**
   * Delete images for a history record
   * @param {number} historyId - History record ID
   * @returns {Promise<boolean>}
   */
  const deleteHistoryImages = async (historyId) => {
    try {
      const dirPath = `images/${historyId}`

      // Clear cached URLs for this history
      for (const [path, url] of urlCache.entries()) {
        if (path.startsWith(`/${dirPath}/`)) {
          URL.revokeObjectURL(url)
          urlCache.delete(path)
        }
      }

      // Delete directory
      await opfs.deleteDirectory(dirPath, true)
      return true
    } catch (err) {
      console.error('Failed to delete history images:', err)
      return false
    }
  }

  /**
   * Delete all stored images
   * @returns {Promise<boolean>}
   */
  const deleteAllImages = async () => {
    try {
      // Revoke all cached URLs
      for (const url of urlCache.values()) {
        URL.revokeObjectURL(url)
      }
      urlCache.clear()

      // Delete entire images directory
      await opfs.deleteDirectory('images', true)
      return true
    } catch (err) {
      console.error('Failed to delete all images:', err)
      return false
    }
  }

  /**
   * Get total storage usage
   * @returns {Promise<number>} Size in bytes
   */
  const getStorageUsage = async () => {
    return opfs.getStorageUsage('images')
  }

  /**
   * Get formatted storage usage
   * @returns {Promise<string>} Formatted size string
   */
  const getFormattedStorageUsage = async () => {
    const bytes = await getStorageUsage()
    return formatFileSize(bytes)
  }

  /**
   * Check if images exist for a history record
   * @param {number} historyId - History record ID
   * @returns {Promise<boolean>}
   */
  const hasStoredImages = async (historyId) => {
    const dirPath = `images/${historyId}`
    const dir = await opfs.getDirectory(dirPath)
    return dir !== null
  }

  /**
   * Clean up cached URLs (call when component unmounts)
   */
  const cleanupCache = () => {
    for (const url of urlCache.values()) {
      URL.revokeObjectURL(url)
    }
    urlCache.clear()
  }

  /**
   * Get image as base64 for download
   * @param {string} opfsPath - OPFS file path
   * @returns {Promise<string|null>} Base64 string
   */
  const getImageBase64 = async (opfsPath) => {
    const blob = await loadImageBlob(opfsPath)
    if (!blob) return null
    return blobToBase64(blob)
  }

  /**
   * Save images to OPFS WITHOUT re-compression (for import scenarios)
   * Images are already WebP from export, so we skip compression and only generate thumbnails.
   * Uses parallel processing for speed.
   *
   * @param {number} historyId - History record ID
   * @param {Array<{data: string, mimeType: string}>} images - Base64 images
   * @param {Object} options - Options
   * @param {number} options.concurrency - Max parallel operations (default 5)
   * @returns {Promise<Array<Object>>} Image metadata for IndexedDB
   */
  const saveImagesForImport = async (historyId, images, options = {}) => {
    const { concurrency = 5 } = options

    if (!images || images.length === 0) {
      return []
    }

    isProcessing.value = true
    error.value = null

    try {
      await opfs.initOPFS()

      const dirPath = `images/${historyId}`
      await opfs.getOrCreateDirectory(dirPath)

      const savedImages = []

      // Process images in batches for controlled concurrency
      for (let i = 0; i < images.length; i += concurrency) {
        const batch = images.slice(i, i + concurrency)

        const batchResults = await Promise.all(
          batch.map(async (image, batchIndex) => {
            const index = i + batchIndex
            const opfsPath = `/${dirPath}/${index}.webp`
            const mimeType = image.mimeType || 'image/webp'
            const isWebP = mimeType === 'image/webp'

            let blob, width, height, originalSize, compressedSize

            if (isWebP) {
              // Fast path: already WebP, skip re-compression
              const binaryString = atob(image.data)
              const bytes = new Uint8Array(binaryString.length)
              for (let j = 0; j < binaryString.length; j++) {
                bytes[j] = binaryString.charCodeAt(j)
              }
              blob = new Blob([bytes], { type: 'image/webp' })
              const dimensions = await getImageDimensionsFromBlob(blob)
              width = dimensions.width
              height = dimensions.height
              originalSize = blob.size
              compressedSize = blob.size
            } else {
              // Non-WebP: convert to WebP
              const compressed = await compressToWebP(image, { quality: 0.85 })
              blob = compressed.blob
              width = compressed.width
              height = compressed.height
              originalSize = compressed.originalSize
              compressedSize = compressed.compressedSize
            }

            // Write to OPFS
            await opfs.writeFile(opfsPath, blob)

            // Generate thumbnail from blob
            const thumbnail = await generateThumbnailFromBlob(blob)

            return {
              index,
              ...(image.pageNumber !== undefined && { pageNumber: image.pageNumber }),
              originalSize,
              compressedSize,
              originalFormat: mimeType,
              compressedFormat: 'image/webp',
              width,
              height,
              opfsPath,
              thumbnail,
            }
          })
        )

        savedImages.push(...batchResults)
      }

      return savedImages
    } catch (err) {
      error.value = err
      console.error('Failed to save images for import:', err)
      throw err
    } finally {
      isProcessing.value = false
    }
  }

  return {
    // State
    isProcessing,
    error,

    // Methods
    saveGeneratedImages,
    loadImage,
    loadImageBlob,
    loadHistoryImages,
    deleteHistoryImages,
    deleteAllImages,
    getStorageUsage,
    getFormattedStorageUsage,
    hasStoredImages,
    cleanupCache,
    getImageBase64,
    saveImagesForImport,
  }
}
