import { describe, it, expect } from 'vitest'
import { calculateCompressionRatio, formatFileSize } from './useImageCompression'

// ============================================================================
// calculateCompressionRatio
// ============================================================================

describe('calculateCompressionRatio', () => {
  it('returns percentage saved', () => {
    // 1000 → 400 = 60% saved
    expect(calculateCompressionRatio(1000, 400)).toBe('60.0')
  })

  it('returns 0 when sizes are equal', () => {
    expect(calculateCompressionRatio(500, 500)).toBe('0.0')
  })

  it('returns "0" when original is 0 (avoids division by zero)', () => {
    expect(calculateCompressionRatio(0, 100)).toBe('0')
  })

  it('returns negative when compressed is larger', () => {
    // 100 → 200 = -100% (file grew)
    expect(parseFloat(calculateCompressionRatio(100, 200))).toBeLessThan(0)
  })

  it('returns 100 when compressed to zero', () => {
    expect(calculateCompressionRatio(1000, 0)).toBe('100.0')
  })

  it('handles decimal precision', () => {
    // 1000 → 333 = 66.7%
    expect(calculateCompressionRatio(1000, 333)).toBe('66.7')
  })
})

// ============================================================================
// formatFileSize
// ============================================================================

describe('formatFileSize', () => {
  it('formats 0 bytes', () => {
    expect(formatFileSize(0)).toBe('0 B')
  })

  it('formats bytes (< 1024)', () => {
    expect(formatFileSize(512)).toBe('512 B')
  })

  it('formats kilobytes', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB')
    expect(formatFileSize(1536)).toBe('1.5 KB')
  })

  it('formats megabytes', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.00 MB')
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2.50 MB')
  })

  it('KB boundary: 1023 bytes stays as bytes', () => {
    expect(formatFileSize(1023)).toBe('1023 B')
  })

  it('MB boundary: 1048575 stays as KB', () => {
    expect(formatFileSize(1024 * 1024 - 1)).toContain('KB')
  })
})
