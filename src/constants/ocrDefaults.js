/**
 * OCR Default Settings and Validation Rules
 *
 * Contains default values for PaddleOCR parameters and their validation rules.
 * These parameters affect text detection and recognition quality.
 */

// ============================================================================
// Model Size Configuration
// ============================================================================

/**
 * Model size options
 * - server: High accuracy, requires larger GPU buffer (~172MB total)
 * - mobile: Lightweight, suitable for mobile devices (~21MB total)
 */
export const OCR_MODEL_SIZE = {
  SERVER: 'server',
  MOBILE: 'mobile',
}

/**
 * Model URLs and file information
 * Models hosted at: https://huggingface.co/nathanfhh/PaddleOCR-ONNX
 */
export const OCR_MODELS = {
  HF_BASE: 'https://huggingface.co/nathanfhh/PaddleOCR-ONNX/resolve/main',
  server: {
    detection: { filename: 'PP-OCRv5_server_det.onnx', size: 88_100_000 },
    recognition: { filename: 'PP-OCRv5_server_rec.onnx', size: 84_500_000 },
  },
  mobile: {
    detection: { filename: 'PP-OCRv5_mobile_det.onnx', size: 4_830_000 },
    recognition: { filename: 'PP-OCRv5_mobile_rec.onnx', size: 16_600_000 },
  },
  // Dictionary is shared between server and mobile
  dictionary: { filename: 'ppocrv5_dict.txt', size: 74_000 },
}

/**
 * Get model configuration based on model size setting
 * @param {string} modelSize - 'server' or 'mobile'
 * @returns {Object} Model configuration with URLs and sizes
 */
export function getModelConfig(modelSize) {
  const models = OCR_MODELS[modelSize] || OCR_MODELS.server
  const base = OCR_MODELS.HF_BASE
  return {
    detection: {
      filename: models.detection.filename,
      url: `${base}/${models.detection.filename}`,
      size: models.detection.size,
    },
    recognition: {
      filename: models.recognition.filename,
      url: `${base}/${models.recognition.filename}`,
      size: models.recognition.size,
    },
    dictionary: {
      filename: OCR_MODELS.dictionary.filename,
      url: `${base}/${OCR_MODELS.dictionary.filename}`,
      size: OCR_MODELS.dictionary.size,
    },
  }
}

// ============================================================================
// OCR Parameters
// ============================================================================

/**
 * Default OCR parameters
 * @see docs/layout-analysis-algorithm.md for parameter details
 */
export const OCR_DEFAULTS = {
  // Model size: 'server' (high accuracy) or 'mobile' (lightweight)
  modelSize: OCR_MODEL_SIZE.SERVER,
  // Target max side length for preprocessing
  // Only downscale if image is larger than this value
  // Recommended: 1600 (balance between detail and performance)
  maxSideLen: 1600,

  // DBNet detection threshold (binary threshold for text region detection)
  // Official PP-OCRv5 default: 0.3
  threshold: 0.3,

  // Box filtering threshold (minimum confidence for detected boxes)
  // Official PP-OCRv5 default: 0.6, we use 0.7 for less noise
  boxThreshold: 0.7,

  // DBNet unclip ratio (box expansion factor, text boxes are shrunk during training)
  // Official PP-OCRv5 default: 1.5
  unclipRatio: 1.5,

  // Morphological dilation iterations - horizontal (connects characters in a line)
  dilationH: 2,

  // Morphological dilation iterations - vertical (connects strokes, less aggressive)
  dilationV: 1,

  // === Layout Analysis (Text Block Merging) ===
  // Vertical cut threshold (multiplier of median line height)
  // Used to detect column separators in XY-Cut algorithm
  verticalCutThreshold: 1.5,

  // Horizontal cut threshold (multiplier of median line height)
  // Used to detect paragraph separators in XY-Cut algorithm
  horizontalCutThreshold: 0.3,

  // Same line threshold (multiplier of min line height)
  // Lines with Y-center difference < this * minHeight are considered same line
  sameLineThreshold: 0.7,

  // Font size difference threshold (ratio)
  // Regions with height ratio > this won't be merged (different heading levels)
  fontSizeDiffThreshold: 1.5,

  // Color difference threshold (Euclidean distance in RGB, 0-441.67)
  // Colors with distance > this are considered distinct (preserve highlights)
  colorDiffThreshold: 50,

  // === PPTX Export ===
  // Line height ratio (font size to line height)
  // Used to calculate font size from detected line height
  lineHeightRatio: 1.2,

  // Minimum font size (points) for PPTX text boxes
  minFontSize: 8,

  // Maximum font size (points) for PPTX text boxes
  maxFontSize: 120,
}

/**
 * Validation rules for each parameter
 * Includes min, max, step values and parameter category
 */
export const OCR_PARAM_RULES = {
  maxSideLen: {
    min: 960,
    max: 4096,
    step: 32,
    category: 'preprocessing',
  },
  threshold: {
    min: 0.1,
    max: 0.9,
    step: 0.05,
    category: 'detection',
  },
  boxThreshold: {
    min: 0.1,
    max: 0.9,
    step: 0.05,
    category: 'detection',
  },
  unclipRatio: {
    min: 1.0,
    max: 3.0,
    step: 0.1,
    category: 'postprocessing',
  },
  dilationH: {
    min: 0,
    max: 10,
    step: 1,
    category: 'postprocessing',
  },
  dilationV: {
    min: 0,
    max: 10,
    step: 1,
    category: 'postprocessing',
  },
  // Layout Analysis parameters
  verticalCutThreshold: {
    min: 0.5,
    max: 5.0,
    step: 0.1,
    category: 'layout',
  },
  horizontalCutThreshold: {
    min: 0.1,
    max: 2.0,
    step: 0.05,
    category: 'layout',
  },
  sameLineThreshold: {
    min: 0.3,
    max: 1.5,
    step: 0.05,
    category: 'layout',
  },
  fontSizeDiffThreshold: {
    min: 1.1,
    max: 3.0,
    step: 0.1,
    category: 'layout',
  },
  colorDiffThreshold: {
    min: 10,
    max: 150,
    step: 5,
    category: 'layout',
  },
  // PPTX Export parameters
  lineHeightRatio: {
    min: 1.0,
    max: 2.0,
    step: 0.05,
    category: 'export',
  },
  minFontSize: {
    min: 4,
    max: 24,
    step: 1,
    category: 'export',
  },
  maxFontSize: {
    min: 48,
    max: 200,
    step: 4,
    category: 'export',
  },
}

/**
 * Parameter display order for UI
 */
export const OCR_PARAM_ORDER = [
  'maxSideLen',
  'threshold',
  'boxThreshold',
  'unclipRatio',
  'dilationH',
  'dilationV',
  'verticalCutThreshold',
  'horizontalCutThreshold',
  'sameLineThreshold',
  'fontSizeDiffThreshold',
  'colorDiffThreshold',
  'lineHeightRatio',
  'minFontSize',
  'maxFontSize',
]

/**
 * Parameter categories with display order
 */
export const OCR_CATEGORIES = [
  { key: 'preprocessing', params: ['maxSideLen'] },
  { key: 'detection', params: ['threshold', 'boxThreshold'] },
  { key: 'postprocessing', params: ['unclipRatio', 'dilationH', 'dilationV'] },
  {
    key: 'layout',
    params: [
      'verticalCutThreshold',
      'horizontalCutThreshold',
      'sameLineThreshold',
      'fontSizeDiffThreshold',
      'colorDiffThreshold',
    ],
  },
  {
    key: 'export',
    params: ['lineHeightRatio', 'minFontSize', 'maxFontSize'],
  },
]

/**
 * Validate a single parameter value
 * @param {string} key - Parameter name
 * @param {number} value - Value to validate
 * @returns {number} - Validated and clamped value
 */
export function validateOcrParam(key, value) {
  const rules = OCR_PARAM_RULES[key]
  if (!rules) return value

  // Clamp to min/max
  let validated = Math.max(rules.min, Math.min(rules.max, value))

  // Round to step (for floating point parameters)
  if (rules.step < 1) {
    const decimals = String(rules.step).split('.')[1]?.length || 0
    validated = Math.round(validated / rules.step) * rules.step
    validated = Number(validated.toFixed(decimals))
  } else {
    validated = Math.round(validated / rules.step) * rules.step
  }

  return validated
}

/**
 * Validate model size value
 * @param {string} value - Model size value to validate
 * @returns {string} - Valid model size ('server' or 'mobile')
 */
export function validateModelSize(value) {
  if (value === OCR_MODEL_SIZE.SERVER || value === OCR_MODEL_SIZE.MOBILE) {
    return value
  }
  return OCR_MODEL_SIZE.SERVER // Default to server
}

/**
 * Validate all OCR settings
 * @param {Object} settings - Settings object to validate
 * @returns {Object} - Validated settings with defaults for missing values
 */
export function validateOcrSettings(settings) {
  const validated = {}

  for (const key of Object.keys(OCR_DEFAULTS)) {
    const value = settings[key]
    if (value === undefined || value === null) {
      validated[key] = OCR_DEFAULTS[key]
    } else if (key === 'modelSize') {
      // modelSize is string enum, not numeric
      validated[key] = validateModelSize(value)
    } else {
      validated[key] = validateOcrParam(key, value)
    }
  }

  return validated
}
