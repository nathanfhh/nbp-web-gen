import { ref } from 'vue'
import { GoogleGenAI, Modality } from '@google/genai'
import { useLocalStorage } from './useLocalStorage'
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

// Strategy pattern: map mode to prompt builder
const promptBuilders = {
  generate: buildGeneratePrompt,
  sticker: buildStickerPrompt,
  edit: buildEditPrompt,
  story: buildStoryPrompt,
  diagram: buildDiagramPrompt,
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
        ...result,
      })
    }

    return {
      success: true,
      results,
      totalSteps: steps,
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

  return {
    isLoading,
    error,
    generateImageStream,
    generateStory,
    editImage,
    generateDiagram,
  }
}
