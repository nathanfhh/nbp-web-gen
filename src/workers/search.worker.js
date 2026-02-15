/**
 * RAG Search Web Worker
 * Long-lived worker for hybrid search: BM25 (Orama) + semantic (dual embedding provider)
 *
 * Architecture: Snapshot + SelfHeal
 *   - Full Orama document snapshot persisted to IndexedDB (nanobanana-search)
 *   - On cold start: restore from snapshot → bulk insert → immediately searchable
 *   - SelfHeal runs in background to detect deltas (new/deleted records)
 *   - Dual embedding providers: Gemini API (768d) or local Transformers.js (384d)
 *
 * Communication Protocol:
 * Main → Worker:
 *   { type: 'init', apiKey?, freeApiKey?, provider? }
 *   { type: 'updateApiKeys', apiKey?, freeApiKey? }
 *   { type: 'switchProvider', requestId, provider }
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
 *   { type: 'providerSwitched', requestId, provider, needBackfill, indexedCount }
 *   { type: 'modelProgress', stage, value, message }
 *   { type: 'progress', requestId, value, message }
 *   { type: 'error', requestId?, message }
 */

import { create, search, insertMultiple, removeMultiple } from '@orama/orama'

import { extractText, chunkText, extractAgentUserMessages, SEARCH_DEFAULTS } from '../utils/search-core.js'

// ============================================================================
// Constants
// ============================================================================

const DB_NAME = 'nanobanana-search'
const DB_STORE = 'orama-snapshot'
const DB_VERSION = 3 // v3: full doc snapshot (v2 was embedding-only cache, v1 was unused)
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const EMBEDDING_BATCH_API_LIMIT = 100 // Max texts per batchEmbedContents request
const BATCH_SIZE = 50 // Documents per indexing batch
const MAX_CACHE_ENTRIES = 5000 // In-memory document embedding cache cap (not persisted)

const PROVIDER_CONFIG = {
  gemini: { dims: 768, model: 'gemini-embedding-001' },
  local: { dims: 384, model: 'intfloat/multilingual-e5-small' },
}

// Snapshot config version — bump when chunk/search parameters change to force rebuild.
// Does NOT include model info: snapshot now stores dual embeddings for both providers.
const SNAPSHOT_CONFIG_VERSION = `cs${SEARCH_DEFAULTS.chunkSize}_co${SEARCH_DEFAULTS.chunkOverlap}_cw${SEARCH_DEFAULTS.contextWindow}`

// ============================================================================
// Query Embedding LRU Cache
// ============================================================================

class QueryEmbeddingLRU {
  constructor(capacity = 128) {
    this.cache = new Map()
    this.capacity = capacity
  }

  get(key) {
    const v = this.cache.get(key)
    if (v !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key)
      this.cache.set(key, v)
    }
    return v
  }

  set(key, value) {
    if (this.cache.has(key)) this.cache.delete(key)
    else if (this.cache.size >= this.capacity) this.cache.delete(this.cache.keys().next().value)
    this.cache.set(key, value)
  }

  clear() {
    this.cache.clear()
  }
}

// ============================================================================
// Singleton State
// ============================================================================

let oramaDb = null
let indexedParentIds = new Set()
let isInitialized = false

// API keys for Gemini Embedding (passed from main thread)
let apiKeyPrimary = null // Paid key
let apiKeyFree = null // Free tier key (preferred for text usage)

// Free tier backoff: skip free key for 1 hour after 429
let freeKeyExhausted = false
let freeKeyResetTimer = null
const FREE_KEY_COOLDOWN_MS = 60 * 60 * 1000 // 1 hour

// Active embedding provider: 'gemini' | 'local' | null
let activeProvider = null

// Transformers.js pipeline for local embedding (lazy loaded)
let localPipeline = null

// Session-level embedding cost tracking (Gemini only)
let sessionEmbeddingTokens = 0

// Query embedding LRU cache (128 entries × 768 dims × 8 bytes ≈ 768 KB max)
const queryEmbeddingCache = new QueryEmbeddingLRU(128)

/**
 * Snapshot documents — mirrors Orama contents for fast snapshot persistence.
 * v3 format: dual embedding fields (embeddingGemini + embeddingLocal).
 * Persisted to IndexedDB on `persist` command.
 */
let snapshotDocs = []

/**
 * In-memory document embedding cache for within-session optimization.
 * NOT persisted — avoids re-computing embeddings when re-indexing in the same session.
 * Key: "provider:parentId:chunkIndex"
 * Value: Array<number> (plain array)
 */
const embeddingCache = new Map()

/**
 * Tracks Orama internal doc IDs per parent for reliable removal.
 * Key: parentId (string)
 * Value: Set<string> (Orama internal doc IDs)
 */
const parentDocIds = new Map()

/**
 * Context text map — stores broader parent context for each chunk.
 * Key: "parentId:chunkIndex"
 * Value: string (contextText ~500 chars)
 * NOT stored in Orama schema (avoids BM25 indexing context text).
 * Persisted in snapshotDocs and rebuilt on restore.
 */
const contextTextMap = new Map()

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
      const request = store.put({ version: 3, configVersion: SNAPSHOT_CONFIG_VERSION, docs: snapshotDocs }, 'docs')
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
// Orama Schema (dynamic vector dimensions)
// ============================================================================

function createFreshDb(provider) {
  const dims = provider ? PROVIDER_CONFIG[provider].dims : 768
  return create({
    schema: {
      parentId: 'string',
      chunkIndex: 'number',
      chunkText: 'string',
      mode: 'string',
      timestamp: 'number',
      embedding: `vector[${dims}]`,
    },
    components: {
      tokenizer: createBilingualTokenizer(),
    },
  })
}

// ============================================================================
// Gemini Embedding API
// ============================================================================

/**
 * Get the best available API key (free tier first, then paid).
 * Skips free key when it has been rate-limited (429 backoff).
 * @returns {string|null}
 */
function getApiKey() {
  if (apiKeyFree && !freeKeyExhausted) return apiKeyFree
  return apiKeyPrimary || null
}

/**
 * Mark free tier key as exhausted after 429. Resets after cooldown.
 */
function markFreeKeyExhausted() {
  if (freeKeyExhausted) return // already backed off
  freeKeyExhausted = true
  console.warn(`[search.worker] Free tier key backed off for ${FREE_KEY_COOLDOWN_MS / 60000} min`)
  if (freeKeyResetTimer) clearTimeout(freeKeyResetTimer)
  freeKeyResetTimer = setTimeout(() => {
    freeKeyExhausted = false
    freeKeyResetTimer = null
    console.log('[search.worker] Free tier backoff reset, will retry on next call')
  }, FREE_KEY_COOLDOWN_MS)
}

/**
 * Build ordered list of API keys to try, respecting backoff state.
 * @returns {Array<{ key: string, isFree: boolean }>}
 */
function getKeysToTry() {
  const keys = []
  if (apiKeyFree && !freeKeyExhausted) keys.push({ key: apiKeyFree, isFree: true })
  if (apiKeyPrimary) keys.push({ key: apiKeyPrimary, isFree: false })
  return keys
}

/**
 * Call Gemini countTokens API (free, no billing).
 * Fire-and-forget: used only for accurate cost tracking.
 * @param {string[]} texts - Texts to count tokens for
 * @param {string} apiKey - API key to use
 */
function countTokensInBackground(texts, apiKey) {
  const geminiModel = PROVIDER_CONFIG.gemini.model
  const url = `${GEMINI_API_BASE}/${geminiModel}:countTokens?key=${apiKey}`
  const body = {
    contents: [{ parts: texts.map((t) => ({ text: t })) }],
  }
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
    .then((resp) => (resp.ok ? resp.json() : null))
    .then((data) => {
      if (data?.totalTokens) {
        sessionEmbeddingTokens += data.totalTokens
      }
    })
    .catch((err) => console.warn('[search.worker] countTokens failed (non-critical):', err.message))
}

/**
 * Call Gemini batchEmbedContents API.
 * Tries free key first (unless backed off), falls back to paid key on 429.
 * @param {string[]} texts
 * @param {'RETRIEVAL_DOCUMENT'|'RETRIEVAL_QUERY'} taskType
 * @returns {Promise<Array<Array<number>>>}
 */
async function callGeminiBatchEmbed(texts, taskType) {
  const keysToTry = getKeysToTry()
  if (keysToTry.length === 0) return []

  const geminiModel = PROVIDER_CONFIG.gemini.model
  const dims = PROVIDER_CONFIG.gemini.dims

  const body = {
    requests: texts.map((text) => ({
      model: `models/${geminiModel}`,
      content: { parts: [{ text }] },
      taskType,
      outputDimensionality: dims,
    })),
  }

  for (const { key, isFree } of keysToTry) {
    const url = `${GEMINI_API_BASE}/${geminiModel}:batchEmbedContents?key=${key}`
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (resp.status === 429) {
      if (isFree) {
        markFreeKeyExhausted()
      } else {
        console.warn('[search.worker] Paid key also rate-limited for embedding')
      }
      continue
    }

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '')
      throw new Error(`Gemini embedding API error ${resp.status}: ${errText.slice(0, 200)}`)
    }

    // Fire-and-forget: count actual tokens for cost tracking
    countTokensInBackground(texts, key)
    const data = await resp.json()
    return (data.embeddings || []).map((e) => e.values)
  }

  // All keys exhausted (429 on all)
  console.warn('[search.worker] All API keys rate-limited for embedding')
  return []
}

/**
 * Call Gemini embedContent API for a single text.
 * Tries free key first (unless backed off), falls back to paid key on 429.
 * @param {string} text
 * @param {'RETRIEVAL_DOCUMENT'|'RETRIEVAL_QUERY'} taskType
 * @returns {Promise<Array<number>|null>}
 */
async function callGeminiSingleEmbed(text, taskType) {
  const keysToTry = getKeysToTry()
  if (keysToTry.length === 0) return null

  const geminiModel = PROVIDER_CONFIG.gemini.model
  const dims = PROVIDER_CONFIG.gemini.dims

  const body = {
    model: `models/${geminiModel}`,
    content: { parts: [{ text }] },
    taskType,
    outputDimensionality: dims,
  }

  for (const { key, isFree } of keysToTry) {
    const url = `${GEMINI_API_BASE}/${geminiModel}:embedContent?key=${key}`
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (resp.status === 429) {
      if (isFree) {
        markFreeKeyExhausted()
      } else {
        console.warn('[search.worker] Paid key also rate-limited for embedding')
      }
      continue
    }

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '')
      throw new Error(`Gemini embedding API error ${resp.status}: ${errText.slice(0, 200)}`)
    }

    // Fire-and-forget: count actual tokens for cost tracking
    countTokensInBackground([text], key)
    const data = await resp.json()
    return data.embedding?.values || null
  }

  return null
}

// ============================================================================
// Local Embedding (Transformers.js)
// ============================================================================

/**
 * Lazy-load the local embedding model via Transformers.js.
 * Reports download progress to main thread.
 */
async function loadLocalModel() {
  const { pipeline: createPipeline } = await import('@huggingface/transformers')

  self.postMessage({ type: 'modelProgress', stage: 'download', value: 0, message: 'Loading embedding model...' })

  const fileProgress = new Map()

  localPipeline = await createPipeline('feature-extraction', PROVIDER_CONFIG.local.model, {
    device: 'auto',
    dtype: 'fp32',
    progress_callback: (progress) => {
      if (progress.status === 'initiate' && progress.file) {
        fileProgress.set(progress.file, 0)
      } else if (progress.status === 'progress' && progress.file && progress.progress != null) {
        fileProgress.set(progress.file, progress.progress)
        let total = 0
        for (const p of fileProgress.values()) total += p
        const overall = Math.round(total / fileProgress.size)
        self.postMessage({ type: 'modelProgress', stage: 'download', value: overall, message: progress.file })
      } else if (progress.status === 'done' && progress.file) {
        fileProgress.set(progress.file, 100)
        const allDone = [...fileProgress.values()].every((v) => v >= 100)
        if (allDone) {
          self.postMessage({ type: 'modelProgress', stage: 'init', value: 100, message: 'Initializing model...' })
        }
      } else if (progress.status === 'ready') {
        self.postMessage({ type: 'modelProgress', stage: 'ready', value: 100, message: 'Model ready' })
      }
    },
  })
}

/**
 * Generate embeddings via local Transformers.js pipeline.
 * @param {string[]} texts
 * @param {'RETRIEVAL_DOCUMENT'|'RETRIEVAL_QUERY'} taskType
 * @returns {Promise<Array<Array<number>>>}
 */
async function embedLocal(texts, taskType) {
  if (!localPipeline) await loadLocalModel()

  const prefix = taskType === 'RETRIEVAL_QUERY' ? 'query' : 'passage'
  const prefixed = texts.map((t) => `${prefix}: ${t}`)
  const output = await localPipeline(prefixed, { pooling: 'mean', normalize: true })
  return output.tolist()
}

// ============================================================================
// Embedding Router
// ============================================================================

/**
 * Generate embeddings for an array of texts via the active provider.
 * Routes to Gemini API or local model based on activeProvider.
 * @param {string[]} texts
 * @param {'RETRIEVAL_DOCUMENT'|'RETRIEVAL_QUERY'} taskType
 * @returns {Promise<Array<Array<number>>>}
 */
async function embed(texts, taskType = 'RETRIEVAL_DOCUMENT') {
  if (texts.length === 0) return []
  if (!activeProvider) {
    console.warn('[search.worker] embed() called without active provider — returning empty embeddings')
    return []
  }

  if (activeProvider === 'gemini') {
    if (!getApiKey()) return []
    // Split into API batch limits
    const allEmbeddings = []
    for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_API_LIMIT) {
      const batch = texts.slice(i, i + EMBEDDING_BATCH_API_LIMIT)
      const batchResult = await callGeminiBatchEmbed(batch, taskType)
      allEmbeddings.push(...batchResult)
    }
    return allEmbeddings
  }

  // local provider
  return embedLocal(texts, taskType)
}

// ============================================================================
// Indexing (cache-aware)
// ============================================================================

/**
 * Get current embedding dimensions for the active provider.
 */
function getActiveDims() {
  // Fallback to Gemini dims (768) when no provider is active — only used to allocate zero-vectors
  return activeProvider ? PROVIDER_CONFIG[activeProvider].dims : PROVIDER_CONFIG.gemini.dims
}

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
    chunks = userMsgs.map((m, i) => ({ text: m.text, contextText: m.text, index: i }))
  } else {
    chunks = chunkText(fullText)
  }

  if (chunks.length === 0) return 0

  const dims = getActiveDims()

  // Check cache for existing embeddings
  const embeddings = new Array(chunks.length)
  const uncachedIndices = []

  for (let i = 0; i < chunks.length; i++) {
    const cacheKey = `${activeProvider}:${parentId}:${chunks[i].index}`
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
      newEmbeddings = await embed(uncachedTexts, 'RETRIEVAL_DOCUMENT')
    } catch (err) {
      console.warn('[search.worker] Embedding failed for uncached chunks:', err.message)
    }
    const embTime = Math.round(performance.now() - embStart)
    console.log(`[search.worker] Embedded ${uncachedTexts.length} chunks for parent=${parentId} (${embTime}ms, cached=${chunks.length - uncachedIndices.length}, provider=${activeProvider})`)
    for (let j = 0; j < uncachedIndices.length; j++) {
      const i = uncachedIndices[j]
      const embedding = newEmbeddings[j] || new Array(dims).fill(0)
      embeddings[i] = embedding
      // Cache the new embedding
      embeddingCache.set(`${activeProvider}:${parentId}:${chunks[i].index}`, embedding)
    }
  }

  // Insert into Orama (chunkText only — contextText stays out of BM25 index)
  const docs = chunks.map((chunk, i) => ({
    parentId,
    chunkIndex: chunk.index,
    chunkText: chunk.text,
    mode,
    timestamp,
    embedding: embeddings[i] || new Array(dims).fill(0),
  }))

  const insertedIds = await insertMultiple(oramaDb, docs)
  indexedParentIds.add(parentId)

  // Track Orama internal doc IDs for reliable removal
  if (!parentDocIds.has(parentId)) parentDocIds.set(parentId, new Set())
  const docIdSet = parentDocIds.get(parentId)
  for (const docId of insertedIds) {
    docIdSet.add(docId)
  }

  // Store contextText in memory map
  for (let i = 0; i < chunks.length; i++) {
    const key = `${parentId}:${chunks[i].index}`
    contextTextMap.set(key, chunks[i].contextText)
  }

  // Remove existing snapshot entries for this parent, preserving other provider's embeddings
  const existingEmbeddings = new Map()
  snapshotDocs = snapshotDocs.filter((d) => {
    if (d.parentId === parentId) {
      existingEmbeddings.set(d.chunkIndex, {
        embeddingGemini: d.embeddingGemini,
        embeddingLocal: d.embeddingLocal,
      })
      return false
    }
    return true
  })

  // Add new snapshot entries, merging with preserved embeddings from the other provider
  for (let i = 0; i < docs.length; i++) {
    const existing = existingEmbeddings.get(docs[i].chunkIndex)
    snapshotDocs.push({
      parentId: docs[i].parentId,
      chunkIndex: docs[i].chunkIndex,
      chunkText: docs[i].chunkText,
      contextText: chunks[i].contextText,
      mode: docs[i].mode,
      timestamp: docs[i].timestamp,
      embeddingGemini: activeProvider === 'gemini' ? docs[i].embedding : (existing?.embeddingGemini || null),
      embeddingLocal: activeProvider === 'local' ? docs[i].embedding : (existing?.embeddingLocal || null),
    })
  }

  // Evict oldest in-memory cache entries if over limit (FIFO, not LRU —
  // embeddings are write-once per chunk so access-order tracking is unnecessary)
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
 * Safely generate query embedding. Returns the vector or null on failure.
 * Uses LRU cache to avoid re-computing embeddings for the same query.
 */
async function safeEmbed(query) {
  if (!activeProvider) return null
  if (activeProvider === 'gemini' && !getApiKey()) return null

  const cacheKey = `${activeProvider}:${query}`
  const cached = queryEmbeddingCache.get(cacheKey)
  if (cached) {
    console.log(`[search.worker] Query embedding cache hit: "${query}"`)
    return cached
  }

  try {
    const embStart = performance.now()
    let queryVec

    if (activeProvider === 'gemini') {
      queryVec = await callGeminiSingleEmbed(query, 'RETRIEVAL_QUERY')
    } else {
      const [result] = await embedLocal([query], 'RETRIEVAL_QUERY')
      queryVec = result
    }

    const dims = getActiveDims()
    if (!queryVec || queryVec.length !== dims) {
      console.warn(`[search.worker] safeEmbed: invalid result for "${query}"`)
      return null
    }

    const embTime = Math.round(performance.now() - embStart)
    console.log(
      `[search.worker] Query embedding: "${query}" → [${queryVec.slice(0, 4).map((v) => v.toFixed(4)).join(', ')}, ...] (${dims}d, ${embTime}ms, provider=${activeProvider})`,
    )

    queryEmbeddingCache.set(cacheKey, queryVec)
    return queryVec
  } catch (err) {
    console.warn(`[search.worker] safeEmbed failed for "${query}":`, err.message)
    return null
  }
}

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
    const queryVec = await safeEmbed(query)
    if (!queryVec) {
      console.warn(`[search.worker] Vector search: no embedding for "${query}", returning empty`)
      results = { hits: [] }
    } else {
      results = await search(oramaDb, {
        mode: 'vector',
        vector: {
          value: queryVec,
          property: 'embedding',
        },
        limit: SEARCH_DEFAULTS.searchLimit,
        similarity: SEARCH_DEFAULTS.similarity,
        ...(Object.keys(where).length > 0 ? { where } : {}),
      })
    }
  } else {
    // Hybrid (default) — intentionally BM25-first strategy.
    // We run BM25 and vector as separate phases (instead of Orama's native `mode: 'hybrid'`)
    // because Orama's built-in hybrid mode uses score normalization that can suppress
    // keyword-exact matches in favor of semantic similarity. This two-phase approach
    // preserves BM25 ordering for exact keyword matches while appending vector-only
    // results (synonyms, cross-language) that BM25 would miss entirely.
    // Phase 1: BM25 keyword search (reliable, fast)
    const bm25Results = await search(oramaDb, {
      term: query,
      properties: ['chunkText'],
      limit: SEARCH_DEFAULTS.searchLimit,
      ...(Object.keys(where).length > 0 ? { where } : {}),
    })

    // Phase 2: Vector semantic search (finds synonyms, cross-language)
    const queryVec = await safeEmbed(query)
    let vectorResults = { hits: [] }
    if (queryVec) {
      vectorResults = await search(oramaDb, {
        mode: 'vector',
        vector: { value: queryVec, property: 'embedding' },
        limit: SEARCH_DEFAULTS.searchLimit,
        similarity: SEARCH_DEFAULTS.similarity,
        ...(Object.keys(where).length > 0 ? { where } : {}),
      })
    }

    // Merge: BM25 results first (preserve order), then append vector-only results
    const bm25Ids = new Set()
    const mergedHits = []
    for (const hit of (bm25Results?.hits || [])) {
      const docId = `${hit.document.parentId}:${hit.document.chunkIndex}`
      bm25Ids.add(docId)
      mergedHits.push(hit)
    }
    let vectorOnlyCount = 0
    for (const hit of (vectorResults?.hits || [])) {
      const docId = `${hit.document.parentId}:${hit.document.chunkIndex}`
      if (!bm25Ids.has(docId)) {
        mergedHits.push(hit)
        vectorOnlyCount++
      }
    }

    results = { hits: mergedHits }
    console.log(
      `[search.worker] Hybrid: BM25=${bm25Ids.size} + vector-only=${vectorOnlyCount} → ${mergedHits.length} total`,
    )
  }

  const elapsed = Math.round(performance.now() - start)

  const hits = (results?.hits || []).map((hit) => {
    const key = `${hit.document.parentId}:${hit.document.chunkIndex}`
    return {
      parentId: hit.document.parentId,
      chunkIndex: hit.document.chunkIndex,
      chunkText: hit.document.chunkText,
      contextText: contextTextMap.get(key) || hit.document.chunkText,
      mode: hit.document.mode,
      timestamp: hit.document.timestamp,
      score: hit.score,
    }
  })

  // Debug: log when search returns 0 results despite non-empty index
  if (hits.length === 0 && indexedParentIds.size > 0) {
    console.warn(`[search.worker] 0 hits for "${query}" (strategy=${strategy}, indexed=${indexedParentIds.size} parents, ${snapshotDocs.length} chunks)`)
  }

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

  // Clean embedding cache and contextTextMap in single pass
  const keysToDelete = []
  for (const key of embeddingCache.keys()) {
    // Key format: "provider:parentId:chunkIndex"
    const firstSep = key.indexOf(':')
    if (firstSep === -1) continue
    const secondSep = key.indexOf(':', firstSep + 1)
    if (secondSep === -1) continue
    const pid = key.slice(firstSep + 1, secondSep)
    if (removedPids.has(pid)) keysToDelete.push(key)
  }
  for (const key of keysToDelete) {
    embeddingCache.delete(key)
  }
  // Clean contextTextMap (key format: "parentId:chunkIndex")
  for (const key of contextTextMap.keys()) {
    const sepIndex = key.indexOf(':')
    if (sepIndex !== -1 && removedPids.has(key.slice(0, sepIndex))) {
      contextTextMap.delete(key)
    }
  }
}

function removeAllDocs() {
  oramaDb = createFreshDb(activeProvider)
  indexedParentIds.clear()
  embeddingCache.clear()
  parentDocIds.clear()
  contextTextMap.clear()
  queryEmbeddingCache.clear()
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
// Provider Switch
// ============================================================================

/**
 * Switch to a new embedding provider. Rebuilds Orama DB with new dimensions
 * and populates from snapshot docs using the target provider's embeddings.
 * Returns the count of docs that need backfill (missing embeddings).
 */
async function switchProvider(newProvider, requestId) {
  activeProvider = newProvider
  queryEmbeddingCache.clear()

  const dims = PROVIDER_CONFIG[newProvider].dims
  const embeddingKey = newProvider === 'gemini' ? 'embeddingGemini' : 'embeddingLocal'

  // Rebuild Orama DB with new vector dimensions
  oramaDb = createFreshDb(newProvider)
  indexedParentIds.clear()
  parentDocIds.clear()
  contextTextMap.clear()

  // Only insert docs with valid embeddings for the new provider.
  // Docs without embeddings are NOT inserted — selfHeal will backfill them
  // with proper embeddings from the new provider.
  const docsToInsert = []
  const docsSourceIndices = []
  const backfillParentIds = new Set()

  for (let i = 0; i < snapshotDocs.length; i++) {
    const doc = snapshotDocs[i]
    const emb = doc[embeddingKey]
    const hasEmb = Array.isArray(emb) && emb.length === dims && emb.some((v) => v !== 0)
    if (hasEmb) {
      docsToInsert.push({
        parentId: doc.parentId,
        chunkIndex: doc.chunkIndex,
        chunkText: doc.chunkText,
        mode: doc.mode,
        timestamp: doc.timestamp,
        embedding: emb,
      })
      docsSourceIndices.push(i)
    } else {
      backfillParentIds.add(doc.parentId)
    }
  }

  const needBackfill = backfillParentIds.size

  if (docsToInsert.length > 0) {
    const insertedIds = await insertMultiple(oramaDb, docsToInsert)

    // Rebuild tracking maps (only for docs with valid embeddings)
    for (let i = 0; i < docsToInsert.length; i++) {
      const pid = docsToInsert[i].parentId
      indexedParentIds.add(pid)
      if (!parentDocIds.has(pid)) parentDocIds.set(pid, new Set())
      parentDocIds.get(pid).add(insertedIds[i])
      // Rebuild contextTextMap
      const doc = snapshotDocs[docsSourceIndices[i]]
      const ctxKey = `${pid}:${doc.chunkIndex}`
      contextTextMap.set(ctxKey, doc.contextText || doc.chunkText)
    }
  }

  // If switching to local and model not loaded yet, load it
  if (newProvider === 'local' && !localPipeline) {
    await loadLocalModel()
  }

  console.log(`[search.worker] Switched to provider=${newProvider}, dims=${dims}, indexed=${indexedParentIds.size}, needBackfill=${needBackfill}`)

  self.postMessage({
    type: 'providerSwitched',
    requestId,
    provider: newProvider,
    needBackfill,
    indexedCount: indexedParentIds.size,
  })
}

// ============================================================================
// Initialization
// ============================================================================

async function initialize(keys = {}) {
  // Store API keys (can be updated later via 'updateApiKeys')
  if (keys.apiKey) apiKeyPrimary = keys.apiKey
  if (keys.freeApiKey) apiKeyFree = keys.freeApiKey
  if (keys.provider !== undefined) activeProvider = keys.provider

  if (isInitialized) {
    self.postMessage({ type: 'ready', indexedCount: indexedParentIds.size })
    return
  }

  try {
    self.postMessage({ type: 'modelProgress', stage: 'init', value: 50, message: 'Initializing search...' })

    // 1. Load snapshot from IndexedDB
    const savedDocs = await loadSnapshot()

    // 2. Create fresh Orama DB with custom CJK tokenizer (dimensions based on active provider)
    oramaDb = createFreshDb(activeProvider)
    const dims = getActiveDims()

    // 3. Parse snapshot format and migrate if needed
    let rawDocs = null
    if (savedDocs && typeof savedDocs === 'object' && !Array.isArray(savedDocs)) {
      if (savedDocs.version === 3) {
        // v3 format — check configVersion
        if (savedDocs.configVersion && savedDocs.configVersion !== SNAPSHOT_CONFIG_VERSION) {
          console.warn(
            `[search.worker] Snapshot configVersion mismatch: ${savedDocs.configVersion} → ${SNAPSHOT_CONFIG_VERSION}. Discarding for rebuild.`,
          )
          rawDocs = null
        } else {
          rawDocs = savedDocs.docs
          console.log(`[search.worker] Loaded v3 snapshot (config=${savedDocs.configVersion || 'none'})`)
        }
      } else if (savedDocs.version === 2) {
        // v2 → v3 migration: existing embedding field is Gemini 768d
        if (savedDocs.configVersion && !savedDocs.configVersion.startsWith(`cs${SEARCH_DEFAULTS.chunkSize}_co${SEARCH_DEFAULTS.chunkOverlap}`)) {
          console.warn(`[search.worker] v2 snapshot chunk params changed, discarding for rebuild`)
          rawDocs = null
        } else {
          const docs = savedDocs.docs || []
          for (const doc of docs) {
            doc.embeddingGemini = doc.embedding || null
            doc.embeddingLocal = null
            delete doc.embedding
          }
          rawDocs = docs
          console.log(`[search.worker] Migrated v2 → v3 snapshot (${docs.length} docs)`)
        }
      }
    } else if (Array.isArray(savedDocs)) {
      // v1 format (raw array) — discard, will be rebuilt by selfHeal
      console.warn('[search.worker] Discarding v1 snapshot — selfHeal will rebuild')
      rawDocs = null
    }

    // 4. If snapshot exists, bulk-insert → immediately searchable
    if (Array.isArray(rawDocs) && rawDocs.length > 0) {
      const embeddingKey = activeProvider === 'local' ? 'embeddingLocal' : 'embeddingGemini'

      // Keep all docs in snapshot (they may have embedding for the other provider)
      snapshotDocs = [...rawDocs]

      // When a provider is active: only insert docs with valid embeddings.
      // Docs without embeddings are kept in snapshotDocs for future use,
      // but NOT inserted into Orama — selfHeal will backfill them.
      // When no provider (null): insert all docs for BM25-only search.
      const oramaDocs = []
      const oramaSourceIndices = []

      for (let i = 0; i < snapshotDocs.length; i++) {
        const doc = snapshotDocs[i]
        const emb = doc[embeddingKey]
        const hasEmb = activeProvider && Array.isArray(emb) && emb.length === dims && emb.some((v) => v !== 0)

        if (hasEmb || !activeProvider) {
          oramaDocs.push({
            parentId: doc.parentId,
            chunkIndex: doc.chunkIndex,
            chunkText: doc.chunkText,
            mode: doc.mode,
            timestamp: doc.timestamp,
            embedding: hasEmb ? emb : new Array(dims).fill(0),
          })
          oramaSourceIndices.push(i)
        }
      }

      if (oramaDocs.length > 0) {
        const insertedIds = await insertMultiple(oramaDb, oramaDocs)

        // Rebuild tracking maps and contextTextMap
        for (let i = 0; i < oramaDocs.length; i++) {
          const doc = snapshotDocs[oramaSourceIndices[i]]
          const pid = doc.parentId
          indexedParentIds.add(pid)
          if (!parentDocIds.has(pid)) parentDocIds.set(pid, new Set())
          parentDocIds.get(pid).add(insertedIds[i])
          const key = `${pid}:${doc.chunkIndex}`
          contextTextMap.set(key, doc.contextText || doc.chunkText)
        }
      }
      console.log(
        `[search.worker] Restored ${oramaDocs.length}/${snapshotDocs.length} docs (${indexedParentIds.size} records) from snapshot (provider=${activeProvider})`,
      )
    }

    // If local provider is active and no pipeline yet, load model
    if (activeProvider === 'local' && !localPipeline) {
      await loadLocalModel()
    } else {
      // No model download needed — Gemini API is used or no provider selected
      self.postMessage({ type: 'modelProgress', stage: 'ready', value: 100, message: 'Ready' })
    }

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
        await initialize({ apiKey: event.data.apiKey, freeApiKey: event.data.freeApiKey, provider: event.data.provider })
        break
      }

      case 'updateApiKeys': {
        if (event.data.apiKey !== undefined) apiKeyPrimary = event.data.apiKey
        if (event.data.freeApiKey !== undefined) {
          const oldFree = apiKeyFree
          apiKeyFree = event.data.freeApiKey
          // Reset backoff if the free key changed (user may have set a new one)
          if (apiKeyFree && apiKeyFree !== oldFree) {
            freeKeyExhausted = false
            if (freeKeyResetTimer) { clearTimeout(freeKeyResetTimer); freeKeyResetTimer = null }
          }
        }
        console.log(`[search.worker] API keys updated (primary=${!!apiKeyPrimary}, free=${!!apiKeyFree}, freeBackedOff=${freeKeyExhausted})`)
        break
      }

      case 'switchProvider': {
        await switchProvider(event.data.provider, requestId)
        break
      }

      case 'search': {
        const { query, mode, strategy } = event.data
        const result = await performSearch(query, { mode, strategy })
        // Attach cumulative embedding cost (Gemini only, tokens counted via countTokens API)
        const costUsd = (sessionEmbeddingTokens / 1_000_000) * 0.15
        self.postMessage({
          type: 'searchResult', requestId, ...result,
          embeddingCost: { totalTokens: sessionEmbeddingTokens, estimatedCostUsd: costUsd },
        })
        break
      }

      case 'index': {
        const { records } = event.data
        let totalChunks = 0

        // Send initial progress so UI never shows 0/0
        self.postMessage({
          type: 'progress', requestId,
          value: 0, total: records.length,
          message: `Indexing 0/${records.length}`,
        })

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
          const geminiEmb = sample.embeddingGemini
          const localEmb = sample.embeddingLocal
          const hasGemini = Array.isArray(geminiEmb) && geminiEmb.some((v) => v !== 0)
          const hasLocal = Array.isArray(localEmb) && localEmb.some((v) => v !== 0)
          hasNonZeroVectors = hasGemini || hasLocal
          sampleDoc = {
            parentId: sample.parentId,
            chunkIndex: sample.chunkIndex,
            chunkText: sample.chunkText?.substring(0, 80),
            mode: sample.mode,
            embeddingGeminiDims: geminiEmb?.length || 0,
            embeddingLocalDims: localEmb?.length || 0,
            hasGeminiEmbedding: hasGemini,
            hasLocalEmbedding: hasLocal,
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
          activeProvider,
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
