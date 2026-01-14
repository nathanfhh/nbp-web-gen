import { ref } from 'vue'
import { GoogleGenAI, VideoGenerationReferenceType } from '@google/genai'
import { useLocalStorage } from './useLocalStorage'
import {
  VEO_MODELS,
  VIDEO_SUB_MODES,
  VIDEO_MODE_CONSTRAINTS,
  VIDEO_POLLING_INTERVAL_MS,
  VIDEO_DEFAULT_DURATION,
  calculateVideoCost,
} from '@/constants'
import i18n from '@/i18n'

// Helper to get translated error messages
const t = (key, params) => i18n.global.t(key, params)

/**
 * Build enhanced prompt from video prompt options
 * @param {string} basePrompt - User's main prompt
 * @param {Object} promptOptions - Video prompt builder options from store
 * @returns {string} Enhanced prompt with all selected options
 */
export const buildVideoPrompt = (basePrompt, promptOptions) => {
  const parts = []

  // Add base prompt (main description)
  if (basePrompt) {
    parts.push(basePrompt)
  }

  // Add styles
  const styles = [...(promptOptions.styles || [])]
  if (promptOptions.customStyle) {
    styles.push(promptOptions.customStyle)
  }
  if (styles.length > 0) {
    parts.push(`${styles.join(', ')} style`)
  }

  // Add camera settings
  if (promptOptions.cameras?.length > 0) {
    parts.push(promptOptions.cameras.join(', '))
  }

  // Add composition
  if (promptOptions.composition) {
    parts.push(promptOptions.composition)
  }

  // Add lens effects
  if (promptOptions.lenses?.length > 0) {
    parts.push(promptOptions.lenses.join(', '))
  }

  // Add ambiance
  const ambiances = [...(promptOptions.ambiances || [])]
  if (promptOptions.customAmbiance) {
    ambiances.push(promptOptions.customAmbiance)
  }
  if (ambiances.length > 0) {
    parts.push(ambiances.join(', '))
  }

  // Add actions
  const actions = [...(promptOptions.actions || [])]
  if (promptOptions.customAction) {
    actions.push(promptOptions.customAction)
  }
  if (actions.length > 0) {
    parts.push(actions.join(', '))
  }

  // Add audio prompts if present (Veo 3)
  if (promptOptions.dialogue) {
    parts.push(promptOptions.dialogue)
  }
  if (promptOptions.soundEffects) {
    parts.push(promptOptions.soundEffects)
  }
  if (promptOptions.ambientSound) {
    parts.push(promptOptions.ambientSound)
  }

  return parts.join('. ')
}

/**
 * Build negative prompt from video prompt options
 * @param {Object} promptOptions - Video prompt builder options from store
 * @returns {string} Negative prompt string
 */
export const buildVideoNegativePrompt = (promptOptions) => {
  const negatives = [...(promptOptions.negatives || [])]
  if (promptOptions.customNegative) {
    negatives.push(promptOptions.customNegative)
  }
  return negatives.join(', ')
}

/**
 * Video generation API composable using Veo 3.1
 * Uses @google/genai SDK
 */
export function useVideoApi() {
  const isLoading = ref(false)
  const error = ref(null)
  const pollingProgress = ref(0) // 0-100
  const pollingStatus = ref('idle') // idle | initiating | polling | downloading | done | error
  const { getApiKey } = useLocalStorage()

  /**
   * Get the model ID based on options and constraints
   */
  const getModelId = (options) => {
    const constraints = VIDEO_MODE_CONSTRAINTS[options.subMode] || {}

    // Check if model is locked for this sub-mode
    if (constraints.lockedModel) {
      return VEO_MODELS[constraints.lockedModel.toUpperCase()]
    }

    return options.model === 'standard' ? VEO_MODELS.STANDARD : VEO_MODELS.FAST
  }

  /**
   * Get effective options with constraints applied
   */
  const getEffectiveOptions = (options) => {
    const constraints = VIDEO_MODE_CONSTRAINTS[options.subMode] || {}
    const effective = { ...options }

    if (constraints.lockedModel) {
      effective.model = constraints.lockedModel
    }
    if (constraints.lockedResolution) {
      effective.resolution = constraints.lockedResolution
    }
    if (constraints.lockedRatio) {
      effective.ratio = constraints.lockedRatio
    }
    if (constraints.lockedDuration) {
      effective.duration = constraints.lockedDuration
    }

    return effective
  }

  /**
   * Build the video generation payload for SDK
   */
  const buildVideoPayload = (prompt, options) => {
    const effectiveOptions = getEffectiveOptions(options)
    const modelId = getModelId(effectiveOptions)

    // Build config object
    const config = {
      numberOfVideos: 1,
      resolution: effectiveOptions.resolution,
    }

    // Add aspect ratio (except for extend-video)
    if (options.subMode !== VIDEO_SUB_MODES.EXTEND_VIDEO) {
      config.aspectRatio = effectiveOptions.ratio
    }

    // Build payload
    const payload = {
      model: modelId,
      config,
    }

    // Add prompt if provided
    if (prompt) {
      payload.prompt = prompt
    }

    // Handle sub-mode specific fields
    switch (options.subMode) {
      case VIDEO_SUB_MODES.FRAMES_TO_VIDEO: {
        // Add start frame (required)
        if (options.startFrame) {
          payload.image = {
            imageBytes: options.startFrame.data,
            mimeType: options.startFrame.mimeType || 'image/jpeg',
          }
        }

        // Add end frame (optional) or use start frame for looping
        const endFrameToUse = options.isLooping ? options.startFrame : options.endFrame
        if (endFrameToUse) {
          payload.config.lastFrame = {
            imageBytes: endFrameToUse.data,
            mimeType: endFrameToUse.mimeType || 'image/jpeg',
          }
        }
        break
      }

      case VIDEO_SUB_MODES.REFERENCES_TO_VIDEO: {
        // Add reference images
        const referenceImages = []

        if (options.referenceImages && options.referenceImages.length > 0) {
          for (const img of options.referenceImages) {
            referenceImages.push({
              image: {
                imageBytes: img.data,
                mimeType: img.mimeType || 'image/jpeg',
              },
              referenceType:
                img.type === 'style'
                  ? VideoGenerationReferenceType.STYLE
                  : VideoGenerationReferenceType.ASSET,
            })
          }
        }

        if (referenceImages.length > 0) {
          payload.config.referenceImages = referenceImages
        }
        break
      }

      case VIDEO_SUB_MODES.EXTEND_VIDEO:
        // Add input video reference
        if (options.inputVideo) {
          payload.video = options.inputVideo.videoObject || { uri: options.inputVideo.uri }
        }
        break

      default:
        // TEXT_TO_VIDEO - no additional fields needed
        break
    }

    return payload
  }

  /**
   * Validate options before generation
   */
  const validateOptions = (prompt, options) => {
    const constraints = VIDEO_MODE_CONSTRAINTS[options.subMode] || {}

    // Check if prompt is required
    if (constraints.requiresPrompt && !prompt) {
      throw new Error(t('video.errors.promptRequired'))
    }

    // Check if start frame is required (frames-to-video)
    if (constraints.requiresStartFrame && !options.startFrame) {
      throw new Error(t('video.errors.noStartFrame'))
    }

    // Check if input video is required (extend-video)
    if (constraints.requiresInputVideo && !options.inputVideo) {
      throw new Error(t('video.errors.noInputVideo'))
    }

    // Check reference images count
    if (
      options.subMode === VIDEO_SUB_MODES.REFERENCES_TO_VIDEO &&
      (!options.referenceImages || options.referenceImages.length === 0)
    ) {
      throw new Error(t('video.errors.noReferenceImages'))
    }

    return true
  }

  /**
   * Main video generation function using SDK
   */
  const generateVideo = async (prompt, options = {}, onProgress = null) => {
    const apiKey = getApiKey()
    if (!apiKey) {
      throw new Error(t('errors.apiKeyNotSet'))
    }

    // Validate options
    validateOptions(prompt, options)

    isLoading.value = true
    error.value = null
    pollingProgress.value = 0
    pollingStatus.value = 'initiating'

    try {
      // Initialize SDK
      const ai = new GoogleGenAI({ apiKey })

      // Build payload
      const payload = buildVideoPayload(prompt, options)

      if (onProgress) {
        onProgress({ status: 'initiating', message: t('video.progress.starting') })
      }

      // Step 1: Start video generation
      let operation = await ai.models.generateVideos(payload)

      // Step 2: Poll for completion
      pollingStatus.value = 'polling'
      let attempts = 0
      const maxAttempts = 60 // 10 minutes max (10s intervals)

      while (!operation.done) {
        attempts++
        pollingProgress.value = Math.min((attempts / maxAttempts) * 100, 95)

        if (onProgress) {
          onProgress({
            status: 'polling',
            message: t('video.progress.polling'),
            attempts,
            maxAttempts,
            estimatedTimeRemaining: (maxAttempts - attempts) * VIDEO_POLLING_INTERVAL_MS,
          })
        }

        await new Promise((resolve) => setTimeout(resolve, VIDEO_POLLING_INTERVAL_MS))
        operation = await ai.operations.getVideosOperation({ operation })
      }

      // Step 3: Extract video from response
      const generatedVideos = operation.response?.generatedVideos
      if (!generatedVideos || generatedVideos.length === 0) {
        throw new Error(t('video.errors.noVideoGenerated'))
      }

      const firstVideo = generatedVideos[0]
      if (!firstVideo?.video?.uri) {
        throw new Error(t('video.errors.noVideoGenerated'))
      }

      const videoObject = firstVideo.video

      // Step 4: Download video blob
      pollingStatus.value = 'downloading'
      pollingProgress.value = 98

      if (onProgress) {
        onProgress({ status: 'downloading', message: t('video.progress.downloading') })
      }

      const videoUrl = decodeURIComponent(videoObject.uri)
      const separator = videoUrl.includes('?') ? '&' : '?'
      const response = await fetch(`${videoUrl}${separator}key=${apiKey}`)

      if (!response.ok) {
        throw new Error(t('video.errors.downloadFailed'))
      }

      const videoBlob = await response.blob()

      pollingProgress.value = 100
      pollingStatus.value = 'done'

      if (onProgress) {
        onProgress({ status: 'done', message: t('video.progress.complete') })
      }

      const effectiveOptions = getEffectiveOptions(options)
      const duration = effectiveOptions.duration || VIDEO_DEFAULT_DURATION

      return {
        success: true,
        video: {
          blob: videoBlob,
          uri: videoObject.uri,
          mimeType: 'video/mp4',
          videoObject, // Keep SDK video object for extend-video
        },
        prompt,
        options: effectiveOptions,
        mode: 'video',
        metadata: {
          model: effectiveOptions.model,
          resolution: effectiveOptions.resolution,
          ratio: effectiveOptions.ratio,
          subMode: options.subMode,
          duration,
        },
      }
    } catch (err) {
      error.value = err.message
      pollingStatus.value = 'error'

      // Handle specific error cases
      if (err.message?.includes('API_KEY_INVALID') || err.message?.includes('API key not valid')) {
        throw new Error(t('errors.apiKeyInvalid'))
      }
      if (err.message?.includes('permission denied')) {
        throw new Error(t('video.errors.permissionDenied'))
      }

      throw err
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Calculate estimated cost for video generation
   * Note: Veo 3.1 always generates audio natively, no option to disable
   */
  const calculateCostEstimate = (options) => {
    const effectiveOptions = getEffectiveOptions(options)
    const duration = effectiveOptions.duration || VIDEO_DEFAULT_DURATION
    const totalCost = calculateVideoCost(effectiveOptions.model, duration)

    // Get price per second based on model (always includes audio)
    const pricePerSecond = effectiveOptions.model === 'standard' ? 0.4 : 0.15

    return {
      model: effectiveOptions.model,
      pricePerSecond,
      duration,
      totalCost,
      formatted: `$${totalCost.toFixed(2)}`,
    }
  }

  /**
   * Reset state
   */
  const reset = () => {
    isLoading.value = false
    error.value = null
    pollingProgress.value = 0
    pollingStatus.value = 'idle'
  }

  return {
    // State
    isLoading,
    error,
    pollingProgress,
    pollingStatus,

    // Methods
    generateVideo,
    calculateCostEstimate,
    getEffectiveOptions,
    reset,
  }
}
