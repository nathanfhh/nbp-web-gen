import { useI18n } from 'vue-i18n'
import { useGeneratorStore } from '@/stores/generator'
import { useApi } from './useApi'
import { useVideoApi, buildVideoPrompt, buildVideoNegativePrompt } from './useVideoApi'
import { useSlidesGeneration } from './useSlidesGeneration'
import { useToast } from './useToast'
import { useImageStorage } from './useImageStorage'
import { useVideoStorage } from './useVideoStorage'
import { useIndexedDB } from './useIndexedDB'
import { useAnalytics } from './useAnalytics'

/**
 * Composable for handling image generation logic
 * Extracts the generation flow from App.vue for better maintainability
 */
export function useGeneration() {
  const store = useGeneratorStore()
  const toast = useToast()
  const { t } = useI18n()
  const imageStorage = useImageStorage()
  const videoStorage = useVideoStorage()
  const { updateHistoryImages, updateHistoryVideo } = useIndexedDB()
  const { generateImageStream, generateStory, editImage, generateDiagram } = useApi()
  const { generateVideo } = useVideoApi()
  const { generateAllPages } = useSlidesGeneration()
  const { trackGenerateSuccess, trackGenerateFailed } = useAnalytics()

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
    // Slides mode: prompt is optional (global description), content is in pagesRaw
    if (store.currentMode !== 'slides' && !store.prompt.trim()) {
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

      case 'video': {
        // Build enhanced prompt from prompt builder options
        const enhancedPrompt = buildVideoPrompt(store.prompt, store.videoPromptOptions)
        // Build negative prompt (separate API field)
        const negativePrompt = buildVideoNegativePrompt(store.videoPromptOptions)
        // Merge negative prompt into options for API call
        const videoOptions = {
          ...options,
          negativePrompt: negativePrompt || options.negativePrompt || '',
        }
        const videoResult = await generateVideo(enhancedPrompt, videoOptions, (progress) => {
          // Convert progress to thinking chunk format
          onThinkingChunk(progress.message)
        })
        return videoResult
      }

      case 'slides': {
        const result = await generateAllPages(onThinkingChunk)
        // Images are already collected in generateAllPages
        return result
      }

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
   * Save video to storage (background operation)
   */
  const saveVideoToStorage = async (historyId, video) => {
    try {
      const metadata = await videoStorage.saveGeneratedVideo(historyId, video)
      // Update IndexedDB with video metadata
      await updateHistoryVideo(historyId, metadata)
      // Update storage usage
      await store.updateStorageUsage()
      // Reload history to get updated record with video
      await store.loadHistory()
    } catch (err) {
      console.error('Failed to save video to OPFS:', err)
      toast.warning(t('toast.videoSaveFailed'))
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
    store.clearGeneratedVideo()
    store.clearThinkingProcess()

    const options = store.getCurrentOptions
    const refImages = store.referenceImages
    let thinkingText = ''

    try {
      // Execute generation
      const result = await executeGeneration(options, refImages)

      // Process result based on mode
      const isVideoMode = store.currentMode === 'video'

      if (isVideoMode && result?.video) {
        // Video mode result - set video for preview
        store.setGeneratedVideo(result.video)
        toast.success(t('toast.videoGenerateSuccess'))

        // Track GA4 event
        trackGenerateSuccess({
          mode: store.currentMode,
          imageCount: 0,
          videoGenerated: true,
          hasReferenceImages: refImages.length > 0,
          options,
        })
      } else if (store.currentMode === 'slides' && result) {
        // Slides mode result - handle partial success
        const { successCount = 0, failedCount = 0, totalPages = 0 } = result
        if (result.images && result.images.length > 0) {
          store.setGeneratedImages(result.images)
        }

        // Show appropriate toast based on success/failure
        if (successCount > 0 && failedCount === 0) {
          toast.success(t('toast.slidesSuccess', { count: successCount }))
        } else if (successCount > 0 && failedCount > 0) {
          toast.warning(t('toast.slidesPartialSuccess', { success: successCount, failed: failedCount }))
        } else {
          toast.error(t('toast.slidesAllFailed', { count: totalPages }))
        }

        // Track GA4 event - only if at least one page succeeded
        if (successCount > 0) {
          trackGenerateSuccess({
            mode: store.currentMode,
            imageCount: successCount,
            hasReferenceImages: refImages.length > 0,
            options,
          })
        }
      } else if (result?.images) {
        // Other image mode result
        store.setGeneratedImages(result.images)
        const imageCount = result.images.length
        toast.success(t('toast.generateSuccess', { count: imageCount }))

        // Track GA4 event
        trackGenerateSuccess({
          mode: store.currentMode,
          imageCount,
          hasReferenceImages: refImages.length > 0,
          options,
        })
      }

      // Collect thinking text
      if (result?.thinkingText) {
        thinkingText = result.thinkingText
      }

      // Save to history
      // For video mode, use effectiveOptions from result (with constraints applied)
      // Also include videoPromptOptions for prompt builder restoration
      // IMPORTANT: Exclude large binary data fields to keep history/export size small
      let historyOptions
      if (isVideoMode && result?.options) {
        const { startFrame, endFrame, referenceImages, inputVideo, ...cleanOptions } = result.options
        historyOptions = {
          ...cleanOptions,
          // Only store counts/flags, not the actual binary data
          hasStartFrame: !!startFrame,
          hasEndFrame: !!endFrame,
          referenceImageCount: referenceImages?.length || 0,
          hasInputVideo: !!inputVideo,
          videoPromptOptions: JSON.parse(JSON.stringify(store.videoPromptOptions)),
        }
      } else if (store.currentMode === 'slides') {
        // For slides mode, save content and styles but exclude large binary data
        // Exclude: pages[].image (large image data), currentPageIndex, isAnalyzing, analysisError
        // Include: pagesRaw, analyzedStyle, styleConfirmed, per-page styleGuides
        const pageStyleGuides = options.pages
          ?.filter((p) => p.styleGuide?.trim())
          .map((p) => ({ pageNumber: p.pageNumber, styleGuide: p.styleGuide }))

        historyOptions = {
          resolution: options.resolution,
          ratio: options.ratio,
          analysisModel: options.analysisModel,
          analyzedStyle: options.analyzedStyle,
          styleConfirmed: options.styleConfirmed,
          temperature: options.temperature,
          seed: options.seed,
          // Content and per-page styles
          pagesRaw: options.pagesRaw || '',
          pageStyleGuides: pageStyleGuides?.length > 0 ? pageStyleGuides : undefined,
        }
      } else {
        historyOptions = { ...options }
      }

      // Determine status for history record
      // Slides mode: check partial success; other modes: always 'success' in try block
      let historyStatus = 'success'
      if (store.currentMode === 'slides' && result) {
        const { successCount = 0, failedCount = 0 } = result
        if (successCount === 0) {
          historyStatus = 'failed'
        } else if (failedCount > 0) {
          historyStatus = 'partial'
        }
      }

      const historyId = await store.addToHistory({
        prompt: store.prompt,
        mode: store.currentMode,
        options: historyOptions,
        status: historyStatus,
        thinkingText:
          thinkingText ||
          store.thinkingProcess
            .filter((c) => c.type === 'text')
            .map((c) => c.content)
            .join(''),
      })

      // Background save to storage (don't block UI)
      if (isVideoMode && result?.video) {
        saveVideoToStorage(historyId, result.video)
      } else if (result?.images && result.images.length > 0) {
        saveImagesToStorage(historyId, result.images)
      }

      // Set current history ID for ImagePreview to use
      store.setCurrentHistoryId(historyId)

      // Call onComplete callback
      if (callbacks.onComplete) {
        callbacks.onComplete({ success: true, result })
      }

      return { success: true, result }
    } catch (err) {
      const errorMessage = err.message || t('toast.generateFailed')
      store.setGenerationError(errorMessage)

      // Track GA4 event
      trackGenerateFailed({
        mode: store.currentMode,
        error: errorMessage,
      })

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
