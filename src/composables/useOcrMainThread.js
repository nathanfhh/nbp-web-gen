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
// Preprocessing Functions
// ============================================================================

function preprocessForDetection(bitmap, ortModule) {
  const maxSideLen = 1280
  let width = bitmap.width
  let height = bitmap.height

  const scale = maxSideLen / Math.max(width, height)
  width = Math.round(width * scale)
  height = Math.round(height * scale)

  const newWidth = Math.ceil(width / 32) * 32
  const newHeight = Math.ceil(height / 32) * 32

  // Use OffscreenCanvas (works in main thread too)
  const canvas = new OffscreenCanvas(newWidth, newHeight)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, newWidth, newHeight)
  ctx.drawImage(bitmap, 0, 0, width, height)

  const imageData = ctx.getImageData(0, 0, newWidth, newHeight)
  const data = imageData.data

  const mean = [0.485, 0.456, 0.406]
  const std = [0.229, 0.224, 0.225]

  const float32Data = new Float32Array(3 * newWidth * newHeight)
  for (let i = 0; i < newWidth * newHeight; i++) {
    const r = data[i * 4] / 255
    const g = data[i * 4 + 1] / 255
    const b = data[i * 4 + 2] / 255

    float32Data[i] = (r - mean[0]) / std[0]
    float32Data[newWidth * newHeight + i] = (g - mean[1]) / std[1]
    float32Data[2 * newWidth * newHeight + i] = (b - mean[2]) / std[2]
  }

  const tensor = new ortModule.Tensor('float32', float32Data, [1, 3, newHeight, newWidth])

  return {
    tensor,
    width: newWidth,
    height: newHeight,
    originalWidth: bitmap.width,
    originalHeight: bitmap.height,
    scaleX: bitmap.width / width,
    scaleY: bitmap.height / height,
  }
}

function preprocessForRecognition(bitmap, box, ortModule) {
  const targetHeight = 48
  const maxWidth = 320

  const xs = box.map((p) => p[0])
  const ys = box.map((p) => p[1])
  const x0 = Math.floor(Math.min(...xs))
  const y0 = Math.floor(Math.min(...ys))
  const x1 = Math.ceil(Math.max(...xs))
  const y1 = Math.ceil(Math.max(...ys))

  const cropWidth = x1 - x0
  const cropHeight = y1 - y0

  if (cropWidth <= 0 || cropHeight <= 0) return null

  const aspectRatio = cropWidth / cropHeight
  let targetWidth = Math.round(targetHeight * aspectRatio)
  targetWidth = Math.min(targetWidth, maxWidth)
  targetWidth = Math.max(targetWidth, 10)

  const canvas = new OffscreenCanvas(targetWidth, targetHeight)
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, targetWidth, targetHeight)
  ctx.drawImage(bitmap, x0, y0, cropWidth, cropHeight, 0, 0, targetWidth, targetHeight)

  const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight)
  const data = imageData.data

  const float32Data = new Float32Array(3 * targetWidth * targetHeight)
  for (let i = 0; i < targetWidth * targetHeight; i++) {
    const r = (data[i * 4] / 255 - 0.5) / 0.5
    const g = (data[i * 4 + 1] / 255 - 0.5) / 0.5
    const b = (data[i * 4 + 2] / 255 - 0.5) / 0.5

    float32Data[i] = r
    float32Data[targetWidth * targetHeight + i] = g
    float32Data[2 * targetWidth * targetHeight + i] = b
  }

  return new ortModule.Tensor('float32', float32Data, [1, 3, targetHeight, targetWidth])
}

// ============================================================================
// Postprocessing Functions
// ============================================================================

function dilateMask(mask, width, height, iterationsH = 4, iterationsV = 2) {
  let current = mask
  let next = new Uint8Array(mask.length)

  for (let iter = 0; iter < iterationsH; iter++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x
        if (current[idx] === 255) {
          next[idx] = 255
          if (x > 0) next[idx - 1] = 255
          if (x < width - 1) next[idx + 1] = 255
        }
      }
    }
    const temp = current
    current = next
    next = temp
    if (iter < iterationsH - 1) next.fill(0)
  }

  next.fill(0)

  for (let iter = 0; iter < iterationsV; iter++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x
        if (current[idx] === 255) {
          next[idx] = 255
          if (y > 0) next[idx - width] = 255
          if (y < height - 1) next[idx + width] = 255
        }
      }
    }
    const temp = current
    current = next
    next = temp
    if (iter < iterationsV - 1) next.fill(0)
  }

  return current
}

function postProcessDetection(output, width, height, scaleX, scaleY, originalWidth, originalHeight) {
  const data = output.data
  const outputDims = output.dims
  const threshold = 0.2
  const boxThreshold = 0.5
  const minArea = 100

  let outputH, outputW
  if (outputDims.length === 4) {
    outputH = outputDims[2]
    outputW = outputDims[3]
  } else if (outputDims.length === 3) {
    outputH = outputDims[1]
    outputW = outputDims[2]
  } else {
    outputH = outputDims[0]
    outputW = outputDims[1]
  }

  const actualWidth = outputW || width
  const actualHeight = outputH || height
  const finalScaleX = scaleX * (width / actualWidth)
  const finalScaleY = scaleY * (height / actualHeight)

  let mask = new Uint8Array(actualWidth * actualHeight)
  for (let i = 0; i < actualWidth * actualHeight; i++) {
    mask[i] = data[i] > threshold ? 255 : 0
  }

  const rawMask = new Uint8Array(mask)
  mask = dilateMask(mask, actualWidth, actualHeight, 2, 1)

  const boxes = []
  const visited = new Set()

  for (let y = 0; y < actualHeight; y++) {
    for (let x = 0; x < actualWidth; x++) {
      const idx = y * actualWidth + x
      if (mask[idx] === 0 || visited.has(idx)) continue

      const component = []
      const queue = [[x, y]]
      visited.add(idx)

      while (queue.length > 0) {
        const [cx, cy] = queue.shift()
        component.push([cx, cy])

        const neighbors = [
          [cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1],
          [cx - 1, cy - 1], [cx + 1, cy - 1], [cx - 1, cy + 1], [cx + 1, cy + 1],
        ]

        for (const [nx, ny] of neighbors) {
          if (nx < 0 || nx >= actualWidth || ny < 0 || ny >= actualHeight) continue
          const nidx = ny * actualWidth + nx
          if (mask[nidx] === 0 || visited.has(nidx)) continue
          visited.add(nidx)
          queue.push([nx, ny])
        }
      }

      let minX = Infinity, maxX = -Infinity
      let minY = Infinity, maxY = -Infinity
      let scoreSum = 0
      let rawPixelCount = 0

      for (const [px, py] of component) {
        minX = Math.min(minX, px)
        maxX = Math.max(maxX, px)
        minY = Math.min(minY, py)
        maxY = Math.max(maxY, py)

        const pIdx = py * actualWidth + px
        if (rawMask[pIdx] === 255) {
          scoreSum += data[pIdx]
          rawPixelCount++
        }
      }

      const boxW = maxX - minX + 1
      const boxH = maxY - minY + 1
      const boxArea = boxW * boxH

      if (boxArea < minArea || rawPixelCount < 10) continue

      const area = component.length
      const perimeter = 2 * (boxW + boxH)
      const unclipRatio = 1.5
      const offset = (area * unclipRatio) / perimeter

      const expandedMinX = Math.max(0, minX - offset)
      const expandedMinY = Math.max(0, minY - offset)
      const expandedMaxX = Math.min(actualWidth - 1, maxX + offset)
      const expandedMaxY = Math.min(actualHeight - 1, maxY + offset)

      const score = rawPixelCount > 0 ? scoreSum / rawPixelCount : 0
      if (score < boxThreshold) continue

      const box = [
        [expandedMinX * finalScaleX, expandedMinY * finalScaleY],
        [expandedMaxX * finalScaleX, expandedMinY * finalScaleY],
        [expandedMaxX * finalScaleX, expandedMaxY * finalScaleY],
        [expandedMinX * finalScaleX, expandedMaxY * finalScaleY],
      ]

      for (const point of box) {
        point[0] = Math.max(0, Math.min(originalWidth, point[0]))
        point[1] = Math.max(0, Math.min(originalHeight, point[1]))
      }

      boxes.push({ box, score })
    }
  }

  return boxes
}

function decodeRecognition(output, dictionary) {
  const data = output.data
  const dims = output.dims
  const seqLen = dims[1]
  const vocabSize = dims[2]

  let text = ''
  let totalConf = 0
  let charCount = 0
  let prevIdx = 0

  for (let t = 0; t < seqLen; t++) {
    let maxIdx = 0
    let maxVal = data[t * vocabSize]

    for (let v = 1; v < vocabSize; v++) {
      const val = data[t * vocabSize + v]
      if (val > maxVal) {
        maxVal = val
        maxIdx = v
      }
    }

    if (maxIdx !== 0 && maxIdx !== prevIdx) {
      if (maxIdx < dictionary.length) {
        text += dictionary[maxIdx]
        totalConf += Math.exp(maxVal)
        charCount++
      }
    }

    prevIdx = maxIdx
  }

  const confidence = charCount > 0 ? Math.round((totalConf / charCount) * 100) : 0
  return { text, confidence: Math.min(100, confidence) }
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
        const canUseWebGPU = !isMobile() && (await hasWebGPU())

        // Load ONNX Runtime dynamically (with WASM paths pre-configured)
        const ortModule = await loadOnnxRuntime()

        // Configure ONNX Runtime threading
        ortModule.env.wasm.numThreads = 1

        // Load models in parallel
        reportProgress(5, '載入模型...')
        if (onProgress) onProgress(5, '載入模型...')

        const [detModelResult, recModelResult, dictResult] = await Promise.all([
          getModel('detection', (p) => {
            const prog = 5 + p * 30
            reportProgress(prog, '載入偵測模型...')
            if (onProgress) onProgress(prog, '載入偵測模型...')
          }),
          getModel('recognition', (p) => {
            const prog = 35 + p * 30
            reportProgress(prog, '載入辨識模型...')
            if (onProgress) onProgress(prog, '載入辨識模型...')
          }),
          getModel('dictionary', (p) => {
            const prog = 65 + p * 5
            reportProgress(prog, '載入字典...')
            if (onProgress) onProgress(prog, '載入字典...')
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

      if (onProgress) onProgress(10, 'Detecting text regions...', 'detection')
      const { tensor: detTensor, width, height, originalWidth, originalHeight, scaleX, scaleY } =
        preprocessForDetection(bitmap, ort)

      const detOutput = await detSession.run({ x: detTensor })
      const outputTensor = detOutput[Object.keys(detOutput)[0]]

      if (onProgress) onProgress(30, 'Processing detection results...', 'detection')
      const detectedBoxes = postProcessDetection(
        outputTensor,
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

        const recTensor = preprocessForRecognition(bitmap, box, ort)
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

        const recOutput = await recSession.run({ x: recTensor })
        const recTensorOutput = recOutput[Object.keys(recOutput)[0]]
        const { text, confidence } = decodeRecognition(recTensorOutput, dictionary)

        const trimmedText = text.trim()
        rawResults.push({
          text: trimmedText,
          confidence,
          bounds: {
            x: Math.min(...box.map((p) => p[0])),
            y: Math.min(...box.map((p) => p[1])),
            width: Math.max(...box.map((p) => p[0])) - Math.min(...box.map((p) => p[0])),
            height: Math.max(...box.map((p) => p[1])) - Math.min(...box.map((p) => p[1])),
          },
          polygon: box,
          detectionScore: score,
          recognitionFailed: !trimmedText,
          failureReason: !trimmedText ? 'empty_text' : null,
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
export { hasWebGPU, isMobile }
