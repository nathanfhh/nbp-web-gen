import { describe, it, expect } from 'vitest'
import {
  getModelConfig,
  validateOcrParam,
  validateModelSize,
  validateOcrSettings,
  OCR_MODELS,
  OCR_MODEL_SIZE,
  OCR_DEFAULTS,
  OCR_PARAM_RULES,
} from './ocrDefaults'

// ============================================================================
// getModelConfig
// ============================================================================

describe('getModelConfig', () => {
  it('returns server model URLs', () => {
    const config = getModelConfig('server')
    expect(config.detection.url).toBe(
      `${OCR_MODELS.HF_BASE}/${OCR_MODELS.server.detection.filename}`,
    )
    expect(config.recognition.url).toBe(
      `${OCR_MODELS.HF_BASE}/${OCR_MODELS.server.recognition.filename}`,
    )
  })

  it('returns mobile model URLs', () => {
    const config = getModelConfig('mobile')
    expect(config.detection.filename).toBe(OCR_MODELS.mobile.detection.filename)
    expect(config.recognition.filename).toBe(OCR_MODELS.mobile.recognition.filename)
  })

  it('includes shared dictionary for both sizes', () => {
    const server = getModelConfig('server')
    const mobile = getModelConfig('mobile')
    expect(server.dictionary.filename).toBe(OCR_MODELS.dictionary.filename)
    expect(mobile.dictionary.filename).toBe(OCR_MODELS.dictionary.filename)
  })

  it('includes file sizes', () => {
    const config = getModelConfig('server')
    expect(config.detection.size).toBe(OCR_MODELS.server.detection.size)
    expect(config.recognition.size).toBe(OCR_MODELS.server.recognition.size)
    expect(config.dictionary.size).toBe(OCR_MODELS.dictionary.size)
  })

  it('falls back to server for unknown model size', () => {
    const config = getModelConfig('unknown')
    expect(config.detection.filename).toBe(OCR_MODELS.server.detection.filename)
  })
})

// ============================================================================
// validateOcrParam
// ============================================================================

describe('validateOcrParam', () => {
  it('returns value unchanged when within range', () => {
    expect(validateOcrParam('maxSideLen', 1600)).toBe(1600)
  })

  it('clamps below minimum', () => {
    expect(validateOcrParam('maxSideLen', 100)).toBe(OCR_PARAM_RULES.maxSideLen.min)
  })

  it('clamps above maximum', () => {
    expect(validateOcrParam('maxSideLen', 9999)).toBe(OCR_PARAM_RULES.maxSideLen.max)
  })

  it('rounds to step for integer params', () => {
    // maxSideLen step=32, so 1601 → round(1601/32)*32 = 50*32 = 1600
    expect(validateOcrParam('maxSideLen', 1601)).toBe(1600)
    // 1617 → round(1617/32)*32 = 51*32 = 1632
    expect(validateOcrParam('maxSideLen', 1617)).toBe(1632)
  })

  it('rounds to step for float params', () => {
    // threshold step=0.05, min=0.1, max=0.9
    expect(validateOcrParam('threshold', 0.32)).toBe(0.3)
    expect(validateOcrParam('threshold', 0.33)).toBe(0.35)
  })

  it('handles float precision correctly', () => {
    // unclipRatio step=0.1, should not produce 1.5000000000000002
    expect(validateOcrParam('unclipRatio', 1.55)).toBe(1.6)
    expect(validateOcrParam('unclipRatio', 1.44)).toBe(1.4)
  })

  it('returns value as-is for unknown param key', () => {
    expect(validateOcrParam('nonExistent', 42)).toBe(42)
  })

  it('handles boundary values exactly on min', () => {
    expect(validateOcrParam('threshold', 0.1)).toBe(0.1)
  })

  it('handles boundary values exactly on max', () => {
    expect(validateOcrParam('threshold', 0.9)).toBe(0.9)
  })
})

// ============================================================================
// validateModelSize
// ============================================================================

describe('validateModelSize', () => {
  it('accepts "server"', () => {
    expect(validateModelSize('server')).toBe('server')
  })

  it('accepts "mobile"', () => {
    expect(validateModelSize('mobile')).toBe('mobile')
  })

  it('returns server as default for invalid value', () => {
    expect(validateModelSize('large')).toBe(OCR_MODEL_SIZE.SERVER)
  })

  it('returns server for undefined', () => {
    expect(validateModelSize(undefined)).toBe(OCR_MODEL_SIZE.SERVER)
  })

  it('returns server for null', () => {
    expect(validateModelSize(null)).toBe(OCR_MODEL_SIZE.SERVER)
  })
})

// ============================================================================
// validateOcrSettings
// ============================================================================

describe('validateOcrSettings', () => {
  it('fills missing values with defaults', () => {
    const result = validateOcrSettings({})
    expect(result).toEqual(OCR_DEFAULTS)
  })

  it('validates numeric params', () => {
    const result = validateOcrSettings({ maxSideLen: 999999, threshold: -1 })
    expect(result.maxSideLen).toBe(OCR_PARAM_RULES.maxSideLen.max)
    expect(result.threshold).toBe(OCR_PARAM_RULES.threshold.min)
  })

  it('validates modelSize as enum', () => {
    const result = validateOcrSettings({ modelSize: 'invalid' })
    expect(result.modelSize).toBe(OCR_MODEL_SIZE.SERVER)
  })

  it('preserves valid modelSize', () => {
    const result = validateOcrSettings({ modelSize: 'mobile' })
    expect(result.modelSize).toBe('mobile')
  })

  it('treats null values as missing (uses defaults)', () => {
    const result = validateOcrSettings({ threshold: null })
    expect(result.threshold).toBe(OCR_DEFAULTS.threshold)
  })

  it('treats undefined values as missing (uses defaults)', () => {
    const result = validateOcrSettings({ threshold: undefined })
    expect(result.threshold).toBe(OCR_DEFAULTS.threshold)
  })

  it('returns all expected keys', () => {
    const result = validateOcrSettings({})
    const expectedKeys = Object.keys(OCR_DEFAULTS)
    expect(Object.keys(result).sort()).toEqual(expectedKeys.sort())
  })
})
