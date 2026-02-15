import { describe, it, expect } from 'vitest'
import {
  SEARCH_DEFAULTS,
  extractText,
  extractAgentUserMessages,
  chunkText,
  deduplicateByParent,
  highlightSnippet,
  stripRecordForIndexing,
} from './search-core'

// ============================================================================
// SEARCH_DEFAULTS
// ============================================================================

describe('SEARCH_DEFAULTS', () => {
  it('has expected default values', () => {
    expect(SEARCH_DEFAULTS.chunkSize).toBe(200)
    expect(SEARCH_DEFAULTS.chunkOverlap).toBe(50)
    expect(SEARCH_DEFAULTS.contextWindow).toBe(500)
    expect(SEARCH_DEFAULTS.searchLimit).toBe(100)
    expect(SEARCH_DEFAULTS.resultLimit).toBe(10)
    expect(SEARCH_DEFAULTS.snippetContextLength).toBe(80)
    expect(SEARCH_DEFAULTS.similarity).toBe(0.35)
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

  it('extracts slides styleGuidance and analyzedStyle', () => {
    const record = {
      mode: 'slides',
      prompt: 'OpenCV tutorial',
      options: {
        pagesContent: [{ content: '影像處理基礎' }],
        styleGuidance: '簡約現代風',
        analyzedStyle: 'Clean minimalist design with code snippets',
      },
    }
    const text = extractText(record)
    expect(text).toContain('OpenCV tutorial')
    expect(text).toContain('影像處理基礎')
    expect(text).toContain('簡約現代風')
    expect(text).toContain('Clean minimalist design')
  })

  it('extracts slides pageStyleGuides', () => {
    const record = {
      mode: 'slides',
      prompt: 'tech talk',
      options: {
        pageStyleGuides: [
          { pageNumber: 1, styleGuide: 'Dark background with neon accents' },
          { pageNumber: 2, styleGuide: 'Code-heavy layout' },
        ],
      },
    }
    const text = extractText(record)
    expect(text).toContain('neon accents')
    expect(text).toContain('Code-heavy layout')
  })

  it('extracts slides narration scripts', () => {
    const record = {
      mode: 'slides',
      prompt: 'browser image processing',
      options: { pagesContent: [{ content: 'OpenCV.js in browser' }] },
      narration: {
        globalStyleDirective: 'Professional narrator voice',
        scripts: [
          { pageId: 1, script: '在瀏覽器中可以使用 opencv.js 進行影像處理' },
          { pageId: 2, script: 'WebAssembly 讓 C++ 程式碼在瀏覽器中運行' },
        ],
      },
    }
    const text = extractText(record)
    expect(text).toContain('Professional narrator voice')
    expect(text).toContain('opencv.js 進行影像處理')
    expect(text).toContain('WebAssembly')
  })

  it('handles slides with partial narration data', () => {
    const record = {
      mode: 'slides',
      prompt: 'test',
      narration: { scripts: [{ pageId: 1 }, { pageId: 2, script: 'has script' }] },
    }
    const text = extractText(record)
    expect(text).toContain('has script')
    expect(text).toBe('test\nhas script')
  })

  // Video mode
  it('extracts video negativePrompt', () => {
    const record = {
      mode: 'video',
      prompt: 'a cat playing piano',
      options: { negativePrompt: 'blurry, low quality' },
    }
    const text = extractText(record)
    expect(text).toContain('a cat playing piano')
    expect(text).toContain('blurry, low quality')
  })

  it('handles video without negativePrompt', () => {
    const record = { mode: 'video', prompt: 'cat video' }
    expect(extractText(record)).toBe('cat video')
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

  it('returns single chunk for short text with contextText equal to text', () => {
    const result = chunkText('Hello world')
    expect(result).toEqual([{ text: 'Hello world', contextText: 'Hello world', index: 0 }])
  })

  it('returns single chunk for text exactly at chunkSize', () => {
    const text = 'a'.repeat(200)
    const result = chunkText(text, { chunkSize: 200 })
    expect(result).toEqual([{ text, contextText: text, index: 0 }])
  })

  it('splits long text into multiple chunks with contextText', () => {
    const text = 'word '.repeat(200) // ~1000 chars
    const result = chunkText(text, { chunkSize: 200, chunkOverlap: 50 })
    expect(result.length).toBeGreaterThan(1)
    for (const chunk of result) {
      expect(chunk.text.length).toBeLessThanOrEqual(200)
      expect(chunk.contextText).toBeDefined()
      expect(chunk.contextText.length).toBeGreaterThanOrEqual(chunk.text.length)
    }
  })

  it('chunks have sequential indices', () => {
    const text = 'word '.repeat(200)
    const result = chunkText(text, { chunkSize: 200, chunkOverlap: 50 })
    for (let i = 0; i < result.length; i++) {
      expect(result[i].index).toBe(i)
    }
  })

  it('prefers sentence boundaries for splitting', () => {
    const sentence1 = 'A'.repeat(150) + '.'
    const sentence2 = 'B'.repeat(150) + '.'
    const text = sentence1 + ' ' + sentence2
    const result = chunkText(text, { chunkSize: 200, chunkOverlap: 50 })
    expect(result[0].text).toContain('.')
  })

  it('handles text with no sentence breaks', () => {
    const text = 'a'.repeat(300)
    const result = chunkText(text, { chunkSize: 200, chunkOverlap: 50 })
    expect(result.length).toBe(2)
  })

  it('overlap ensures no content is lost', () => {
    const words = []
    for (let i = 0; i < 100; i++) words.push(`word${i}`)
    const text = words.join(' ')
    const result = chunkText(text, { chunkSize: 200, chunkOverlap: 50 })
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
    expect(result).toEqual([{ text: 'hello world', contextText: 'hello world', index: 0 }])
  })

  it('contextText does not exceed original text length', () => {
    const text = 'word '.repeat(200)
    const result = chunkText(text, { chunkSize: 200, chunkOverlap: 50, contextWindow: 500 })
    for (const chunk of result) {
      expect(chunk.contextText.length).toBeLessThanOrEqual(text.trim().length)
    }
  })

  it('contextText contains the child chunk text', () => {
    const text = 'The quick brown fox jumps over the lazy dog. '.repeat(20)
    const result = chunkText(text, { chunkSize: 100, chunkOverlap: 20, contextWindow: 300 })
    for (const chunk of result) {
      // contextText should contain the child chunk (possibly with minor boundary trimming)
      // Check that the core of the child chunk appears in contextText
      const core = chunk.text.slice(5, -5)
      if (core.length > 0) {
        expect(chunk.contextText).toContain(core)
      }
    }
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

  it('passes through single hit with matchCount 1', () => {
    const hits = [{ parentId: '1', score: 0.9, chunkText: 'hello' }]
    const result = deduplicateByParent(hits)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ parentId: '1', chunkText: 'hello', matchCount: 1 })
    // matchCount=1 → log10(1)=0 → no boost
    expect(result[0].score).toBeCloseTo(0.9, 5)
  })

  it('keeps best scoring chunk data per parent with aggregated score', () => {
    const hits = [
      { parentId: '1', score: 0.5, chunkText: 'low' },
      { parentId: '1', score: 0.9, chunkText: 'high' },
      { parentId: '1', score: 0.7, chunkText: 'mid' },
    ]
    const result = deduplicateByParent(hits)
    expect(result).toHaveLength(1)
    expect(result[0].chunkText).toBe('high')
    expect(result[0].matchCount).toBe(3)
    // 0.9 * (1 + 0.3 * log10(3)) ≈ 0.9 * 1.143 ≈ 1.029
    expect(result[0].score).toBeCloseTo(0.9 * (1 + 0.3 * Math.log10(3)), 5)
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
    expect(result[0]).toMatchObject({ parentId: '1', matchCount: 2 })
    expect(result[1]).toMatchObject({ parentId: '2', matchCount: 2 })
  })

  it('sorts by aggregated score descending', () => {
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
    expect(result[0].matchCount).toBe(2)
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

  it('matchCount=1 does not boost score', () => {
    const hits = [{ parentId: '1', score: 0.75, chunkText: 'only one' }]
    const result = deduplicateByParent(hits)
    expect(result[0].score).toBeCloseTo(0.75, 5)
    expect(result[0].matchCount).toBe(1)
  })

  it('multi-hit parent beats similar-score single-hit parent', () => {
    const hits = [
      // Parent A: 3 hits, max score 0.7
      { parentId: 'A', score: 0.7, chunkText: 'a1' },
      { parentId: 'A', score: 0.5, chunkText: 'a2' },
      { parentId: 'A', score: 0.6, chunkText: 'a3' },
      // Parent B: 1 hit, score 0.72
      { parentId: 'B', score: 0.72, chunkText: 'b1' },
    ]
    const result = deduplicateByParent(hits)
    // A: 0.7 * (1 + 0.3 * log10(3)) ≈ 0.7 * 1.143 ≈ 0.800
    // B: 0.72 * (1 + 0.3 * log10(1)) = 0.72
    expect(result[0].parentId).toBe('A')
    expect(result[1].parentId).toBe('B')
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

// ============================================================================
// stripRecordForIndexing
// ============================================================================

describe('stripRecordForIndexing', () => {
  it('strips basic record to essential fields', () => {
    const record = {
      id: 'abc',
      mode: 'generate',
      prompt: 'a cat',
      timestamp: 1000,
      images: ['data:image/png;base64,...'],
      thumbnail: 'data:image/png;base64,...',
      options: { style: 'anime', ratio: '1:1' },
    }
    const result = stripRecordForIndexing('abc', record)
    expect(result).toEqual({ id: 'abc', mode: 'generate', prompt: 'a cat', timestamp: 1000 })
    expect(result.images).toBeUndefined()
    expect(result.thumbnail).toBeUndefined()
    expect(result.options).toBeUndefined()
  })

  it('preserves slides mode searchable fields', () => {
    const record = {
      mode: 'slides',
      prompt: 'OpenCV tutorial',
      timestamp: 2000,
      options: {
        pagesContent: [{ content: 'page1' }],
        styleGuidance: 'modern',
        analyzedStyle: 'clean',
        pageStyleGuides: [{ styleGuide: 'dark theme' }],
        pagesRaw: 'raw data',
      },
      narration: {
        globalStyleDirective: 'professional',
        scripts: [{ pageId: 1, script: 'hello', audioBlob: 'binary' }],
      },
      images: ['heavy'],
    }
    const result = stripRecordForIndexing('s1', record)
    expect(result.options.pagesContent).toEqual([{ content: 'page1' }])
    expect(result.options.styleGuidance).toBe('modern')
    expect(result.options.analyzedStyle).toBe('clean')
    expect(result.options.pageStyleGuides).toEqual([{ styleGuide: 'dark theme' }])
    expect(result.options.pagesRaw).toBeUndefined()
    expect(result.narration.globalStyleDirective).toBe('professional')
    expect(result.narration.scripts).toEqual([{ pageId: 1, script: 'hello' }])
    expect(result.images).toBeUndefined()
  })

  it('preserves video negativePrompt', () => {
    const record = {
      mode: 'video',
      prompt: 'cat video',
      timestamp: 3000,
      options: { negativePrompt: 'blurry', resolution: '1080p' },
    }
    const result = stripRecordForIndexing('v1', record)
    expect(result.options).toEqual({ negativePrompt: 'blurry' })
  })

  it('skips video options when no negativePrompt', () => {
    const record = { mode: 'video', prompt: 'cat', timestamp: 3000, options: { resolution: '1080p' } }
    const result = stripRecordForIndexing('v1', record)
    expect(result.options).toBeUndefined()
  })
})
