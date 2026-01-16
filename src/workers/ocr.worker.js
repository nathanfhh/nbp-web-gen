/**
 * OCR Web Worker
 * Runs ONNX Runtime + PaddleOCR v5 in background thread to avoid blocking UI
 *
 * Communication Protocol:
 * - Main → Worker: { type: 'init' } | { type: 'recognize', requestId, image } | { type: 'terminate' }
 * - Worker → Main: { type: 'ready' } | { type: 'progress', ... } | { type: 'result', ... } | { type: 'error', ... }
 */

import * as ort from 'onnxruntime-web'

// Configure ONNX Runtime WASM paths (must be set before any session creation)
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
  const maxSideLen = 1280
  let width = bitmap.width
  let height = bitmap.height

  if (Math.max(width, height) > maxSideLen) {
    const scale = maxSideLen / Math.max(width, height)
    width = Math.round(width * scale)
    height = Math.round(height * scale)
  }

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

function dilateMask(mask, width, height, iterations) {
  let current = mask
  let next = new Uint8Array(mask.length)

  for (let iter = 0; iter < iterations; iter++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x
        if (current[idx] === 255) {
          next[idx] = 255
          if (x > 0) next[idx - 1] = 255
          if (x < width - 1) next[idx + 1] = 255
          if (y > 0) next[idx - width] = 255
          if (y < height - 1) next[idx + width] = 255
        }
      }
    }
    const temp = current
    current = next
    next = temp
    if (iter < iterations - 1) {
      next.fill(0)
    }
  }
  return current
}

function postProcessDetection(output, width, height, scaleX, scaleY, originalWidth, originalHeight) {
  let data = output.data
  const outputDims = output.dims
  const threshold = 0.2
  const boxThreshold = 0.5
  const minArea = 10

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

  mask = dilateMask(mask, actualWidth, actualHeight, 2)

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
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
        ]

        for (const [nx, ny] of neighbors) {
          if (nx < 0 || nx >= actualWidth || ny < 0 || ny >= actualHeight) continue
          const nidx = ny * actualWidth + nx
          if (mask[nidx] === 0 || visited.has(nidx)) continue
          visited.add(nidx)
          queue.push([nx, ny])
        }
      }

      if (component.length < minArea) continue

      let minX = Infinity, maxX = -Infinity
      let minY = Infinity, maxY = -Infinity

      for (const [px, py] of component) {
        minX = Math.min(minX, px)
        maxX = Math.max(maxX, px)
        minY = Math.min(minY, py)
        maxY = Math.max(maxY, py)
      }

      const w = maxX - minX + 1
      const h = maxY - minY + 1
      const area = component.length
      const perimeter = 2 * (w + h)
      const unclipRatio = 1.5
      const offset = (area * unclipRatio) / perimeter

      const expandedMinX = Math.max(0, minX - offset)
      const expandedMinY = Math.max(0, minY - offset)
      const expandedMaxX = Math.min(actualWidth - 1, maxX + offset)
      const expandedMaxY = Math.min(actualHeight - 1, maxY + offset)

      let scoreSum = 0
      for (const [px, py] of component) {
        scoreSum += data[py * actualWidth + px]
      }
      const score = scoreSum / component.length

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

// ============================================================================
// Text Region Merging (copied from useOcrWorker.js)
// ============================================================================

function getStandardDeviation(arr) {
  if (arr.length <= 1) return 0
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length
  const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length
  return Math.sqrt(variance)
}

function inferAlignment(lines) {
  if (lines.length <= 1) return 'left'

  const lefts = lines.map((l) => l.bounds.x)
  const centers = lines.map((l) => l.bounds.x + l.bounds.width / 2)
  const rights = lines.map((l) => l.bounds.x + l.bounds.width)

  const leftStd = getStandardDeviation(lefts)
  const centerStd = getStandardDeviation(centers)
  const rightStd = getStandardDeviation(rights)

  if (centerStd < leftStd * 0.8 && centerStd < rightStd * 0.8) return 'center'
  if (rightStd < leftStd * 0.8 && rightStd < centerStd) return 'right'

  return 'left'
}

function mergeTextRegions(rawResults) {
  if (rawResults.length === 0) return []

  const sorted = [...rawResults].sort((a, b) => a.bounds.y - b.bounds.y)
  const groups = []

  for (const line of sorted) {
    let added = false

    for (let i = groups.length - 1; i >= 0; i--) {
      const group = groups[i]
      const lastLine = group.lines[group.lines.length - 1]

      const verticalDist = line.bounds.y - (lastLine.bounds.y + lastLine.bounds.height)
      const avgHeight = (line.bounds.height + lastLine.bounds.height) / 2
      const isCloseVertically = verticalDist < avgHeight * 1.2 && verticalDist > -avgHeight * 0.5

      const heightDiffRatio = Math.abs(line.bounds.height - lastLine.bounds.height) / Math.max(line.bounds.height, lastLine.bounds.height)
      const isSimilarSize = heightDiffRatio < 0.25

      const l1 = lastLine.bounds.x
      const r1 = lastLine.bounds.x + lastLine.bounds.width
      const l2 = line.bounds.x
      const r2 = line.bounds.x + line.bounds.width
      const overlap = Math.max(0, Math.min(r1, r2) - Math.max(l1, l2))
      const minWidth = Math.min(lastLine.bounds.width, line.bounds.width)
      const isHorizontallyAligned = overlap > minWidth * 0.3 ||
        (Math.abs((l1 + r1) / 2 - (l2 + r2) / 2) < minWidth * 0.5)

      if (isCloseVertically && isSimilarSize && isHorizontallyAligned) {
        group.lines.push(line)
        added = true
        break
      }
    }

    if (!added) {
      groups.push({ lines: [line] })
    }
  }

  return groups.map(group => {
    const lines = group.lines

    const minX = Math.min(...lines.map(l => l.bounds.x))
    const minY = Math.min(...lines.map(l => l.bounds.y))
    const maxX = Math.max(...lines.map(l => l.bounds.x + l.bounds.width))
    const maxY = Math.max(...lines.map(l => l.bounds.y + l.bounds.height))

    const text = lines.map(l => l.text).join('\n')
    const confidence = lines.reduce((sum, l) => sum + l.confidence, 0) / lines.length
    const alignment = inferAlignment(lines)

    return {
      text,
      confidence,
      bounds: {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY
      },
      polygon: [
        [minX, minY],
        [maxX, minY],
        [maxX, maxY],
        [minX, maxY]
      ],
      alignment,
      fontSize: lines.reduce((sum, l) => sum + l.bounds.height, 0) / lines.length
    }
  })
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
    const { box } = detectedBoxes[i]

    const recTensor = preprocessForRecognition(bitmap, box)
    if (!recTensor) continue

    const recFeeds = { [recSession.inputNames[0]]: recTensor }
    const recResults = await recSession.run(recFeeds)
    const recOutput = recResults[recSession.outputNames[0]]

    const { text, confidence } = decodeRecognition(recOutput)

    if (text.trim()) {
      const xs = box.map((p) => p[0])
      const ys = box.map((p) => p[1])

      rawResults.push({
        text: text.trim(),
        confidence,
        bounds: {
          x: Math.min(...xs),
          y: Math.min(...ys),
          width: Math.max(...xs) - Math.min(...xs),
          height: Math.max(...ys) - Math.min(...ys),
        },
        polygon: box,
      })
    }

    const recognitionProgress = 50 + Math.round((i / detectedBoxes.length) * 40)
    reportProgress('recognition', recognitionProgress, `Recognizing ${i + 1}/${detectedBoxes.length}...`, requestId)
  }

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
