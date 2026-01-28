/**
 * MP4 Encoder Worker
 *
 * Encodes slide images + narration audio into an MP4 video
 * using WebCodecs API (H.264/AAC) and mp4-muxer for container packaging.
 *
 * Input message:
 *   images: ArrayBuffer[]           - Image buffers (may contain null for failed pages)
 *   imageMimeTypes: string[]        - MIME types for each image
 *   audioBuffers: (ArrayBuffer|null)[] - Audio buffers (null = no audio for that page)
 *   audioMimeTypes: (string|null)[]  - MIME types for audio
 *   defaultPageDuration: number      - Duration in seconds for pages without audio
 *
 * Output messages:
 *   { type: 'progress', current, total, phase }
 *   { type: 'complete', data: ArrayBuffer }
 *   { type: 'error', error: string }
 */

import { Muxer, ArrayBufferTarget } from 'mp4-muxer'

const TARGET_SAMPLE_RATE = 48000
const AUDIO_BITRATE = 128_000
const VIDEO_BITRATE = 2_000_000
const AUDIO_CHUNK_SIZE = 4096

/**
 * Parse WAV header and return PCM Float32 data + sample rate
 */
function decodeWav(arrayBuffer) {
  const view = new DataView(arrayBuffer)

  // Validate RIFF header
  const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))
  if (riff !== 'RIFF') throw new Error('Not a valid WAV file')

  const numChannels = view.getUint16(22, true)
  const sampleRate = view.getUint32(24, true)
  const bitsPerSample = view.getUint16(34, true)

  // Find data chunk
  let offset = 12
  while (offset < arrayBuffer.byteLength - 8) {
    const chunkId = String.fromCharCode(
      view.getUint8(offset), view.getUint8(offset + 1),
      view.getUint8(offset + 2), view.getUint8(offset + 3),
    )
    const chunkSize = view.getUint32(offset + 4, true)
    if (chunkId === 'data') {
      offset += 8
      break
    }
    offset += 8 + chunkSize
  }

  const dataBytes = arrayBuffer.slice(offset)
  let float32Data

  if (bitsPerSample === 16) {
    const int16 = new Int16Array(dataBytes)
    float32Data = new Float32Array(int16.length)
    for (let i = 0; i < int16.length; i++) {
      float32Data[i] = int16[i] / 32768
    }
  } else if (bitsPerSample === 32) {
    float32Data = new Float32Array(dataBytes)
  } else if (bitsPerSample === 24) {
    const byteView = new Uint8Array(dataBytes)
    const sampleCount = byteView.length / 3
    float32Data = new Float32Array(sampleCount)
    for (let i = 0; i < sampleCount; i++) {
      const b0 = byteView[i * 3]
      const b1 = byteView[i * 3 + 1]
      const b2 = byteView[i * 3 + 2]
      let val = (b0 | (b1 << 8) | (b2 << 16))
      if (val & 0x800000) val |= ~0xFFFFFF // sign extend
      float32Data[i] = val / 8388608
    }
  } else {
    throw new Error(`Unsupported WAV bit depth: ${bitsPerSample}`)
  }

  // Mix to mono if stereo
  if (numChannels > 1) {
    const monoLength = Math.floor(float32Data.length / numChannels)
    const mono = new Float32Array(monoLength)
    for (let i = 0; i < monoLength; i++) {
      let sum = 0
      for (let ch = 0; ch < numChannels; ch++) {
        sum += float32Data[i * numChannels + ch]
      }
      mono[i] = sum / numChannels
    }
    return { pcm: mono, sampleRate }
  }

  return { pcm: float32Data, sampleRate }
}

/**
 * Decode MP3 audio using AudioDecoder (WebCodecs)
 */
async function decodeMp3(arrayBuffer) {
  const samples = []
  let sampleRate = 44100

  await new Promise((resolve, reject) => {
    const decoder = new AudioDecoder({
      output: (audioData) => {
        sampleRate = audioData.sampleRate
        const buf = new Float32Array(audioData.numberOfFrames)
        // Copy first channel (mono)
        audioData.copyTo(buf, { planeIndex: 0 })
        samples.push(buf)
        audioData.close()
      },
      error: (e) => reject(e),
    })

    decoder.configure({
      codec: 'mp3',
      sampleRate: 44100,
      numberOfChannels: 1,
    })

    // Feed entire buffer as one chunk
    decoder.decode(new EncodedAudioChunk({
      type: 'key',
      timestamp: 0,
      data: arrayBuffer,
    }))

    decoder.flush().then(resolve).catch(reject)
  })

  // Concatenate all decoded samples
  const totalLength = samples.reduce((sum, s) => sum + s.length, 0)
  const pcm = new Float32Array(totalLength)
  let offset = 0
  for (const s of samples) {
    pcm.set(s, offset)
    offset += s.length
  }

  return { pcm, sampleRate }
}

/**
 * Resample PCM data to target sample rate using linear interpolation
 */
function resample(pcm, fromRate, toRate) {
  if (fromRate === toRate) return pcm

  const ratio = fromRate / toRate
  const outputLength = Math.round(pcm.length / ratio)
  const output = new Float32Array(outputLength)

  for (let i = 0; i < outputLength; i++) {
    const srcIdx = i * ratio
    const srcIdxFloor = Math.floor(srcIdx)
    const frac = srcIdx - srcIdxFloor

    const s0 = pcm[srcIdxFloor] || 0
    const s1 = pcm[Math.min(srcIdxFloor + 1, pcm.length - 1)] || 0
    output[i] = s0 + frac * (s1 - s0)
  }

  return output
}

/**
 * Make a dimension even (H.264 requirement)
 */
function makeEven(n) {
  return n % 2 === 0 ? n : n + 1
}

self.onmessage = async (e) => {
  const {
    images,
    imageMimeTypes,
    audioBuffers,
    audioMimeTypes,
    defaultPageDuration = 5,
  } = e.data

  const pageCount = images.length

  try {
    // Phase 1: Decode audio for all pages to determine durations
    self.postMessage({ type: 'progress', current: 0, total: pageCount, phase: 'decoding' })

    const audioData = [] // { pcm: Float32Array, sampleRate } | null
    for (let i = 0; i < pageCount; i++) {
      if (audioBuffers[i]) {
        try {
          const mime = audioMimeTypes[i] || ''
          if (mime.includes('wav') || mime.includes('wave')) {
            audioData.push(decodeWav(audioBuffers[i]))
          } else {
            audioData.push(await decodeMp3(audioBuffers[i]))
          }
        } catch {
          audioData.push(null)
        }
      } else {
        audioData.push(null)
      }
    }

    // Calculate page durations
    const pageDurations = audioData.map((audio) => {
      if (audio) {
        return audio.pcm.length / audio.sampleRate
      }
      return defaultPageDuration
    })

    // Phase 2: Resolve image bitmaps with fallback logic
    // First pass: find first valid image for forward-fallback
    let firstValidIdx = -1
    for (let i = 0; i < pageCount; i++) {
      if (images[i]) {
        firstValidIdx = i
        break
      }
    }

    // Determine video dimensions from first valid image
    let videoWidth = 1920
    let videoHeight = 1080
    let firstBitmap = null

    if (firstValidIdx >= 0) {
      try {
        firstBitmap = await createImageBitmap(
          new Blob([images[firstValidIdx]], { type: imageMimeTypes[firstValidIdx] || 'image/png' }),
        )
        videoWidth = makeEven(firstBitmap.width)
        videoHeight = makeEven(firstBitmap.height)
      } catch {
        // fallback to default 16:9
      }
    }

    // Phase 3: Set up mp4-muxer
    const target = new ArrayBufferTarget()
    const muxer = new Muxer({
      target,
      video: {
        codec: 'avc',
        width: videoWidth,
        height: videoHeight,
      },
      audio: {
        codec: 'aac',
        sampleRate: TARGET_SAMPLE_RATE,
        numberOfChannels: 1,
      },
      fastStart: 'in-memory',
    })

    // Phase 4: Set up VideoEncoder
    const videoEncoder = new VideoEncoder({
      output: (chunk, meta) => {
        muxer.addVideoChunk(chunk, meta)
      },
      error: (err) => {
        throw err
      },
    })

    videoEncoder.configure({
      codec: 'avc1.640028', // H.264 High L4.0
      width: videoWidth,
      height: videoHeight,
      bitrate: VIDEO_BITRATE,
      bitrateMode: 'constant',
    })

    // Phase 5: Set up AudioEncoder
    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => {
        muxer.addAudioChunk(chunk, meta)
      },
      error: (err) => {
        throw err
      },
    })

    audioEncoder.configure({
      codec: 'mp4a.40.2', // AAC-LC
      sampleRate: TARGET_SAMPLE_RATE,
      numberOfChannels: 1,
      bitrate: AUDIO_BITRATE,
    })

    // Phase 6: Encode each page
    const canvas = new OffscreenCanvas(videoWidth, videoHeight)
    const ctx = canvas.getContext('2d')

    let currentTimestamp = 0 // microseconds
    let lastValidBitmap = firstBitmap

    for (let i = 0; i < pageCount; i++) {
      self.postMessage({ type: 'progress', current: i + 1, total: pageCount, phase: 'encoding' })

      const durationSec = pageDurations[i]
      const durationUs = Math.round(durationSec * 1_000_000)

      // Resolve bitmap for this page
      let bitmap = null
      if (images[i]) {
        try {
          if (i === firstValidIdx && firstBitmap) {
            bitmap = firstBitmap
          } else {
            bitmap = await createImageBitmap(
              new Blob([images[i]], { type: imageMimeTypes[i] || 'image/png' }),
            )
          }
          lastValidBitmap = bitmap
        } catch {
          bitmap = lastValidBitmap
        }
      } else {
        bitmap = lastValidBitmap
      }

      // Draw image on canvas with letterbox (fit-contain, white background)
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, videoWidth, videoHeight)

      if (bitmap) {
        const scale = Math.min(videoWidth / bitmap.width, videoHeight / bitmap.height)
        const drawWidth = bitmap.width * scale
        const drawHeight = bitmap.height * scale
        const offsetX = (videoWidth - drawWidth) / 2
        const offsetY = (videoHeight - drawHeight) / 2
        ctx.drawImage(bitmap, offsetX, offsetY, drawWidth, drawHeight)
      }

      // Create VideoFrame and encode (one keyframe per page)
      const frame = new VideoFrame(canvas, {
        timestamp: currentTimestamp,
        duration: durationUs,
      })
      videoEncoder.encode(frame, { keyFrame: true })
      frame.close()

      // Encode audio for this page
      const pageAudio = audioData[i]
      let pcm48k

      if (pageAudio) {
        pcm48k = resample(pageAudio.pcm, pageAudio.sampleRate, TARGET_SAMPLE_RATE)
      } else {
        // Silence
        const silenceSamples = Math.round(durationSec * TARGET_SAMPLE_RATE)
        pcm48k = new Float32Array(silenceSamples)
      }

      // Encode audio in chunks
      let audioOffset = 0
      let audioTimestamp = currentTimestamp
      while (audioOffset < pcm48k.length) {
        const remaining = pcm48k.length - audioOffset
        const chunkLen = Math.min(AUDIO_CHUNK_SIZE, remaining)
        const chunk = pcm48k.subarray(audioOffset, audioOffset + chunkLen)

        const audioDataObj = new AudioData({
          format: 'f32',
          sampleRate: TARGET_SAMPLE_RATE,
          numberOfFrames: chunkLen,
          numberOfChannels: 1,
          timestamp: audioTimestamp,
          data: chunk,
        })
        audioEncoder.encode(audioDataObj)
        audioDataObj.close()

        audioOffset += chunkLen
        audioTimestamp += Math.round((chunkLen / TARGET_SAMPLE_RATE) * 1_000_000)
      }

      currentTimestamp += durationUs

      // Close bitmap if not reused
      if (bitmap && bitmap !== firstBitmap && bitmap !== lastValidBitmap) {
        bitmap.close()
      }
    }

    // Phase 7: Flush and finalize
    self.postMessage({ type: 'progress', current: pageCount, total: pageCount, phase: 'finalizing' })

    await videoEncoder.flush()
    videoEncoder.close()

    await audioEncoder.flush()
    audioEncoder.close()

    muxer.finalize()

    const buffer = target.buffer
    self.postMessage({ type: 'complete', data: buffer }, [buffer])
  } catch (err) {
    self.postMessage({ type: 'error', error: err.message || String(err) })
  }
}
