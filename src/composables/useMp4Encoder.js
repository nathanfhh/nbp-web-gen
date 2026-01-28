import { ref } from 'vue'

/**
 * MP4 Encoder Composable
 * Uses Web Worker with WebCodecs + mp4-muxer to encode slide images + audio into MP4.
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
   * @param {(string|null)[]} options.audioMimeTypes - MIME types for audio
   * @param {number} [options.defaultPageDuration=5] - Duration for pages without audio
   * @returns {Promise<ArrayBuffer>} MP4 data
   */
  const encodeMp4 = async (options) => {
    isEncoding.value = true
    error.value = null
    progress.value = { current: 0, total: 0, phase: '' }

    try {
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

        // Collect transferable ArrayBuffers
        const transferables = []
        for (const img of options.images) {
          if (img) transferables.push(img)
        }
        for (const audio of options.audioBuffers) {
          if (audio) transferables.push(audio)
        }

        worker.postMessage({
          images: options.images,
          imageMimeTypes: options.imageMimeTypes,
          audioBuffers: options.audioBuffers,
          audioMimeTypes: options.audioMimeTypes,
          defaultPageDuration: options.defaultPageDuration ?? 5,
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
