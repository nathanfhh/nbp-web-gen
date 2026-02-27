/**
 * Binary data utility functions
 *
 * Pure functions for binary-to-string conversion and MIME type detection.
 * Extracted from useHistoryTransfer.js, useOcrMainThread.js, useOcrWorker.js
 * to enable unit testing and DRY reuse.
 */

/**
 * Convert Uint8Array to binary string using chunked String.fromCharCode.
 * Avoids stack overflow from .apply() on large arrays (>~32K elements).
 *
 * @param {Uint8Array} bytes
 * @returns {string} Binary string suitable for btoa()
 */
export function uint8ArrayToBinaryString(bytes) {
  const chunkSize = 8192
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize))
  }
  return binary
}

/**
 * Detect image MIME type from base64 string prefix.
 * Uses magic byte signatures encoded in base64.
 *
 * @param {string} base64String - Raw base64 string (without data URL prefix)
 * @returns {string} MIME type string (defaults to 'image/png')
 */
export function detectMimeFromBase64(base64String) {
  if (base64String.startsWith('/9j/')) return 'image/jpeg'
  if (base64String.startsWith('iVBOR')) return 'image/png'
  if (base64String.startsWith('UklGR')) return 'image/webp'
  if (base64String.startsWith('R0lGOD')) return 'image/gif'
  return 'image/png'
}
