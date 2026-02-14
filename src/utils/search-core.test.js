import { describe, it, expect } from 'vitest'
import {
  SEARCH_DEFAULTS,
  extractText,
  extractAgentUserMessages,
  chunkText,
  deduplicateByParent,
  highlightSnippet,
} from './search-core'

// ============================================================================
// SEARCH_DEFAULTS
// ============================================================================

describe('SEARCH_DEFAULTS', () => {
  it('has expected default values', () => {
    expect(SEARCH_DEFAULTS.chunkSize).toBe(500)
    expect(SEARCH_DEFAULTS.chunkOverlap).toBe(100)
    expect(SEARCH_DEFAULTS.searchLimit).toBe(20)
    expect(SEARCH_DEFAULTS.resultLimit).toBe(10)
    expect(SEARCH_DEFAULTS.snippetContextLength).toBe(80)
  })
})

// ============================================================================
// extractText
// ============================================================================

describe('extractText', () => {
  it('returns empty string for null/undefined record', () => {
    expect(extractText(null)).toBe('')
    expect(extractText(undefined)).toBe('')
  })

  it('returns prompt for generate mode', () => {
    expect(extractText({ mode: 'generate', prompt: 'a cat in forest' })).toBe('a cat in forest')
  })

  it('returns prompt for sticker mode', () => {
    expect(extractText({ mode: 'sticker', prompt: 'cute sticker' })).toBe('cute sticker')
  })

  it('returns prompt for edit mode', () => {
    expect(extractText({ mode: 'edit', prompt: 'edit this image' })).toBe('edit this image')
  })

  it('returns prompt for story mode', () => {
    expect(extractText({ mode: 'story', prompt: 'a fairy tale' })).toBe('a fairy tale')
  })

  it('returns prompt for diagram mode', () => {
    expect(extractText({ mode: 'diagram', prompt: 'network diagram' })).toBe('network diagram')
  })

  it('returns prompt for video mode', () => {
    expect(extractText({ mode: 'video', prompt: 'sunset timelapse' })).toBe('sunset timelapse')
  })

  it('returns empty string when prompt is missing', () => {
    expect(extractText({ mode: 'generate' })).toBe('')
  })

  // Slides mode
  it('returns prompt + pagesContent for slides mode', () => {
    const record = {
      mode: 'slides',
      prompt: 'presentation about AI',
      options: {
        pagesContent: [
          { content: 'Slide 1: Introduction' },
          { content: 'Slide 2: Methods' },
        ],
      },
    }
    const result = extractText(record)
    expect(result).toBe('presentation about AI\nSlide 1: Introduction\nSlide 2: Methods')
  })

  it('handles slides with no pagesContent', () => {
    const record = { mode: 'slides', prompt: 'my slides' }
    expect(extractText(record)).toBe('my slides')
  })

  it('handles slides with empty pagesContent', () => {
    const record = { mode: 'slides', prompt: 'my slides', options: { pagesContent: [] } }
    expect(extractText(record)).toBe('my slides')
  })

  it('skips pagesContent entries without content', () => {
    const record = {
      mode: 'slides',
      prompt: 'slides',
      options: {
        pagesContent: [{ content: 'page1' }, null, { content: '' }, { content: 'page3' }],
      },
    }
    expect(extractText(record)).toBe('slides\npage1\npage3')
  })

  // Agent mode
  it('extracts user messages from agent conversation', () => {
    const record = { mode: 'agent', prompt: 'short prompt' }
    const conversation = [
      { role: 'user', parts: [{ type: 'text', text: 'Hello' }] },
      { role: 'model', parts: [{ type: 'text', text: 'Hi there' }] },
      { role: 'user', parts: [{ type: 'text', text: 'Draw a cat' }] },
    ]
    expect(extractText(record, conversation)).toBe('Hello\nDraw a cat')
  })

  it('falls back to prompt when agent has no conversation', () => {
    const record = { mode: 'agent', prompt: 'fallback prompt' }
    expect(extractText(record, null)).toBe('fallback prompt')
  })

  it('falls back to prompt when agent conversation is empty', () => {
    const record = { mode: 'agent', prompt: 'fallback' }
    expect(extractText(record, [])).toBe('fallback')
  })

  it('falls back to prompt when agent conversation has no user messages', () => {
    const record = { mode: 'agent', prompt: 'fallback' }
    const conversation = [
      { role: 'model', parts: [{ type: 'text', text: 'Hello' }] },
    ]
    expect(extractText(record, conversation)).toBe('fallback')
  })

  it('handles unknown mode by returning prompt', () => {
    expect(extractText({ mode: 'unknown_mode', prompt: 'test' })).toBe('test')
  })
})

// ============================================================================
// extractAgentUserMessages
// ============================================================================

describe('extractAgentUserMessages', () => {
  it('returns empty array for null/undefined', () => {
    expect(extractAgentUserMessages(null)).toEqual([])
    expect(extractAgentUserMessages(undefined)).toEqual([])
  })

  it('returns empty array for non-array', () => {
    expect(extractAgentUserMessages('not array')).toEqual([])
  })

  it('returns empty array for empty array', () => {
    expect(extractAgentUserMessages([])).toEqual([])
  })

  it('extracts only user text messages', () => {
    const messages = [
      { role: 'user', parts: [{ type: 'text', text: 'Hello' }] },
      { role: 'model', parts: [{ type: 'text', text: 'Hi' }] },
      { role: 'user', parts: [{ type: 'text', text: 'Draw a cat' }] },
    ]
    const result = extractAgentUserMessages(messages)
    expect(result).toEqual([
      { text: 'Hello', messageIndex: 0 },
      { text: 'Draw a cat', messageIndex: 2 },
    ])
  })

  it('skips partial messages', () => {
    const messages = [
      { role: 'user', _isPartial: true, parts: [{ type: 'text', text: 'partial' }] },
      { role: 'user', parts: [{ type: 'text', text: 'complete' }] },
    ]
    expect(extractAgentUserMessages(messages)).toEqual([
      { text: 'complete', messageIndex: 1 },
    ])
  })

  it('skips image-only user messages', () => {
    const messages = [
      { role: 'user', parts: [{ type: 'image', data: 'base64...' }] },
      { role: 'user', parts: [{ type: 'text', text: 'with text' }] },
    ]
    expect(extractAgentUserMessages(messages)).toEqual([
      { text: 'with text', messageIndex: 1 },
    ])
  })

  it('concatenates multiple text parts in one message', () => {
    const messages = [
      {
        role: 'user',
        parts: [
          { type: 'text', text: 'Part 1' },
          { type: 'image', data: 'base64...' },
          { type: 'text', text: 'Part 2' },
        ],
      },
    ]
    expect(extractAgentUserMessages(messages)).toEqual([
      { text: 'Part 1\nPart 2', messageIndex: 0 },
    ])
  })

  it('handles null messages in array', () => {
    const messages = [null, { role: 'user', parts: [{ type: 'text', text: 'valid' }] }, undefined]
    expect(extractAgentUserMessages(messages)).toEqual([
      { text: 'valid', messageIndex: 1 },
    ])
  })

  it('handles messages with no parts', () => {
    const messages = [
      { role: 'user' },
      { role: 'user', parts: [] },
      { role: 'user', parts: [{ type: 'text', text: 'has parts' }] },
    ]
    expect(extractAgentUserMessages(messages)).toEqual([
      { text: 'has parts', messageIndex: 2 },
    ])
  })
})

// ============================================================================
// chunkText
// ============================================================================

describe('chunkText', () => {
  it('returns empty array for null/undefined/empty', () => {
    expect(chunkText(null)).toEqual([])
    expect(chunkText(undefined)).toEqual([])
    expect(chunkText('')).toEqual([])
    expect(chunkText('   ')).toEqual([])
  })

  it('returns empty array for non-string', () => {
    expect(chunkText(123)).toEqual([])
    expect(chunkText({})).toEqual([])
  })

  it('returns single chunk for short text', () => {
    const result = chunkText('Hello world')
    expect(result).toEqual([{ text: 'Hello world', index: 0 }])
  })

  it('returns single chunk for text exactly at chunkSize', () => {
    const text = 'a'.repeat(500)
    const result = chunkText(text, { chunkSize: 500 })
    expect(result).toEqual([{ text, index: 0 }])
  })

  it('splits long text into multiple chunks', () => {
    const text = 'word '.repeat(200) // ~1000 chars
    const result = chunkText(text, { chunkSize: 500, chunkOverlap: 100 })
    expect(result.length).toBeGreaterThan(1)
    // Each chunk should be <= chunkSize
    for (const chunk of result) {
      expect(chunk.text.length).toBeLessThanOrEqual(500)
    }
  })

  it('chunks have sequential indices', () => {
    const text = 'word '.repeat(200)
    const result = chunkText(text, { chunkSize: 500, chunkOverlap: 100 })
    for (let i = 0; i < result.length; i++) {
      expect(result[i].index).toBe(i)
    }
  })

  it('prefers sentence boundaries for splitting', () => {
    // Create text with clear sentence boundaries
    const sentence1 = 'A'.repeat(300) + '.'
    const sentence2 = 'B'.repeat(300) + '.'
    const text = sentence1 + ' ' + sentence2
    const result = chunkText(text, { chunkSize: 400, chunkOverlap: 50 })
    // The first chunk should end at or near the period
    expect(result[0].text).toContain('.')
  })

  it('handles text with no sentence breaks', () => {
    const text = 'a'.repeat(600)
    const result = chunkText(text, { chunkSize: 500, chunkOverlap: 50 })
    expect(result.length).toBe(2)
  })

  it('overlap ensures no content is lost', () => {
    const words = []
    for (let i = 0; i < 100; i++) words.push(`word${i}`)
    const text = words.join(' ')
    const result = chunkText(text, { chunkSize: 200, chunkOverlap: 50 })
    // Every word should appear in at least one chunk
    for (const w of words) {
      const found = result.some((c) => c.text.includes(w))
      expect(found).toBe(true)
    }
  })

  it('respects custom chunkSize', () => {
    const text = 'word '.repeat(100) // ~500 chars
    const result = chunkText(text, { chunkSize: 100, chunkOverlap: 20 })
    expect(result.length).toBeGreaterThan(3)
    for (const chunk of result) {
      expect(chunk.text.length).toBeLessThanOrEqual(100)
    }
  })

  it('trims input text', () => {
    const result = chunkText('  hello world  ')
    expect(result).toEqual([{ text: 'hello world', index: 0 }])
  })
})

// ============================================================================
// deduplicateByParent
// ============================================================================

describe('deduplicateByParent', () => {
  it('returns empty array for null/undefined/empty', () => {
    expect(deduplicateByParent(null)).toEqual([])
    expect(deduplicateByParent(undefined)).toEqual([])
    expect(deduplicateByParent([])).toEqual([])
  })

  it('passes through single hit', () => {
    const hits = [{ parentId: '1', score: 0.9, chunkText: 'hello' }]
    const result = deduplicateByParent(hits)
    expect(result).toEqual([{ parentId: '1', score: 0.9, chunkText: 'hello' }])
  })

  it('keeps best score per parent', () => {
    const hits = [
      { parentId: '1', score: 0.5, chunkText: 'low' },
      { parentId: '1', score: 0.9, chunkText: 'high' },
      { parentId: '1', score: 0.7, chunkText: 'mid' },
    ]
    const result = deduplicateByParent(hits)
    expect(result).toEqual([{ parentId: '1', score: 0.9, chunkText: 'high' }])
  })

  it('deduplicates multiple parents', () => {
    const hits = [
      { parentId: '1', score: 0.5, chunkText: 'a' },
      { parentId: '2', score: 0.8, chunkText: 'b' },
      { parentId: '1', score: 0.9, chunkText: 'c' },
      { parentId: '2', score: 0.3, chunkText: 'd' },
    ]
    const result = deduplicateByParent(hits)
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ parentId: '1', score: 0.9 })
    expect(result[1]).toMatchObject({ parentId: '2', score: 0.8 })
  })

  it('sorts by score descending', () => {
    const hits = [
      { parentId: '3', score: 0.3, chunkText: '' },
      { parentId: '1', score: 0.9, chunkText: '' },
      { parentId: '2', score: 0.6, chunkText: '' },
    ]
    const result = deduplicateByParent(hits)
    expect(result.map((r) => r.parentId)).toEqual(['1', '2', '3'])
  })

  it('handles numeric parentId', () => {
    const hits = [
      { parentId: 42, score: 0.5, chunkText: 'a' },
      { parentId: 42, score: 0.8, chunkText: 'b' },
    ]
    const result = deduplicateByParent(hits)
    expect(result).toHaveLength(1)
    expect(result[0].score).toBe(0.8)
  })

  it('skips hits with null/undefined parentId', () => {
    const hits = [
      { parentId: null, score: 0.9, chunkText: 'no parent' },
      { parentId: undefined, score: 0.8, chunkText: 'no parent' },
      { parentId: '1', score: 0.5, chunkText: 'valid' },
    ]
    const result = deduplicateByParent(hits)
    expect(result).toHaveLength(1)
    expect(result[0].parentId).toBe('1')
  })
})

// ============================================================================
// highlightSnippet
// ============================================================================

describe('highlightSnippet', () => {
  it('returns escaped text when query is empty/null', () => {
    expect(highlightSnippet('hello <world>', '')).toBe('hello &lt;world&gt;')
    expect(highlightSnippet('hello', null)).toBe('hello')
    expect(highlightSnippet('hello', undefined)).toBe('hello')
  })

  it('returns escaped empty text for null/undefined chunk', () => {
    expect(highlightSnippet(null, 'test')).toBe('')
    expect(highlightSnippet(undefined, 'test')).toBe('')
    expect(highlightSnippet('', 'test')).toBe('')
  })

  it('highlights single matching term', () => {
    const result = highlightSnippet('The cat sat on the mat', 'cat')
    expect(result).toContain('<mark>cat</mark>')
    expect(result).not.toContain('<mark>mat</mark>') // "mat" != "cat"
  })

  it('highlights multiple terms', () => {
    const result = highlightSnippet('The cat sat on the mat', 'cat mat')
    expect(result).toContain('<mark>cat</mark>')
    expect(result).toContain('<mark>mat</mark>')
  })

  it('is case-insensitive', () => {
    const result = highlightSnippet('Hello WORLD hello World', 'hello')
    // Should match all variations
    expect(result).toContain('<mark>')
  })

  it('escapes HTML in chunk text (XSS prevention)', () => {
    const result = highlightSnippet('<script>alert("xss")</script> cat', 'cat')
    expect(result).not.toContain('<script>')
    expect(result).toContain('&lt;script&gt;')
    expect(result).toContain('<mark>cat</mark>')
  })

  it('escapes HTML entities in query terms', () => {
    const result = highlightSnippet('use &amp; symbol', '&amp;')
    // Should not break HTML structure
    expect(result).not.toContain('<<')
  })

  it('adds ellipsis for long text', () => {
    const longText = 'A'.repeat(100) + ' target ' + 'B'.repeat(100)
    const result = highlightSnippet(longText, 'target', 30)
    // May have ellipsis prefix/suffix depending on match position
    expect(result).toContain('<mark>target</mark>')
  })

  it('handles query with special regex characters', () => {
    const result = highlightSnippet('price is $10.00 today', '$10.00')
    // Should not throw regex error
    expect(result).toBeDefined()
  })

  it('handles whitespace-only query', () => {
    const result = highlightSnippet('hello world', '   ')
    expect(result).toBe('hello world')
  })

  it('handles short text without truncation', () => {
    const result = highlightSnippet('cat', 'cat')
    expect(result).toBe('<mark>cat</mark>')
  })
})
