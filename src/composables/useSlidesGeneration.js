import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGeneratorStore } from '@/stores/generator'
import { useApi } from './useApi'
import { useToast } from './useToast'
import { generateUUID } from './useUUID'

/**
 * Composable for handling slides generation logic
 * Manages style analysis, sequential page generation, and single-page regeneration
 */
export function useSlidesGeneration() {
  const store = useGeneratorStore()
  const toast = useToast()
  const { t } = useI18n()
  const { generateImageStream, analyzeSlideStyle: apiAnalyzeSlideStyle } = useApi()

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

    // Initialize progress timing
    store.slidesOptions.progressStartTime = Date.now()
    store.slidesOptions.pageGenerationTimes = []

    try {
      for (let i = 0; i < options.pages.length; i++) {
        const page = options.pages[i]
        const pageStartTime = Date.now()

        // Update status
        store.slidesOptions.currentPageIndex = i
        store.slidesOptions.pages[i].status = 'generating'

        // Send progress message
        if (onThinkingChunk) {
          onThinkingChunk(
            `\n--- ${t('slides.generatingPage', { current: i + 1, total: options.totalPages })} ---\n`,
          )
        }

        try {
          // Combine global and page-specific reference images
          const refImages = combineReferenceImages(
            options.globalReferenceImages,
            page.referenceImages,
          )

          // Generate single page with per-page style support
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

          // Record page generation time
          const pageEndTime = Date.now()
          store.slidesOptions.pageGenerationTimes.push(pageEndTime - pageStartTime)

          // Update page data
          if (result.images && result.images.length > 0) {
            store.slidesOptions.pages[i].image = {
              data: result.images[0].data,
              mimeType: result.images[0].mimeType,
            }
            store.slidesOptions.pages[i].status = 'done'
            results.push({ pageNumber: i + 1, success: true, image: result.images[0] })
          }
        } catch (pageErr) {
          // Still record time even for failed pages (for ETA accuracy)
          const pageEndTime = Date.now()
          store.slidesOptions.pageGenerationTimes.push(pageEndTime - pageStartTime)

          store.slidesOptions.pages[i].status = 'error'
          store.slidesOptions.pages[i].error = pageErr.message
          results.push({ pageNumber: i + 1, success: false, error: pageErr.message })
        }
      }

      // Determine overall success: true only if all pages succeeded
      const allSucceeded = results.every((r) => r.success)
      const successCount = results.filter((r) => r.success).length
      const failedCount = results.length - successCount

      return {
        success: allSucceeded,
        results,
        totalPages: options.totalPages,
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
   * Regenerate a single page
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
        store.slidesOptions.pages[pageIndex].image = {
          data: result.images[0].data,
          mimeType: result.images[0].mimeType,
        }
        store.slidesOptions.pages[pageIndex].status = 'done'
        toast.success(t('slides.regenerateSuccess', { page: page.pageNumber }))
      }
    } catch (err) {
      store.slidesOptions.pages[pageIndex].status = 'error'
      store.slidesOptions.pages[pageIndex].error = err.message
      toast.error(t('slides.regenerateFailed'))
    }
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
    // Normalize line endings (Windows CRLF → LF) and handle flexible separators
    const normalizedText = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    const pageContents = normalizedText.split(/\s*---\s*/).filter((p) => p.trim())
    const existingPages = store.slidesOptions.pages

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

      // New or modified page
      return {
        id: existingPage?.id || generateUUID(),
        pageNumber: index + 1,
        content: trimmedContent,
        status: 'pending',
        image: null,
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
      page.error = null
    })
    store.slidesOptions.currentPageIndex = -1
  }

  return {
    isGenerating,
    analysisThinking,
    analyzeStyle,
    generateAllPages,
    regeneratePage,
    reorderPages,
    parsePages,
    deletePage,
    resetAllPages,
  }
}
