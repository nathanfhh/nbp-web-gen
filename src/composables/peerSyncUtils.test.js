import { describe, it, expect } from 'vitest'
import {
  encodeJsonMessage,
  decodeMessage,
  formatBytes,
  formatSpeed,
  generateConnectionCode,
  generatePairingEmojis,
  blobToBase64,
  createBinaryPacket,
  parseBinaryPacket,
  createChunkPacket,
  parseChunkPacket,
  MSG_TYPE_JSON,
  MSG_TYPE_BINARY,
  MSG_TYPE_CHUNK,
  EMOJI_POOL,
} from './peerSyncUtils'

// ============================================================================
// encode / decode JSON roundtrip
// ============================================================================

describe('encodeJsonMessage / decodeMessage', () => {
  it('roundtrips a JSON object', () => {
    const obj = { type: 'hello', count: 42 }
    const encoded = encodeJsonMessage(obj)
    const decoded = decodeMessage(encoded)
    expect(decoded.type).toBe('json')
    expect(decoded.data).toEqual(obj)
  })

  it('first byte is MSG_TYPE_JSON', () => {
    const encoded = encodeJsonMessage({ x: 1 })
    expect(encoded[0]).toBe(MSG_TYPE_JSON)
  })

  it('handles empty object', () => {
    const encoded = encodeJsonMessage({})
    const decoded = decodeMessage(encoded)
    expect(decoded.data).toEqual({})
  })

  it('handles ArrayBuffer input in decodeMessage', () => {
    const encoded = encodeJsonMessage({ key: 'value' })
    const buffer = encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength)
    const decoded = decodeMessage(buffer)
    expect(decoded.type).toBe('json')
    expect(decoded.data).toEqual({ key: 'value' })
  })
})

// ============================================================================
// decodeMessage binary type
// ============================================================================

describe('decodeMessage binary', () => {
  it('decodes binary packet', () => {
    const payload = new Uint8Array([MSG_TYPE_BINARY, 0x01, 0x02, 0x03])
    const decoded = decodeMessage(payload)
    expect(decoded.type).toBe('binary')
    expect(decoded.data).toEqual(new Uint8Array([0x01, 0x02, 0x03]))
  })

  it('returns binary for unknown type prefix', () => {
    const payload = new Uint8Array([0xff, 0x01])
    const decoded = decodeMessage(payload)
    expect(decoded.type).toBe('binary')
  })

  it('falls back to binary when JSON parse fails', () => {
    // Create a packet with JSON type prefix but invalid JSON body
    const invalidJson = new TextEncoder().encode('{invalid json')
    const packet = new Uint8Array(1 + invalidJson.length)
    packet[0] = MSG_TYPE_JSON
    packet.set(invalidJson, 1)
    const decoded = decodeMessage(packet)
    expect(decoded.type).toBe('binary')
  })
})

// ============================================================================
// formatBytes
// ============================================================================

describe('formatBytes', () => {
  it('formats bytes', () => {
    expect(formatBytes(500)).toBe('500 B')
  })

  it('formats kilobytes', () => {
    expect(formatBytes(2048)).toBe('2.0 KB')
  })

  it('formats megabytes', () => {
    expect(formatBytes(1024 * 1024 * 3.5)).toBe('3.50 MB')
  })

  it('handles zero', () => {
    expect(formatBytes(0)).toBe('0 B')
  })
})

// ============================================================================
// formatSpeed
// ============================================================================

describe('formatSpeed', () => {
  it('formats bytes per second', () => {
    expect(formatSpeed(500)).toBe('500 B/s')
  })

  it('formats KB/s', () => {
    expect(formatSpeed(2048)).toBe('2.0 KB/s')
  })

  it('formats MB/s', () => {
    expect(formatSpeed(1024 * 1024 * 2)).toBe('2.00 MB/s')
  })
})

// ============================================================================
// generateConnectionCode
// ============================================================================

describe('generateConnectionCode', () => {
  it('produces 6-character string', () => {
    expect(generateConnectionCode()).toHaveLength(6)
  })

  it('uses only allowed characters (excludes 0, O, I, 1)', () => {
    // Generate many codes and check none contain excluded chars
    for (let i = 0; i < 100; i++) {
      const code = generateConnectionCode()
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)
    }
  })
})

// ============================================================================
// generatePairingEmojis
// ============================================================================

describe('generatePairingEmojis', () => {
  it('returns 3 emojis', () => {
    const emojis = generatePairingEmojis('peer-a', 'peer-b')
    expect(emojis).toHaveLength(3)
  })

  it('emojis come from EMOJI_POOL', () => {
    const emojis = generatePairingEmojis('a', 'b')
    emojis.forEach((e) => {
      expect(EMOJI_POOL).toContain(e)
    })
  })

  it('is deterministic for same input', () => {
    const a = generatePairingEmojis('x', 'y')
    const b = generatePairingEmojis('x', 'y')
    expect(a).toEqual(b)
  })

  it('is order-independent (sorted internally)', () => {
    const a = generatePairingEmojis('alice', 'bob')
    const b = generatePairingEmojis('bob', 'alice')
    expect(a).toEqual(b)
  })
})

// ============================================================================
// Binary packet roundtrip
// ============================================================================

describe('createBinaryPacket / parseBinaryPacket', () => {
  it('roundtrips header and data', () => {
    const header = { index: 0, type: 'image/png' }
    const rawData = new Uint8Array([10, 20, 30, 40])
    const packet = createBinaryPacket(header, rawData)
    const parsed = parseBinaryPacket(packet)
    expect(parsed.header).toEqual(header)
    expect(parsed.imageData).toEqual(rawData)
  })

  it('handles large header', () => {
    const header = { data: 'x'.repeat(1000) }
    const rawData = new Uint8Array([1])
    const packet = createBinaryPacket(header, rawData)
    const parsed = parseBinaryPacket(packet)
    expect(parsed.header.data).toHaveLength(1000)
  })
})

// ============================================================================
// Chunk packet roundtrip
// ============================================================================

describe('createChunkPacket / parseChunkPacket', () => {
  it('roundtrips chunk metadata', () => {
    const header = { uuid: 'abc', type: 'video/mp4' }
    const chunkData = new Uint8Array([0x01, 0x02])
    const packet = createChunkPacket(header, chunkData, 3, 10)

    // First byte is MSG_TYPE_CHUNK
    expect(packet[0]).toBe(MSG_TYPE_CHUNK)

    // Parse the rest (without the type prefix byte)
    const parsed = parseChunkPacket(packet.slice(1))
    expect(parsed.header).toEqual(header)
    expect(parsed.chunkIndex).toBe(3)
    expect(parsed.totalChunks).toBe(10)
    expect(parsed.chunkData).toEqual(chunkData)
  })

  it('handles first and last chunks', () => {
    const header = { id: 'test' }
    const data = new Uint8Array([0xff])

    const first = createChunkPacket(header, data, 0, 5)
    const last = createChunkPacket(header, data, 4, 5)

    const parsedFirst = parseChunkPacket(first.slice(1))
    const parsedLast = parseChunkPacket(last.slice(1))

    expect(parsedFirst.chunkIndex).toBe(0)
    expect(parsedLast.chunkIndex).toBe(4)
    expect(parsedLast.totalChunks).toBe(5)
  })
})

// ============================================================================
// blobToBase64
// ============================================================================

describe('blobToBase64', () => {
  it('converts a blob to a base64 data URL', async () => {
    const blob = new Blob(['hello'], { type: 'text/plain' })
    const result = await blobToBase64(blob)
    expect(result).toMatch(/^data:text\/plain;base64,/)
  })
})
