import { ref } from 'vue'
import PdfWorker from '@/workers/pdfGenerator.worker.js?worker'

/**
 * PDF Generator Composable
 * Uses Web Worker to generate PDF from images without blocking UI
 */
export function usePdfGenerator() {
  const isGenerating = ref(false)
  const error = ref(null)

  /**
   * Generate PDF from image data using Web Worker
   * @param {Array<{data: ArrayBuffer, mimeType: string}>} images - Image data array
   * @returns {Promise<Uint8Array>} PDF bytes
   */
  const generatePdf = async (images) => {
    if (images.length === 0) {
      throw new Error('No images provided')
    }

    isGenerating.value = true
    error.value = null

    try {
      const worker = new PdfWorker()

      const pdfBytes = await new Promise((resolve, reject) => {
        worker.onmessage = (e) => {
          worker.terminate()
          if (e.data.success) {
            resolve(e.data.data)
          } else {
            reject(new Error(e.data.error))
          }
        }
        worker.onerror = (err) => {
          worker.terminate()
          reject(err)
        }
        // Transfer ArrayBuffers to worker for better performance
        const transferables = images.map(img => img.data)
        worker.postMessage({ images }, transferables)
      })

      return pdfBytes
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      isGenerating.value = false
    }
  }

  /**
   * Generate PDF and trigger download
   * @param {Array<{data: ArrayBuffer, mimeType: string}>} images - Image data array
   * @param {string} filename - Download filename (without extension)
   */
  const generateAndDownload = async (images, filename = 'images') => {
    const pdfBytes = await generatePdf(images)

    let url = null
    let link = null

    try {
      const blob = new Blob([pdfBytes], { type: 'application/pdf' })
      url = URL.createObjectURL(blob)

      link = document.createElement('a')
      link.href = url
      link.download = `${filename}.pdf`
      document.body.appendChild(link)
      link.click()
    } finally {
      if (link?.parentNode) {
        link.parentNode.removeChild(link)
      }
      if (url) {
        URL.revokeObjectURL(url)
      }
    }
  }

  return {
    isGenerating,
    error,
    generatePdf,
    generateAndDownload,
  }
}
