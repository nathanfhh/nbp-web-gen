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
 *   maxWidth: number                    - Max output video width (default 1920)
 *   maxHeight: number                   - Max output video height (default 1080)
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
const DEFAULT_VIDEO_BITRATE = 8_000_000
const AUDIO_CHUNK_SIZE = 4096

// Static page frame rate (for player compatibility)
// Using 2 fps to ensure standard video structure while keeping file size reasonable
const STATIC_PAGE_FPS = 2
const KEYFRAME_INTERVAL = 2 // Insert keyframe every N seconds

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

/**
 * Sample border color from an ImageBitmap by averaging 8 edge points
 * (4 corners + 4 edge midpoints). Used for letterbox background color.
 * @param {ImageBitmap} bitmap
 * @returns {{r: number, g: number, b: number}}
 */
function sampleBorderColor(bitmap) {
  const canvas = new OffscreenCanvas(1, 1)
  const ctx = canvas.getContext('2d')
  const w = bitmap.width
  const h = bitmap.height

  // 8 sample points: 4 corners + 4 edge midpoints
  const points = [
    [0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1], // corners
    [Math.floor(w / 2), 0], [Math.floor(w / 2), h - 1], // top/bottom mid
    [0, Math.floor(h / 2)], [w - 1, Math.floor(h / 2)], // left/right mid
  ]

  let totalR = 0, totalG = 0, totalB = 0
  let count = 0

  for (const [sx, sy] of points) {
    ctx.drawImage(bitmap, sx, sy, 1, 1, 0, 0, 1, 1)
    const pixel = ctx.getImageData(0, 0, 1, 1).data
    totalR += pixel[0]
    totalG += pixel[1]
    totalB += pixel[2]
    count++
  }

  return {
    r: Math.round(totalR / count),
    g: Math.round(totalG / count),
    b: Math.round(totalB / count),
  }
}

/**
 * Convert {r,g,b} to CSS rgb() string
 * @param {{r: number, g: number, b: number}} color
 * @returns {string}
 */
function rgbToString(color) {
  return `rgb(${color.r},${color.g},${color.b})`
}

/**
 * Linearly interpolate between two RGB colors
 * @param {{r: number, g: number, b: number}} colorA
 * @param {{r: number, g: number, b: number}} colorB
 * @param {number} t - Interpolation factor (0 = colorA, 1 = colorB)
 * @returns {string} CSS rgb() string
 */
function lerpColor(colorA, colorB, t) {
  return rgbToString({
    r: Math.round(colorA.r + (colorB.r - colorA.r) * t),
    g: Math.round(colorA.g + (colorB.g - colorA.g) * t),
    b: Math.round(colorA.b + (colorB.b - colorA.b) * t),
  })
}

self.onmessage = async (e) => {
  const {
    images,
    imageMimeTypes,
    audioPcmData,
    defaultPageDuration = 5,
    videoBitrate = DEFAULT_VIDEO_BITRATE,
    maxWidth = 1920,
    maxHeight = 1080,
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

    // Determine video dimensions from first valid image (capped to requested max)
    let videoWidth = Math.min(1920, maxWidth)
    let videoHeight = Math.min(1080, maxHeight)
    let firstBitmap = null

    if (firstValidIdx >= 0) {
      try {
        firstBitmap = await createImageBitmap(
          new Blob([images[firstValidIdx]], { type: imageMimeTypes[firstValidIdx] || 'image/png' }),
        )
        let w = firstBitmap.width
        let h = firstBitmap.height

        // Scale down if exceeds max dimensions
        if (w > maxWidth || h > maxHeight) {
          const scale = Math.min(maxWidth / w, maxHeight / h)
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

    // Phase 3: Set up VideoEncoder with dynamic H.264 level selection
    // Level 4.0 (avc1.640028): up to ~8192 macroblocks (e.g. 2048×1024)
    // Level 5.0 (avc1.640032): up to 22080 macroblocks (e.g. 3840×2160)
    const totalMacroblocks = Math.ceil(videoWidth / 16) * Math.ceil(videoHeight / 16)
    const autoCodec = totalMacroblocks > 8192 ? 'avc1.640032' : 'avc1.640028'

    const baseConfig = {
      width: videoWidth,
      height: videoHeight,
      bitrate: videoBitrate,
      bitrateMode: 'variable',
      latencyMode: 'quality',
    }

    // Fallback chain: auto level → Level 4.0 → downscale to 1080p
    let videoConfig = null
    const codecCandidates = [autoCodec]
    if (autoCodec !== 'avc1.640028') codecCandidates.push('avc1.640028')

    for (const codec of codecCandidates) {
      const config = { ...baseConfig, codec }
      const support = await VideoEncoder.isConfigSupported(config)
      if (support.supported) {
        videoConfig = config
        break
      }
    }

    // Last resort: downscale to 1080p with Level 4.0
    if (!videoConfig && (videoWidth > 1920 || videoHeight > 1080)) {
      const scale = Math.min(1920 / videoWidth, 1080 / videoHeight)
      videoWidth = makeEven(Math.round(videoWidth * scale))
      videoHeight = makeEven(Math.round(videoHeight * scale))
      const fallbackConfig = {
        codec: 'avc1.640028',
        width: videoWidth,
        height: videoHeight,
        bitrate: videoBitrate,
        bitrateMode: 'variable',
        latencyMode: 'quality',
      }
      const support = await VideoEncoder.isConfigSupported(fallbackConfig)
      if (support.supported) {
        videoConfig = fallbackConfig
        console.info(`[MP4 Encoder] Downscaled to ${videoWidth}x${videoHeight} for codec compatibility`)
      }
    }

    if (!videoConfig) {
      throw new Error(`VideoEncoder config not supported: ${videoWidth}x${videoHeight} H.264`)
    }

    // Phase 4: Set up mp4-muxer (after videoConfig is finalized, dimensions may have changed)
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

    let encoderError = null
    // Phase 5: Set up VideoEncoder
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

    // Phase 6: Set up AudioEncoder
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

    // Phase 7: Encode each page with crossfade transitions
    const canvas = new OffscreenCanvas(videoWidth, videoHeight)
    const ctx = canvas.getContext('2d')

    /**
     * Draw a bitmap onto canvas with letterbox (fit-contain)
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

    // Background color tracking for letterbox areas (avoids white flash on dark themes)
    const defaultBgColor = { r: 255, g: 255, b: 255 }
    let lastValidBgColor = firstBitmap ? sampleBorderColor(firstBitmap) : defaultBgColor
    let cachedNextBgColor = null

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
      let currentBgColor = lastValidBgColor
      if (cachedNextBitmap) {
        bitmap = cachedNextBitmap
        cachedNextBitmap = null
        if (cachedNextBgColor) {
          currentBgColor = cachedNextBgColor
          cachedNextBgColor = null
        }
        if (images[i]) {
          lastValidBitmap = bitmap
          lastValidBgColor = currentBgColor
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
          currentBgColor = sampleBorderColor(bitmap)
          lastValidBgColor = currentBgColor
        } catch {
          bitmap = lastValidBitmap
        }
      } else {
        bitmap = lastValidBitmap
      }

      // Draw image on canvas with letterbox (fit-contain, adaptive background)
      ctx.fillStyle = rgbToString(currentBgColor)
      ctx.fillRect(0, 0, videoWidth, videoHeight)
      drawLetterbox(bitmap)

      // Encode static page as repeated frames for player compatibility
      // Many players don't handle single-frame-long-duration well
      const frameDurationUs = Math.round(1_000_000 / STATIC_PAGE_FPS)
      const totalFrames = Math.max(1, Math.ceil(effectiveDurationSec * STATIC_PAGE_FPS))
      const keyframeIntervalFrames = KEYFRAME_INTERVAL * STATIC_PAGE_FPS

      let pageTimestamp = currentTimestamp
      for (let f = 0; f < totalFrames; f++) {
        // Last frame may have shorter duration to match exact page duration
        const isLastFrame = f === totalFrames - 1
        const remainingUs = effectiveDurationUs - f * frameDurationUs
        const thisFrameDuration = isLastFrame ? Math.max(1, remainingUs) : frameDurationUs

        const frame = new VideoFrame(canvas, {
          timestamp: pageTimestamp,
          duration: thisFrameDuration,
        })

        // Keyframe at start of page and every KEYFRAME_INTERVAL seconds
        const isKeyframe = f === 0 || f % keyframeIntervalFrames === 0
        videoEncoder.encode(frame, { keyFrame: isKeyframe })
        frame.close()

        pageTimestamp += thisFrameDuration

        // Check for encoder errors periodically
        if (encoderError) {
          throw encoderError
        }
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

        // Sample next page's border color for background interpolation
        let nextBgColor = lastValidBgColor
        if (nextBitmap) {
          try {
            nextBgColor = sampleBorderColor(nextBitmap)
          } catch {
            // keep lastValidBgColor
          }
          cachedNextBgColor = nextBgColor
        }

        // Encode crossfade transition frames with silence audio
        const frameDurationUs = Math.round(TRANSITION_DURATION_US / TRANSITION_FRAMES)
        const transitionStartTimestamp = currentTimestamp

        for (let f = 0; f < TRANSITION_FRAMES; f++) {
          const alpha = (f + 1) / TRANSITION_FRAMES // 1/12 → 12/12

          // Interpolate background color between current and next page
          ctx.fillStyle = lerpColor(currentBgColor, nextBgColor, alpha)
          ctx.fillRect(0, 0, videoWidth, videoHeight)

          // Fixed compositing: draw outgoing page at full opacity (covers background),
          // then overlay incoming page at alpha. Result: img2*α + img1*(1-α)
          // This eliminates white bleed from source-over compositing math.
          drawLetterbox(bitmap, 1)
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

    // Phase 8: Flush and finalize
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
