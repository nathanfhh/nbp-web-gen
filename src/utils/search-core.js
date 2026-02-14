// ============================================================================
// RAG Search Core — Pure functions for text extraction, chunking, and results
// No DOM/Worker/Vue dependencies — fully testable
// ============================================================================

export const SEARCH_DEFAULTS = {
  chunkSize: 500,
  chunkOverlap: 100,
  searchLimit: 20,
  resultLimit: 10,
  snippetContextLength: 80,
}

// ============================================================================
// Text Extraction
// ============================================================================

/**
 * Extract searchable text from a history record.
 * For agent mode, pass the full conversation from OPFS as second arg.
 *
 * @param {Object} record - IndexedDB history record
 * @param {Array|null} conversation - Agent conversation messages (from OPFS)
 * @returns {string} Plain text for indexing
 */
export function extractText(record, conversation = null) {
  if (!record) return ''

  const mode = record.mode || ''
  const prompt = record.prompt || ''

  switch (mode) {
    case 'slides': {
      const parts = [prompt]
      const pages = record.options?.pagesContent
      if (Array.isArray(pages)) {
        for (const page of pages) {
          if (page?.content) parts.push(page.content)
        }
      }
      return parts.join('\n')
    }

    case 'agent': {
      if (conversation && Array.isArray(conversation)) {
        const userTexts = extractAgentUserMessages(conversation)
        if (userTexts.length > 0) {
          return userTexts.map((m) => m.text).join('\n')
        }
      }
      // Fallback to prompt field (first 200 chars stored in IndexedDB)
      return prompt
    }

    default:
      // generate, sticker, edit, story, diagram, video
      return prompt
  }
}

/**
 * Extract only user text messages from an agent conversation.
 * Skips model replies, images, thinking, and partial messages.
 *
 * @param {Array} messages - Conversation messages array
 * @returns {Array<{ text: string, messageIndex: number }>}
 */
export function extractAgentUserMessages(messages) {
  if (!Array.isArray(messages)) return []

  const results = []
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (!msg || msg.role !== 'user' || msg._isPartial) continue

    const parts = msg.parts || []
    const textParts = []
    for (const part of parts) {
      if (part?.type === 'text' && part.text) {
        textParts.push(part.text)
      }
    }
    if (textParts.length > 0) {
      results.push({ text: textParts.join('\n'), messageIndex: i })
    }
  }
  return results
}

// ============================================================================
// Text Chunking
// ============================================================================

// Sentence-ending patterns for splitting
const SENTENCE_BREAK_RE = /[。？！.?!\n]/

/**
 * Split text into overlapping chunks for indexing.
 * Short texts (< chunkSize) produce a single chunk.
 * Prefers splitting at sentence boundaries when possible.
 *
 * @param {string} text - Input text
 * @param {Object} options
 * @param {number} options.chunkSize - Max chars per chunk (default 500)
 * @param {number} options.chunkOverlap - Overlap chars between chunks (default 100)
 * @returns {Array<{ text: string, index: number }>}
 */
export function chunkText(text, options = {}) {
  const { chunkSize = SEARCH_DEFAULTS.chunkSize, chunkOverlap = SEARCH_DEFAULTS.chunkOverlap } =
    options

  if (!text || typeof text !== 'string') return []

  const trimmed = text.trim()
  if (trimmed.length === 0) return []

  if (trimmed.length <= chunkSize) {
    return [{ text: trimmed, index: 0 }]
  }

  const chunks = []
  let pos = 0
  let index = 0

  while (pos < trimmed.length) {
    let end = Math.min(pos + chunkSize, trimmed.length)

    // Try to find a sentence break near the end of the chunk
    if (end < trimmed.length) {
      const searchStart = Math.max(pos + Math.floor(chunkSize * 0.6), pos)
      let bestBreak = -1

      for (let i = end - 1; i >= searchStart; i--) {
        if (SENTENCE_BREAK_RE.test(trimmed[i])) {
          bestBreak = i + 1 // Include the break character
          break
        }
      }

      if (bestBreak > pos) {
        end = bestBreak
      }
    }

    const chunk = trimmed.slice(pos, end).trim()
    if (chunk.length > 0) {
      chunks.push({ text: chunk, index })
      index++
    }

    // If we've reached the end, stop
    if (end >= trimmed.length) break

    // Advance with overlap
    const advance = end - pos - chunkOverlap
    pos += Math.max(advance, 1) // Always advance at least 1 char
  }

  return chunks
}

// ============================================================================
// Search Result Processing
// ============================================================================

/**
 * Deduplicate search hits by parent record ID, keeping the best score per parent.
 * Returns results sorted by score descending.
 *
 * @param {Array} hits - Raw search hits with { parentId, score, chunkText, ... }
 * @returns {Array<{ parentId: string|number, score: number, chunkText: string, ... }>}
 */
export function deduplicateByParent(hits) {
  if (!Array.isArray(hits) || hits.length === 0) return []

  const parentMap = new Map()

  for (const hit of hits) {
    const pid = hit.parentId
    if (pid === undefined || pid === null) continue

    const existing = parentMap.get(pid)
    if (!existing || hit.score > existing.score) {
      parentMap.set(pid, { ...hit })
    }
  }

  return Array.from(parentMap.values()).sort((a, b) => b.score - a.score)
}

// ============================================================================
// Snippet Highlighting
// ============================================================================

// HTML entities that need escaping
const HTML_ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
}
const HTML_ESCAPE_RE = /[&<>"']/g

function escapeHtml(str) {
  return str.replace(HTML_ESCAPE_RE, (ch) => HTML_ESCAPE_MAP[ch])
}

/**
 * Generate an HTML snippet with query terms highlighted using <mark> tags.
 * The snippet is centered around the first match with surrounding context.
 *
 * @security XSS-safe: input is HTML-escaped via escapeHtml() BEFORE <mark> tags
 * are injected. The <mark> tags are constructed from escaped query terms, not raw
 * user input. Safe for use with v-html in Vue components.
 *
 * @param {string} chunkText - The text chunk to highlight in
 * @param {string} query - User's search query
 * @param {number} contextLength - Chars of context around the first match (default 80)
 * @returns {string} HTML string with <mark> tags
 */
export function highlightSnippet(chunkText, query, contextLength = SEARCH_DEFAULTS.snippetContextLength) {
  if (!chunkText || !query) return escapeHtml(chunkText || '')

  const queryTerms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0)

  if (queryTerms.length === 0) return escapeHtml(chunkText)

  const lowerText = chunkText.toLowerCase()

  // Find first match position for centering the snippet
  let firstMatchPos = lowerText.length
  for (const term of queryTerms) {
    const idx = lowerText.indexOf(term)
    if (idx !== -1 && idx < firstMatchPos) {
      firstMatchPos = idx
    }
  }

  // Extract snippet window
  let start = Math.max(0, firstMatchPos - contextLength)
  let end = Math.min(chunkText.length, firstMatchPos + contextLength * 2)

  // Expand to word boundaries
  if (start > 0) {
    const spaceIdx = chunkText.indexOf(' ', start)
    if (spaceIdx !== -1 && spaceIdx < start + 20) {
      start = spaceIdx + 1
    }
  }
  if (end < chunkText.length) {
    const spaceIdx = chunkText.lastIndexOf(' ', end)
    if (spaceIdx !== -1 && spaceIdx > end - 20) {
      end = spaceIdx
    }
  }

  const snippet = chunkText.slice(start, end)
  const prefix = start > 0 ? '...' : ''
  const suffix = end < chunkText.length ? '...' : ''

  // Escape HTML first, then apply <mark> highlighting
  const escaped = escapeHtml(snippet)

  // Build regex to match all query terms (escaped for regex safety)
  const escapedTerms = queryTerms.map((t) =>
    escapeHtml(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  )
  const markRe = new RegExp(`(${escapedTerms.join('|')})`, 'gi')
  const highlighted = escaped.replace(markRe, '<mark>$1</mark>')

  return prefix + highlighted + suffix
}
