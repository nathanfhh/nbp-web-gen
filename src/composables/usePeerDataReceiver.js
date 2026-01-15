import { ref } from 'vue'
import { generateUUID } from './useUUID'
import { generateThumbnailFromBlob } from './useImageCompression'
import {
  decodeMessage,
  encodeJsonMessage,
  formatBytes,
  parseBinaryPacket,
  parseChunkPacket,
  blobToBase64,
  MSG_TYPE_CHUNK,
} from './peerSyncUtils'

/**
 * Composable for peer-to-peer data receiving (receiver side)
 * Handles receiving history records and character data with binary protocol
 *
 * @param {Object} deps - Dependencies
 * @param {import('vue').Ref} deps.connection - PeerJS connection ref
 * @param {import('vue').Ref} deps.transferStats - Transfer statistics ref
 * @param {import('vue').Ref} deps.transferProgress - Transfer progress ref
 * @param {import('vue').Ref} deps.transferDirection - Transfer direction ref
 * @param {import('vue').Ref} deps.syncType - Sync type ref
 * @param {import('vue').Ref} deps.status - Connection status ref
 * @param {import('vue').Ref} deps.transferResult - Transfer result ref
 * @param {import('vue').Ref} deps.localConfirmed - Local confirmed ref
 * @param {import('vue').Ref} deps.remoteConfirmed - Remote confirmed ref
 * @param {import('vue').Ref} deps.pairingConfirmed - Pairing confirmed ref
 * @param {import('vue').Ref} deps.pendingAckResolve - Pending ACK resolver ref
 * @param {import('vue').Ref} deps.pendingRecordAckResolve - Pending record ACK resolver ref
 * @param {Function} deps.addDebug - Debug logging function
 * @param {Function} deps.startStatsTracking - Start stats tracking function
 * @param {Function} deps.stopStatsTracking - Stop stats tracking function
 * @param {Function} deps.closeConnection - Close connection function
 * @param {Function} deps.sendData - Send data function (for sender after pairing)
 * @param {Object} deps.indexedDB - IndexedDB composable
 * @param {Object} deps.opfs - OPFS composable
 * @param {Object} deps.characterStorage - Character storage composable for OPFS
 * @param {Object} deps.videoStorage - Video storage composable for thumbnail extraction
 */
export function usePeerDataReceiver(deps) {
  const {
    connection,
    transferStats,
    transferProgress,
    transferDirection,
    syncType,
    status,
    transferResult,
    localConfirmed,
    remoteConfirmed,
    pairingConfirmed,
    pendingAckResolve,
    pendingRecordAckResolve,
    addDebug,
    startStatsTracking,
    stopStatsTracking,
    closeConnection,
    sendData,
    indexedDB,
    opfs,
    characterStorage,
    videoStorage,
  } = deps

  // Receiver-side: pending record being assembled
  const pendingRecord = ref(null)
  const pendingImages = ref([])
  const pendingVideo = ref(null)

  // Chunked transfer: store chunks being received
  // Map of uuid -> { header, chunks: Map<index, Uint8Array>, totalChunks }
  const pendingChunks = ref(new Map())

  // Receiver-side counters for imported/skipped/failed
  const receiverCounts = ref({ imported: 0, skipped: 0, failed: 0 })

  /**
   * Handle incoming data - supports both binary (Uint8Array/ArrayBuffer) and msgpack-decoded data
   */
  const handleIncomingData = async (rawData) => {
    // Handle binary data (Uint8Array or ArrayBuffer)
    if (rawData instanceof ArrayBuffer || rawData instanceof Uint8Array) {
      const bytes = rawData instanceof ArrayBuffer ? new Uint8Array(rawData) : rawData
      transferStats.value.bytesReceived += bytes.length

      // Check for chunk message type (first byte)
      if (bytes[0] === MSG_TYPE_CHUNK) {
        await handleChunkData(bytes.slice(1))
        return
      }

      const decoded = decodeMessage(bytes)

      if (decoded.type === 'json') {
        await handleJsonMessage(decoded.data)
      } else if (decoded.type === 'binary') {
        await handleBinaryData(decoded.data)
      }
    } else if (typeof rawData === 'object' && rawData !== null) {
      // Msgpack decoded object (fallback for compatibility)
      // Also count received bytes for non-binary data
      const jsonSize = JSON.stringify(rawData).length
      transferStats.value.bytesReceived += jsonSize
      await handleJsonMessage(rawData)
    }
  }

  /**
   * Handle chunked data packet (for large files like videos)
   */
  const handleChunkData = async (bytes) => {
    try {
      const { header, chunkIndex, totalChunks, chunkData } = parseChunkPacket(bytes)
      const uuid = header.uuid

      // Initialize chunk storage if first chunk
      if (!pendingChunks.value.has(uuid)) {
        pendingChunks.value.set(uuid, {
          header,
          chunks: new Map(),
          totalChunks,
        })
        addDebug(`Starting chunked receive: ${uuid}, ${totalChunks} chunks expected`)
      }

      const chunkState = pendingChunks.value.get(uuid)
      chunkState.chunks.set(chunkIndex, chunkData)

      // Log progress every 10% or so
      const received = chunkState.chunks.size
      if (received % Math.max(1, Math.floor(totalChunks / 10)) === 0 || received === totalChunks) {
        addDebug(`Chunk ${received}/${totalChunks} received for ${uuid}`)
      }

      // Check if all chunks received
      if (chunkState.chunks.size === totalChunks) {
        addDebug(`All ${totalChunks} chunks received for ${uuid}, reassembling...`)

        // Reassemble the data
        let totalSize = 0
        for (let i = 0; i < totalChunks; i++) {
          totalSize += chunkState.chunks.get(i).length
        }

        const fullData = new Uint8Array(totalSize)
        let offset = 0
        for (let i = 0; i < totalChunks; i++) {
          const chunk = chunkState.chunks.get(i)
          fullData.set(chunk, offset)
          offset += chunk.length
        }

        // Clean up chunk storage
        pendingChunks.value.delete(uuid)

        // Process the reassembled data as a complete binary packet
        addDebug(`Reassembled ${formatBytes(totalSize)} for ${header.type}`)

        // Handle based on header type
        if (header.type === 'record_video') {
          if (!pendingRecord.value || pendingRecord.value.uuid !== header.uuid) {
            addDebug(`Ignoring video for unknown/mismatched record: ${header.uuid}`)
            return
          }

          pendingVideo.value = {
            uuid: header.uuid,
            width: header.width,
            height: header.height,
            mimeType: header.mimeType,
            data: fullData,
          }
          addDebug(`Video reassembled: ${formatBytes(fullData.length)}`)
        }
      }
    } catch (err) {
      console.error('Failed to handle chunk data:', err)
      addDebug(`Chunk parse error: ${err.message}`)
    }
  }

  /**
   * Handle decoded JSON control messages
   */
  const handleJsonMessage = async (data) => {
    if (data.type === 'confirm_pairing') {
      remoteConfirmed.value = true
      // Only start sending if BOTH sides confirmed
      if (transferDirection.value === 'send' && localConfirmed.value) {
        pairingConfirmed.value = true
        await sendData()
      } else if (transferDirection.value === 'receive' && localConfirmed.value) {
        pairingConfirmed.value = true
        startStatsTracking()
      }
    } else if (data.type === 'sync_type') {
      syncType.value = data.syncType
      addDebug(`Sync type set to: ${data.syncType}`)
    } else if (data.type === 'history_meta') {
      transferProgress.value = { current: 0, total: data.count, phase: 'receiving' }
      status.value = 'transferring'
    } else if (data.type === 'history_record') {
      // Legacy: old-style record with embedded base64 images
      await processIncomingRecord(data.record)
      transferProgress.value.current++
    } else if (data.type === 'record_start') {
      pendingRecord.value = data.meta
      pendingImages.value = []
      pendingVideo.value = null
      addDebug(`Receiving record: ${data.meta.uuid}, expecting ${data.meta.imageCount} images${data.meta.hasVideo ? ' + video' : ''}`)
    } else if (data.type === 'record_end') {
      if (pendingRecord.value && pendingRecord.value.uuid === data.uuid) {
        const expectedImages = pendingRecord.value.imageCount || 0
        const receivedImages = pendingImages.value.length
        const expectsVideo = pendingRecord.value.hasVideo

        // Wait for remaining images if needed
        if (receivedImages < expectedImages) {
          addDebug(`Waiting for remaining images: ${receivedImages}/${expectedImages}`)
          for (let i = 0; i < 100; i++) {
            await new Promise(r => setTimeout(r, 100))
            if (pendingImages.value.length >= expectedImages) {
              addDebug(`All images received: ${pendingImages.value.length}/${expectedImages}`)
              break
            }
            if (i % 10 === 0) {
              addDebug(`Still waiting: ${pendingImages.value.length}/${expectedImages}`)
            }
          }
        }

        // Wait for video if expected
        if (expectsVideo && !pendingVideo.value) {
          addDebug('Waiting for video data...')
          for (let i = 0; i < 300; i++) { // 30 seconds max for video
            await new Promise(r => setTimeout(r, 100))
            if (pendingVideo.value) {
              addDebug('Video received')
              break
            }
            if (i % 50 === 0) {
              addDebug('Still waiting for video...')
            }
          }
        }

        const finalImageCount = pendingImages.value.length
        const result = await saveReceivedRecord(pendingRecord.value, pendingImages.value, pendingVideo.value)
        transferProgress.value.current++

        if (result.skipped) {
          receiverCounts.value.skipped++
          addDebug(`Record ${data.uuid} skipped (duplicate)`)
        } else if (result.failed) {
          receiverCounts.value.failed++
          addDebug(`Record ${data.uuid} failed to save`)
        } else {
          receiverCounts.value.imported++
        }

        // Send ACK back to sender
        addDebug(`Sending record_ack for ${data.uuid}, images: ${finalImageCount}/${expectedImages}, video: ${!!pendingVideo.value}, skipped: ${!!result.skipped}`)
        connection.value.send(encodeJsonMessage({
          type: 'record_ack',
          uuid: data.uuid,
          receivedImages: finalImageCount,
          expectedImages: expectedImages,
          hasVideo: !!pendingVideo.value,
          skipped: !!result.skipped,
        }))

        pendingRecord.value = null
        pendingImages.value = []
        pendingVideo.value = null
      }
    } else if (data.type === 'record_ack') {
      addDebug(`Received record_ack for ${data.uuid}, images: ${data.receivedImages}`)
      if (pendingRecordAckResolve.value) {
        pendingRecordAckResolve.value(data)
        pendingRecordAckResolve.value = null
      }
    } else if (data.type === 'characters_meta') {
      transferProgress.value = { current: 0, total: data.count, phase: 'receiving_characters' }
      status.value = 'transferring'
    } else if (data.type === 'character_start') {
      pendingRecord.value = { ...data.character, _type: 'character' }
      pendingImages.value = []
      addDebug(`Receiving character: ${data.character.name}`)
    } else if (data.type === 'character_end') {
      if (pendingRecord.value && pendingRecord.value._type === 'character') {
        const result = await saveReceivedCharacter(pendingRecord.value, pendingImages.value[0])
        transferProgress.value.current++

        if (result.skipped) {
          receiverCounts.value.skipped++
          addDebug(`Character ${pendingRecord.value.name} skipped (duplicate)`)
        } else if (result.failed) {
          receiverCounts.value.failed++
          addDebug(`Character ${pendingRecord.value.name} failed to save`)
        } else {
          receiverCounts.value.imported++
        }

        connection.value.send(encodeJsonMessage({
          type: 'character_ack',
          name: data.name,
          skipped: !!result.skipped,
        }))

        pendingRecord.value = null
        pendingImages.value = []
      }
    } else if (data.type === 'character_ack') {
      addDebug(`Received character_ack for ${data.name}`)
      if (pendingRecordAckResolve.value) {
        pendingRecordAckResolve.value(data)
        pendingRecordAckResolve.value = null
      }
    } else if (data.type === 'transfer_complete') {
      addDebug(`Received transfer_complete, sender reports ${data.total}, we processed: imported=${receiverCounts.value.imported}, skipped=${receiverCounts.value.skipped}, failed=${receiverCounts.value.failed}`)

      connection.value.send(encodeJsonMessage({
        type: 'transfer_ack',
        receivedCount: transferProgress.value.current,
        expectedCount: data.total,
        imported: receiverCounts.value.imported,
        skipped: receiverCounts.value.skipped,
        failed: receiverCounts.value.failed,
      }))

      stopStatsTracking()
      status.value = 'completed'
      transferResult.value = {
        imported: receiverCounts.value.imported,
        skipped: receiverCounts.value.skipped,
        failed: receiverCounts.value.failed,
        total: data.total,
      }
      closeConnection()
    } else if (data.type === 'transfer_ack') {
      addDebug(`Received transfer_ack: ${data.receivedCount}/${data.expectedCount} records`)
      if (pendingAckResolve.value) {
        pendingAckResolve.value(data)
        pendingAckResolve.value = null
      }
    }
  }

  /**
   * Handle binary packet (image data)
   */
  const handleBinaryData = async (data) => {
    try {
      const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data
      const { header, imageData } = parseBinaryPacket(bytes)

      if (header.type === 'record_image') {
        if (!pendingRecord.value || pendingRecord.value.uuid !== header.uuid) {
          addDebug(`Ignoring image for unknown/mismatched record: ${header.uuid}`)
          return
        }

        addDebug(`Received image ${header.uuid}:${header.index}: ${formatBytes(imageData.length)}`)

        pendingImages.value.push({
          uuid: header.uuid,
          index: header.index,
          width: header.width,
          height: header.height,
          mimeType: header.mimeType,
          data: imageData,
        })
      } else if (header.type === 'record_video') {
        if (!pendingRecord.value || pendingRecord.value.uuid !== header.uuid) {
          addDebug(`Ignoring video for unknown/mismatched record: ${header.uuid}`)
          return
        }

        addDebug(`Received video ${header.uuid}: ${formatBytes(imageData.length)}`)

        pendingVideo.value = {
          uuid: header.uuid,
          width: header.width,
          height: header.height,
          mimeType: header.mimeType,
          data: imageData,
        }
      } else if (header.type === 'character_image') {
        if (!pendingRecord.value || pendingRecord.value._type !== 'character' || pendingRecord.value.name !== header.name) {
          addDebug(`Ignoring character image for unknown/mismatched character: ${header.name}`)
          return
        }

        addDebug(`Received character image ${header.name}: ${formatBytes(imageData.length)}`)

        pendingImages.value.push({
          name: header.name,
          mimeType: header.mimeType,
          data: imageData,
        })
      }
    } catch (err) {
      console.error('Failed to handle binary data:', err)
      addDebug(`Binary parse error: ${err.message}`)
    }
  }

  /**
   * Save received record to IndexedDB/OPFS (new binary protocol)
   */
  const saveReceivedRecord = async (meta, images, video = null) => {
    try {
      // Check if UUID already exists
      if (meta.uuid && (await indexedDB.hasHistoryByUUID(meta.uuid))) {
        addDebug(`Skipped duplicate: ${meta.uuid}`)
        return { skipped: true }
      }

      const historyRecord = {
        uuid: meta.uuid || generateUUID(),
        timestamp: meta.timestamp,
        prompt: meta.prompt,
        mode: meta.mode,
        options: meta.options,
        status: meta.status,
        thinkingText: meta.thinkingText,
        error: meta.error,
      }

      const historyId = await indexedDB.addHistoryWithUUID(historyRecord)

      // Save images to OPFS
      if (images.length > 0) {
        const sortedImages = images
          .filter(img => img.uuid === meta.uuid)
          .sort((a, b) => a.index - b.index)
        const imageMetadata = []

        for (const img of sortedImages) {
          const ext = img.mimeType === 'image/png' ? 'png' : 'webp'
          const opfsPath = `/images/${historyId}/${img.index}.${ext}`

          const blob = new Blob([img.data], { type: img.mimeType })
          await opfs.writeFile(opfsPath, blob)

          const thumbnail = await generateThumbnailFromBlob(blob)

          imageMetadata.push({
            index: img.index,
            width: img.width,
            height: img.height,
            opfsPath,
            thumbnail,
            originalSize: blob.size,
            compressedSize: blob.size,
            originalFormat: img.mimeType,
            compressedFormat: img.mimeType,
          })
        }

        await indexedDB.updateHistoryImages(historyId, imageMetadata)
      }

      // Save video to OPFS
      if (video && video.data) {
        const videoDirPath = `videos/${historyId}`
        const videoPath = `/${videoDirPath}/video.mp4`
        const thumbnailPath = `/${videoDirPath}/thumbnail.webp`

        const videoBlob = new Blob([video.data], { type: video.mimeType || 'video/mp4' })

        // Create directory and save video
        await opfs.getOrCreateDirectory(videoDirPath)
        await opfs.writeFile(videoPath, videoBlob)

        // Extract thumbnail from video using shared utility
        let thumbnailData = null
        try {
          if (videoStorage?.extractThumbnail) {
            const thumbResult = await videoStorage.extractThumbnail(videoBlob)
            thumbnailData = thumbResult.thumbnail
            const thumbnailBlob = await fetch(thumbnailData).then((r) => r.blob())
            await opfs.writeFile(thumbnailPath, thumbnailBlob)
          }
        } catch (thumbErr) {
          addDebug(`Failed to extract video thumbnail: ${thumbErr.message}`)
        }

        // Update history record with video metadata
        await indexedDB.updateHistoryVideo(historyId, {
          opfsPath: videoPath,
          thumbnailPath,
          size: videoBlob.size,
          mimeType: video.mimeType || 'video/mp4',
          width: video.width,
          height: video.height,
          thumbnail: thumbnailData,
        })
      }

      addDebug(`Saved record: ${meta.uuid}`)
      return { imported: true }
    } catch (err) {
      console.error('Failed to save record:', err)
      addDebug(`Save error: ${err.message}`)
      return { failed: true }
    }
  }

  /**
   * Save received character to IndexedDB (metadata) and OPFS (imageData)
   */
  const saveReceivedCharacter = async (characterData, imageData) => {
    try {
      const existing = await indexedDB.getCharacterByName(characterData.name)
      if (existing) {
        addDebug(`Skipped duplicate character: ${characterData.name}`)
        return { skipped: true }
      }

      // Character metadata (without imageData - that goes to OPFS)
      const characterMeta = {
        name: characterData.name,
        description: characterData.description,
        physicalTraits: characterData.physicalTraits,
        clothing: characterData.clothing,
        accessories: characterData.accessories,
        distinctiveFeatures: characterData.distinctiveFeatures,
        thumbnail: characterData.thumbnail,
        // imageData is stored in OPFS, not IndexedDB
      }

      // Prepare imageData for OPFS storage
      let imageBase64 = null
      if (imageData && imageData.data) {
        const blob = new Blob([imageData.data], { type: imageData.mimeType || 'image/png' })
        // blobToBase64 returns full data URL, but we only need the base64 part
        const dataUrl = await blobToBase64(blob)
        imageBase64 = dataUrl.split(',')[1] // Extract base64 portion only
        if (!characterMeta.thumbnail) {
          characterMeta.thumbnail = await generateThumbnailFromBlob(blob)
        }
      }

      // Save metadata to IndexedDB first to get the ID
      const newCharacterId = await indexedDB.addCharacter(characterMeta)

      // Save imageData to OPFS
      if (imageBase64 && characterStorage) {
        await characterStorage.saveCharacterImage(newCharacterId, imageBase64)
      }

      addDebug(`Saved character: ${characterData.name}`)
      return { imported: true }
    } catch (err) {
      console.error('Failed to save character:', err)
      addDebug(`Save character error: ${err.message}`)
      return { failed: true }
    }
  }

  /**
   * Process incoming record (legacy receiver side)
   */
  const processIncomingRecord = async (record) => {
    try {
      if (record.uuid && (await indexedDB.hasHistoryByUUID(record.uuid))) {
        return { skipped: true }
      }

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

      const historyId = await indexedDB.addHistoryWithUUID(historyRecord)

      if (record.images && record.images.length > 0) {
        const imageMetadata = []

        for (const img of record.images) {
          const opfsPath = `/images/${historyId}/${img.index}.webp`

          const binaryString = atob(img.data)
          const bytes = new Uint8Array(binaryString.length)
          for (let j = 0; j < binaryString.length; j++) {
            bytes[j] = binaryString.charCodeAt(j)
          }
          const blob = new Blob([bytes], { type: 'image/webp' })

          await opfs.writeFile(opfsPath, blob)

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

        await indexedDB.updateHistoryImages(historyId, imageMetadata)
      }

      return { imported: true }
    } catch (err) {
      console.error('Failed to process record:', err)
      return { failed: true }
    }
  }

  /**
   * Reset receiver state
   */
  const resetReceiverState = () => {
    pendingRecord.value = null
    pendingImages.value = []
    pendingVideo.value = null
    pendingChunks.value = new Map()
    receiverCounts.value = { imported: 0, skipped: 0, failed: 0 }
  }

  return {
    // State
    pendingRecord,
    pendingImages,
    receiverCounts,

    // Methods
    handleIncomingData,
    resetReceiverState,
  }
}
