import { describe, it, expect } from 'vitest'
import { isQuotaError } from './useApiKeyManager'

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
