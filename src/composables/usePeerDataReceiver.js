import { ref } from 'vue'
import { generateUUID } from './useUUID'
import { generateThumbnailFromBlob } from './useImageCompression'
import {
  decodeMessage,
  encodeJsonMessage,
  formatBytes,
  parseBinaryPacket,
  blobToBase64,
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
  } = deps

  // Receiver-side: pending record being assembled
  const pendingRecord = ref(null)
  const pendingImages = ref([])

  // Receiver-side counters for imported/skipped/failed
  const receiverCounts = ref({ imported: 0, skipped: 0, failed: 0 })

  /**
   * Handle incoming data - supports both binary (Uint8Array/ArrayBuffer) and msgpack-decoded data
   */
  const handleIncomingData = async (rawData) => {
    if (rawData instanceof ArrayBuffer || rawData instanceof Uint8Array) {
      const rawBytes = rawData instanceof ArrayBuffer ? rawData.byteLength : rawData.length
      transferStats.value.bytesReceived += rawBytes

      const decoded = decodeMessage(rawData)

      if (decoded.type === 'json') {
        await handleJsonMessage(decoded.data)
      } else if (decoded.type === 'binary') {
        await handleBinaryData(decoded.data)
      }
    } else if (typeof rawData === 'object' && rawData !== null) {
      // Msgpack decoded object (fallback for compatibility)
      await handleJsonMessage(rawData)
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
      addDebug(`Receiving record: ${data.meta.uuid}, expecting ${data.meta.imageCount} images`)
    } else if (data.type === 'record_end') {
      if (pendingRecord.value && pendingRecord.value.uuid === data.uuid) {
        const expectedImages = pendingRecord.value.imageCount || 0
        const receivedImages = pendingImages.value.length

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

        const finalImageCount = pendingImages.value.length
        const result = await saveReceivedRecord(pendingRecord.value, pendingImages.value)
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
        addDebug(`Sending record_ack for ${data.uuid}, images: ${finalImageCount}/${expectedImages}, skipped: ${!!result.skipped}`)
        connection.value.send(encodeJsonMessage({
          type: 'record_ack',
          uuid: data.uuid,
          receivedImages: finalImageCount,
          expectedImages: expectedImages,
          skipped: !!result.skipped,
        }))

        pendingRecord.value = null
        pendingImages.value = []
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
  const saveReceivedRecord = async (meta, images) => {
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

      addDebug(`Saved record: ${meta.uuid}`)
      return { imported: true }
    } catch (err) {
      console.error('Failed to save record:', err)
      addDebug(`Save error: ${err.message}`)
      return { failed: true }
    }
  }

  /**
   * Save received character to IndexedDB
   */
  const saveReceivedCharacter = async (characterData, imageData) => {
    try {
      const existing = await indexedDB.getCharacterByName(characterData.name)
      if (existing) {
        addDebug(`Skipped duplicate character: ${characterData.name}`)
        return { skipped: true }
      }

      const character = {
        name: characterData.name,
        description: characterData.description,
        physicalTraits: characterData.physicalTraits,
        clothing: characterData.clothing,
        accessories: characterData.accessories,
        distinctiveFeatures: characterData.distinctiveFeatures,
        imageData: characterData.imageData,
        thumbnail: characterData.thumbnail,
      }

      // If we received binary image data, convert to base64
      if (imageData && imageData.data) {
        const blob = new Blob([imageData.data], { type: imageData.mimeType || 'image/png' })
        // blobToBase64 returns full data URL, but we only need the base64 part
        const dataUrl = await blobToBase64(blob)
        character.imageData = dataUrl.split(',')[1] // Extract base64 portion only
        if (!character.thumbnail) {
          character.thumbnail = await generateThumbnailFromBlob(blob)
        }
      }

      await indexedDB.addCharacter(character)
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
