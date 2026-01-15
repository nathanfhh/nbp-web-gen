// ============================================================================
// Peer Sync Utilities
// Pure utility functions for peer-to-peer synchronization
// ============================================================================

// Emoji pool for pairing verification (visually distinct)
export const EMOJI_POOL = [
  '🐶', '🐱', '🐼', '🦊', '🦁', '🐸', '🐵', '🐰',
  '🌸', '🌻', '🌺', '🍀', '🌈', '⭐', '🌙', '❄️',
  '🍎', '🍊', '🍋', '🍇', '🍓', '🍒', '🥝', '🍑',
  '🚀', '✈️', '🚗', '🚲', '⛵', '🎈', '🎮', '🎸',
]

// Message type prefixes for raw binary mode
export const MSG_TYPE_JSON = 0x4A    // 'J' - JSON control message
export const MSG_TYPE_BINARY = 0x42  // 'B' - Binary data packet (images)
export const MSG_TYPE_CHUNK = 0x43   // 'C' - Chunked data packet (for large files like videos)

// Chunk size for large file transfer (16KB is safe for WebRTC)
export const CHUNK_SIZE = 16 * 1024

/**
 * Encode a JSON object as binary with type prefix
 * @param {object} obj - JSON-serializable object
 * @returns {Uint8Array}
 */
export function encodeJsonMessage(obj) {
  const jsonStr = JSON.stringify(obj)
  const jsonBytes = new TextEncoder().encode(jsonStr)
  const packet = new Uint8Array(1 + jsonBytes.length)
  packet[0] = MSG_TYPE_JSON
  packet.set(jsonBytes, 1)
  return packet
}

/**
 * Decode a binary packet - returns { type: 'json', data } or { type: 'binary', data }
 * @param {ArrayBuffer|Uint8Array} rawData
 * @returns {{ type: 'json' | 'binary', data: object | Uint8Array }}
 */
export function decodeMessage(rawData) {
  const data = rawData instanceof Uint8Array ? rawData : new Uint8Array(rawData)
  const type = data[0]

  if (type === MSG_TYPE_JSON) {
    try {
      const jsonStr = new TextDecoder().decode(data.slice(1))
      return { type: 'json', data: JSON.parse(jsonStr) }
    } catch (e) {
      console.error('Failed to decode JSON message:', e)
      // Return as binary if JSON parse fails
      return { type: 'binary', data: data.slice(1) }
    }
  } else if (type === MSG_TYPE_BINARY) {
    return { type: 'binary', data: data.slice(1) }
  } else {
    // Fallback - try to parse as binary image packet (legacy or unknown)
    return { type: 'binary', data }
  }
}

/**
 * Format bytes to human readable string
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/**
 * Format speed to human readable string
 * @param {number} bytesPerSec
 * @returns {string}
 */
export function formatSpeed(bytesPerSec) {
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`
}

/**
 * Generate 6-char alphanumeric connection code (easy to type)
 * Excludes confusing chars: 0OI1
 * @returns {string}
 */
export function generateConnectionCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

/**
 * Generate 3 emoji fingerprint from peer IDs for pairing verification
 * @param {string} peerId1
 * @param {string} peerId2
 * @returns {string[]}
 */
export function generatePairingEmojis(peerId1, peerId2) {
  // Sort to ensure both sides get same result
  const combined = [peerId1, peerId2].sort().join('')

  // Simple hash
  let hash = 0
  for (let i = 0; i < combined.length; i++) {
    hash = ((hash << 5) - hash) + combined.charCodeAt(i)
    hash = hash & hash
  }

  const emojis = []
  for (let i = 0; i < 3; i++) {
    const index = Math.abs((hash >> (i * 8)) % EMOJI_POOL.length)
    emojis.push(EMOJI_POOL[index])
  }
  return emojis
}

/**
 * Convert blob to base64 data URL string
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Parse binary image packet header
 * Packet format: [4-byte header length][JSON header][image data]
 * @param {Uint8Array} bytes
 * @returns {{ header: object, imageData: Uint8Array }}
 */
export function parseBinaryPacket(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const headerLength = view.getUint32(0, true)
  const headerBytes = bytes.slice(4, 4 + headerLength)
  const header = JSON.parse(new TextDecoder().decode(headerBytes))
  const imageData = bytes.slice(4 + headerLength)
  return { header, imageData }
}

/**
 * Create binary image packet
 * @param {object} header - Header object to serialize
 * @param {Uint8Array} rawData - Image binary data
 * @returns {Uint8Array}
 */
export function createBinaryPacket(header, rawData) {
  const headerStr = JSON.stringify(header)
  const headerBytes = new TextEncoder().encode(headerStr)
  const packet = new Uint8Array(4 + headerBytes.length + rawData.length)
  const view = new DataView(packet.buffer)
  view.setUint32(0, headerBytes.length, true) // little-endian
  packet.set(headerBytes, 4)
  packet.set(rawData, 4 + headerBytes.length)
  return packet
}

/**
 * Create a chunk packet for large file transfer
 * Packet format: [1-byte type][4-byte chunk index][4-byte total chunks][4-byte header len][header JSON][chunk data]
 * @param {object} header - Header object (includes uuid, type, etc.)
 * @param {Uint8Array} chunkData - Chunk binary data
 * @param {number} chunkIndex - Current chunk index (0-based)
 * @param {number} totalChunks - Total number of chunks
 * @returns {Uint8Array}
 */
export function createChunkPacket(header, chunkData, chunkIndex, totalChunks) {
  const headerStr = JSON.stringify(header)
  const headerBytes = new TextEncoder().encode(headerStr)
  // [1 type][4 chunkIndex][4 totalChunks][4 headerLen][header][data]
  const packet = new Uint8Array(1 + 4 + 4 + 4 + headerBytes.length + chunkData.length)
  const view = new DataView(packet.buffer)

  packet[0] = MSG_TYPE_CHUNK
  view.setUint32(1, chunkIndex, true)
  view.setUint32(5, totalChunks, true)
  view.setUint32(9, headerBytes.length, true)
  packet.set(headerBytes, 13)
  packet.set(chunkData, 13 + headerBytes.length)

  return packet
}

/**
 * Parse a chunk packet
 * @param {Uint8Array} bytes - Raw packet data (without MSG_TYPE prefix)
 * @returns {{ header: object, chunkIndex: number, totalChunks: number, chunkData: Uint8Array }}
 */
export function parseChunkPacket(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const chunkIndex = view.getUint32(0, true)
  const totalChunks = view.getUint32(4, true)
  const headerLength = view.getUint32(8, true)
  const headerBytes = bytes.slice(12, 12 + headerLength)
  const header = JSON.parse(new TextDecoder().decode(headerBytes))
  const chunkData = bytes.slice(12 + headerLength)

  return { header, chunkIndex, totalChunks, chunkData }
}
