/**
 * OCR Default Settings and Validation Rules
 *
 * Contains default values for PaddleOCR parameters and their validation rules.
 * These parameters affect text detection and recognition quality.
 */

/**
 * Default OCR parameters
 * @see docs/layout-analysis-algorithm.md for parameter details
 */
export const OCR_DEFAULTS = {
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
]

/**
 * Parameter categories with display order
 */
export const OCR_CATEGORIES = [
  { key: 'preprocessing', params: ['maxSideLen'] },
  { key: 'detection', params: ['threshold', 'boxThreshold'] },
  { key: 'postprocessing', params: ['unclipRatio', 'dilationH', 'dilationV'] },
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
    } else {
      validated[key] = validateOcrParam(key, value)
    }
  }

  return validated
}
