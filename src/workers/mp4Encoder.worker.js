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
const OPUS_BITRATE = 96_000 // Opus uses lower bitrate for similar quality
const VIDEO_BITRATE = 2_000_000
const AUDIO_CHUNK_SIZE = 4096
const MAX_VIDEO_WIDTH = 1920
const MAX_VIDEO_HEIGHT = 1080

// Crossfade transition settings
const TRANSITION_DURATION_SEC = 0.4
const TRANSITION_FPS = 30
const TRANSITION_FRAMES = Math.round(TRANSITION_DURATION_SEC * TRANSITION_FPS) // 12 frames
const TRANSITION_DURATION_US = Math.round(TRANSITION_DURATION_SEC * 1_000_000) // 400,000 µs
const TRANSITION_SILENCE_RATIO = 0.75 // Next page audio starts after this ratio (0.75 = 75% through)

/**
 * Make a dimension even (H.264 requirement)
 */
function makeEven(n) {
  return n % 2 === 0 ? n : n + 1
}

/**
 * Validate PCM data - check for NaN/Infinity which can crash AudioEncoder
 * @param {Float32Array|null} pcm - PCM data to validate
 * @returns {boolean} true if valid, false if invalid or empty
 */
function isValidPcm(pcm) {
  if (!pcm || pcm.length === 0) return false
  // Sample first 1000 values for performance
  const checkCount = Math.min(pcm.length, 1000)
  for (let i = 0; i < checkCount; i++) {
    if (!Number.isFinite(pcm[i])) return false
  }
  return true
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

    // Phase 2: Detect audio codec support (AAC → Opus fallback)
    // AAC (mp4a.40.2) has better compatibility but requires hardware/licensed encoder
    // Opus has universal software support in all modern browsers
    const aacConfig = {
      codec: 'mp4a.40.2', // AAC-LC
      sampleRate: TARGET_SAMPLE_RATE,
      numberOfChannels: 1,
      bitrate: AUDIO_BITRATE,
    }

    const opusConfig = {
      codec: 'opus', // Opus - universally supported in software
      sampleRate: TARGET_SAMPLE_RATE,
      numberOfChannels: 1,
      bitrate: OPUS_BITRATE,
    }

    // Try AAC first, fall back to Opus if not supported
    const aacSupport = await AudioEncoder.isConfigSupported(aacConfig)
    const opusSupport = await AudioEncoder.isConfigSupported(opusConfig)

    let audioConfig
    let audioCodecForMuxer // 'aac' or 'opus'

    if (aacSupport.supported) {
      audioConfig = aacConfig
      audioCodecForMuxer = 'aac'
    } else if (opusSupport.supported) {
      audioConfig = opusConfig
      audioCodecForMuxer = 'opus'
      console.info('[MP4 Encoder] AAC not supported on this platform, using Opus codec')
    } else {
      throw new Error(
        `No supported audio codec available. Tried AAC and Opus. ` +
          `This may be a browser/platform limitation.`
      )
    }

    // Phase 3: Set up mp4-muxer with detected audio codec
    const target = new ArrayBufferTarget()
    const muxer = new Muxer({
      target,
      video: {
        codec: 'avc',
        width: videoWidth,
        height: videoHeight,
      },
      audio: {
        codec: audioCodecForMuxer,
        sampleRate: TARGET_SAMPLE_RATE,
        numberOfChannels: 1,
      },
      fastStart: 'in-memory',
    })

    // Phase 4: Set up VideoEncoder with support check
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

    // Phase 5: Set up AudioEncoder
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

    // Phase 6: Encode each page with crossfade transitions
    const canvas = new OffscreenCanvas(videoWidth, videoHeight)
    const ctx = canvas.getContext('2d')

    /**
     * Draw a bitmap onto canvas with letterbox (fit-contain, white background)
     * @param {ImageBitmap} bitmap - The bitmap to draw
     * @param {number} alpha - Opacity (0-1), defaults to 1
     */
    const drawLetterbox = (bitmap, alpha = 1) => {
      if (!bitmap) return
      ctx.globalAlpha = alpha
      const scale = Math.min(videoWidth / bitmap.width, videoHeight / bitmap.height)
      const drawWidth = bitmap.width * scale
      const drawHeight = bitmap.height * scale
      const offsetX = (videoWidth - drawWidth) / 2
      const offsetY = (videoHeight - drawHeight) / 2
      ctx.drawImage(bitmap, offsetX, offsetY, drawWidth, drawHeight)
      ctx.globalAlpha = 1
    }

    let currentTimestamp = 0 // microseconds
    let lastValidBitmap = firstBitmap
    let cachedNextBitmap = null // Reuse bitmap created during transition
    let audioSamplesConsumed = 0 // Samples already encoded during previous transition

    for (let i = 0; i < pageCount; i++) {
      currentEncodingPage = i // Track for error reporting
      self.postMessage({ type: 'progress', current: i + 1, total: pageCount, phase: 'encoding' })

      const durationSec = pageDurations[i]

      // Validate duration
      if (!Number.isFinite(durationSec) || durationSec <= 0) {
        throw new Error(`Invalid duration at page ${i + 1}: ${durationSec}s`)
      }

      // Calculate effective video duration (subtract audio already played during transition)
      const consumedDurationSec = audioSamplesConsumed / TARGET_SAMPLE_RATE
      const effectiveDurationSec = Math.max(0.1, durationSec - consumedDurationSec)
      const effectiveDurationUs = Math.round(effectiveDurationSec * 1_000_000)

      // Resolve bitmap for this page (use cached bitmap from previous transition if available)
      let bitmap = null
      if (cachedNextBitmap) {
        bitmap = cachedNextBitmap
        cachedNextBitmap = null
        if (images[i]) {
          lastValidBitmap = bitmap
        }
      } else if (images[i]) {
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
      drawLetterbox(bitmap)

      // Create VideoFrame and encode (one keyframe per page)
      const frame = new VideoFrame(canvas, {
        timestamp: currentTimestamp,
        duration: effectiveDurationUs,
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
      if (isValidPcm(pcm)) {
        pcm48k = pcm
      } else {
        if (pcm && pcm.length > 0) {
          console.warn(`Page ${i + 1}: PCM contains invalid samples, using silence`)
        }
        pcm48k = new Float32Array(Math.round(durationSec * TARGET_SAMPLE_RATE))
      }

      // Skip samples already encoded during previous transition (audio started early)
      let audioOffset = audioSamplesConsumed
      audioSamplesConsumed = 0 // Reset for next page

      // Encode remaining audio in chunks
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

      currentTimestamp += effectiveDurationUs

      // === Crossfade transition to next page (except for last page) ===
      if (i < pageCount - 1) {
        // Get next page's bitmap
        let nextBitmap = null
        if (images[i + 1]) {
          try {
            nextBitmap = await createImageBitmap(
              new Blob([images[i + 1]], { type: imageMimeTypes[i + 1] || 'image/png' }),
            )
          } catch {
            nextBitmap = lastValidBitmap
          }
        } else {
          nextBitmap = lastValidBitmap
        }

        // Encode crossfade transition frames with silence audio
        const frameDurationUs = Math.round(TRANSITION_DURATION_US / TRANSITION_FRAMES)
        const transitionStartTimestamp = currentTimestamp

        for (let f = 0; f < TRANSITION_FRAMES; f++) {
          const alpha = (f + 1) / TRANSITION_FRAMES // 1/12 → 12/12

          // Clear canvas with white background
          ctx.fillStyle = '#FFFFFF'
          ctx.fillRect(0, 0, videoWidth, videoHeight)

          // Draw current page (fading out)
          drawLetterbox(bitmap, 1 - alpha)

          // Draw next page (fading in)
          drawLetterbox(nextBitmap, alpha)

          // Encode transition frame
          const transitionFrame = new VideoFrame(canvas, {
            timestamp: currentTimestamp,
            duration: frameDurationUs,
          })
          videoEncoder.encode(transitionFrame, { keyFrame: f === 0 })
          transitionFrame.close()

          currentTimestamp += frameDurationUs

          if (encoderError) {
            throw encoderError
          }
        }

        // Transition audio: silence first, then start next page's audio early
        const silenceDuration = TRANSITION_DURATION_SEC * TRANSITION_SILENCE_RATIO
        const earlyAudioDuration = TRANSITION_DURATION_SEC * (1 - TRANSITION_SILENCE_RATIO)
        const silenceSamples = Math.round(silenceDuration * TARGET_SAMPLE_RATE)
        const earlyAudioSamples = Math.round(earlyAudioDuration * TARGET_SAMPLE_RATE)

        let transitionAudioTimestamp = transitionStartTimestamp

        // Part 1: Encode silence for first half of transition
        const silencePcm = new Float32Array(silenceSamples)
        let silenceOffset = 0
        while (silenceOffset < silencePcm.length) {
          if (encoderError) throw encoderError

          const remaining = silencePcm.length - silenceOffset
          const chunkLen = Math.min(AUDIO_CHUNK_SIZE, remaining)
          const chunk = silencePcm.subarray(silenceOffset, silenceOffset + chunkLen)

          const audioDataObj = new AudioData({
            format: 'f32',
            sampleRate: TARGET_SAMPLE_RATE,
            numberOfFrames: chunkLen,
            numberOfChannels: 1,
            timestamp: transitionAudioTimestamp,
            data: chunk,
          })
          audioEncoder.encode(audioDataObj)
          audioDataObj.close()

          silenceOffset += chunkLen
          transitionAudioTimestamp += Math.round((chunkLen / TARGET_SAMPLE_RATE) * 1_000_000)
        }

        // Part 2: Start next page's audio early (last portion of transition)
        const nextPcm = audioPcmData[i + 1]
        const nextPcm48k = isValidPcm(nextPcm)
          ? nextPcm
          : new Float32Array(Math.round(pageDurations[i + 1] * TARGET_SAMPLE_RATE))

        // Encode early portion of next page's audio
        const actualEarlySamples = Math.min(earlyAudioSamples, nextPcm48k.length)
        let earlyOffset = 0
        while (earlyOffset < actualEarlySamples) {
          if (encoderError) throw encoderError

          const remaining = actualEarlySamples - earlyOffset
          const chunkLen = Math.min(AUDIO_CHUNK_SIZE, remaining)
          const chunk = nextPcm48k.subarray(earlyOffset, earlyOffset + chunkLen)

          const audioDataObj = new AudioData({
            format: 'f32',
            sampleRate: TARGET_SAMPLE_RATE,
            numberOfFrames: chunkLen,
            numberOfChannels: 1,
            timestamp: transitionAudioTimestamp,
            data: chunk,
          })
          audioEncoder.encode(audioDataObj)
          audioDataObj.close()

          earlyOffset += chunkLen
          transitionAudioTimestamp += Math.round((chunkLen / TARGET_SAMPLE_RATE) * 1_000_000)
        }

        // Track consumed samples so next iteration skips them
        audioSamplesConsumed = actualEarlySamples

        // Cache nextBitmap for reuse in next iteration
        cachedNextBitmap = nextBitmap
      }

      // Check for errors at end of each page iteration
      if (encoderError) {
        throw encoderError
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
