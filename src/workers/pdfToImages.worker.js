/**
 * PDF to Images Worker
 * Converts PDF pages to PNG images using PDF.js and OffscreenCanvas
 */

import * as pdfjsLib from 'pdfjs-dist'

// Use jsdelivr CDN for PDF.js worker (mirrors npm packages)
// IMPORTANT: Version must match the installed pdfjs-dist package version
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.530/build/pdf.worker.min.mjs'

let isReady = false

/**
 * Convert ArrayBuffer to base64 string
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Convert a single PDF page to PNG
 * @param {Object} page - PDF.js page object
 * @param {number} scale - Render scale
 * @returns {Promise<{data: string, width: number, height: number}>}
 */
async function renderPageToImage(page, scale) {
  const viewport = page.getViewport({ scale })
  const canvas = new OffscreenCanvas(
    Math.floor(viewport.width),
    Math.floor(viewport.height)
  )
  const ctx = canvas.getContext('2d')

  await page.render({
    canvasContext: ctx,
    viewport,
  }).promise

  const blob = await canvas.convertToBlob({ type: 'image/png' })
  const dataUrl = await blobToBase64(blob)

  return {
    data: dataUrl.split(',')[1], // base64 without prefix
    width: Math.floor(viewport.width),
    height: Math.floor(viewport.height),
  }
}

/**
 * Convert PDF to images
 * @param {string} requestId - Unique request ID
 * @param {ArrayBuffer} pdfData - PDF file data
 * @param {Object} options - Conversion options
 */
async function convertPdf(requestId, pdfData, options = {}) {
  const { scale = 2.0, maxPages = 30 } = options

  try {
    // Load PDF document
    self.postMessage({
      type: 'progress',
      requestId,
      current: 0,
      total: 0,
      stage: 'loading',
    })

    const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise
    const totalPages = Math.min(pdf.numPages, maxPages)

    self.postMessage({
      type: 'progress',
      requestId,
      current: 0,
      total: totalPages,
      stage: 'ready',
      originalPages: pdf.numPages,
    })

    // Process each page
    for (let i = 1; i <= totalPages; i++) {
      self.postMessage({
        type: 'progress',
        requestId,
        current: i,
        total: totalPages,
        stage: 'converting',
      })

      const page = await pdf.getPage(i)
      const { data, width, height } = await renderPageToImage(page, scale)

      self.postMessage({
        type: 'page',
        requestId,
        index: i - 1,
        data,
        width,
        height,
      })
    }

    self.postMessage({
      type: 'complete',
      requestId,
      pageCount: totalPages,
      skippedPages: pdf.numPages > maxPages ? pdf.numPages - maxPages : 0,
    })
  } catch (error) {
    self.postMessage({
      type: 'error',
      requestId,
      message: error.message || 'PDF conversion failed',
    })
  }
}

// Message handler
self.onmessage = async (event) => {
  const { type, requestId, pdfData, options } = event.data

  switch (type) {
    case 'init':
      isReady = true
      self.postMessage({ type: 'ready' })
      break

    case 'convert':
      if (!isReady) {
        self.postMessage({
          type: 'error',
          requestId,
          message: 'Worker not initialized',
        })
        return
      }
      await convertPdf(requestId, pdfData, options)
      break

    case 'terminate':
      self.close()
      break

    default:
      self.postMessage({
        type: 'error',
        requestId,
        message: `Unknown message type: ${type}`,
      })
  }
}
