import { ref } from 'vue'
import { GoogleGenAI, Modality } from '@google/genai'
import { useLocalStorage } from './useLocalStorage'
import { useApiKeyManager } from './useApiKeyManager'
import { DEFAULT_MODEL, RATIO_API_MAP, RESOLUTION_API_MAP } from '@/constants'
import i18n from '@/i18n'

// Helper to get translated error messages
const t = (key, params) => i18n.global.t(key, params)

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
// Prompt Builder Strategies
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
 * Exported for use in PromptDebug component
 */
export const buildPrompt = (basePrompt, options, mode) => {
  const builder = promptBuilders[mode]
  if (builder) {
    return builder(basePrompt, options)
  }
  return basePrompt
}

// ============================================================================
// API Composable
// ============================================================================

export function useApi() {
  const isLoading = ref(false)
  const error = ref(null)
  const { getApiKey } = useLocalStorage()
  const { callWithFallback } = useApiKeyManager()

  /**
   * Build content parts for SDK request
   */
  const buildContentParts = (prompt, referenceImages = []) => {
    const parts = []

    // Add text prompt
    parts.push({ text: prompt })

    // Add reference images (supports multiple images for all modes)
    if (referenceImages && referenceImages.length > 0) {
      for (const image of referenceImages) {
        parts.push({
          inlineData: {
            mimeType: image.mimeType || 'image/jpeg',
            data: image.data,
          },
        })
      }
    }

    return parts
  }

  /**
   * Build SDK generation config
   */
  const buildSdkConfig = (options = {}) => {
    const config = {
      responseModalities: [Modality.IMAGE, Modality.TEXT],
    }

    // Add temperature if specified
    if (options.temperature !== undefined && options.temperature !== null) {
      config.temperature = parseFloat(options.temperature)
    }

    // Add seed if specified
    if (options.seed !== undefined && options.seed !== null && options.seed !== '') {
      config.seed = parseInt(options.seed, 10)
    }

    // Build image config
    const imageConfig = {}

    // Add aspect ratio
    if (options.ratio && RATIO_API_MAP[options.ratio]) {
      imageConfig.aspectRatio = RATIO_API_MAP[options.ratio]
    }

    // Add resolution/image size (camelCase for SDK)
    if (options.resolution && RESOLUTION_API_MAP[options.resolution]) {
      imageConfig.imageSize = RESOLUTION_API_MAP[options.resolution]
    }

    if (Object.keys(imageConfig).length > 0) {
      config.imageConfig = imageConfig
    }

    // Enable thinking mode
    config.thinkingConfig = {
      includeThoughts: true,
    }

    // Enable Google Search for real-time data (weather, stocks, etc.)
    config.tools = [{ googleSearch: {} }]

    return config
  }

  /**
   * Stream API call using @google/genai SDK
   */
  const generateImageStream = async (
    prompt,
    options = {},
    mode = 'generate',
    referenceImages = [],
    onThinkingChunk = null,
  ) => {
    const apiKey = getApiKey()
    if (!apiKey) {
      throw new Error(t('errors.apiKeyNotSet'))
    }

    isLoading.value = true
    error.value = null

    try {
      // Build the enhanced prompt
      const enhancedPrompt = buildPrompt(prompt, options, mode)

      // Initialize SDK client
      const ai = new GoogleGenAI({ apiKey })

      // Build content parts and config
      const parts = buildContentParts(enhancedPrompt, referenceImages)
      const config = buildSdkConfig(options)

      // Get model
      const model = options.model || DEFAULT_MODEL

      // Make streaming API request using SDK
      const response = await ai.models.generateContentStream({
        model,
        contents: [{ role: 'user', parts }],
        config,
      })

      // Process stream
      const images = []
      let textResponse = ''
      let thinkingText = ''
      let metadata = {}

      for await (const chunk of response) {
        // Process candidates
        if (chunk.candidates && chunk.candidates.length > 0) {
          const candidate = chunk.candidates[0]

          if (candidate.content && candidate.content.parts) {
            for (const part of candidate.content.parts) {
              if (part.inlineData) {
                const imageData = {
                  data: part.inlineData.data,
                  mimeType: part.inlineData.mimeType || 'image/png',
                  isThought: !!part.thought,
                }
                images.push(imageData)

                // If this is a thought image, send it to the thinking callback
                if (part.thought && onThinkingChunk) {
                  onThinkingChunk({
                    type: 'image',
                    data: part.inlineData.data,
                    mimeType: part.inlineData.mimeType || 'image/png',
                  })
                }
              } else if (part.text) {
                // Check if this is thinking content (thought: true flag)
                if (part.thought) {
                  // This is thinking/reasoning text
                  if (onThinkingChunk) {
                    onThinkingChunk(part.text)
                  }
                  thinkingText += part.text
                } else {
                  // Regular text response
                  textResponse += part.text
                }
              }
            }
          }

          // Capture metadata
          if (candidate.finishReason) {
            metadata.finishReason = candidate.finishReason
          }
          if (candidate.safetyRatings) {
            metadata.safetyRatings = candidate.safetyRatings
          }
        }

        // Model version
        if (chunk.modelVersion) {
          metadata.modelVersion = chunk.modelVersion
        }
      }

      // Filter: prefer non-thought images, but use thought images as fallback
      let finalImages = images.filter((img) => !img.isThought)

      if (finalImages.length === 0) {
        // Fallback: use all images if no non-thought images
        finalImages = images
      }

      // Remove isThought flag before returning
      finalImages = finalImages.map(({ data, mimeType }) => ({ data, mimeType }))

      if (finalImages.length === 0) {
        throw new Error(t('errors.noImageData'))
      }

      return {
        success: true,
        images: finalImages,
        textResponse,
        thinkingText,
        prompt: enhancedPrompt,
        originalPrompt: prompt,
        options,
        mode,
        metadata,
      }
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const generateStory = async (prompt, options = {}, referenceImages = [], onThinkingChunk = null) => {
    const steps = options.steps || 4
    const results = []

    for (let i = 1; i <= steps; i++) {
      let stepPrompt = prompt
      if (steps > 1) {
        stepPrompt = `${prompt}. This is step ${i} of ${steps} in the sequence.`
        if (i > 1) {
          stepPrompt += ' Continue from the previous step with smooth transition.'
        }
      }

      if (onThinkingChunk) {
        onThinkingChunk(`\n--- ${t('storyProgress.generating', { current: i, total: steps })} ---\n`)
      }

      try {
        // Only pass reference images for the first step
        const stepImages = i === 1 ? referenceImages : []
        const result = await generateImageStream(
          stepPrompt,
          { ...options, step: i },
          'story',
          stepImages,
          onThinkingChunk,
        )
        results.push({
          step: i,
          success: true,
          ...result,
        })
      } catch (stepErr) {
        // Step failed - record error but continue to next step
        console.warn(`Story step ${i} failed:`, stepErr.message)
        results.push({
          step: i,
          success: false,
          error: stepErr.message,
        })
      }
    }

    // Calculate success/failure counts
    const successCount = results.filter((r) => r.success).length
    const failedCount = results.length - successCount

    return {
      success: successCount === steps,
      results,
      totalSteps: steps,
      successCount,
      failedCount,
    }
  }

  const editImage = async (prompt, referenceImages = [], options = {}, onThinkingChunk = null) => {
    return generateImageStream(prompt, options, 'edit', referenceImages, onThinkingChunk)
  }

  const generateDiagram = async (
    prompt,
    options = {},
    referenceImages = [],
    onThinkingChunk = null,
  ) => {
    return generateImageStream(prompt, options, 'diagram', referenceImages, onThinkingChunk)
  }

  /**
   * JSON Schema for slide style analysis response
   */
  const SLIDE_STYLE_SCHEMA = {
    type: 'object',
    properties: {
      globalStyle: {
        type: 'string',
        description:
          'Overall design style recommendation for the entire presentation (2-3 sentences)',
      },
      pageStyles: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            pageId: {
              type: 'string',
              description: 'The unique identifier of the page',
            },
            styleGuide: {
              type: 'string',
              description:
                'Page-specific style recommendation (1-2 sentences), or empty string if global style is sufficient',
            },
          },
          required: ['pageId', 'styleGuide'],
        },
      },
    },
    required: ['globalStyle', 'pageStyles'],
  }

  /**
   * Analyze slide content and suggest design styles (global + per-page)
   * Uses JSON mode for structured output with thinking mode for transparency
   * @param {Array<{id: string, pageNumber: number, content: string}>} pages - Pages with ID and content
   * @param {Object} options - Analysis options
   * @param {string} options.model - Model to use (default: gemini-3-flash-preview)
   * @param {string} options.styleGuidance - User's style preferences and constraints
   * @param {Function} onThinkingChunk - Callback for streaming thinking chunks
   * @returns {Promise<{globalStyle: string, pageStyles: Array<{pageId: string, styleGuide: string}>}>}
   */
  const analyzeSlideStyle = async (pages, options = {}, onThinkingChunk = null) => {
    const model = options.model || 'gemini-3-flash-preview'
    const styleGuidance = options.styleGuidance?.trim() || ''

    // Build content with page IDs
    const pagesContent = pages
      .map((p) => `[Page ID: ${p.id}]\nPage ${p.pageNumber}:\n${p.content}`)
      .join('\n\n---\n\n')

    // Build optional style guidance section
    const styleGuidanceSection = styleGuidance
      ? `
---

## USER STYLE GUIDANCE

The user has provided the following preferences and constraints for the design:

${styleGuidance}

**Important:** You MUST incorporate these preferences into your design recommendations. If the user specifies things they want or don't want, respect those requirements strictly.

`
      : ''

    const analysisPrompt = `# Presentation Design Analysis Task

You are a senior presentation design consultant. Analyze the slide content below and create a comprehensive design system.

---

## INPUT: Slide Content

${pagesContent}
${styleGuidanceSection}
---

## OUTPUT REQUIREMENTS

### 1. Global Style Guide (\`globalStyle\`)

Create a detailed design system (4-6 sentences) that ensures visual consistency across ALL slides. Include:

**Color System:**
- Primary background color (e.g., "clean white #FFFFFF" or "soft cream #F5F5F0")
- Primary accent color with hex code (e.g., "deep navy blue #1a365d")
- Secondary accent color with hex code (e.g., "warm coral #ff6b6b")
- Text colors (heading color, body text color)

**Typography System:**
- Heading font family and weight (e.g., "Inter Bold" or "Montserrat SemiBold")
- Body text font family (e.g., "Open Sans Regular")
- Size hierarchy description (e.g., "large bold titles, medium subheadings, readable body")

**Visual Language:**
- Layout approach (e.g., "left-aligned with generous whitespace", "centered symmetric")
- Shape language (e.g., "rounded corners", "sharp geometric", "organic curves")
- Decorative elements (e.g., "subtle gradients", "line accents", "geometric patterns")
- Icon style if applicable (e.g., "outline icons", "filled minimal icons")

### 2. Page-Specific Styles (\`pageStyles\`)

For EACH page, determine if it needs additional styling:

- **Title slides**: May need larger, bolder treatment
- **Content slides with lists**: Standard styling usually sufficient
- **Chart/Data slides**: Specify data visualization colors and style
- **Quote slides**: May need special typography treatment
- **Image-heavy slides**: Layout considerations for image placement

Return an EMPTY string ("") for \`styleGuide\` if global style is sufficient.

---

## STRICT CONSTRAINTS

⛔ Your style recommendations must NEVER include:
- Page numbers or slide numbers
- Headers or footers
- Date/time stamps
- Company logos (unless content specifically mentions one)

✅ Your style recommendations MUST ensure:
- **Exact color consistency** - same hex codes reused across all slides
- **Typography consistency** - same fonts for same content types
- **Visual coherence** - slides look like they belong together

---

## OUTPUT FORMAT

Return valid JSON matching this structure:
\`\`\`json
{
  "globalStyle": "Detailed 4-6 sentence design system description...",
  "pageStyles": [
    { "pageId": "ab12", "styleGuide": "" },
    { "pageId": "xy9k", "styleGuide": "Special styling for this page..." }
  ]
}
\`\`\`

⚠️ **CRITICAL - Page ID Verification:**
- Each page has a unique ID shown as \`[Page ID: xxxx]\` in the input (typically 4 characters)
- You MUST copy the **EXACT** page ID character-by-character into your response
- **Before finalizing**, verify each \`pageId\` in your output matches the corresponding \`[Page ID: xxxx]\` from input
- A single wrong character will cause the style to be lost for that page

Write all descriptions in English.`

    try {
      // Use callWithFallback: Free Tier first, then paid key on quota error
      return await callWithFallback(async (apiKey) => {
        const ai = new GoogleGenAI({ apiKey })

        // Use streaming to capture thinking process
        const response = await ai.models.generateContentStream({
          model,
          contents: [{ role: 'user', parts: [{ text: analysisPrompt }] }],
          config: {
            temperature: 0.3, // Low temperature for consistency
            responseMimeType: 'application/json',
            responseSchema: SLIDE_STYLE_SCHEMA,
            thinkingConfig: {
              includeThoughts: true,
            },
          },
        })

        // Process stream
        let textResponse = ''

        for await (const chunk of response) {
          if (chunk.candidates?.[0]?.content?.parts) {
            for (const part of chunk.candidates[0].content.parts) {
              if (part.text) {
                if (part.thought) {
                  // Thinking content - stream to callback
                  if (onThinkingChunk) {
                    onThinkingChunk(part.text)
                  }
                } else {
                  // Final response text (JSON)
                  textResponse += part.text
                }
              }
            }
          }
        }

        // Parse JSON response
        try {
          const parsed = JSON.parse(textResponse.trim())
          // Validate structure
          if (!parsed.globalStyle || !Array.isArray(parsed.pageStyles)) {
            throw new Error('Invalid response structure')
          }
          return parsed
        } catch (parseErr) {
          // Fallback: if JSON parsing fails, use raw text as global style
          console.warn('JSON parse failed, using fallback:', parseErr)
          return {
            globalStyle: textResponse.trim() || 'Professional presentation design',
            pageStyles: pages.map((p) => ({ pageId: p.id, styleGuide: '' })),
          }
        }
      }, 'text')
    } catch (err) {
      throw new Error(t('slides.analyzeFailed') + ': ' + err.message)
    }
  }

  /**
   * JSON Schema for content splitting response
   */
  const CONTENT_SPLIT_SCHEMA = {
    type: 'object',
    properties: {
      globalDescription: {
        type: 'string',
        description: 'Overall presentation description (2-3 sentences summarizing the topic)',
      },
      pages: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            pageNumber: {
              type: 'integer',
              description: 'Sequential page number starting from 1',
            },
            content: {
              type: 'string',
              description: 'Content for this specific slide page',
            },
          },
          required: ['pageNumber', 'content'],
        },
      },
    },
    required: ['globalDescription', 'pages'],
  }

  /**
   * Split raw content into presentation pages using AI
   * Uses JSON mode for structured output with thinking mode for transparency
   * @param {string} rawContent - Raw material to split
   * @param {Object} options
   * @param {string} options.model - Model to use (gemini-3-flash-preview | gemini-3-pro-preview)
   * @param {number} options.targetPages - Target number of pages (1-30)
   * @param {string} options.additionalNotes - Additional instructions
   * @param {Function} onThinkingChunk - Callback for thinking chunks
   * @returns {Promise<{globalDescription: string, pages: Array<{pageNumber: number, content: string}>}>}
   */
  const splitSlidesContent = async (rawContent, options = {}, onThinkingChunk = null) => {
    const model = options.model || 'gemini-3-flash-preview'
    const targetPages = options.targetPages || 10
    const additionalNotes = options.additionalNotes?.trim() || ''

    const additionalSection = additionalNotes
      ? `
## ADDITIONAL INSTRUCTIONS
${additionalNotes}
`
      : ''

    const splitPrompt = `# Presentation Content Splitting Task

You are a professional presentation designer and content strategist. Your task is to analyze the raw material below and split it into a well-structured presentation.

---

## INPUT: Raw Material

${rawContent}
${additionalSection}
---

## OUTPUT REQUIREMENTS

Create a presentation with **exactly ${targetPages} pages**.

### Global Description
Write a 2-3 sentence overview that captures:
- The main topic/theme of the presentation
- The target audience or purpose
- The overall tone (professional, educational, casual, etc.)

### Page Content Guidelines
For each page, create content that:
1. **Is self-contained** - Each page should make sense on its own
2. **Follows logical flow** - Pages should progress naturally from introduction to conclusion
3. **Has clear focus** - Each page addresses ONE main point or concept
4. **Is presentation-ready** - Content should be suitable for visual slides (not paragraphs of text)

### Content Structure Suggestions
- **Page 1**: Title/Introduction
- **Pages 2-${targetPages - 1}**: Main content, key points, examples, data
- **Page ${targetPages}**: Summary/Conclusion/Call-to-action

### Formatting Guidelines
- Use bullet points for lists
- Keep text concise (aim for 3-5 bullet points per page)
- Include suggestions for visuals where appropriate (e.g., "[Chart: Sales growth]")
- Avoid long paragraphs

---

Write all content in the same language as the input material.`

    try {
      // Use callWithFallback: Free Tier first, then paid key on quota error
      return await callWithFallback(async (apiKey) => {
        const ai = new GoogleGenAI({ apiKey })

        const response = await ai.models.generateContentStream({
          model,
          contents: [{ role: 'user', parts: [{ text: splitPrompt }] }],
          config: {
            temperature: 0.5,
            responseMimeType: 'application/json',
            responseSchema: CONTENT_SPLIT_SCHEMA,
            thinkingConfig: {
              includeThoughts: true,
            },
          },
        })

        // Process stream
        let textResponse = ''

        for await (const chunk of response) {
          if (chunk.candidates?.[0]?.content?.parts) {
            for (const part of chunk.candidates[0].content.parts) {
              if (part.text) {
                if (part.thought) {
                  // Thinking content - stream to callback
                  if (onThinkingChunk) {
                    onThinkingChunk(part.text)
                  }
                } else {
                  // Final response text (JSON)
                  textResponse += part.text
                }
              }
            }
          }
        }

        // Parse JSON response
        try {
          const parsed = JSON.parse(textResponse.trim())
          // Validate structure
          if (!parsed.globalDescription || !Array.isArray(parsed.pages)) {
            throw new Error('Invalid response structure')
          }
          return parsed
        } catch (parseErr) {
          console.warn('JSON parse failed in splitSlidesContent:', parseErr)
          throw new Error(t('slides.contentSplitter.error'))
        }
      }, 'text')
    } catch (err) {
      // Avoid duplicating i18n messages if err.message is already localized
      throw new Error(err.message || t('slides.contentSplitter.error'))
    }
  }

  return {
    isLoading,
    error,
    generateImageStream,
    generateStory,
    editImage,
    generateDiagram,
    analyzeSlideStyle,
    splitSlidesContent,
  }
}
