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

// Fallback STUN servers (used when no custom config)
const FALLBACK_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

// Storage keys for Cloudflare TURN credentials
const CF_TURN_CREDENTIALS_KEY = 'nbp-cf-turn-credentials'
const CF_ICE_CACHE_KEY = 'nbp-cf-ice-cache'
const CF_TURN_ENABLED_KEY = 'nbp-cf-turn-enabled'

// Cloudflare TURN API TTL (24 hours in seconds)
const CLOUDFLARE_TURN_TTL = 86400

/**
 * Check if TURN usage is enabled
 * @returns {boolean}
 */
function isTurnEnabled() {
  const stored = localStorage.getItem(CF_TURN_ENABLED_KEY)
  // Default to true if not set and credentials exist
  if (stored === null) return true
  return stored === 'true'
}

/**
 * Set TURN usage enabled/disabled
 * @param {boolean} enabled
 */
function setTurnEnabled(enabled) {
  localStorage.setItem(CF_TURN_ENABLED_KEY, String(enabled))
}

/**
 * Get stored Cloudflare TURN credentials from localStorage
 * @returns {{ turnTokenId: string, apiToken: string } | null}
 */
function getCfTurnCredentials() {
  try {
    const stored = localStorage.getItem(CF_TURN_CREDENTIALS_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (e) {
    console.error('Failed to read Cloudflare TURN credentials:', e)
  }
  return null
}

/**
 * Save Cloudflare TURN credentials to localStorage
 * @param {string} turnTokenId - Cloudflare TURN Token ID
 * @param {string} apiToken - Cloudflare API Token
 * @returns {{ success: boolean, error?: string }}
 */
function saveCfTurnCredentials(turnTokenId, apiToken) {
  try {
    if (!turnTokenId?.trim() || !apiToken?.trim()) {
      localStorage.removeItem(CF_TURN_CREDENTIALS_KEY)
      localStorage.removeItem(CF_ICE_CACHE_KEY)
      return { success: true }
    }
    localStorage.setItem(CF_TURN_CREDENTIALS_KEY, JSON.stringify({
      turnTokenId: turnTokenId.trim(),
      apiToken: apiToken.trim(),
    }))
    // Clear cached ICE servers when credentials change
    localStorage.removeItem(CF_ICE_CACHE_KEY)
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

/**
 * Check if Cloudflare TURN credentials are configured
 */
function hasCfTurnCredentials() {
  const creds = getCfTurnCredentials()
  return !!(creds?.turnTokenId && creds?.apiToken)
}

/**
 * Clear Cloudflare TURN credentials
 */
function clearCfTurnCredentials() {
  localStorage.removeItem(CF_TURN_CREDENTIALS_KEY)
  localStorage.removeItem(CF_ICE_CACHE_KEY)
}

/**
 * Fetch ICE servers from Cloudflare TURN API
 * @returns {Promise<{ success: boolean, iceServers?: Array, error?: string }>}
 */
async function fetchCfIceServers() {
  const creds = getCfTurnCredentials()
  if (!creds?.turnTokenId || !creds?.apiToken) {
    return { success: false, error: 'Cloudflare TURN credentials not configured' }
  }

  try {
    const response = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${creds.turnTokenId}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${creds.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ttl: CLOUDFLARE_TURN_TTL }),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `Cloudflare API error: ${response.status} - ${errorText}` }
    }

    const data = await response.json()
    const iceServers = data.iceServers || data

    if (!Array.isArray(iceServers)) {
      return { success: false, error: 'Invalid response format from Cloudflare' }
    }

    // Cache the result with expiration (use 90% of TTL to refresh before expiry)
    const cacheExpiry = Date.now() + (CLOUDFLARE_TURN_TTL * 0.9 * 1000)
    localStorage.setItem(CF_ICE_CACHE_KEY, JSON.stringify({
      iceServers,
      expiry: cacheExpiry,
    }))

    return { success: true, iceServers }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

/**
 * Get cached ICE servers if still valid
 * @returns {Array|null}
 */
function getCachedIceServers() {
  try {
    const cached = localStorage.getItem(CF_ICE_CACHE_KEY)
    if (cached) {
      const { iceServers, expiry } = JSON.parse(cached)
      if (Date.now() < expiry) {
        return iceServers
      }
      // Cache expired, remove it
      localStorage.removeItem(CF_ICE_CACHE_KEY)
    }
  } catch (e) {
    console.error('Failed to read ICE cache:', e)
  }
  return null
}

/**
 * Build ICE servers list - uses cache or fetches fresh if needed
 * @returns {Promise<Array>}
 */
async function buildIceServers() {
  // Check if Cloudflare credentials are configured and TURN is enabled
  if (!hasCfTurnCredentials() || !isTurnEnabled()) {
    return FALLBACK_ICE_SERVERS
  }

  // Check cache first
  const cached = getCachedIceServers()
  if (cached) {
    return cached
  }

  // Fetch fresh ICE servers
  const result = await fetchCfIceServers()
  if (result.success && result.iceServers) {
    return result.iceServers
  }

  // Fallback if fetch fails
  console.warn('Failed to fetch Cloudflare ICE servers, using fallback:', result.error)
  return FALLBACK_ICE_SERVERS
}

// ============================================================================
// Binary Transfer Utilities
// ============================================================================

/**
 * Compress data using gzip via CompressionStream API
 * @param {Uint8Array} data - Raw binary data
 * @returns {Promise<Uint8Array>} - Compressed data
 */
async function gzipCompress(data) {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('gzip'))
  const compressedBlob = await new Response(stream).blob()
  return new Uint8Array(await compressedBlob.arrayBuffer())
}

/**
 * Decompress gzip data via DecompressionStream API
 * @param {Uint8Array} compressed - Gzip compressed data
 * @returns {Promise<Uint8Array>} - Decompressed data
 */
async function gzipDecompress(compressed) {
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))
  const decompressedBlob = await new Response(stream).blob()
  return new Uint8Array(await decompressedBlob.arrayBuffer())
}

// Message type prefixes for raw binary mode
const MSG_TYPE_JSON = 0x4A    // 'J' - JSON control message
const MSG_TYPE_BINARY = 0x42  // 'B' - Binary data packet (images)

/**
 * Encode a JSON object as binary with type prefix
 * @param {object} obj - JSON-serializable object
 * @returns {Uint8Array}
 */
function encodeJsonMessage(obj) {
  const jsonStr = JSON.stringify(obj)
  const jsonBytes = new TextEncoder().encode(jsonStr)
  const packet = new Uint8Array(1 + jsonBytes.length)
  packet[0] = MSG_TYPE_JSON
  packet.set(jsonBytes, 1)
  return packet
}

/**
 * Decode a binary packet - returns { type: 'json', data } or { type: 'binary', data }
 * @param {ArrayBuffer|Uint8Array} rawData
 * @returns {{ type: 'json' | 'binary', data: object | Uint8Array }}
 */
function decodeMessage(rawData) {
  const data = rawData instanceof Uint8Array ? rawData : new Uint8Array(rawData)
  const type = data[0]

  if (type === MSG_TYPE_JSON) {
    try {
      const jsonStr = new TextDecoder().decode(data.slice(1))
      return { type: 'json', data: JSON.parse(jsonStr) }
    } catch (e) {
      console.error('Failed to decode JSON message:', e)
      // Return as binary if JSON parse fails
      return { type: 'binary', data: data.slice(1) }
    }
  } else if (type === MSG_TYPE_BINARY) {
    return { type: 'binary', data: data.slice(1) }
  } else {
    // Fallback - try to parse as binary image packet (legacy or unknown)
    return { type: 'binary', data }
  }
}

/**
 * Format bytes to human readable string
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/**
 * Format speed to human readable string
 * @param {number} bytesPerSec
 * @returns {string}
 */
function formatSpeed(bytesPerSec) {
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`
}

// ============================================================================
// Connection Code & Pairing
// ============================================================================

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

  // Receiver-side counters for imported/skipped/failed
  const receiverCounts = ref({ imported: 0, skipped: 0, failed: 0 })

  // Transfer stats (bytes, speed)
  const transferStats = ref({
    bytesSent: 0,
    bytesReceived: 0,
    startTime: null,
    speed: 0,           // current speed in bytes/sec
    speedFormatted: '', // human readable speed
    totalFormatted: '', // human readable total bytes
  })

  // Update speed calculation periodically
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
      // Fetch ICE servers (may call Cloudflare API if configured)
      const iceServers = await buildIceServers()

      // Use code as peer ID with prefix
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
      // Fetch ICE servers (may call Cloudflare API if configured)
      const iceServers = await buildIceServers()

      // Generate unique receiver ID
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
        serialization: 'binary', // Binary mode - PeerJS will pass through Uint8Array efficiently
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
            // Close connection to stop any TURN traffic
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

    conn.on('data', async (data) => {
      const size = data instanceof ArrayBuffer ? data.byteLength : data?.length || 0
      addDebug(`Received data: ${size} bytes`)
      try {
        await handleIncomingData(data)
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
      // Close connection to stop any TURN traffic
      closeConnection()
    })
  }

  // Track if we've confirmed locally
  const localConfirmed = ref(false)
  const remoteConfirmed = ref(false)

  // Receiver-side: pending record being assembled
  const pendingRecord = ref(null)
  const pendingImages = ref([])

  // Sender-side: promise resolver for waiting ACK from receiver
  const pendingAckResolve = ref(null)

  // Sender-side: promise resolver for per-record ACK
  const pendingRecordAckResolve = ref(null)

  /**
   * Handle incoming data - supports both binary (Uint8Array/ArrayBuffer) and msgpack-decoded data
   */
  const handleIncomingData = async (rawData) => {
    // With serialization: 'binary', PeerJS may pass through Uint8Array or decode via msgpack
    // We need to handle both cases
    if (rawData instanceof ArrayBuffer || rawData instanceof Uint8Array) {
      // Binary data with our type prefix
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
      // This shouldn't happen with our binary encoding, but handle it for safety
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
        await sendHistoryData()
      } else if (transferDirection.value === 'receive' && localConfirmed.value) {
        pairingConfirmed.value = true
        startStatsTracking() // Start tracking on receiver side
      }
    } else if (data.type === 'history_meta') {
      // Receiver gets metadata first
      transferProgress.value = { current: 0, total: data.count, phase: 'receiving' }
      status.value = 'transferring'
    } else if (data.type === 'history_record') {
      // Legacy: old-style record with embedded base64 images
      await processIncomingRecord(data.record)
      transferProgress.value.current++
    } else if (data.type === 'record_start') {
      // New binary protocol: start of record
      pendingRecord.value = data.meta
      pendingImages.value = []
      addDebug(`Receiving record: ${data.meta.uuid}, expecting ${data.meta.imageCount} images`)
    } else if (data.type === 'record_end') {
      // New binary protocol: end of record, save to DB
      if (pendingRecord.value && pendingRecord.value.uuid === data.uuid) {
        const expectedImages = pendingRecord.value.imageCount || 0
        const receivedImages = pendingImages.value.length

        // If we haven't received all images yet, wait a bit for them to arrive
        if (receivedImages < expectedImages) {
          addDebug(`Waiting for remaining images: ${receivedImages}/${expectedImages}`)
          // Wait up to 10 seconds for missing images (100ms intervals)
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

        // Update receiver counts based on result
        if (result.skipped) {
          receiverCounts.value.skipped++
          addDebug(`Record ${data.uuid} skipped (duplicate)`)
        } else if (result.failed) {
          receiverCounts.value.failed++
          addDebug(`Record ${data.uuid} failed to save`)
        } else {
          receiverCounts.value.imported++
        }

        // Send ACK back to sender so they know we received this record
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
      // Sender receives per-record ACK from receiver
      addDebug(`Received record_ack for ${data.uuid}, images: ${data.receivedImages}`)
      if (pendingRecordAckResolve.value) {
        pendingRecordAckResolve.value(data)
        pendingRecordAckResolve.value = null
      }
    } else if (data.type === 'transfer_complete') {
      // Sender says they're done - send back acknowledgment with our actual counts
      addDebug(`Received transfer_complete, sender reports ${data.total}, we processed: imported=${receiverCounts.value.imported}, skipped=${receiverCounts.value.skipped}, failed=${receiverCounts.value.failed}`)

      // Send acknowledgment back to sender with our counts
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
      // Close connection immediately to stop TURN billing
      closeConnection()
    } else if (data.type === 'transfer_ack') {
      // Sender receives acknowledgment from receiver
      addDebug(`Received transfer_ack: ${data.receivedCount}/${data.expectedCount} records`)

      // Resolve the pending ACK promise if exists
      if (pendingAckResolve.value) {
        pendingAckResolve.value(data)
        pendingAckResolve.value = null
      }
    }
  }

  /**
   * Handle binary packet (compressed image data)
   * Packet format: [4-byte header length][JSON header][compressed data]
   */
  const handleBinaryData = async (data) => {
    try {
      const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data
      // Note: bytesReceived already tracked in handleIncomingData

      // Parse header length (4 bytes, little-endian)
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      const headerLength = view.getUint32(0, true)

      // Parse JSON header
      const headerBytes = bytes.slice(4, 4 + headerLength)
      const header = JSON.parse(new TextDecoder().decode(headerBytes))

      if (header.type === 'record_image') {
        // Verify uuid matches current pending record
        if (!pendingRecord.value || pendingRecord.value.uuid !== header.uuid) {
          addDebug(`Ignoring image for unknown/mismatched record: ${header.uuid}`)
          return
        }

        // Extract compressed data
        const compressed = bytes.slice(4 + headerLength)

        // Decompress
        const imageData = await gzipDecompress(compressed)

        addDebug(`Received image ${header.uuid}:${header.index}: ${formatBytes(header.compressedSize)} → ${formatBytes(imageData.length)}`)

        // Store for later saving (with uuid for extra safety)
        pendingImages.value.push({
          uuid: header.uuid,
          index: header.index,
          width: header.width,
          height: header.height,
          mimeType: header.mimeType,
          data: imageData, // raw binary, not base64!
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

      // Save images to OPFS (filter by uuid and sort by index)
      if (images.length > 0) {
        const sortedImages = images
          .filter(img => img.uuid === meta.uuid) // Only images for this record
          .sort((a, b) => a.index - b.index)
        const imageMetadata = []

        for (const img of sortedImages) {
          const ext = img.mimeType === 'image/png' ? 'png' : 'webp'
          const opfsPath = `/images/${historyId}/${img.index}.${ext}`

          // Create blob from raw binary
          const blob = new Blob([img.data], { type: img.mimeType })
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
   * Confirm pairing and start transfer
   */
  const confirmPairing = async () => {
    if (!connection.value) return

    localConfirmed.value = true
    connection.value.send(encodeJsonMessage({ type: 'confirm_pairing' }))

    // Check if remote already confirmed - if so, we can proceed
    if (remoteConfirmed.value) {
      pairingConfirmed.value = true
      if (transferDirection.value === 'send') {
        await sendHistoryData()
      } else if (transferDirection.value === 'receive') {
        startStatsTracking()
      }
    }
    // Otherwise wait for remote confirmation via handleIncomingData
  }

  /**
   * Wait for DataChannel buffer to drain below threshold
   * This implements backpressure to prevent overwhelming the channel
   */
  const waitForBufferDrain = async (threshold = 64 * 1024) => {
    // PeerJS stores DataChannel in different properties depending on version
    // Common property names: dataChannel, _dc, _channel
    const dc = connection.value?.dataChannel ||
               connection.value?._dc ||
               connection.value?._channel

    if (!dc || typeof dc.bufferedAmount === 'undefined') {
      addDebug(`Warning: Cannot access DataChannel (dc=${!!dc}), skipping buffer drain`)
      // Fallback: short wait (per-record ACK provides the real flow control)
      await new Promise(r => setTimeout(r, 50))
      return
    }

    addDebug(`Waiting for buffer drain, current: ${dc.bufferedAmount}, threshold: ${threshold}`)
    let waitCount = 0
    while (dc.bufferedAmount > threshold) {
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
   */
  const sendJson = (obj) => {
    const packet = encodeJsonMessage(obj)
    transferStats.value.bytesSent += packet.length
    connection.value.send(packet)
  }

  /**
   * Send binary data with stats tracking, type prefix, and backpressure
   * @param {ArrayBuffer|Uint8Array} data - Binary data to send
   */
  const sendBinary = async (data) => {
    const raw = data instanceof Uint8Array ? data : new Uint8Array(data)
    // Prepend MSG_TYPE_BINARY prefix
    const packet = new Uint8Array(1 + raw.length)
    packet[0] = MSG_TYPE_BINARY
    packet.set(raw, 1)

    // Wait for buffer to drain before sending more (backpressure)
    await waitForBufferDrain()

    transferStats.value.bytesSent += packet.length
    connection.value.send(packet)
  }

  /**
   * Send history data (sender side) - Binary transfer with gzip compression
   */
  const sendHistoryData = async () => {
    if (!connection.value) return

    status.value = 'transferring'
    startStatsTracking()

    try {
      const records = await indexedDB.getAllHistory()
      transferProgress.value = { current: 0, total: records.length, phase: 'sending' }

      // Send metadata first
      sendJson({ type: 'history_meta', count: records.length })

      let sent = 0
      let failed = 0

      for (const record of records) {
        try {
          const uuid = record.uuid || generateUUID()

          // Prepare record metadata (without image data)
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
          }

          // Send record start with metadata
          sendJson({ type: 'record_start', meta: recordMeta })

          // Send each image as separate compressed binary
          if (record.images && record.images.length > 0) {
            for (let i = 0; i < record.images.length; i++) {
              const img = record.images[i]
              const blob = await imageStorage.loadImageBlob(img.opfsPath)
              if (blob) {
                // Get raw binary from blob
                const arrayBuffer = await blob.arrayBuffer()
                const rawData = new Uint8Array(arrayBuffer)

                // Compress with gzip
                const compressed = await gzipCompress(rawData)

                // Create a header with image info (as JSON prefix)
                const header = JSON.stringify({
                  type: 'record_image',
                  uuid,
                  index: img.index,
                  width: img.width,
                  height: img.height,
                  originalSize: rawData.length,
                  compressedSize: compressed.length,
                  mimeType: blob.type || 'image/webp',
                })
                const headerBytes = new TextEncoder().encode(header)

                // Combine: [4-byte header length][header][compressed data]
                const packet = new Uint8Array(4 + headerBytes.length + compressed.length)
                const view = new DataView(packet.buffer)
                view.setUint32(0, headerBytes.length, true) // little-endian
                packet.set(headerBytes, 4)
                packet.set(compressed, 4 + headerBytes.length)

                await sendBinary(packet)
                addDebug(`Sent image ${i + 1}/${record.images.length}: ${formatBytes(rawData.length)} → ${formatBytes(compressed.length)} (${((1 - compressed.length / rawData.length) * 100).toFixed(0)}% saved)`)
              }
            }
          }

          // Wait for all image data to be sent before record_end
          await waitForBufferDrain(0)
          // Small delay to ensure receiver processes images before record_end
          await new Promise(r => setTimeout(r, 100))

          // Send record end
          sendJson({ type: 'record_end', uuid })

          // Wait for receiver to acknowledge this record before continuing
          addDebug(`Waiting for record_ack: ${uuid}`)
          const recordAckPromise = new Promise((resolve, reject) => {
            pendingRecordAckResolve.value = resolve
            // Timeout after 60 seconds per record (large images may take time)
            setTimeout(() => {
              if (pendingRecordAckResolve.value) {
                pendingRecordAckResolve.value = null
                reject(new Error(`Record ACK timeout: ${uuid}`))
              }
            }, 60000)
          })

          try {
            const ack = await recordAckPromise
            const sentImageCount = record.images?.length || 0
            if (ack.receivedImages !== sentImageCount) {
              addDebug(`⚠️ Image mismatch for ${uuid}: sent ${sentImageCount}, received ${ack.receivedImages}`)
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

      // Send transfer_complete and wait for ACK from receiver
      addDebug('Sending transfer_complete, waiting for ACK...')
      sendJson({
        type: 'transfer_complete',
        imported: sent,
        skipped: 0,
        failed,
        total: records.length,
      })

      // Wait for receiver to acknowledge (with timeout)
      const ackPromise = new Promise((resolve, reject) => {
        pendingAckResolve.value = resolve
        // Timeout after 30 seconds
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
          sent: ack.imported, // Actually imported records
          imported: ack.imported,
          skipped: ack.skipped,
          failed: ack.failed,
          total: records.length,
        }
        // Close connection immediately to stop TURN billing
        closeConnection()
      } catch (ackErr) {
        addDebug(`ACK error: ${ackErr.message}`)
        // Still mark as completed but show warning
        stopStatsTracking()
        status.value = 'completed'
        transferResult.value = { sent, failed, total: records.length }
        // Close connection immediately to stop TURN billing
        closeConnection()
      }

    } catch (err) {
      console.error('Send failed:', err)
      stopStatsTracking()
      error.value = err.message
      status.value = 'error'
      // Close connection immediately to stop TURN billing
      closeConnection()
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
   * Close WebRTC connection only (preserve UI state for viewing results)
   */
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

  /**
   * Cleanup resources
   */
  const cleanup = () => {
    addDebug('Cleanup called')
    // Stop stats tracking
    stopStatsTracking()

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
    transferStats.value = { bytesSent: 0, bytesReceived: 0, startTime: null, speed: 0, speedFormatted: '', totalFormatted: '' }
    error.value = null
    transferDirection.value = null
    debugLog.value = []
    // Clear pending record state
    pendingRecord.value = null
    pendingImages.value = []
    // Clear pending ACK resolvers
    pendingAckResolve.value = null
    pendingRecordAckResolve.value = null
    // Reset receiver counts
    receiverCounts.value = { imported: 0, skipped: 0, failed: 0 }
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

    // Actions
    startAsSender,
    connectToSender,
    confirmPairing,
    cleanup,

    // Cloudflare TURN credentials management
    getCfTurnCredentials,
    saveCfTurnCredentials,
    hasCfTurnCredentials,
    clearCfTurnCredentials,
    fetchCfIceServers,
    isTurnEnabled,
    setTurnEnabled,

    // Utilities
    formatBytes,
    formatSpeed,
  }
}
