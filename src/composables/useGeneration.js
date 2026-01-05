import { useI18n } from 'vue-i18n'
import { useGeneratorStore } from '@/stores/generator'
import { useApi } from './useApi'
import { useToast } from './useToast'
import { useImageStorage } from './useImageStorage'
import { useIndexedDB } from './useIndexedDB'

/**
 * Composable for handling image generation logic
 * Extracts the generation flow from App.vue for better maintainability
 */
export function useGeneration() {
  const store = useGeneratorStore()
  const toast = useToast()
  const { t } = useI18n()
  const imageStorage = useImageStorage()
  const { updateHistoryImages } = useIndexedDB()
  const { generateImageStream, generateStory, editImage, generateDiagram } = useApi()

  /**
   * Callback for streaming thinking chunks
   */
  const onThinkingChunk = (chunk) => {
    store.addThinkingChunk(chunk)
  }

  /**
   * Validate generation prerequisites
   * @returns {string|null} Error message or null if valid
   */
  const validateGeneration = () => {
    if (!store.prompt.trim()) {
      return t('errors.noPrompt')
    }
    if (!store.hasApiKey) {
      return t('errors.noApiKey')
    }
    return null
  }

  /**
   * Execute generation based on current mode
   * @returns {Promise<Object>} Generation result
   */
  const executeGeneration = async (options, refImages) => {
    switch (store.currentMode) {
      case 'generate':
        return generateImageStream(store.prompt, options, 'generate', refImages, onThinkingChunk)

      case 'sticker':
        return generateImageStream(store.prompt, options, 'sticker', refImages, onThinkingChunk)

      case 'edit':
        if (refImages.length === 0) {
          throw new Error(t('errors.noEditImage'))
        }
        return editImage(store.prompt, refImages, options, onThinkingChunk)

      case 'story': {
        const result = await generateStory(store.prompt, options, refImages, onThinkingChunk)
        // Flatten story results
        if (result.results) {
          const allImages = []
          let thinkingText = ''
          result.results.forEach((r) => {
            if (r.images) {
              allImages.push(...r.images)
            }
            if (r.thinkingText) {
              thinkingText += r.thinkingText
            }
          })
          result.images = allImages
          result.thinkingText = thinkingText
        }
        return result
      }

      case 'diagram':
        return generateDiagram(store.prompt, options, refImages, onThinkingChunk)

      default:
        throw new Error(`Unknown mode: ${store.currentMode}`)
    }
  }

  /**
   * Save images to storage (background operation)
   */
  const saveImagesToStorage = async (historyId, images) => {
    try {
      const metadata = await imageStorage.saveGeneratedImages(historyId, images)
      // Update IndexedDB with image metadata
      await updateHistoryImages(historyId, metadata)
      // Update store metadata for current view
      store.setGeneratedImagesMetadata(metadata)
      // Update storage usage
      await store.updateStorageUsage()
      // Reload history to get updated record with images
      await store.loadHistory()
    } catch (err) {
      console.error('Failed to save images to OPFS:', err)
      toast.warning(t('toast.imageSaveFailed'))
    }
  }

  /**
   * Main generation handler
   * @param {Object} callbacks - Optional callbacks for UI updates
   * @param {Function} callbacks.onStart - Called before generation starts
   * @param {Function} callbacks.onComplete - Called after generation completes
   */
  const handleGenerate = async (callbacks = {}) => {
    // Validate
    const validationError = validateGeneration()
    if (validationError) {
      store.setGenerationError(validationError)
      return { success: false, error: validationError }
    }

    // Call onStart callback (for UI updates like scrolling)
    if (callbacks.onStart) {
      callbacks.onStart()
    }

    // Setup generation state
    store.setGenerating(true)
    store.setStreaming(true)
    store.clearGenerationError()
    store.clearGeneratedImages()
    store.clearThinkingProcess()

    const options = store.getCurrentOptions
    const refImages = store.referenceImages
    let thinkingText = ''

    try {
      // Execute generation
      const result = await executeGeneration(options, refImages)

      // Process result
      if (result?.images) {
        store.setGeneratedImages(result.images)
        const imageCount = result.images.length
        toast.success(t('toast.generateSuccess', { count: imageCount }))
      }

      // Collect thinking text
      if (result?.thinkingText) {
        thinkingText = result.thinkingText
      }

      // Save to history
      const historyId = await store.addToHistory({
        prompt: store.prompt,
        mode: store.currentMode,
        options: { ...options },
        status: 'success',
        thinkingText:
          thinkingText ||
          store.thinkingProcess
            .filter((c) => c.type === 'text')
            .map((c) => c.content)
            .join(''),
      })

      // Background save images to storage (don't block UI)
      if (result?.images && result.images.length > 0) {
        saveImagesToStorage(historyId, result.images)
      }

      // Save settings
      await store.saveSettings()

      // Call onComplete callback
      if (callbacks.onComplete) {
        callbacks.onComplete({ success: true, result })
      }

      return { success: true, result }
    } catch (err) {
      const errorMessage = err.message || t('toast.generateFailed')
      store.setGenerationError(errorMessage)

      // Save failed attempt to history
      await store.addToHistory({
        prompt: store.prompt,
        mode: store.currentMode,
        options: { ...options },
        status: 'failed',
        error: err.message,
        thinkingText: store.thinkingProcess
          .filter((c) => c.type === 'text')
          .map((c) => c.content)
          .join(''),
      })

      // Call onComplete callback with error
      if (callbacks.onComplete) {
        callbacks.onComplete({ success: false, error: err })
      }

      return { success: false, error: err }
    } finally {
      store.setGenerating(false)
      store.setStreaming(false)
    }
  }

  return {
    handleGenerate,
    validateGeneration,
  }
}
