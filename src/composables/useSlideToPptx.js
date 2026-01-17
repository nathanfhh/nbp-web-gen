/**
 * Slide to PPTX Composable
 * Main orchestrator for converting slide images to editable PPTX
 *
 * Flow:
 * 1. OCR to detect text regions
 * 2. Generate mask from OCR results
 * 3. Inpaint to remove text from images
 * 4. Export to PPTX with text boxes overlaid on clean backgrounds
 */

import { ref, reactive, computed, onUnmounted } from 'vue'
import { GoogleGenAI, Modality } from '@google/genai'
import { useOcr } from './useOcr'
import { useInpaintingWorker } from './useInpaintingWorker'
import { usePptxExport } from './usePptxExport'
import { useApiKeyManager } from './useApiKeyManager'
import { mergeTextRegions } from '@/utils/ocr-core'
import i18n from '@/i18n'

// Helper for i18n translation in composable
const t = (key, params) => i18n.global.t(key, params)

/**
 * @typedef {Object} ProcessingSettings
 * @property {'opencv'|'gemini'} inpaintMethod - Text removal method
 * @property {'TELEA'|'NS'} opencvAlgorithm - OpenCV algorithm
 * @property {number} inpaintRadius - Inpainting radius (1-10)
 * @property {number} maskPadding - Mask padding around text (px)
 * @property {'auto'|'16:9'|'4:3'|'9:16'} slideRatio - Output slide ratio
 */

/**
 * @typedef {Object} SlideProcessingState
 * @property {'pending'|'ocr'|'mask'|'inpaint'|'done'|'error'} status
 * @property {Array} ocrResults - OCR detection results (merged regions for PPTX)
 * @property {Array} regions - Merged OCR regions
 * @property {Array} rawRegions - Raw OCR regions (unmerged)
 * @property {string|null} cachedImageUrl - Cached image URL for OCR cache validation
 * @property {'webgpu'|'wasm'|null} cachedOcrEngine - Cached OCR engine type
 * @property {ImageData} mask - Generated mask
 * @property {string} cleanImage - Text-removed image data URL
 * @property {string} originalImage - Original image data URL (for comparison)
 * @property {number} width - Image width
 * @property {number} height - Image height
 * @property {string} error - Error message if failed
 * @property {Object|null} overrideSettings - Per-page settings override (null = use global)
 * @property {boolean} isRegionsEdited - Flag: user has manually edited regions
 * @property {Array|null} editedRawRegions - User-modified regions (null = use original rawRegions)
 */

/**
 * @returns {Object} Slide to PPTX composable
 */
export function useSlideToPptx() {
  // Sub-composables
  const ocr = useOcr()
  const inpainting = useInpaintingWorker()
  const pptx = usePptxExport()
  const { getApiKey } = useApiKeyManager()

  // State
  const isProcessing = ref(false)
  const isCancelled = ref(false)
  const currentStep = ref('') // 'ocr' | 'mask' | 'inpaint' | 'pptx'
  const currentSlide = ref(0)
  const totalSlides = ref(0)
  const progress = ref(0)
  const logs = ref([])

  // Timer state
  const startTime = ref(null)
  const elapsedTime = ref(0) // in milliseconds
  let timerInterval = null

  // Setting mode: 'global' = all slides use same settings, 'per-page' = each slide can have custom settings
  const settingMode = ref('global')

  // Preview mode: after processing, show comparison before download
  const isPreviewMode = ref(false)
  const previewIndex = ref(0)

  // Settings
  const settings = reactive({
    inpaintMethod: 'opencv',
    opencvAlgorithm: 'NS', // Navier-Stokes is better for larger regions
    inpaintRadius: 3,
    maskPadding: 5,
    slideRatio: 'auto',
    // Gemini model for text removal
    // '2.0' = gemini-2.5-flash-image (can use free tier)
    // '3.0' = gemini-3-pro-image-preview (paid only)
    geminiModel: '2.0',
    // Image quality for 3.0 model output (1k, 2k, 4k)
    imageQuality: '2k',
  })

  // Slide states
  const slideStates = ref([])

  // Computed
  const overallProgress = computed(() => {
    if (totalSlides.value === 0) return 0
    const completedSlides = slideStates.value.filter(
      (s) => s.status === 'done' || s.status === 'error'
    ).length
    return Math.round((completedSlides / totalSlides.value) * 100)
  })

  /**
   * Add a log entry
   * @param {string} message - Log message
   * @param {'info'|'success'|'error'|'warning'} type - Log type
   */
  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString()
    logs.value.push({ timestamp, message, type })
    // Keep only last 100 logs
    if (logs.value.length > 100) {
      logs.value.shift()
    }
  }

  /**
   * Clear logs
   */
  const clearLogs = () => {
    logs.value = []
  }

  /**
   * Start the processing timer
   */
  const startTimer = () => {
    startTime.value = Date.now()
    elapsedTime.value = 0
    timerInterval = setInterval(() => {
      elapsedTime.value = Date.now() - startTime.value
    }, 100) // Update every 100ms for smooth display
  }

  /**
   * Stop the processing timer
   */
  const stopTimer = () => {
    if (timerInterval) {
      clearInterval(timerInterval)
      timerInterval = null
    }
    if (startTime.value) {
      elapsedTime.value = Date.now() - startTime.value
    }
  }

  /**
   * Format elapsed time as MM:SS.s
   * @param {number} ms - Milliseconds
   * @returns {string} Formatted time
   */
  const formatElapsedTime = (ms) => {
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    const tenths = Math.floor((ms % 1000) / 100)
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${tenths}`
  }

  /**
   * Convert base64 to data URL if needed
   * @param {string} src - Image source (data URL or plain base64)
   * @returns {string} Data URL
   */
  const toDataUrl = (src) => {
    if (src.startsWith('data:') || src.startsWith('http') || src.startsWith('blob:')) {
      return src
    }
    // Detect image type from base64 prefix
    let mimeType = 'image/png'
    if (src.startsWith('/9j/')) mimeType = 'image/jpeg'
    else if (src.startsWith('iVBOR')) mimeType = 'image/png'
    else if (src.startsWith('UklGR')) mimeType = 'image/webp'
    else if (src.startsWith('R0lGOD')) mimeType = 'image/gif'
    return `data:${mimeType};base64,${src}`
  }

  /**
   * Convert image source to ImageData
   * @param {string} src - Image source (data URL or plain base64)
   * @returns {Promise<{imageData: ImageData, width: number, height: number, dataUrl: string}>}
   */
  const loadImage = async (src) => {
    const inputUrl = toDataUrl(src)
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)
        // Always export as PNG data URL to ensure valid format for Gemini API
        const dataUrl = canvas.toDataURL('image/png')
        resolve({
          imageData: ctx.getImageData(0, 0, img.width, img.height),
          width: img.width,
          height: img.height,
          dataUrl,
        })
      }
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = inputUrl
    })
  }

  /**
   * Remove text from image using Gemini API
   * @param {string} imageDataUrl - Image data URL
   * @param {Array} ocrResults - OCR detection results (for context)
   * @param {Object} effectiveSettings - Settings to use (per-page or global)
   * @returns {Promise<string>} - Clean image data URL
   */
  const removeTextWithGeminiWithSettings = async (imageDataUrl, ocrResults, effectiveSettings) => {
    // Determine model and API key usage based on settings
    const modelId = effectiveSettings.geminiModel === '2.0'
      ? 'gemini-2.5-flash-image'
      : 'gemini-3-pro-image-preview'

    // For 2.5 model, try free tier first; for 3.0, use paid key directly
    const usage = effectiveSettings.geminiModel === '2.0' ? 'text' : 'image'

    // Image quality mapping for 3.0 model
    const imageQualityMap = { '1k': '1K', '2k': '2K', '4k': '4K' }
    const imageSize = imageQualityMap[effectiveSettings.imageQuality] || '2K'

    const apiKey = getApiKey(usage)
    if (!apiKey) {
      throw new Error('API Key 未設定')
    }

    // Extract base64 data from data URL
    const base64Data = imageDataUrl.split(',')[1]
    const mimeType = imageDataUrl.split(';')[0].split(':')[1] || 'image/png'

    // Build prompt describing what text to remove
    const textDescriptions = ocrResults.slice(0, 10).map(r => r.text).join(', ')
    const prompt = `Remove ALL text from this slide image completely. The image contains text like: "${textDescriptions}".

IMPORTANT REQUIREMENTS:
1. Remove every piece of text, including titles, subtitles, body text, labels, and captions
2. Fill in the removed text areas with appropriate background content that matches the surrounding area
3. Preserve all non-text elements: images, shapes, icons, charts, graphs, decorative elements
4. Maintain the exact same image dimensions and aspect ratio
5. The result should look like a clean slide background template ready for new text overlay
6. Do NOT add any new text or watermarks

Output: A single clean image with all text removed.`

    const ai = new GoogleGenAI({ apiKey })

    // Build config - add imageSize only for 3.0 model
    const config = {
      responseModalities: [Modality.IMAGE, Modality.TEXT],
    }
    if (effectiveSettings.geminiModel === '3.0') {
      config.imageSize = imageSize
    }

    try {
      const response = await ai.models.generateContent({
        model: modelId,
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType,
                  data: base64Data,
                },
              },
            ],
          },
        ],
        config,
      })

      // Extract image from response
      if (!response.candidates || response.candidates.length === 0) {
        throw new Error('No response from Gemini')
      }

      const candidate = response.candidates[0]
      if (!candidate.content || !candidate.content.parts) {
        throw new Error('Invalid response format')
      }

      // Find the image part
      for (const part of candidate.content.parts) {
        if (part.inlineData) {
          const resultMimeType = part.inlineData.mimeType || 'image/png'
          return `data:${resultMimeType};base64,${part.inlineData.data}`
        }
      }

      throw new Error('No image in Gemini response')
    } catch (error) {
      // Check if it's a quota error and we're using free tier
      if (usage === 'text' && isQuotaError(error)) {
        addLog(t('slideToPptx.logs.freeTierQuotaExceeded'), 'warning')

        // Retry with paid key
        const paidKey = getApiKey('image')
        if (!paidKey) {
          throw new Error(t('errors.paidApiKeyRequired'))
        }

        const paidAi = new GoogleGenAI({ apiKey: paidKey })
        const retryResponse = await paidAi.models.generateContent({
          model: modelId,
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType,
                    data: base64Data,
                  },
                },
              ],
            },
          ],
          config,  // Reuse the same config with imageSize
        })

        const retryCandidate = retryResponse.candidates?.[0]
        if (retryCandidate?.content?.parts) {
          for (const part of retryCandidate.content.parts) {
            if (part.inlineData) {
              const resultMimeType = part.inlineData.mimeType || 'image/png'
              return `data:${resultMimeType};base64,${part.inlineData.data}`
            }
          }
        }
        throw new Error('No image in Gemini response after retry')
      }
      throw error
    }
  }

  /**
   * Check if error is a quota/rate limit error
   */
  const isQuotaError = (error) => {
    if (error?.status === 429 || error?.code === 429) return true
    const message = (error?.message || '').toLowerCase()
    return (
      message.includes('quota') ||
      message.includes('rate limit') ||
      message.includes('exhausted') ||
      message.includes('exceeded') ||
      message.includes('too many requests')
    )
  }

  /**
   * Process a single slide
   * @param {number} index - Slide index
   * @param {string} imageSrc - Image data URL
   * @returns {Promise<SlideProcessingState>}
   */
  /**
   * Get effective settings for a slide (per-page override or global)
   * @param {number} index - Slide index
   * @returns {Object} Effective settings
   */
  const getEffectiveSettings = (index) => {
    const state = slideStates.value[index]
    if (state?.overrideSettings) {
      return { ...settings, ...state.overrideSettings }
    }
    return settings
  }

  const processSlide = async (index, imageSrc) => {
    const state = slideStates.value[index]

    // Get effective settings (per-page override or global)
    const effectiveSettings = getEffectiveSettings(index)

    if (isCancelled.value) {
      state.status = 'error'
      state.error = 'Cancelled'
      return state
    }

    try {
      // Step 1: Load image and get proper data URL
      // This ensures blob: and http: URLs are converted to valid data URLs for Gemini API
      addLog(t('slideToPptx.logs.loadingImage', { slide: index + 1 }))
      const { imageData, width, height, dataUrl: imageDataUrl } = await loadImage(imageSrc)
      state.width = width
      state.height = height

      // Save original image for comparison (now guaranteed to be valid data URL)
      state.originalImage = imageDataUrl

      // Step 2: OCR (with caching - skip if results exist for same image)
      currentStep.value = 'ocr'
      state.status = 'ocr'

      // Check if we can use cached OCR results
      // Must match: same image URL AND same OCR engine type
      const currentEngine = ocr.activeEngine?.value || 'wasm'
      const hasCachedOcr = state.rawRegions?.length > 0 &&
                           state.cachedImageUrl === imageDataUrl &&
                           state.cachedOcrEngine === currentEngine

      if (hasCachedOcr) {
        addLog(t('slideToPptx.logs.usingCachedOcr', { slide: index + 1, count: state.regions.length }), 'info')
        // Ensure ocrResults is set for PPTX export (may have been cleared)
        state.ocrResults = state.regions
      } else {
        addLog(t('slideToPptx.logs.runningOcr', { slide: index + 1 }))

        // Now returns { regions, rawRegions }
        const ocrResult = await ocr.recognize(imageDataUrl, (value, message, stage) => {
          // Log Tesseract fallback progress
          if (stage === 'tesseract') {
            addLog(message, 'info')
          }
        })

        // Handle both old and new format for backward compatibility
        if (Array.isArray(ocrResult)) {
          state.regions = ocrResult
          state.rawRegions = ocrResult
        } else {
          state.regions = ocrResult.regions
          state.rawRegions = ocrResult.rawRegions
        }

        // Cache the image URL and engine type for future comparisons
        state.cachedImageUrl = imageDataUrl
        state.cachedOcrEngine = currentEngine

        // Also store in ocrResults for PPTX export compatibility (using merged regions)
        state.ocrResults = state.regions
        addLog(t('slideToPptx.logs.foundTextBlocks', { slide: index + 1, count: state.regions.length }), 'success')
      }

      if (isCancelled.value) {
        state.status = 'error'
        state.error = 'Cancelled'
        return state
      }

      // Step 3: Generate mask (Use rawRegions for precise inpainting!)
      currentStep.value = 'mask'
      state.status = 'mask'
      addLog(t('slideToPptx.logs.generatingMask', { slide: index + 1 }))

      const mask = ocr.generateMask(width, height, state.rawRegions, effectiveSettings.maskPadding)
      state.mask = mask

      if (isCancelled.value) {
        state.status = 'error'
        state.error = 'Cancelled'
        return state
      }

      // Step 4: Inpaint (remove text)
      currentStep.value = 'inpaint'
      state.status = 'inpaint'
      addLog(t('slideToPptx.logs.removingText', { slide: index + 1, method: effectiveSettings.inpaintMethod }))

      if (effectiveSettings.inpaintMethod === 'opencv') {
        const inpaintedData = await inpainting.inpaint(imageData, mask, {
          algorithm: effectiveSettings.opencvAlgorithm,
          radius: effectiveSettings.inpaintRadius,
          dilateMask: true,
          dilateIterations: Math.ceil(effectiveSettings.maskPadding / 2),
        })

        // Convert ImageData to data URL
        state.cleanImage = inpainting.imageDataToDataUrl(inpaintedData)
      } else {
        // Gemini API method with fallback to OpenCV
        const modelName = effectiveSettings.geminiModel === '2.0' ? 'Nano Banana (2.0)' : 'Nano Banana Pro (3.0)'
        addLog(t('slideToPptx.logs.usingGeminiModel', { slide: index + 1, model: modelName }))

        try {
          state.cleanImage = await removeTextWithGeminiWithSettings(imageDataUrl, state.regions, effectiveSettings)
        } catch (geminiError) {
          // Fallback to OpenCV when Gemini fails (RECITATION, quota, etc.)
          addLog(t('slideToPptx.logs.geminiFailed', { slide: index + 1, error: geminiError.message }), 'warning')

          const inpaintedData = await inpainting.inpaint(imageData, mask, {
            algorithm: 'NS', // Use NS algorithm for fallback (better for larger regions)
            radius: effectiveSettings.inpaintRadius || 3,
            dilateMask: true,
            dilateIterations: Math.ceil((effectiveSettings.maskPadding || 5) / 2),
          })

          state.cleanImage = inpainting.imageDataToDataUrl(inpaintedData)
          addLog(t('slideToPptx.logs.opencvFallbackComplete', { slide: index + 1 }), 'success')
        }
      }

      addLog(t('slideToPptx.logs.textRemovalComplete', { slide: index + 1 }), 'success')

      state.status = 'done'
      return state
    } catch (error) {
      state.status = 'error'
      state.error = error.message
      addLog(t('slideToPptx.logs.slideError', { slide: index + 1, error: error.message }), 'error')
      return state
    }
  }

  /**
   * Process all slides and generate PPTX
   * @param {Array<{data: string, mimeType: string}>} images - Array of image data
   * @param {Object} callbacks - Callbacks for progress updates
   * @returns {Promise<boolean>} Success status
   */
  const processAll = async (images, callbacks = {}) => {
    if (isProcessing.value) return false

    isProcessing.value = true
    isCancelled.value = false
    currentSlide.value = 0
    totalSlides.value = images.length
    progress.value = 0
    clearLogs()
    startTimer()

    // Initialize slide states with extended structure
    // IMPORTANT: Preserve existing overrideSettings (per-page settings), OCR cache, and region edits
    slideStates.value = images.map((_, index) => {
      const existingState = slideStates.value[index]
      return {
        status: 'pending',
        ocrResults: [],
        // Preserve OCR cache to skip re-running OCR when only settings changed
        regions: existingState?.regions || [],
        rawRegions: existingState?.rawRegions || [],
        cachedImageUrl: existingState?.cachedImageUrl || null,
        cachedOcrEngine: existingState?.cachedOcrEngine || null,
        mask: null,
        cleanImage: null,
        originalImage: null,
        width: 0,
        height: 0,
        error: null,
        overrideSettings: existingState?.overrideSettings || null,
        // Preserve region editing state
        isRegionsEdited: existingState?.isRegionsEdited || false,
        editedRawRegions: existingState?.editedRawRegions || null,
      }
    })

    addLog(t('slideToPptx.logs.startingProcessing', { count: images.length }))

    try {
      // Initialize workers - only log first progress message (start), then completion
      addLog(t('slideToPptx.logs.initializingOcr'))
      let hasLoggedModelStatus = false
      await ocr.initialize((progress, message) => {
        // Only log the first message (e.g., "downloading models" or "loading from cache")
        if (!hasLoggedModelStatus && message) {
          addLog(message)
          hasLoggedModelStatus = true
        }
      })

      // Log OCR engine info
      const engineType = ocr.activeEngine?.value === 'webgpu' ? 'Main Thread' : 'Worker'
      const provider = ocr.executionProvider?.value || 'wasm'
      addLog(t('slideToPptx.logs.ocrEngine', { engine: `${engineType} + ${provider.toUpperCase()} (PaddleOCR)` }), 'info')

      addLog(t('slideToPptx.logs.initializingInpainting'))
      await inpainting.initialize()

      // Process each slide
      for (let i = 0; i < images.length; i++) {
        if (isCancelled.value) break

        currentSlide.value = i + 1
        progress.value = Math.round((i / images.length) * 80)

        if (callbacks.onSlideStart) {
          callbacks.onSlideStart(i + 1, images.length)
        }

        await processSlide(i, images[i].data)

        if (callbacks.onSlideComplete) {
          callbacks.onSlideComplete(i + 1, images.length, slideStates.value[i])
        }
      }

      if (isCancelled.value) {
        addLog(t('slideToPptx.logs.processingCancelled'), 'warning')
        return false
      }

      // Check if all slides processed successfully
      const successCount = slideStates.value.filter((s) => s.status === 'done').length
      const failCount = slideStates.value.filter((s) => s.status === 'error').length

      if (successCount === 0) {
        addLog(t('slideToPptx.logs.allSlidesFailed'), 'error')
        return false
      }

      if (failCount > 0) {
        addLog(t('slideToPptx.logs.someSlidesFailed', { failCount, successCount }), 'warning')
      }

      // Enter preview mode instead of auto-download
      progress.value = 100
      addLog(t('slideToPptx.logs.processingComplete'), 'success')

      // Enter preview mode for user to review before download
      isPreviewMode.value = true
      previewIndex.value = 0

      if (callbacks.onComplete) {
        callbacks.onComplete(successCount, failCount)
      }

      return true
    } catch (error) {
      addLog(t('slideToPptx.logs.processingFailed', { error: error.message }), 'error')
      if (callbacks.onError) {
        callbacks.onError(error)
      }
      return false
    } finally {
      stopTimer()
      isProcessing.value = false
      currentStep.value = ''
    }
  }

  /**
   * Cancel the current processing
   */
  const cancel = () => {
    if (isProcessing.value) {
      isCancelled.value = true
      addLog(t('slideToPptx.logs.cancellationRequested'), 'warning')
    }
  }

  /**
   * Reset all state
   */
  const reset = () => {
    isProcessing.value = false
    isCancelled.value = false
    currentStep.value = ''
    currentSlide.value = 0
    totalSlides.value = 0
    progress.value = 0
    slideStates.value = []
    isPreviewMode.value = false
    previewIndex.value = 0
    clearLogs()
  }

  /**
   * Download PPTX file (called after preview confirmation)
   * @returns {Promise<boolean>} Success status
   */
  const downloadPptx = async () => {
    const successfulSlides = slideStates.value
      .filter((s) => s.status === 'done')
      .map((s) => pptx.createSlideData(s.cleanImage, s.ocrResults, s.width, s.height))

    if (successfulSlides.length === 0) {
      addLog(t('slideToPptx.logs.noSlidesToDownload'), 'error')
      return false
    }

    addLog(t('slideToPptx.logs.generatingPptx'))

    try {
      // Generate filename based on content
      // 1. Extract first text from first slide
      let title = 'Presentation'
      const firstSlide = slideStates.value.find(s => s.status === 'done')
      
      if (firstSlide && firstSlide.ocrResults && firstSlide.ocrResults.length > 0) {
        const firstText = firstSlide.ocrResults[0].text || ''
        // Sanitize: remove invalid chars, newlines, and extra spaces
        const sanitized = firstText.replace(/[\/\\:*?"<>|]/g, '').replace(/\s+/g, ' ').trim()
        if (sanitized.length > 0) {
          title = sanitized.substring(0, 15)
        }
      }

      // 2. Add timestamp (YYYYMMDD-HHMMSS)
      const now = new Date()
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '')
      const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '')
      const filename = `${title}-${dateStr}-${timeStr}.pptx`

      await pptx.downloadPptx(successfulSlides, {
        ratio: settings.slideRatio,
        title: title, // Metadata title
      }, filename) // Actual filename

      addLog(t('slideToPptx.logs.downloadComplete'), 'success')
      isPreviewMode.value = false
      return true
    } catch (error) {
      addLog(t('slideToPptx.logs.pptxGenerationFailed', { error: error.message }), 'error')
      return false
    }
  }

  /**
   * Close preview mode without downloading
   */
  const closePreview = () => {
    isPreviewMode.value = false
  }

  /**
   * Initialize slide states for per-page settings (call after images are loaded)
   * @param {number} count - Number of slides
   */
  const initSlideStates = (count) => {
    // Only initialize if not already done or count changed
    if (slideStates.value.length !== count) {
      slideStates.value = Array.from({ length: count }, () => ({
        status: 'pending',
        ocrResults: [],
        regions: [],
        rawRegions: [],
        cachedImageUrl: null,
        cachedOcrEngine: null,
        mask: null,
        cleanImage: null,
        originalImage: null,
        width: 0,
        height: 0,
        error: null,
        overrideSettings: null,
        isRegionsEdited: false,
        editedRawRegions: null,
      }))
    }
  }

  /**
   * Set override settings for a specific slide
   * @param {number} index - Slide index
   * @param {Object|null} overrideSettings - Settings to override (null to use global)
   */
  const setSlideSettings = (index, overrideSettings) => {
    // Initialize if needed
    if (!slideStates.value[index]) {
      return
    }
    // Create a new object to ensure Vue detects the change
    slideStates.value[index] = {
      ...slideStates.value[index],
      overrideSettings,
    }
  }

  // ============================================================================
  // Region Editing Methods
  // ============================================================================

  /**
   * Get the current editable regions for a slide
   * Returns editedRawRegions if edited, otherwise rawRegions
   * @param {number} index - Slide index
   * @returns {Array} - Current regions
   */
  const getEditableRegions = (index) => {
    const state = slideStates.value[index]
    if (!state) return []
    return state.editedRawRegions || state.rawRegions || []
  }

  /**
   * Delete a region from a slide
   * @param {number} slideIndex - Slide index
   * @param {number} regionIndex - Region index to delete
   */
  const deleteRegion = (slideIndex, regionIndex) => {
    const state = slideStates.value[slideIndex]
    if (!state) return

    // Create edited regions array if not exists
    const currentRegions = state.editedRawRegions || [...state.rawRegions]
    if (regionIndex < 0 || regionIndex >= currentRegions.length) return

    // Remove the region
    const newRegions = currentRegions.filter((_, i) => i !== regionIndex)

    // Update state
    slideStates.value[slideIndex] = {
      ...state,
      editedRawRegions: newRegions,
      isRegionsEdited: true,
    }

    addLog(t('slideToPptx.logs.regionDeleted', { slide: slideIndex + 1 }), 'info')
  }

  /**
   * Add a manually drawn region to a slide
   * @param {number} slideIndex - Slide index
   * @param {Object} bounds - Region bounds { x, y, width, height }
   * @param {string} [text] - Optional text content
   */
  const addManualRegion = (slideIndex, bounds, text = '') => {
    const state = slideStates.value[slideIndex]
    if (!state) return

    // Create edited regions array if not exists
    const currentRegions = state.editedRawRegions || [...state.rawRegions]

    // Create manual region object
    const manualRegion = {
      text: text || '',
      confidence: 100,
      bounds: {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      },
      polygon: [
        [bounds.x, bounds.y],
        [bounds.x + bounds.width, bounds.y],
        [bounds.x + bounds.width, bounds.y + bounds.height],
        [bounds.x, bounds.y + bounds.height],
      ],
      recognitionFailed: false,
      recognitionSource: 'manual',
    }

    // Add to regions
    const newRegions = [...currentRegions, manualRegion]

    // Update state
    slideStates.value[slideIndex] = {
      ...state,
      editedRawRegions: newRegions,
      isRegionsEdited: true,
    }

    addLog(t('slideToPptx.logs.regionAdded', { slide: slideIndex + 1 }), 'info')
  }

  /**
   * Reset regions to original OCR results
   * @param {number} slideIndex - Slide index
   */
  const resetRegions = (slideIndex) => {
    const state = slideStates.value[slideIndex]
    if (!state) return

    // Clear edited regions
    slideStates.value[slideIndex] = {
      ...state,
      editedRawRegions: null,
      isRegionsEdited: false,
    }

    addLog(t('slideToPptx.logs.regionsReset', { slide: slideIndex + 1 }), 'info')
  }

  /**
   * Resize a region's bounds
   * @param {number} slideIndex - Slide index
   * @param {number} regionIndex - Region index to resize
   * @param {Object} newBounds - New bounds { x, y, width, height }
   */
  const resizeRegion = (slideIndex, regionIndex, newBounds) => {
    const state = slideStates.value[slideIndex]
    if (!state) return

    // Get current regions (edited or original)
    const currentRegions = state.editedRawRegions || state.rawRegions || []
    if (regionIndex < 0 || regionIndex >= currentRegions.length) return

    // Create updated region with new bounds
    const updatedRegion = {
      ...currentRegions[regionIndex],
      bounds: { ...newBounds },
      polygon: [
        [newBounds.x, newBounds.y],
        [newBounds.x + newBounds.width, newBounds.y],
        [newBounds.x + newBounds.width, newBounds.y + newBounds.height],
        [newBounds.x, newBounds.y + newBounds.height],
      ],
    }

    // Update regions array
    const newRegions = [...currentRegions]
    newRegions[regionIndex] = updatedRegion

    // Update state
    slideStates.value[slideIndex] = {
      ...state,
      editedRawRegions: newRegions,
      isRegionsEdited: true,
    }
  }

  /**
   * Reprocess a single slide with current (possibly edited) regions
   * Re-runs mask generation and inpainting
   * @param {number} slideIndex - Slide index
   * @returns {Promise<void>}
   */
  const reprocessSlide = async (slideIndex) => {
    const state = slideStates.value[slideIndex]
    if (!state || !state.originalImage) {
      throw new Error('Slide not processed yet')
    }

    const effectiveSettings = getEffectiveSettings(slideIndex)

    // Use edited regions if available, otherwise original
    const regionsToUse = state.editedRawRegions || state.rawRegions

    addLog(t('slideToPptx.logs.reprocessingSlide', { slide: slideIndex + 1 }), 'info')

    try {
      // Re-merge for PPTX export
      const mergedRegions = mergeTextRegions(regionsToUse)
      state.regions = mergedRegions
      state.ocrResults = mergedRegions

      // Re-generate mask
      addLog(t('slideToPptx.logs.generatingMask', { slide: slideIndex + 1 }))
      state.mask = ocr.generateMask(state.width, state.height, regionsToUse, effectiveSettings.maskPadding)

      // Re-load original image data for inpainting
      const { imageData } = await loadImage(state.originalImage)

      // Re-inpaint
      addLog(t('slideToPptx.logs.removingText', { slide: slideIndex + 1, method: effectiveSettings.inpaintMethod }))

      if (effectiveSettings.inpaintMethod === 'opencv') {
        const inpaintedData = await inpainting.inpaint(imageData, state.mask, {
          algorithm: effectiveSettings.opencvAlgorithm,
          radius: effectiveSettings.inpaintRadius,
          dilateMask: true,
          dilateIterations: Math.ceil(effectiveSettings.maskPadding / 2),
        })
        state.cleanImage = inpainting.imageDataToDataUrl(inpaintedData)
      } else {
        // Gemini API method with fallback to OpenCV
        try {
          state.cleanImage = await removeTextWithGeminiWithSettings(state.originalImage, state.regions, effectiveSettings)
        } catch (geminiError) {
          addLog(t('slideToPptx.logs.geminiFailed', { slide: slideIndex + 1, error: geminiError.message }), 'warning')
          const inpaintedData = await inpainting.inpaint(imageData, state.mask, {
            algorithm: 'NS',
            radius: effectiveSettings.inpaintRadius || 3,
            dilateMask: true,
            dilateIterations: Math.ceil((effectiveSettings.maskPadding || 5) / 2),
          })
          state.cleanImage = inpainting.imageDataToDataUrl(inpaintedData)
        }
      }

      addLog(t('slideToPptx.logs.reprocessingComplete', { slide: slideIndex + 1 }), 'success')

      // Trigger reactivity update
      slideStates.value[slideIndex] = { ...state }
    } catch (error) {
      addLog(t('slideToPptx.logs.reprocessingFailed', { slide: slideIndex + 1, error: error.message }), 'error')
      throw error
    }
  }

  /**
   * Clean up workers
   */
  const cleanup = async () => {
    await ocr.terminate()
    inpainting.terminate()
  }

  // Clean up on unmount
  onUnmounted(() => {
    cleanup()
  })

  return {
    // State
    isProcessing,
    isCancelled,
    currentStep,
    currentSlide,
    totalSlides,
    progress,
    overallProgress,
    logs,
    slideStates,
    settings,

    // Timer state
    elapsedTime,
    formatElapsedTime,

    // Setting mode ('global' | 'per-page')
    settingMode,

    // Preview mode state
    isPreviewMode,
    previewIndex,

    // Sub-composable status
    ocrStatus: ocr.status,
    ocrProgress: ocr.progress,
    inpaintingStatus: inpainting.status,
    pptxStatus: pptx.status,

    // OCR Engine control
    ocrActiveEngine: ocr.activeEngine,
    ocrPreferredEngine: ocr.preferredEngine,
    ocrCanUseWebGPU: ocr.canUseWebGPU,
    ocrIsDetecting: ocr.isDetecting,
    ocrExecutionProvider: ocr.executionProvider,
    setOcrEngine: ocr.setEngine,
    detectOcrCapabilities: ocr.detectCapabilities,

    // Methods
    processAll,
    cancel,
    reset,
    cleanup,
    addLog,
    clearLogs,

    // Preview methods
    downloadPptx,
    closePreview,

    // Per-page settings methods
    initSlideStates,
    setSlideSettings,
    getEffectiveSettings,

    // Region editing methods
    getEditableRegions,
    deleteRegion,
    addManualRegion,
    resetRegions,
    resizeRegion,
    reprocessSlide,
  }
}
