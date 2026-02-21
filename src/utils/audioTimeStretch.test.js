import { describe, it, expect } from 'vitest'
import { timeStretchPcm } from './audioTimeStretch.js'

// Helper: generate a sine wave
function sineWave(sampleRate, durationSec, freq = 440) {
  const length = sampleRate * durationSec
  const pcm = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    pcm[i] = Math.sin(2 * Math.PI * freq * i / sampleRate)
  }
  return pcm
}

describe('timeStretchPcm', () => {
  it('returns same buffer for speed=1 (passthrough)', async () => {
    const input = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5])
    const result = await timeStretchPcm(input, 1)
    expect(result).toBe(input) // same reference
  })

  it('returns input for null/empty input', async () => {
    expect(await timeStretchPcm(null, 1.5)).toBe(null)
    expect(await timeStretchPcm(new Float32Array(0), 1.5)).toEqual(new Float32Array(0))
  })

  it('produces shorter output for speed=2', async () => {
    const sampleRate = 48000
    const input = sineWave(sampleRate, 1)

    const result = await timeStretchPcm(input, 2, sampleRate)

    // WSOLA flush padding adds a small silence tail (~5%),
    // so output is approximately input/speed but slightly longer.
    const expectedLength = input.length / 2
    expect(result.length).toBeGreaterThan(expectedLength * 0.85)
    expect(result.length).toBeLessThan(expectedLength * 1.15)
  })

  it('produces longer output for speed=0.5', async () => {
    const sampleRate = 48000
    const input = sineWave(sampleRate, 1)

    const result = await timeStretchPcm(input, 0.5, sampleRate)

    const expectedLength = input.length * 2
    expect(result.length).toBeGreaterThan(expectedLength * 0.85)
    expect(result.length).toBeLessThan(expectedLength * 1.15)
  })

  it('output contains no NaN or Infinity values', async () => {
    const input = sineWave(48000, 1)
    const result = await timeStretchPcm(input, 1.5, 48000)

    for (let i = 0; i < result.length; i++) {
      expect(Number.isFinite(result[i])).toBe(true)
    }
  })

  it('works with 1.5x speed', async () => {
    const sampleRate = 48000
    const input = sineWave(sampleRate, 1)

    const result = await timeStretchPcm(input, 1.5, sampleRate)

    const expectedLength = Math.floor(input.length / 1.5)
    expect(result.length).toBeGreaterThan(expectedLength * 0.85)
    expect(result.length).toBeLessThan(expectedLength * 1.15)
  })
})
