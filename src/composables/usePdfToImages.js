/**
 * PDF to Images Composable
 * Wrapper for PDF conversion Web Worker
 *
 * Converts PDF files to PNG images using PDF.js in a background thread
 */

import { ref, onUnmounted } from 'vue'

/**
 * @typedef {Object} PdfPage
 * @property {number} index - Page index (0-based)
 * @property {string} data - Base64 image data (without data URL prefix)
 * @property {number} width - Image width
 * @property {number} height - Image height
 */

/**
 * @typedef {Object} ConvertOptions
 * @property {number} [scale=2.0] - Render scale for quality
 * @property {number} [maxPages=30] - Maximum pages to convert
 */

/**
 * @returns {Object} PDF to Images composable
 */
export function usePdfToImages() {
  // State
  const isLoading = ref(false)
  const isReady = ref(false)
  const progress = ref(0)
  const currentPage = ref(0)
  const totalPages = ref(0)
  const stage = ref('') // 'loading' | 'ready' | 'converting'
  const error = ref(null)

  // Worker instance
  let worker = null

  // Pending requests map
  const pendingRequests = new Map()
  let requestCounter = 0

  // Initialization promise
  let initPromise = null
  let initResolve = null

  /**
   * Handle messages from Worker
   */
  const handleWorkerMessage = (e) => {
    const { type, requestId, current, total, stage: msgStage, index, data, width, height, pageCount, skippedPages } = e.data

    switch (type) {
      case 'ready':
        isReady.value = true
        isLoading.value = false
        stage.value = 'ready'
        if (initResolve) {
          initResolve()
          initResolve = null
        }
        break

      case 'progress':
        if (requestId && pendingRequests.has(requestId)) {
          const request = pendingRequests.get(requestId)
          currentPage.value = current
          totalPages.value = total
          progress.value = total > 0 ? Math.round((current / total) * 100) : 0
          stage.value = msgStage || ''
          request.onProgress?.(current, total, msgStage)
        }
        break

      case 'page':
        if (requestId && pendingRequests.has(requestId)) {
          const request = pendingRequests.get(requestId)
          const page = { index, data, width, height }
          request.pages.push(page)
          request.onPage?.(page)
        }
        break

      case 'complete':
        if (requestId && pendingRequests.has(requestId)) {
          const request = pendingRequests.get(requestId)
          request.resolve({
            pages: request.pages,
            pageCount,
            skippedPages: skippedPages || 0,
          })
          pendingRequests.delete(requestId)
          // Reset progress state
          progress.value = 0
          currentPage.value = 0
          totalPages.value = 0
          stage.value = ''
        }
        break

      case 'error': {
        const errMsg = e.data.message
        error.value = errMsg
        if (requestId && pendingRequests.has(requestId)) {
          const request = pendingRequests.get(requestId)
          request.reject(new Error(errMsg))
          pendingRequests.delete(requestId)
        }
        break
      }
    }
  }

  /**
   * Initialize the worker
   * @returns {Promise<void>}
   */
  const initialize = async () => {
    if (isReady.value) return
    if (initPromise) return initPromise

    initPromise = new Promise((resolve, reject) => {
      initResolve = resolve

      // Create worker
      worker = new Worker(
        new URL('../workers/pdfToImages.worker.js', import.meta.url),
        { type: 'module' }
      )
      worker.onmessage = handleWorkerMessage
      worker.onerror = (e) => {
        error.value = e.message
        isLoading.value = false
        // Clean up failed worker so retry can recreate it
        worker.terminate()
        worker = null
        initPromise = null
        initResolve = null
        reject(new Error(e.message || 'Worker initialization failed'))
      }

      isLoading.value = true
      worker.postMessage({ type: 'init' })
    })

    return initPromise
  }

  /**
   * Convert PDF to images
   * @param {ArrayBuffer} pdfData - PDF file as ArrayBuffer
   * @param {ConvertOptions} [options] - Conversion options
   * @param {Object} [callbacks] - Progress callbacks
   * @param {Function} [callbacks.onProgress] - Called with (current, total, message)
   * @param {Function} [callbacks.onPage] - Called with each converted page
   * @returns {Promise<{pages: PdfPage[], pageCount: number, skippedPages: number}>}
   */
  const convert = async (pdfData, options = {}, callbacks = {}) => {
    await initialize()

    const requestId = `pdf-${++requestCounter}`

    return new Promise((resolve, reject) => {
      pendingRequests.set(requestId, {
        resolve,
        reject,
        pages: [],
        onProgress: callbacks.onProgress,
        onPage: callbacks.onPage,
      })

      worker.postMessage({
        type: 'convert',
        requestId,
        pdfData,
        options: {
          scale: options.scale || 2.0,
          maxPages: options.maxPages || 30,
        },
      })
    })
  }

  /**
   * Terminate the worker
   */
  const terminate = () => {
    if (worker) {
      worker.postMessage({ type: 'terminate' })
      worker.terminate()
      worker = null
    }
    isReady.value = false
    initPromise = null
  }

  // Cleanup on unmount
  onUnmounted(() => {
    terminate()
  })

  return {
    // State
    isLoading,
    isReady,
    progress,
    currentPage,
    totalPages,
    stage,
    error,

    // Methods
    initialize,
    convert,
    terminate,
  }
}
