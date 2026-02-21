import { ref } from 'vue'

const TARGET_SAMPLE_RATE = 48000

/**
 * Decode an audio ArrayBuffer to mono Float32 PCM at TARGET_SAMPLE_RATE
 * using the browser's native AudioContext (main thread, guaranteed reliable).
 *
 * AudioContext.decodeAudioData auto-resamples to the context's sample rate.
 */
async function decodeAudioToMonoPcm(audioCtx, arrayBuffer) {
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)

  if (audioBuffer.numberOfChannels === 1) {
    // getChannelData returns a Float32Array referencing the AudioBuffer's internal memory.
    // We must copy it because the AudioBuffer can be garbage collected.
    return new Float32Array(audioBuffer.getChannelData(0))
  }

  // Mix multi-channel to mono
  const length = audioBuffer.length
  const mono = new Float32Array(length)
  const numChannels = audioBuffer.numberOfChannels
  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = audioBuffer.getChannelData(ch)
    for (let i = 0; i < length; i++) {
      mono[i] += channelData[i]
    }
  }
  for (let i = 0; i < length; i++) {
    mono[i] /= numChannels
  }
  return mono
}

/**
 * MP4 Encoder Composable
 * Uses Web Worker with WebCodecs + mp4-muxer to encode slide images + audio into MP4.
 *
 * Audio decoding happens in the main thread (AudioContext) for maximum reliability,
 * then pre-decoded PCM data is transferred to the Worker for encoding.
 */
export function useMp4Encoder() {
  const isEncoding = ref(false)
  const error = ref(null)
  const progress = ref({ current: 0, total: 0, phase: '' })

  /**
   * Encode images and audio into an MP4 ArrayBuffer
   * @param {Object} options
   * @param {ArrayBuffer[]} options.images - Image data (may contain null)
   * @param {string[]} options.imageMimeTypes - MIME types for images
   * @param {(ArrayBuffer|null)[]} options.audioBuffers - Audio data (null = no audio)
   * @param {number} [options.defaultPageDuration=5] - Duration for pages without audio
   * @param {number} [options.videoBitrate=8000000] - Video bitrate in bps
   * @param {number} [options.maxWidth] - Max output video width
   * @param {number} [options.maxHeight] - Max output video height
   * @param {number} [options.playbackSpeed=1] - Narration speed multiplier (pitch-preserved)
   * @returns {Promise<ArrayBuffer>} MP4 data
   */
  const encodeMp4 = async (options) => {
    isEncoding.value = true
    error.value = null
    progress.value = { current: 0, total: 0, phase: '' }

    try {
      // Phase 0: Decode all audio in main thread using AudioContext
      // This is the most reliable way — OfflineAudioContext in Workers is unreliable.
      const audioPcmData = []
      let audioCtx = null

      try {
        audioCtx = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE })

        const playbackSpeed = options.playbackSpeed || 1
        const timeStretchFn = playbackSpeed !== 1
          ? (await import('@/utils/audioTimeStretch')).timeStretchPcm
          : null

        for (const buf of options.audioBuffers) {
          if (buf) {
            try {
              let pcm = await decodeAudioToMonoPcm(audioCtx, buf)
              if (timeStretchFn) {
                pcm = await timeStretchFn(pcm, playbackSpeed, TARGET_SAMPLE_RATE)
              }
              audioPcmData.push(pcm)
            } catch (e) {
              console.warn('Audio decode failed for a page:', e)
              audioPcmData.push(null)
            }
          } else {
            audioPcmData.push(null)
          }
        }
      } finally {
        if (audioCtx) {
          await audioCtx.close().catch(() => {})
        }
      }

      // Launch worker
      const { default: Mp4Worker } = await import('@/workers/mp4Encoder.worker.js?worker')
      const worker = new Mp4Worker()

      const result = await new Promise((resolve, reject) => {
        worker.onmessage = (e) => {
          const msg = e.data
          switch (msg.type) {
            case 'progress':
              progress.value = { current: msg.current, total: msg.total, phase: msg.phase }
              break
            case 'complete':
              worker.terminate()
              resolve(msg.data)
              break
            case 'error':
              worker.terminate()
              reject(new Error(msg.error))
              break
          }
        }
        worker.onerror = (err) => {
          worker.terminate()
          reject(err)
        }

        // Collect transferable buffers
        const transferables = []
        for (const img of options.images) {
          if (img) transferables.push(img)
        }
        for (const pcm of audioPcmData) {
          if (pcm) transferables.push(pcm.buffer)
        }

        worker.postMessage({
          images: options.images,
          imageMimeTypes: options.imageMimeTypes,
          audioPcmData,
          defaultPageDuration: options.defaultPageDuration ?? 5,
          videoBitrate: options.videoBitrate,
          maxWidth: options.maxWidth,
          maxHeight: options.maxHeight,
        }, transferables)
      })

      return result
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      isEncoding.value = false
    }
  }

  /**
   * Encode and trigger MP4 download
   * @param {Object} options - Same as encodeMp4
   * @param {string} [filename='video'] - Download filename (without extension)
   */
  const encodeAndDownload = async (options, filename = 'video') => {
    const mp4Buffer = await encodeMp4(options)

    let url = null
    let link = null

    try {
      const blob = new Blob([mp4Buffer], { type: 'video/mp4' })
      url = URL.createObjectURL(blob)

      link = document.createElement('a')
      link.href = url
      link.download = `${filename}.mp4`
      document.body.appendChild(link)
      link.click()
    } finally {
      if (link?.parentNode) {
        link.parentNode.removeChild(link)
      }
      if (url) {
        URL.revokeObjectURL(url)
      }
    }
  }

  return {
    isEncoding,
    error,
    progress,
    encodeMp4,
    encodeAndDownload,
  }
}
