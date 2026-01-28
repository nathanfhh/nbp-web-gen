/**
 * MP4 Encoder Worker
 *
 * Encodes slide images + pre-decoded audio PCM into an MP4 video
 * using WebCodecs API (H.264/AAC) and mp4-muxer for container packaging.
 *
 * Audio decoding is done in the main thread (AudioContext) for reliability.
 * This worker receives already-decoded mono Float32 PCM at 48kHz.
 *
 * Input message:
 *   images: ArrayBuffer[]              - Image buffers (may contain null for failed pages)
 *   imageMimeTypes: string[]           - MIME types for each image
 *   audioPcmData: (Float32Array|null)[] - Pre-decoded mono PCM at 48kHz (null = no audio)
 *   defaultPageDuration: number         - Duration in seconds for pages without audio
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
const MAX_VIDEO_WIDTH = 1920
const MAX_VIDEO_HEIGHT = 1080

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
    audioPcmData,
    defaultPageDuration = 5,
  } = e.data

  const pageCount = images.length

  try {
    // Calculate page durations from pre-decoded PCM
    const pageDurations = audioPcmData.map((pcm) => {
      if (pcm && pcm.length > 0) {
        return pcm.length / TARGET_SAMPLE_RATE
      }
      return defaultPageDuration
    })

    // Phase 1: Resolve image bitmaps with fallback logic
    self.postMessage({ type: 'progress', current: 0, total: pageCount, phase: 'preparing' })

    // First pass: find first valid image for forward-fallback
    let firstValidIdx = -1
    for (let i = 0; i < pageCount; i++) {
      if (images[i]) {
        firstValidIdx = i
        break
      }
    }

    // Determine video dimensions from first valid image (capped to AVC level limits)
    let videoWidth = 1920
    let videoHeight = 1080
    let firstBitmap = null

    if (firstValidIdx >= 0) {
      try {
        firstBitmap = await createImageBitmap(
          new Blob([images[firstValidIdx]], { type: imageMimeTypes[firstValidIdx] || 'image/png' }),
        )
        let w = firstBitmap.width
        let h = firstBitmap.height

        // Scale down if exceeds max dimensions (H.264 encoder level constraint)
        if (w > MAX_VIDEO_WIDTH || h > MAX_VIDEO_HEIGHT) {
          const scale = Math.min(MAX_VIDEO_WIDTH / w, MAX_VIDEO_HEIGHT / h)
          w = Math.round(w * scale)
          h = Math.round(h * scale)
        }

        videoWidth = makeEven(w)
        videoHeight = makeEven(h)
      } catch {
        // fallback to default 16:9
      }
    }

    // Phase 2: Set up mp4-muxer
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

    // Phase 3: Set up VideoEncoder with support check
    const videoConfig = {
      codec: 'avc1.640028', // H.264 High L4.0
      width: videoWidth,
      height: videoHeight,
      bitrate: VIDEO_BITRATE,
      bitrateMode: 'constant',
    }

    // Check if VideoEncoder supports this configuration
    const videoSupport = await VideoEncoder.isConfigSupported(videoConfig)
    if (!videoSupport.supported) {
      throw new Error(`VideoEncoder config not supported: ${videoWidth}x${videoHeight} H.264`)
    }

    let encoderError = null
    let currentEncodingPage = -1 // Declared here, used by both encoders
    const videoEncoder = new VideoEncoder({
      output: (chunk, meta) => {
        muxer.addVideoChunk(chunk, meta)
      },
      error: (err) => {
        const enhancedError = new Error(
          `VideoEncoder error at page ${currentEncodingPage + 1}: ${err.message}`
        )
        enhancedError.cause = err
        encoderError = enhancedError
      },
    })

    videoEncoder.configure(videoConfig)

    // Phase 4: Set up AudioEncoder with support check
    const audioConfig = {
      codec: 'mp4a.40.2', // AAC-LC
      sampleRate: TARGET_SAMPLE_RATE,
      numberOfChannels: 1,
      bitrate: AUDIO_BITRATE,
    }

    // Check if AudioEncoder supports this configuration
    const audioSupport = await AudioEncoder.isConfigSupported(audioConfig)
    if (!audioSupport.supported) {
      throw new Error(`AudioEncoder config not supported: ${JSON.stringify(audioConfig)}`)
    }

    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => {
        muxer.addAudioChunk(chunk, meta)
      },
      error: (err) => {
        // Enhance error with context
        const enhancedError = new Error(
          `AudioEncoder error at page ${currentEncodingPage + 1}: ${err.message}`
        )
        enhancedError.cause = err
        encoderError = enhancedError
      },
    })

    audioEncoder.configure(audioConfig)

    // Phase 5: Encode each page
    const canvas = new OffscreenCanvas(videoWidth, videoHeight)
    const ctx = canvas.getContext('2d')

    let currentTimestamp = 0 // microseconds
    let lastValidBitmap = firstBitmap

    for (let i = 0; i < pageCount; i++) {
      currentEncodingPage = i // Track for error reporting
      self.postMessage({ type: 'progress', current: i + 1, total: pageCount, phase: 'encoding' })

      const durationSec = pageDurations[i]
      const durationUs = Math.round(durationSec * 1_000_000)

      // Validate duration
      if (!Number.isFinite(durationSec) || durationSec <= 0) {
        throw new Error(`Invalid duration at page ${i + 1}: ${durationSec}s`)
      }

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

      // Check for encoder errors immediately after video encode
      // WebCodecs encoders enter "closed" state on error, so we must exit early
      if (encoderError) {
        throw encoderError
      }

      // Audio: use pre-decoded PCM or generate silence
      const pcm = audioPcmData[i]
      let pcm48k
      if (pcm && pcm.length > 0) {
        // Validate PCM data - check for NaN/Infinity which can crash AudioEncoder
        let hasInvalidSamples = false
        for (let j = 0; j < Math.min(pcm.length, 1000); j++) {
          if (!Number.isFinite(pcm[j])) {
            hasInvalidSamples = true
            break
          }
        }
        if (hasInvalidSamples) {
          console.warn(`Page ${i + 1}: PCM contains invalid samples, using silence`)
          pcm48k = new Float32Array(Math.round(durationSec * TARGET_SAMPLE_RATE))
        } else {
          pcm48k = pcm
        }
      } else {
        pcm48k = new Float32Array(Math.round(durationSec * TARGET_SAMPLE_RATE))
      }

      // Encode audio in chunks
      let audioOffset = 0
      let audioTimestamp = currentTimestamp
      while (audioOffset < pcm48k.length) {
        // Check encoder state before each audio chunk
        if (encoderError) {
          throw encoderError
        }

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

      // Close bitmap if it's a new one (not the cached references)
      if (bitmap && bitmap !== firstBitmap && bitmap !== lastValidBitmap) {
        bitmap.close()
      }

      // Check for errors at end of each page iteration
      if (encoderError) {
        throw encoderError
      }
    }

    // Phase 6: Flush and finalize
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
