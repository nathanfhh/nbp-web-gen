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

// Cloudflare TURN API TTL (24 hours in seconds)
const CLOUDFLARE_TURN_TTL = 86400

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
  // Check if Cloudflare credentials are configured
  if (!hasCfTurnCredentials()) {
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

  // Receiver-side: pending record being assembled
  const pendingRecord = ref(null)
  const pendingImages = ref([])

  /**
   * Handle incoming data (JSON messages or binary packets)
   */
  const handleIncomingData = async (data) => {
    // Check if it's binary data (ArrayBuffer or Uint8Array)
    if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
      await handleBinaryData(data)
      return
    }

    // JSON message handling
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
        await saveReceivedRecord(pendingRecord.value, pendingImages.value)
        transferProgress.value.current++
        pendingRecord.value = null
        pendingImages.value = []
      }
    } else if (data.type === 'transfer_complete') {
      stopStatsTracking()
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
   * Handle binary packet (compressed image data)
   * Packet format: [4-byte header length][JSON header][compressed data]
   */
  const handleBinaryData = async (data) => {
    try {
      const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data
      transferStats.value.bytesReceived += bytes.length

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
   * Send binary data with stats tracking
   * @param {ArrayBuffer|Uint8Array} data - Binary data to send
   */
  const sendBinary = (data) => {
    const bytes = data.byteLength || data.length
    transferStats.value.bytesSent += bytes
    connection.value.send(data)
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

      // Send metadata first (small JSON message)
      connection.value.send({ type: 'history_meta', count: records.length })

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
          connection.value.send({ type: 'record_start', meta: recordMeta })

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

                sendBinary(packet)
                addDebug(`Sent image ${i + 1}/${record.images.length}: ${formatBytes(rawData.length)} → ${formatBytes(compressed.length)} (${((1 - compressed.length / rawData.length) * 100).toFixed(0)}% saved)`)
              }
            }
          }

          // Send record end
          connection.value.send({ type: 'record_end', uuid })
          sent++
        } catch (err) {
          console.error('Failed to send record:', err)
          failed++
        }

        transferProgress.value.current++

        // Small delay to prevent flooding
        await new Promise(r => setTimeout(r, 20))
      }

      connection.value.send({
        type: 'transfer_complete',
        imported: sent,
        skipped: 0,
        failed,
        total: records.length,
      })

      stopStatsTracking()
      status.value = 'completed'
      transferResult.value = { sent, failed, total: records.length }

    } catch (err) {
      console.error('Send failed:', err)
      stopStatsTracking()
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

    // Utilities
    formatBytes,
    formatSpeed,
  }
}
