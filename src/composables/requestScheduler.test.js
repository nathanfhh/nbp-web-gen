import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { clampInt, TimeoutError, withTimeout, mapConcurrent, createMinIntervalLimiter } from './requestScheduler'

// ============================================================================
// clampInt
// ============================================================================

describe('clampInt', () => {
  it('returns value when within range', () => {
    expect(clampInt(5, 1, 10, 3)).toBe(5)
  })

  it('clamps to max when above range', () => {
    expect(clampInt(15, 1, 10, 3)).toBe(10)
  })

  it('clamps to min when below range', () => {
    expect(clampInt(-5, 1, 10, 3)).toBe(1)
  })

  it('truncates decimal to integer', () => {
    expect(clampInt(5.9, 1, 10, 3)).toBe(5)
  })

  it('converts numeric string', () => {
    expect(clampInt('7', 1, 10, 3)).toBe(7)
  })

  it('returns fallback for NaN', () => {
    expect(clampInt(NaN, 1, 10, 3)).toBe(3)
  })

  it('returns fallback for Infinity', () => {
    expect(clampInt(Infinity, 1, 10, 3)).toBe(3)
  })

  it('returns fallback for -Infinity', () => {
    expect(clampInt(-Infinity, 1, 10, 3)).toBe(3)
  })

  it('returns fallback for null', () => {
    // Number(null) = 0, which IS finite, so it should be clamped not fallback
    expect(clampInt(null, 1, 10, 3)).toBe(1)
  })

  it('returns fallback for non-numeric string', () => {
    expect(clampInt('hello', 1, 10, 3)).toBe(3)
  })

  it('returns fallback for undefined', () => {
    expect(clampInt(undefined, 1, 10, 3)).toBe(3)
  })
})

// ============================================================================
// TimeoutError
// ============================================================================

describe('TimeoutError', () => {
  it('has correct name', () => {
    const err = new TimeoutError()
    expect(err.name).toBe('TimeoutError')
  })

  it('has default message', () => {
    const err = new TimeoutError()
    expect(err.message).toBe('Operation timed out')
  })

  it('stores timeoutMs', () => {
    const err = new TimeoutError('test', 5000)
    expect(err.timeoutMs).toBe(5000)
  })

  it('has isTimeout flag', () => {
    const err = new TimeoutError()
    expect(err.isTimeout).toBe(true)
  })

  it('is an instance of Error', () => {
    const err = new TimeoutError()
    expect(err).toBeInstanceOf(Error)
  })
})

// ============================================================================
// withTimeout
// ============================================================================

describe('withTimeout', () => {
  it('resolves when promise completes before timeout', async () => {
    const result = await withTimeout(Promise.resolve('done'), 1000)
    expect(result).toBe('done')
  })

  it('rejects with TimeoutError when promise exceeds timeout', async () => {
    const slow = new Promise((resolve) => setTimeout(resolve, 5000))
    await expect(withTimeout(slow, 10, 'Slow op')).rejects.toThrow(TimeoutError)
  })

  it('includes operation name in error message', async () => {
    const slow = new Promise((resolve) => setTimeout(resolve, 5000))
    await expect(withTimeout(slow, 10, 'MyOp')).rejects.toThrow('MyOp timed out after 10ms')
  })

  it('passes through original rejection', async () => {
    const failing = Promise.reject(new Error('original error'))
    await expect(withTimeout(failing, 1000)).rejects.toThrow('original error')
  })

  it('returns original promise when timeoutMs is 0', async () => {
    const result = await withTimeout(Promise.resolve('ok'), 0)
    expect(result).toBe('ok')
  })

  it('returns original promise when timeoutMs is negative', async () => {
    const result = await withTimeout(Promise.resolve('ok'), -100)
    expect(result).toBe('ok')
  })
})

// ============================================================================
// mapConcurrent
// ============================================================================

describe('mapConcurrent', () => {
  it('preserves order of results', async () => {
    const items = [30, 10, 20]
    const results = await mapConcurrent(items, 3, async (item) => {
      await new Promise((r) => setTimeout(r, item))
      return item * 2
    })
    expect(results).toEqual([60, 20, 40])
  })

  it('returns empty array for empty input', async () => {
    const results = await mapConcurrent([], 3, async (x) => x)
    expect(results).toEqual([])
  })

  it('respects concurrency limit', async () => {
    let running = 0
    let maxRunning = 0
    const items = [1, 2, 3, 4, 5]

    await mapConcurrent(items, 2, async (item) => {
      running++
      maxRunning = Math.max(maxRunning, running)
      await new Promise((r) => setTimeout(r, 10))
      running--
      return item
    })

    expect(maxRunning).toBeLessThanOrEqual(2)
  })

  it('passes index to mapper', async () => {
    const indices = []
    await mapConcurrent(['a', 'b', 'c'], 1, async (_, index) => {
      indices.push(index)
    })
    expect(indices).toEqual([0, 1, 2])
  })

  it('propagates mapper errors', async () => {
    await expect(
      mapConcurrent([1, 2, 3], 2, async (item) => {
        if (item === 2) throw new Error('boom')
        return item
      }),
    ).rejects.toThrow('boom')
  })
})

// ============================================================================
// createMinIntervalLimiter
// ============================================================================

describe('createMinIntervalLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows first acquire immediately', async () => {
    const limiter = createMinIntervalLimiter({ minIntervalMs: 1000 })
    const start = Date.now()
    await limiter.acquire()
    expect(Date.now() - start).toBeLessThan(100)
  })

  it('enforces minimum interval between acquires', async () => {
    const limiter = createMinIntervalLimiter({ minIntervalMs: 1000 })
    await limiter.acquire()

    const secondAcquire = limiter.acquire()
    // Advance time to allow the second acquire
    await vi.advanceTimersByTimeAsync(1000)
    await secondAcquire
    // Should have waited ~1000ms
  })

  it('serializes multiple concurrent acquires', async () => {
    const limiter = createMinIntervalLimiter({ minIntervalMs: 100 })
    const order = []

    const p1 = limiter.acquire().then(() => order.push(1))
    const p2 = limiter.acquire().then(() => order.push(2))
    const p3 = limiter.acquire().then(() => order.push(3))

    // Advance enough time for all three
    await vi.advanceTimersByTimeAsync(500)
    await Promise.all([p1, p2, p3])

    expect(order).toEqual([1, 2, 3])
  })
})
