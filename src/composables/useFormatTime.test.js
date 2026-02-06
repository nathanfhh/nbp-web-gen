import { describe, it, expect } from 'vitest'
import { formatElapsed, useFormatTime } from './useFormatTime'

describe('formatElapsed', () => {
  it('returns "0.0s" for 0', () => {
    expect(formatElapsed(0)).toBe('0.0s')
  })

  it('returns "0.0s" for null', () => {
    expect(formatElapsed(null)).toBe('0.0s')
  })

  it('returns "0.0s" for undefined', () => {
    expect(formatElapsed(undefined)).toBe('0.0s')
  })

  it('returns "0.0s" for negative values', () => {
    expect(formatElapsed(-1000)).toBe('0.0s')
  })

  it('formats milliseconds under 60s correctly', () => {
    expect(formatElapsed(5200)).toBe('5.2s')
    expect(formatElapsed(100)).toBe('0.1s')
    expect(formatElapsed(59999)).toBe('60.0s')
  })

  it('formats exactly 60 seconds', () => {
    expect(formatElapsed(60000)).toBe('1m 0s')
  })

  it('formats minutes and seconds', () => {
    expect(formatElapsed(150000)).toBe('2m 30s')
  })

  it('formats large values', () => {
    expect(formatElapsed(600000)).toBe('10m 0s')
  })
})

describe('useFormatTime', () => {
  it('returns an object with formatElapsed', () => {
    const { formatElapsed: fn } = useFormatTime()
    expect(typeof fn).toBe('function')
    expect(fn(5000)).toBe('5.0s')
  })
})
