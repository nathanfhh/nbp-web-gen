import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGeneratorStore } from '@/stores/generator'
import { useApi } from './useApi'
import { useSlidesApi } from './useSlidesApi'
import { useNarrationApi } from './useNarrationApi'
import { useToast } from './useToast'
import { generateShortId } from './useUUID'
import { useImageStorage } from './useImageStorage'
import { useAudioStorage } from './useAudioStorage'
import { useIndexedDB } from './useIndexedDB'
import { mapConcurrent } from './requestScheduler'
import { TTS_CONCURRENCY_LIMITS } from '@/constants'

/**
 * Composable for handling slides generation logic
 * Manages style analysis, sequential page generation, and single-page regeneration
 */
export function useSlidesGeneration() {
  const store = useGeneratorStore()
  const toast = useToast()
  const { t } = useI18n()
  const { generateImageStream, generateImagesBatch } = useApi()
  const { analyzeSlideStyle: apiAnalyzeSlideStyle } = useSlidesApi()
  const { generateNarrationScripts, generatePageAudio } = useNarrationApi()
  const imageStorage = useImageStorage()
  const audioStorage = useAudioStorage()
  const { updateHistoryImages, updateHistoryNarration, updateHistoryStatus, getRecord } = useIndexedDB()

  const isGenerating = ref(false)

  // Thinking process for style analysis
  const analysisThinking = ref([])

  // Maximum reference images per generation
  const MAX_REFERENCE_IMAGES = 5

  /**
   * Combine global and page-specific reference images
   * @param {Array} globalImages - Global reference images applied to all pages
   * @param {Array} pageImages - Page-specific reference images
   * @returns {Array} Combined reference images (max 5)
   */
  const combineReferenceImages = (globalImages = [], pageImages = []) => {
    // Global images take priority, then page-specific
    const combined = [...globalImages, ...pageImages]
    return combined.slice(0, MAX_REFERENCE_IMAGES)
  }

  /**
   * Analyze all pages content and suggest design styles (global + per-page)
   * @param {Function} onThinkingChunk - Optional callback for thinking chunks
   */
  const analyzeStyle = async (onThinkingChunk = null) => {
    const options = store.slidesOptions
    if (options.pages.length === 0) return

    store.slidesOptions.isAnalyzing = true
    store.slidesOptions.analysisError = null
    analysisThinking.value = []

    // Internal thinking handler that also calls external callback
    const handleThinkingChunk = (chunk) => {
      analysisThinking.value.push({
        type: 'text',
        content: chunk,
        timestamp: Date.now(),
      })
      if (onThinkingChunk) {
        onThinkingChunk(chunk)
      }
    }

    try {
      // Prepare pages data with IDs for JSON mode
      const pagesForAnalysis = options.pages.map((p) => ({
        id: p.id,
        pageNumber: p.pageNumber,
        content: p.content,
      }))

      const result = await apiAnalyzeSlideStyle(
        pagesForAnalysis,
        {
          model: options.analysisModel,
          styleGuidance: options.styleGuidance || '',
        },
        handleThinkingChunk,
      )

      // Update global style
      store.slidesOptions.analyzedStyle = result.globalStyle
      store.slidesOptions.styleConfirmed = false

      // Update per-page styles by matching pageId
      if (result.pageStyles && result.pageStyles.length > 0) {
        for (const pageStyle of result.pageStyles) {
          const pageIndex = store.slidesOptions.pages.findIndex((p) => p.id === pageStyle.pageId)
          if (pageIndex !== -1) {
            store.slidesOptions.pages[pageIndex].styleGuide = pageStyle.styleGuide || ''
          }
        }
      }

      toast.success(t('slides.analyzeSuccess'))
    } catch (err) {
      store.slidesOptions.analysisError = err.message
      toast.error(t('slides.analyzeFailed'))
    } finally {
      store.slidesOptions.isAnalyzing = false
    }
  }

  /**
   * Generate all pages sequentially
   * @param {Function} onThinkingChunk - Callback for streaming thinking chunks
   * @returns {Promise<Object>} Generation result with images array
   */
  const generateAllPages = async (onThinkingChunk = null) => {
    const options = store.slidesOptions

    if (!options.styleConfirmed) {
      throw new Error(t('slides.styleNotConfirmed'))
    }

    if (options.pages.length === 0) {
      throw new Error(t('slides.noPages'))
    }

    if (options.pages.length > 30) {
      throw new Error(t('slides.tooManyPages', { max: 30 }))
    }

    isGenerating.value = true
    const results = []

    // Reset any stuck page statuses before starting
    store.slidesOptions.pages.forEach((page) => {
      if (page.status === 'generating' || page.status === 'comparing') {
        page.status = 'pending'
        page.pendingImage = null
      }
    })

    // Initialize progress timing
    store.slidesOptions.progressStartTime = Date.now()
    store.slidesOptions.pageGenerationTimes = []
    store.slidesOptions.currentPageIndex = 0

    try {
      const totalPages = options.pages.length
      const concurrency = Math.min(10, Math.max(1, options.concurrency || 3))
      const pageIndexById = new Map(options.pages.map((p, idx) => [p.id, idx]))

      const makeThinkingWrapper = (page) => {
        if (!onThinkingChunk) return null
        return (chunk) => {
          if (typeof chunk === 'string') {
            onThinkingChunk(`[Slide ${page.pageNumber}] ${chunk}`)
          } else {
            onThinkingChunk({ ...chunk, pageId: page.id, pageNumber: page.pageNumber })
          }
        }
      }

      // Send initial progress message
      if (onThinkingChunk) {
        onThinkingChunk(`\n--- ${t('slides.generatingPage', { current: 0, total: totalPages })} ---\n`)
      }

      const jobs = options.pages.map((page) => ({
        id: page.id,
        prompt: page.content,
        mode: 'slides',
        options: {
          ...options,
          pageNumber: page.pageNumber,
          totalPages,
          globalPrompt: store.prompt, // Prepend to each page content
          pageStyleGuide: page.styleGuide, // Per-page style (priority over global)
        },
        referenceImages: combineReferenceImages(options.globalReferenceImages, page.referenceImages),
        onThinkingChunk: makeThinkingWrapper(page),
      }))

      await generateImagesBatch(jobs, {
        concurrency,
        onJobUpdate: ({ id, status, startedAt, finishedAt, result, error }) => {
          const pageIndex = pageIndexById.get(id)
          if (pageIndex === undefined) return

          const page = store.slidesOptions.pages[pageIndex]

          if (status === 'started') {
            page.status = 'generating'
            page.error = null
            return
          }

          if (status === 'succeeded') {
            // Record page generation time for ETA accuracy
            if (typeof startedAt === 'number' && typeof finishedAt === 'number') {
              store.slidesOptions.pageGenerationTimes.push(finishedAt - startedAt)
            }

            if (result?.images?.length > 0) {
              page.image = { data: result.images[0].data, mimeType: result.images[0].mimeType }
              page.status = 'done'
              results.push({ pageNumber: page.pageNumber, success: true, image: result.images[0] })
            } else {
              page.status = 'error'
              page.error = t('errors.noImageData')
              results.push({ pageNumber: page.pageNumber, success: false, error: page.error })
            }
          }

          if (status === 'failed') {
            if (typeof startedAt === 'number' && typeof finishedAt === 'number') {
              store.slidesOptions.pageGenerationTimes.push(finishedAt - startedAt)
            }
            page.status = 'error'
            page.error = error?.message || String(error || '')
            results.push({ pageNumber: page.pageNumber, success: false, error: page.error })
          }

          // Update coarse progress counter for UI legacy fields
          const settledCount = store.slidesOptions.pages.filter(
            (p) => p.status === 'done' || p.status === 'error',
          ).length
          store.slidesOptions.currentPageIndex = settledCount

          if (onThinkingChunk) {
            onThinkingChunk(
              `\n--- ${t('slides.generatingPage', { current: settledCount, total: totalPages })} ---\n`,
            )
          }
        },
      })

      // Determine overall success: true only if all pages succeeded
      const allSucceeded = results.every((r) => r.success)
      const successCount = results.filter((r) => r.success).length
      const failedCount = results.length - successCount

      return {
        success: allSucceeded,
        results: results.sort((a, b) => a.pageNumber - b.pageNumber),
        totalPages,
        successCount,
        failedCount,
        // Include pageNumber in each image for history tracking
        images: results
          .filter((r) => r.success)
          .map((r) => ({
            ...r.image,
            pageNumber: r.pageNumber,
          })),
      }
    } finally {
      isGenerating.value = false
      store.slidesOptions.currentPageIndex = -1
      store.slidesOptions.progressStartTime = null
      store.slidesOptions.pageGenerationTimes = []
    }
  }

  /**
   * Regenerate a single page (image only)
   * @param {string} pageId - UUID of the page to regenerate
   * @param {Function} onThinkingChunk - Callback for streaming thinking chunks
   */
  const regeneratePage = async (pageId, onThinkingChunk = null) => {
    const options = store.slidesOptions
    const pageIndex = options.pages.findIndex((p) => p.id === pageId)

    if (pageIndex === -1) return

    const page = options.pages[pageIndex]

    // Update status
    store.slidesOptions.pages[pageIndex].status = 'generating'
    store.slidesOptions.pages[pageIndex].error = null

    try {
      // Combine global and page-specific reference images
      const refImages = combineReferenceImages(
        options.globalReferenceImages,
        page.referenceImages,
      )

      const result = await generateImageStream(
        page.content,
        {
          ...options,
          pageNumber: page.pageNumber,
          totalPages: options.totalPages,
          globalPrompt: store.prompt, // Prepend to each page content
          pageStyleGuide: page.styleGuide, // Per-page style (priority over global)
        },
        'slides',
        refImages,
        onThinkingChunk,
      )

      if (result.images && result.images.length > 0) {
        // Store new image in pendingImage for comparison (don't overwrite original)
        store.slidesOptions.pages[pageIndex].pendingImage = {
          data: result.images[0].data,
          mimeType: result.images[0].mimeType,
        }
        store.slidesOptions.pages[pageIndex].status = 'comparing'
        // Don't show toast yet - wait for user to confirm/cancel
      }
    } catch (err) {
      store.slidesOptions.pages[pageIndex].status = 'error'
      store.slidesOptions.pages[pageIndex].error = err.message
      toast.error(t('slides.regenerateFailed'))
    }
  }

  /**
   * Regenerate a single page's audio only
   * @param {string} pageId - UUID of the page
   * @param {Function} onThinkingChunk - Callback for streaming thinking chunks
   * @returns {Promise<{ blob: Blob, mimeType: string } | null>}
   */
  const regeneratePageAudio = async (pageId, onThinkingChunk = null) => {
    const options = store.slidesOptions
    const pageIndex = options.pages.findIndex((p) => p.id === pageId)

    if (pageIndex === -1) return null

    const page = options.pages[pageIndex]
    const pageScript = options.narrationScripts?.find((s) => s.pageId === pageId)

    if (!pageScript) {
      toast.error(t('slides.regenerateModal.noScript'))
      return null
    }

    store.slidesOptions.pages[pageIndex].status = 'generating'
    store.slidesOptions.pages[pageIndex].error = null

    try {
      onThinkingChunk?.(
        `\n🔊 ${t('slides.narration.generatingAudio', { current: page.pageNumber, total: options.totalPages })}\n`,
      )

      const result = await generatePageAudio(
        options.narrationGlobalStyle,
        pageScript.styleDirective,
        pageScript.script,
        options.narration,
      )

      store.slidesOptions.pages[pageIndex].status = 'done'
      return result
    } catch (err) {
      store.slidesOptions.pages[pageIndex].status = 'error'
      store.slidesOptions.pages[pageIndex].error = err.message
      toast.error(t('slides.regenerateModal.audioFailed'))
      return null
    }
  }

  /**
   * Regenerate a single page with both image and audio
   * @param {string} pageId - UUID of the page
   * @param {Function} onThinkingChunk - Callback for streaming thinking chunks
   * @returns {Promise<{ audioResult: Object | null }>}
   */
  const regeneratePageWithAudio = async (pageId, onThinkingChunk = null) => {
    const options = store.slidesOptions
    const pageIndex = options.pages.findIndex((p) => p.id === pageId)

    if (pageIndex === -1) return { audioResult: null }

    const page = options.pages[pageIndex]
    const pageScript = options.narrationScripts?.find((s) => s.pageId === pageId)

    // Update status
    store.slidesOptions.pages[pageIndex].status = 'generating'
    store.slidesOptions.pages[pageIndex].error = null

    let audioResult = null

    try {
      // Generate image and audio in parallel
      const refImages = combineReferenceImages(
        options.globalReferenceImages,
        page.referenceImages,
      )

      const imagePromise = generateImageStream(
        page.content,
        {
          ...options,
          pageNumber: page.pageNumber,
          totalPages: options.totalPages,
          globalPrompt: store.prompt,
          pageStyleGuide: page.styleGuide,
        },
        'slides',
        refImages,
        onThinkingChunk,
      )

      const audioPromise = pageScript
        ? generatePageAudio(
            options.narrationGlobalStyle,
            pageScript.styleDirective,
            pageScript.script,
            options.narration,
          ).catch((err) => {
            console.error('Audio generation failed:', err)
            onThinkingChunk?.(`\n⚠️ ${t('slides.regenerateModal.audioFailed')}: ${err.message}\n`)
            return null
          })
        : Promise.resolve(null)

      onThinkingChunk?.(
        `\n🔊 ${t('slides.narration.generatingAudio', { current: page.pageNumber, total: options.totalPages })}\n`,
      )

      const [imageResult, audioRes] = await Promise.all([imagePromise, audioPromise])
      audioResult = audioRes

      if (imageResult.images && imageResult.images.length > 0) {
        store.slidesOptions.pages[pageIndex].pendingImage = {
          data: imageResult.images[0].data,
          mimeType: imageResult.images[0].mimeType,
        }
        store.slidesOptions.pages[pageIndex].status = 'comparing'
      }

      return { audioResult }
    } catch (err) {
      store.slidesOptions.pages[pageIndex].status = 'error'
      store.slidesOptions.pages[pageIndex].error = err.message
      toast.error(t('slides.regenerateFailed'))
      return { audioResult: null }
    }
  }

  /**
   * Confirm regeneration - use the new image and optionally update audio
   * Updates: pages state, generatedImages, OPFS, and IndexedDB history
   * @param {string} pageId - UUID of the page
   * @param {Object} audioResult - Optional audio result { blob, mimeType } to save
   */
  const confirmRegeneration = async (pageId, audioResult = null) => {
    const pageIndex = store.slidesOptions.pages.findIndex((p) => p.id === pageId)
    if (pageIndex === -1) return

    const page = store.slidesOptions.pages[pageIndex]
    if (!page.pendingImage) return

    const newImage = { ...page.pendingImage, pageNumber: page.pageNumber }

    // 1. Update pages state
    store.slidesOptions.pages[pageIndex].image = { ...page.pendingImage }
    store.slidesOptions.pages[pageIndex].pendingImage = null
    store.slidesOptions.pages[pageIndex].status = 'done'

    // 2. Update generatedImages in store (for Generated Resources display)
    // Add or replace the image in the array
    const generatedImages = [...store.generatedImages]
    const imageIndex = generatedImages.findIndex((img) => img.pageNumber === page.pageNumber)
    if (imageIndex !== -1) {
      // Replace existing
      generatedImages[imageIndex] = newImage
    } else {
      // Add new - insert at correct position to maintain page order
      generatedImages.push(newImage)
      generatedImages.sort((a, b) => a.pageNumber - b.pageNumber)
    }
    store.setGeneratedImages(generatedImages)

    // 3. Update OPFS and IndexedDB if we have a history record
    const historyId = store.currentHistoryId
    if (historyId) {
      try {
        // Build all images from current pages state (includes the newly regenerated one)
        const updatedImages = store.slidesOptions.pages
          .filter((p) => p.image)
          .map((p) => ({
            data: p.image.data,
            mimeType: p.image.mimeType,
            pageNumber: p.pageNumber,
          }))

        if (updatedImages.length > 0) {
          // Save to OPFS and get new metadata
          const metadata = await imageStorage.saveGeneratedImages(historyId, updatedImages)

          // Update IndexedDB with new metadata
          await updateHistoryImages(historyId, metadata)

          // Update store metadata
          store.setGeneratedImagesMetadata(metadata)
        }

        // 4. Update audio if provided (existing audio remains untouched)
        if (audioResult) {
          await savePageAudioToStorage(historyId, pageIndex, audioResult, true) // skipReload - we'll reload after status update
        }

        // 5. Update status based on current success count
        const totalPages = store.slidesOptions.pages.length
        const successCount = store.slidesOptions.pages.filter((p) => p.image).length
        let newStatus = 'failed'
        if (successCount === totalPages) {
          newStatus = 'success'
        } else if (successCount > 0) {
          newStatus = 'partial'
        }
        await updateHistoryStatus(historyId, newStatus)

        // Reload history to reflect all changes
        await store.loadHistory()
      } catch (err) {
        console.error('Failed to update image in storage:', err)
        // Don't fail the operation - pages state is already updated
      }
    }

    toast.success(t('slides.regenerateSuccess', { page: page.pageNumber }))
  }

  /**
   * Save a single page's audio to storage (for regeneration)
   * @param {number} historyId - History record ID
   * @param {number} pageIndex - Page index
   * @param {Object} audioResult - { blob, mimeType }
   * @param {boolean} skipReload - Skip history reload (caller will handle it)
   */
  const savePageAudioToStorage = async (historyId, pageIndex, audioResult, skipReload = false) => {
    try {
      // Save audio file to OPFS
      const audioMeta = await audioStorage.saveGeneratedAudio(historyId, pageIndex, audioResult.blob)

      // Get current record and update narration
      const record = await getRecord(historyId)

      // Build or update narration object
      const existingNarration = record?.narration || {}
      const existingAudio = existingNarration.audio || []
      const audioIndex = existingAudio.findIndex((a) => a.pageIndex === pageIndex)

      if (audioIndex !== -1) {
        existingAudio[audioIndex] = audioMeta
      } else {
        existingAudio.push(audioMeta)
      }

      // Sort by pageIndex
      existingAudio.sort((a, b) => a.pageIndex - b.pageIndex)

      const updatedNarration = {
        ...existingNarration,
        audio: existingAudio,
      }

      await updateHistoryNarration(historyId, updatedNarration)

      // Update live preview audio URL
      const audioUrls = [...(store.generatedAudioUrls || [])]
      audioUrls[pageIndex] = URL.createObjectURL(audioResult.blob)
      store.setGeneratedAudioUrls(audioUrls)

      if (!skipReload) {
        await store.loadHistory()
      }
    } catch (err) {
      console.error('Failed to save page audio:', err)
    }
  }

  /**
   * Confirm audio-only regeneration (no image change)
   * @param {string} pageId - UUID of the page
   * @param {Object} audioResult - { blob, mimeType }
   */
  const confirmAudioRegeneration = async (pageId, audioResult) => {
    const pageIndex = store.slidesOptions.pages.findIndex((p) => p.id === pageId)
    if (pageIndex === -1) return

    const page = store.slidesOptions.pages[pageIndex]
    const historyId = store.currentHistoryId

    if (historyId && audioResult) {
      await savePageAudioToStorage(historyId, pageIndex, audioResult)
    }

    toast.success(t('slides.regenerateModal.audioSuccess', { page: page.pageNumber }))
  }

  /**
   * Cancel regeneration - keep the original image
   * @param {string} pageId - UUID of the page
   */
  const cancelRegeneration = (pageId) => {
    const pageIndex = store.slidesOptions.pages.findIndex((p) => p.id === pageId)
    if (pageIndex === -1) return

    // Discard new image, keep original
    store.slidesOptions.pages[pageIndex].pendingImage = null
    store.slidesOptions.pages[pageIndex].status = 'done'
    toast.info(t('slides.regenerateCancelled'))
  }

  /**
   * Reorder pages
   * @param {number} fromIndex - Source index
   * @param {number} toIndex - Target index
   */
  const reorderPages = (fromIndex, toIndex) => {
    const pages = [...store.slidesOptions.pages]
    const [moved] = pages.splice(fromIndex, 1)
    pages.splice(toIndex, 0, moved)

    // Update page numbers
    pages.forEach((p, i) => {
      p.pageNumber = i + 1
    })

    store.slidesOptions.pages = pages
  }

  /**
   * Parse raw input text into pages array
   * @param {string} rawText - User input with --- separators
   */
  const parsePages = (rawText) => {
    // Normalize line endings (Windows CRLF → LF) and split on --- that's on its own line
    const normalizedText = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    const pageContents = normalizedText.split(/\n\s*---\s*\n/).filter((p) => p.trim())
    const existingPages = store.slidesOptions.pages

    // Collect existing IDs for uniqueness check when generating new short IDs
    const usedIds = existingPages.map((p) => p.id).filter(Boolean)

    // Create new pages array, preserving existing image data where content matches
    const newPages = pageContents.map((content, index) => {
      const trimmedContent = content.trim()
      const existingPage = existingPages[index]

      // If content matches existing page, keep its data
      if (existingPage && existingPage.content === trimmedContent) {
        return {
          ...existingPage,
          pageNumber: index + 1,
        }
      }

      // Generate new short ID if needed, ensuring uniqueness
      let newId = existingPage?.id
      if (!newId) {
        newId = generateShortId(usedIds)
        usedIds.push(newId) // Track newly generated ID for subsequent pages
      }

      // New or modified page
      return {
        id: newId,
        pageNumber: index + 1,
        content: trimmedContent,
        status: 'pending',
        image: null,
        pendingImage: null, // For regeneration comparison
        error: null,
        referenceImages: existingPage?.referenceImages || [],
        styleGuide: existingPage?.styleGuide || '', // Per-page style guide
      }
    })

    store.slidesOptions.pages = newPages
    store.slidesOptions.totalPages = newPages.length
  }

  /**
   * Delete a page by ID
   * @param {string} pageId - UUID of the page to delete
   */
  const deletePage = (pageId) => {
    const pages = store.slidesOptions.pages.filter((p) => p.id !== pageId)

    // Update page numbers
    pages.forEach((p, i) => {
      p.pageNumber = i + 1
    })

    store.slidesOptions.pages = pages
    store.slidesOptions.totalPages = pages.length

    // Update raw text to match
    store.slidesOptions.pagesRaw = pages.map((p) => p.content).join('\n---\n')
  }

  /**
   * Reset all pages to pending status
   */
  const resetAllPages = () => {
    store.slidesOptions.pages.forEach((page) => {
      page.status = 'pending'
      page.image = null
      page.pendingImage = null
      page.error = null
    })
    store.slidesOptions.currentPageIndex = -1
  }

  // Narration thinking process
  const narrationThinking = ref([])

  /**
   * Generate narration scripts for all pages
   * Called before "Start Generation" - user can review/edit scripts
   * @param {Function} onThinkingChunk - Callback for streaming thinking chunks
   */
  const generateScripts = async (onThinkingChunk = null) => {
    const options = store.slidesOptions
    if (options.pages.length === 0) return

    store.slidesOptions.narrationStatus = 'generating-scripts'
    store.slidesOptions.narrationError = null
    narrationThinking.value = []

    const handleThinkingChunk = (chunk) => {
      narrationThinking.value.push({
        type: 'text',
        content: chunk,
        timestamp: Date.now(),
      })
      onThinkingChunk?.(chunk)
    }

    try {
      const pagesForScripts = options.pages.map((p) => ({
        id: p.id,
        pageNumber: p.pageNumber,
        content: p.content,
      }))

      const result = await generateNarrationScripts(
        pagesForScripts,
        options.narration,
        handleThinkingChunk,
      )

      store.slidesOptions.narrationGlobalStyle = result.globalStyleDirective || ''
      store.slidesOptions.narrationScripts = result.pageScripts || []
      store.slidesOptions.narrationStatus = 'idle'

      toast.success(t('slides.narration.scriptComplete'))
    } catch (err) {
      store.slidesOptions.narrationStatus = 'error'
      store.slidesOptions.narrationError = err.message
      toast.error(err.message)
    }
  }

  /**
   * Generate TTS audio for all pages using confirmed scripts
   * Called in parallel with image generation during "Start Generation"
   * Uses concurrent execution with rate limiting (TTS API: 10 RPM)
   * @param {Function} onThinkingChunk - Callback for streaming thinking chunks
   * @returns {Promise<Array>} Array of { pageIndex, blob, mimeType } for each page
   */
  const generateAllAudio = async (onThinkingChunk = null) => {
    const options = store.slidesOptions
    const scripts = options.narrationScripts
    const globalStyle = options.narrationGlobalStyle

    if (!scripts || scripts.length === 0) return []

    // Get concurrency setting with validation (1-5, default 2)
    const concurrency = Math.min(
      TTS_CONCURRENCY_LIMITS.max,
      Math.max(TTS_CONCURRENCY_LIMITS.min, options.audioConcurrency || TTS_CONCURRENCY_LIMITS.default),
    )

    store.slidesOptions.narrationStatus = 'generating-audio'
    const audioResults = []

    try {
      // Build jobs array for concurrent processing
      const jobs = options.pages
        .map((page, i) => {
          const pageScript = scripts.find((s) => s.pageId === page.id)
          if (!pageScript) {
            console.warn(`No script found for page ${page.id}, skipping audio`)
            return null
          }
          return { id: page.id, pageIndex: i, page, pageScript }
        })
        .filter(Boolean)

      // Process audio generation concurrently with rate limiting
      // Note: Rate limiting is handled inside generatePageAudio via ttsStartLimiter
      await mapConcurrent(jobs, concurrency, async (job) => {
        onThinkingChunk?.(
          `\n🔊 [Page ${job.pageIndex + 1}] ${t('slides.narration.generatingAudio', {
            current: job.pageIndex + 1,
            total: options.pages.length,
          })}\n`,
        )

        try {
          const result = await generatePageAudio(
            globalStyle,
            job.pageScript.styleDirective,
            job.pageScript.script,
            options.narration,
          )

          audioResults.push({
            pageIndex: job.pageIndex,
            blob: result.blob,
            mimeType: result.mimeType,
          })
        } catch (audioErr) {
          console.error(`Failed to generate audio for page ${job.pageIndex + 1}:`, audioErr)
          onThinkingChunk?.(`\n⚠️ [Page ${job.pageIndex + 1}] Audio failed: ${audioErr.message}\n`)
        }
      })

      // Sort results by pageIndex to maintain order
      audioResults.sort((a, b) => a.pageIndex - b.pageIndex)

      store.slidesOptions.narrationStatus = 'done'
      if (audioResults.length > 0) {
        toast.success(t('slides.narration.audioComplete'))
      }
      return audioResults
    } catch (err) {
      store.slidesOptions.narrationStatus = 'error'
      store.slidesOptions.narrationError = err.message
      throw err
    }
  }

  /**
   * Save audio results to OPFS
   * @param {number} historyId - History record ID
   * @param {Array} audioResults - Array of { pageIndex, blob, mimeType }
   * @returns {Promise<Array>} Audio metadata array for IndexedDB
   */
  const saveAudioToStorage = async (historyId, audioResults) => {
    const audioMetadata = []

    for (const result of audioResults) {
      try {
        const metadata = await audioStorage.saveGeneratedAudio(historyId, result.pageIndex, result.blob)
        audioMetadata.push(metadata)
      } catch (err) {
        console.error(`Failed to save audio for page ${result.pageIndex}:`, err)
      }
    }

    return audioMetadata
  }

  return {
    isGenerating,
    analysisThinking,
    narrationThinking,
    analyzeStyle,
    generateAllPages,
    regeneratePage,
    regeneratePageAudio,
    regeneratePageWithAudio,
    confirmRegeneration,
    confirmAudioRegeneration,
    cancelRegeneration,
    reorderPages,
    parsePages,
    deletePage,
    resetAllPages,
    // Narration
    generateScripts,
    generateAllAudio,
    saveAudioToStorage,
  }
}
