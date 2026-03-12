import { describe, it, expect } from 'vitest'
import { prepareEmbeddingMaterial, buildDefault, buildSticker, buildSlides, stripAndTruncate } from './embedding-material'

// ============================================================================
// stripAndTruncate
// ============================================================================

describe('stripAndTruncate', () => {
  it('returns empty string for null/undefined', () => {
    expect(stripAndTruncate(null, 100)).toBe('')
    expect(stripAndTruncate(undefined, 100)).toBe('')
    expect(stripAndTruncate('', 100)).toBe('')
  })

  it('collapses whitespace and trims', () => {
    expect(stripAndTruncate('  hello   world  ', 100)).toBe('hello world')
  })

  it('truncates to maxLength', () => {
    expect(stripAndTruncate('abcdefghij', 5)).toBe('abcde')
  })

  it('does not truncate if under maxLength', () => {
    expect(stripAndTruncate('abc', 5)).toBe('abc')
  })
})

// ============================================================================
// buildDefault
// ============================================================================

describe('buildDefault', () => {
  it('returns empty array if no images', () => {
    expect(buildDefault({ prompt: 'test' })).toEqual([])
    expect(buildDefault({ prompt: 'test', images: [] })).toEqual([])
  })

  it('returns one item per image with prompt text', () => {
    const record = {
      prompt: 'a cat',
      images: [
        { opfsPath: '/images/1/0.webp', thumbnail: 'base64...' },
        { opfsPath: '/images/1/1.webp', thumbnail: 'base64...' },
      ],
    }
    const result = buildDefault(record)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ text: 'a cat', imagePath: '/images/1/0.webp' })
    expect(result[1]).toEqual({ text: 'a cat', imagePath: '/images/1/1.webp' })
  })

  it('skips images without opfsPath', () => {
    const record = {
      prompt: 'test',
      images: [
        { opfsPath: '/images/1/0.webp' },
        { thumbnail: 'only-thumbnail' },
      ],
    }
    const result = buildDefault(record)
    expect(result).toHaveLength(1)
    expect(result[0].imagePath).toBe('/images/1/0.webp')
  })

  it('uses empty string when no prompt', () => {
    const record = {
      images: [{ opfsPath: '/images/1/0.webp' }],
    }
    const result = buildDefault(record)
    expect(result[0].text).toBe('')
  })
})

// ============================================================================
// buildSticker
// ============================================================================

describe('buildSticker', () => {
  it('returns empty array if no images', () => {
    expect(buildSticker({ prompt: 'test' })).toEqual([])
    expect(buildSticker({ prompt: 'test', images: [] })).toEqual([])
  })

  it('returns only the first image (sticker sheet)', () => {
    const record = {
      prompt: 'cute cat sticker',
      images: [
        { opfsPath: '/images/1/0.webp' },
        { opfsPath: '/images/1/1.webp' },
        { opfsPath: '/images/1/2.webp' },
      ],
    }
    const result = buildSticker(record)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ text: 'cute cat sticker', imagePath: '/images/1/0.webp' })
  })

  it('returns empty if first image has no opfsPath', () => {
    const record = {
      prompt: 'test',
      images: [{ thumbnail: 'base64' }],
    }
    expect(buildSticker(record)).toEqual([])
  })
})

// ============================================================================
// buildSlides
// ============================================================================

describe('buildSlides', () => {
  it('returns empty array if no images', () => {
    expect(buildSlides({ prompt: 'test' })).toEqual([])
    expect(buildSlides({ prompt: 'test', images: [] })).toEqual([])
  })

  it('combines pageContent and narration for each page', () => {
    const record = {
      prompt: 'my slides',
      images: [
        { opfsPath: '/images/1/0.webp' },
        { opfsPath: '/images/1/1.webp' },
      ],
      options: {
        pagesContent: [
          { content: 'Page 1 content' },
          { content: 'Page 2 content' },
        ],
      },
      narration: {
        scripts: [
          { script: 'Narration for page 1' },
          { script: 'Narration for page 2' },
        ],
      },
    }
    const result = buildSlides(record)
    expect(result).toHaveLength(2)
    expect(result[0].text).toBe('Page 1 content Narration for page 1')
    expect(result[0].imagePath).toBe('/images/1/0.webp')
    expect(result[1].text).toBe('Page 2 content Narration for page 2')
  })

  it('falls back to prompt when page has no content or narration', () => {
    const record = {
      prompt: 'fallback prompt',
      images: [{ opfsPath: '/images/1/0.webp' }],
    }
    const result = buildSlides(record)
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('fallback prompt')
  })

  it('preserves page index alignment when middle image is missing opfsPath', () => {
    const record = {
      prompt: 'fallback',
      images: [
        { opfsPath: '/images/1/0.webp' },
        { thumbnail: 'no-opfs' }, // missing opfsPath — should be skipped
        { opfsPath: '/images/1/2.webp' },
      ],
      options: {
        pagesContent: [
          { content: 'Page 0' },
          { content: 'Page 1 (skipped image)' },
          { content: 'Page 2' },
        ],
      },
      narration: {
        scripts: [
          { script: 'Narration 0' },
          { script: 'Narration 1' },
          { script: 'Narration 2' },
        ],
      },
    }
    const result = buildSlides(record)
    expect(result).toHaveLength(2)
    // First result should pair with page 0 (original index 0)
    expect(result[0].text).toBe('Page 0 Narration 0')
    expect(result[0].imagePath).toBe('/images/1/0.webp')
    // Second result should pair with page 2 (original index 2), NOT page 1
    expect(result[1].text).toBe('Page 2 Narration 2')
    expect(result[1].imagePath).toBe('/images/1/2.webp')
  })

  it('truncates combined text to 1024 chars', () => {
    const longContent = 'x'.repeat(800)
    const longNarration = 'y'.repeat(800)
    const record = {
      prompt: 'prompt',
      images: [{ opfsPath: '/images/1/0.webp' }],
      options: { pagesContent: [{ content: longContent }] },
      narration: { scripts: [{ script: longNarration }] },
    }
    const result = buildSlides(record)
    expect(result[0].text.length).toBe(1024)
  })
})

// ============================================================================
// prepareEmbeddingMaterial
// ============================================================================

describe('prepareEmbeddingMaterial', () => {
  it('returns empty for null/undefined', () => {
    expect(prepareEmbeddingMaterial(null)).toEqual([])
    expect(prepareEmbeddingMaterial(undefined)).toEqual([])
  })

  it('returns empty for video mode', () => {
    expect(prepareEmbeddingMaterial({ mode: 'video', images: [{ opfsPath: '/x' }] })).toEqual([])
  })

  it('returns empty for unknown mode', () => {
    expect(prepareEmbeddingMaterial({ mode: 'unknown', images: [{ opfsPath: '/x' }] })).toEqual([])
  })

  it('delegates to correct builder for generate mode', () => {
    const record = {
      mode: 'generate',
      prompt: 'test',
      images: [{ opfsPath: '/images/1/0.webp' }],
    }
    const result = prepareEmbeddingMaterial(record)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ text: 'test', imagePath: '/images/1/0.webp' })
  })

  it('delegates to sticker builder', () => {
    const record = {
      mode: 'sticker',
      prompt: 'sticker',
      images: [{ opfsPath: '/a' }, { opfsPath: '/b' }],
    }
    const result = prepareEmbeddingMaterial(record)
    expect(result).toHaveLength(1) // Only first image
  })

  it('delegates to slides builder', () => {
    const record = {
      mode: 'slides',
      prompt: 'slides',
      images: [{ opfsPath: '/s0' }, { opfsPath: '/s1' }],
      options: { pagesContent: [{ content: 'p1' }, { content: 'p2' }] },
    }
    const result = prepareEmbeddingMaterial(record)
    expect(result).toHaveLength(2)
  })

  it('handles agent mode (uses buildDefault)', () => {
    const record = {
      mode: 'agent',
      prompt: 'agent query',
      images: [{ opfsPath: '/agent/0.webp' }],
    }
    const result = prepareEmbeddingMaterial(record)
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('agent query')
  })

  it('handles edit mode', () => {
    const record = {
      mode: 'edit',
      prompt: 'edit this',
      images: [{ opfsPath: '/e/0.webp' }, { opfsPath: '/e/1.webp' }],
    }
    const result = prepareEmbeddingMaterial(record)
    expect(result).toHaveLength(2)
  })

  it('handles story mode', () => {
    const record = {
      mode: 'story',
      prompt: 'a story',
      images: [{ opfsPath: '/s/0.webp' }, { opfsPath: '/s/1.webp' }, { opfsPath: '/s/2.webp' }],
    }
    const result = prepareEmbeddingMaterial(record)
    expect(result).toHaveLength(3)
  })

  it('handles diagram mode', () => {
    const record = {
      mode: 'diagram',
      prompt: 'diagram',
      images: [{ opfsPath: '/d/0.webp' }],
    }
    const result = prepareEmbeddingMaterial(record)
    expect(result).toHaveLength(1)
  })
})
