import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
// JSZip is dynamically imported when needed to reduce initial bundle size
import { usePdfGenerator } from '@/composables/usePdfGenerator'
import { useToast } from '@/composables/useToast'

/**
 * Composable for sticker download functionality
 * Handles single download, ZIP, and PDF generation
 */
export function useStickerDownload() {
  const { t } = useI18n()
  const toast = useToast()
  const pdfGenerator = usePdfGenerator()

  const isDownloading = ref(false)

  /**
   * Download a single sticker as PNG
   * @param {Object} sticker - The sticker to download
   * @param {string} imagePrefix - Prefix for filename
   */
  const downloadSingleSticker = (sticker, imagePrefix) => {
    const link = document.createElement('a')
    link.href = sticker.dataUrl
    link.download = `image-${imagePrefix}-sticker-${sticker.id + 1}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  /**
   * Download selected stickers as ZIP
   * @param {Array} stickers - All stickers
   * @param {Set} selectedIds - Set of selected sticker IDs
   * @param {string} imagePrefix - Prefix for filename
   */
  const downloadSelectedAsZip = async (stickers, selectedIds, imagePrefix) => {
    const selected = stickers.filter(s => selectedIds.has(s.id))
    if (selected.length === 0) return

    isDownloading.value = true

    try {
      const { default: JSZip } = await import('jszip')
      const zip = new JSZip()

      for (const sticker of selected) {
        // Convert data URL to blob
        const response = await fetch(sticker.dataUrl)
        const blob = await response.blob()
        zip.file(`image-${imagePrefix}-sticker-${sticker.id + 1}.png`, blob)
      }

      const content = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(content)

      const link = document.createElement('a')
      link.href = url
      link.download = `image-${imagePrefix}-stickers.zip`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('ZIP generation failed:', err)
      toast.error(t('stickerCropper.toast.zipError'))
    } finally {
      isDownloading.value = false
    }
  }

  /**
   * Download selected stickers as PDF
   * @param {Array} stickers - All stickers
   * @param {Set} selectedIds - Set of selected sticker IDs
   * @param {string} imagePrefix - Prefix for filename
   */
  const downloadSelectedAsPdf = async (stickers, selectedIds, imagePrefix) => {
    const selected = stickers.filter(s => selectedIds.has(s.id))
    if (selected.length === 0) return

    isDownloading.value = true

    try {
      // Prepare image data for worker
      const imageDataArray = []
      for (const sticker of selected) {
        const response = await fetch(sticker.dataUrl)
        const blob = await response.blob()
        const arrayBuffer = await blob.arrayBuffer()
        imageDataArray.push({ data: arrayBuffer, mimeType: 'image/png' })
      }

      await pdfGenerator.generateAndDownload(imageDataArray, `image-${imagePrefix}-stickers`)
    } catch (err) {
      console.error('PDF generation failed:', err)
      toast.error(t('stickerCropper.toast.pdfError'))
    } finally {
      isDownloading.value = false
    }
  }

  return {
    isDownloading,
    downloadSingleSticker,
    downloadSelectedAsZip,
    downloadSelectedAsPdf,
  }
}
