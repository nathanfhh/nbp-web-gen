/**
 * Audio Encoder - Browser-side PCM to MP3 conversion
 *
 * TTS API returns audio/L16;rate=24000 (16-bit PCM, mono, 24kHz)
 * We convert to MP3 64kbps for storage efficiency (~3x compression)
 */

import { loadLamejs } from './lamejs'

/**
 * Parse TTS response mimeType to extract audio parameters
 * @param {string} mimeType - e.g. "audio/L16;rate=24000"
 * @returns {{ sampleRate: number, bitsPerSample: number, numChannels: number }}
 */
export function parseMimeType(mimeType) {
  const params = { sampleRate: 24000, bitsPerSample: 16, numChannels: 1 }

  if (!mimeType) return params

  const rateMatch = mimeType.match(/rate=(\d+)/)
  if (rateMatch) {
    params.sampleRate = parseInt(rateMatch[1], 10)
  }

  // L16 = 16-bit linear PCM
  if (mimeType.includes('L16')) {
    params.bitsPerSample = 16
  }

  return params
}

/**
 * Convert base64-encoded PCM data to Int16Array
 * @param {string} base64Data - Base64 encoded PCM bytes
 * @returns {Int16Array}
 */
export function base64ToInt16Array(base64Data) {
  const binaryString = atob(base64Data)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  // PCM 16-bit little-endian
  return new Int16Array(bytes.buffer)
}

/**
 * Encode PCM samples to MP3 using lamejs (dynamically imported)
 * @param {Int16Array} pcmSamples - 16-bit PCM samples
 * @param {number} sampleRate - Sample rate (e.g. 24000)
 * @param {number} bitRate - MP3 bitrate in kbps (default: 64)
 * @returns {Promise<Blob>} MP3 blob
 */
export async function encodePcmToMp3(pcmSamples, sampleRate, bitRate = 64) {
  const lamejs = await loadLamejs()
  const mp3enc = new lamejs.Mp3Encoder(1, sampleRate, bitRate)

  const blockSize = 1152
  const mp3Data = []

  for (let i = 0; i < pcmSamples.length; i += blockSize) {
    const chunk = pcmSamples.subarray(i, i + blockSize)
    const mp3buf = mp3enc.encodeBuffer(chunk)
    if (mp3buf.length > 0) {
      mp3Data.push(mp3buf)
    }
  }

  const end = mp3enc.flush()
  if (end.length > 0) {
    mp3Data.push(end)
  }

  return new Blob(mp3Data, { type: 'audio/mpeg' })
}

/**
 * Convert TTS API response (base64 PCM) to MP3 Blob
 * Main entry point for audio conversion
 *
 * @param {string} base64Data - Base64 encoded PCM data
 * @param {string} mimeType - e.g. "audio/L16;rate=24000"
 * @returns {Promise<Blob>} MP3 blob
 */
export async function convertTtsResponseToMp3(base64Data, mimeType) {
  const { sampleRate } = parseMimeType(mimeType)
  const pcmSamples = base64ToInt16Array(base64Data)
  return encodePcmToMp3(pcmSamples, sampleRate, 64)
}

/**
 * Convert PCM data to WAV Blob (fallback if MP3 encoding fails)
 * @param {string} base64Data - Base64 encoded PCM data
 * @param {string} mimeType - e.g. "audio/L16;rate=24000"
 * @returns {Blob} WAV blob
 */
export function convertPcmToWav(base64Data, mimeType) {
  const { sampleRate, bitsPerSample, numChannels } = parseMimeType(mimeType)
  const pcmSamples = base64ToInt16Array(base64Data)
  const pcmBytes = pcmSamples.buffer

  const wavHeaderSize = 44
  const dataSize = pcmBytes.byteLength
  const fileSize = wavHeaderSize + dataSize

  const buffer = new ArrayBuffer(fileSize)
  const view = new DataView(buffer)

  // RIFF header
  writeString(view, 0, 'RIFF')
  view.setUint32(4, fileSize - 8, true)
  writeString(view, 8, 'WAVE')

  // fmt chunk
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // chunk size
  view.setUint16(20, 1, true) // PCM format
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true) // byte rate
  view.setUint16(32, numChannels * (bitsPerSample / 8), true) // block align
  view.setUint16(34, bitsPerSample, true)

  // data chunk
  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  // Copy PCM data
  const wavBytes = new Uint8Array(buffer)
  wavBytes.set(new Uint8Array(pcmBytes), wavHeaderSize)

  return new Blob([buffer], { type: 'audio/wav' })
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i))
  }
}
