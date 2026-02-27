/**
 * Time formatting utilities for generation timing display
 */

/**
 * Format elapsed milliseconds to human-readable string
 * @param {number} ms - Elapsed time in milliseconds
 * @returns {string} Formatted time string (e.g., "5.2s" or "2m 30s")
 */
export function formatElapsed(ms) {
  if (!ms || ms < 0) return '0.0s'
  const seconds = ms / 1000
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`
  }
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds.toFixed(0)}s`
}
