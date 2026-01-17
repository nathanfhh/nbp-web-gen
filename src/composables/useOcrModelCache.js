/**
 * OCR Model Cache using OPFS (Origin Private File System)
 *
 * Downloads and caches PaddleOCR v5 ONNX models in OPFS for fast subsequent loads.
 * Models are downloaded from HuggingFace on first use.
 *
 * Directory structure:
 *   /ocr-models/PP-OCRv5_server_det.onnx
 *   /ocr-models/PP-OCRv5_server_rec.onnx
 *   /ocr-models/ppocr_v5_dict.txt
 */

import { ref } from 'vue'

// Use HuggingFace CDN for model downloads
// Models are cached in OPFS after first download for fast subsequent loads
const USE_LOCAL_MODELS = false

// Local model paths (in public folder) - for development fallback
const LOCAL_MODELS = {
  detection: {
    filename: 'PP-OCRv5_server_det_infer.onnx',
    url: '/PP-OCRv5_server_det_infer.onnx',
    size: 88_000_000, // ~88MB
  },
  recognition: {
    filename: 'PP-OCRv5_server_rec_infer.onnx',
    url: '/PP-OCRv5_server_rec_infer.onnx',
    size: 84_000_000, // ~84MB
  },
  dictionary: {
    filename: 'ppocrv5_dict.txt',
    url: '/ppocrv5_dict.txt',
    size: 74_000, // ~74KB
  },
}

// HuggingFace CDN URLs for PaddleOCR v5 models
const HF_BASE = 'https://huggingface.co/nathanfhh/PaddleOCR-ONNX/resolve/main'
const REMOTE_MODELS = {
  detection: {
    filename: 'PP-OCRv5_server_det.onnx',
    url: `${HF_BASE}/PP-OCRv5_server_det.onnx`,
    size: 88_000_000, // ~88MB
  },
  recognition: {
    filename: 'PP-OCRv5_server_rec.onnx',
    url: `${HF_BASE}/PP-OCRv5_server_rec.onnx`,
    size: 84_000_000, // ~84MB
  },
  dictionary: {
    filename: 'ppocrv5_dict.txt',
    url: `${HF_BASE}/ppocrv5_dict.txt`,
    size: 74_000, // ~74KB
  },
}

// Select which models to use
const MODELS = USE_LOCAL_MODELS ? LOCAL_MODELS : REMOTE_MODELS

const OPFS_DIR = 'ocr-models'

/**
 * OCR Model Cache Composable
 * @returns {Object} Model cache methods and state
 */
export function useOcrModelCache() {
  const isLoading = ref(false)
  const progress = ref(0)
  const status = ref('')
  const error = ref(null)

  let rootHandle = null

  /**
   * Initialize OPFS root handle
   */
  const initOPFS = async () => {
    if (rootHandle) return rootHandle

    if (!('storage' in navigator) || !('getDirectory' in navigator.storage)) {
      throw new Error('OPFS is not supported in this browser')
    }

    rootHandle = await navigator.storage.getDirectory()
    return rootHandle
  }

  /**
   * Get or create the OCR models directory
   */
  const getModelsDirectory = async () => {
    const root = await initOPFS()
    return await root.getDirectoryHandle(OPFS_DIR, { create: true })
  }

  /**
   * Check if a model file exists in OPFS
   * @param {string} filename - Model filename
   * @returns {Promise<boolean>}
   */
  const modelExists = async (filename) => {
    try {
      const dir = await getModelsDirectory()
      await dir.getFileHandle(filename, { create: false })
      return true
    } catch {
      return false
    }
  }

  /**
   * Read a model file from OPFS
   * @param {string} filename - Model filename
   * @returns {Promise<ArrayBuffer|string>} File content
   */
  const readModel = async (filename) => {
    const dir = await getModelsDirectory()
    const fileHandle = await dir.getFileHandle(filename, { create: false })
    const file = await fileHandle.getFile()

    // Return text for dictionary, ArrayBuffer for models
    if (filename.endsWith('.txt')) {
      return await file.text()
    }
    return await file.arrayBuffer()
  }

  /**
   * Write a model file to OPFS
   * @param {string} filename - Model filename
   * @param {ArrayBuffer|string} data - File content
   */
  const writeModel = async (filename, data) => {
    const dir = await getModelsDirectory()
    const fileHandle = await dir.getFileHandle(filename, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(data)
    await writable.close()
  }

  /**
   * Download a model file with progress tracking
   * @param {string} url - Model URL
   * @param {string} filename - Filename for cache
   * @param {number} expectedSize - Expected file size for progress calculation
   * @returns {Promise<ArrayBuffer|string>}
   */
  const downloadModel = async (url, filename, expectedSize) => {
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

      // Update progress (weighted by model size)
      const fileProgress = Math.min(100, Math.round((received / total) * 100))
      status.value = `Downloading ${filename}... ${fileProgress}%`
    }

    // Combine chunks
    const data = new Uint8Array(received)
    let offset = 0
    for (const chunk of chunks) {
      data.set(chunk, offset)
      offset += chunk.length
    }

    // Return text for dictionary
    if (filename.endsWith('.txt')) {
      return new TextDecoder().decode(data)
    }
    return data.buffer
  }

  /**
   * Check if URL is local (from public folder)
   * @param {string} url
   * @returns {boolean}
   */
  const isLocalUrl = (url) => {
    return url.startsWith('/') && !url.startsWith('//')
  }

  /**
   * Get a model, downloading if not cached
   * @param {'detection'|'recognition'|'dictionary'} modelType
   * @returns {Promise<ArrayBuffer|string>}
   */
  const getModel = async (modelType) => {
    const model = MODELS[modelType]
    if (!model) throw new Error(`Unknown model type: ${modelType}`)

    // For local models, fetch directly without OPFS caching
    if (isLocalUrl(model.url)) {
      status.value = `Loading ${model.filename}...`
      const data = await downloadModel(model.url, model.filename, model.size)
      return data
    }

    // For remote models, check OPFS cache first
    if (await modelExists(model.filename)) {
      status.value = `Loading ${model.filename} from cache...`
      return await readModel(model.filename)
    }

    // Download and cache to OPFS
    status.value = `Downloading ${model.filename}...`
    const data = await downloadModel(model.url, model.filename, model.size)

    // Cache remote models to OPFS
    await writeModel(model.filename, data)
    status.value = `Cached ${model.filename}`

    return data
  }

  /**
   * Load all OCR models (with progress tracking)
   * @param {function} onProgress - Progress callback (0-100)
   * @returns {Promise<{detection: ArrayBuffer, recognition: ArrayBuffer, dictionary: string}>}
   */
  const loadAllModels = async (onProgress) => {
    isLoading.value = true
    progress.value = 0
    error.value = null

    try {
      // Check what needs to be downloaded
      const detExists = await modelExists(MODELS.detection.filename)
      const recExists = await modelExists(MODELS.recognition.filename)
      const dictExists = await modelExists(MODELS.dictionary.filename)

      const needsDownload = !detExists || !recExists || !dictExists

      if (needsDownload) {
        status.value = 'Downloading OCR models (first time only)...'
      } else {
        status.value = 'Loading OCR models from cache...'
      }

      // Load detection model (~25% of progress)
      progress.value = 0
      onProgress?.(0)
      const detection = await getModel('detection')
      progress.value = 25
      onProgress?.(25)

      // Load recognition model (~65% of progress)
      const recognition = await getModel('recognition')
      progress.value = 90
      onProgress?.(90)

      // Load dictionary (~10% of progress)
      const dictionary = await getModel('dictionary')
      progress.value = 100
      onProgress?.(100)

      status.value = 'Models loaded successfully'
      return { detection, recognition, dictionary }
    } catch (err) {
      error.value = err.message
      status.value = `Failed to load models: ${err.message}`
      throw err
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Clear all cached models
   */
  const clearCache = async () => {
    try {
      const root = await initOPFS()
      await root.removeEntry(OPFS_DIR, { recursive: true })
      status.value = 'Model cache cleared'
    } catch (err) {
      if (err.name !== 'NotFoundError') {
        throw err
      }
    }
  }

  /**
   * Get cache size in bytes
   * @returns {Promise<number>}
   */
  const getCacheSize = async () => {
    try {
      const dir = await getModelsDirectory()
      let totalSize = 0

      for await (const [, handle] of dir.entries()) {
        if (handle.kind === 'file') {
          const file = await handle.getFile()
          totalSize += file.size
        }
      }

      return totalSize
    } catch {
      return 0
    }
  }

  /**
   * Check if all models are cached
   * @returns {Promise<boolean>}
   */
  const isFullyCached = async () => {
    const detExists = await modelExists(MODELS.detection.filename)
    const recExists = await modelExists(MODELS.recognition.filename)
    const dictExists = await modelExists(MODELS.dictionary.filename)
    return detExists && recExists && dictExists
  }

  return {
    // State
    isLoading,
    progress,
    status,
    error,

    // Methods
    loadAllModels,
    getModel,
    clearCache,
    getCacheSize,
    isFullyCached,
    modelExists,
  }
}

// Export model info for reference
export const OCR_MODELS = MODELS
