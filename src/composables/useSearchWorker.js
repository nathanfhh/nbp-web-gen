/**
 * Singleton composable for RAG search worker management.
 * Provides reactive state and methods for hybrid search (BM25 + semantic).
 *
 * Module-level singleton pattern — one Worker instance shared across all components.
 * Worker is lazy-initialized on first `initialize()` call.
 */
import { ref } from 'vue'

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
        })
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
        if (initReject) {
          initReject(new Error(errMsg))
          initResolve = null
          initReject = null
        }
      }
      break
    }
  }
}

// ============================================================================
// CustomEvent Listeners for History Sync
// ============================================================================

function handleHistoryAdded(event) {
  if (!isReady.value || !worker) return
  const { id, record } = event.detail || {}
  if (!id || !record) return

  // Agent records are indexed via selfHeal (conversation may not be saved yet)
  if (record.mode === 'agent') return

  // Strip heavy fields (images, thumbnails, etc.) — worker only needs text metadata
  const stripped = { id, mode: record.mode, prompt: record.prompt, timestamp: record.timestamp }
  if (record.mode === 'slides' && record.options?.pagesContent) {
    stripped.options = { pagesContent: record.options.pagesContent }
  }

  // Index the new record in background (fire-and-forget)
  sendRequest('index', { records: [{ record: stripped }] })
    .then(() => {
      sendRequest('persist').catch(() => {})
    })
    .catch(() => {})
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

function handleHistoryImported() {
  // On import, trigger a full selfHeal cycle
  // The SearchModal will handle the actual re-indexing when opened
  // For now, just note that a re-sync is needed
}

let eventsRegistered = false
function registerEvents() {
  if (eventsRegistered) return
  eventsRegistered = true
  window.addEventListener('nbp-history-added', handleHistoryAdded)
  window.addEventListener('nbp-history-deleted', handleHistoryDeleted)
  window.addEventListener('nbp-history-cleared', handleHistoryCleared)
  window.addEventListener('nbp-history-imported', handleHistoryImported)
}

function unregisterEvents() {
  if (!eventsRegistered) return
  eventsRegistered = false
  window.removeEventListener('nbp-history-added', handleHistoryAdded)
  window.removeEventListener('nbp-history-deleted', handleHistoryDeleted)
  window.removeEventListener('nbp-history-cleared', handleHistoryCleared)
  window.removeEventListener('nbp-history-imported', handleHistoryImported)
}

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
        }

        // Register sync events
        registerEvents()

        // Send init command
        worker.postMessage({ type: 'init' })
      } catch (err) {
        error.value = err.message
        isModelLoading.value = false
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
   * Terminate the worker and clean up.
   */
  function terminate() {
    unregisterEvents()
    if (worker) {
      worker.terminate()
      worker = null
    }
    // Reset state
    isReady.value = false
    isModelLoading.value = false
    modelProgress.value = 0
    modelStatus.value = ''
    modelStage.value = ''
    indexedCount.value = 0
    indexingProgress.value = { current: 0, total: 0 }
    error.value = null
    initPromise = null
    initResolve = null
    initReject = null
    pendingRequests.clear()
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
    terminate,
  }
}
