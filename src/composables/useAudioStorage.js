import { ref } from 'vue'
import { useOPFS } from './useOPFS'
import { formatFileSize } from './useImageCompression'
import { getAudioExtension } from '@/utils/audioEncoder'

/**
 * Audio Storage Composable
 *
 * Handles storing narration audio files in OPFS.
 * Audio files are MP3-encoded for storage efficiency.
 *
 * Directory structure:
 *   /audio/{historyId}/0.mp3
 *   /audio/{historyId}/1.mp3
 *   ...
 */
export function useAudioStorage() {
  const opfs = useOPFS()
  const isProcessing = ref(false)
  const error = ref(null)

  // Cache for loaded audio URLs
  const urlCache = new Map()

  /**
   * Save generated audio for a single page to OPFS
   * @param {number} historyId - History record ID
   * @param {number} pageIndex - Page index (0-based)
   * @param {Blob} audioBlob - MP3 audio blob
   * @returns {Promise<Object>} Audio metadata for IndexedDB
   */
  const saveGeneratedAudio = async (historyId, pageIndex, audioBlob) => {
    isProcessing.value = true
    error.value = null

    try {
      await opfs.initOPFS()

      const dirPath = `audio/${historyId}`
      await opfs.getOrCreateDirectory(dirPath)

      const ext = getAudioExtension(audioBlob.type)
      const filePath = `/${dirPath}/${pageIndex}.${ext}`

      // Clear cached URL for this path before overwriting (handles regeneration)
      if (urlCache.has(filePath)) {
        URL.revokeObjectURL(urlCache.get(filePath))
        urlCache.delete(filePath)
      }

      await opfs.writeFile(filePath, audioBlob)

      return {
        pageIndex,
        opfsPath: filePath,
        size: audioBlob.size,
        mimeType: audioBlob.type || 'audio/mpeg',
      }
    } catch (err) {
      error.value = err
      console.error('Failed to save audio:', err)
      throw err
    } finally {
      isProcessing.value = false
    }
  }

  /**
   * Load audio from OPFS as Object URL (cached)
   * @param {string} opfsPath - OPFS file path
   * @returns {Promise<string|null>} Object URL or null
   */
  const loadAudio = async (opfsPath) => {
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
   * Load audio from OPFS as Blob
   * @param {string} opfsPath - OPFS file path
   * @returns {Promise<Blob|null>}
   */
  const loadAudioBlob = async (opfsPath) => {
    return opfs.readFile(opfsPath)
  }

  /**
   * Delete all audio files for a history record
   * @param {number} historyId - History record ID
   * @returns {Promise<boolean>}
   */
  const deleteHistoryAudio = async (historyId) => {
    try {
      const dirPath = `audio/${historyId}`

      // Clear cached URLs for this history
      for (const [path, url] of urlCache.entries()) {
        if (path.startsWith(`/${dirPath}/`)) {
          URL.revokeObjectURL(url)
          urlCache.delete(path)
        }
      }

      await opfs.deleteDirectory(dirPath, true)
      return true
    } catch (err) {
      console.error('Failed to delete audio:', err)
      return false
    }
  }

  /**
   * Delete all stored audio
   * @returns {Promise<boolean>}
   */
  const deleteAllAudio = async () => {
    try {
      for (const url of urlCache.values()) {
        URL.revokeObjectURL(url)
      }
      urlCache.clear()

      await opfs.deleteDirectory('audio', true)
      return true
    } catch (err) {
      console.error('Failed to delete all audio:', err)
      return false
    }
  }

  /**
   * Get total audio storage usage
   * @returns {Promise<number>} Size in bytes
   */
  const getStorageUsage = async () => {
    return opfs.getStorageUsage('audio')
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
   * Check if audio exists for a history record
   * @param {number} historyId - History record ID
   * @returns {Promise<boolean>}
   */
  const hasStoredAudio = async (historyId) => {
    const dirPath = `audio/${historyId}`
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
    isProcessing,
    error,

    saveGeneratedAudio,
    loadAudio,
    loadAudioBlob,
    deleteHistoryAudio,
    deleteAllAudio,
    getStorageUsage,
    getFormattedStorageUsage,
    hasStoredAudio,
    cleanupCache,
  }
}
