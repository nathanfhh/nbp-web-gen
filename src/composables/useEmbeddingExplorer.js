/**
 * Embedding Explorer Composable
 *
 * Manages the full pipeline:
 * 1. Read embedding snapshots from IndexedDB (nanobanana-search)
 * 2. Sample data via Fisher-Yates shuffle
 * 3. Send vectors to UMAP Web Worker for 3D reduction
 * 4. Persist user preferences to localStorage
 */

import { ref, reactive } from 'vue'

// ============================================================================
// Constants
// ============================================================================

const DB_NAME = 'nanobanana-search'
const DB_STORE = 'orama-snapshot'
const DB_VERSION = 3

const LS_KEYS = {
  sampleSize: 'sds_sample_size',
  useFullData: 'sds_use_full_data',
  dataSource: 'sds_data_source',
  colorBy: 'sds_color_by',
  hoverText: 'sds_hover_text',
  hoverLength: 'sds_hover_length',
}

// ============================================================================
// localStorage helpers
// ============================================================================

function loadNumber(key, fallback) {
  const v = localStorage.getItem(key)
  if (v === null) return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function loadString(key, fallback) {
  return localStorage.getItem(key) || fallback
}

function loadBool(key, fallback) {
  const v = localStorage.getItem(key)
  if (v === null) return fallback
  return v === 'true'
}

function save(key, value) {
  localStorage.setItem(key, String(value))
}

// ============================================================================
// IndexedDB reader (read-only, standalone — does NOT touch search worker)
// ============================================================================

function openSnapshotDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE)
      }
    }
  })
}

async function loadSnapshot(provider) {
  let db
  try {
    db = await openSnapshotDB()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly')
      const store = tx.objectStore(DB_STORE)
      const request = store.get(`snapshot-${provider}`)
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
      tx.oncomplete = () => db.close()
      tx.onerror = () => db.close()
    })
  } catch {
    if (db) db.close()
    return null
  }
}

// ============================================================================
// Fisher-Yates sampling
// ============================================================================

function fisherYatesSample(arr, n) {
  if (n >= arr.length) return arr.slice()
  const sampled = arr.slice()
  for (let i = sampled.length - 1; i > sampled.length - 1 - n; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[sampled[i], sampled[j]] = [sampled[j], sampled[i]]
  }
  return sampled.slice(sampled.length - n)
}

// ============================================================================
// Composable
// ============================================================================

export function useEmbeddingExplorer() {
  // --- Settings (persisted to localStorage) ---
  const settings = reactive({
    sampleSize: loadNumber(LS_KEYS.sampleSize, 100),
    useFullData: loadBool(LS_KEYS.useFullData, false),
    dataSource: loadString(LS_KEYS.dataSource, 'local'),
    colorBy: loadString(LS_KEYS.colorBy, 'mode'),
    hoverText: loadString(LS_KEYS.hoverText, 'truncate'),
    hoverLength: loadNumber(LS_KEYS.hoverLength, 50),
  })

  // --- State ---
  const isProcessing = ref(false)
  const errorMessage = ref('')
  const plotData = ref(null) // { docs, coordinates } after UMAP
  const snapshotDocCount = ref(0) // total docs available in snapshot

  let worker = null

  // --- Persist settings ---
  function persistSettings() {
    save(LS_KEYS.sampleSize, settings.sampleSize)
    save(LS_KEYS.useFullData, settings.useFullData)
    save(LS_KEYS.dataSource, settings.dataSource)
    save(LS_KEYS.colorBy, settings.colorBy)
    save(LS_KEYS.hoverText, settings.hoverText)
    save(LS_KEYS.hoverLength, settings.hoverLength)
  }

  // --- Load & process ---
  async function startProcess() {
    errorMessage.value = ''
    plotData.value = null
    isProcessing.value = true
    persistSettings()

    try {
      // 1. Load snapshot
      const snapshot = await loadSnapshot(settings.dataSource)
      if (!snapshot || !snapshot.docs || snapshot.docs.length === 0) {
        throw new Error('NO_DATA')
      }

      // Filter docs with valid embeddings
      const validDocs = snapshot.docs.filter(
        (d) => d.embedding && d.embedding.length > 0 && d.embedding.some((v) => v !== 0),
      )
      if (validDocs.length === 0) {
        throw new Error('NO_EMBEDDINGS')
      }
      snapshotDocCount.value = validDocs.length

      // 2. Sample
      const sampled = settings.useFullData
        ? validDocs
        : fisherYatesSample(validDocs, settings.sampleSize)

      if (sampled.length < 4) {
        throw new Error('TOO_FEW')
      }

      // 3. Extract vectors
      const vectors = sampled.map((d) => d.embedding)

      // 4. UMAP via worker
      const coordinates = await runUMAP(vectors)

      // 5. Store result
      plotData.value = { docs: sampled, coordinates }
    } catch (err) {
      errorMessage.value = err.message || 'Unknown error'
    } finally {
      isProcessing.value = false
    }
  }

  function runUMAP(vectors) {
    return new Promise((resolve, reject) => {
      terminateWorker()
      worker = new Worker(new URL('@/workers/umap.worker.js', import.meta.url), {
        type: 'module',
      })

      worker.onmessage = (e) => {
        const { type, coordinates, message } = e.data
        if (type === 'result') {
          resolve(coordinates)
        } else if (type === 'error') {
          reject(new Error(message))
        }
        terminateWorker()
      }

      worker.onerror = (e) => {
        reject(new Error(e.message || 'Worker crashed'))
        terminateWorker()
      }

      worker.postMessage({ type: 'reduce', vectors })
    })
  }

  function terminateWorker() {
    if (worker) {
      worker.terminate()
      worker = null
    }
  }

  // --- Cleanup ---
  function cleanup() {
    terminateWorker()
    plotData.value = null
    isProcessing.value = false
    errorMessage.value = ''
  }

  return {
    settings,
    isProcessing,
    errorMessage,
    plotData,
    snapshotDocCount,
    startProcess,
    persistSettings,
    cleanup,
  }
}
