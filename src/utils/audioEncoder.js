/**
 * Audio Encoder - Browser-side PCM to Opus/MP3 conversion
 *
 * TTS API returns audio/L16;rate=24000 (16-bit PCM, mono, 24kHz)
 * Priority: WebM/Opus (WebCodecs) → MP3 (lamejs) → WAV (fallback)
 *
 * Opus provides ~25% smaller files with better quality at 48kbps vs MP3 64kbps
 */

import { loadLamejs } from './lamejs'
import { Muxer, ArrayBufferTarget } from 'webm-muxer'

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
 * Encode PCM samples to WebM/Opus using WebCodecs AudioEncoder
 * @param {Int16Array} pcmSamples - 16-bit PCM samples
 * @param {number} sampleRate - Sample rate (e.g. 24000)
 * @param {number} bitRate - Opus bitrate in bps (default: 48000)
 * @returns {Promise<Blob>} WebM/Opus blob
 */
export async function encodePcmToOpus(pcmSamples, sampleRate, bitRate = 48000) {
  // Convert Int16 to Float32 (range -1.0 to 1.0)
  const pcmFloat32 = new Float32Array(pcmSamples.length)
  for (let i = 0; i < pcmSamples.length; i++) {
    pcmFloat32[i] = pcmSamples[i] / 32768
  }

  const target = new ArrayBufferTarget()
  const muxer = new Muxer({
    target,
    audio: { codec: 'A_OPUS', sampleRate, numberOfChannels: 1 },
  })

  return new Promise((resolve, reject) => {
    const encoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => reject(e),
    })

    encoder.configure({
      codec: 'opus',
      sampleRate,
      numberOfChannels: 1,
      bitrate: bitRate,
    })

    // Encode in chunks (Opus typically uses 20ms frames = 960 samples at 48kHz)
    // Use 4096 samples per chunk for efficiency
    const CHUNK_SIZE = 4096
    for (let i = 0; i < pcmFloat32.length; i += CHUNK_SIZE) {
      const chunkEnd = Math.min(i + CHUNK_SIZE, pcmFloat32.length)
      const chunk = pcmFloat32.subarray(i, chunkEnd)
      const audioData = new AudioData({
        format: 'f32',
        sampleRate,
        numberOfFrames: chunk.length,
        numberOfChannels: 1,
        timestamp: Math.round((i / sampleRate) * 1_000_000), // microseconds
        data: chunk,
      })
      encoder.encode(audioData)
      audioData.close()
    }

    encoder.flush().then(() => {
      encoder.close()
      muxer.finalize()
      resolve(new Blob([target.buffer], { type: 'audio/webm' }))
    }).catch(reject)
  })
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
 * Convert TTS API response (base64 PCM) to compressed audio Blob
 * Main entry point for audio conversion
 *
 * Priority: Opus (WebCodecs) → MP3 (lamejs) → WAV (fallback)
 *
 * @param {string} base64Data - Base64 encoded PCM data
 * @param {string} mimeType - e.g. "audio/L16;rate=24000"
 * @returns {Promise<{ blob: Blob, mimeType: string }>} Audio blob with its MIME type
 */
export async function convertTtsResponseToAudio(base64Data, mimeType) {
  const { sampleRate } = parseMimeType(mimeType)
  const pcmSamples = base64ToInt16Array(base64Data)

  // Try Opus first (better quality, smaller size)
  if (typeof AudioEncoder !== 'undefined') {
    try {
      const supported = await AudioEncoder.isConfigSupported({
        codec: 'opus',
        sampleRate,
        numberOfChannels: 1,
        bitrate: 48000,
      })
      if (supported.supported) {
        const blob = await encodePcmToOpus(pcmSamples, sampleRate, 48000)
        return { blob, mimeType: 'audio/webm' }
      }
    } catch (e) {
      console.warn('Opus encoding failed, falling back to MP3:', e)
    }
  }

  // Fallback to MP3
  try {
    const blob = await encodePcmToMp3(pcmSamples, sampleRate, 64)
    return { blob, mimeType: 'audio/mpeg' }
  } catch (e) {
    console.warn('MP3 encoding failed, falling back to WAV:', e)
  }

  // Ultimate fallback: WAV
  const blob = convertPcmToWav(base64Data, mimeType)
  return { blob, mimeType: 'audio/wav' }
}

/**
 * @deprecated Use convertTtsResponseToAudio instead
 * Convert TTS API response (base64 PCM) to MP3 Blob
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
 * Get file extension from audio MIME type
 * @param {string} mimeType - Audio MIME type
 * @returns {string} File extension (webm, mp3, or wav)
 */
export function getAudioExtension(mimeType) {
  if (mimeType === 'audio/wav') return 'wav'
  if (mimeType === 'audio/webm' || mimeType?.includes('opus')) return 'webm'
  return 'mp3'
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
