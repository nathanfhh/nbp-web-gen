// ============================================================================
// Prompt Builder Strategies
// ============================================================================

// ============================================================================
// Sticker Mode Constants
// ============================================================================

const STICKER_PROMPT_PREFIX =
  'A flat vector sticker sheet, arranged in a grid layout, knolling style. Each item has a thick white die-cut border contour. Isolated on a solid, uniform dark background color that is unlikely to appear in the sticker content (e.g., deep navy, dark teal, or charcoal - pick the best contrast). Wide spacing between items, no overlapping. Clean lines.'

const STICKER_CONTEXTS = {
  chat: 'for casual chat replies',
  group: 'for group chat interactions',
  boss: 'for replying to boss/supervisor',
  couple: 'for couples/romantic interactions',
  custom: '',
}

const STICKER_TONES = {
  formal: 'formal',
  polite: 'polite',
  friendly: 'friendly/casual',
  sarcastic: 'sarcastic/playful roasting',
}

const STICKER_LANGUAGES = {
  'zh-TW': 'Traditional Chinese',
  en: 'English',
  ja: 'Japanese',
}

const STICKER_CAMERA_ANGLES = {
  headshot: 'headshot/close-up face',
  halfbody: 'half-body shot',
  fullbody: 'full-body shot',
}

const STICKER_EXPRESSIONS = {
  natural: 'natural expressions',
  exaggerated: 'exaggerated expressions',
  crazy: 'over-the-top/crazy expressions',
}

// ============================================================================
// Prompt Builder Functions
// ============================================================================

/**
 * Build prompt for generate mode
 */
const buildGeneratePrompt = (basePrompt, options) => {
  let prompt = basePrompt

  if (options.styles?.length > 0) {
    prompt += `, ${options.styles.join(', ')} style`
  }
  if (options.variations?.length > 0) {
    prompt += `, with ${options.variations.join(' and ')} variations`
  }

  return `Generate an image: ${prompt}`
}

/**
 * Build prompt for sticker mode
 */
const buildStickerPrompt = (basePrompt, options) => {
  let prompt = basePrompt
  const stickerParts = []

  // Layout (rows x cols)
  const rows = options.layoutRows || 3
  const cols = options.layoutCols || 3
  const totalCount = rows * cols
  stickerParts.push(`arranged in a ${rows}x${cols} grid (${totalCount} stickers total)`)

  // Context/Usage
  if (options.context) {
    if (options.context === 'custom' && options.customContext) {
      stickerParts.push(`for ${options.customContext}`)
    } else if (STICKER_CONTEXTS[options.context]) {
      stickerParts.push(STICKER_CONTEXTS[options.context])
    }
  }

  // Composition - Camera angles
  if (options.cameraAngles?.length > 0) {
    const angleLabels = options.cameraAngles.map((a) => STICKER_CAMERA_ANGLES[a]).filter(Boolean)
    if (angleLabels.length > 0) {
      stickerParts.push(`covering: ${angleLabels.join(', ')}`)
    }
  }

  // Composition - Expressions
  if (options.expressions?.length > 0) {
    const exprLabels = options.expressions.map((e) => STICKER_EXPRESSIONS[e]).filter(Boolean)
    if (exprLabels.length > 0) {
      stickerParts.push(`with ${exprLabels.join(', ')}`)
    }
  }

  // Text related
  if (options.hasText) {
    const textParts = []

    // Tones
    if (options.tones?.length > 0) {
      const toneLabels = options.tones.map((t) => STICKER_TONES[t]).filter(Boolean)
      if (options.customTone) {
        toneLabels.push(options.customTone)
      }
      if (toneLabels.length > 0) {
        textParts.push(`${toneLabels.join(', ')} tone`)
      }
    } else if (options.customTone) {
      textParts.push(`${options.customTone} tone`)
    }

    // Languages
    if (options.languages?.length > 0) {
      const langLabels = options.languages.map((l) => STICKER_LANGUAGES[l]).filter(Boolean)
      if (options.customLanguage) {
        langLabels.push(options.customLanguage)
      }
      if (langLabels.length > 0) {
        textParts.push(`text in ${langLabels.join(', ')}`)
      }
    } else if (options.customLanguage) {
      textParts.push(`text in ${options.customLanguage}`)
    }

    if (textParts.length > 0) {
      stickerParts.push(`Include text captions with ${textParts.join(', ')}`)
    } else {
      stickerParts.push('Include text captions')
    }
  } else {
    stickerParts.push('No text on stickers')
  }

  // Styles
  if (options.styles?.length > 0) {
    prompt += `, ${options.styles.join(', ')} style`
  }

  // Build final prompt
  const stickerSuffix = stickerParts.length > 0 ? `. ${stickerParts.join('. ')}.` : ''
  return `${STICKER_PROMPT_PREFIX} ${prompt}${stickerSuffix}`
}

/**
 * Build prompt for edit mode
 */
const buildEditPrompt = (basePrompt) => {
  return `Edit this image: ${basePrompt}`
}

/**
 * Build prompt for story mode
 */
const buildStoryPrompt = (basePrompt, options) => {
  const parts = []

  if (options.type && options.type !== 'unspecified') {
    parts.push(`${options.type} sequence`)
  }
  if (options.steps) {
    parts.push(`${options.steps} steps`)
  }
  if (options.style && options.style !== 'unspecified') {
    parts.push(`${options.style} visual style`)
  }
  if (options.transition && options.transition !== 'unspecified') {
    parts.push(`${options.transition} transitions`)
  }
  if (options.format && options.format !== 'unspecified') {
    parts.push(`${options.format} format`)
  }

  let prompt = basePrompt
  if (parts.length > 0) {
    prompt += `. Create as a ${parts.join(', ')}`
  }

  return `Generate an image sequence: ${prompt}`
}

/**
 * Build prompt for diagram mode
 */
const buildDiagramPrompt = (basePrompt, options) => {
  const parts = []

  if (options.type && options.type !== 'unspecified') {
    parts.push(`${options.type} diagram`)
  } else {
    parts.push('diagram')
  }
  if (options.style && options.style !== 'unspecified') {
    parts.push(`${options.style} style`)
  }
  if (options.layout && options.layout !== 'unspecified') {
    parts.push(`${options.layout} layout`)
  }
  if (options.complexity && options.complexity !== 'unspecified') {
    parts.push(`${options.complexity} complexity`)
  }
  if (options.annotations && options.annotations !== 'unspecified') {
    parts.push(`${options.annotations} annotations`)
  }

  return `Generate a ${parts.join(', ')} image: ${basePrompt}`
}

/**
 * Build prompt for slides mode
 * Uses Markdown structure to clearly separate semantic sections for LLM understanding
 * Style is additive: globalStyle + pageStyleGuide (composition, not replacement)
 * @param {string} pageContent - Content for this specific page
 * @param {Object} options - Options including analyzedStyle, pageStyleGuide, pageNumber, totalPages, globalPrompt
 */
const buildSlidesPrompt = (pageContent, options) => {
  // Build style guide: combine global + page-specific (additive/composition)
  const globalStyle = options.analyzedStyle || 'Professional presentation slide design'
  const pageStyle = options.pageStyleGuide?.trim()

  const pageNumber = options.pageNumber || 1
  const totalPages = options.totalPages || 1
  const globalPrompt = options.globalPrompt?.trim() || ''

  // Build presentation overview section (independent from slide content)
  const overviewSection = globalPrompt
    ? `
## PRESENTATION OVERVIEW
> This section provides background context about the entire presentation.
> Use this information to understand the topic, audience, and purpose - but DO NOT display this text on the slide.

${globalPrompt}

---
`
    : ''

  // Build page-specific style section (if provided)
  const pageStyleSection = pageStyle
    ? `
### Page-Specific Adjustments
> Additional styling requirements for THIS specific page (additive to global style):

${pageStyle}
`
    : ''

  return `# Slide Generation Task

Generate a presentation slide image for **Page ${pageNumber} of ${totalPages}**.
${overviewSection}
## DESIGN STYLE GUIDE
> This section defines the visual design language. Apply these styles consistently across all slides.

### Global Style
${globalStyle}
${pageStyleSection}
---

## SLIDE CONTENT
> This is the ACTUAL TEXT and information to display on this slide.
> Render this content visually on the slide image.

${pageContent}

---

## DESIGN REQUIREMENTS

### Visual Design
- Create a visually appealing slide that clearly communicates the content
- Use appropriate typography hierarchy (large titles, readable body text)
- Include relevant visual elements (icons, shapes, illustrations) that enhance understanding
- Ensure sufficient contrast and readability
- Apply professional, polished finishing

### Consistency Rules
- **Color Palette**: Use the EXACT SAME colors specified in the style guide for all similar elements
- **Typography**: Use consistent fonts, sizes, and weights across all slides
- **Layout**: Maintain consistent margins, spacing, and alignment patterns
- **Visual Elements**: Use the same icon style, shape language, and decorative patterns

---

## STRICT CONSTRAINTS (MUST FOLLOW)

⛔ **DO NOT** add any of the following:
- Page numbers, slide numbers, or any numbering
- Headers or footers
- Company logos (unless specified in content)
- Decorative elements not directly related to the content
- Any text not specified in SLIDE CONTENT section

✅ **ALWAYS** ensure:
- The slide looks like it belongs to a cohesive presentation set
- Colors match exactly across all slides in the series
- Typography is consistent with the style guide

---

Generate a single, professional slide image that effectively presents the content above.`
}

// Strategy pattern: map mode to prompt builder
const promptBuilders = {
  generate: buildGeneratePrompt,
  sticker: buildStickerPrompt,
  edit: buildEditPrompt,
  story: buildStoryPrompt,
  diagram: buildDiagramPrompt,
  slides: buildSlidesPrompt,
}

/**
 * Build enhanced prompt based on mode and options
 * Exported for use in PromptDebug component and useApi
 */
export const buildPrompt = (basePrompt, options, mode) => {
  const builder = promptBuilders[mode]
  if (builder) {
    return builder(basePrompt, options)
  }
  return basePrompt
}

// Export individual builders for testing or direct use
export {
  buildGeneratePrompt,
  buildStickerPrompt,
  buildEditPrompt,
  buildStoryPrompt,
  buildDiagramPrompt,
  buildSlidesPrompt,
}
