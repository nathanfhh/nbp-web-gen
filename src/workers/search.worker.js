/**
 * RAG Search Web Worker
 * Long-lived worker for hybrid search: BM25 (Orama) + semantic (multilingual-e5-small)
 *
 * Architecture: Snapshot + SelfHeal
 *   - Full Orama document snapshot persisted to IndexedDB (nanobanana-search)
 *   - On cold start: restore from snapshot → bulk insert → immediately searchable
 *   - SelfHeal runs in background to detect deltas (new/deleted records)
 *   - Embedding vectors computed on-demand for new records only
 *
 * Communication Protocol:
 * Main → Worker:
 *   { type: 'init' }
 *   { type: 'search', requestId, query, mode, strategy }
 *   { type: 'index', requestId, records }
 *   { type: 'remove', requestId, parentIds }
 *   { type: 'removeAll', requestId }
 *   { type: 'selfHeal', requestId, allHistoryIds }
 *   { type: 'persist', requestId }
 *   { type: 'diagnose', requestId }
 *
 * Worker → Main:
 *   { type: 'ready', indexedCount }
 *   { type: 'searchResult', requestId, hits, elapsed }
 *   { type: 'indexed', requestId, count, parentCount }
 *   { type: 'removed', requestId }
 *   { type: 'removedAll', requestId }
 *   { type: 'selfHealResult', requestId, missingIds }
 *   { type: 'persisted', requestId }
 *   { type: 'diagnoseResult', requestId, ... }
 *   { type: 'modelProgress', stage, value, message }
 *   { type: 'progress', requestId, value, message }
 *   { type: 'error', requestId?, message }
 */

import { create, search, insertMultiple, removeMultiple } from '@orama/orama'
import { pipeline } from '@huggingface/transformers'

import { extractText, chunkText, extractAgentUserMessages, SEARCH_DEFAULTS } from '../utils/search-core.js'

// ============================================================================
// Constants
// ============================================================================

const DB_NAME = 'nanobanana-search'
const DB_STORE = 'orama-snapshot'
const DB_VERSION = 3 // v3: full doc snapshot (v2 was embedding-only cache, v1 was unused)
const EMBEDDING_MODEL = 'intfloat/multilingual-e5-small'
const EMBEDDING_DIMS = 384
const BATCH_SIZE = 50 // Documents per indexing batch
const MAX_CACHE_ENTRIES = 5000 // In-memory embedding cache cap (not persisted)

// ============================================================================
// Singleton State
// ============================================================================

let oramaDb = null
let embedder = null
let indexedParentIds = new Set()
let isInitialized = false

/**
 * Snapshot documents — mirrors Orama contents for fast snapshot persistence.
 * Each entry: { parentId, chunkIndex, chunkText, mode, timestamp, embedding }
 * Persisted to IndexedDB on `persist` command.
 */
let snapshotDocs = []

/**
 * In-memory embedding cache for within-session optimization.
 * NOT persisted — avoids re-computing embeddings when re-indexing in the same session.
 * Key: "parentId:chunkIndex"
 * Value: Array<number> (plain array, 384 dims)
 */
const embeddingCache = new Map()

/**
 * Tracks Orama internal doc IDs per parent for reliable removal.
 * Avoids relying on empty-term search which may behave unexpectedly
 * with custom tokenizers.
 * Key: parentId (string)
 * Value: Set<string> (Orama internal doc IDs)
 */
const parentDocIds = new Map()

// ============================================================================
// IndexedDB Helpers (Orama snapshot persistence)
// ============================================================================

function openSnapshotDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = (event) => {
      const db = event.target.result
      // Clean up stores from all previous versions
      if (db.objectStoreNames.contains('embedding-cache')) {
        db.deleteObjectStore('embedding-cache')
      }
      if (db.objectStoreNames.contains('orama-snapshot')) {
        db.deleteObjectStore('orama-snapshot')
      }
      db.createObjectStore(DB_STORE)
    }
  })
}

async function loadSnapshot() {
  let db
  try {
    db = await openSnapshotDB()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly')
      const store = tx.objectStore(DB_STORE)
      const request = store.get('docs')
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

async function saveSnapshot() {
  let db
  try {
    db = await openSnapshotDB()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite')
      const store = tx.objectStore(DB_STORE)
      const request = store.put(snapshotDocs, 'docs')
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
      tx.oncomplete = () => db.close()
      tx.onerror = () => db.close()
    })
  } catch (err) {
    if (db) db.close()
    throw err
  }
}

async function clearSnapshot() {
  let db
  try {
    db = await openSnapshotDB()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite')
      const store = tx.objectStore(DB_STORE)
      const request = store.clear()
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
      tx.oncomplete = () => db.close()
      tx.onerror = () => db.close()
    })
  } catch {
    if (db) db.close()
    // Non-critical
  }
}

// ============================================================================
// CJK-aware Tokenizer (bilingual: Chinese/Japanese/Korean + Latin)
// ============================================================================

/**
 * Detect if a character is CJK (Chinese, Japanese, Korean).
 * Covers CJK Unified Ideographs, Hiragana, Katakana, Hangul, Fullwidth forms.
 */
function isCJK(char) {
  const code = char.codePointAt(0)
  return (
    (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
    (code >= 0x3400 && code <= 0x4dbf) || // CJK Extension A
    (code >= 0x20000 && code <= 0x2a6df) || // CJK Extension B
    (code >= 0x3040 && code <= 0x309f) || // Hiragana
    (code >= 0x30a0 && code <= 0x30ff) || // Katakana
    (code >= 0xac00 && code <= 0xd7af) || // Korean Hangul
    (code >= 0xff00 && code <= 0xffef) // Fullwidth Forms
  )
}

/**
 * Bilingual tokenizer: CJK characters → unigrams + bigrams; Latin → whitespace split.
 * This fixes the core issue: Orama's default tokenizer splits on spaces,
 * but Chinese text has no spaces → entire text becomes ONE token → no partial match.
 */
function createBilingualTokenizer() {
  return {
    language: 'multilingual',
    normalizationCache: new Map(),
    tokenize(raw) {
      if (!raw || typeof raw !== 'string') return []
      const text = raw.toLowerCase().trim()
      if (!text) return []

      const tokens = new Set()
      let latinBuffer = ''

      for (let i = 0; i < text.length; i++) {
        const char = text[i]

        if (isCJK(char)) {
          // Flush accumulated Latin text
          if (latinBuffer) {
            for (const token of latinBuffer.split(/[\s\p{P}]+/u).filter(Boolean)) {
              tokens.add(token)
            }
            latinBuffer = ''
          }
          // Unigram (single character)
          tokens.add(char)
          // Bigram (adjacent pair) — enables matching multi-char words
          if (i + 1 < text.length && isCJK(text[i + 1])) {
            tokens.add(char + text[i + 1])
          }
        } else {
          latinBuffer += char
        }
      }

      // Flush remaining Latin buffer
      if (latinBuffer) {
        for (const token of latinBuffer.split(/[\s\p{P}]+/u).filter(Boolean)) {
          tokens.add(token)
        }
      }

      return [...tokens]
    },
  }
}

// ============================================================================
// Orama Schema
// ============================================================================

const ORAMA_SCHEMA = {
  parentId: 'string',
  chunkIndex: 'number',
  chunkText: 'string',
  mode: 'string',
  timestamp: 'number',
  embedding: `vector[${EMBEDDING_DIMS}]`,
}

function createFreshDb() {
  return create({
    schema: ORAMA_SCHEMA,
    components: {
      tokenizer: createBilingualTokenizer(),
    },
  })
}

// ============================================================================
// Embedding
// ============================================================================

async function initEmbedder() {
  self.postMessage({ type: 'modelProgress', stage: 'download', value: 0, message: 'Loading embedding model...' })

  // Track per-file progress to compute stable overall percentage
  const fileProgress = new Map()

  embedder = await pipeline('feature-extraction', EMBEDDING_MODEL, {
    device: 'auto',
    dtype: 'fp32',
    progress_callback: (progress) => {
      if (progress.status === 'initiate' && progress.file) {
        fileProgress.set(progress.file, 0)
      } else if (progress.status === 'progress' && progress.file && progress.progress != null) {
        fileProgress.set(progress.file, progress.progress)
        // Compute overall progress as average across all tracked files
        let total = 0
        for (const p of fileProgress.values()) total += p
        const overall = Math.round(total / fileProgress.size)
        self.postMessage({
          type: 'modelProgress',
          stage: 'download',
          value: overall,
          message: progress.file,
        })
      } else if (progress.status === 'done' && progress.file) {
        fileProgress.set(progress.file, 100)
        // Check if all tracked files finished downloading → model is initializing
        const allDone = [...fileProgress.values()].every((v) => v >= 100)
        if (allDone) {
          self.postMessage({
            type: 'modelProgress',
            stage: 'init',
            value: 100,
            message: 'Initializing model...',
          })
        }
      } else if (progress.status === 'ready') {
        self.postMessage({
          type: 'modelProgress',
          stage: 'ready',
          value: 100,
          message: 'Model ready',
        })
      }
    },
  })
}

/**
 * Generate embeddings for an array of texts using E5 prefix convention.
 * @param {string[]} texts
 * @param {'passage'|'query'} prefix
 * @returns {Promise<Array<Array<number>>>}
 */
async function embed(texts, prefix = 'passage') {
  if (!embedder || texts.length === 0) return []

  const prefixed = texts.map((t) => `${prefix}: ${t}`)
  const output = await embedder(prefixed, { pooling: 'mean', normalize: true })

  // output.tolist() returns Array<Array<number>> — keep as plain arrays for Orama
  return output.tolist()
}

// ============================================================================
// Indexing (cache-aware)
// ============================================================================

/**
 * Index a single history record into Orama.
 * Checks embedding cache first — only generates new embeddings for uncached chunks.
 */
async function indexRecord(record, conversation = null) {
  const parentId = String(record.id)
  const mode = record.mode || ''
  const timestamp = record.timestamp || 0

  // Extract and chunk text
  const fullText = extractText(record, conversation)
  if (!fullText || fullText.trim().length === 0) return 0

  let chunks
  if (mode === 'agent' && conversation) {
    const userMsgs = extractAgentUserMessages(conversation)
    chunks = userMsgs.map((m, i) => ({ text: m.text, index: i }))
  } else {
    chunks = chunkText(fullText)
  }

  if (chunks.length === 0) return 0

  // Check cache for existing embeddings
  const embeddings = new Array(chunks.length)
  const uncachedIndices = []

  for (let i = 0; i < chunks.length; i++) {
    const cacheKey = `${parentId}:${chunks[i].index}`
    const cached = embeddingCache.get(cacheKey)
    if (cached) {
      embeddings[i] = cached
    } else {
      uncachedIndices.push(i)
    }
  }

  // Generate embeddings only for uncached chunks
  if (uncachedIndices.length > 0) {
    const uncachedTexts = uncachedIndices.map((i) => chunks[i].text)
    let newEmbeddings = []
    const embStart = performance.now()
    try {
      newEmbeddings = await embed(uncachedTexts, 'passage')
    } catch (err) {
      console.warn('[search.worker] Embedding failed for uncached chunks:', err.message)
    }
    const embTime = Math.round(performance.now() - embStart)
    console.log(`[search.worker] Embedded ${uncachedTexts.length} chunks for parent=${parentId} (${embTime}ms, cached=${chunks.length - uncachedIndices.length})`)
    for (let j = 0; j < uncachedIndices.length; j++) {
      const i = uncachedIndices[j]
      const embedding = newEmbeddings[j] || new Array(EMBEDDING_DIMS).fill(0)
      embeddings[i] = embedding
      // Cache the new embedding
      embeddingCache.set(`${parentId}:${chunks[i].index}`, embedding)
    }
  }

  // Insert into Orama
  const docs = chunks.map((chunk, i) => ({
    parentId,
    chunkIndex: chunk.index,
    chunkText: chunk.text,
    mode,
    timestamp,
    embedding: embeddings[i] || new Array(EMBEDDING_DIMS).fill(0),
  }))

  const insertedIds = await insertMultiple(oramaDb, docs)
  indexedParentIds.add(parentId)

  // Track Orama internal doc IDs for reliable removal
  if (!parentDocIds.has(parentId)) parentDocIds.set(parentId, new Set())
  const docIdSet = parentDocIds.get(parentId)
  for (const docId of insertedIds) {
    docIdSet.add(docId)
  }

  // Add to snapshot for persistence (strip any Orama-injected fields like id)
  for (const doc of docs) {
    snapshotDocs.push({
      parentId: doc.parentId,
      chunkIndex: doc.chunkIndex,
      chunkText: doc.chunkText,
      mode: doc.mode,
      timestamp: doc.timestamp,
      embedding: doc.embedding,
    })
  }

  // Evict oldest in-memory cache entries if over limit
  if (embeddingCache.size > MAX_CACHE_ENTRIES) {
    const excess = embeddingCache.size - MAX_CACHE_ENTRIES
    const keys = embeddingCache.keys()
    for (let i = 0; i < excess; i++) {
      embeddingCache.delete(keys.next().value)
    }
  }

  return docs.length
}

// ============================================================================
// Search
// ============================================================================

/**
 * Perform search against Orama DB.
 * @param {string} query - User query
 * @param {Object} options
 * @param {string} options.mode - Filter by mode ('' for all)
 * @param {'hybrid'|'vector'|'fulltext'} options.strategy - Search strategy
 * @returns {Promise<{ hits: Array, elapsed: number }>}
 */
async function performSearch(query, { mode = '', strategy = 'hybrid' } = {}) {
  if (!oramaDb || !query?.trim()) return { hits: [], elapsed: 0 }

  const start = performance.now()

  // Build where filter
  const where = {}
  if (mode) {
    where.mode = mode
  }

  let results

  if (strategy === 'fulltext') {
    results = await search(oramaDb, {
      term: query,
      properties: ['chunkText'],
      limit: SEARCH_DEFAULTS.searchLimit,
      ...(Object.keys(where).length > 0 ? { where } : {}),
    })
    console.log(`[search.worker] Fulltext search: "${query}" → ${results?.hits?.length || 0} hits`)
  } else if (strategy === 'vector') {
    const embStart = performance.now()
    const [queryVec] = await embed([query], 'query')
    const embTime = Math.round(performance.now() - embStart)
    console.log(
      `[search.worker] Query embedding: "${query}" → [${queryVec.slice(0, 8).map((v) => v.toFixed(4)).join(', ')}, ...] (${queryVec.length}d, ${embTime}ms)`,
    )
    results = await search(oramaDb, {
      mode: 'vector',
      vector: {
        value: queryVec,
        property: 'embedding',
      },
      limit: SEARCH_DEFAULTS.searchLimit,
      similarity: 0.5,
      ...(Object.keys(where).length > 0 ? { where } : {}),
    })
  } else {
    // hybrid (default)
    const embStart = performance.now()
    const [queryVec] = await embed([query], 'query')
    const embTime = Math.round(performance.now() - embStart)
    console.log(
      `[search.worker] Query embedding: "${query}" → [${queryVec.slice(0, 8).map((v) => v.toFixed(4)).join(', ')}, ...] (${queryVec.length}d, ${embTime}ms)`,
    )
    results = await search(oramaDb, {
      mode: 'hybrid',
      term: query,
      properties: ['chunkText'],
      vector: {
        value: queryVec,
        property: 'embedding',
      },
      limit: SEARCH_DEFAULTS.searchLimit,
      similarity: 0.5,
      ...(Object.keys(where).length > 0 ? { where } : {}),
    })
  }

  const elapsed = Math.round(performance.now() - start)

  const hits = (results?.hits || []).map((hit) => ({
    parentId: hit.document.parentId,
    chunkIndex: hit.document.chunkIndex,
    chunkText: hit.document.chunkText,
    mode: hit.document.mode,
    timestamp: hit.document.timestamp,
    score: hit.score,
  }))

  return { hits, elapsed }
}

// ============================================================================
// Remove
// ============================================================================

async function removeByParentIds(parentIds) {
  if (!oramaDb) return

  const removedPids = new Set()

  for (const parentId of parentIds) {
    const pid = String(parentId)
    removedPids.add(pid)

    // Use tracked doc IDs for reliable removal (no empty-term search needed)
    const docIds = parentDocIds.get(pid)
    if (docIds && docIds.size > 0) {
      await removeMultiple(oramaDb, [...docIds])
      parentDocIds.delete(pid)
    }
    indexedParentIds.delete(pid)
  }

  // Remove from snapshot
  snapshotDocs = snapshotDocs.filter((d) => !removedPids.has(d.parentId))

  // Clean embedding cache in single pass (O(n) instead of O(n*m))
  const keysToDelete = []
  for (const key of embeddingCache.keys()) {
    const sepIndex = key.indexOf(':')
    if (sepIndex !== -1 && removedPids.has(key.slice(0, sepIndex))) {
      keysToDelete.push(key)
    }
  }
  for (const key of keysToDelete) {
    embeddingCache.delete(key)
  }
}

function removeAllDocs() {
  oramaDb = createFreshDb()
  indexedParentIds.clear()
  embeddingCache.clear()
  parentDocIds.clear()
  snapshotDocs = []
}

// ============================================================================
// Self-Heal
// ============================================================================

async function selfHeal(allHistoryIds) {
  const allIds = new Set(allHistoryIds.map(String))

  // Find IDs present in history but not in index
  const missingIds = []
  for (const id of allIds) {
    if (!indexedParentIds.has(id)) {
      missingIds.push(id)
    }
  }

  // Find orphan IDs in index but not in history — remove them
  const orphanIds = []
  for (const id of indexedParentIds) {
    if (!allIds.has(id)) {
      orphanIds.push(id)
    }
  }
  if (orphanIds.length > 0) {
    await removeByParentIds(orphanIds)
  }

  return missingIds
}

// ============================================================================
// Initialization
// ============================================================================

async function initialize() {
  if (isInitialized) {
    self.postMessage({ type: 'ready', indexedCount: indexedParentIds.size })
    return
  }

  try {
    // 1. Load snapshot from IndexedDB
    const savedDocs = await loadSnapshot()

    // 2. Create fresh Orama DB with custom CJK tokenizer
    oramaDb = createFreshDb()

    // 3. If snapshot exists, bulk-insert → immediately searchable (no embedding needed)
    if (Array.isArray(savedDocs) && savedDocs.length > 0) {
      // Sanitize: ensure every doc has a valid embedding array (null/undefined → zero vector)
      const zeroVec = new Array(EMBEDDING_DIMS).fill(0)
      snapshotDocs = savedDocs.map((doc) => ({
        ...doc,
        embedding: Array.isArray(doc.embedding) ? doc.embedding : zeroVec,
      }))
      const insertedIds = await insertMultiple(oramaDb, snapshotDocs)

      // Rebuild tracking maps from restored snapshot
      for (let i = 0; i < snapshotDocs.length; i++) {
        const pid = snapshotDocs[i].parentId
        indexedParentIds.add(pid)
        if (!parentDocIds.has(pid)) parentDocIds.set(pid, new Set())
        parentDocIds.get(pid).add(insertedIds[i])
      }
      console.log(
        `[search.worker] Restored ${snapshotDocs.length} docs (${indexedParentIds.size} records) from snapshot`,
      )
    }

    // 4. Load embedding model (for new records and semantic queries)
    await initEmbedder()

    isInitialized = true
    self.postMessage({ type: 'ready', indexedCount: indexedParentIds.size })
  } catch (err) {
    self.postMessage({ type: 'error', message: `Init failed: ${err.message}` })
  }
}

// ============================================================================
// Message Handler
// ============================================================================

self.addEventListener('message', async (event) => {
  const { type, requestId } = event.data

  try {
    switch (type) {
      case 'init': {
        await initialize()
        break
      }

      case 'search': {
        const { query, mode, strategy } = event.data
        const result = await performSearch(query, { mode, strategy })
        self.postMessage({ type: 'searchResult', requestId, ...result })
        break
      }

      case 'index': {
        const { records } = event.data
        let totalChunks = 0

        for (let i = 0; i < records.length; i += BATCH_SIZE) {
          const batch = records.slice(i, i + BATCH_SIZE)

          for (const item of batch) {
            const count = await indexRecord(item.record, item.conversation || null)
            totalChunks += count
          }

          // Report progress
          const processed = Math.min(i + BATCH_SIZE, records.length)
          self.postMessage({
            type: 'progress',
            requestId,
            value: processed,
            total: records.length,
            message: `Indexed ${processed}/${records.length}`,
          })
        }

        self.postMessage({ type: 'indexed', requestId, count: totalChunks, parentCount: indexedParentIds.size })
        break
      }

      case 'remove': {
        await removeByParentIds(event.data.parentIds)
        self.postMessage({ type: 'removed', requestId })
        break
      }

      case 'removeAll': {
        removeAllDocs()
        await clearSnapshot()
        self.postMessage({ type: 'removedAll', requestId })
        break
      }

      case 'selfHeal': {
        const missingIds = await selfHeal(event.data.allHistoryIds)
        self.postMessage({ type: 'selfHealResult', requestId, missingIds })
        break
      }

      case 'diagnose': {
        // Use snapshotDocs directly (reliable — avoids empty-term search with custom tokenizer)
        const parents = new Set()
        const chunksByParent = {}
        for (const doc of snapshotDocs) {
          parents.add(doc.parentId)
          chunksByParent[doc.parentId] = (chunksByParent[doc.parentId] || 0) + 1
        }

        // Sample document for quality inspection
        let sampleDoc = null
        let hasNonZeroVectors = false
        if (snapshotDocs.length > 0) {
          const sample = snapshotDocs[0]
          hasNonZeroVectors =
            Array.isArray(sample.embedding) && sample.embedding.some((v) => v !== 0)
          sampleDoc = {
            parentId: sample.parentId,
            chunkIndex: sample.chunkIndex,
            chunkText: sample.chunkText?.substring(0, 80),
            mode: sample.mode,
            embeddingDims: sample.embedding?.length,
            embeddingNonZero: hasNonZeroVectors,
            embeddingSample: sample.embedding?.slice(0, 5).map((v) => +v.toFixed(4)),
          }
        }

        // Chunking distribution
        const chunkDist = {}
        for (const count of Object.values(chunksByParent)) {
          chunkDist[count] = (chunkDist[count] || 0) + 1
        }

        self.postMessage({
          type: 'diagnoseResult',
          requestId,
          totalDocs: snapshotDocs.length,
          uniqueParents: parents.size,
          parentIds: [...parents].slice(0, 50),
          embeddingCacheSize: embeddingCache.size,
          sampleDoc,
          hasNonZeroVectors,
          chunkDistribution: chunkDist,
        })
        break
      }

      case 'persist': {
        await saveSnapshot()
        self.postMessage({ type: 'persisted', requestId })
        break
      }

      default:
        self.postMessage({ type: 'error', requestId, message: `Unknown message type: ${type}` })
    }
  } catch (err) {
    self.postMessage({ type: 'error', requestId, message: err.message })
  }
})
