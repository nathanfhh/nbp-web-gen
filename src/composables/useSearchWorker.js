/**
 * Singleton composable for RAG search worker management.
 * Provides reactive state and methods for hybrid search (BM25 + semantic).
 *
 * Module-level singleton pattern — one Worker instance shared across all components.
 * Worker is lazy-initialized on first `initialize()` call.
 */
import { ref } from 'vue'
import { stripRecordForIndexing } from '@/utils/search-core'

// ============================================================================
// Module-level Singleton State (shared across all useSearchWorker() calls)
// ============================================================================

const isReady = ref(false)
const isModelLoading = ref(false)
const modelProgress = ref(0)
const modelStatus = ref('')
const modelStage = ref('') // 'download' | 'init' | 'ready' | ''
const indexedCount = ref(0)
const indexingProgress = ref({ current: 0, total: 0 })
const embeddingCost = ref({ totalTokens: 0, estimatedCostUsd: 0 })
const embeddingProvider = ref(null) // 'gemini' | 'local' | null
const error = ref(null)

let worker = null
let initPromise = null
let initResolve = null
let initReject = null
let requestCounter = 0
const pendingRequests = new Map() // requestId → { resolve, reject }

// ============================================================================
// Worker Lifecycle
// ============================================================================

function nextRequestId() {
  return `req_${++requestCounter}_${Date.now()}`
}

function sendRequest(type, data = {}) {
  return new Promise((resolve, reject) => {
    if (!worker) {
      reject(new Error('Worker not initialized'))
      return
    }
    const requestId = nextRequestId()
    pendingRequests.set(requestId, { resolve, reject })
    worker.postMessage({ type, requestId, ...data })
  })
}

function handleWorkerMessage(event) {
  const msg = event.data
  const { type, requestId } = msg

  switch (type) {
    case 'ready':
      isReady.value = true
      isModelLoading.value = false
      modelProgress.value = 100
      modelStatus.value = ''
      indexedCount.value = msg.indexedCount || 0
      if (initResolve) {
        initResolve()
        initResolve = null
        initReject = null
      }
      break

    case 'modelProgress':
      isModelLoading.value = true
      modelProgress.value = msg.value || 0
      modelStatus.value = msg.message || ''
      modelStage.value = msg.stage || ''
      break

    case 'searchResult': {
      if (msg.embeddingCost) embeddingCost.value = msg.embeddingCost
      const pending = pendingRequests.get(requestId)
      if (pending) {
        pendingRequests.delete(requestId)
        pending.resolve({ hits: msg.hits, elapsed: msg.elapsed })
      }
      break
    }

    case 'indexed': {
      // Use parentCount (unique parent records) for the UI, not chunk count
      if (msg.parentCount != null) {
        indexedCount.value = msg.parentCount
      }
      const pending = pendingRequests.get(requestId)
      if (pending) {
        pendingRequests.delete(requestId)
        pending.resolve({ count: msg.count })
      }
      break
    }

    case 'removed':
    case 'removedAll':
    case 'persisted': {
      if (type === 'removedAll') {
        indexedCount.value = 0
      }
      const pending = pendingRequests.get(requestId)
      if (pending) {
        pendingRequests.delete(requestId)
        pending.resolve()
      }
      break
    }

    case 'selfHealResult': {
      const pending = pendingRequests.get(requestId)
      if (pending) {
        pendingRequests.delete(requestId)
        pending.resolve(msg.missingIds || [])
      }
      break
    }

    case 'diagnoseResult': {
      const pending = pendingRequests.get(requestId)
      if (pending) {
        pendingRequests.delete(requestId)
        pending.resolve({
          totalDocs: msg.totalDocs,
          uniqueParents: msg.uniqueParents,
          parentIds: msg.parentIds,
          sampleDoc: msg.sampleDoc,
          hasNonZeroVectors: msg.hasNonZeroVectors,
          chunkDistribution: msg.chunkDistribution,
          embeddingCacheSize: msg.embeddingCacheSize,
          activeProvider: msg.activeProvider,
        })
      }
      break
    }

    case 'providerSwitched': {
      indexedCount.value = msg.indexedCount || 0
      const pending = pendingRequests.get(requestId)
      if (pending) {
        pendingRequests.delete(requestId)
        pending.resolve({ provider: msg.provider, needBackfill: msg.needBackfill })
      }
      break
    }

    case 'progress': {
      // Progress updates for indexing
      modelStatus.value = msg.message || ''
      indexingProgress.value = { current: msg.value || 0, total: msg.total || 0 }
      break
    }

    case 'error': {
      const errMsg = msg.message || 'Unknown worker error'
      if (requestId) {
        const pending = pendingRequests.get(requestId)
        if (pending) {
          pendingRequests.delete(requestId)
          pending.reject(new Error(errMsg))
        }
      } else {
        // Global error (e.g., init failure)
        error.value = errMsg
        isModelLoading.value = false
        if (initReject) {
          initReject(new Error(errMsg))
          initResolve = null
          initReject = null
        }
        initPromise = null
      }
      break
    }
  }
}

// ============================================================================
// CustomEvent Listeners for History Sync
// ============================================================================

function handleHistoryAdded(event) {
  const { id, record } = event.detail || {}
  if (!id || !record) return

  if (!isReady.value || !worker) {
    console.log(`[RAG Search] Event received but worker not ready — id=${id} will be caught by selfHeal`)
    return
  }

  // Agent records are indexed via selfHeal (conversation may not be saved yet)
  if (record.mode === 'agent') return

  const stripped = stripRecordForIndexing(id, record)

  // Index the new record in background (fire-and-forget)
  console.log(`[RAG Search] Real-time indexing: id=${id}, mode=${record.mode}, prompt="${(record.prompt || '').slice(0, 60)}..."`)
  sendRequest('index', { records: [{ record: stripped }] })
    .then(() => {
      console.log(`[RAG Search] Real-time indexed: id=${id} → total ${indexedCount.value} records`)
      sendRequest('persist').catch(() => {})
    })
    .catch((err) => {
      console.warn(`[RAG Search] Real-time indexing failed: id=${id}`, err.message)
    })
}

function handleHistoryUpdated(event) {
  const { id, record } = event.detail || {}
  if (!id || !record) return

  if (!isReady.value || !worker) {
    console.log(`[RAG Search] Update received but worker not ready — id=${id} will be caught by selfHeal`)
    return
  }

  if (record.mode === 'agent') return

  const stripped = stripRecordForIndexing(id, record)

  console.log(`[RAG Search] Updating index for id=${id}`)

  // Remove first to clear cache, then re-index
  sendRequest('remove', { parentIds: [id] })
    .then(() => sendRequest('index', { records: [{ record: stripped }] }))
    .then(() => {
      console.log(`[RAG Search] Updated index for id=${id}`)
      sendRequest('persist').catch(() => {})
    })
    .catch((err) => {
      console.warn(`[RAG Search] Update failed: id=${id}`, err.message)
    })
}

function handleHistoryDeleted(event) {
  if (!isReady.value || !worker) return
  const { ids } = event.detail || {}
  if (!ids || ids.length === 0) return

  sendRequest('remove', { parentIds: ids })
    .then(() => {
      indexedCount.value = Math.max(0, indexedCount.value - ids.length)
      sendRequest('persist').catch(() => {})
    })
    .catch(() => {})
}

function handleHistoryCleared() {
  if (!isReady.value || !worker) return
  sendRequest('removeAll')
    .then(() => sendRequest('persist').catch(() => {}))
    .catch(() => {})
}

// Eagerly register events at module load so real-time indexing works
// even if the user hasn't opened the SearchModal yet.
// Events fired before worker is ready are silently skipped (selfHeal catches up).
let eventsRegistered = false
function registerEvents() {
  if (eventsRegistered) return
  eventsRegistered = true
  window.addEventListener('nbp-history-added', handleHistoryAdded)
  window.addEventListener('nbp-history-updated', handleHistoryUpdated)
  window.addEventListener('nbp-history-deleted', handleHistoryDeleted)
  window.addEventListener('nbp-history-cleared', handleHistoryCleared)
}

function unregisterEvents() {
  if (!eventsRegistered) return
  eventsRegistered = false
  window.removeEventListener('nbp-history-added', handleHistoryAdded)
  window.removeEventListener('nbp-history-updated', handleHistoryUpdated)
  window.removeEventListener('nbp-history-deleted', handleHistoryDeleted)
  window.removeEventListener('nbp-history-cleared', handleHistoryCleared)
}

// Register immediately so events are captured from the start
registerEvents()

// ============================================================================
// Public API
// ============================================================================

export function useSearchWorker() {
  /**
   * Lazy-initialize the search worker.
   * Safe to call multiple times — returns the same promise.
   */
  function initialize() {
    if (initPromise) return initPromise

    error.value = null
    isModelLoading.value = true
    modelProgress.value = 0
    modelStatus.value = 'Initializing...'

    // Re-register events (in case terminate() was called previously)
    registerEvents()

    initPromise = new Promise((resolve, reject) => {
      initResolve = resolve
      initReject = reject

      try {
        worker = new Worker(
          new URL('../workers/search.worker.js', import.meta.url),
          { type: 'module' },
        )

        worker.onmessage = handleWorkerMessage

        worker.onerror = (e) => {
          error.value = e.message || 'Worker initialization failed'
          isModelLoading.value = false
          if (initReject) {
            initReject(new Error(error.value))
            initResolve = null
            initReject = null
          }
          // Reset state so re-init is possible
          if (worker) {
            worker.terminate()
            worker = null
          }
          unregisterEvents()
          initPromise = null
        }

        // Read API keys from localStorage (worker can't access it directly)
        const apiKey = localStorage.getItem('nanobanana-api-key') || ''
        const freeApiKey = localStorage.getItem('nanobanana-free-tier-api-key') || ''

        // Read embedding provider preference from localStorage
        const provider = localStorage.getItem('nbp-search-embedding-provider') || null
        embeddingProvider.value = provider

        // Send init command with API keys and provider
        worker.postMessage({ type: 'init', apiKey, freeApiKey, provider })
      } catch (err) {
        error.value = err.message
        isModelLoading.value = false
        if (worker) {
          worker.terminate()
          worker = null
        }
        unregisterEvents()
        initPromise = null
        reject(err)
      }
    })

    return initPromise
  }

  /**
   * Search indexed records.
   * @param {string} query
   * @param {Object} opts - { mode?, strategy? }
   * @returns {Promise<{ hits: Array, elapsed: number }>}
   */
  function search(query, opts = {}) {
    return sendRequest('search', { query, mode: opts.mode, strategy: opts.strategy })
  }

  /**
   * Index records into the search database.
   * @param {Array<{ record, conversation? }>} records
   * @returns {Promise<{ count: number }>}
   */
  function indexRecords(records) {
    return sendRequest('index', { records })
  }

  /**
   * Remove records from the search index.
   * @param {Array<string|number>} parentIds
   */
  function removeRecords(parentIds) {
    return sendRequest('remove', { parentIds })
  }

  /**
   * Remove all records from the search index.
   */
  function removeAll() {
    return sendRequest('removeAll')
  }

  /**
   * Self-heal: compare with all history IDs, find missing, remove orphans.
   * @param {Array<number|string>} allHistoryIds
   * @returns {Promise<Array<string>>} missingIds
   */
  function selfHeal(allHistoryIds) {
    return sendRequest('selfHeal', { allHistoryIds })
  }

  /**
   * Persist the current Orama DB to IndexedDB.
   */
  function persistIndex() {
    return sendRequest('persist')
  }

  /**
   * Run diagnostics on the search index.
   * @returns {Promise<Object>} Diagnostic info (totalDocs, uniqueParents, sampleDoc, etc.)
   */
  function diagnose() {
    return sendRequest('diagnose')
  }

  /**
   * Switch embedding provider in the worker.
   * Rebuilds Orama DB with the new provider's dimensions.
   * @param {'gemini'|'local'} provider
   * @returns {Promise<{ provider: string, indexedCount: number }>}
   */
  function switchProvider(provider) {
    return sendRequest('switchProvider', { provider }).then((result) => {
      embeddingProvider.value = provider
      return result
    })
  }

  /**
   * Update API keys in the worker (e.g., when user changes keys).
   * Fire-and-forget — no response expected.
   */
  function updateApiKeys() {
    if (!worker) return
    const apiKey = localStorage.getItem('nanobanana-api-key') || ''
    const freeApiKey = localStorage.getItem('nanobanana-free-tier-api-key') || ''
    worker.postMessage({ type: 'updateApiKeys', apiKey, freeApiKey })
  }

  /**
   * Terminate the worker and clean up.
   */
  function terminate() {
    unregisterEvents()
    if (worker) {
      worker.terminate()
      worker = null
    }
    // Reject all pending requests before clearing
    for (const [, pending] of pendingRequests) {
      pending.reject(new Error('Worker terminated'))
    }
    pendingRequests.clear()
    // Reset state
    isReady.value = false
    isModelLoading.value = false
    modelProgress.value = 0
    modelStatus.value = ''
    modelStage.value = ''
    indexedCount.value = 0
    indexingProgress.value = { current: 0, total: 0 }
    embeddingCost.value = { totalTokens: 0, estimatedCostUsd: 0 }
    embeddingProvider.value = null
    error.value = null
    initPromise = null
    initResolve = null
    initReject = null
  }

  return {
    // Reactive state
    isReady,
    isModelLoading,
    modelProgress,
    modelStatus,
    modelStage,
    indexedCount,
    indexingProgress,
    embeddingCost,
    embeddingProvider,
    error,
    // Methods
    initialize,
    search,
    indexRecords,
    removeRecords,
    removeAll,
    selfHeal,
    persistIndex,
    diagnose,
    updateApiKeys,
    switchProvider,
    terminate,
  }
}
