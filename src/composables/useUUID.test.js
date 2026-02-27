import { describe, it, expect } from 'vitest'
import { generateUUID, generateShortId } from './useUUID'

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
