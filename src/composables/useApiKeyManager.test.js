import { describe, it, expect } from 'vitest'
import { isQuotaError, normalizeKeyArg } from './useApiKeyManager'

describe('isQuotaError', () => {
  it('detects HTTP 429 via status property', () => {
    expect(isQuotaError({ status: 429 })).toBe(true)
  })

  it('detects HTTP 429 via code property', () => {
    expect(isQuotaError({ code: 429 })).toBe(true)
  })

  it('detects "quota" in message', () => {
    expect(isQuotaError({ message: 'Quota exceeded for this project' })).toBe(true)
  })

  it('detects "rate limit" in message', () => {
    expect(isQuotaError({ message: 'Rate limit exceeded' })).toBe(true)
  })

  it('detects "exhausted" in message', () => {
    expect(isQuotaError({ message: 'Free tier quota exhausted' })).toBe(true)
  })

  it('detects "exceeded" in message', () => {
    expect(isQuotaError({ message: 'API usage exceeded' })).toBe(true)
  })

  it('detects "too many requests" in message', () => {
    expect(isQuotaError({ message: 'Too many requests' })).toBe(true)
  })

  it('checks nested error.error.message', () => {
    expect(isQuotaError({ error: { message: 'Quota exceeded' } })).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isQuotaError({ message: 'QUOTA EXCEEDED' })).toBe(true)
  })

  it('returns false for non-quota errors', () => {
    expect(isQuotaError({ status: 500, message: 'Internal server error' })).toBe(false)
  })

  it('returns false for null/undefined', () => {
    expect(isQuotaError(null)).toBe(false)
    expect(isQuotaError(undefined)).toBe(false)
  })

  it('returns false for empty error object', () => {
    expect(isQuotaError({})).toBe(false)
  })
})

describe('normalizeKeyArg', () => {
  it('string "image" maps to Gemini image usage', () => {
    expect(normalizeKeyArg('image')).toEqual({ provider: 'gemini', usage: 'image' })
  })

  it('string "text" maps to Gemini text usage', () => {
    expect(normalizeKeyArg('text')).toEqual({ provider: 'gemini', usage: 'text' })
  })

  it('object with provider defaults usage to image', () => {
    expect(normalizeKeyArg({ provider: 'openai' })).toEqual({ provider: 'openai', usage: 'image' })
  })

  it('object preserves provider + usage', () => {
    expect(normalizeKeyArg({ provider: 'openai', usage: 'text' })).toEqual({
      provider: 'openai',
      usage: 'text',
    })
  })

  it('object without provider defaults to gemini', () => {
    expect(normalizeKeyArg({ usage: 'text' })).toEqual({ provider: 'gemini', usage: 'text' })
  })

  it('undefined / missing arg defaults to Gemini image', () => {
    expect(normalizeKeyArg()).toEqual({ provider: 'gemini', usage: 'image' })
    expect(normalizeKeyArg(undefined)).toEqual({ provider: 'gemini', usage: 'image' })
    expect(normalizeKeyArg(null)).toEqual({ provider: 'gemini', usage: 'image' })
  })
})
