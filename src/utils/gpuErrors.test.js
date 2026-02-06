import { describe, it, expect } from 'vitest'
import {
  GpuOutOfMemoryError,
  GpuBufferSizeError,
  isGpuBufferSizeError,
  isGpuMemoryError,
} from './gpuErrors'

// ============================================================================
// GpuOutOfMemoryError
// ============================================================================

describe('GpuOutOfMemoryError', () => {
  it('has correct name', () => {
    const err = new GpuOutOfMemoryError('test')
    expect(err.name).toBe('GpuOutOfMemoryError')
  })

  it('includes original message in error message', () => {
    const err = new GpuOutOfMemoryError('VRAM full')
    expect(err.message).toContain('VRAM full')
    expect(err.message).toContain('GPU out of memory')
  })

  it('stores originalMessage property', () => {
    const err = new GpuOutOfMemoryError('original')
    expect(err.originalMessage).toBe('original')
  })

  it('is an instance of Error', () => {
    expect(new GpuOutOfMemoryError('test')).toBeInstanceOf(Error)
  })
})

// ============================================================================
// GpuBufferSizeError
// ============================================================================

describe('GpuBufferSizeError', () => {
  it('has correct name', () => {
    const err = new GpuBufferSizeError('test')
    expect(err.name).toBe('GpuBufferSizeError')
  })

  it('includes original message', () => {
    const err = new GpuBufferSizeError('134MB limit')
    expect(err.message).toContain('134MB limit')
    expect(err.message).toContain('GPU buffer size exceeded')
  })

  it('stores originalMessage property', () => {
    const err = new GpuBufferSizeError('original')
    expect(err.originalMessage).toBe('original')
  })

  it('is an instance of Error', () => {
    expect(new GpuBufferSizeError('test')).toBeInstanceOf(Error)
  })
})

// ============================================================================
// isGpuBufferSizeError
// ============================================================================

describe('isGpuBufferSizeError', () => {
  it('detects "larger than the maximum storage buffer binding size"', () => {
    expect(isGpuBufferSizeError('Value is larger than the maximum storage buffer binding size')).toBe(true)
  })

  it('detects "exceeds the max buffer size"', () => {
    expect(isGpuBufferSizeError('Requested buffer exceeds the max buffer size')).toBe(true)
  })

  it('detects combined "buffer size" and "exceed"', () => {
    expect(isGpuBufferSizeError('Buffer size does exceed limit')).toBe(true)
  })

  it('returns false for unrelated error', () => {
    expect(isGpuBufferSizeError('Something went wrong')).toBe(false)
  })

  it('returns false for null/empty', () => {
    expect(isGpuBufferSizeError(null)).toBe(false)
    expect(isGpuBufferSizeError('')).toBe(false)
    expect(isGpuBufferSizeError(undefined)).toBe(false)
  })
})

// ============================================================================
// isGpuMemoryError
// ============================================================================

describe('isGpuMemoryError', () => {
  it.each([
    'out of memory',
    'allocation failed',
    'device lost',
    'buffer allocation error',
    'memory exhausted',
    'GPU OOM detected',
    'gpu memory insufficient',
    'vram not enough',
    'createBuffer failed',
    'mapAsync error',
    'failed to allocate tensor',
    'gpubufferoffset invalid',
  ])('detects "%s"', (msg) => {
    expect(isGpuMemoryError(msg)).toBe(true)
  })

  it('returns false for unrelated error', () => {
    expect(isGpuMemoryError('Network timeout')).toBe(false)
  })

  it('returns false for null/empty', () => {
    expect(isGpuMemoryError(null)).toBe(false)
    expect(isGpuMemoryError('')).toBe(false)
    expect(isGpuMemoryError(undefined)).toBe(false)
  })

  it('is case-insensitive', () => {
    expect(isGpuMemoryError('OUT OF MEMORY')).toBe(true)
  })
})
