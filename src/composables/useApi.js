import { ref } from 'vue'
import { useLocalStorage } from './useLocalStorage'

const API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'
const DEFAULT_MODEL = 'gemini-3-pro-image-preview'

// Aspect ratio mapping
const ASPECT_RATIOS = {
  '1:1': '1:1',
  '3:4': '3:4',
  '4:3': '4:3',
  '9:16': '9:16',
  '16:9': '16:9',
  '21:9': '21:9', // May not be supported, but we'll try
}

// Resolution mapping (must be uppercase for Gemini API)
const RESOLUTIONS = {
  '1k': '1K',
  '2k': '2K',
  '4k': '4K',
}

// Predefined styles
export const PREDEFINED_STYLES = [
  { value: 'photorealistic', label: '寫實攝影' },
  { value: 'watercolor', label: '水彩畫' },
  { value: 'oil-painting', label: '油畫' },
  { value: 'sketch', label: '素描' },
  { value: 'pixel-art', label: '像素風' },
  { value: 'anime', label: '動漫' },
  { value: 'pixar', label: 'Pixar 3D' },
  { value: 'vintage', label: '復古' },
  { value: 'modern', label: '現代' },
  { value: 'abstract', label: '抽象' },
  { value: 'minimalist', label: '極簡' },
]

// Predefined variations
export const PREDEFINED_VARIATIONS = [
  { value: 'lighting', label: '光線變化' },
  { value: 'angle', label: '角度變化' },
  { value: 'color-palette', label: '配色變化' },
  { value: 'composition', label: '構圖變化' },
  { value: 'mood', label: '氛圍變化' },
  { value: 'season', label: '季節變化' },
  { value: 'time-of-day', label: '時間變化' },
]

/**
 * Build enhanced prompt based on mode and options
 * Exported for use in PromptDebug component
 */
export const buildPrompt = (basePrompt, options, mode) => {
  let prompt = basePrompt

  if (mode === 'generate') {
    // Add styles
    if (options.styles?.length > 0) {
      prompt += `, ${options.styles.join(', ')} style`
    }
    // Add variations
    if (options.variations?.length > 0) {
      prompt += `, with ${options.variations.join(' and ')} variations`
    }
    // Prefix with explicit image generation instruction
    prompt = `Generate an image: ${prompt}`
  } else if (mode === 'edit') {
    // For edit mode, also add explicit instruction
    prompt = `Edit this image: ${prompt}`
  } else if (mode === 'story') {
    // Build story prompt
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
    if (parts.length > 0) {
      prompt += `. Create as a ${parts.join(', ')}`
    }
    // Prefix with explicit image generation instruction
    prompt = `Generate an image sequence: ${prompt}`
  } else if (mode === 'diagram') {
    // Build diagram prompt
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
    // Prefix with explicit image generation instruction
    prompt = `Generate a ${parts.join(', ')} image: ${prompt}`
  }

  return prompt
}

export function useApi() {
  const isLoading = ref(false)
  const error = ref(null)
  const { getApiKey } = useLocalStorage()

  const buildRequestBody = (prompt, options = {}, _mode = 'generate', referenceImages = []) => {
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

    // Build generation config - ORDER MATTERS for Gemini API!
    // Must be: responseModalities → temperature → imageConfig → thinking_config
    const generationConfig = {
      responseModalities: ['IMAGE', 'TEXT'],
    }

    // Add temperature if specified (must come before imageConfig)
    if (options.temperature !== undefined && options.temperature !== null) {
      generationConfig.temperature = parseFloat(options.temperature)
    }

    // Add seed if specified
    if (options.seed !== undefined && options.seed !== null && options.seed !== '') {
      generationConfig.seed = parseInt(options.seed, 10)
    }

    // Build image config (must come before thinking_config)
    const imageConfig = {}

    // Add aspect ratio
    if (options.ratio && ASPECT_RATIOS[options.ratio]) {
      imageConfig.aspectRatio = ASPECT_RATIOS[options.ratio]
    }

    // Add resolution/image size (snake_case for Gemini API)
    if (options.resolution && RESOLUTIONS[options.resolution]) {
      imageConfig.image_size = RESOLUTIONS[options.resolution]
    }

    if (Object.keys(imageConfig).length > 0) {
      generationConfig.imageConfig = imageConfig
    }

    // thinking_config must come LAST
    generationConfig.thinking_config = {
      include_thoughts: true,
    }

    return {
      contents: [
        {
          role: 'user',
          parts,
        },
      ],
      generationConfig,
      // Enable Google Search for real-time data (weather, stocks, etc.)
      tools: [
        {
          googleSearch: {},
        },
      ],
    }
  }

  // Stream API call with SSE
  const generateImageStream = async (
    prompt,
    options = {},
    mode = 'generate',
    referenceImages = [],
    onThinkingChunk = null
  ) => {
    const apiKey = getApiKey()
    if (!apiKey) {
      throw new Error('API Key 未設定')
    }

    isLoading.value = true
    error.value = null

    try {
      // Build the enhanced prompt
      const enhancedPrompt = buildPrompt(prompt, options, mode)

      // Build request body
      const requestBody = buildRequestBody(enhancedPrompt, options, mode, referenceImages)

      // Make streaming API request
      const model = options.model || DEFAULT_MODEL
      const url = `${API_BASE_URL}/${model}:streamGenerateContent?key=${apiKey}&alt=sse`

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = `API 請求失敗: ${response.status}`
        try {
          const errorData = JSON.parse(errorText)
          errorMessage = errorData.error?.message || errorMessage
        } catch {
          // ignore parse error
        }
        throw new Error(errorMessage)
      }

      // Process SSE stream
      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      const images = []
      let textResponse = ''
      let thinkingText = ''
      let metadata = {}

      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()

        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Process complete SSE events
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim()
            if (jsonStr && jsonStr !== '[DONE]') {
              try {
                const data = JSON.parse(jsonStr)

                // Process candidates
                if (data.candidates && data.candidates.length > 0) {
                  const candidate = data.candidates[0]

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

                // Model thinking/reasoning (some models expose this)
                if (data.modelVersion) {
                  metadata.modelVersion = data.modelVersion
                }
              } catch (parseError) {
                console.warn('Failed to parse SSE data:', parseError)
              }
            }
          }
        }
      }

      // Filter: prefer non-thought images, but use thought images as fallback
      let finalImages = images.filter(img => !img.isThought)

      if (finalImages.length === 0) {
        // Fallback: use all images if no non-thought images
        finalImages = images
      }

      // Remove isThought flag before returning
      finalImages = finalImages.map(({ data, mimeType }) => ({ data, mimeType }))

      if (finalImages.length === 0) {
        throw new Error('API 回應中沒有圖片數據')
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

  // Non-streaming fallback
  const generateImage = async (prompt, options = {}, mode = 'generate', referenceImages = []) => {
    const apiKey = getApiKey()
    if (!apiKey) {
      throw new Error('API Key 未設定')
    }

    isLoading.value = true
    error.value = null

    try {
      // Build the enhanced prompt
      const enhancedPrompt = buildPrompt(prompt, options, mode)

      // Build request body
      const requestBody = buildRequestBody(enhancedPrompt, options, mode, referenceImages)

      // Make API request
      const model = options.model || DEFAULT_MODEL
      const url = `${API_BASE_URL}/${model}:generateContent?key=${apiKey}`

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message || `API 請求失敗: ${response.status}`)
      }

      const data = await response.json()

      // Extract image from response
      const result = extractImageFromResponse(data)

      return {
        success: true,
        ...result,
        prompt: enhancedPrompt,
        originalPrompt: prompt,
        options,
        mode,
      }
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const extractImageFromResponse = (response) => {
    if (!response.candidates || response.candidates.length === 0) {
      throw new Error('API 回應中沒有圖片')
    }

    const candidate = response.candidates[0]
    if (!candidate.content || !candidate.content.parts) {
      throw new Error('無效的 API 回應格式')
    }

    const images = []
    let textResponse = ''

    for (const part of candidate.content.parts) {
      if (part.inlineData) {
        images.push({
          data: part.inlineData.data,
          mimeType: part.inlineData.mimeType || 'image/png',
        })
      } else if (part.text) {
        textResponse += part.text
      }
    }

    if (images.length === 0) {
      throw new Error('API 回應中沒有圖片數據')
    }

    return {
      images,
      textResponse,
      metadata: {
        finishReason: candidate.finishReason,
        safetyRatings: candidate.safetyRatings,
      },
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
        onThinkingChunk(`\n--- 生成第 ${i}/${steps} 張圖片 ---\n`)
      }

      // Only pass reference images for the first step
      const stepImages = i === 1 ? referenceImages : []
      const result = await generateImageStream(stepPrompt, { ...options, step: i }, 'story', stepImages, onThinkingChunk)
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

  const generateDiagram = async (prompt, options = {}, referenceImages = [], onThinkingChunk = null) => {
    return generateImageStream(prompt, options, 'diagram', referenceImages, onThinkingChunk)
  }

  return {
    isLoading,
    error,
    generateImage,
    generateImageStream,
    generateStory,
    editImage,
    generateDiagram,
    PREDEFINED_STYLES,
    PREDEFINED_VARIATIONS,
  }
}
