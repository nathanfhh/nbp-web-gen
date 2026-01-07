import { ref } from 'vue'
import { useIndexedDB } from './useIndexedDB'
import { useImageStorage } from './useImageStorage'
import { useOPFS } from './useOPFS'
import { generateUUID } from './useUUID'

const EXPORT_VERSION = 1

export function useHistoryTransfer() {
  const indexedDB = useIndexedDB()
  const imageStorage = useImageStorage()
  const opfs = useOPFS()

  const isExporting = ref(false)
  const isImporting = ref(false)
  const progress = ref({ current: 0, total: 0, phase: '' })
  const importResult = ref(null)

  /**
   * Export all history records to JSON file
   * @returns {Promise<{success: boolean, count: number}>}
   */
  const exportHistory = async () => {
    isExporting.value = true
    progress.value = { current: 0, total: 0, phase: 'preparing' }

    try {
      const records = await indexedDB.getAllHistory()
      progress.value = { current: 0, total: records.length, phase: 'exporting' }

      const exportRecords = []

      for (let i = 0; i < records.length; i++) {
        const record = records[i]
        progress.value.current = i + 1

        const exportRecord = {
          uuid: record.uuid || generateUUID(),
          timestamp: record.timestamp,
          prompt: record.prompt,
          mode: record.mode,
          options: record.options,
          status: record.status,
          thinkingText: record.thinkingText,
          error: record.error,
        }

        // Load images and convert to base64
        if (record.images && record.images.length > 0) {
          exportRecord.images = []
          for (const img of record.images) {
            const base64 = await imageStorage.getImageBase64(img.opfsPath)
            if (base64) {
              exportRecord.images.push({
                index: img.index,
                width: img.width,
                height: img.height,
                data: base64,
              })
            }
          }
        }

        exportRecords.push(exportRecord)
      }

      const exportData = {
        version: EXPORT_VERSION,
        exportedAt: Date.now(),
        appVersion: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'unknown',
        records: exportRecords,
      }

      // Download JSON file
      const blob = new Blob([JSON.stringify(exportData)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `nbp-history-${Date.now()}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      return { success: true, count: exportRecords.length }
    } catch (err) {
      console.error('Export failed:', err)
      return { success: false, count: 0, error: err.message }
    } finally {
      isExporting.value = false
      progress.value = { current: 0, total: 0, phase: '' }
    }
  }

  /**
   * Import history records from JSON file
   * @param {File} file - JSON file to import
   * @returns {Promise<{imported: number, skipped: number, failed: number, total: number}>}
   */
  const importHistory = async (file) => {
    isImporting.value = true
    importResult.value = null
    progress.value = { current: 0, total: 0, phase: 'reading' }

    try {
      // Read JSON file
      const text = await file.text()
      const data = JSON.parse(text)

      // Validate format
      if (!data.version || !Array.isArray(data.records)) {
        throw new Error('Invalid export file format')
      }

      const records = data.records
      progress.value = { current: 0, total: records.length, phase: 'importing' }

      let imported = 0
      let skipped = 0
      let failed = 0

      for (let i = 0; i < records.length; i++) {
        const record = records[i]
        progress.value.current = i + 1

        try {
          // Check if UUID already exists
          if (record.uuid && (await indexedDB.hasHistoryByUUID(record.uuid))) {
            skipped++
            continue
          }

          // Create new history record
          const historyRecord = {
            uuid: record.uuid || generateUUID(),
            timestamp: record.timestamp,
            prompt: record.prompt,
            mode: record.mode,
            options: record.options,
            status: record.status,
            thinkingText: record.thinkingText,
            error: record.error,
          }

          // Add to IndexedDB
          const historyId = await indexedDB.addHistoryWithUUID(historyRecord)

          // Save images to OPFS
          if (record.images && record.images.length > 0) {
            const imageMetadata = []

            for (const img of record.images) {
              const opfsPath = `/images/${historyId}/${img.index}.webp`

              // base64 to Blob
              const binaryString = atob(img.data)
              const bytes = new Uint8Array(binaryString.length)
              for (let j = 0; j < binaryString.length; j++) {
                bytes[j] = binaryString.charCodeAt(j)
              }
              const blob = new Blob([bytes], { type: 'image/webp' })

              await opfs.writeFile(opfsPath, blob)

              // Generate thumbnail
              const thumbnail = await generateThumbnailFromBlob(blob)

              imageMetadata.push({
                index: img.index,
                width: img.width,
                height: img.height,
                opfsPath,
                thumbnail,
                originalSize: blob.size,
                compressedSize: blob.size,
                originalFormat: 'image/webp',
                compressedFormat: 'image/webp',
              })
            }

            // Update history record with image metadata
            await indexedDB.updateHistoryImages(historyId, imageMetadata)
          }

          imported++
        } catch (err) {
          console.error('Failed to import record:', err)
          failed++
        }
      }

      importResult.value = { imported, skipped, failed, total: records.length }
      return importResult.value
    } catch (err) {
      console.error('Import failed:', err)
      importResult.value = { imported: 0, skipped: 0, failed: 0, total: 0, error: err.message }
      throw err
    } finally {
      isImporting.value = false
      progress.value = { current: 0, total: 0, phase: '' }
    }
  }

  /**
   * Generate thumbnail from Blob
   * @param {Blob} blob
   * @returns {Promise<string>} Base64 thumbnail (without data: prefix)
   */
  const generateThumbnailFromBlob = async (blob) => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(blob)

      img.onload = () => {
        URL.revokeObjectURL(url)
        const canvas = document.createElement('canvas')
        const maxSize = 64
        const ratio = Math.min(maxSize / img.width, maxSize / img.height)
        canvas.width = img.width * ratio
        canvas.height = img.height * ratio
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        const dataUrl = canvas.toDataURL('image/webp', 0.6)
        resolve(dataUrl.split(',')[1])
      }

      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('Failed to load image for thumbnail'))
      }

      img.src = url
    })
  }

  return {
    isExporting,
    isImporting,
    progress,
    importResult,
    exportHistory,
    importHistory,
  }
}
