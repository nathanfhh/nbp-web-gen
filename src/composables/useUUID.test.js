import { describe, it, expect } from 'vitest'
import { generateUUID, isValidUUID, generateShortId, isValidShortId } from './useUUID'

// ============================================================================
// generateUUID
// ============================================================================

describe('generateUUID', () => {
  it('produces nbp- prefixed string', () => {
    expect(generateUUID()).toMatch(/^nbp-/)
  })

  it('matches expected format nbp-{base36}-{random}', () => {
    expect(generateUUID()).toMatch(/^nbp-[a-z0-9]+-[a-z0-9]+$/)
  })

  it('generates unique values', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateUUID()))
    expect(ids.size).toBe(100)
  })
})

// ============================================================================
// isValidUUID
// ============================================================================

describe('isValidUUID', () => {
  it('validates correct UUID', () => {
    expect(isValidUUID(generateUUID())).toBe(true)
  })

  it('rejects null', () => {
    expect(isValidUUID(null)).toBe(false)
  })

  it('rejects undefined', () => {
    expect(isValidUUID(undefined)).toBe(false)
  })

  it('rejects number', () => {
    expect(isValidUUID(12345)).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isValidUUID('')).toBe(false)
  })

  it('rejects string without nbp- prefix', () => {
    expect(isValidUUID('abc-123-456')).toBe(false)
  })

  it('rejects malformed format', () => {
    expect(isValidUUID('nbp-')).toBe(false)
    expect(isValidUUID('nbp-abc')).toBe(false)
  })
})

// ============================================================================
// generateShortId
// ============================================================================

describe('generateShortId', () => {
  it('produces 4-char alphanumeric string by default', () => {
    expect(generateShortId()).toMatch(/^[a-z0-9]{4}$/)
  })

  it('avoids collision with existing IDs', () => {
    const existing = ['aaaa', 'bbbb']
    const id = generateShortId(existing)
    expect(existing).not.toContain(id)
  })

  it('falls back to 6-char ID after maxAttempts', () => {
    // Force fallback by filling all 4-char possibilities (mock scenario)
    // Use maxAttempts=0 to immediately trigger fallback
    const id = generateShortId([], 0)
    expect(id).toMatch(/^[a-z0-9]{6}$/)
  })
})

// ============================================================================
// isValidShortId
// ============================================================================

describe('isValidShortId', () => {
  it('validates 4-char ID', () => {
    expect(isValidShortId('ab12')).toBe(true)
  })

  it('validates 5-char ID', () => {
    expect(isValidShortId('ab12c')).toBe(true)
  })

  it('validates 6-char ID', () => {
    expect(isValidShortId('ab12cd')).toBe(true)
  })

  it('rejects 3-char ID', () => {
    expect(isValidShortId('abc')).toBe(false)
  })

  it('rejects 7-char ID', () => {
    expect(isValidShortId('abcdefg')).toBe(false)
  })

  it('rejects uppercase', () => {
    expect(isValidShortId('ABCD')).toBe(false)
  })

  it('rejects null', () => {
    expect(isValidShortId(null)).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isValidShortId('')).toBe(false)
  })
})
