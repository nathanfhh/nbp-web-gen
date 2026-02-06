import { describe, it, expect } from 'vitest'
import { getVideoPricePerSecond, calculateVideoCost, VEO_PRICING } from './videoPricing'

// ============================================================================
// getVideoPricePerSecond
// ============================================================================

describe('getVideoPricePerSecond', () => {
  it('returns audio price for standard 1080p', () => {
    expect(getVideoPricePerSecond('standard', '1080p', true)).toBe(
      VEO_PRICING.standard['1080p'].audio,
    )
  })

  it('returns noAudio price when generateAudio is false', () => {
    expect(getVideoPricePerSecond('standard', '1080p', false)).toBe(
      VEO_PRICING.standard['1080p'].noAudio,
    )
  })

  it('defaults generateAudio to true', () => {
    expect(getVideoPricePerSecond('fast', '720p')).toBe(VEO_PRICING.fast['720p'].audio)
  })

  it('falls back to fast model for unknown model', () => {
    expect(getVideoPricePerSecond('ultra', '720p', true)).toBe(VEO_PRICING.fast['720p'].audio)
  })

  it('falls back to 720p for unknown resolution', () => {
    expect(getVideoPricePerSecond('fast', '8k', true)).toBe(VEO_PRICING.fast['720p'].audio)
  })

  it('returns 4k pricing correctly', () => {
    expect(getVideoPricePerSecond('standard', '4k', true)).toBe(VEO_PRICING.standard['4k'].audio)
  })

  it('returns different prices for fast vs standard', () => {
    const fast = getVideoPricePerSecond('fast', '1080p', true)
    const standard = getVideoPricePerSecond('standard', '1080p', true)
    expect(fast).toBeLessThan(standard)
  })
})

// ============================================================================
// calculateVideoCost
// ============================================================================

describe('calculateVideoCost', () => {
  it('multiplies price per second by duration', () => {
    const pricePerSec = getVideoPricePerSecond('fast', '720p', true)
    expect(calculateVideoCost('fast', '720p', 8, true)).toBe(pricePerSec * 8)
  })

  it('calculates correctly for 4-second video', () => {
    const pricePerSec = getVideoPricePerSecond('standard', '1080p', true)
    expect(calculateVideoCost('standard', '1080p', 4, true)).toBe(pricePerSec * 4)
  })

  it('returns 0 for 0 duration', () => {
    expect(calculateVideoCost('fast', '720p', 0, true)).toBe(0)
  })

  it('defaults generateAudio to true', () => {
    const withAudio = calculateVideoCost('fast', '720p', 8, true)
    const defaultAudio = calculateVideoCost('fast', '720p', 8)
    expect(defaultAudio).toBe(withAudio)
  })

  it('noAudio cost is less than audio cost', () => {
    const withAudio = calculateVideoCost('standard', '4k', 8, true)
    const noAudio = calculateVideoCost('standard', '4k', 8, false)
    expect(noAudio).toBeLessThan(withAudio)
  })
})
