import { ref, computed, onUnmounted } from 'vue'
import Peer from 'peerjs'
import { useIndexedDB } from './useIndexedDB'
import { useImageStorage } from './useImageStorage'
import { useOPFS } from './useOPFS'
import { buildIceServers } from './useCloudfareTurn'
import { usePeerDataTransfer } from './usePeerDataTransfer'
import { usePeerDataReceiver } from './usePeerDataReceiver'
import {
  generateConnectionCode,
  generatePairingEmojis,
  encodeJsonMessage,
  formatBytes,
  formatSpeed,
} from './peerSyncUtils'

export function usePeerSync() {
  const indexedDB = useIndexedDB()
  const imageStorage = useImageStorage()
  const opfs = useOPFS()

  // ============================================================================
  // Connection State
  // ============================================================================
  const peer = ref(null)
  const connection = ref(null)
  const connectionCode = ref('')
  const status = ref('idle') // idle, waiting, connecting, paired, transferring, completed, error
  const error = ref(null)
  const pairingEmojis = ref([])
  const pairingConfirmed = ref(false)

  // ============================================================================
  // Transfer State
  // ============================================================================
  const transferDirection = ref(null) // 'send' | 'receive'
  const transferProgress = ref({ current: 0, total: 0, phase: '' })
  const transferResult = ref(null)
  const selectedRecordIds = ref(null)
  const selectedCharacterIds = ref(null)
  const syncType = ref('history') // 'history' | 'characters' | 'all'

  // ============================================================================
  // Pairing State
  // ============================================================================
  const localConfirmed = ref(false)
  const remoteConfirmed = ref(false)

  // ============================================================================
  // ACK Resolvers
  // ============================================================================
  const pendingAckResolve = ref(null)
  const pendingRecordAckResolve = ref(null)

  // ============================================================================
  // Transfer Statistics
  // ============================================================================
  const transferStats = ref({
    bytesSent: 0,
    bytesReceived: 0,
    startTime: null,
    speed: 0,
    speedFormatted: '',
    totalFormatted: '',
  })

  let statsInterval = null
  const startStatsTracking = () => {
    transferStats.value.startTime = Date.now()
    transferStats.value.bytesSent = 0
    transferStats.value.bytesReceived = 0
    statsInterval = setInterval(() => {
      const elapsed = (Date.now() - transferStats.value.startTime) / 1000
      if (elapsed > 0) {
        const totalBytes = transferStats.value.bytesSent + transferStats.value.bytesReceived
        transferStats.value.speed = totalBytes / elapsed
        transferStats.value.speedFormatted = formatSpeed(transferStats.value.speed)
        transferStats.value.totalFormatted = formatBytes(totalBytes)
      }
    }, 500)
  }

  const stopStatsTracking = () => {
    if (statsInterval) {
      clearInterval(statsInterval)
      statsInterval = null
    }
  }

  const isConnected = computed(() => status.value === 'paired' || status.value === 'transferring')

  // ============================================================================
  // Debug Logging
  // ============================================================================
  const debugLog = ref([])
  const addDebug = (msg) => {
    console.log('[PeerSync]', msg)
    debugLog.value.push(`${new Date().toLocaleTimeString()}: ${msg}`)
  }

  // ============================================================================
  // Close Connection (reusable)
  // ============================================================================
  const closeConnection = () => {
    addDebug('Closing connection to stop TURN billing')
    if (connection.value) {
      try {
        connection.value.close()
      } catch (e) {
        console.error('Error closing connection:', e)
      }
      connection.value = null
    }
    if (peer.value) {
      try {
        peer.value.destroy()
      } catch (e) {
        console.error('Error destroying peer:', e)
      }
      peer.value = null
    }
  }

  // ============================================================================
  // Initialize Transfer Module
  // ============================================================================
  const transfer = usePeerDataTransfer({
    connection,
    transferStats,
    transferProgress,
    pendingRecordAckResolve,
    addDebug,
  })

  // ============================================================================
  // Send Data Orchestration
  // ============================================================================
  const sendData = async () => {
    transfer.sendJson({ type: 'sync_type', syncType: syncType.value })

    if (syncType.value === 'history') {
      await sendHistoryDataWithCompletion()
    } else if (syncType.value === 'characters') {
      await sendCharactersDataWithCompletion()
    } else if (syncType.value === 'all') {
      await sendHistoryDataWithCompletion(false) // Don't close on completion
      receiver.receiverCounts.value = { imported: 0, skipped: 0, failed: 0 }
      await sendCharactersDataWithCompletion()
    }
  }

  const sendHistoryDataWithCompletion = async (shouldClose = true) => {
    status.value = 'transferring'
    startStatsTracking()

    try {
      const result = await transfer.sendHistoryData({
        indexedDB,
        imageStorage,
        selectedRecordIds: selectedRecordIds.value,
      })

      if (syncType.value === 'history' || (syncType.value === 'all' && shouldClose)) {
        await finishTransfer(result)
      }
    } catch (err) {
      handleTransferError(err)
    }
  }

  const sendCharactersDataWithCompletion = async () => {
    if (syncType.value === 'characters') {
      status.value = 'transferring'
      startStatsTracking()
    }

    try {
      const result = await transfer.sendCharactersData({
        indexedDB,
        selectedCharacterIds: selectedCharacterIds.value,
      })

      await finishTransfer(result)
    } catch (err) {
      handleTransferError(err)
    }
  }

  const finishTransfer = async (result) => {
    transfer.sendJson({
      type: 'transfer_complete',
      imported: result.sent,
      skipped: 0,
      failed: result.failed,
      total: result.total,
    })

    // Wait for ACK from receiver
    const ackPromise = new Promise((resolve, reject) => {
      pendingAckResolve.value = resolve
      setTimeout(() => {
        if (pendingAckResolve.value) {
          pendingAckResolve.value = null
          reject(new Error('ACK timeout'))
        }
      }, 30000)
    })

    try {
      const ack = await ackPromise
      addDebug(`ACK received: imported=${ack.imported}, skipped=${ack.skipped}, failed=${ack.failed}`)

      stopStatsTracking()
      status.value = 'completed'
      transferResult.value = {
        sent: ack.imported,
        imported: ack.imported,
        skipped: ack.skipped,
        failed: ack.failed,
        total: result.total,
      }
      closeConnection()
    } catch (ackErr) {
      addDebug(`ACK error: ${ackErr.message}`)
      stopStatsTracking()
      status.value = 'completed'
      transferResult.value = { sent: result.sent, failed: result.failed, total: result.total }
      closeConnection()
    }
  }

  const handleTransferError = (err) => {
    console.error('Send failed:', err)
    stopStatsTracking()
    if (err.message === 'Connection closed') {
      error.value = { key: 'peerSync.connectionClosed' }
    } else {
      error.value = err.message
    }
    status.value = 'error'
    closeConnection()
  }

  // ============================================================================
  // Initialize Receiver Module
  // ============================================================================
  const receiver = usePeerDataReceiver({
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
  })

  // ============================================================================
  // Connection Setup
  // ============================================================================
  const setupConnection = (conn) => {
    addDebug(`setupConnection called, conn.peer=${conn.peer}, conn.open=${conn.open}`)

    const openTimeout = setTimeout(() => {
      if (status.value === 'waiting' || status.value === 'connecting') {
        addDebug('Connection open timeout')
        error.value = { key: 'peerSync.connectionTimeout' }
        status.value = 'error'
        conn.close()
      }
    }, 30000)

    if (conn.open) {
      addDebug('Connection already open!')
      clearTimeout(openTimeout)
      status.value = 'paired'
      const myId = peer.value.id
      const theirId = conn.peer
      pairingEmojis.value = generatePairingEmojis(myId, theirId)
    }

    conn.on('open', () => {
      addDebug('Connection opened event fired!')
      clearTimeout(openTimeout)
      status.value = 'paired'
      const myId = peer.value.id
      const theirId = conn.peer
      pairingEmojis.value = generatePairingEmojis(myId, theirId)
    })

    // Monitor ICE state
    const checkIceState = () => {
      const pc = conn.peerConnection || conn._peerConnection
      addDebug(`Checking peerConnection: ${pc ? 'found' : 'null'}`)
      if (pc) {
        addDebug(`ICE: ${pc.iceConnectionState}, Gathering: ${pc.iceGatheringState}, Signaling: ${pc.signalingState}`)

        const config = pc.getConfiguration()
        addDebug(`ICE servers count: ${config?.iceServers?.length || 0}`)

        pc.addEventListener('iceconnectionstatechange', () => {
          addDebug(`ICE state changed: ${pc.iceConnectionState}`)
          if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
            addDebug('ICE connected successfully!')
          }
          if (pc.iceConnectionState === 'failed') {
            addDebug('ICE failed - NAT traversal unsuccessful')
            error.value = { key: 'peerSync.iceFailed' }
            status.value = 'error'
            clearTimeout(openTimeout)
            closeConnection()
          }
        })

        pc.addEventListener('icegatheringstatechange', () => {
          addDebug(`ICE gathering: ${pc.iceGatheringState}`)
        })

        pc.addEventListener('icecandidate', (e) => {
          if (e.candidate) {
            const c = e.candidate
            addDebug(`ICE candidate: type=${c.type || 'unknown'}, protocol=${c.protocol}, address=${c.address || 'hidden'}`)
          } else {
            addDebug('ICE gathering complete (null candidate)')
          }
        })

        pc.addEventListener('connectionstatechange', () => {
          addDebug(`Connection state: ${pc.connectionState}`)
        })

        pc.addEventListener('signalingstatechange', () => {
          addDebug(`Signaling state: ${pc.signalingState}`)
        })

        // Force ICE restart if no candidates after 5 seconds
        setTimeout(() => {
          if (conn.open) return
          if (pc.iceGatheringState === 'gathering' || pc.iceGatheringState === 'new') {
            addDebug('Forcing ICE restart due to no candidates...')
            try {
              pc.restartIce()
              addDebug('restartIce() called')
            } catch (e) {
              addDebug(`restartIce failed: ${e.message}`)
            }
          }
        }, 5000)
      } else {
        addDebug('peerConnection not ready, retrying...')
        setTimeout(checkIceState, 100)
      }
    }
    checkIceState()

    conn.on('data', async (data) => {
      const size = data instanceof ArrayBuffer ? data.byteLength : data?.length || 0
      addDebug(`Received data: ${size} bytes`)
      try {
        await receiver.handleIncomingData(data)
      } catch (err) {
        console.error('Error handling incoming data:', err)
        addDebug(`Data handling error: ${err.message}`)
      }
    })

    conn.on('close', () => {
      addDebug('Connection closed')
      clearTimeout(openTimeout)
      if (status.value !== 'completed') {
        status.value = 'idle'
      }
      connection.value = null
    })

    conn.on('error', (err) => {
      addDebug(`Connection error: ${err.type || err.message || err}`)
      clearTimeout(openTimeout)
      console.error('Connection error:', err)
      error.value = err.message || String(err)
      status.value = 'error'
      closeConnection()
    })
  }

  // ============================================================================
  // Start as Sender
  // ============================================================================
  const startAsSender = async (options = {}) => {
    const { historyIds = null, characterIds = null, type = 'history' } = options
    cleanup()

    const code = generateConnectionCode()
    connectionCode.value = code
    status.value = 'waiting'
    error.value = null
    transferDirection.value = 'send'
    selectedRecordIds.value = historyIds
    selectedCharacterIds.value = characterIds
    syncType.value = type

    try {
      const iceServers = await buildIceServers()

      const peerId = `nbp-sync-${code}`
      peer.value = new Peer(peerId, {
        debug: 2,
        pingInterval: 5000,
        config: {
          iceServers,
          iceCandidatePoolSize: 10,
        },
      })

      addDebug(`Creating peer: ${peerId}`)

      peer.value.on('connection', (conn) => {
        addDebug(`Incoming connection from: ${conn.peer}`)
        connection.value = conn
        setupConnection(conn)
      })

      peer.value.on('error', (err) => {
        addDebug(`Peer error: ${err.type} - ${err.message}`)
        console.error('Peer error:', err)

        if (err.type === 'unavailable-id') {
          addDebug('ID taken, retrying with new code...')
          if (peer.value) peer.value.destroy()
          startAsSender({
            historyIds: selectedRecordIds.value,
            characterIds: selectedCharacterIds.value,
            type: syncType.value,
          })
          return
        }

        error.value = `${err.type}: ${err.message}`
        status.value = 'error'
      })

      await new Promise((resolve, reject) => {
        peer.value.on('open', (id) => {
          addDebug(`Peer opened with ID: ${id}`)
          resolve()
        })
        setTimeout(() => reject(new Error('Connection timeout')), 30000)
      })

      addDebug('Waiting for incoming connection...')
    } catch (err) {
      addDebug(`Failed to start sender: ${err.message}`)
      console.error('Failed to start sender:', err)
      error.value = err.message
      status.value = 'error'
      if (peer.value) {
        peer.value.destroy()
        peer.value = null
      }
    }
  }

  // ============================================================================
  // Connect to Sender (Receiver)
  // ============================================================================
  const connectToSender = async (code) => {
    cleanup()

    const normalizedCode = code.toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (normalizedCode.length !== 6) {
      error.value = { key: 'peerSync.invalidCode' }
      status.value = 'error'
      return
    }

    connectionCode.value = normalizedCode
    status.value = 'connecting'
    error.value = null
    transferDirection.value = 'receive'

    try {
      const iceServers = await buildIceServers()

      const myId = `nbp-recv-${generateConnectionCode()}-${Date.now().toString(36)}`
      addDebug(`Creating peer: ${myId}`)

      peer.value = new Peer(myId, {
        debug: 2,
        pingInterval: 5000,
        config: {
          iceServers,
          iceCandidatePoolSize: 10,
        },
      })

      peer.value.on('error', (err) => {
        addDebug(`Peer error: ${err.type} - ${err.message}`)
        console.error('Peer error:', err)
        error.value = `${err.type}: ${err.message}`
        status.value = 'error'
      })

      await new Promise((resolve, reject) => {
        peer.value.on('open', (id) => {
          addDebug(`Peer opened with ID: ${id}`)
          resolve()
        })
        setTimeout(() => reject(new Error('Connection timeout')), 30000)
      })

      const targetPeerId = `nbp-sync-${normalizedCode}`
      addDebug(`Connecting to: ${targetPeerId}`)

      const conn = peer.value.connect(targetPeerId, {
        reliable: true,
        serialization: 'binary',
      })
      connection.value = conn

      setupConnection(conn)
    } catch (err) {
      addDebug(`Failed to connect: ${err.message}`)
      console.error('Failed to connect:', err)
      error.value = err.message
      status.value = 'error'
      if (peer.value) {
        peer.value.destroy()
        peer.value = null
      }
    }
  }

  // ============================================================================
  // Confirm Pairing
  // ============================================================================
  const confirmPairing = async () => {
    if (!connection.value) return

    localConfirmed.value = true
    connection.value.send(encodeJsonMessage({ type: 'confirm_pairing' }))

    if (remoteConfirmed.value) {
      pairingConfirmed.value = true
      if (transferDirection.value === 'send') {
        await sendData()
      } else if (transferDirection.value === 'receive') {
        startStatsTracking()
      }
    }
  }

  // ============================================================================
  // Cleanup
  // ============================================================================
  const cleanup = () => {
    addDebug('Cleanup called')
    stopStatsTracking()
    closeConnection()

    status.value = 'idle'
    connectionCode.value = ''
    pairingEmojis.value = []
    pairingConfirmed.value = false
    localConfirmed.value = false
    remoteConfirmed.value = false
    transferProgress.value = { current: 0, total: 0, phase: '' }
    transferResult.value = null
    transferStats.value = {
      bytesSent: 0,
      bytesReceived: 0,
      startTime: null,
      speed: 0,
      speedFormatted: '',
      totalFormatted: '',
    }
    error.value = null
    transferDirection.value = null
    selectedRecordIds.value = null
    selectedCharacterIds.value = null
    syncType.value = 'history'
    debugLog.value = []
    pendingAckResolve.value = null
    pendingRecordAckResolve.value = null

    // Reset receiver state
    receiver.resetReceiverState()
  }

  onUnmounted(() => {
    cleanup()
  })

  return {
    // State
    connectionCode,
    status,
    error,
    pairingEmojis,
    pairingConfirmed,
    localConfirmed,
    transferDirection,
    transferProgress,
    transferResult,
    transferStats,
    isConnected,
    debugLog,
    syncType,

    // Actions
    startAsSender,
    connectToSender,
    confirmPairing,
    cleanup,

    // Utilities
    formatBytes,
    formatSpeed,
  }
}
