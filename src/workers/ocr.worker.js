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
  loadImage,
  preprocessForDetection,
  postProcessDetection,
  preprocessForRecognition,
  decodeRecognition,
  createTesseractFallback,
} from '../utils/ocr-core.js'

// OCR default settings and model configuration
import { OCR_DEFAULTS, getModelConfig } from '../constants/ocrDefaults.js'

// Configure ONNX Runtime WASM paths (must be set before any session creation)
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/'

// ============================================================================
// Model Configuration
// ============================================================================

// Model configuration is now centralized in ocrDefaults.js
// Use getModelConfig(modelSize) to get URLs based on current settings

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

// Tesseract fallback (created via factory from ocr-core.js)
const { applyTesseractFallback, terminateTesseract } = createTesseractFallback(
  Tesseract,
  (value, message) => reportProgress('tesseract', value, message)
)

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

/**
 * Get model from OPFS cache or download
 * @param {string} modelType - 'detection', 'recognition', or 'dictionary'
 * @param {Object} modelConfig - Model configuration from getModelConfig()
 * @param {string} statusMessage - Progress message for loading from cache
 */
async function getModel(modelType, modelConfig, statusMessage) {
  const model = modelConfig[modelType]
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
  // Get model configuration based on current settings
  const modelConfig = getModelConfig(ocrSettings.modelSize)
  console.log(`[ocr.worker] Using ${ocrSettings.modelSize} model`)

  const detCached = await modelExists(modelConfig.detection.filename)
  const recCached = await modelExists(modelConfig.recognition.filename)
  const dictCached = await modelExists(modelConfig.dictionary.filename)
  const allCached = detCached && recCached && dictCached
  const modelsToDownload = [!detCached, !recCached].filter(Boolean).length

  if (allCached) {
    reportProgress('model', 0, 'ocr:loadingModelsFromCache')
  } else if (modelsToDownload > 0) {
    reportProgress('model', 0, `ocr:downloadingModels:${modelsToDownload}`)
  }

  const detStatus = detCached ? 'ocr:loadingDetModel' : 'ocr:downloadingDetModel:1:2'
  const { data: detection } = await getModel('detection', modelConfig, detStatus)
  reportProgress('model', 33, 'ocr:loadingDetModel')

  const recStatus = recCached ? 'ocr:loadingRecModel' : `ocr:downloadingRecModel:${detCached ? '1' : '2'}:2`
  const { data: recognition } = await getModel('recognition', modelConfig, recStatus)
  reportProgress('model', 66, 'ocr:loadingRecModel')

  const { data: dictText } = await getModel('dictionary', modelConfig, 'ocr:loadingDict')
  reportProgress('model', 90, 'ocr:loadingDict')

  return { detection, recognition, dictionary: dictText }
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

  // Track tensors for cleanup - CRITICAL for memory management
  // Each tensor holds GPU/CPU memory that won't be GC'd without explicit dispose()
  let detTensor = null
  let detOutput = null

  try {
    reportProgress('detection', 10, 'Detecting text regions...', requestId)
    // Use shared preprocessForDetection with settings and TensorClass
    const detResult = preprocessForDetection(bitmap, ocrSettings, ort.Tensor)
    detTensor = detResult.tensor
    const { width, height, originalWidth, originalHeight, scaleX, scaleY } = detResult

    const detFeeds = { [detSession.inputNames[0]]: detTensor }
    const detResults = await detSession.run(detFeeds)
    detOutput = detResults[detSession.outputNames[0]]

    reportProgress('detection', 40, 'Processing detection results...', requestId)
    // Use shared postProcessDetection with settings
    const detectedBoxes = postProcessDetection(detOutput, ocrSettings, width, height, scaleX, scaleY, originalWidth, originalHeight)

    // Dispose detection tensors early - no longer needed after postProcessDetection
    if (detTensor) {
      detTensor.dispose()
      detTensor = null
    }
    if (detOutput) {
      detOutput.dispose()
      detOutput = null
    }

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

      let recOutput = null
      try {
        const recFeeds = { [recSession.inputNames[0]]: recTensor }
        const recResults = await recSession.run(recFeeds)
        recOutput = recResults[recSession.outputNames[0]]

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
      } finally {
        // CRITICAL: Dispose recognition tensors immediately after each region
        // This prevents memory accumulation during the recognition loop
        recTensor.dispose()
        if (recOutput) {
          recOutput.dispose()
        }
      }

      const recognitionProgress = 50 + Math.round((i / detectedBoxes.length) * 40)
      reportProgress('recognition', recognitionProgress, `Recognizing ${i + 1}/${detectedBoxes.length}...`, requestId)
    }

    await applyTesseractFallback(bitmap, rawResults)

    reportProgress('merge', 95, 'Analyzing layout...', requestId)
    // Pass layout settings for WYSIWYG support (settings updated via postMessage)
    const mergedResults = mergeTextRegions(rawResults, [], ocrSettings)

    reportProgress('merge', 100, `Found ${mergedResults.length} text blocks`, requestId)

    return {
      regions: mergedResults,
      rawRegions: rawResults,
    }
  } finally {
    // CRITICAL: Release ImageBitmap to free GPU/CPU memory
    // Each uncompressed bitmap can consume 50-100MB for high-res images
    bitmap.close()

    // Dispose any remaining tensors (in case of early return or error)
    if (detTensor) {
      detTensor.dispose()
    }
    if (detOutput) {
      detOutput.dispose()
    }
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
        await terminateTesseract()
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
