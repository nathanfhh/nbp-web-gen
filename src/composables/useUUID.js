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
 * Generate a short unique ID (4 characters)
 * Format: 4 alphanumeric characters (lowercase + digits)
 * Ensures uniqueness within a given collection of existing IDs
 * @param {string[]} existingIds - Array of existing IDs to avoid collision
 * @param {number} maxAttempts - Maximum attempts before falling back to longer ID
 * @returns {string}
 */
export function generateShortId(existingIds = [], maxAttempts = 100) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const existingSet = new Set(existingIds)

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let id = ''
    for (let i = 0; i < 4; i++) {
      id += chars[Math.floor(Math.random() * chars.length)]
    }
    if (!existingSet.has(id)) {
      return id
    }
  }

  // Fallback: use 6 characters if 4-char space is exhausted (unlikely for < 1000 pages)
  let id = ''
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)]
  }
  return id
}
