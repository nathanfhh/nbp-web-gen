import { ref, computed, onUnmounted } from 'vue'
import Peer from 'peerjs'
import { useIndexedDB } from './useIndexedDB'
import { useImageStorage } from './useImageStorage'
import { useOPFS } from './useOPFS'
import { generateUUID } from './useUUID'
import { generateThumbnailFromBlob } from './useImageCompression'

// Emoji pool for pairing verification (visually distinct)
const EMOJI_POOL = [
  '🐶', '🐱', '🐼', '🦊', '🦁', '🐸', '🐵', '🐰',
  '🌸', '🌻', '🌺', '🍀', '🌈', '⭐', '🌙', '❄️',
  '🍎', '🍊', '🍋', '🍇', '🍓', '🍒', '🥝', '🍑',
  '🚀', '✈️', '🚗', '🚲', '⛵', '🎈', '🎮', '🎸',
]

// Base STUN servers (always included)
const BASE_ICE_SERVERS = [
  // Google STUN servers (reliable, free)
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
]

// TURN credential storage key
const TURN_STORAGE_KEY = 'nbp-turn-credentials'

// Default Metered.ca TURN server host
export const DEFAULT_TURN_HOST = 'global.turn.metered.ca'

/**
 * Get stored TURN credentials from localStorage
 * Returns: { url?: string, username: string, credential: string }
 */
function getTurnCredentials() {
  try {
    const stored = localStorage.getItem(TURN_STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (e) {
    console.error('Failed to read TURN credentials:', e)
  }
  return null
}

/**
 * Save TURN credentials to localStorage
 * @param {string} url - Custom TURN server URL (optional, defaults to Metered.ca)
 * @param {string} username - TURN username
 * @param {string} credential - TURN credential/password
 */
function saveTurnCredentials(url, username, credential) {
  try {
    if (username && credential) {
      localStorage.setItem(TURN_STORAGE_KEY, JSON.stringify({ url: url || '', username, credential }))
      return true
    } else {
      localStorage.removeItem(TURN_STORAGE_KEY)
      return true
    }
  } catch (e) {
    console.error('Failed to save TURN credentials:', e)
    return false
  }
}

/**
 * Build ICE servers list with optional TURN
 */
function buildIceServers() {
  const servers = [...BASE_ICE_SERVERS]
  const turnCreds = getTurnCredentials()

  if (turnCreds?.username && turnCreds?.credential) {
    // Use custom URL if provided, otherwise use Metered.ca
    const turnHost = turnCreds.url?.trim() || DEFAULT_TURN_HOST

    // Check if custom URL is a full URL (starts with turn: or turns:)
    if (turnHost.startsWith('turn:') || turnHost.startsWith('turns:')) {
      // Custom full URL - use as-is
      servers.push({
        urls: turnHost,
        username: turnCreds.username,
        credential: turnCreds.credential,
      })
    } else {
      // Host only - add standard TURN server configurations
      servers.push(
        {
          urls: `turn:${turnHost}:80`,
          username: turnCreds.username,
          credential: turnCreds.credential,
        },
        {
          urls: `turn:${turnHost}:443`,
          username: turnCreds.username,
          credential: turnCreds.credential,
        },
        {
          urls: `turn:${turnHost}:443?transport=tcp`,
          username: turnCreds.username,
          credential: turnCreds.credential,
        },
        {
          urls: `turns:${turnHost}:443?transport=tcp`,
          username: turnCreds.username,
          credential: turnCreds.credential,
        }
      )
    }
  }

  return servers
}

// Generate 6-char alphanumeric code (easy to type)
function generateConnectionCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // Exclude confusing chars: 0OI1
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

// Generate 3 emoji fingerprint from peer IDs
function generatePairingEmojis(peerId1, peerId2) {
  // Sort to ensure both sides get same result
  const combined = [peerId1, peerId2].sort().join('')

  // Simple hash
  let hash = 0
  for (let i = 0; i < combined.length; i++) {
    hash = ((hash << 5) - hash) + combined.charCodeAt(i)
    hash = hash & hash
  }

  const emojis = []
  for (let i = 0; i < 3; i++) {
    const index = Math.abs((hash >> (i * 8)) % EMOJI_POOL.length)
    emojis.push(EMOJI_POOL[index])
  }
  return emojis
}

export function usePeerSync() {
  const indexedDB = useIndexedDB()
  const imageStorage = useImageStorage()
  const opfs = useOPFS()

  // Connection state
  const peer = ref(null)
  const connection = ref(null)
  const connectionCode = ref('')
  const status = ref('idle') // idle, waiting, connecting, paired, transferring, completed, error
  const error = ref(null)
  const pairingEmojis = ref([])
  const pairingConfirmed = ref(false)

  // Transfer state
  const transferDirection = ref(null) // 'send' | 'receive'
  const transferProgress = ref({ current: 0, total: 0, phase: '' })
  const transferResult = ref(null)

  const isConnected = computed(() => status.value === 'paired' || status.value === 'transferring')

  // Debug log
  const debugLog = ref([])
  const addDebug = (msg) => {
    console.log('[PeerSync]', msg)
    debugLog.value.push(`${new Date().toLocaleTimeString()}: ${msg}`)
  }

  /**
   * Start as sender - create peer and wait for connection
   */
  const startAsSender = async () => {
    cleanup()

    const code = generateConnectionCode()
    connectionCode.value = code
    status.value = 'waiting'
    error.value = null
    transferDirection.value = 'send'

    try {
      // Use code as peer ID with prefix
      const peerId = `nbp-sync-${code}`
      peer.value = new Peer(peerId, {
        debug: 2,
        pingInterval: 5000,
        config: {
          iceServers: buildIceServers(),
          iceCandidatePoolSize: 10,
        },
      })

      addDebug(`Creating peer: ${peerId}`)

      // Set up all event listeners BEFORE waiting for open
      peer.value.on('connection', (conn) => {
        addDebug(`Incoming connection from: ${conn.peer}`)
        connection.value = conn
        setupConnection(conn)
      })

      peer.value.on('error', (err) => {
        addDebug(`Peer error: ${err.type} - ${err.message}`)
        console.error('Peer error:', err)
        
        // Retry if ID is taken (ghost session)
        if (err.type === 'unavailable-id') {
           addDebug('ID taken, retrying with new code...')
           if (peer.value) peer.value.destroy()
           startAsSender() // Recursive retry
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
      // Cleanup on failure
      if (peer.value) {
        peer.value.destroy()
        peer.value = null
      }
    }
  }

  /**
   * Start as receiver - connect to sender's peer
   */
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
      // Generate unique receiver ID
      const myId = `nbp-recv-${generateConnectionCode()}-${Date.now().toString(36)}`
      addDebug(`Creating peer: ${myId}`)

      peer.value = new Peer(myId, {
        debug: 2,
        pingInterval: 5000,
        config: {
          iceServers: buildIceServers(),
          iceCandidatePoolSize: 10,
        },
      })

      // Set up error listener before waiting
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

      // Connect to sender
      const targetPeerId = `nbp-sync-${normalizedCode}`
      addDebug(`Connecting to: ${targetPeerId}`)

      const conn = peer.value.connect(targetPeerId, {
        reliable: true,
        serialization: 'json',
      })
      connection.value = conn

      setupConnection(conn)

    } catch (err) {
      addDebug(`Failed to connect: ${err.message}`)
      console.error('Failed to connect:', err)
      error.value = err.message
      status.value = 'error'
      // Cleanup on failure
      if (peer.value) {
        peer.value.destroy()
        peer.value = null
      }
    }
  }

  /**
   * Setup connection event handlers
   */
  const setupConnection = (conn) => {
    addDebug(`setupConnection called, conn.peer=${conn.peer}, conn.open=${conn.open}`)
    addDebug(`conn keys: ${Object.keys(conn).join(', ')}`)

    // Timeout for connection open
    const openTimeout = setTimeout(() => {
      if (status.value === 'waiting' || status.value === 'connecting') {
        addDebug('Connection open timeout')
        error.value = { key: 'peerSync.connectionTimeout' }
        status.value = 'error'
        conn.close()
      }
    }, 30000)

    // Check if already open (can happen for sender)
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

      // Generate pairing emojis
      const myId = peer.value.id
      const theirId = conn.peer
      pairingEmojis.value = generatePairingEmojis(myId, theirId)
    })

    // Monitor ICE state from underlying RTCPeerConnection
    const checkIceState = () => {
      // PeerJS 1.x uses peerConnection
      const pc = conn.peerConnection || conn._peerConnection
      addDebug(`Checking peerConnection: ${pc ? 'found' : 'null'}`)
      if (pc) {
        addDebug(`ICE: ${pc.iceConnectionState}, Gathering: ${pc.iceGatheringState}, Signaling: ${pc.signalingState}`)
        addDebug(`Connection: ${pc.connectionState || 'N/A'}`)

        // Check ICE servers configuration
        const config = pc.getConfiguration()
        addDebug(`ICE servers count: ${config?.iceServers?.length || 0}`)

        // Use addEventListener to NOT override PeerJS internal handlers!
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
          if (conn.open) return;
          if (pc.iceGatheringState === 'gathering' || pc.iceGatheringState === 'new') {
            addDebug('Forcing ICE restart due to no candidates...')
            try {
              // Create a new offer with ICE restart to force re-gathering
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

    conn.on('data', (data) => {
      addDebug(`Received data: type=${data?.type}`)
      handleIncomingData(data)
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
    })
  }

  // Track if we've confirmed locally
  const localConfirmed = ref(false)
  const remoteConfirmed = ref(false)

  /**
   * Handle incoming data
   */
  const handleIncomingData = async (data) => {
    if (data.type === 'confirm_pairing') {
      remoteConfirmed.value = true
      // Only start sending if BOTH sides confirmed
      if (transferDirection.value === 'send' && localConfirmed.value) {
        pairingConfirmed.value = true
        await sendHistoryData()
      } else if (transferDirection.value === 'receive' && localConfirmed.value) {
        pairingConfirmed.value = true
      }
    } else if (data.type === 'history_meta') {
      // Receiver gets metadata first
      transferProgress.value = { current: 0, total: data.count, phase: 'receiving' }
      status.value = 'transferring'
    } else if (data.type === 'history_record') {
      // Receiver processes each record
      await processIncomingRecord(data.record)
      transferProgress.value.current++
    } else if (data.type === 'transfer_complete') {
      status.value = 'completed'
      transferResult.value = {
        imported: data.imported,
        skipped: data.skipped,
        failed: data.failed,
        total: data.total,
      }
    }
  }

  /**
   * Confirm pairing and start transfer
   */
  const confirmPairing = async () => {
    if (!connection.value) return

    localConfirmed.value = true
    connection.value.send({ type: 'confirm_pairing' })

    // Check if remote already confirmed - if so, we can proceed
    if (remoteConfirmed.value) {
      pairingConfirmed.value = true
      if (transferDirection.value === 'send') {
        await sendHistoryData()
      }
    }
    // Otherwise wait for remote confirmation via handleIncomingData
  }

  /**
   * Send history data (sender side)
   */
  const sendHistoryData = async () => {
    if (!connection.value) return

    status.value = 'transferring'

    try {
      const records = await indexedDB.getAllHistory()
      transferProgress.value = { current: 0, total: records.length, phase: 'sending' }

      // Send metadata first
      connection.value.send({ type: 'history_meta', count: records.length })

      let sent = 0
      let failed = 0

      for (const record of records) {
        try {
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

          connection.value.send({ type: 'history_record', record: exportRecord })
          sent++
        } catch (err) {
          console.error('Failed to send record:', err)
          failed++
        }

        transferProgress.value.current++

        // Small delay to prevent flooding
        await new Promise(r => setTimeout(r, 50))
      }

      connection.value.send({
        type: 'transfer_complete',
        imported: sent,
        skipped: 0,
        failed,
        total: records.length,
      })

      status.value = 'completed'
      transferResult.value = { sent, failed, total: records.length }

    } catch (err) {
      console.error('Send failed:', err)
      error.value = err.message
      status.value = 'error'
    }
  }

  /**
   * Process incoming record (receiver side)
   */
  const processIncomingRecord = async (record) => {
    try {
      // Check if UUID already exists
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

        await indexedDB.updateHistoryImages(historyId, imageMetadata)
      }

      return { imported: true }
    } catch (err) {
      console.error('Failed to process record:', err)
      return { failed: true }
    }
  }

  /**
   * Cleanup resources
   */
  const cleanup = () => {
    addDebug('Cleanup called')
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
    status.value = 'idle'
    connectionCode.value = ''
    pairingEmojis.value = []
    pairingConfirmed.value = false
    localConfirmed.value = false
    remoteConfirmed.value = false
    transferProgress.value = { current: 0, total: 0, phase: '' }
    transferResult.value = null
    error.value = null
    transferDirection.value = null
    debugLog.value = []
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
    transferDirection,
    transferProgress,
    transferResult,
    isConnected,
    debugLog,

    // Actions
    startAsSender,
    connectToSender,
    confirmPairing,
    cleanup,

    // TURN credential management
    getTurnCredentials,
    saveTurnCredentials,
  }
}
