import { ref } from 'vue'
import { useIndexedDB } from './useIndexedDB'
import { useCharacterStorage } from './useCharacterStorage'
import { generateUUID } from './useUUID'

const EXPORT_VERSION = 1

export function useCharacterTransfer() {
  const {
    getCharacters,
    getCharacterById,
    addCharacter,
    getCharacterByName,
  } = useIndexedDB()
  const { loadCharacterImageWithFallback, saveCharacterImage } = useCharacterStorage()

  const isExporting = ref(false)
  const isImporting = ref(false)
  const progress = ref({ current: 0, total: 0, phase: '' })
  const importResult = ref(null)

  /**
   * Export characters to JSON file
   * @param {Array<number>|null} selectedIds - Optional array of character IDs to export (null = all)
   * @returns {Promise<{success: boolean, count: number}>}
   */
  const exportCharacters = async (selectedIds = null) => {
    isExporting.value = true
    progress.value = { current: 0, total: 0, phase: 'preparing' }

    try {
      let characters
      if (selectedIds && selectedIds.length > 0) {
        characters = []
        for (const id of selectedIds) {
          const char = await getCharacterById(id)
          if (char) characters.push(char)
        }
      } else {
        characters = await getCharacters(1000)
      }
      progress.value = { current: 0, total: characters.length, phase: 'exporting' }

      const characterExports = []

      for (let i = 0; i < characters.length; i++) {
        const char = characters[i]
        progress.value.current = i + 1

        // Load imageData from OPFS with fallback to legacy IndexedDB data
        const imageData = await loadCharacterImageWithFallback(char.id, char.imageData)

        characterExports.push({
          uuid: char.uuid || generateUUID(),
          name: char.name,
          description: char.description,
          physicalTraits: char.physicalTraits,
          clothing: char.clothing,
          accessories: char.accessories,
          distinctiveFeatures: char.distinctiveFeatures,
          imageData, // Loaded from OPFS
          thumbnail: char.thumbnail,
          createdAt: char.createdAt,
        })
      }

      const exportData = {
        version: EXPORT_VERSION,
        type: 'characters',
        exportedAt: Date.now(),
        appVersion: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'unknown',
        characters: characterExports,
      }

      // Download JSON file
      const blob = new Blob([JSON.stringify(exportData)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `nbp-characters-${Date.now()}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      return { success: true, count: characterExports.length }
    } catch (err) {
      console.error('Export characters failed:', err)
      return { success: false, count: 0, error: err.message }
    } finally {
      isExporting.value = false
      progress.value = { current: 0, total: 0, phase: '' }
    }
  }

  /**
   * Export a single character
   * @param {number} characterId - Character ID to export
   * @returns {Promise<{success: boolean}>}
   */
  const exportSingleCharacter = async (characterId) => {
    return exportCharacters([characterId])
  }

  /**
   * Import characters from JSON file
   * @param {File} file - JSON file to import
   * @returns {Promise<{imported: number, skipped: number, failed: number, total: number}>}
   */
  const importCharacters = async (file) => {
    isImporting.value = true
    importResult.value = null
    progress.value = { current: 0, total: 0, phase: 'reading' }

    try {
      // Read JSON file
      const text = await file.text()
      const data = JSON.parse(text)

      // Validate format
      if (!data.version || data.type !== 'characters' || !Array.isArray(data.characters)) {
        throw new Error('Invalid character export file format')
      }

      const characters = data.characters
      progress.value = { current: 0, total: characters.length, phase: 'importing' }

      let imported = 0
      let skipped = 0
      let failed = 0

      for (let i = 0; i < characters.length; i++) {
        const char = characters[i]
        progress.value.current = i + 1

        try {
          // Check if character with same name already exists
          const existing = await getCharacterByName(char.name)
          if (existing) {
            skipped++
            continue
          }

          // Create new character record (metadata only, no imageData)
          const newCharacterId = await addCharacter({
            uuid: char.uuid || generateUUID(),
            name: char.name,
            description: char.description,
            physicalTraits: char.physicalTraits,
            clothing: char.clothing,
            accessories: char.accessories || [],
            distinctiveFeatures: char.distinctiveFeatures || [],
            thumbnail: char.thumbnail,
            // imageData is stored in OPFS, not IndexedDB
          })

          // Save imageData to OPFS
          if (char.imageData) {
            await saveCharacterImage(newCharacterId, char.imageData)
          }

          imported++
        } catch (err) {
          console.error('Failed to import character:', err)
          failed++
        }
      }

      importResult.value = { imported, skipped, failed, total: characters.length }
      return importResult.value
    } catch (err) {
      console.error('Import characters failed:', err)
      importResult.value = { imported: 0, skipped: 0, failed: 0, total: 0, error: err.message }
      throw err
    } finally {
      isImporting.value = false
      progress.value = { current: 0, total: 0, phase: '' }
    }
  }

  /**
   * Check if file is a character export file
   * @param {File} file - File to check
   * @returns {Promise<boolean>}
   */
  const isCharacterExportFile = async (file) => {
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      return data.type === 'characters' && Array.isArray(data.characters)
    } catch {
      return false
    }
  }

  return {
    isExporting,
    isImporting,
    progress,
    importResult,
    exportCharacters,
    exportSingleCharacter,
    importCharacters,
    isCharacterExportFile,
  }
}
