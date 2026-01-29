import { ref } from 'vue'
import { useIndexedDB } from './useIndexedDB'
import { useImageStorage } from './useImageStorage'
import { useVideoStorage } from './useVideoStorage'
import { useAudioStorage } from './useAudioStorage'
import { useConversationStorage } from './useConversationStorage'
import { useOPFS } from './useOPFS'
import { generateUUID } from './useUUID'
import { generateThumbnailFromBlob } from './useImageCompression'

const EXPORT_VERSION = 4 // Bumped for agent mode conversation support

export function useHistoryTransfer() {
  const indexedDB = useIndexedDB()
  const imageStorage = useImageStorage()
  const videoStorage = useVideoStorage()
  const audioStorage = useAudioStorage()
  const conversationStorage = useConversationStorage()
  const opfs = useOPFS()

  const isExporting = ref(false)
  const isImporting = ref(false)
  const progress = ref({ current: 0, total: 0, phase: '' })
  const importResult = ref(null)

  /**
   * Export history records to JSON file
   * @param {Array<number>|null} selectedIds - Optional array of record IDs to export (null = all)
   * @returns {Promise<{success: boolean, count: number}>}
   */
  const exportHistory = async (selectedIds = null) => {
    isExporting.value = true
    progress.value = { current: 0, total: 0, phase: 'preparing' }

    try {
      let records
      if (selectedIds && selectedIds.length > 0) {
        records = await indexedDB.getHistoryByIds(selectedIds)
      } else {
        records = await indexedDB.getAllHistory()
      }
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
                // Preserve pageNumber for slides mode
                ...(img.pageNumber !== undefined && { pageNumber: img.pageNumber }),
                width: img.width,
                height: img.height,
                data: base64,
              })
            }
          }
        }

        // Load video and convert to base64
        if (record.video && record.video.opfsPath) {
          const videoBlob = await videoStorage.loadVideoBlob(record.video.opfsPath)
          if (videoBlob) {
            const arrayBuffer = await videoBlob.arrayBuffer()
            const bytes = new Uint8Array(arrayBuffer)
            let binary = ''
            for (let j = 0; j < bytes.length; j++) {
              binary += String.fromCharCode(bytes[j])
            }
            const videoBase64 = btoa(binary)

            exportRecord.video = {
              width: record.video.width,
              height: record.video.height,
              size: record.video.size,
              mimeType: record.video.mimeType || 'video/mp4',
              data: videoBase64,
            }
          }
        }

        // Load narration data (scripts + audio)
        if (record.narration) {
          exportRecord.narration = {
            globalStyleDirective: record.narration.globalStyleDirective,
            scripts: record.narration.scripts,
            settings: record.narration.settings,
            audio: [],
          }

          if (record.narration.audio?.length > 0) {
            for (const audioMeta of record.narration.audio) {
              const blob = await audioStorage.loadAudioBlob(audioMeta.opfsPath)
              if (blob) {
                const arrayBuffer = await blob.arrayBuffer()
                const bytes = new Uint8Array(arrayBuffer)
                let binary = ''
                for (let j = 0; j < bytes.length; j++) {
                  binary += String.fromCharCode(bytes[j])
                }
                exportRecord.narration.audio.push({
                  pageIndex: audioMeta.pageIndex,
                  mimeType: audioMeta.mimeType,
                  size: audioMeta.size,
                  data: btoa(binary),
                })
              }
            }
          }
        }

        // Load agent conversation from OPFS (agent mode only)
        if (record.mode === 'agent') {
          exportRecord.messageCount = record.messageCount
          exportRecord.userMessageCount = record.userMessageCount
          exportRecord.thumbnail = record.thumbnail

          // Load conversation from OPFS
          const opfsPath = `/conversations/${record.id}/conversation.json`
          const conversation = await conversationStorage.loadConversation(opfsPath)
          if (conversation) {
            // Restore image data from OPFS into conversation for export
            for (const msg of conversation) {
              if (!msg.parts) continue
              for (const part of msg.parts) {
                if (part.dataStoredExternally && part.imageIndex !== undefined) {
                  try {
                    const imagePath = `/images/${record.id}/${part.imageIndex}.webp`
                    const base64 = await imageStorage.getImageBase64(imagePath)
                    if (base64) {
                      part.data = base64
                      part.mimeType = 'image/webp'
                      delete part.dataStoredExternally
                      delete part.imageIndex
                    }
                  } catch (err) {
                    console.warn('[Export] Failed to load image for conversation:', err)
                  }
                }
              }
            }
            exportRecord.conversation = conversation
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
            // Agent mode specific fields
            ...(record.mode === 'agent' && {
              messageCount: record.messageCount,
              userMessageCount: record.userMessageCount,
              thumbnail: record.thumbnail,
            }),
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
                // Restore pageNumber for slides mode
                ...(img.pageNumber !== undefined && { pageNumber: img.pageNumber }),
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

          // Save video to OPFS
          if (record.video && record.video.data) {
            const videoDirPath = `videos/${historyId}`
            const videoPath = `/${videoDirPath}/video.mp4`

            // base64 to Blob
            const binaryString = atob(record.video.data)
            const bytes = new Uint8Array(binaryString.length)
            for (let j = 0; j < binaryString.length; j++) {
              bytes[j] = binaryString.charCodeAt(j)
            }
            const videoBlob = new Blob([bytes], { type: record.video.mimeType || 'video/mp4' })

            // Create directory and save video
            await opfs.getOrCreateDirectory(videoDirPath)
            await opfs.writeFile(videoPath, videoBlob)

            // Extract thumbnail
            let thumbnailData = null
            try {
              const thumbResult = await videoStorage.extractThumbnail(videoBlob)
              thumbnailData = thumbResult.thumbnail
            } catch (thumbErr) {
              console.warn('Failed to extract video thumbnail:', thumbErr)
            }

            // Update history record with video metadata
            await indexedDB.updateHistoryVideo(historyId, {
              opfsPath: videoPath,
              size: videoBlob.size,
              mimeType: record.video.mimeType || 'video/mp4',
              width: record.video.width,
              height: record.video.height,
              thumbnail: thumbnailData,
            })
          }

          // Save narration to IndexedDB/OPFS
          if (record.narration) {
            const narration = {
              globalStyleDirective: record.narration.globalStyleDirective || '',
              scripts: record.narration.scripts || [],
              settings: record.narration.settings || {},
              audio: [],
            }

            if (record.narration.audio?.length > 0) {
              for (const audioEntry of record.narration.audio) {
                if (!audioEntry.data) continue
                const binaryString = atob(audioEntry.data)
                const bytes = new Uint8Array(binaryString.length)
                for (let j = 0; j < binaryString.length; j++) {
                  bytes[j] = binaryString.charCodeAt(j)
                }
                const ext = audioEntry.mimeType === 'audio/wav' ? 'wav' : 'mp3'
                const blob = new Blob([bytes], { type: audioEntry.mimeType || 'audio/mpeg' })
                const opfsPath = `/audio/${historyId}/${audioEntry.pageIndex}.${ext}`

                // writeFile internally creates directories, no need for separate getOrCreateDirectory
                await opfs.writeFile(opfsPath, blob)

                narration.audio.push({
                  pageIndex: audioEntry.pageIndex,
                  opfsPath,
                  size: blob.size,
                  mimeType: audioEntry.mimeType || 'audio/mpeg',
                })
              }
            }

            await indexedDB.updateHistoryNarration(historyId, narration)
          }

          // Save agent conversation to OPFS
          if (record.mode === 'agent' && record.conversation) {
            // Extract images from conversation and save to OPFS first
            const agentImages = []
            for (const msg of record.conversation) {
              if (!msg.parts) continue
              for (const part of msg.parts) {
                if ((part.type === 'image' || part.type === 'generatedImage') && part.data) {
                  agentImages.push({
                    data: part.data,
                    mimeType: part.mimeType || 'image/webp',
                  })
                }
              }
            }

            // Save images to OPFS if any
            // Use fast import path (skips re-compression, parallel processing)
            if (agentImages.length > 0) {
              const metadata = await imageStorage.saveImagesForImport(historyId, agentImages)
              await indexedDB.updateHistoryImages(historyId, metadata)
            }

            // Save conversation (will strip image data and add imageIndex)
            await conversationStorage.saveConversation(historyId, record.conversation)
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

  return {
    isExporting,
    isImporting,
    progress,
    importResult,
    exportHistory,
    importHistory,
  }
}
