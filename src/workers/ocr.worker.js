/**
 * OCR Web Worker
 * Runs ONNX Runtime + PaddleOCR v5 in background thread to avoid blocking UI
 * With Tesseract.js fallback for failed recognitions
 *
 * Communication Protocol:
 * - Main → Worker: { type: 'init' } | { type: 'recognize', requestId, image } | { type: 'terminate' }
 * - Worker → Main: { type: 'ready' } | { type: 'progress', ... } | { type: 'result', ... } | { type: 'error', ... }
 */

import * as ort from 'onnxruntime-web'
import Tesseract from 'tesseract.js'

// Shared OCR utilities (no external dependencies)
import {
  mergeTextRegions,
  getMinTesseractConfidence,
  cropRegionToDataUrl,
} from '../utils/ocr-core.js'

// Configure ONNX Runtime WASM paths (must be set before any session creation)
// Note: Using external CDN without SRI. For production, consider:
// 1. Self-hosting WASM files for supply chain security
// 2. Adding SRI hash verification if available
// Version must match the installed onnxruntime-web package version
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/'

// ============================================================================
// Model Configuration (copied from useOcrModelCache.js)
// ============================================================================

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
// Singleton State
// ============================================================================

let detSession = null
let recSession = null
let dictionary = null
let isInitialized = false

// Tesseract.js state (lazy initialized)
let tesseractWorker = null
let tesseractInitPromise = null

// ============================================================================ 
// Progress Reporting
// ============================================================================ 

const reportProgress = (stage, value, message, requestId = null) => {
  self.postMessage({ type: 'progress', stage, value, message, requestId })
}

// ============================================================================ 
// OPFS Model Loading (copied from useOcrModelCache.js, adapted for Worker)
// ============================================================================ 

async function getModelsDirectory() {
  const root = await navigator.storage.getDirectory()
  return await root.getDirectoryHandle(OPFS_DIR, { create: true })
}

async function modelExists(filename) {
  try {
    const dir = await getModelsDirectory()
    await dir.getFileHandle(filename, { create: false })
    return true
  } catch {
    return false
  }
}

async function readModel(filename) {
  const dir = await getModelsDirectory()
  const fileHandle = await dir.getFileHandle(filename, { create: false })
  const file = await fileHandle.getFile()
  return filename.endsWith('.txt') ? await file.text() : await file.arrayBuffer()
}

async function writeModel(filename, data) {
  const dir = await getModelsDirectory()
  const fileHandle = await dir.getFileHandle(filename, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(data)
  await writable.close()
}

async function downloadModel(url, filename, expectedSize) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download ${filename}: ${response.status}`)
  }

  const contentLength = response.headers.get('content-length')
  const total = contentLength ? parseInt(contentLength, 10) : expectedSize

  const reader = response.body.getReader()
  const chunks = []
  let received = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    chunks.push(value)
    received += value.length

    const fileProgress = Math.min(100, Math.round((received / total) * 100))
    const sizeMB = Math.round(received / 1024 / 1024)
    reportProgress('model', fileProgress, `下載中 ${sizeMB}MB... ${fileProgress}%`)
  }

  const data = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    data.set(chunk, offset)
    offset += chunk.length
  }

  return filename.endsWith('.txt') ? new TextDecoder().decode(data) : data.buffer
}

async function getModel(modelType, statusMessage) {
  const model = MODELS[modelType]
  if (!model) throw new Error(`Unknown model type: ${modelType}`)

  // Check OPFS cache first
  if (await modelExists(model.filename)) {
    reportProgress('model', 0, statusMessage)
    return { data: await readModel(model.filename), fromCache: true }
  }

  // Download and cache to OPFS
  const data = await downloadModel(model.url, model.filename, model.size)
  await writeModel(model.filename, data)
  return { data, fromCache: false }
}

async function loadAllModels() {
  // Check which models are cached
  const detCached = await modelExists(MODELS.detection.filename)
  const recCached = await modelExists(MODELS.recognition.filename)
  const dictCached = await modelExists(MODELS.dictionary.filename)
  const allCached = detCached && recCached && dictCached
  const modelsToDownload = [!detCached, !recCached].filter(Boolean).length

  if (allCached) {
    reportProgress('model', 0, '快速載入模型（從快取讀取）...')
  } else if (modelsToDownload > 0) {
    reportProgress('model', 0, `正在下載 ${modelsToDownload} 個模型（首次使用需下載約 170MB）...`)
  }

  // Load detection model
  const detStatus = detCached ? '載入偵測模型...' : '下載偵測模型 (1/2)...'
  const { data: detection } = await getModel('detection', detStatus)
  reportProgress('model', 33, detCached ? '偵測模型已載入' : '偵測模型下載完成')

  // Load recognition model
  const recStatus = recCached ? '載入辨識模型...' : `下載辨識模型 (${detCached ? '1' : '2'}/2)...`
  const { data: recognition } = await getModel('recognition', recStatus)
  reportProgress('model', 66, recCached ? '辨識模型已載入' : '辨識模型下載完成')

  // Load dictionary
  const { data: dictText } = await getModel('dictionary', '載入字典...')
  reportProgress('model', 90, '字典已載入')

  return { detection, recognition, dictionary: dictText }
}

// ============================================================================ 
// Image Loading (using OffscreenCanvas)
// ============================================================================ 

async function loadImage(imageDataUrl) {
  const response = await fetch(imageDataUrl)
  const blob = await response.blob()
  const bitmap = await createImageBitmap(blob)
  return bitmap
}

// ============================================================================ 
// OCR Preprocessing (copied from useOcrWorker.js, adapted for Worker)
// ============================================================================ 

function preprocessForDetection(bitmap) {
  // Reverted to 1280 to match original implementation baseline
  const maxSideLen = 1280
  let width = bitmap.width
  let height = bitmap.height

  // Only downscale if the image is larger than maxSideLen
  const ratio = maxSideLen / Math.max(width, height)
  const scale = ratio < 1 ? ratio : 1
  
  width = Math.round(width * scale)
  height = Math.round(height * scale)

  const newWidth = Math.ceil(width / 32) * 32
  const newHeight = Math.ceil(height / 32) * 32

  // Use OffscreenCanvas in Worker
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

  const tensor = new ort.Tensor('float32', float32Data, [1, 3, newHeight, newWidth])

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

function dilateMask(mask, width, height, iterationsH = 4, iterationsV = 2) {
  let current = mask
  let next = new Uint8Array(mask.length)

  // 1. Horizontal Dilation (Connect characters in a line)
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
    // Swap and clear
    const temp = current
    current = next
    next = temp
    if (iter < iterationsH - 1) {
      next.fill(0)
    }
  }

  // Reset next buffer for vertical pass (needed if we swapped)
  next.fill(0)

  // 2. Vertical Dilation (Connect strokes, but less aggressive to avoid merging lines)
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
    // Swap and clear
    const temp = current
    current = next
    next = temp
    if (iter < iterationsV - 1) {
      next.fill(0)
    }
  }

  return current
}

function postProcessDetection(output, width, height, scaleX, scaleY, originalWidth, originalHeight) {
  let data = output.data
  const outputDims = output.dims
  const threshold = 0.2
  // Reverted to 0.5 to match original implementation baseline
  const boxThreshold = 0.5
  // Original implementation uses minArea = 100
  // Since we now use aggressive horizontal dilation, small noise will be filtered out naturally
  // or merged into larger blocks. 100 is safe.
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

  // Apply asymmetric dilation: 4x Horizontal, 2x Vertical
  // This strongly favors merging horizontally (text lines) over vertically
  
  // Save original mask for scoring
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

        // 8-connectivity neighbors (including diagonals)
        const neighbors = [
          [cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1],
          [cx - 1, cy - 1], [cx + 1, cy - 1], [cx - 1, cy + 1], [cx + 1, cy + 1]
        ]

        for (const [nx, ny] of neighbors) {
          if (nx < 0 || nx >= actualWidth || ny < 0 || ny >= actualHeight) continue
          const nidx = ny * actualWidth + nx
          if (mask[nidx] === 0 || visited.has(nidx)) continue
          visited.add(nidx)
          queue.push([nx, ny])
        }
      }

      // Calculate bounding box dimensions
      let minX = Infinity, maxX = -Infinity
      let minY = Infinity, maxY = -Infinity

      // Variables for scoring based on RAW mask
      let scoreSum = 0
      let rawPixelCount = 0

      for (const [px, py] of component) {
        minX = Math.min(minX, px)
        maxX = Math.max(maxX, px)
        minY = Math.min(minY, py)
        maxY = Math.max(maxY, py)

        // Only count score if this pixel was in the original detection (undilated)
        // This prevents dilation from dragging down the average score with background pixels
        const pIdx = py * actualWidth + px
        if (rawMask[pIdx] === 255) {
          scoreSum += data[pIdx]
          rawPixelCount++
        }
      }

      // Filter by size constraints (Original: minArea=100, minPixelCount=10)
      const boxW = maxX - minX + 1
      const boxH = maxY - minY + 1
      const boxArea = boxW * boxH
      
      // Use rawPixelCount for minPixelCount check (stricter and more accurate)
      // If we used component.length, dilation would fake pixel count
      const pixelCount = rawPixelCount

      if (boxArea < minArea || pixelCount < 10) continue

      // Calculate unclip offset (DBNet expansion)
      // The model outputs a shrunk text region. We need to expand it back to the full text boundary.
      // offset = Area * unclip_ratio / Perimeter
      // Note: We use component.length (dilated area) for unclip geometry, as we want the box to cover the dilated region
      const area = component.length
      const perimeter = 2 * (boxW + boxH)
      const unclipRatio = 1.5
      const offset = (area * unclipRatio) / perimeter

      const expandedMinX = Math.max(0, minX - offset)
      const expandedMinY = Math.max(0, minY - offset)
      const expandedMaxX = Math.min(actualWidth - 1, maxX + offset)
      const expandedMaxY = Math.min(actualHeight - 1, maxY + offset)

      // Score is average of RAW pixels
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

function preprocessForRecognition(bitmap, box) {
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

  return new ort.Tensor('float32', float32Data, [1, 3, targetHeight, targetWidth])
}

function decodeRecognition(output) {
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

// Note: mergeTextRegions is now imported from '../utils/ocr-core.js'

// ============================================================================
// Tesseract.js Fallback (Lazy Initialized)
// ============================================================================

/**
 * Initialize Tesseract worker (lazy, only when needed)
 * Uses English + Traditional Chinese
 */
async function initializeTesseract() {
  if (tesseractWorker) return tesseractWorker
  if (tesseractInitPromise) return tesseractInitPromise

  tesseractInitPromise = (async () => {
    reportProgress('tesseract', 0, 'Loading Tesseract fallback...')

    // Temporarily suppress console.warn during Tesseract initialization
    // These warnings come from WASM layer (stderr) and cannot be filtered via errorHandler
    // e.g., "Parameter not found: language_model_ngram_on"
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

    reportProgress('tesseract', 100, 'Tesseract ready')
    return tesseractWorker
  })()

  return tesseractInitPromise
}

/**
 * Recognize a single region with Tesseract
 * @param {ImageBitmap} bitmap - Source image
 * @param {Object} region - Region with bounds
 * @returns {Promise<{text: string, confidence: number} | null>}
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
  } catch (error) {
    console.warn('Tesseract recognition failed:', error)
    return null
  }
}

/**
 * Process failed regions with Tesseract fallback
 * @param {ImageBitmap} bitmap - Source image
 * @param {Array} rawResults - All OCR results including failed ones
 * @param {string} requestId - Request ID for progress reporting
 * @returns {Promise<Array>} - Updated results with Tesseract fallback applied
 */
async function applyTesseractFallback(bitmap, rawResults, requestId) {
  const failedRegions = rawResults.filter((r) => r.recognitionFailed)

  if (failedRegions.length === 0) {
    return rawResults
  }

  reportProgress(
    'tesseract',
    0,
    `Trying Tesseract fallback for ${failedRegions.length} region(s)...`,
    requestId
  )

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

    const progress = Math.round(((i + 1) / failedRegions.length) * 100)
    reportProgress('tesseract', progress, `Tesseract: ${i + 1}/${failedRegions.length}`, requestId)
  }

  if (recoveredCount > 0) {
    reportProgress(
      'tesseract',
      100,
      `Tesseract recovered ${recoveredCount}/${failedRegions.length} region(s)`,
      requestId
    )
  } else {
    reportProgress('tesseract', 100, `Tesseract could not recover any regions`, requestId)
  }

  return rawResults
}

// ============================================================================
// Main OCR Functions
// ============================================================================ 

async function initialize() {
  if (isInitialized) {
    self.postMessage({ type: 'ready' })
    return
  }

  try {
    const models = await loadAllModels()

    reportProgress('model', 92, '初始化偵測引擎...')
    const sessionOptions = {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    }

    detSession = await ort.InferenceSession.create(models.detection, sessionOptions)
    reportProgress('model', 96, '初始化辨識引擎...')

    recSession = await ort.InferenceSession.create(models.recognition, sessionOptions)
    reportProgress('model', 99, '解析字典...')

    // Parse dictionary
    dictionary = models.dictionary.split(/\r?\n/)
    if (dictionary.length > 0 && dictionary[dictionary.length - 1] === '') {
      dictionary.pop()
    }
    dictionary.unshift('blank')

    isInitialized = true
    reportProgress('model', 100, 'OCR 引擎就緒')
    self.postMessage({ type: 'ready' })
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message })
    throw error
  }
}

async function recognize(imageDataUrl, requestId) {
  if (!isInitialized) {
    await initialize()
  }

  reportProgress('detection', 0, 'Loading image...', requestId)
  const bitmap = await loadImage(imageDataUrl)

  reportProgress('detection', 10, 'Detecting text regions...', requestId)
  const { tensor: detTensor, width, height, originalWidth, originalHeight, scaleX, scaleY } = preprocessForDetection(bitmap)

  const detFeeds = { [detSession.inputNames[0]]: detTensor }
  const detResults = await detSession.run(detFeeds)
  const detOutput = detResults[detSession.outputNames[0]]

  reportProgress('detection', 40, 'Processing detection results...', requestId)
  const detectedBoxes = postProcessDetection(detOutput, width, height, scaleX, scaleY, originalWidth, originalHeight)

  if (detectedBoxes.length === 0) {
    return { regions: [], rawRegions: [] }
  }

  reportProgress('recognition', 50, `Recognizing ${detectedBoxes.length} text regions...`, requestId)

  const rawResults = []
  for (let i = 0; i < detectedBoxes.length; i++) {
    const { box, score: detectionScore } = detectedBoxes[i]

    const recTensor = preprocessForRecognition(bitmap, box)

    // Calculate bounds regardless of recognition result
    const xs = box.map((p) => p[0])
    const ys = box.map((p) => p[1])
    const bounds = {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    }

    // If preprocessing failed, still record the detection
    if (!recTensor) {
      rawResults.push({
        text: '',
        confidence: 0,
        bounds,
        polygon: box,
        detectionScore,
        recognitionFailed: true,
        failureReason: 'preprocessing_failed',
      })
      continue
    }

    const recFeeds = { [recSession.inputNames[0]]: recTensor }
    const recResults = await recSession.run(recFeeds)
    const recOutput = recResults[recSession.outputNames[0]]

    const { text, confidence } = decodeRecognition(recOutput)
    const trimmedText = text.trim()

    // Always push the result, marking recognition status
    rawResults.push({
      text: trimmedText,
      confidence,
      bounds,
      polygon: box,
      detectionScore,
      recognitionFailed: !trimmedText,
      failureReason: !trimmedText ? 'empty_text' : null,
    })

    const recognitionProgress = 50 + Math.round((i / detectedBoxes.length) * 40)
    reportProgress('recognition', recognitionProgress, `Recognizing ${i + 1}/${detectedBoxes.length}...`, requestId)
  }

  // Apply Tesseract fallback for failed recognitions
  await applyTesseractFallback(bitmap, rawResults, requestId)

  reportProgress('merge', 95, 'Analyzing layout...', requestId)
  const mergedResults = mergeTextRegions(rawResults)

  reportProgress('merge', 100, `Found ${mergedResults.length} text blocks`, requestId)

  return {
    regions: mergedResults,
    rawRegions: rawResults
  }
}

// ============================================================================ 
// Message Handler
// ============================================================================ 

self.onmessage = async (e) => {
  const { type, requestId, image } = e.data

  try {
    switch (type) {
      case 'init':
        await initialize()
        break

      case 'recognize': {
        const result = await recognize(image, requestId)
        self.postMessage({ type: 'result', requestId, ...result })
        break
      }

      case 'terminate':
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
        self.close()
        break

      default:
        console.warn('Unknown message type:', type)
    }
  } catch (error) {
    self.postMessage({ type: 'error', requestId, message: error.message })
  }
}