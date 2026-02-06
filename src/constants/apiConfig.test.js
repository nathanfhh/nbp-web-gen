import { describe, it, expect } from 'vitest'
import {
  IMAGE_RPM,
  IMAGE_MIN_START_INTERVAL_MS,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_ANALYSIS_TIMEOUT_MS,
  RETRY_LIMITS,
  CONCURRENCY_LIMITS,
  TTS_RPM,
  TTS_MIN_START_INTERVAL_MS,
  TTS_CONCURRENCY_LIMITS,
  ERROR_CATEGORY,
  PERMANENT_ERROR_CODES,
  RETRIABLE_ERROR_CODES,
  PERMANENT_ERROR_PATTERNS,
  RETRIABLE_ERROR_PATTERNS,
} from './apiConfig'

describe('Rate limiting constants', () => {
  it('IMAGE_MIN_START_INTERVAL_MS = ceil(60000 / IMAGE_RPM)', () => {
    expect(IMAGE_MIN_START_INTERVAL_MS).toBe(Math.ceil(60_000 / IMAGE_RPM))
  })

  it('TTS_MIN_START_INTERVAL_MS = ceil(60000 / TTS_RPM)', () => {
    expect(TTS_MIN_START_INTERVAL_MS).toBe(Math.ceil(60_000 / TTS_RPM))
  })
})

describe('DEFAULT_RETRY_CONFIG', () => {
  it('has all required fields within valid ranges', () => {
    expect(DEFAULT_RETRY_CONFIG.maxAttempts).toBeGreaterThanOrEqual(RETRY_LIMITS.maxAttempts.min)
    expect(DEFAULT_RETRY_CONFIG.maxAttempts).toBeLessThanOrEqual(RETRY_LIMITS.maxAttempts.max)
    expect(DEFAULT_RETRY_CONFIG.backoffBaseMs).toBeGreaterThanOrEqual(RETRY_LIMITS.backoffBaseMs.min)
    expect(DEFAULT_RETRY_CONFIG.backoffMaxMs).toBeGreaterThanOrEqual(RETRY_LIMITS.backoffMaxMs.min)
    expect(DEFAULT_RETRY_CONFIG.backoffJitterMs).toBeGreaterThanOrEqual(RETRY_LIMITS.backoffJitterMs.min)
  })

  it('backoffMaxMs is greater than backoffBaseMs', () => {
    expect(DEFAULT_RETRY_CONFIG.backoffMaxMs).toBeGreaterThan(DEFAULT_RETRY_CONFIG.backoffBaseMs)
  })
})

describe('Timeout constants', () => {
  it('request timeout is positive', () => {
    expect(DEFAULT_REQUEST_TIMEOUT_MS).toBeGreaterThan(0)
  })

  it('analysis timeout is positive', () => {
    expect(DEFAULT_ANALYSIS_TIMEOUT_MS).toBeGreaterThan(0)
  })
})

describe('Concurrency limits', () => {
  it('default is within min/max range', () => {
    expect(CONCURRENCY_LIMITS.default).toBeGreaterThanOrEqual(CONCURRENCY_LIMITS.min)
    expect(CONCURRENCY_LIMITS.default).toBeLessThanOrEqual(CONCURRENCY_LIMITS.max)
  })

  it('TTS default is within TTS min/max range', () => {
    expect(TTS_CONCURRENCY_LIMITS.default).toBeGreaterThanOrEqual(TTS_CONCURRENCY_LIMITS.min)
    expect(TTS_CONCURRENCY_LIMITS.default).toBeLessThanOrEqual(TTS_CONCURRENCY_LIMITS.max)
  })
})

describe('Error classification', () => {
  it('ERROR_CATEGORY has three categories', () => {
    expect(ERROR_CATEGORY.RETRIABLE).toBe('retriable')
    expect(ERROR_CATEGORY.PERMANENT).toBe('permanent')
    expect(ERROR_CATEGORY.UNKNOWN).toBe('unknown')
  })

  it('permanent and retriable codes do not overlap', () => {
    const overlap = PERMANENT_ERROR_CODES.filter((code) => RETRIABLE_ERROR_CODES.includes(code))
    expect(overlap).toEqual([])
  })

  it('permanent error patterns are lowercase', () => {
    PERMANENT_ERROR_PATTERNS.forEach((pattern) => {
      expect(pattern).toBe(pattern.toLowerCase())
    })
  })

  it('retriable error patterns are lowercase', () => {
    RETRIABLE_ERROR_PATTERNS.forEach((pattern) => {
      expect(pattern).toBe(pattern.toLowerCase())
    })
  })

  it('permanent and retriable patterns do not overlap', () => {
    const overlap = PERMANENT_ERROR_PATTERNS.filter((p) => RETRIABLE_ERROR_PATTERNS.includes(p))
    expect(overlap).toEqual([])
  })
})
