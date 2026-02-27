import { ref } from 'vue'
import { useOPFS } from './useOPFS'

/**
 * Character Storage Composable
 *
 * Handles storing character images in OPFS (Origin Private File System).
 * Images are stored in WebP format for optimal compression.
 *
 * Directory structure:
 *   /characters/{characterId}/image.webp
 *
 * Note: Only the full-resolution image is stored in OPFS.
 * Thumbnails remain in IndexedDB for quick carousel display.
 */
export function useCharacterStorage() {
  const opfs = useOPFS()
  const isProcessing = ref(false)
  const error = ref(null)

  // Cache for loaded image URLs (to avoid reloading)
  const urlCache = new Map()

  // Supported image extensions (ordered by priority)
  const CHARACTER_IMAGE_EXTENSIONS = ['webp', 'png', 'jpg', 'jpeg']

  /**
   * Resolve the actual image path for a character (tries multiple extensions)
   * @param {number} characterId
   * @returns {Promise<string|null>}
   */
  const resolveCharacterImagePath = async (characterId) => {
    const basePath = `/characters/${characterId}/image`
    for (const ext of CHARACTER_IMAGE_EXTENSIONS) {
      const candidate = `${basePath}.${ext}`
      if (await opfs.fileExists(candidate)) return candidate
    }
    return null
  }

  /**
   * Save character image to OPFS
   * @param {number} characterId - Character ID
   * @param {string} imageData - Base64 encoded image data (without data URL prefix)
   * @param {string} mimeType - Image MIME type (default: image/png)
   * @returns {Promise<{opfsPath: string}>} - Path where image is stored
   */
  const saveCharacterImage = async (characterId, imageData, mimeType = 'image/png') => {
    if (!imageData) {
      throw new Error('No image data provided')
    }

    isProcessing.value = true
    error.value = null

    try {
      // Ensure OPFS is initialized
      await opfs.initOPFS()

      // Create directory for this character
      const dirPath = `characters/${characterId}`
      await opfs.getOrCreateDirectory(dirPath)

      // Convert base64 to blob
      const binaryString = atob(imageData)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      const blob = new Blob([bytes], { type: mimeType })

      // Derive file extension from mimeType
      const extMap = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' }
      const ext = extMap[mimeType] || mimeType.split('/')[1] || 'webp'
      const opfsPath = `/${dirPath}/image.${ext}`
      await opfs.writeFile(opfsPath, blob)

      return { opfsPath }
    } catch (err) {
      error.value = err
      console.error('Failed to save character image:', err)
      throw err
    } finally {
      isProcessing.value = false
    }
  }

  /**
   * Load character image from OPFS as base64
   * @param {number} characterId - Character ID
   * @returns {Promise<string|null>} - Base64 image data or null if not found
   */
  const loadCharacterImageData = async (characterId) => {
    try {
      const opfsPath = await resolveCharacterImagePath(characterId)
      if (!opfsPath) return null
      const blob = await opfs.readFile(opfsPath)

      if (!blob) return null

      // Convert blob to base64
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => {
          const base64 = reader.result.split(',')[1]
          resolve(base64)
        }
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
    } catch (err) {
      console.error('Failed to load character image:', err)
      return null
    }
  }

  /**
   * Load character image with fallback to legacy IndexedDB data
   * This handles backward compatibility during migration period
   * @param {number} characterId - Character ID
   * @param {string|null} legacyImageData - Legacy imageData from IndexedDB (if any)
   * @returns {Promise<string|null>} - Base64 image data or null
   */
  const loadCharacterImageWithFallback = async (characterId, legacyImageData = null) => {
    // Try OPFS first (new storage)
    const opfsData = await loadCharacterImageData(characterId)
    if (opfsData) return opfsData

    // Fallback to legacy IndexedDB data
    if (legacyImageData) {
      return legacyImageData
    }

    return null
  }

  /**
   * Load character image from OPFS as Object URL
   * @param {number} characterId - Character ID
   * @returns {Promise<string|null>} - Object URL or null if not found
   */
  const loadCharacterImageURL = async (characterId) => {
    const cacheKey = `character-${characterId}`

    // Check cache first
    if (urlCache.has(cacheKey)) {
      return urlCache.get(cacheKey)
    }

    const opfsPath = await resolveCharacterImagePath(characterId)
    if (!opfsPath) return null
    const url = await opfs.getFileURL(opfsPath)

    if (url) {
      urlCache.set(cacheKey, url)
    }

    return url
  }

  /**
   * Delete character image from OPFS
   * @param {number} characterId - Character ID
   * @returns {Promise<boolean>}
   */
  const deleteCharacterImage = async (characterId) => {
    try {
      const cacheKey = `character-${characterId}`

      // Clear cached URL
      if (urlCache.has(cacheKey)) {
        URL.revokeObjectURL(urlCache.get(cacheKey))
        urlCache.delete(cacheKey)
      }

      // Delete directory
      const dirPath = `characters/${characterId}`
      await opfs.deleteDirectory(dirPath, true)

      return true
    } catch (err) {
      console.error('Failed to delete character image:', err)
      return false
    }
  }

  /**
   * Check if character image exists in OPFS
   * @param {number} characterId - Character ID
   * @returns {Promise<boolean>}
   */
  const hasCharacterImage = async (characterId) => {
    return (await resolveCharacterImagePath(characterId)) !== null
  }

  /**
   * Migrate a character's imageData from IndexedDB to OPFS
   * @param {number} characterId - Character ID
   * @param {string} imageData - Base64 image data from IndexedDB
   * @returns {Promise<boolean>} - True if migration successful
   */
  const migrateCharacterToOPFS = async (characterId, imageData) => {
    if (!imageData) {
      console.warn(`Character ${characterId} has no imageData to migrate`)
      return false
    }

    try {
      // Check if already migrated
      const exists = await hasCharacterImage(characterId)
      if (exists) {
        return true // Already migrated
      }

      // Save to OPFS
      await saveCharacterImage(characterId, imageData)
      return true
    } catch (err) {
      console.error(`Failed to migrate character ${characterId}:`, err)
      return false
    }
  }

  /**
   * Migrate all characters from IndexedDB to OPFS
   * This is called once on app init to migrate legacy data
   * @param {Object} params - Migration parameters
   * @param {Function} params.getAllCharacters - Function to get all characters from IndexedDB
   * @param {Function} params.updateCharacter - Function to update character in IndexedDB
   * @returns {Promise<{migrated: number, skipped: number, failed: number}>}
   */
  const migrateAllCharactersToOPFS = async ({ getAllCharacters, updateCharacter }) => {
    const result = { migrated: 0, skipped: 0, failed: 0 }

    try {
      // Get all characters
      const characters = await getAllCharacters()

      for (const character of characters) {
        // Skip if no imageData (already migrated or never had one)
        if (!character.imageData) {
          result.skipped++
          continue
        }

        // Check if already in OPFS
        const exists = await hasCharacterImage(character.id)
        if (exists) {
          // Already in OPFS, just remove from IndexedDB
          await updateCharacter(character.id, { imageData: undefined })
          result.skipped++
          continue
        }

        try {
          // Migrate to OPFS
          await saveCharacterImage(character.id, character.imageData)

          // Remove imageData from IndexedDB record
          // We use a direct update that explicitly removes the field
          await updateCharacter(character.id, { imageData: undefined })

          result.migrated++
          console.log(`Migrated character ${character.id} (${character.name}) to OPFS`)
        } catch (err) {
          console.error(`Failed to migrate character ${character.id}:`, err)
          result.failed++
        }
      }

      if (result.migrated > 0) {
        console.log(`Character migration complete: ${result.migrated} migrated, ${result.skipped} skipped, ${result.failed} failed`)
      }

      return result
    } catch (err) {
      console.error('Character migration failed:', err)
      throw err
    }
  }

  /**
   * Get total storage usage for characters
   * @returns {Promise<number>} Size in bytes
   */
  const getStorageUsage = async () => {
    return opfs.getStorageUsage('characters')
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
    saveCharacterImage,
    loadCharacterImageData,
    loadCharacterImageWithFallback,
    loadCharacterImageURL,
    deleteCharacterImage,
    hasCharacterImage,
    migrateCharacterToOPFS,
    migrateAllCharactersToOPFS,
    getStorageUsage,
    cleanupCache,
  }
}
