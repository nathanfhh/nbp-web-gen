import { ref } from 'vue'
import { useOPFS } from './useOPFS'
import { formatFileSize } from './useImageCompression'

/**
 * Video Storage Composable
 *
 * Handles storing videos and thumbnails in OPFS.
 * Videos are stored as-is (no compression needed).
 * Thumbnails are extracted from the first frame.
 *
 * Directory structure:
 *   /videos/{historyId}/video.mp4
 *   /videos/{historyId}/thumbnail.webp
 */
export function useVideoStorage() {
  const opfs = useOPFS()
  const isProcessing = ref(false)
  const error = ref(null)

  // Cache for loaded video URLs
  const urlCache = new Map()

  /**
   * Extract thumbnail from video blob
   * Uses video element + canvas to capture first frame
   * @param {Blob} videoBlob - Video blob
   * @param {Object} options - Thumbnail options
   * @returns {Promise<{thumbnail: string, width: number, height: number}>}
   */
  const extractThumbnail = async (videoBlob, options = {}) => {
    const { maxWidth = 320, maxHeight = 180, quality = 0.8 } = options

    return new Promise((resolve, reject) => {
      const video = document.createElement('video')
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')

      video.preload = 'auto' // Need 'auto' to load actual video frames
      video.muted = true
      video.playsInline = true

      let resolved = false
      const cleanup = () => {
        URL.revokeObjectURL(video.src)
        video.remove()
      }

      const captureFrame = () => {
        if (resolved) return
        resolved = true

        try {
          // Calculate thumbnail dimensions
          let width = video.videoWidth
          let height = video.videoHeight

          if (width === 0 || height === 0) {
            cleanup()
            reject(new Error('Video dimensions not available'))
            return
          }

          if (width > maxWidth) {
            height = (height * maxWidth) / width
            width = maxWidth
          }
          if (height > maxHeight) {
            width = (width * maxHeight) / height
            height = maxHeight
          }

          canvas.width = width
          canvas.height = height

          // Draw video frame to canvas
          ctx.drawImage(video, 0, 0, width, height)

          // Convert to WebP
          const thumbnail = canvas.toDataURL('image/webp', quality)

          cleanup()

          resolve({
            thumbnail,
            width: video.videoWidth,
            height: video.videoHeight,
          })
        } catch (err) {
          cleanup()
          reject(err)
        }
      }

      // Use canplaythrough for better reliability - video has enough data to play
      video.oncanplaythrough = () => {
        // Seek to a small offset to ensure we get a frame (0 might not trigger onseeked)
        video.currentTime = 0.1
      }

      video.onseeked = captureFrame

      // Fallback: if video is already loaded, capture immediately
      video.onloadeddata = () => {
        // Give a small delay then check if we need to capture
        setTimeout(() => {
          if (!resolved && video.readyState >= 2) {
            captureFrame()
          }
        }, 500)
      }

      video.onerror = () => {
        if (resolved) return
        resolved = true
        cleanup()
        reject(new Error('Failed to load video for thumbnail extraction'))
      }

      // Timeout fallback
      setTimeout(() => {
        if (!resolved) {
          resolved = true
          cleanup()
          reject(new Error('Thumbnail extraction timeout'))
        }
      }, 10000)

      // Create object URL and load video
      video.src = URL.createObjectURL(videoBlob)
      video.load()
    })
  }

  /**
   * Save generated video to OPFS with thumbnail
   * @param {number} historyId - History record ID
   * @param {Object} video - { blob: Blob, mimeType: string }
   * @param {Object} options - Options
   * @returns {Promise<Object>} Video metadata for IndexedDB
   */
  const saveGeneratedVideo = async (historyId, video, _options = {}) => {
    isProcessing.value = true
    error.value = null

    try {
      // Ensure OPFS is initialized
      await opfs.initOPFS()

      // Create directory for this history record
      const dirPath = `videos/${historyId}`
      await opfs.getOrCreateDirectory(dirPath)

      // Save video file
      const videoPath = `/${dirPath}/video.mp4`
      await opfs.writeFile(videoPath, video.blob)

      // Extract and save thumbnail
      let thumbnailData = null
      let videoWidth = 0
      let videoHeight = 0

      try {
        const thumbResult = await extractThumbnail(video.blob)
        thumbnailData = thumbResult.thumbnail
        videoWidth = thumbResult.width
        videoHeight = thumbResult.height

        // Save thumbnail as webp file
        const thumbnailBlob = await fetch(thumbnailData).then((r) => r.blob())
        await opfs.writeFile(`/${dirPath}/thumbnail.webp`, thumbnailBlob)
      } catch (err) {
        console.warn('Failed to extract thumbnail:', err)
        // Continue without thumbnail
      }

      // Return metadata
      return {
        opfsPath: videoPath,
        thumbnailPath: `/${dirPath}/thumbnail.webp`,
        size: video.blob.size,
        mimeType: 'video/mp4',
        width: videoWidth,
        height: videoHeight,
        thumbnail: thumbnailData,
      }
    } catch (err) {
      error.value = err
      console.error('Failed to save video:', err)
      throw err
    } finally {
      isProcessing.value = false
    }
  }

  /**
   * Load video from OPFS as Object URL
   * @param {string} opfsPath - OPFS file path
   * @returns {Promise<string|null>} Object URL or null
   */
  const loadVideo = async (opfsPath) => {
    // Check cache first
    if (urlCache.has(opfsPath)) {
      return urlCache.get(opfsPath)
    }

    const url = await opfs.getFileURL(opfsPath)
    if (url) {
      urlCache.set(opfsPath, url)
    }
    return url
  }

  /**
   * Load video from OPFS as Blob
   * @param {string} opfsPath - OPFS file path
   * @returns {Promise<Blob|null>}
   */
  const loadVideoBlob = async (opfsPath) => {
    return opfs.readFile(opfsPath)
  }

  /**
   * Load thumbnail for a video history record
   * @param {string} thumbnailPath - Thumbnail OPFS path
   * @returns {Promise<string|null>} Object URL or null
   */
  const loadThumbnail = async (thumbnailPath) => {
    if (urlCache.has(thumbnailPath)) {
      return urlCache.get(thumbnailPath)
    }

    const url = await opfs.getFileURL(thumbnailPath)
    if (url) {
      urlCache.set(thumbnailPath, url)
    }
    return url
  }

  /**
   * Load video metadata for a history record
   * @param {Object} historyRecord - History record with video object
   * @returns {Promise<Object>} Video with loaded URLs
   */
  const loadHistoryVideo = async (historyRecord) => {
    if (!historyRecord.video) {
      return null
    }

    const videoUrl = await loadVideo(historyRecord.video.opfsPath)
    const thumbnailUrl = historyRecord.video.thumbnailPath
      ? await loadThumbnail(historyRecord.video.thumbnailPath)
      : null

    return {
      ...historyRecord.video,
      url: videoUrl,
      thumbnailUrl,
    }
  }

  /**
   * Delete video for a history record
   * @param {number} historyId - History record ID
   * @returns {Promise<boolean>}
   */
  const deleteHistoryVideo = async (historyId) => {
    try {
      const dirPath = `videos/${historyId}`

      // Clear cached URLs for this history
      for (const [path, url] of urlCache.entries()) {
        if (path.startsWith(`/${dirPath}/`)) {
          URL.revokeObjectURL(url)
          urlCache.delete(path)
        }
      }

      // Delete directory
      await opfs.deleteDirectory(dirPath, true)
      return true
    } catch (err) {
      console.error('Failed to delete video:', err)
      return false
    }
  }

  /**
   * Delete all stored videos
   * @returns {Promise<boolean>}
   */
  const deleteAllVideos = async () => {
    try {
      // Revoke all cached URLs
      for (const url of urlCache.values()) {
        URL.revokeObjectURL(url)
      }
      urlCache.clear()

      // Delete entire videos directory
      await opfs.deleteDirectory('videos', true)
      return true
    } catch (err) {
      console.error('Failed to delete all videos:', err)
      return false
    }
  }

  /**
   * Get total video storage usage
   * @returns {Promise<number>} Size in bytes
   */
  const getStorageUsage = async () => {
    return opfs.getStorageUsage('videos')
  }

  /**
   * Get formatted storage usage
   * @returns {Promise<string>} Formatted size string
   */
  const getFormattedStorageUsage = async () => {
    const bytes = await getStorageUsage()
    return formatFileSize(bytes)
  }

  /**
   * Check if video exists for a history record
   * @param {number} historyId - History record ID
   * @returns {Promise<boolean>}
   */
  const hasStoredVideo = async (historyId) => {
    const dirPath = `videos/${historyId}`
    const dir = await opfs.getDirectory(dirPath)
    return dir !== null
  }

  /**
   * Clean up cached URLs (call when component unmounts)
   */
  const cleanupCache = () => {
    for (const url of urlCache.values()) {
      URL.revokeObjectURL(url)
    }
    urlCache.clear()
  }

  return {
    // State
    isProcessing,
    error,

    // Methods
    saveGeneratedVideo,
    loadVideo,
    loadVideoBlob,
    loadThumbnail,
    loadHistoryVideo,
    deleteHistoryVideo,
    deleteAllVideos,
    getStorageUsage,
    getFormattedStorageUsage,
    hasStoredVideo,
    cleanupCache,
    extractThumbnail,
  }
}
