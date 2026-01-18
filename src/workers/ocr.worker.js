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

// Shared OCR utilities from ocr-core.js
import {
  mergeTextRegions,
  getMinTesseractConfidence,
  cropRegionToDataUrl,
  loadImage,
  preprocessForDetection,
  postProcessDetection,
  preprocessForRecognition,
  decodeRecognition,
} from '../utils/ocr-core.js'

// OCR default settings
import { OCR_DEFAULTS } from '../constants/ocrDefaults.js'

// Configure ONNX Runtime WASM paths (must be set before any session creation)
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/'

// ============================================================================
// Model Configuration
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

// OCR settings (updated via postMessage from main thread)
let ocrSettings = { ...OCR_DEFAULTS }

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
// OPFS Model Cache
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

  if (await modelExists(model.filename)) {
    reportProgress('model', 0, statusMessage)
    return { data: await readModel(model.filename), fromCache: true }
  }

  const data = await downloadModel(model.url, model.filename, model.size)
  await writeModel(model.filename, data)
  return { data, fromCache: false }
}

async function loadAllModels() {
  const detCached = await modelExists(MODELS.detection.filename)
  const recCached = await modelExists(MODELS.recognition.filename)
  const dictCached = await modelExists(MODELS.dictionary.filename)
  const allCached = detCached && recCached && dictCached
  const modelsToDownload = [!detCached, !recCached].filter(Boolean).length

  if (allCached) {
    reportProgress('model', 0, 'ocr:loadingModelsFromCache')
  } else if (modelsToDownload > 0) {
    reportProgress('model', 0, `ocr:downloadingModels:${modelsToDownload}`)
  }

  const detStatus = detCached ? 'ocr:loadingDetModel' : 'ocr:downloadingDetModel:1:2'
  const { data: detection } = await getModel('detection', detStatus)
  reportProgress('model', 33, 'ocr:loadingDetModel')

  const recStatus = recCached ? 'ocr:loadingRecModel' : `ocr:downloadingRecModel:${detCached ? '1' : '2'}:2`
  const { data: recognition } = await getModel('recognition', recStatus)
  reportProgress('model', 66, 'ocr:loadingRecModel')

  const { data: dictText } = await getModel('dictionary', 'ocr:loadingDict')
  reportProgress('model', 90, 'ocr:loadingDict')

  return { detection, recognition, dictionary: dictText }
}

// ============================================================================
// Tesseract.js Fallback (Lazy Initialized)
// ============================================================================

async function initializeTesseract() {
  if (tesseractWorker) return tesseractWorker
  if (tesseractInitPromise) return tesseractInitPromise

  tesseractInitPromise = (async () => {
    reportProgress('tesseract', 0, 'Loading Tesseract fallback...')

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

async function applyTesseractFallback(bitmap, rawResults, requestId) {
  const failedRegions = rawResults.filter((r) => r.recognitionFailed)

  if (failedRegions.length === 0) {
    return rawResults
  }

  reportProgress('tesseract', 0, `Trying Tesseract fallback for ${failedRegions.length} region(s)...`, requestId)

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
    reportProgress('tesseract', 100, `Tesseract recovered ${recoveredCount}/${failedRegions.length} region(s)`, requestId)
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
  // Use shared preprocessForDetection with settings and TensorClass
  const { tensor: detTensor, width, height, originalWidth, originalHeight, scaleX, scaleY } = preprocessForDetection(
    bitmap,
    ocrSettings,
    ort.Tensor
  )

  const detFeeds = { [detSession.inputNames[0]]: detTensor }
  const detResults = await detSession.run(detFeeds)
  const detOutput = detResults[detSession.outputNames[0]]

  reportProgress('detection', 40, 'Processing detection results...', requestId)
  // Use shared postProcessDetection with settings
  const detectedBoxes = postProcessDetection(detOutput, ocrSettings, width, height, scaleX, scaleY, originalWidth, originalHeight)

  if (detectedBoxes.length === 0) {
    return { regions: [], rawRegions: [] }
  }

  reportProgress('recognition', 50, `Recognizing ${detectedBoxes.length} text regions...`, requestId)

  const rawResults = []
  for (let i = 0; i < detectedBoxes.length; i++) {
    const { box, score: detectionScore } = detectedBoxes[i]

    // Use shared preprocessForRecognition with TensorClass
    const recTensor = preprocessForRecognition(bitmap, box, ort.Tensor)

    // Calculate bounds regardless of recognition result
    const xs = box.map((p) => p[0])
    const ys = box.map((p) => p[1])
    const bounds = {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    }

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

    // Use shared decodeRecognition with dictionary
    const { text, confidence } = decodeRecognition(recOutput, dictionary)
    const rawText = text.replace(/\u3000/g, ' ').replace(/\u00A0/g, ' ')

    rawResults.push({
      text: rawText,
      confidence,
      bounds,
      polygon: box,
      detectionScore,
      recognitionFailed: !rawText.trim(),
      failureReason: !rawText.trim() ? 'empty_text' : null,
    })

    const recognitionProgress = 50 + Math.round((i / detectedBoxes.length) * 40)
    reportProgress('recognition', recognitionProgress, `Recognizing ${i + 1}/${detectedBoxes.length}...`, requestId)
  }

  await applyTesseractFallback(bitmap, rawResults, requestId)

  reportProgress('merge', 95, 'Analyzing layout...', requestId)
  const mergedResults = mergeTextRegions(rawResults)

  reportProgress('merge', 100, `Found ${mergedResults.length} text blocks`, requestId)

  return {
    regions: mergedResults,
    rawRegions: rawResults,
  }
}

// ============================================================================
// Message Handler
// ============================================================================

self.onmessage = async (e) => {
  const { type, requestId, image, settings } = e.data

  try {
    switch (type) {
      case 'init':
        await initialize()
        break

      case 'updateSettings':
        if (settings) {
          ocrSettings = { ...OCR_DEFAULTS, ...settings }
        }
        self.postMessage({ type: 'settingsUpdated' })
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
