import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock useLocalStorage before importing useApi
vi.mock('./useLocalStorage', () => ({
  useLocalStorage: () => ({
    getApiKey: vi.fn(() => 'test-api-key'),
  }),
}))

import { useApi } from './useApi'
import {
  ERROR_CATEGORY,
  PERMANENT_ERROR_CODES,
  RETRIABLE_ERROR_CODES,
} from '@/constants'

// ============================================================================
// classifyError
// ============================================================================

describe('classifyError', () => {
  let classifyError

  beforeEach(() => {
    const api = useApi()
    classifyError = api.classifyError
  })

  // --- Permanent status codes ---

  it('classifies permanent HTTP status codes', () => {
    for (const code of PERMANENT_ERROR_CODES) {
      const result = classifyError({ status: code })
      expect(result.category).toBe(ERROR_CATEGORY.PERMANENT)
      expect(result.isRetriable).toBe(false)
      expect(result.reason).toContain(String(code))
    }
  })

  // --- Retriable status codes ---

  it('classifies retriable HTTP status codes', () => {
    for (const code of RETRIABLE_ERROR_CODES) {
      const result = classifyError({ status: code })
      expect(result.category).toBe(ERROR_CATEGORY.RETRIABLE)
      expect(result.isRetriable).toBe(true)
      expect(result.reason).toContain(String(code))
    }
  })

  // --- Status extraction from nested structures ---

  it('extracts status from err.code', () => {
    const result = classifyError({ code: 400 })
    expect(result.category).toBe(ERROR_CATEGORY.PERMANENT)
  })

  it('extracts status from err.response.status', () => {
    const result = classifyError({ response: { status: 429 } })
    expect(result.category).toBe(ERROR_CATEGORY.RETRIABLE)
  })

  it('extracts status from err.error.status', () => {
    const result = classifyError({ error: { status: 403 } })
    expect(result.category).toBe(ERROR_CATEGORY.PERMANENT)
  })

  // --- Permanent error patterns ---

  it('classifies permanent error patterns in message', () => {
    const result = classifyError({ message: 'Invalid API key provided' })
    expect(result.category).toBe(ERROR_CATEGORY.PERMANENT)
    expect(result.isRetriable).toBe(false)
  })

  it('classifies "prohibited" as permanent', () => {
    const result = classifyError({ message: 'Content is prohibited' })
    expect(result.category).toBe(ERROR_CATEGORY.PERMANENT)
  })

  // --- Retriable error patterns ---

  it('classifies retriable error patterns in message', () => {
    const result = classifyError({ message: 'Service temporarily overloaded' })
    expect(result.category).toBe(ERROR_CATEGORY.RETRIABLE)
    expect(result.isRetriable).toBe(true)
  })

  it('classifies "timeout" as retriable', () => {
    const result = classifyError({ message: 'Request timeout reached' })
    expect(result.category).toBe(ERROR_CATEGORY.RETRIABLE)
  })

  // --- Message extraction from nested structures ---

  it('extracts message from err.error.message', () => {
    const result = classifyError({ error: { message: 'Invalid API key' } })
    expect(result.category).toBe(ERROR_CATEGORY.PERMANENT)
  })

  // --- Quota errors ---

  it('classifies quota errors as retriable', () => {
    const result = classifyError({ message: 'Quota exceeded for this project' })
    expect(result.category).toBe(ERROR_CATEGORY.RETRIABLE)
    expect(result.reason).toBe('quota')
  })

  // --- Status codes take priority over message patterns ---

  it('status code takes priority over message pattern', () => {
    // 400 is permanent, but message says "overloaded" (retriable pattern)
    const result = classifyError({ status: 400, message: 'overloaded' })
    expect(result.category).toBe(ERROR_CATEGORY.PERMANENT)
  })

  // --- Unknown errors ---

  it('classifies unknown errors as retriable by default', () => {
    const result = classifyError({ message: 'Something completely unexpected' })
    expect(result.category).toBe(ERROR_CATEGORY.UNKNOWN)
    expect(result.isRetriable).toBe(true)
    expect(result.reason).toBe('unknown')
  })

  it('handles empty error object', () => {
    const result = classifyError({})
    expect(result.category).toBe(ERROR_CATEGORY.UNKNOWN)
    expect(result.isRetriable).toBe(true)
  })

  // --- Case insensitivity ---

  it('matches patterns case-insensitively', () => {
    const result = classifyError({ message: 'INVALID API KEY' })
    expect(result.category).toBe(ERROR_CATEGORY.PERMANENT)
  })
})
