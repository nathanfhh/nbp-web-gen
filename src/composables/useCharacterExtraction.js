import { ref } from 'vue'
import { GoogleGenAI } from '@google/genai'
import { useApiKeyManager } from './useApiKeyManager'
import { t } from '@/i18n'

import { DEFAULT_TEXT_MODEL } from '@/constants/modelOptions'

export { TEXT_MODELS as EXTRACTION_MODELS } from '@/constants/modelOptions'
export { DEFAULT_TEXT_MODEL }

// Extraction prompt focusing on physical appearance, not art style
const EXTRACTION_PROMPT = `Analyze this character image and extract their physical appearance features.

IMPORTANT: Focus ONLY on the character's physical appearance and what they're wearing.
DO NOT describe art style, drawing technique, or visual aesthetics.
If any field cannot be determined from the image, use "unknown" or an empty array.`

// JSON Schema for structured output
const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    description: {
      type: 'string',
      description: 'A brief 1-2 sentence description of who this character appears to be',
    },
    physicalTraits: {
      type: 'object',
      properties: {
        hair: { type: 'string', description: 'Hair color, style, length, and any notable features' },
        eyes: { type: 'string', description: 'Eye color, shape, and any distinctive features' },
        face: { type: 'string', description: 'Face shape and notable facial features' },
        body: { type: 'string', description: 'Body type, apparent height, and build' },
        skin: { type: 'string', description: 'Skin tone' },
      },
      required: ['hair', 'eyes', 'face', 'body', 'skin'],
    },
    clothing: {
      type: 'string',
      description: 'Description of what the character is wearing',
    },
    accessories: {
      type: 'array',
      items: { type: 'string' },
      description: 'List of accessories worn by the character',
    },
    distinctiveFeatures: {
      type: 'array',
      items: { type: 'string' },
      description: 'Unique identifying traits or marks',
    },
  },
  required: ['description', 'physicalTraits', 'clothing', 'accessories', 'distinctiveFeatures'],
}

export function useCharacterExtraction() {
  const isExtracting = ref(false)
  const extractionError = ref(null)
  const { callWithFallback, hasApiKeyFor } = useApiKeyManager()

  /**
   * Extract character features from an image
   * Uses global API key management with automatic fallback (Free Tier → Paid)
   * @param {Object} options
   * @param {string} options.imageData - Base64 encoded image data
   * @param {string} options.mimeType - Image mime type
   * @param {string} options.model - Model to use for extraction
   * @returns {Promise<Object>} - Extracted character data
   */
  const extractCharacter = async ({
    imageData,
    mimeType = 'image/png',
    model = DEFAULT_TEXT_MODEL,
  }) => {
    if (!hasApiKeyFor('text')) {
      throw new Error(t('errors.apiKeyNotSet'))
    }

    if (!imageData) {
      throw new Error(t('characterExtractor.noImage'))
    }

    isExtracting.value = true
    extractionError.value = null

    try {
      // Use callWithFallback for automatic Free Tier → Paid fallback
      const response = await callWithFallback(async (apiKey) => {
        const ai = new GoogleGenAI({ apiKey })

        return await ai.models.generateContent({
          model,
          contents: [
            {
              role: 'user',
              parts: [
                { text: EXTRACTION_PROMPT },
                {
                  inlineData: {
                    mimeType,
                    data: imageData,
                  },
                },
              ],
            },
          ],
          config: {
            responseMimeType: 'application/json',
            responseSchema: EXTRACTION_SCHEMA,
            temperature: 0.2, // Low temperature for consistent extraction
            thinkingConfig: {
              thinkingLevel: 'HIGH',
            },
          },
        })
      }, 'text')

      // Extract JSON from response
      if (!response.candidates || response.candidates.length === 0) {
        throw new Error(t('errors.noImageInResponse'))
      }

      const candidate = response.candidates[0]
      if (!candidate.content || !candidate.content.parts) {
        throw new Error(t('errors.invalidResponseFormat'))
      }

      // Find the text part containing JSON
      let jsonText = ''
      for (const part of candidate.content.parts) {
        if (part.text) {
          jsonText += part.text
        }
      }

      if (!jsonText) {
        throw new Error(t('errors.invalidResponseFormat'))
      }

      // Parse the JSON response
      const extractedData = JSON.parse(jsonText)

      // Validate and normalize the extracted data
      return normalizeExtractedData(extractedData)
    } catch (err) {
      extractionError.value = err.message
      throw err
    } finally {
      isExtracting.value = false
    }
  }

  /**
   * Normalize extracted data to ensure consistent structure
   */
  const normalizeExtractedData = (data) => {
    return {
      description: data.description || '',
      physicalTraits: {
        hair: data.physicalTraits?.hair || 'unknown',
        eyes: data.physicalTraits?.eyes || 'unknown',
        face: data.physicalTraits?.face || 'unknown',
        body: data.physicalTraits?.body || 'unknown',
        skin: data.physicalTraits?.skin || 'unknown',
      },
      clothing: data.clothing || '',
      accessories: Array.isArray(data.accessories) ? data.accessories : [],
      distinctiveFeatures: Array.isArray(data.distinctiveFeatures) ? data.distinctiveFeatures : [],
    }
  }

  /**
   * Build a prompt description from character data
   * This is used when generating images with a selected character
   */
  const buildCharacterPrompt = (character) => {
    if (!character) return ''

    // Build physical traits description
    const traits = character.physicalTraits
    const traitParts = []
    if (traits) {
      if (traits.hair && traits.hair !== 'unknown') traitParts.push(traits.hair + ' hair')
      if (traits.eyes && traits.eyes !== 'unknown') traitParts.push(traits.eyes + ' eyes')
      if (traits.face && traits.face !== 'unknown') traitParts.push(traits.face + ' face')
      if (traits.body && traits.body !== 'unknown') traitParts.push(traits.body + ' build')
      if (traits.skin && traits.skin !== 'unknown') traitParts.push(traits.skin + ' skin')
    }

    const distinctiveStr =
      character.distinctiveFeatures?.length > 0
        ? `Distinctive features that MUST appear: ${character.distinctiveFeatures.join(', ')}.`
        : ''

    // Build forceful character prompt with strict instructions
    const prompt = `[CHARACTER CONSTRAINT - STRICTLY REQUIRED]
The generated image MUST depict the following specific character. This is NOT a suggestion - the character's identity and physical features are MANDATORY requirements.

Character: ${character.name || 'Unnamed'}
${character.description ? `Identity: ${character.description}` : ''}

MANDATORY Physical Features (MUST match exactly):
- ${traitParts.length > 0 ? traitParts.join('\n- ') : 'Use reference image'}
${distinctiveStr}

STRICT RULES:
1. Facial proportions, eye shape, hair style/color MUST remain consistent with the character definition
2. The character MUST be immediately recognizable as the same person/entity
3. Body proportions and skin tone MUST match the character
4. Clothing and accessories MAY vary unless specifically requested
5. DO NOT alter the character's core identity or physical features under any circumstances

[END CHARACTER CONSTRAINT]`

    return prompt
  }

  /**
   * Generate a thumbnail from image data
   * @param {string} imageData - Base64 image data
   * @param {number} maxSize - Maximum dimension for thumbnail
   * @returns {Promise<string>} - Base64 thumbnail data
   */
  const generateThumbnail = async (imageData, maxSize = 150) => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let { width, height } = img

        // Calculate new dimensions
        if (width > height) {
          if (width > maxSize) {
            height = (height * maxSize) / width
            width = maxSize
          }
        } else {
          if (height > maxSize) {
            width = (width * maxSize) / height
            height = maxSize
          }
        }

        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)

        // Return base64 without the data URL prefix
        const thumbnail = canvas.toDataURL('image/webp', 0.8)
        resolve(thumbnail.split(',')[1])
      }
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = `data:image/png;base64,${imageData}`
    })
  }

  return {
    isExtracting,
    extractionError,
    extractCharacter,
    buildCharacterPrompt,
    generateThumbnail,
  }
}
