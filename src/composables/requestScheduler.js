/**
 * Request Scheduler Utilities
 *
 * This module provides utilities for managing concurrent API requests with:
 * - Rate limiting (RPM enforcement via minimum intervals)
 * - Concurrency control (parallel execution with order preservation)
 *
 * @module requestScheduler
 */

/**
 * Promise-based sleep function
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>} Resolves after the specified delay
 * @example
 * await sleep(1000) // Wait 1 second
 */
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Safely clamp a value to an integer within [min, max] range
 * Returns fallback if value is not a finite number
 *
 * @param {*} value - Value to clamp (will be converted to number)
 * @param {number} min - Minimum allowed value (inclusive)
 * @param {number} max - Maximum allowed value (inclusive)
 * @param {number} fallback - Value to return if input is not a finite number
 * @returns {number} Clamped integer or fallback
 * @example
 * clampInt(5, 1, 10, 3)      // 5
 * clampInt(15, 1, 10, 3)     // 10
 * clampInt(null, 1, 10, 3)   // 3 (fallback)
 * clampInt('7', 1, 10, 3)    // 7 (string converted)
 */
export const clampInt = (value, min, max, fallback) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(n)))
}

/**
 * Creates a rate limiter that enforces minimum intervals between API request starts.
 * This is a deliberate sleeping mechanism to respect RPM (Requests Per Minute) limits.
 *
 * The limiter uses a Promise chain to serialize acquire() calls, ensuring that
 * even with high concurrency, requests are spaced out by at least `minIntervalMs`.
 *
 * @param {Object} options - Limiter configuration
 * @param {number} options.minIntervalMs - Minimum milliseconds between request starts
 * @returns {{ acquire: () => Promise<void> }} Limiter object with acquire method
 *
 * @example
 * // For 20 RPM limit: 60000ms / 20 = 3000ms between requests
 * const limiter = createMinIntervalLimiter({ minIntervalMs: 3000 })
 *
 * // In concurrent code:
 * await limiter.acquire() // Waits if needed to respect rate limit
 * await makeApiCall()
 *
 * @remarks
 * - This is a single-threaded (per-tab) limiter
 * - Multiple browser tabs will each have their own limiter instance
 * - The limiter is resilient to cancelled/rejected promises in the chain
 */
export const createMinIntervalLimiter = ({ minIntervalMs }) => {
  let nextAllowedStartAt = 0
  let chain = Promise.resolve()

  /**
   * Acquire permission to start a request.
   * Waits if necessary to maintain the minimum interval between requests.
   * @returns {Promise<void>} Resolves when it's safe to start the request
   */
  const acquire = async () => {
    const scheduled = chain.then(async () => {
      const now = Date.now()
      const waitMs = Math.max(0, nextAllowedStartAt - now)
      if (waitMs > 0) {
        await sleep(waitMs)
      }
      const startedAt = Date.now()
      nextAllowedStartAt = Math.max(nextAllowedStartAt, startedAt) + minIntervalMs
    })

    // Keep the chain alive even if an awaiter gets cancelled/rejected upstream.
    chain = scheduled.catch(() => {})
    return scheduled
  }

  return { acquire }
}

/**
 * Custom error class for timeout errors
 * Allows distinguishing timeout errors from other errors for retry logic
 */
export class TimeoutError extends Error {
  constructor(message = 'Operation timed out', timeoutMs = 0) {
    super(message)
    this.name = 'TimeoutError'
    this.timeoutMs = timeoutMs
    this.isTimeout = true
  }
}

/**
 * Wrap an async operation with a timeout
 *
 * If the operation doesn't complete within the specified time, the promise
 * rejects with a TimeoutError. Note that this doesn't actually cancel the
 * underlying operation - it just stops waiting for it.
 *
 * @template T
 * @param {Promise<T>} promise - The promise to wrap
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} [operationName='Operation'] - Name for error message
 * @returns {Promise<T>} Resolves with the original result or rejects with TimeoutError
 *
 * @example
 * try {
 *   const result = await withTimeout(
 *     fetchData(),
 *     5000,
 *     'Data fetch'
 *   )
 * } catch (err) {
 *   if (err instanceof TimeoutError) {
 *     console.log('Request timed out')
 *   }
 * }
 */
export const withTimeout = (promise, timeoutMs, operationName = 'Operation') => {
  if (!timeoutMs || timeoutMs <= 0) {
    return promise
  }

  let timeoutId
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(`${operationName} timed out after ${timeoutMs}ms`, timeoutMs))
    }, timeoutMs)
  })

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId)
  })
}

/**
 * Execute an async mapper function over items with limited concurrency,
 * preserving the original order of results.
 *
 * Similar to `Promise.all(items.map(mapper))` but with concurrency control.
 * Results array will have the same order as the input items array.
 *
 * @template T, R
 * @param {T[]} items - Array of items to process
 * @param {number} concurrency - Maximum number of concurrent operations (1-10 recommended)
 * @param {(item: T, index: number) => Promise<R>} mapper - Async function to apply to each item
 * @returns {Promise<R[]>} Array of results in the same order as input items
 *
 * @example
 * const urls = ['url1', 'url2', 'url3', 'url4', 'url5']
 * const results = await mapConcurrent(urls, 2, async (url, index) => {
 *   console.log(`Starting ${index}`)
 *   const response = await fetch(url)
 *   return response.json()
 * })
 * // With concurrency=2, at most 2 fetches run simultaneously
 * // results[0] corresponds to urls[0], etc.
 *
 * @remarks
 * - This implementation assumes single-threaded JavaScript execution
 * - The `nextIndex++` operation is safe because JS is single-threaded
 * - If an individual mapper call throws, other workers continue processing
 * - The thrown error will propagate when Promise.all rejects
 */
export const mapConcurrent = async (items, concurrency, mapper) => {
  const results = new Array(items.length)
  let nextIndex = 0

  // Create worker "threads" (actually async functions)
  // Each worker pulls the next available index and processes it
  const workers = new Array(Math.min(concurrency, items.length)).fill(null).map(async () => {
    while (true) {
      // Atomic in single-threaded JS: read and increment
      const index = nextIndex++
      if (index >= items.length) return
      results[index] = await mapper(items[index], index)
    }
  })

  await Promise.all(workers)
  return results
}

