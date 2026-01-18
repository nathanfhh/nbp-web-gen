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

// ============================================================================ 
// GPU Memory Error Detection
// ============================================================================ 

/**
 * Custom error class for GPU memory issues
 * Used to trigger automatic fallback to CPU/WASM mode
 */
export class GpuOutOfMemoryError extends Error {
  constructor(originalMessage) {
    super(`GPU out of memory: ${originalMessage}`)
    this.name = 'GpuOutOfMemoryError'
    this.originalMessage = originalMessage
  }
}

/**
 * Check if an error message indicates GPU memory exhaustion
 * Common patterns from WebGPU/ONNX Runtime when VRAM is insufficient
 */
function isGpuMemoryError(errorMessage) {
  if (!errorMessage) return false
  const msg = errorMessage.toLowerCase()
  return (
    msg.includes('out of memory') ||
    msg.includes('allocation failed') ||
    msg.includes('device lost') ||
    msg.includes('buffer allocation') ||
    msg.includes('memory exhausted') ||
    msg.includes('oom') ||
    msg.includes('gpu memory') ||
    msg.includes('vram') ||
    // WebGPU specific errors
    msg.includes('createbuffer') ||
    msg.includes('mapasync') ||
    // ONNX Runtime specific
    msg.includes('failed to allocate') ||
    msg.includes('gpubufferoffset')
  )
}

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
  getMinTesseractConfidence,
  cropRegionToDataUrl,
  hasWebGPU,
  isMobile,
  loadImage,
  preprocessForDetection,
  postProcessDetection,
  preprocessForRecognition,
  decodeRecognition,
} from '../utils/ocr-core.js'

// ============================================================================ 
// Model Configuration
// ============================================================================ 

// Use the same model source as Worker for consistency
// Models from nathanfhh/PaddleOCR-ONNX (user's HuggingFace repo)
const HF_BASE = 'https://huggingface.co/nathanfhh/PaddleOCR-ONNX/resolve/main'
const MODELS = {
  detection: {
    filename: 'PP-OCRv5_server_det.onnx',
    url: `${HF_BASE}/PP-OCRv5_server_det.onnx`,
    size: 88_000_000,
  },
  recognition: {
    filename: 'PP-OCRv5_server_rec.onnx',
    url: `${HF_BASE}/PP-OCRv5_server_rec.onnx`,
    size: 84_000_000,
  },
  dictionary: {
    filename: 'ppocrv5_dict.txt',
    url: `${HF_BASE}/ppocrv5_dict.txt`,
    size: 74_000,
  },
}

const OPFS_DIR = 'ocr-models'

// ============================================================================ 
// OPFS Model Cache
// ============================================================================ 

async function getModelsDirectory() {
  const root = await navigator.storage.getDirectory()
  return await root.getDirectoryHandle(OPFS_DIR, { create: true })
}

async function modelExists(filename) {
  try {
    const dir = await getModelsDirectory()
    await dir.getFileHandle(filename)
    return true
  } catch {
    return false
  }
}

async function readModel(filename) {
  const dir = await getModelsDirectory()
  const fileHandle = await dir.getFileHandle(filename)
  const file = await fileHandle.getFile()
  return file.arrayBuffer()
}

async function writeModel(filename, data) {
  const dir = await getModelsDirectory()
  const fileHandle = await dir.getFileHandle(filename, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(data)
  await writable.close()
}

/**
 * Clear all cached models from OPFS
 * @returns {Promise<boolean>} - true if cleared successfully
 */
async function clearModelCache() {
  try {
    const root = await navigator.storage.getDirectory()
    await root.removeEntry(OPFS_DIR, { recursive: true })
    return true
  } catch (e) {
    // Directory might not exist, which is fine
    if (e.name === 'NotFoundError') return true
    console.warn('Failed to clear model cache:', e)
    return false
  }
}

async function downloadModel(url, filename, expectedSize, onProgress) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download model: ${response.status}`)
  }

  const reader = response.body.getReader()
  const chunks = []
  let receivedLength = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    chunks.push(value)
    receivedLength += value.length

    if (onProgress && expectedSize) {
      onProgress(Math.min(receivedLength / expectedSize, 1))
    }
  }

  const data = new Uint8Array(receivedLength)
  let position = 0
  for (const chunk of chunks) {
    data.set(chunk, position)
    position += chunk.length
  }

  await writeModel(filename, data)
  return data.buffer
}

async function getModel(modelType, onProgress) {
  const config = MODELS[modelType]
  const exists = await modelExists(config.filename)

  if (exists) {
    return { data: await readModel(config.filename), cached: true }
  }

  const data = await downloadModel(config.url, config.filename, config.size, onProgress)
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

  // Tesseract state
  let tesseractWorker = null
  let tesseractInitPromise = null

  // Initialization promise
  let initPromise = null

  /**
   * Report progress
   */
  const reportProgress = (value, message) => {
    progress.value = value
    status.value = message
  }

  /**
   * Initialize Tesseract (lazy)
   */
  async function initializeTesseract() {
    if (tesseractWorker) return tesseractWorker
    if (tesseractInitPromise) return tesseractInitPromise

    tesseractInitPromise = (async () => {
      const originalWarn = console.warn
      console.warn = (...args) => {
        const message = args[0]?.toString() || ''
        if (!message.includes('Parameter not found')) {
          originalWarn.apply(console, args)
        }
      }

      try {
        tesseractWorker = await Tesseract.createWorker(['eng', 'chi_tra'], 1, {
          errorHandler: (err) => {
            if (!err.message?.includes('Parameter not found')) {
              console.error('Tesseract error:', err)
            }
          },
        })
      } finally {
        console.warn = originalWarn
      }

      return tesseractWorker
    })()

    return tesseractInitPromise
  }

  /**
   * Recognize with Tesseract fallback
   */
  async function recognizeWithTesseract(bitmap, region) {
    try {
      const worker = await initializeTesseract()
      const croppedDataUrl = await cropRegionToDataUrl(bitmap, region.bounds)

      const result = await worker.recognize(croppedDataUrl)
      const text = result.data.text.trim()
      const confidence = result.data.confidence

      const minConfidence = getMinTesseractConfidence(text)
      if (text && confidence >= minConfidence) {
        return { text, confidence }
      }
      return null
    } catch (err) {
      console.warn('Tesseract recognition failed:', err)
      return null
    }
  }

  /**
   * Apply Tesseract fallback for failed regions
   */
  async function applyTesseractFallback(bitmap, rawResults, onProgress) {
    const failedRegions = rawResults.filter((r) => r.recognitionFailed)
    if (failedRegions.length === 0) return rawResults

    if (onProgress) {
      onProgress(0, `Trying Tesseract fallback for ${failedRegions.length} region(s)...`, 'tesseract')
    }

    let recoveredCount = 0
    for (let i = 0; i < failedRegions.length; i++) {
      const region = failedRegions[i]
      const tesseractResult = await recognizeWithTesseract(bitmap, region)

      if (tesseractResult) {
        region.text = tesseractResult.text
        region.confidence = tesseractResult.confidence
        region.recognitionFailed = false
        region.failureReason = null
        region.recognitionSource = 'tesseract'
        recoveredCount++
      }

      if (onProgress) {
        const prog = Math.round(((i + 1) / failedRegions.length) * 100)
        onProgress(prog, `Tesseract: ${i + 1}/${failedRegions.length}`, 'tesseract')
      }
    }

    if (onProgress) {
      if (recoveredCount > 0) {
        onProgress(100, `Tesseract recovered ${recoveredCount}/${failedRegions.length} region(s)`, 'tesseract')
      } else {
        onProgress(100, `Tesseract could not recover any regions`, 'tesseract')
      }
    }

    return rawResults
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

        // Load models in parallel
        reportProgress(5, 'ocr:loadingModelsFromCache')
        if (onProgress) onProgress(5, 'ocr:loadingModelsFromCache')

        const [detModelResult, recModelResult, dictResult] = await Promise.all([
          getModel('detection', (p) => {
            const prog = 5 + p * 30
            reportProgress(prog, 'ocr:loadingDetModel')
            if (onProgress) onProgress(prog, 'ocr:loadingDetModel')
          }),
          getModel('recognition', (p) => {
            const prog = 35 + p * 30
            reportProgress(prog, 'ocr:loadingRecModel')
            if (onProgress) onProgress(prog, 'ocr:loadingRecModel')
          }),
          getModel('dictionary', (p) => {
            const prog = 65 + p * 5
            reportProgress(prog, 'ocr:loadingDict')
            if (onProgress) onProgress(prog, 'ocr:loadingDict')
          }),
        ])

        // Parse dictionary
        const dictText = new TextDecoder().decode(dictResult.data)
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
      const bitmap = await loadImage(imageDataUrl)

      // Get current OCR settings
      const ocrSettings = getSettings()

      if (onProgress) onProgress(10, 'Detecting text regions...', 'detection')
      const { tensor: detTensor, width, height, originalWidth, originalHeight, scaleX, scaleY } =
        preprocessForDetection(bitmap, ocrSettings, ort.Tensor)

      let detOutput
      try {
        detOutput = await detSession.run({ x: detTensor })
      } catch (e) {
        const errorMsg = e.message || String(e)
        if (isGpuMemoryError(errorMsg)) {
          console.warn('[useOcrMainThread] GPU memory error during detection:', errorMsg)
          throw new GpuOutOfMemoryError(errorMsg)
        }
        throw e
      }
      const outputTensor = detOutput[Object.keys(detOutput)[0]]

      if (onProgress) onProgress(30, 'Processing detection results...', 'detection')
      const detectedBoxes = postProcessDetection(
        outputTensor,
        ocrSettings,
        width,
        height,
        scaleX,
        scaleY,
        originalWidth,
        originalHeight
      )

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

        let recOutput
        try {
          recOutput = await recSession.run({ x: recTensor })
        } catch (e) {
          const errorMsg = e.message || String(e)
          if (isGpuMemoryError(errorMsg)) {
            console.warn('[useOcrMainThread] GPU memory error during recognition:', errorMsg)
            throw new GpuOutOfMemoryError(errorMsg)
          }
          throw e
        }
        const recTensorOutput = recOutput[Object.keys(recOutput)[0]]
        const { text, confidence } = decodeRecognition(recTensorOutput, dictionary)

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

        if (onProgress) {
          const prog = 50 + Math.round((i / detectedBoxes.length) * 40)
          onProgress(prog, `Recognizing ${i + 1}/${detectedBoxes.length}...`, 'recognition')
        }
      }

      // Tesseract fallback
      await applyTesseractFallback(bitmap, rawResults, onProgress)

      if (onProgress) onProgress(95, 'Analyzing layout...', 'merge')
      const mergedResults = mergeTextRegions(rawResults)

      if (onProgress) onProgress(100, `Found ${mergedResults.length} text blocks`, 'merge')

      return {
        regions: mergedResults,
        rawRegions: rawResults,
      }
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
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
    if (tesseractWorker) {
      await tesseractWorker.terminate()
      tesseractWorker = null
      tesseractInitPromise = null
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