/**
 * UUID generation utilities for cross-device unique identification
 */

/**
 * Generate a NBP format UUID
 * Format: nbp-{timestamp_base36}-{random8chars}
 * @returns {string}
 */
export function generateUUID() {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 10)
  return `nbp-${timestamp}-${random}`
}

/**
 * Validate if a string is a valid NBP UUID format
 * @param {string} uuid
 * @returns {boolean}
 */
export function isValidUUID(uuid) {
  if (!uuid || typeof uuid !== 'string') return false
  return /^nbp-[a-z0-9]+-[a-z0-9]+$/.test(uuid)
}
