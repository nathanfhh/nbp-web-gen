import { useI18n } from 'vue-i18n'
import { useGeneratorStore } from '@/stores/generator'
import { useApi } from './useApi'
import { useVideoApi, buildVideoPrompt, buildVideoNegativePrompt } from './useVideoApi'
import { useSlidesGeneration } from './useSlidesGeneration'
import { useToast } from './useToast'
import { useImageStorage } from './useImageStorage'
import { useVideoStorage } from './useVideoStorage'
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
  const videoStorage = useVideoStorage()
  const { updateHistoryImages, updateHistoryVideo, updateHistoryNarration } = useIndexedDB()
  const { generateImageStream, generateStory, editImage, generateDiagram } = useApi()
  const { generateVideo } = useVideoApi()
  const { generateAllPages, generateAllAudio, saveAudioToStorage } = useSlidesGeneration()

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
        // Flatten story results - only collect successful step images
        if (result.results) {
          const allImages = []
          let thinkingText = ''
          result.results.forEach((r) => {
            // Only collect images from successful steps
            if (r.success && r.images) {
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
        const narrationEnabled = store.slidesOptions.narration?.enabled
        const hasScripts = (store.slidesOptions.narrationScripts?.length || 0) > 0

        try {
          if (narrationEnabled && hasScripts) {
            // Run image generation and TTS audio in parallel
            const [imageSettled, audioSettled] = await Promise.allSettled([
              generateAllPages(onThinkingChunk),
              generateAllAudio(onThinkingChunk),
            ])

            const result = imageSettled.status === 'fulfilled' ? imageSettled.value : null
            const audioResults = audioSettled.status === 'fulfilled' ? audioSettled.value : []

            if (audioSettled.status === 'rejected') {
              console.error('Narration audio generation failed:', audioSettled.reason)
              toast.warning(t('toast.narrationAudioFailed'))
            }

            if (imageSettled.status === 'rejected') {
              throw imageSettled.reason
            }

            // Attach audio results for later saving
            if (result && audioResults.length > 0) {
              result.audioResults = audioResults
            }
            return result
          } else {
            return await generateAllPages(onThinkingChunk)
          }
        } finally {
          // Reset audio progress counters after slides generation completes
          store.slidesOptions.audioCompletedCount = 0
          store.slidesOptions.audioTotalCount = 0
        }
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
   * Save narration data (audio + scripts) to storage (background operation)
   */
  const saveNarrationToStorage = async (historyId, audioResults, options) => {
    try {
      // Save audio files to OPFS
      const audioMetadata = await saveAudioToStorage(historyId, audioResults)

      // Build narration record for IndexedDB
      const narration = {
        globalStyleDirective: options.narrationGlobalStyle || '',
        scripts: (options.narrationScripts || []).map((s) => ({
          pageId: s.pageId,
          styleDirective: s.styleDirective,
          script: s.script,
        })),
        audio: audioMetadata,
        settings: {
          speakerMode: options.narration?.speakerMode,
          speakers: options.narration?.speakers,
          style: options.narration?.style,
          language: options.narration?.language,
          scriptModel: options.narration?.scriptModel,
          ttsModel: options.narration?.ttsModel,
          customLanguages: options.narration?.customLanguages,
          customPrompt: options.narration?.customPrompt,
        },
      }

      await updateHistoryNarration(historyId, narration)
      await store.updateStorageUsage()
      await store.loadHistory()
    } catch (err) {
      console.error('Failed to save narration to storage:', err)
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
    store.clearGeneratedAudioUrls()
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
      } else if (store.currentMode === 'story' && result) {
        // Story mode result - handle partial success
        const { successCount = 0, failedCount = 0, totalSteps = 0 } = result
        if (result.images && result.images.length > 0) {
          store.setGeneratedImages(result.images)
        }

        // Show appropriate toast based on success/failure
        if (successCount > 0 && failedCount === 0) {
          toast.success(t('toast.storySuccess', { count: successCount }))
        } else if (successCount > 0 && failedCount > 0) {
          toast.warning(t('toast.storyPartialSuccess', { success: successCount, failed: failedCount }))
        } else {
          toast.error(t('toast.storyAllFailed', { count: totalSteps }))
        }
      } else if (result?.images) {
        // Other image mode result
        store.setGeneratedImages(result.images)
        const imageCount = result.images.length
        toast.success(t('toast.generateSuccess', { count: imageCount }))
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
        const pageStyleGuides = options.pages
          ?.filter((p) => p.styleGuide?.trim())
          .map((p) => ({ pageNumber: p.pageNumber, styleGuide: p.styleGuide }))

        // Save each page's content (excluding binary data like referenceImages)
        const pagesContent = options.pages?.map((p) => ({
          id: p.id,
          pageNumber: p.pageNumber,
          content: p.content,
        }))

        historyOptions = {
          resolution: options.resolution,
          ratio: options.ratio,
          analysisModel: options.analysisModel,
          analyzedStyle: options.analyzedStyle,
          styleConfirmed: options.styleConfirmed,
          temperature: options.temperature,
          seed: options.seed,
          pagesRaw: options.pagesRaw || '',
          pageStyleGuides: pageStyleGuides?.length > 0 ? pageStyleGuides : undefined,
          styleGuidance: options.styleGuidance || '',
          pagesContent,
        }
      } else {
        historyOptions = { ...options }
      }

      // Determine status for history record
      // Slides/Story mode: check partial success; other modes: always 'success' in try block
      let historyStatus = 'success'
      if ((store.currentMode === 'slides' || store.currentMode === 'story') && result) {
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

      // Save narration data (slides mode)
      // Save if: has audio results OR has scripts (even without audio)
      if (store.currentMode === 'slides') {
        const hasAudio = result?.audioResults?.length > 0
        const hasScripts = options.narrationScripts?.length > 0

        if (hasAudio) {
          // Build live preview audio URLs (sparse array indexed by pageIndex)
          const audioUrls = []
          for (const ar of result.audioResults) {
            audioUrls[ar.pageIndex] = URL.createObjectURL(ar.blob)
          }
          store.setGeneratedAudioUrls(audioUrls)
        }

        // Save narration metadata even if no audio (preserves scripts and settings)
        if (hasAudio || hasScripts) {
          saveNarrationToStorage(historyId, result?.audioResults || [], options)
        }
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
