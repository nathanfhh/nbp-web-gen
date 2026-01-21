/**
 * OCR Main Thread Composable
 * Runs ONNX Runtime directly in main thread with WebGPU acceleration
 *
 * API is compatible with useOcrWorker.js for easy switching.
 * Use this when WebGPU is available for 3-5x speed improvement.
 *
 * Trade-offs:
 * - Pros: WebGPU acceleration, simpler debugging
 * - Cons: May block UI during inference (mitigated with loading overlay)
 */

import { ref, onUnmounted, getCurrentInstance } from 'vue'
import Tesseract from 'tesseract.js'
import { getSettings } from '@/composables/useOcrSettings'

// GPU error utilities (shared module)
import {
  GpuOutOfMemoryError,
  GpuBufferSizeError,
  isGpuBufferSizeError,
  isGpuMemoryError,
} from '@/utils/gpuErrors'

// ============================================================================ 
// ONNX Runtime Configuration
// ============================================================================ 

// ONNX Runtime version (must match package.json)
const ONNX_VERSION = '1.23.2'
const ONNX_CDN_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ONNX_VERSION}/dist/`

// Lazy-loaded ONNX Runtime module
let ort = null

/**
 * Load ONNX Runtime with WebGPU support
 * Uses dynamic import to ensure WASM paths are configured before module initialization
 */
async function loadOnnxRuntime() {
  if (ort) return ort

  // Import the WebGPU bundle dynamically
  ort = await import('onnxruntime-web/webgpu')

  // Configure WASM paths to use CDN (Vite doesn't properly bundle WASM files)
  ort.env.wasm.wasmPaths = ONNX_CDN_BASE

  return ort
}

// Shared utilities from ocr-core.js
import {
  mergeTextRegions,
  hasWebGPU,
  isMobile,
  loadImage,
  preprocessForDetection,
  postProcessDetection,
  preprocessForRecognition,
  decodeRecognition,
  createTesseractFallback,
} from '../utils/ocr-core.js'

// ============================================================================
// Model Configuration
// ============================================================================

// Model configuration is now centralized in ocrDefaults.js
// Use getModelConfig(modelSize) to get URLs based on current settings
import { getModelConfig } from '@/constants/ocrDefaults'

// OPFS model cache utilities (shared with ocr.worker.js)
import {
  modelExists,
  readModel,
  writeModel,
  downloadModel as downloadModelBase,
  clearModelCache,
} from '@/utils/ocrUtils'

// ============================================================================
// OPFS Model Cache
// ============================================================================

/**
 * Get model from OPFS cache or download
 * @param {string} modelType - 'detection', 'recognition', or 'dictionary'
 * @param {Object} modelConfig - Model configuration from getModelConfig()
 * @param {function} onProgress - Progress callback (0-1 range)
 */
async function getModel(modelType, modelConfig, onProgress) {
  const config = modelConfig[modelType]
  const exists = await modelExists(config.filename)

  if (exists) {
    return { data: await readModel(config.filename), cached: true }
  }

  // Convert ocrUtils progress format (percent 0-100) to local format (0-1)
  const data = await downloadModelBase(
    config.url,
    config.filename,
    config.size,
    (percent) => onProgress && onProgress(percent / 100)
  )
  await writeModel(config.filename, data)
  return { data, cached: false }
}



// ============================================================================ 
// Main Composable
// ============================================================================ 

/**
 * @returns {Object} OCR main thread composable (same API as useOcrWorker)
 */
export function useOcrMainThread() {
  // State
  const isLoading = ref(false)
  const isReady = ref(false)
  const progress = ref(0)
  const status = ref('')
  const error = ref(null)

  // Execution provider info
  const executionProvider = ref(null)

  // Session state
  let detSession = null
  let recSession = null
  let dictionary = null
  let isInitialized = false

  // Initialization promise
  let initPromise = null

  // Tesseract fallback (created lazily when first needed)
  let tesseractFallback = null

  /**
   * Report progress
   */
  const reportProgress = (value, message) => {
    progress.value = value
    status.value = message
  }

  /**
   * Get or create Tesseract fallback instance
   * Lazily initialized to avoid loading Tesseract until needed
   */
  function getTesseractFallback(onProgress) {
    if (!tesseractFallback) {
      tesseractFallback = createTesseractFallback(
        Tesseract,
        (value, message) => onProgress?.(value, message, 'tesseract')
      )
    }
    return tesseractFallback
  }

  /**
   * Initialize OCR engine
   */
  const initialize = async (onProgress) => {
    if (isInitialized && isReady.value) {
      return
    }

    if (initPromise) {
      return initPromise
    }

    isLoading.value = true
    error.value = null
    reportProgress(0, 'Initializing OCR engine...')

    initPromise = (async () => {
      try {
        // Check WebGPU availability
        const canUseWebGPU = await hasWebGPU()

        // Load ONNX Runtime dynamically (with WASM paths pre-configured)
        const ortModule = await loadOnnxRuntime()

        // Configure ONNX Runtime threading
        ortModule.env.wasm.numThreads = 1

        // Get model configuration based on current settings
        const ocrSettings = getSettings()
        const modelConfig = getModelConfig(ocrSettings.modelSize)
        console.log(`[useOcrMainThread] Using ${ocrSettings.modelSize} model`)

        // Load models in parallel
        reportProgress(5, 'ocr:loadingModelsFromCache')
        if (onProgress) onProgress(5, 'ocr:loadingModelsFromCache')

        const [detModelResult, recModelResult, dictResult] = await Promise.all([
          getModel('detection', modelConfig, (p) => {
            const prog = 5 + p * 30
            reportProgress(prog, 'ocr:loadingDetModel')
            if (onProgress) onProgress(prog, 'ocr:loadingDetModel')
          }),
          getModel('recognition', modelConfig, (p) => {
            const prog = 35 + p * 30
            reportProgress(prog, 'ocr:loadingRecModel')
            if (onProgress) onProgress(prog, 'ocr:loadingRecModel')
          }),
          getModel('dictionary', modelConfig, (p) => {
            const prog = 65 + p * 5
            reportProgress(prog, 'ocr:loadingDict')
            if (onProgress) onProgress(prog, 'ocr:loadingDict')
          }),
        ])

        // Parse dictionary
        // Note: ocrUtils.readModel() returns string for .txt files, ArrayBuffer for others
        const dictText = typeof dictResult.data === 'string'
          ? dictResult.data
          : new TextDecoder().decode(dictResult.data)
        dictionary = dictText.split(/\r?\n/)
        if (dictionary[dictionary.length - 1] === '') dictionary.pop()
        dictionary.unshift('blank')

        reportProgress(75, '初始化偵測引擎...')
        if (onProgress) onProgress(75, '初始化偵測引擎...')

        // Try execution providers (WebGPU first, fallback to WASM)
        // Using onnxruntime-web/webgpu bundle which has full WebGPU support
        const providers = canUseWebGPU ? ['webgpu', 'wasm'] : ['wasm']
        let selectedProvider = null

        const errors = []
        for (const provider of providers) {
          try {
            console.log(`[useOcrMainThread] Trying ${provider} provider...`)
            const sessionOptions = {
              executionProviders: [provider],
              graphOptimizationLevel: 'all',
            }

            detSession = await ortModule.InferenceSession.create(detModelResult.data, sessionOptions)
            reportProgress(85, '初始化辨識引擎...')
            if (onProgress) onProgress(85, '初始化辨識引擎...')

            recSession = await ortModule.InferenceSession.create(recModelResult.data, sessionOptions)
            selectedProvider = provider
            console.log(`[useOcrMainThread] Successfully using ${provider} execution provider`)
            break
          } catch (e) {
            const errorMsg = e.message || String(e)
            console.warn(`[useOcrMainThread] Failed with ${provider}:`, errorMsg)
            errors.push(`${provider}: ${errorMsg}`)
            // Clean up failed sessions
            if (detSession) {
              detSession.release()
              detSession = null
            }
            // Check for GPU buffer size error - throw immediately to trigger model downgrade
            if (isGpuBufferSizeError(errorMsg)) {
              console.warn('[useOcrMainThread] GPU buffer size limit exceeded during initialization')
              throw new GpuBufferSizeError(errorMsg)
            }
          }
        }

        if (!selectedProvider) {
          throw new Error(`Failed to initialize ONNX session. Errors: ${errors.join('; ')}`)
        }

        executionProvider.value = selectedProvider
        isInitialized = true
        isReady.value = true
        reportProgress(100, 'OCR 引擎就緒')
        if (onProgress) onProgress(100, 'OCR 引擎就緒')
      } catch (err) {
        error.value = err.message
        throw err
      } finally {
        isLoading.value = false
        initPromise = null
      }
    })()

    return initPromise
  }

  /**
   * Recognize text in image
   */
  const recognize = async (image, onProgress) => {
    if (!isInitialized || !isReady.value) {
      await initialize()
    }

    isLoading.value = true
    error.value = null

    // Declare bitmap and tensors outside try block for cleanup in finally
    // CRITICAL: Tensors hold GPU/CPU memory that won't be GC'd without explicit dispose()
    let bitmap = null
    let detTensor = null
    let detOutputTensor = null

    try {
      // Convert to data URL if needed
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
        let mimeType = 'image/png'
        if (image.startsWith('/9j/')) mimeType = 'image/jpeg'
        else if (image.startsWith('iVBOR')) mimeType = 'image/png'
        imageDataUrl = `data:${mimeType};base64,${image}`
      }

      if (onProgress) onProgress(0, 'Loading image...', 'detection')
      bitmap = await loadImage(imageDataUrl)

      // Get current OCR settings
      const ocrSettings = getSettings()

      if (onProgress) onProgress(10, 'Detecting text regions...', 'detection')
      const detResult = preprocessForDetection(bitmap, ocrSettings, ort.Tensor)
      detTensor = detResult.tensor
      const { width, height, originalWidth, originalHeight, scaleX, scaleY } = detResult

      let detOutput
      try {
        // Use dynamic input name (same as CPU worker for consistency)
        const detFeeds = { [detSession.inputNames[0]]: detTensor }
        detOutput = await detSession.run(detFeeds)
      } catch (e) {
        const errorMsg = e.message || String(e)
        // Check for GPU buffer size error first (more specific)
        if (isGpuBufferSizeError(errorMsg)) {
          console.warn('[useOcrMainThread] GPU buffer size error during detection:', errorMsg)
          throw new GpuBufferSizeError(errorMsg)
        }
        if (isGpuMemoryError(errorMsg)) {
          console.warn('[useOcrMainThread] GPU memory error during detection:', errorMsg)
          throw new GpuOutOfMemoryError(errorMsg)
        }
        throw e
      }
      // Use dynamic output name (same as CPU worker for consistency)
      detOutputTensor = detOutput[detSession.outputNames[0]]

      if (onProgress) onProgress(30, 'Processing detection results...', 'detection')
      const detectedBoxes = postProcessDetection(
        detOutputTensor,
        ocrSettings,
        width,
        height,
        scaleX,
        scaleY,
        originalWidth,
        originalHeight
      )

      // Dispose detection tensors early - no longer needed after postProcessDetection
      if (detTensor) {
        detTensor.dispose()
        detTensor = null
      }
      if (detOutputTensor) {
        detOutputTensor.dispose()
        detOutputTensor = null
      }

      if (onProgress) onProgress(50, `Found ${detectedBoxes.length} regions`, 'recognition')

      // Recognition
      const rawResults = []
      for (let i = 0; i < detectedBoxes.length; i++) {
        const { box, score } = detectedBoxes[i]

        const recTensor = preprocessForRecognition(bitmap, box, ort.Tensor)
        if (!recTensor) {
          rawResults.push({
            text: '',
            confidence: 0,
            bounds: {
              x: Math.min(...box.map((p) => p[0])),
              y: Math.min(...box.map((p) => p[1])),
              width: Math.max(...box.map((p) => p[0])) - Math.min(...box.map((p) => p[0])),
              height: Math.max(...box.map((p) => p[1])) - Math.min(...box.map((p) => p[1])),
            },
            polygon: box,
            detectionScore: score,
            recognitionFailed: true,
            failureReason: 'invalid_crop',
          })
          continue
        }

        let recOutputTensor = null
        try {
          // Use dynamic input name (same as CPU worker for consistency)
          const recFeeds = { [recSession.inputNames[0]]: recTensor }
          const recOutput = await recSession.run(recFeeds)
          // Use dynamic output name (same as CPU worker for consistency)
          recOutputTensor = recOutput[recSession.outputNames[0]]
          const { text, confidence } = decodeRecognition(recOutputTensor, dictionary)

          // Don't trim! Preserving leading/trailing spaces is crucial for layout analysis.
          // Also normalize special spaces.
          const rawText = text.replace(/\u3000/g, ' ').replace(/\u00A0/g, ' ')

          rawResults.push({
            text: rawText,
            confidence,
            bounds: {
              x: Math.min(...box.map((p) => p[0])),
              y: Math.min(...box.map((p) => p[1])),
              width: Math.max(...box.map((p) => p[0])) - Math.min(...box.map((p) => p[0])),
              height: Math.max(...box.map((p) => p[1])) - Math.min(...box.map((p) => p[1])),
            },
            polygon: box,
            detectionScore: score,
            recognitionFailed: !rawText.trim(),
            failureReason: !rawText.trim() ? 'empty_text' : null,
          })
        } catch (e) {
          const errorMsg = e.message || String(e)
          // Check for GPU buffer size error first (more specific)
          if (isGpuBufferSizeError(errorMsg)) {
            console.warn('[useOcrMainThread] GPU buffer size error during recognition:', errorMsg)
            throw new GpuBufferSizeError(errorMsg)
          }
          if (isGpuMemoryError(errorMsg)) {
            console.warn('[useOcrMainThread] GPU memory error during recognition:', errorMsg)
            throw new GpuOutOfMemoryError(errorMsg)
          }
          throw e
        } finally {
          // CRITICAL: Dispose recognition tensors immediately after each region
          // This prevents memory accumulation during the recognition loop
          recTensor.dispose()
          if (recOutputTensor) {
            recOutputTensor.dispose()
          }
        }

        if (onProgress) {
          const prog = 50 + Math.round((i / detectedBoxes.length) * 40)
          onProgress(prog, `Recognizing ${i + 1}/${detectedBoxes.length}...`, 'recognition')
        }
      }

      // Tesseract fallback (uses shared factory from ocr-core.js)
      const { applyTesseractFallback } = getTesseractFallback(onProgress)
      await applyTesseractFallback(bitmap, rawResults)

      if (onProgress) onProgress(95, 'Analyzing layout...', 'merge')
      // Pass layout settings from OCR Settings (WYSIWYG support)
      const layoutSettings = getSettings()
      const mergedResults = mergeTextRegions(rawResults, [], layoutSettings)

      if (onProgress) onProgress(100, `Found ${mergedResults.length} text blocks`, 'merge')

      return {
        regions: mergedResults,
        rawRegions: rawResults,
      }
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      // CRITICAL: Release ImageBitmap to free GPU/CPU memory
      // Each uncompressed bitmap can consume 50-100MB for high-res images
      if (bitmap) {
        bitmap.close()
      }

      // Dispose any remaining tensors (in case of early return or error)
      if (detTensor) {
        detTensor.dispose()
      }
      if (detOutputTensor) {
        detOutputTensor.dispose()
      }

      isLoading.value = false
    }
  }

  /**
   * Recognize multiple images
   */
  const recognizeMultiple = async (images, onProgress) => {
    const results = []
    for (let i = 0; i < images.length; i++) {
      if (onProgress) onProgress(i + 1, images.length)
      const result = await recognize(images[i])
      results.push(result)
    }
    return results
  }

  /**
   * Generate mask from OCR results
   */
  const generateMask = (width, height, ocrResults, padding = 1) => {
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
   * Terminate OCR engine
   */
  const terminate = async () => {
    if (detSession) {
      detSession.release()
      detSession = null
    }
    if (recSession) {
      recSession.release()
      recSession = null
    }
    if (tesseractFallback) {
      await tesseractFallback.terminateTesseract()
      tesseractFallback = null
    }

    dictionary = null
    isInitialized = false
    isReady.value = false
    isLoading.value = false
    status.value = 'OCR engine terminated'
    progress.value = 0
    executionProvider.value = null
  }

  // Safe lifecycle registration - only if in component context
  const vueInstance = getCurrentInstance()
  if (vueInstance) {
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
    executionProvider,

    // Methods
    initialize,
    recognize,
    recognizeMultiple,
    generateMask,
    terminate,
  }
}

// Export for convenience
export { hasWebGPU, isMobile, clearModelCache }

// Re-export GPU error classes for backwards compatibility
export { GpuOutOfMemoryError, GpuBufferSizeError } from '@/utils/gpuErrors'