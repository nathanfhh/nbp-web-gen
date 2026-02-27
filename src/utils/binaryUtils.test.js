import { describe, it, expect } from 'vitest'
import { uint8ArrayToBinaryString, detectMimeFromBase64 } from './binaryUtils'

// ============================================================================
// uint8ArrayToBinaryString — Chunked binary conversion (H-4 fix)
// ============================================================================

describe('uint8ArrayToBinaryString', () => {
  it('converts empty array', () => {
    const bytes = new Uint8Array(0)
    expect(uint8ArrayToBinaryString(bytes)).toBe('')
  })

  it('converts small array (< chunk size)', () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]) // "Hello"
    expect(uint8ArrayToBinaryString(bytes)).toBe('Hello')
  })

  it('converts array at exact chunk boundary (8192 bytes)', () => {
    const bytes = new Uint8Array(8192)
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = i % 256
    }
    const result = uint8ArrayToBinaryString(bytes)
    expect(result.length).toBe(8192)
    // Verify first and last bytes
    expect(result.charCodeAt(0)).toBe(0)
    expect(result.charCodeAt(8191)).toBe(8191 % 256)
  })

  it('converts large array spanning multiple chunks', () => {
    // 20000 bytes = 2 full chunks (8192) + 1 partial chunk (3616)
    const bytes = new Uint8Array(20000)
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = i % 256
    }
    const result = uint8ArrayToBinaryString(bytes)
    expect(result.length).toBe(20000)
    // Verify data integrity across chunk boundaries
    expect(result.charCodeAt(8191)).toBe(8191 % 256) // end of chunk 1
    expect(result.charCodeAt(8192)).toBe(8192 % 256) // start of chunk 2
    expect(result.charCodeAt(16383)).toBe(16383 % 256) // end of chunk 2
    expect(result.charCodeAt(16384)).toBe(16384 % 256) // start of chunk 3
    expect(result.charCodeAt(19999)).toBe(19999 % 256) // last byte
  })

  it('produces identical result to naive byte-by-byte conversion', () => {
    // This is the key regression test: chunked must equal unchunked
    const bytes = new Uint8Array(10000)
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = i % 256
    }

    // Naive O(n²) approach (what we replaced)
    let naiveBinary = ''
    for (let j = 0; j < bytes.length; j++) {
      naiveBinary += String.fromCharCode(bytes[j])
    }

    const chunkedBinary = uint8ArrayToBinaryString(bytes)
    expect(chunkedBinary).toBe(naiveBinary)
  })

  it('works with btoa() for base64 encoding', () => {
    // "Hello World" in bytes
    const bytes = new Uint8Array([72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100])
    const binary = uint8ArrayToBinaryString(bytes)
    expect(btoa(binary)).toBe('SGVsbG8gV29ybGQ=')
  })

  it('handles all byte values (0-255)', () => {
    const bytes = new Uint8Array(256)
    for (let i = 0; i < 256; i++) {
      bytes[i] = i
    }
    const result = uint8ArrayToBinaryString(bytes)
    expect(result.length).toBe(256)
    for (let i = 0; i < 256; i++) {
      expect(result.charCodeAt(i)).toBe(i)
    }
  })
})

// ============================================================================
// detectMimeFromBase64 — MIME type detection (H-7 fix)
// ============================================================================

describe('detectMimeFromBase64', () => {
  it('detects JPEG from /9j/ prefix', () => {
    expect(detectMimeFromBase64('/9j/4AAQSkZJRgABAQ')).toBe('image/jpeg')
  })

  it('detects PNG from iVBOR prefix', () => {
    expect(detectMimeFromBase64('iVBORw0KGgoAAAAN')).toBe('image/png')
  })

  it('detects WebP from UklGR prefix', () => {
    expect(detectMimeFromBase64('UklGRlYAAABXRUJQ')).toBe('image/webp')
  })

  it('detects GIF from R0lGOD prefix', () => {
    expect(detectMimeFromBase64('R0lGODlhAQABAIAA')).toBe('image/gif')
  })

  it('defaults to image/png for unknown prefix', () => {
    expect(detectMimeFromBase64('AAAAAAAAAAAAAAAA')).toBe('image/png')
  })

  it('defaults to image/png for empty string', () => {
    expect(detectMimeFromBase64('')).toBe('image/png')
  })

  // Real-world base64 prefixes from actual encoded files
  it('handles real JPEG base64 (starts with /9j/)', () => {
    // First bytes of a JPEG: FF D8 FF E0 → base64: /9j/4
    expect(detectMimeFromBase64('/9j/4')).toBe('image/jpeg')
  })

  it('handles real PNG base64 (starts with iVBOR)', () => {
    // First bytes of a PNG: 89 50 4E 47 0D 0A 1A 0A → base64: iVBORw0KGgo
    expect(detectMimeFromBase64('iVBORw0KGgo')).toBe('image/png')
  })

  it('handles real WebP base64 (starts with UklGR)', () => {
    // First bytes of a WebP: 52 49 46 46 → base64: UklGR
    expect(detectMimeFromBase64('UklGRxxxxxx')).toBe('image/webp')
  })

  it('handles real GIF base64 (starts with R0lGOD)', () => {
    // GIF87a: 47 49 46 38 37 61 → base64: R0lGODdh
    // GIF89a: 47 49 46 38 39 61 → base64: R0lGODlh
    expect(detectMimeFromBase64('R0lGODdh')).toBe('image/gif')
    expect(detectMimeFromBase64('R0lGODlh')).toBe('image/gif')
  })
})

// ============================================================================
// Array.from vs Array.fill — Shared reference pattern (H-6 fix)
// ============================================================================

describe('Array.from vs Array.fill (kMeans initialization pattern)', () => {
  it('Array.fill creates shared references (the bug)', () => {
    // This is the BROKEN pattern that was fixed
    const broken = Array(2).fill({ center: [128, 128, 128], count: 0 })

    // Both elements point to the same object
    expect(broken[0]).toBe(broken[1]) // same reference!

    // Modifying one mutates the other
    broken[0].center[0] = 255
    expect(broken[1].center[0]).toBe(255) // unintended side effect
  })

  it('Array.from creates independent objects (the fix)', () => {
    // This is the FIXED pattern using Array.from
    const fixed = Array.from({ length: 2 }, () => ({ center: [128, 128, 128], count: 0 }))

    // Elements are different objects
    expect(fixed[0]).not.toBe(fixed[1])

    // Modifying one does NOT affect the other
    fixed[0].center[0] = 255
    expect(fixed[1].center[0]).toBe(128) // independent
  })

  it('Array.from centers are independent arrays', () => {
    const k = 3
    const clusters = Array.from({ length: k }, () => ({ center: [128, 128, 128], count: 0 }))

    // Modify each cluster independently
    clusters[0].center = [0, 0, 0]
    clusters[1].center = [255, 0, 0]
    clusters[2].count = 42

    expect(clusters[0].center).toEqual([0, 0, 0])
    expect(clusters[1].center).toEqual([255, 0, 0])
    expect(clusters[2].center).toEqual([128, 128, 128])
    expect(clusters[0].count).toBe(0)
    expect(clusters[2].count).toBe(42)
  })
})
