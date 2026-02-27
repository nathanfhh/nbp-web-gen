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
import * as ocrUtils from '@/utils/ocrUtils'

// HuggingFace CDN URLs for PaddleOCR v5 models
// Models are cached in OPFS after first download for fast subsequent loads
const HF_BASE = 'https://huggingface.co/nathanfhh/PaddleOCR-ONNX/resolve/main'
const MODELS = {
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

/**
 * OCR Model Cache Composable
 * @returns {Object} Model cache methods and state
 */
export function useOcrModelCache() {
  const isLoading = ref(false)
  const progress = ref(0)
  const status = ref('')
  const error = ref(null)

  /**
   * Get a model, downloading if not cached
   * @param {'detection'|'recognition'|'dictionary'} modelType
   * @returns {Promise<ArrayBuffer|string>}
   */
  const getModel = async (modelType) => {
    const model = MODELS[modelType]
    if (!model) throw new Error(`Unknown model type: ${modelType}`)

    // Check OPFS cache first
    if (await ocrUtils.modelExists(model.filename)) {
      status.value = `Loading ${model.filename} from cache...`
      return await ocrUtils.readModel(model.filename)
    }

    // Download and cache to OPFS
    status.value = `Downloading ${model.filename}...`
    const data = await ocrUtils.downloadModel(
      model.url,
      model.filename,
      model.size,
      (pct) => {
        status.value = `Downloading ${model.filename}... ${pct}%`
      }
    )

    // Cache remote models to OPFS
    await ocrUtils.writeModel(model.filename, data)
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
      const detExists = await ocrUtils.modelExists(MODELS.detection.filename)
      const recExists = await ocrUtils.modelExists(MODELS.recognition.filename)
      const dictExists = await ocrUtils.modelExists(MODELS.dictionary.filename)

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
    await ocrUtils.clearModelCache()
    status.value = 'Model cache cleared'
  }

  /**
   * Check if all models are cached
   * @returns {Promise<boolean>}
   */
  const isFullyCached = async () => {
    const detExists = await ocrUtils.modelExists(MODELS.detection.filename)
    const recExists = await ocrUtils.modelExists(MODELS.recognition.filename)
    const dictExists = await ocrUtils.modelExists(MODELS.dictionary.filename)
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
    getCacheSize: ocrUtils.getModelCacheSize,
    isFullyCached,
    modelExists: ocrUtils.modelExists,
  }
}

// Export model info for reference
export const OCR_MODELS = MODELS
