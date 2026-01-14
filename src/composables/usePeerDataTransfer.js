import { generateUUID } from './useUUID'
import {
  encodeJsonMessage,
  formatBytes,
  createBinaryPacket,
  createChunkPacket,
  MSG_TYPE_BINARY,
  CHUNK_SIZE,
} from './peerSyncUtils'

/**
 * Composable for peer-to-peer data transfer (sender side)
 * Handles sending history records and character data with binary protocol
 *
 * @param {Object} deps - Dependencies
 * @param {import('vue').Ref} deps.connection - PeerJS connection ref
 * @param {import('vue').Ref} deps.transferStats - Transfer statistics ref
 * @param {import('vue').Ref} deps.transferProgress - Transfer progress ref
 * @param {import('vue').Ref} deps.pendingRecordAckResolve - Pending ACK resolver ref
 * @param {Function} deps.addDebug - Debug logging function
 */
export function usePeerDataTransfer(deps) {
  const {
    connection,
    transferStats,
    transferProgress,
    pendingRecordAckResolve,
    addDebug,
  } = deps

  /**
   * Wait for DataChannel buffer to drain below threshold
   * This implements backpressure to prevent overwhelming the channel
   * @param {number} threshold - Buffer threshold in bytes
   * @throws {Error} if connection is closed during drain
   */
  const waitForBufferDrain = async (threshold = 64 * 1024) => {
    if (!connection.value || !connection.value.open) {
      throw new Error('Connection closed')
    }

    // PeerJS stores DataChannel in different properties depending on version
    const dc = connection.value?.dataChannel ||
               connection.value?._dc ||
               connection.value?._channel

    if (!dc || typeof dc.bufferedAmount === 'undefined') {
      addDebug(`Warning: Cannot access DataChannel (dc=${!!dc}), skipping buffer drain`)
      await new Promise(r => setTimeout(r, 50))
      return
    }

    addDebug(`Waiting for buffer drain, current: ${dc.bufferedAmount}, threshold: ${threshold}`)
    let waitCount = 0
    while (dc.bufferedAmount > threshold) {
      if (!connection.value || !connection.value.open) {
        addDebug('Connection closed during buffer drain')
        throw new Error('Connection closed')
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
      waitCount++
      if (waitCount % 20 === 0) {
        addDebug(`Still draining... bufferedAmount: ${dc.bufferedAmount}`)
      }
      // Safety timeout: max 60 seconds
      if (waitCount > 1200) {
        addDebug(`Buffer drain timeout after 60s, bufferedAmount: ${dc.bufferedAmount}`)
        break
      }
    }
    addDebug(`Buffer drained to ${dc.bufferedAmount}`)
  }

  /**
   * Send JSON message with stats tracking
   * @param {object} obj - JSON-serializable object
   * @throws {Error} if connection is closed
   */
  const sendJson = (obj) => {
    if (!connection.value || !connection.value.open) {
      throw new Error('Connection closed')
    }
    const packet = encodeJsonMessage(obj)
    transferStats.value.bytesSent += packet.length
    connection.value.send(packet)
  }

  /**
   * Send binary data with stats tracking, type prefix, and backpressure
   * @param {ArrayBuffer|Uint8Array} data - Binary data to send
   * @throws {Error} if connection is closed
   */
  const sendBinary = async (data) => {
    if (!connection.value || !connection.value.open) {
      throw new Error('Connection closed')
    }
    const raw = data instanceof Uint8Array ? data : new Uint8Array(data)
    // Prepend MSG_TYPE_BINARY prefix
    const packet = new Uint8Array(1 + raw.length)
    packet[0] = MSG_TYPE_BINARY
    packet.set(raw, 1)

    // Wait for buffer to drain before sending more (backpressure)
    await waitForBufferDrain()

    // Check again after drain wait
    if (!connection.value || !connection.value.open) {
      throw new Error('Connection closed')
    }

    transferStats.value.bytesSent += packet.length
    connection.value.send(packet)
  }

  /**
   * Send large binary data in chunks (for videos and other large files)
   * @param {object} header - Header object for the data
   * @param {Uint8Array} rawData - Raw binary data
   * @throws {Error} if connection is closed
   */
  const sendChunked = async (header, rawData) => {
    const totalChunks = Math.ceil(rawData.length / CHUNK_SIZE)
    addDebug(`Sending ${formatBytes(rawData.length)} in ${totalChunks} chunks`)

    for (let i = 0; i < totalChunks; i++) {
      if (!connection.value || !connection.value.open) {
        throw new Error('Connection closed')
      }

      const start = i * CHUNK_SIZE
      const end = Math.min(start + CHUNK_SIZE, rawData.length)
      const chunkData = rawData.slice(start, end)

      const packet = createChunkPacket(header, chunkData, i, totalChunks)

      // Wait for buffer to drain before sending more
      await waitForBufferDrain()

      if (!connection.value || !connection.value.open) {
        throw new Error('Connection closed')
      }

      transferStats.value.bytesSent += packet.length
      connection.value.send(packet)

      // Log progress every 10% or so
      if (i % Math.max(1, Math.floor(totalChunks / 10)) === 0 || i === totalChunks - 1) {
        addDebug(`Chunk ${i + 1}/${totalChunks} sent`)
      }
    }
  }

  /**
   * Wait for ACK from receiver with timeout
   * @param {string} identifier - Record UUID or character name for logging
   * @param {number} timeout - Timeout in ms
   * @returns {Promise<object>} ACK data
   */
  const waitForRecordAck = (identifier, timeout = 60000) => {
    return new Promise((resolve, reject) => {
      pendingRecordAckResolve.value = resolve
      setTimeout(() => {
        if (pendingRecordAckResolve.value) {
          pendingRecordAckResolve.value = null
          reject(new Error(`ACK timeout: ${identifier}`))
        }
      }, timeout)
    })
  }

  /**
   * Send history data (sender side) - Binary transfer
   * @param {Object} params
   * @param {Object} params.indexedDB - IndexedDB composable
   * @param {Object} params.imageStorage - Image storage composable
   * @param {Object} params.videoStorage - Video storage composable
   * @param {Array<number>|null} params.selectedRecordIds - Specific record IDs to sync
   * @returns {Promise<{sent: number, failed: number, total: number}>}
   */
  const sendHistoryData = async ({ indexedDB, imageStorage, videoStorage, selectedRecordIds }) => {
    if (!connection.value) return { sent: 0, failed: 0, total: 0 }

    let records
    if (selectedRecordIds && selectedRecordIds.length > 0) {
      records = await indexedDB.getHistoryByIds(selectedRecordIds)
    } else {
      records = await indexedDB.getAllHistory()
    }
    transferProgress.value = { current: 0, total: records.length, phase: 'sending' }

    // Send metadata first
    sendJson({ type: 'history_meta', count: records.length })

    let sent = 0
    let failed = 0

    for (const record of records) {
      try {
        const uuid = record.uuid || generateUUID()

        // Prepare record metadata (without image/video data)
        const recordMeta = {
          uuid,
          timestamp: record.timestamp,
          prompt: record.prompt,
          mode: record.mode,
          options: record.options,
          status: record.status,
          thinkingText: record.thinkingText,
          error: record.error,
          imageCount: record.images?.length || 0,
          hasVideo: !!(record.video && record.video.opfsPath),
        }

        // Send record start with metadata
        sendJson({ type: 'record_start', meta: recordMeta })

        // Send each image as separate binary packet
        if (record.images && record.images.length > 0) {
          for (let i = 0; i < record.images.length; i++) {
            const img = record.images[i]
            const blob = await imageStorage.loadImageBlob(img.opfsPath)
            if (blob) {
              const arrayBuffer = await blob.arrayBuffer()
              const rawData = new Uint8Array(arrayBuffer)

              const header = {
                type: 'record_image',
                uuid,
                index: img.index,
                width: img.width,
                height: img.height,
                size: rawData.length,
                mimeType: blob.type || 'image/webp',
              }

              const packet = createBinaryPacket(header, rawData)
              await sendBinary(packet)
              addDebug(`Sent image ${i + 1}/${record.images.length}: ${formatBytes(rawData.length)}`)
            }
          }
        }

        // Send video if present (using chunked transfer for large files)
        if (record.video && record.video.opfsPath && videoStorage) {
          const videoBlob = await videoStorage.loadVideoBlob(record.video.opfsPath)
          if (videoBlob) {
            const arrayBuffer = await videoBlob.arrayBuffer()
            const rawData = new Uint8Array(arrayBuffer)

            const header = {
              type: 'record_video',
              uuid,
              width: record.video.width,
              height: record.video.height,
              size: rawData.length,
              mimeType: record.video.mimeType || 'video/mp4',
            }

            // Use chunked transfer for videos (they can be large)
            await sendChunked(header, rawData)
            addDebug(`Sent video: ${formatBytes(rawData.length)}`)
          }
        }

        // Wait for all image data to be sent before record_end
        await waitForBufferDrain(0)
        await new Promise(r => setTimeout(r, 100))

        // Send record end
        sendJson({ type: 'record_end', uuid })

        // Wait for receiver to acknowledge this record
        addDebug(`Waiting for record_ack: ${uuid}`)
        try {
          const ack = await waitForRecordAck(uuid)
          const sentImageCount = record.images?.length || 0
          if (ack.receivedImages !== sentImageCount) {
            addDebug(`Warning: Image mismatch for ${uuid}: sent ${sentImageCount}, received ${ack.receivedImages}`)
          } else {
            addDebug(`Record ${uuid} acknowledged, ${ack.receivedImages}/${sentImageCount} images OK`)
          }
          sent++
        } catch (ackErr) {
          addDebug(`Record ${uuid} ACK failed: ${ackErr.message}`)
          failed++
        }
      } catch (err) {
        console.error('Failed to send record:', err)
        addDebug(`Failed to send record: ${err.message}`)
        failed++
      }

      transferProgress.value.current++
    }

    // Wait for buffer to drain
    addDebug('Waiting for buffer to drain...')
    await waitForBufferDrain(0)

    return { sent, failed, total: records.length }
  }

  /**
   * Send characters data (sender side)
   * @param {Object} params
   * @param {Object} params.indexedDB - IndexedDB composable
   * @param {Object} params.characterStorage - Character storage composable for OPFS access
   * @param {Array<number>|null} params.selectedCharacterIds - Specific character IDs to sync
   * @returns {Promise<{sent: number, failed: number, total: number}>}
   */
  const sendCharactersData = async ({ indexedDB, characterStorage, selectedCharacterIds }) => {
    if (!connection.value) return { sent: 0, failed: 0, total: 0 }

    let characters
    if (selectedCharacterIds && selectedCharacterIds.length > 0) {
      characters = []
      for (const id of selectedCharacterIds) {
        const char = await indexedDB.getCharacterById(id)
        if (char) characters.push(char)
      }
    } else {
      characters = await indexedDB.getAllCharacters()
    }

    transferProgress.value = { current: 0, total: characters.length, phase: 'sending_characters' }

    // Send character metadata
    sendJson({ type: 'characters_meta', count: characters.length })

    let sent = 0
    let failed = 0

    for (const character of characters) {
      try {
        // Prepare character metadata (without large image data in JSON)
        const characterMeta = {
          name: character.name,
          description: character.description,
          physicalTraits: character.physicalTraits,
          clothing: character.clothing,
          accessories: character.accessories,
          distinctiveFeatures: character.distinctiveFeatures,
          thumbnail: character.thumbnail, // Keep thumbnail in JSON (small)
        }

        // Send character start
        sendJson({ type: 'character_start', character: characterMeta })

        // Load imageData from OPFS with fallback to legacy IndexedDB data
        const imageData = characterStorage
          ? await characterStorage.loadCharacterImageWithFallback(character.id, character.imageData)
          : character.imageData

        // Send character image as binary if present
        if (imageData) {
          let imageBlob
          // imageData might be base64 data URL or raw base64
          if (imageData.startsWith('data:')) {
            const [header, base64] = imageData.split(',')
            const mimeType = header.match(/data:([^;]+)/)?.[1] || 'image/png'
            const binaryString = atob(base64)
            const bytes = new Uint8Array(binaryString.length)
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i)
            }
            imageBlob = new Blob([bytes], { type: mimeType })
          } else {
            // Raw base64
            const binaryString = atob(imageData)
            const bytes = new Uint8Array(binaryString.length)
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i)
            }
            imageBlob = new Blob([bytes], { type: 'image/png' })
          }

          const arrayBuffer = await imageBlob.arrayBuffer()
          const rawData = new Uint8Array(arrayBuffer)

          const header = {
            type: 'character_image',
            name: character.name,
            size: rawData.length,
            mimeType: imageBlob.type,
          }

          const packet = createBinaryPacket(header, rawData)
          await sendBinary(packet)
          addDebug(`Sent character image: ${character.name}, ${formatBytes(rawData.length)}`)
        }

        // Wait for buffer to drain
        await waitForBufferDrain(0)
        await new Promise(r => setTimeout(r, 100))

        // Send character end
        sendJson({ type: 'character_end', name: character.name })

        // Wait for ACK
        addDebug(`Waiting for character_ack: ${character.name}`)
        try {
          await waitForRecordAck(character.name)
          addDebug(`Character ${character.name} acknowledged`)
          sent++
        } catch (ackErr) {
          addDebug(`Character ${character.name} ACK failed: ${ackErr.message}`)
          failed++
        }
      } catch (err) {
        console.error('Failed to send character:', err)
        addDebug(`Failed to send character: ${err.message}`)
        failed++
      }

      transferProgress.value.current++
    }

    // Wait for buffer to drain
    await waitForBufferDrain(0)

    return { sent, failed, total: characters.length }
  }

  return {
    sendHistoryData,
    sendCharactersData,
    sendJson,
    sendBinary,
    waitForBufferDrain,
  }
}
