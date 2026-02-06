import { describe, it, expect } from 'vitest'
import {
  buildPrompt,
  buildGeneratePrompt,
  buildStickerPrompt,
  buildEditPrompt,
  buildStoryPrompt,
  buildDiagramPrompt,
  buildSlidesPrompt,
} from './promptBuilders'

// ============================================================================
// buildPrompt (strategy dispatch)
// ============================================================================

describe('buildPrompt', () => {
  it('dispatches to generate builder', () => {
    const result = buildPrompt('a cat', {}, 'generate')
    expect(result).toContain('Generate an image')
  })

  it('dispatches to edit builder', () => {
    const result = buildPrompt('make it blue', {}, 'edit')
    expect(result).toContain('Edit this image')
  })

  it('dispatches to story builder', () => {
    const result = buildPrompt('a journey', {}, 'story')
    expect(result).toContain('image sequence')
  })

  it('dispatches to diagram builder', () => {
    const result = buildPrompt('system architecture', {}, 'diagram')
    expect(result).toContain('diagram')
  })

  it('dispatches to sticker builder', () => {
    const result = buildPrompt('happy cat', {}, 'sticker')
    expect(result).toContain('sticker sheet')
  })

  it('dispatches to slides builder', () => {
    const result = buildPrompt('Introduction', {}, 'slides')
    expect(result).toContain('Slide Generation Task')
  })

  it('returns base prompt for unknown mode', () => {
    const result = buildPrompt('hello world', {}, 'unknown_mode')
    expect(result).toBe('hello world')
  })
})

// ============================================================================
// buildGeneratePrompt
// ============================================================================

describe('buildGeneratePrompt', () => {
  it('wraps base prompt with prefix', () => {
    const result = buildGeneratePrompt('a sunset', {})
    expect(result).toBe('Generate an image: a sunset')
  })

  it('includes styles when provided', () => {
    const result = buildGeneratePrompt('a cat', { styles: ['anime', 'watercolor'] })
    expect(result).toContain('anime, watercolor style')
  })

  it('includes variations when provided', () => {
    const result = buildGeneratePrompt('a dog', { variations: ['lighting', 'pose'] })
    expect(result).toContain('with lighting and pose variations')
  })

  it('omits styles/variations when empty arrays', () => {
    const result = buildGeneratePrompt('a tree', { styles: [], variations: [] })
    expect(result).toBe('Generate an image: a tree')
  })
})

// ============================================================================
// buildEditPrompt
// ============================================================================

describe('buildEditPrompt', () => {
  it('wraps with edit prefix', () => {
    expect(buildEditPrompt('make it red')).toBe('Edit this image: make it red')
  })
})

// ============================================================================
// buildStoryPrompt
// ============================================================================

describe('buildStoryPrompt', () => {
  it('includes base prompt', () => {
    const result = buildStoryPrompt('a hero journey', {})
    expect(result).toContain('a hero journey')
  })

  it('adds type when not unspecified', () => {
    const result = buildStoryPrompt('test', { type: 'comic', steps: 4 })
    expect(result).toContain('comic sequence')
  })

  it('adds steps count', () => {
    const result = buildStoryPrompt('test', { steps: 6 })
    expect(result).toContain('6 steps')
  })

  it('filters out unspecified options', () => {
    const result = buildStoryPrompt('test', {
      type: 'unspecified',
      style: 'unspecified',
      transition: 'unspecified',
      format: 'unspecified',
    })
    expect(result).not.toContain('unspecified')
  })

  it('includes multiple specified options', () => {
    const result = buildStoryPrompt('test', {
      type: 'animation',
      style: 'pixar',
      transition: 'fade',
      format: 'landscape',
      steps: 3,
    })
    expect(result).toContain('animation sequence')
    expect(result).toContain('pixar visual style')
    expect(result).toContain('fade transitions')
    expect(result).toContain('landscape format')
  })
})

// ============================================================================
// buildDiagramPrompt
// ============================================================================

describe('buildDiagramPrompt', () => {
  it('defaults to "diagram" when type is unspecified', () => {
    const result = buildDiagramPrompt('test', { type: 'unspecified' })
    expect(result).toMatch(/Generate a diagram/)
  })

  it('uses specified type', () => {
    const result = buildDiagramPrompt('test', { type: 'flowchart' })
    expect(result).toContain('flowchart diagram')
  })

  it('filters out unspecified options', () => {
    const result = buildDiagramPrompt('test', {
      type: 'unspecified',
      style: 'unspecified',
      layout: 'unspecified',
      complexity: 'unspecified',
      annotations: 'unspecified',
    })
    expect(result).not.toContain('unspecified')
  })

  it('includes all specified options', () => {
    const result = buildDiagramPrompt('test', {
      type: 'sequence',
      style: 'minimal',
      layout: 'vertical',
      complexity: 'simple',
      annotations: 'detailed',
    })
    expect(result).toContain('sequence diagram')
    expect(result).toContain('minimal style')
    expect(result).toContain('vertical layout')
    expect(result).toContain('simple complexity')
    expect(result).toContain('detailed annotations')
  })
})

// ============================================================================
// buildStickerPrompt
// ============================================================================

describe('buildStickerPrompt', () => {
  it('includes sticker sheet prefix', () => {
    const result = buildStickerPrompt('cute cat', {})
    expect(result).toContain('sticker sheet')
  })

  it('includes grid layout', () => {
    const result = buildStickerPrompt('cat', { layoutRows: 2, layoutCols: 4 })
    expect(result).toContain('2x4 grid')
    expect(result).toContain('8 stickers total')
  })

  it('includes context for known context type', () => {
    const result = buildStickerPrompt('cat', { context: 'chat' })
    expect(result).toContain('casual chat')
  })

  it('includes custom context', () => {
    const result = buildStickerPrompt('cat', { context: 'custom', customContext: 'work meetings' })
    expect(result).toContain('work meetings')
  })

  it('includes text caption options when hasText is true', () => {
    const result = buildStickerPrompt('cat', {
      hasText: true,
      tones: ['friendly'],
      languages: ['zh-TW'],
    })
    expect(result).toContain('text captions')
    expect(result).toContain('friendly/casual tone')
    expect(result).toContain('Traditional Chinese')
  })

  it('specifies no text when hasText is false', () => {
    const result = buildStickerPrompt('cat', { hasText: false })
    expect(result).toContain('No text on stickers')
  })

  it('includes customTone only (no tones array)', () => {
    const result = buildStickerPrompt('cat', { hasText: true, customTone: 'nerdy' })
    expect(result).toContain('nerdy tone')
  })

  it('includes customLanguage only (no languages array)', () => {
    const result = buildStickerPrompt('cat', { hasText: true, customLanguage: 'Korean' })
    expect(result).toContain('text in Korean')
  })

  it('appends customTone to mapped tones', () => {
    const result = buildStickerPrompt('cat', {
      hasText: true,
      tones: ['formal'],
      customTone: 'nerdy',
    })
    expect(result).toContain('formal')
    expect(result).toContain('nerdy')
  })

  it('appends customLanguage to mapped languages', () => {
    const result = buildStickerPrompt('cat', {
      hasText: true,
      languages: ['en'],
      customLanguage: 'Korean',
    })
    expect(result).toContain('English')
    expect(result).toContain('Korean')
  })

  it('includes camera angle labels', () => {
    const result = buildStickerPrompt('cat', { cameraAngles: ['fullbody'] })
    expect(result).toContain('full-body shot')
  })

  it('includes expression labels', () => {
    const result = buildStickerPrompt('cat', { expressions: ['exaggerated'] })
    expect(result).toContain('exaggerated expressions')
  })

  it('includes styles in sticker prompt', () => {
    const result = buildStickerPrompt('cat', { styles: ['kawaii'] })
    expect(result).toContain('kawaii style')
  })

  it('shows generic text captions when hasText but no tone/language', () => {
    const result = buildStickerPrompt('cat', { hasText: true })
    expect(result).toContain('Include text captions')
  })
})

// ============================================================================
// buildSlidesPrompt
// ============================================================================

describe('buildSlidesPrompt', () => {
  it('includes page number and total', () => {
    const result = buildSlidesPrompt('Intro', { pageNumber: 1, totalPages: 5 })
    expect(result).toContain('Page 1 of 5')
  })

  it('includes global style', () => {
    const result = buildSlidesPrompt('Content', { analyzedStyle: 'Modern dark theme' })
    expect(result).toContain('Modern dark theme')
  })

  it('uses default style when analyzedStyle is empty', () => {
    const result = buildSlidesPrompt('Content', {})
    expect(result).toContain('Professional presentation slide design')
  })

  it('includes presentation overview when globalPrompt provided', () => {
    const result = buildSlidesPrompt('Content', { globalPrompt: 'AI conference talk' })
    expect(result).toContain('PRESENTATION OVERVIEW')
    expect(result).toContain('AI conference talk')
  })

  it('omits overview section when no globalPrompt', () => {
    const result = buildSlidesPrompt('Content', {})
    expect(result).not.toContain('PRESENTATION OVERVIEW')
  })

  it('includes page-specific style when provided', () => {
    const result = buildSlidesPrompt('Content', { pageStyleGuide: 'Use large title' })
    expect(result).toContain('Page-Specific Adjustments')
    expect(result).toContain('Use large title')
  })
})
