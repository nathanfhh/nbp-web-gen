import { describe, it, expect, vi, beforeAll } from 'vitest'

// Mock PptxGenJS (imported at module level but only used in generatePptx)
vi.mock('pptxgenjs', () => ({
  default: vi.fn(),
}))

import { usePptxExport } from './usePptxExport'

// ============================================================================
// detectRatio
// ============================================================================

describe('detectRatio', () => {
  let detectRatio

  beforeAll(() => {
    const pptx = usePptxExport()
    detectRatio = pptx.detectRatio
  })

  it('detects 16:9 ratio (1920x1080)', () => {
    expect(detectRatio(1920, 1080)).toBe('LAYOUT_16x9')
  })

  it('detects 16:9 ratio (1280x720)', () => {
    expect(detectRatio(1280, 720)).toBe('LAYOUT_16x9')
  })

  it('detects 4:3 ratio (1024x768)', () => {
    expect(detectRatio(1024, 768)).toBe('LAYOUT_4x3')
  })

  it('detects 4:3 ratio (1600x1200)', () => {
    expect(detectRatio(1600, 1200)).toBe('LAYOUT_4x3')
  })

  it('detects 9:16 portrait ratio (1080x1920)', () => {
    const result = detectRatio(1080, 1920)
    // Returns custom object for portrait
    expect(result).toEqual({ width: 5.625, height: 10 })
  })

  it('falls back to LAYOUT_WIDE for non-standard ratios', () => {
    // 1:1 square
    expect(detectRatio(1000, 1000)).toBe('LAYOUT_WIDE')
  })

  it('falls back to LAYOUT_WIDE for ultrawide (21:9)', () => {
    expect(detectRatio(2560, 1080)).toBe('LAYOUT_WIDE')
  })

  // Boundary tests for 16:9 range (1.7 - 1.8)
  it('16:9 lower boundary (ratio = 1.7)', () => {
    expect(detectRatio(170, 100)).toBe('LAYOUT_16x9')
  })

  it('16:9 upper boundary (ratio = 1.8)', () => {
    expect(detectRatio(180, 100)).toBe('LAYOUT_16x9')
  })

  it('just below 16:9 range (ratio ≈ 1.69)', () => {
    expect(detectRatio(169, 100)).toBe('LAYOUT_WIDE')
  })

  // Boundary tests for 4:3 range (1.3 - 1.4)
  it('4:3 lower boundary (ratio = 1.3)', () => {
    expect(detectRatio(130, 100)).toBe('LAYOUT_4x3')
  })

  it('just below 4:3 range (ratio ≈ 1.29)', () => {
    expect(detectRatio(129, 100)).toBe('LAYOUT_WIDE')
  })
})
