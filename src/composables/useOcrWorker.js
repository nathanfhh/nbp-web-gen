/**
 * OCR Worker Composable
 * Wrapper for OCR Web Worker that runs ONNX Runtime in background thread
 *
 * API is backward compatible with the original main-thread implementation.
 * The heavy OCR inference now runs in a Web Worker to avoid blocking UI.
 */

import { ref, onUnmounted, getCurrentInstance } from 'vue'
import { useOcrModelCache } from './useOcrModelCache'

/**
 * OCR result for a single text region
 * @typedef {Object} OcrResult
 * @property {string} text - Recognized text
 * @property {number} confidence - Confidence score (0-100)
 * @property {{ x: number, y: number, width: number, height: number }} bounds - Bounding box
 * @property {Array<[number, number]>} polygon - Original polygon points from detection
 */

/**
 * @returns {Object} OCR worker composable
 */
export function useOcrWorker() {
  const modelCache = useOcrModelCache()

  // State
  const isLoading = ref(false)
  const isReady = ref(false)
  const progress = ref(0)
  const status = ref('')
  const error = ref(null)

  // Worker instance
  let worker = null

  // Pending requests map for handling multiple concurrent requests
  const pendingRequests = new Map()
  let requestCounter = 0

  // Promise for initialization (to handle concurrent initialize() calls)
  let initPromise = null
  let initResolve = null
  let initReject = null
  let initOnProgress = null

  /**
   * Handle messages from Worker
   */
  const handleWorkerMessage = (e) => {
    const { type, requestId, stage, value, message, regions, rawRegions } = e.data

    switch (type) {
      case 'ready':
        isReady.value = true
        isLoading.value = false
        status.value = 'OCR engine ready'
        progress.value = 100
        if (initResolve) {
          initResolve()
          initResolve = null
          initReject = null
        }
        break

      case 'progress':
        progress.value = value
        status.value = message || ''
        // Notify initialization progress callback
        if (stage === 'model' && initOnProgress) {
          initOnProgress(value, message)
        }
        // Also notify specific request's progress callback
        if (requestId && pendingRequests.has(requestId)) {
          const request = pendingRequests.get(requestId)
          request.onProgress?.(value, message, stage)
        }
        break

      case 'result':
        if (pendingRequests.has(requestId)) {
          const request = pendingRequests.get(requestId)
          request.resolve({ regions, rawRegions })
          pendingRequests.delete(requestId)
        }
        break

      case 'error': {
        const errorMessage = e.data.message || 'Unknown error'
        error.value = errorMessage

        if (requestId && pendingRequests.has(requestId)) {
          const request = pendingRequests.get(requestId)
          request.reject(new Error(errorMessage))
          pendingRequests.delete(requestId)
        } else if (initReject) {
          // Error during initialization
          initReject(new Error(errorMessage))
          initResolve = null
          initReject = null
        }
        break
      }

      default:
        console.warn('[useOcrWorker] Unknown message type:', type)
    }
  }

  /**
   * Initialize OCR Worker and load models
   * @param {function} onProgress - Optional progress callback (value, message)
   */
  const initialize = async (onProgress) => {
    // Already ready
    if (isReady.value && worker) {
      return
    }

    // Already initializing - wait for it
    if (initPromise) {
      return initPromise
    }

    isLoading.value = true
    status.value = 'Initializing OCR engine...'
    error.value = null
    progress.value = 0
    initOnProgress = onProgress || null

    initPromise = new Promise((resolve, reject) => {
      initResolve = resolve
      initReject = reject

      try {
        // Create worker
        worker = new Worker(
          new URL('../workers/ocr.worker.js', import.meta.url),
          { type: 'module' }
        )

        worker.onmessage = handleWorkerMessage

        worker.onerror = (e) => {
          console.error('[useOcrWorker] Worker error:', e)
          error.value = e.message || 'Worker initialization failed'
          isLoading.value = false
          if (initReject) {
            initReject(new Error(error.value))
            initResolve = null
            initReject = null
          }
        }

        // Send init command
        worker.postMessage({ type: 'init' })
      } catch (err) {
        isLoading.value = false
        error.value = err.message
        reject(err)
      }
    })

    try {
      await initPromise
    } finally {
      initPromise = null
      initOnProgress = null
    }
  }

  /**
   * Recognize text in an image
   * @param {string|Blob|File|HTMLImageElement} image - Image to process
   * @param {function} onProgress - Optional progress callback (value, message, stage)
   * @returns {Promise<{regions: OcrResult[], rawRegions: OcrResult[]}>}
   */
  const recognize = async (image, onProgress) => {
    // Ensure worker is initialized
    if (!worker || !isReady.value) {
      await initialize()
    }

    // Convert image to data URL if needed
    let imageDataUrl = image

    if (image instanceof HTMLImageElement) {
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const ctx = canvas.getContext('2d')
      ctx.drawImage(image, 0, 0)
      imageDataUrl = canvas.toDataURL('image/png')
    } else if (image instanceof Blob || image instanceof File) {
      imageDataUrl = await new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.readAsDataURL(image)
      })
    } else if (typeof image === 'string' && !image.startsWith('data:')) {
      // Plain base64 - convert to data URL
      let mimeType = 'image/png'
      if (image.startsWith('/9j/')) mimeType = 'image/jpeg'
      else if (image.startsWith('iVBOR')) mimeType = 'image/png'
      else if (image.startsWith('UklGR')) mimeType = 'image/webp'
      else if (image.startsWith('R0lGOD')) mimeType = 'image/gif'
      imageDataUrl = `data:${mimeType};base64,${image}`
    }

    return new Promise((resolve, reject) => {
      const requestId = `ocr-${++requestCounter}-${Date.now()}`

      pendingRequests.set(requestId, {
        resolve,
        reject,
        onProgress,
      })

      isLoading.value = true
      error.value = null

      worker.postMessage({
        type: 'recognize',
        requestId,
        image: imageDataUrl,
      })
    }).finally(() => {
      isLoading.value = false
    })
  }

  /**
   * Recognize text in multiple images
   * @param {Array} images
   * @param {function} onProgress - Progress callback (currentIndex, total)
   * @returns {Promise<Array<{regions: OcrResult[], rawRegions: OcrResult[]}>>}
   */
  const recognizeMultiple = async (images, onProgress) => {
    const results = []
    for (let i = 0; i < images.length; i++) {
      if (onProgress) {
        onProgress(i + 1, images.length)
      }
      const result = await recognize(images[i])
      results.push(result)
    }
    return results
  }

  /**
   * Generate mask from OCR results (runs on main thread - uses Canvas API)
   * @param {number} width
   * @param {number} height
   * @param {OcrResult[]} ocrResults
   * @param {number} padding
   * @returns {ImageData}
   */
  const generateMask = (width, height, ocrResults, padding = 5) => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')

    ctx.fillStyle = 'black'
    ctx.fillRect(0, 0, width, height)

    ctx.fillStyle = 'white'
    ctx.strokeStyle = 'white'
    ctx.lineWidth = padding * 2
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    for (const result of ocrResults) {
      if (result.polygon && result.polygon.length >= 3) {
        ctx.beginPath()
        ctx.moveTo(result.polygon[0][0], result.polygon[0][1])
        for (let i = 1; i < result.polygon.length; i++) {
          ctx.lineTo(result.polygon[i][0], result.polygon[i][1])
        }
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      } else {
        const { x, y, width: w, height: h } = result.bounds
        ctx.fillRect(
          Math.max(0, x - padding),
          Math.max(0, y - padding),
          Math.min(width - x + padding, w + padding * 2),
          Math.min(height - y + padding, h + padding * 2)
        )
      }
    }

    return ctx.getImageData(0, 0, width, height)
  }

  /**
   * Terminate OCR Worker
   */
  const terminate = () => {
    if (worker) {
      worker.postMessage({ type: 'terminate' })
      worker.terminate()
      worker = null
    }
    isReady.value = false
    isLoading.value = false
    status.value = 'OCR engine terminated'
    progress.value = 0

    // Reject any pending requests
    for (const [, request] of pendingRequests) {
      request.reject(new Error('Worker terminated'))
    }
    pendingRequests.clear()

    initPromise = null
    initResolve = null
    initReject = null
  }

  // Safe lifecycle registration - only if in component context
  const instance = getCurrentInstance()
  if (instance) {
    onUnmounted(() => {
      terminate()
    })
  }

  return {
    // State
    isLoading,
    isReady,
    progress,
    status,
    error,

    // Methods
    initialize,
    recognize,
    recognizeMultiple,
    generateMask,
    terminate,

    // Model cache access (for checking cache status, clearing, etc.)
    modelCache,
  }
}

// Export available languages
export const OCR_LANGUAGES = [{ code: 'ch', label: '中文/English (Chinese + English)' }]

export const OCR_MODEL_VERSIONS = [{ code: 'PP-OCRv5', label: 'PP-OCRv5 Server (PaddleOCR)' }]
