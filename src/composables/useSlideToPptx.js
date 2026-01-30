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

import { ref, reactive, computed, onUnmounted, watch } from 'vue'
import { GoogleGenAI, Modality } from '@google/genai'
import { useOcr } from './useOcr'
import { useInpaintingWorker } from './useInpaintingWorker'
import { usePptxExport } from './usePptxExport'
import { useApiKeyManager, isQuotaError } from './useApiKeyManager'
import { getSettings as getOcrSettings } from './useOcrSettings'
import { mergeTextRegions } from '@/utils/ocr-core'
import { t } from '@/i18n'

// Translate OCR status messages (format: "ocr:key" or "ocr:key:param1:param2")
const translateOcrMessage = (message) => {
  if (!message || !message.startsWith('ocr:')) return message

  const parts = message.split(':')
  const key = parts[1]

  const keyMap = {
    loadingModelsFromCache: 'slideToPptx.logs.loadingModelsFromCache',
    downloadingModels: 'slideToPptx.logs.downloadingModels',
    loadingDetModel: 'slideToPptx.logs.loadingDetModel',
    loadingRecModel: 'slideToPptx.logs.loadingRecModel',
    loadingDict: 'slideToPptx.logs.loadingDict',
    downloadingDetModel: 'slideToPptx.logs.downloadingDetModel',
    downloadingRecModel: 'slideToPptx.logs.downloadingRecModel',
  }

  const i18nKey = keyMap[key]
  if (!i18nKey) return message

  // Parse parameters based on key
  if (key === 'downloadingModels' && parts[2]) {
    return t(i18nKey, { count: parts[2] })
  }
  if ((key === 'downloadingDetModel' || key === 'downloadingRecModel') && parts[2] && parts[3]) {
    return t(i18nKey, { current: parts[2], total: parts[3] })
  }

  return t(i18nKey)
}

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
 * @property {Object|null} cachedOcrSettings - Cached OCR settings for cache invalidation
 * @property {ImageData} mask - Generated mask
 * @property {string} cleanImage - Text-removed image data URL
 * @property {string} originalCleanImage - Original cleanImage from first processing (for reset)
 * @property {boolean} cleanImageIsOriginal - Whether cleanImage is based on original rawRegions (true) or editedRawRegions (false)
 * @property {string|null} regionsSnapshotAtCleanImage - JSON snapshot of regions when cleanImage was generated (for change detection)
 * @property {string} originalImage - Original image data URL (for comparison)
 * @property {number} width - Image width
 * @property {number} height - Image height
 * @property {string} error - Error message if failed
 * @property {Object|null} overrideSettings - Per-page settings override (null = use global)
 * @property {Array|null} editedRawRegions - User-modified regions (null = use original rawRegions)
 * @property {Array} separatorLines - Manual separator lines to prevent region merging
 * @property {Object} editHistory - Undo/redo history for region editing
 * @property {string|null} customInpaintPrompt - User's custom prompt for Gemini inpainting
 * @property {Array} cleanImageHistory - Version history of clean images [{image, timestamp, prompt, isOriginal}]
 * @property {number} activeHistoryIndex - Currently selected version index in cleanImageHistory
 * @property {'opencv'|'gemini'|null} inpaintMethodUsed - Which inpaint method was used for current cleanImage
 */

// Maximum history depth per slide
const MAX_HISTORY_DEPTH = 50

// Maximum clean image versions to keep (1 original + 5 regenerated = 6 total)
const MAX_CLEAN_IMAGE_VERSIONS = 5

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
    inpaintRadius: 1,
    maskPadding: 1,
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
   * Resize image to target dimensions
   * @param {string} dataUrl - Image data URL
   * @param {number} targetWidth - Target width
   * @param {number} targetHeight - Target height
   * @returns {Promise<string>} - Resized image data URL
   */
  const resizeImageToTarget = (dataUrl, targetWidth, targetHeight) => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        // Check if resize is needed
        if (img.width === targetWidth && img.height === targetHeight) {
          resolve(dataUrl)
          return
        }

        // Resize to target dimensions
        const canvas = document.createElement('canvas')
        canvas.width = targetWidth
        canvas.height = targetHeight
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight)
        resolve(canvas.toDataURL('image/png'))
      }
      img.onerror = () => reject(new Error('Failed to load image for resize'))
      img.src = dataUrl
    })
  }

  /**
   * Remove text from image using Gemini API
   * @param {string} imageDataUrl - Image data URL
   * @param {Array} ocrResults - OCR detection results (for context)
   * @param {Object} effectiveSettings - Settings to use (per-page or global)
   * @param {string|null} customPrompt - Custom user prompt to append
   * @param {number} originalWidth - Original image width (for size matching)
   * @param {number} originalHeight - Original image height (for size matching)
   * @returns {Promise<string>} - Clean image data URL (same size as original)
   */
  const removeTextWithGeminiWithSettings = async (imageDataUrl, ocrResults, effectiveSettings, customPrompt = null, originalWidth = 0, originalHeight = 0) => {
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
    let prompt = `Remove ALL text from this slide image completely. The image contains text like: "${textDescriptions}".

IMPORTANT REQUIREMENTS:
1. Remove every piece of text, including titles, subtitles, body text, labels, and captions
2. Fill in the removed text areas with appropriate background content that matches the surrounding area
3. Preserve all non-text elements: images, shapes, icons, charts, graphs, decorative elements
4. Maintain the exact same image dimensions and aspect ratio
5. The result should look like a clean slide background template ready for new text overlay
6. Do NOT add any new text or watermarks

Output: A single clean image with all text removed.`

    // Append custom prompt if provided
    if (customPrompt && customPrompt.trim()) {
      prompt += `\n\nADDITIONAL USER INSTRUCTIONS:\n${customPrompt.trim()}`
    }

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
          const resultDataUrl = `data:${resultMimeType};base64,${part.inlineData.data}`

          // Resize to match original dimensions if needed
          if (originalWidth > 0 && originalHeight > 0) {
            return await resizeImageToTarget(resultDataUrl, originalWidth, originalHeight)
          }
          return resultDataUrl
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
              const resultDataUrl = `data:${resultMimeType};base64,${part.inlineData.data}`

              // Resize to match original dimensions if needed
              if (originalWidth > 0 && originalHeight > 0) {
                return await resizeImageToTarget(resultDataUrl, originalWidth, originalHeight)
              }
              return resultDataUrl
            }
          }
        }
        throw new Error('No image in Gemini response after retry')
      }
      throw error
    }
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
      // Must match: same image URL AND same OCR engine type AND same OCR settings
      const currentEngine = ocr.activeEngine?.value || 'wasm'
      const currentOcrSettings = getOcrSettings()
      const settingsMatch = state.cachedOcrSettings &&
                            JSON.stringify(state.cachedOcrSettings) === JSON.stringify(currentOcrSettings)
      const hasCachedOcr = state.rawRegions?.length > 0 &&
                           state.cachedImageUrl === imageDataUrl &&
                           state.cachedOcrEngine === currentEngine &&
                           settingsMatch

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

        // Cache the image URL, engine type, and settings for future comparisons
        state.cachedImageUrl = imageDataUrl
        state.cachedOcrEngine = currentEngine
        state.cachedOcrSettings = { ...currentOcrSettings }

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

      // Step 4: Inpaint (remove text) + Extract text colors
      currentStep.value = 'inpaint'
      state.status = 'inpaint'
      addLog(t('slideToPptx.logs.removingText', { slide: index + 1, method: effectiveSettings.inpaintMethod }))

      if (effectiveSettings.inpaintMethod === 'opencv') {
        // Pass rawRegions for color extraction during inpaint
        const { imageData: inpaintedData, textColors } = await inpainting.inpaint(
          imageData,
          mask,
          {
            algorithm: effectiveSettings.opencvAlgorithm,
            radius: effectiveSettings.inpaintRadius,
            dilateMask: true,
            dilateIterations: Math.ceil(effectiveSettings.maskPadding / 2),
          },
          state.rawRegions // Pass regions for color extraction
        )

        // Apply extracted colors to rawRegions
        if (textColors && textColors.length === state.rawRegions.length) {
          state.rawRegions.forEach((region, i) => {
            region.textColor = textColors[i]
          })
        }

        // Convert ImageData to data URL
        state.cleanImage = inpainting.imageDataToDataUrl(inpaintedData)
        state.inpaintMethodUsed = 'opencv'
      } else {
        // Gemini API method with fallback to OpenCV
        const modelName = effectiveSettings.geminiModel === '2.0' ? 'Nano Banana (2.0)' : 'Nano Banana Pro (3.0)'
        addLog(t('slideToPptx.logs.usingGeminiModel', { slide: index + 1, model: modelName }))

        // For Gemini method, extract colors separately first
        const textColors = await inpainting.extractColors(imageData, state.rawRegions)
        if (textColors && textColors.length === state.rawRegions.length) {
          state.rawRegions.forEach((region, i) => {
            region.textColor = textColors[i]
          })
        }

        try {
          // Use customInpaintPrompt if available (e.g., from ask_each mode)
          state.cleanImage = await removeTextWithGeminiWithSettings(imageDataUrl, state.regions, effectiveSettings, state.customInpaintPrompt, width, height)
          state.inpaintMethodUsed = 'gemini'
        } catch (geminiError) {
          // Fallback to OpenCV when Gemini fails (RECITATION, quota, etc.)
          addLog(t('slideToPptx.logs.geminiFailed', { slide: index + 1, error: geminiError.message }), 'warning')

          const { imageData: inpaintedData } = await inpainting.inpaint(imageData, mask, {
            algorithm: 'NS', // Use NS algorithm for fallback (better for larger regions)
            radius: effectiveSettings.inpaintRadius || 1,
            dilateMask: true,
            dilateIterations: Math.ceil((effectiveSettings.maskPadding || 1) / 2),
          })
          // Note: colors already extracted above, no need to re-extract

          state.cleanImage = inpainting.imageDataToDataUrl(inpaintedData)
          state.inpaintMethodUsed = 'opencv'
          addLog(t('slideToPptx.logs.opencvFallbackComplete', { slide: index + 1 }), 'success')
        }
      }

      addLog(t('slideToPptx.logs.textRemovalComplete', { slide: index + 1 }), 'success')

      // Save original cleanImage for reset functionality
      state.originalCleanImage = state.cleanImage
      state.cleanImageIsOriginal = true

      // Initialize version history with the original clean image
      state.cleanImageHistory = [{
        image: state.cleanImage,
        timestamp: Date.now(),
        prompt: state.customInpaintPrompt || null,
        isOriginal: true,
      }]
      state.activeHistoryIndex = 0

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
   * @param {Object} options - Processing options
   * @param {Function|null} options.onConfirmGeminiReprocess - Callback when a Gemini-processed slide is about to be reprocessed with Gemini
   *        (slideIndex, state) => Promise<{action: 'regenerate'|'skip', customPrompt?: string}|null>
   * @returns {Promise<boolean>} Success status
   */
  const processAll = async (images, callbacks = {}, options = {}) => {
    if (isProcessing.value) return false

    const { onConfirmGeminiReprocess = null } = options

    isProcessing.value = true
    isCancelled.value = false
    currentSlide.value = 0
    totalSlides.value = images.length
    progress.value = 0
    clearLogs()
    startTimer()

    // Initialize slide states with extended structure
    // IMPORTANT: Preserve existing state for Gemini-processed slides (for confirmation modal)
    slideStates.value = images.map((_, index) => {
      const existingState = slideStates.value[index]

      // Check if this slide was processed at all (need to preserve originalImage for thumbnail)
      // Note: originalImage is set at the start of processSlide, so it exists even if processing failed midway
      const wasProcessed = existingState?.originalImage

      // Check if this slide was processed with Gemini (need to preserve for confirmation modal)
      // If inpaintMethodUsed is 'gemini' AND cleanImage exists, processing was successful
      // (these fields are only set after successful inpaint completion)
      const hasGeminiCleanImage =
        existingState?.inpaintMethodUsed === 'gemini' &&
        existingState?.cleanImage

      return {
        status: 'pending',
        ocrResults: [],
        // Preserve OCR cache to skip re-running OCR when only settings changed
        regions: existingState?.regions || [],
        rawRegions: existingState?.rawRegions || [],
        cachedImageUrl: existingState?.cachedImageUrl || null,
        cachedOcrEngine: existingState?.cachedOcrEngine || null,
        cachedOcrSettings: existingState?.cachedOcrSettings || null,
        // Preserve these for Gemini confirmation modal
        // Use more lenient check: preserve if inpaintMethodUsed is 'gemini'
        mask: hasGeminiCleanImage ? existingState?.mask : null,
        cleanImage: hasGeminiCleanImage ? existingState?.cleanImage : null,
        originalCleanImage: hasGeminiCleanImage ? existingState?.originalCleanImage : null,
        cleanImageIsOriginal: hasGeminiCleanImage ? existingState?.cleanImageIsOriginal : true,
        regionsSnapshotAtCleanImage: hasGeminiCleanImage ? existingState?.regionsSnapshotAtCleanImage : null,
        // ALWAYS preserve originalImage if slide was processed (for thumbnail display)
        originalImage: wasProcessed ? existingState?.originalImage : null,
        width: wasProcessed ? existingState?.width : 0,
        height: wasProcessed ? existingState?.height : 0,
        error: null,
        overrideSettings: existingState?.overrideSettings || null,
        editedRawRegions: existingState?.editedRawRegions || null,
        separatorLines: existingState?.separatorLines || [],
        editHistory: existingState?.editHistory || { undoStack: [], redoStack: [] },
        customInpaintPrompt: existingState?.customInpaintPrompt || null,
        inpaintMethodUsed: existingState?.inpaintMethodUsed || null,
        cleanImageHistory: hasGeminiCleanImage ? existingState?.cleanImageHistory : [],
        activeHistoryIndex: hasGeminiCleanImage ? existingState?.activeHistoryIndex : 0,
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
          addLog(translateOcrMessage(message))
          hasLoggedModelStatus = true
        }
      })

      // Log OCR engine info with model size
      const engineType = ocr.activeEngine?.value === 'webgpu' ? 'Main Thread' : 'Worker'
      const provider = ocr.executionProvider?.value || 'wasm'
      const modelSize = getOcrSettings().modelSize || 'server'
      const modelLabel = t(`ocrSettings.modelSize.${modelSize}.label`)
      addLog(t('slideToPptx.logs.ocrEngine', { engine: `${engineType} + ${provider.toUpperCase()} (PaddleOCR ${modelLabel})` }), 'info')

      addLog(t('slideToPptx.logs.initializingInpainting'))
      await inpainting.initialize()

      // Process each slide
      // Track "apply to remaining" decision from user
      let applyToRemainingAction = null // null | 'regenerate' | 'skip'

      for (let i = 0; i < images.length; i++) {
        if (isCancelled.value) break

        const state = slideStates.value[i]
        const effectiveSettings = getEffectiveSettings(i)

        // Check if this slide was processed with Gemini AND we're about to use Gemini again
        // Only then do we need to ask the user (because it costs money)
        if (
          state.inpaintMethodUsed === 'gemini' &&
          effectiveSettings.inpaintMethod === 'gemini' &&
          state.cleanImage &&
          onConfirmGeminiReprocess
        ) {
          let decision

          // If user previously chose "apply to remaining", use that decision
          if (applyToRemainingAction) {
            decision = { action: applyToRemainingAction }
          } else {
            decision = await onConfirmGeminiReprocess(i, state)

            if (!decision) {
              // User cancelled - treat as cancel all
              isCancelled.value = true
              break
            }

            // Check if user wants to apply this decision to remaining slides
            if (decision.applyToRemaining) {
              applyToRemainingAction = decision.action
            }
          }

          if (decision.action === 'skip') {
            // Keep existing cleanImage, mark as done
            slideStates.value[i] = {
              ...state,
              status: 'done',
            }
            addLog(t('slideToPptx.logs.keepingExisting', { slide: i + 1 }), 'info')
            continue
          }

          // User chose regenerate - save custom prompt if provided (only from actual modal, not auto-applied)
          if (decision.customPrompt) {
            slideStates.value[i].customInpaintPrompt = decision.customPrompt
          }
        }

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
      // Generate filename and metadata based on content
      // 1. Extract topmost text from first slide (by y-coordinate)
      let title = 'Presentation'
      const firstSlide = slideStates.value.find(s => s.status === 'done')

      if (firstSlide && firstSlide.ocrResults && firstSlide.ocrResults.length > 0) {
        // Sort by y-coordinate to find topmost text region
        const sortedResults = [...firstSlide.ocrResults].sort((a, b) => {
          const aY = a.bounds?.y ?? Infinity
          const bY = b.bounds?.y ?? Infinity
          return aY - bY
        })
        const topmostText = sortedResults[0]?.text || ''
        // Sanitize: remove invalid chars, newlines, and extra spaces
        const sanitized = topmostText.replace(/[/\\:*?"<>|]/g, '').replace(/\s+/g, ' ').trim()
        if (sanitized.length > 0) {
          // Take first 20 chars, add ellipsis if truncated
          title = sanitized.length > 20 ? sanitized.substring(0, 20) + '...' : sanitized
        }
      }

      // 2. Build author/company with version
      const version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'unknown'
      const author = `Mediator v${version}`

      // 3. Generate filename with timestamp (YYYYMMDD-HHMMSS)
      // Use shorter title (15 chars) for filename to avoid overly long names
      const filenameTitle = title.length > 15 ? title.substring(0, 15) : title.replace(/\.\.\.$/, '')
      const now = new Date()
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '')
      const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '')
      const filename = `${filenameTitle}-${dateStr}-${timeStr}.pptx`

      await pptx.downloadPptx(successfulSlides, {
        ratio: settings.slideRatio,
        title: title, // Metadata title (up to 20 chars + ...)
        author: author, // Metadata author
        company: author, // Metadata company (same as author)
      }, filename) // Actual filename (shorter)

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
        cachedOcrSettings: null,
        mask: null,
        cleanImage: null,
        originalCleanImage: null,
        cleanImageIsOriginal: true,
        regionsSnapshotAtCleanImage: null,
        originalImage: null,
        width: 0,
        height: 0,
        error: null,
        overrideSettings: null,
        editedRawRegions: null,
        separatorLines: [],
        editHistory: { undoStack: [], redoStack: [] },
        customInpaintPrompt: null,
        // Clean image version history (for user to pick preferred version)
        // Format: [{ image: dataUrl, timestamp: number, prompt: string|null, isOriginal: boolean }]
        // First entry is always the original (from initial processing), subsequent entries are regenerated versions (FIFO, max 5)
        cleanImageHistory: [],
        activeHistoryIndex: 0, // Currently selected version in history
        // Track which inpaint method was used (for reprocess strategy detection)
        inpaintMethodUsed: null,
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
  // Polygon Mode Helpers
  // ============================================================================

  /**
   * Convert a 4-point polygon to an axis-aligned bounding box
   * @param {Array<Array<number>>} polygon - [[x,y], [x,y], [x,y], [x,y]]
   * @returns {{x: number, y: number, width: number, height: number}}
   */
  const polygonToBounds = (polygon) => {
    const xs = polygon.map(p => p[0])
    const ys = polygon.map(p => p[1])
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    return {
      x: minX,
      y: minY,
      width: Math.max(...xs) - minX,
      height: Math.max(...ys) - minY,
    }
  }

  /**
   * Convert bounds to a rectangular 4-point polygon
   * @param {{x: number, y: number, width: number, height: number}} bounds
   * @returns {Array<Array<number>>} [[x,y], ...] in order: nw, ne, se, sw
   */
  const boundsToPolygon = (bounds) => {
    return [
      [bounds.x, bounds.y],
      [bounds.x + bounds.width, bounds.y],
      [bounds.x + bounds.width, bounds.y + bounds.height],
      [bounds.x, bounds.y + bounds.height],
    ]
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

    // Push to history before making changes
    pushEditHistory(slideIndex)

    // Remove the region
    const newRegions = currentRegions.filter((_, i) => i !== regionIndex)

    // Update state
    slideStates.value[slideIndex] = {
      ...state,
      editedRawRegions: newRegions,
    }

    addLog(t('slideToPptx.logs.regionDeleted', { slide: slideIndex + 1 }), 'info')
  }

  /**
   * Delete multiple regions from a slide (batch delete)
   * @param {number} slideIndex - Slide index
   * @param {number[]} regionIndices - Array of region indices to delete
   */
  const deleteRegionsBatch = (slideIndex, regionIndices) => {
    const state = slideStates.value[slideIndex]
    if (!state || !regionIndices.length) return

    // Create edited regions array if not exists
    const currentRegions = state.editedRawRegions || [...state.rawRegions]

    // Validate all indices
    const validIndices = regionIndices.filter(i => i >= 0 && i < currentRegions.length)
    if (!validIndices.length) return

    // Push to history before making changes (single snapshot for all deletions)
    pushEditHistory(slideIndex)

    // Remove regions using Set for O(1) lookup (order doesn't matter with filter approach)
    const indicesToRemove = new Set(validIndices)
    const newRegions = currentRegions.filter((_, i) => !indicesToRemove.has(i))

    // Update state
    slideStates.value[slideIndex] = {
      ...state,
      editedRawRegions: newRegions,
    }

    addLog(t('slideToPptx.logs.regionsBatchDeleted', { count: validIndices.length, slide: slideIndex + 1 }), 'info')
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

    // Push to history before making changes
    pushEditHistory(slideIndex)

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
      isPolygonMode: false,
    }

    // Add to regions
    const newRegions = [...currentRegions, manualRegion]

    // Update state
    slideStates.value[slideIndex] = {
      ...state,
      editedRawRegions: newRegions,
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

    // Clear edited regions, separator lines, and edit history
    // Restore original cleanImage (background based on original rawRegions)
    slideStates.value[slideIndex] = {
      ...state,
      editedRawRegions: null,
      separatorLines: [],
      editHistory: { undoStack: [], redoStack: [] },
      cleanImage: state.originalCleanImage || state.cleanImage,
      cleanImageIsOriginal: true,
      // Reset snapshot to null (original rawRegions state)
      regionsSnapshotAtCleanImage: null,
    }

    // Re-merge with original rawRegions to update display
    remergeMergedRegions(slideIndex)

    addLog(t('slideToPptx.logs.regionsReset', { slide: slideIndex + 1 }), 'info')
  }

  // ============================================================================
  // Edit History Methods (Undo/Redo)
  // ============================================================================

  /**
   * Create a snapshot of the current editable state
   * @param {Object} state - Slide state
   * @returns {Object} Snapshot
   */
  const createEditSnapshot = (state) => {
    return {
      editedRawRegions: state.editedRawRegions
        ? JSON.parse(JSON.stringify(state.editedRawRegions))
        : null,
      separatorLines: state.separatorLines
        ? JSON.parse(JSON.stringify(state.separatorLines))
        : [],
    }
  }

  /**
   * Push current state to undo stack before making changes
   * @param {number} slideIndex - Slide index
   */
  const pushEditHistory = (slideIndex) => {
    const state = slideStates.value[slideIndex]
    if (!state) return

    // Initialize history if not exists
    if (!state.editHistory) {
      state.editHistory = { undoStack: [], redoStack: [] }
    }

    // Create snapshot of current state
    const snapshot = createEditSnapshot(state)

    // Push to undo stack
    state.editHistory.undoStack.push(snapshot)

    // Limit stack size
    if (state.editHistory.undoStack.length > MAX_HISTORY_DEPTH) {
      state.editHistory.undoStack.shift()
    }

    // Clear redo stack (new action invalidates redo history)
    state.editHistory.redoStack = []
  }

  /**
   * Undo the last edit operation
   * @param {number} slideIndex - Slide index
   * @returns {boolean} True if undo was performed
   */
  const undo = (slideIndex) => {
    const state = slideStates.value[slideIndex]
    if (!state || !state.editHistory || state.editHistory.undoStack.length === 0) {
      return false
    }

    // Save current state to redo stack before restoring
    const currentSnapshot = createEditSnapshot(state)
    state.editHistory.redoStack.push(currentSnapshot)

    // Pop from undo stack and restore
    const previousSnapshot = state.editHistory.undoStack.pop()

    // Apply the snapshot (exitEditMode will determine if reprocess is needed based on cleanImageIsOriginal)
    slideStates.value[slideIndex] = {
      ...state,
      editedRawRegions: previousSnapshot.editedRawRegions,
      separatorLines: previousSnapshot.separatorLines,
    }

    // Re-merge to update display
    remergeMergedRegions(slideIndex)

    return true
  }

  /**
   * Redo the last undone operation
   * @param {number} slideIndex - Slide index
   * @returns {boolean} True if redo was performed
   */
  const redo = (slideIndex) => {
    const state = slideStates.value[slideIndex]
    if (!state || !state.editHistory || state.editHistory.redoStack.length === 0) {
      return false
    }

    // Save current state to undo stack before restoring
    const currentSnapshot = createEditSnapshot(state)
    state.editHistory.undoStack.push(currentSnapshot)

    // Pop from redo stack and restore
    const nextSnapshot = state.editHistory.redoStack.pop()

    // Apply the snapshot (exitEditMode will determine if reprocess is needed based on cleanImageIsOriginal)
    slideStates.value[slideIndex] = {
      ...state,
      editedRawRegions: nextSnapshot.editedRawRegions,
      separatorLines: nextSnapshot.separatorLines,
    }

    // Re-merge to update display
    remergeMergedRegions(slideIndex)

    return true
  }

  /**
   * Check if undo is available
   * @param {number} slideIndex - Slide index
   * @returns {boolean}
   */
  const canUndo = (slideIndex) => {
    const state = slideStates.value[slideIndex]
    return state?.editHistory?.undoStack?.length > 0
  }

  /**
   * Check if redo is available
   * @param {number} slideIndex - Slide index
   * @returns {boolean}
   */
  const canRedo = (slideIndex) => {
    const state = slideStates.value[slideIndex]
    return state?.editHistory?.redoStack?.length > 0
  }

  /**
   * Clear edit history for a slide
   * @param {number} slideIndex - Slide index
   */
  const clearEditHistory = (slideIndex) => {
    const state = slideStates.value[slideIndex]
    if (state) {
      state.editHistory = { undoStack: [], redoStack: [] }
    }
  }

  /**
   * Resize a region's bounds (and optionally polygon for polygon mode)
   * @param {number} slideIndex - Slide index
   * @param {number} regionIndex - Region index to resize
   * @param {Object} newBounds - New bounds { x, y, width, height }
   * @param {Array<Array<number>>} [newPolygon] - Optional polygon for polygon mode
   */
  const resizeRegion = (slideIndex, regionIndex, newBounds, newPolygon) => {
    const state = slideStates.value[slideIndex]
    if (!state) return

    // Get current regions (edited or original)
    const currentRegions = state.editedRawRegions || state.rawRegions || []
    if (regionIndex < 0 || regionIndex >= currentRegions.length) return

    // Push to history before making changes
    pushEditHistory(slideIndex)

    // Create updated region with new bounds
    const updatedRegion = {
      ...currentRegions[regionIndex],
      bounds: { ...newBounds },
      polygon: newPolygon || [
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
    }
  }

  // ============================================================================
  // Polygon Mode Methods (Trapezoid)
  // ============================================================================

  /**
   * Toggle polygon (trapezoid) mode for a region
   * When entering: region keeps its polygon but isPolygonMode becomes true
   * When reverting: polygon is reset to match the rectangular bounds
   * @param {number} slideIndex - Slide index
   * @param {number} regionIndex - Region index
   */
  const togglePolygonMode = (slideIndex, regionIndex) => {
    const state = slideStates.value[slideIndex]
    if (!state) return

    const currentRegions = state.editedRawRegions || [...state.rawRegions]
    if (regionIndex < 0 || regionIndex >= currentRegions.length) return

    pushEditHistory(slideIndex)

    const region = currentRegions[regionIndex]
    const newMode = !region.isPolygonMode

    const updatedRegion = { ...region, isPolygonMode: newMode }

    if (!newMode) {
      // Reverting to rectangle: reset polygon to match current bounds
      updatedRegion.polygon = boundsToPolygon(region.bounds)
    }

    const newRegions = [...currentRegions]
    newRegions[regionIndex] = updatedRegion

    slideStates.value[slideIndex] = {
      ...state,
      editedRawRegions: newRegions,
    }

    // Remerge so merged overlay reflects polygon mode change
    remergeMergedRegions(slideIndex)
  }

  /**
   * Move a polygon vertex (update polygon and recalculate bounds)
   * @param {number} slideIndex - Slide index
   * @param {number} regionIndex - Region index
   * @param {Array<Array<number>>} newPolygon - New 4-point polygon
   */
  const moveVertex = (slideIndex, regionIndex, newPolygon) => {
    const state = slideStates.value[slideIndex]
    if (!state) return

    const currentRegions = state.editedRawRegions || [...state.rawRegions]
    if (regionIndex < 0 || regionIndex >= currentRegions.length) return

    pushEditHistory(slideIndex)

    const updatedRegion = {
      ...currentRegions[regionIndex],
      polygon: newPolygon,
      bounds: polygonToBounds(newPolygon),
    }

    const newRegions = [...currentRegions]
    newRegions[regionIndex] = updatedRegion

    slideStates.value[slideIndex] = {
      ...state,
      editedRawRegions: newRegions,
    }

    // Remerge so merged overlay reflects vertex changes
    remergeMergedRegions(slideIndex)
  }

  // ============================================================================
  // Separator Line Methods
  // ============================================================================

  /**
   * Add a separator line to a slide
   * Separator lines can be any angle - they prevent regions whose center-to-center
   * line intersects the separator from being merged together.
   *
   * @param {number} slideIndex - Slide index
   * @param {Object} separator - Separator line data { start: {x, y}, end: {x, y} }
   */
  const addSeparatorLine = (slideIndex, separator) => {
    const state = slideStates.value[slideIndex]
    if (!state) return

    // Push to history before making changes
    pushEditHistory(slideIndex)

    const newSeparator = {
      id: `sep-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      start: separator.start,
      end: separator.end,
    }

    slideStates.value[slideIndex] = {
      ...state,
      separatorLines: [...(state.separatorLines || []), newSeparator],
    }

    // WYSIWYG: Re-merge immediately to reflect separator effect
    remergeMergedRegions(slideIndex)
  }

  /**
   * Delete a separator line from a slide
   * @param {number} slideIndex - Slide index
   * @param {string} separatorId - Separator line ID
   */
  const deleteSeparatorLine = (slideIndex, separatorId) => {
    const state = slideStates.value[slideIndex]
    if (!state) return

    // Push to history before making changes
    pushEditHistory(slideIndex)

    slideStates.value[slideIndex] = {
      ...state,
      separatorLines: (state.separatorLines || []).filter((s) => s.id !== separatorId),
    }

    // WYSIWYG: Re-merge immediately to reflect separator removal
    remergeMergedRegions(slideIndex)
  }

  /**
   * Get separator lines for a slide
   * @param {number} slideIndex - Slide index
   * @returns {Array} Separator lines
   */
  const getSeparatorLines = (slideIndex) => {
    const state = slideStates.value[slideIndex]
    return state?.separatorLines || []
  }

  /**
   * Get current regions snapshot string for comparison
   * @param {number} slideIndex - Slide index
   * @returns {string} JSON string of current regions and separators
   */
  const getCurrentRegionsSnapshot = (slideIndex) => {
    const state = slideStates.value[slideIndex]
    if (!state) return ''

    const regionsToUse = state.editedRawRegions || state.rawRegions || []
    const separatorLines = state.separatorLines || []

    return JSON.stringify({
      regions: regionsToUse,
      separators: separatorLines,
    })
  }

  /**
   * Check if regions have changed since last cleanImage generation
   * @param {number} slideIndex - Slide index
   * @returns {boolean} True if regions have changed
   */
  const hasRegionsChangedSinceCleanImage = (slideIndex) => {
    const state = slideStates.value[slideIndex]
    if (!state) return false

    const currentSnapshot = getCurrentRegionsSnapshot(slideIndex)

    // If cleanImage was generated from original rawRegions (snapshot is null)
    // Compare with "no edits" state
    if (state.regionsSnapshotAtCleanImage === null) {
      // Original state = rawRegions with no separators
      const originalSnapshot = JSON.stringify({
        regions: state.rawRegions || [],
        separators: [],
      })
      return currentSnapshot !== originalSnapshot
    }

    // Compare with recorded snapshot
    return currentSnapshot !== state.regionsSnapshotAtCleanImage
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
    const separatorLines = state.separatorLines || []

    addLog(t('slideToPptx.logs.reprocessingSlide', { slide: slideIndex + 1 }), 'info')

    try {
      // Re-generate mask
      addLog(t('slideToPptx.logs.generatingMask', { slide: slideIndex + 1 }))
      state.mask = ocr.generateMask(state.width, state.height, regionsToUse, effectiveSettings.maskPadding)

      // Re-load original image data for inpainting
      const { imageData } = await loadImage(state.originalImage)

      // Re-inpaint + Re-extract colors
      addLog(t('slideToPptx.logs.removingText', { slide: slideIndex + 1, method: effectiveSettings.inpaintMethod }))

      if (effectiveSettings.inpaintMethod === 'opencv') {
        // Pass regionsToUse for color extraction during inpaint
        const { imageData: inpaintedData, textColors } = await inpainting.inpaint(
          imageData,
          state.mask,
          {
            algorithm: effectiveSettings.opencvAlgorithm,
            radius: effectiveSettings.inpaintRadius,
            dilateMask: true,
            dilateIterations: Math.ceil(effectiveSettings.maskPadding / 2),
          },
          regionsToUse
        )

        // Apply extracted colors to regions
        if (textColors && textColors.length === regionsToUse.length) {
          regionsToUse.forEach((region, i) => {
            region.textColor = textColors[i]
          })
        }

        state.cleanImage = inpainting.imageDataToDataUrl(inpaintedData)
        state.inpaintMethodUsed = 'opencv'
      } else {
        // Gemini API method - extract colors separately first
        const textColors = await inpainting.extractColors(imageData, regionsToUse)
        if (textColors && textColors.length === regionsToUse.length) {
          regionsToUse.forEach((region, i) => {
            region.textColor = textColors[i]
          })
        }

        try {
          // Use regionsToUse (latest edited regions) instead of state.regions (old merged regions)
          // This ensures Gemini prompt matches the mask we generated from regionsToUse
          state.cleanImage = await removeTextWithGeminiWithSettings(state.originalImage, regionsToUse, effectiveSettings, state.customInpaintPrompt, state.width, state.height)
          state.inpaintMethodUsed = 'gemini'
        } catch (geminiError) {
          addLog(t('slideToPptx.logs.geminiFailed', { slide: slideIndex + 1, error: geminiError.message }), 'warning')
          const { imageData: inpaintedData } = await inpainting.inpaint(imageData, state.mask, {
            algorithm: 'NS',
            radius: effectiveSettings.inpaintRadius || 1,
            dilateMask: true,
            dilateIterations: Math.ceil((effectiveSettings.maskPadding || 1) / 2),
          })
          state.cleanImage = inpainting.imageDataToDataUrl(inpaintedData)
          state.inpaintMethodUsed = 'opencv'
        }
      }

      // Mark that cleanImage is now based on edited regions
      state.cleanImageIsOriginal = false

      // Add to version history (FIFO: keep first original + max 5 regenerated)
      if (!state.cleanImageHistory) {
        state.cleanImageHistory = []
      }
      const newVersion = {
        image: state.cleanImage,
        timestamp: Date.now(),
        prompt: state.customInpaintPrompt || null,
        isOriginal: false,
      }
      // If history has more than MAX_CLEAN_IMAGE_VERSIONS non-original entries, remove oldest non-original
      const nonOriginalCount = state.cleanImageHistory.filter(v => !v.isOriginal).length
      if (nonOriginalCount >= MAX_CLEAN_IMAGE_VERSIONS) {
        // Find first non-original and remove it (FIFO)
        const firstNonOriginalIdx = state.cleanImageHistory.findIndex(v => !v.isOriginal)
        if (firstNonOriginalIdx !== -1) {
          state.cleanImageHistory.splice(firstNonOriginalIdx, 1)
        }
      }
      state.cleanImageHistory.push(newVersion)
      // Set active index to the new version
      state.activeHistoryIndex = state.cleanImageHistory.length - 1

      // Record snapshot of regions/separators at cleanImage generation time
      // This is used to detect if regions changed since last generation
      state.regionsSnapshotAtCleanImage = JSON.stringify({
        regions: regionsToUse,
        separators: separatorLines,
      })

      // Re-merge for PPTX export (with separator lines as forced cut boundaries)
      // This happens AFTER color extraction so colors are available for merge logic
      // Pass layout settings from OCR Settings (WYSIWYG - settings apply immediately)
      const currentOcrSettings = getOcrSettings()
      const mergedRegions = mergeTextRegions(regionsToUse, separatorLines, currentOcrSettings)
      state.regions = mergedRegions
      state.ocrResults = mergedRegions

      addLog(t('slideToPptx.logs.reprocessingComplete', { slide: slideIndex + 1 }), 'success')

      // Trigger reactivity update
      slideStates.value[slideIndex] = { ...state }
    } catch (error) {
      addLog(t('slideToPptx.logs.reprocessingFailed', { slide: slideIndex + 1, error: error.message }), 'error')
      throw error
    }
  }

  /**
   * Re-merge regions for a single slide (lightweight, no inpainting)
   * Used for WYSIWYG when layout settings change
   * @param {number} slideIndex - Slide index
   */
  const remergeMergedRegions = (slideIndex) => {
    const state = slideStates.value[slideIndex]
    if (!state || !state.rawRegions || state.rawRegions.length === 0) {
      return // Not processed yet, skip
    }

    // Use edited regions if available, otherwise original
    const regionsToUse = state.editedRawRegions || state.rawRegions
    const separatorLines = state.separatorLines || []

    // Re-merge with current settings
    const currentOcrSettings = getOcrSettings()
    const mergedRegions = mergeTextRegions(regionsToUse, separatorLines, currentOcrSettings)
    state.regions = mergedRegions
    state.ocrResults = mergedRegions

    // Trigger reactivity update
    slideStates.value[slideIndex] = { ...state }
  }

  /**
   * Re-merge all processed slides (WYSIWYG when settings change)
   */
  const remergeAllSlides = () => {
    let remergedCount = 0
    for (let i = 0; i < slideStates.value.length; i++) {
      const state = slideStates.value[i]
      if (state && state.status === 'done' && state.rawRegions?.length > 0) {
        remergeMergedRegions(i)
        remergedCount++
      }
    }
    if (remergedCount > 0) {
      addLog(t('slideToPptx.logs.settingsRemerged', { count: remergedCount }), 'info')
    }
  }

  /**
   * Select a clean image version from history
   * Only switches the display, doesn't affect regions
   * @param {number} slideIndex - Slide index
   * @param {number} versionIndex - Version index in cleanImageHistory
   */
  const selectCleanImageVersion = (slideIndex, versionIndex) => {
    const state = slideStates.value[slideIndex]
    if (!state || !state.cleanImageHistory || versionIndex < 0 || versionIndex >= state.cleanImageHistory.length) {
      return
    }

    const selectedVersion = state.cleanImageHistory[versionIndex]

    // Update active index and cleanImage pointer
    state.activeHistoryIndex = versionIndex
    state.cleanImage = selectedVersion.image
    // Update isOriginal flag based on selected version
    state.cleanImageIsOriginal = selectedVersion.isOriginal

    // Trigger reactivity update
    slideStates.value[slideIndex] = { ...state }
  }

  /**
   * Get clean image history for a slide
   * @param {number} slideIndex - Slide index
   * @returns {Array} Version history array
   */
  const getCleanImageHistory = (slideIndex) => {
    const state = slideStates.value[slideIndex]
    return state?.cleanImageHistory || []
  }

  /**
   * Delete a clean image version from history
   * Cannot delete the original (first) version; at least one version must remain
   * @param {number} slideIndex - Slide index
   * @param {number} versionIndex - Version index to delete
   * @returns {boolean} Whether deletion was successful
   */
  const deleteCleanImageVersion = (slideIndex, versionIndex) => {
    const state = slideStates.value[slideIndex]
    if (!state || !state.cleanImageHistory) {
      return false
    }

    // Cannot delete if only one version or if it's the original
    if (state.cleanImageHistory.length <= 1) {
      return false
    }
    if (state.cleanImageHistory[versionIndex]?.isOriginal) {
      return false
    }

    // Remove the version
    state.cleanImageHistory.splice(versionIndex, 1)

    // Adjust activeHistoryIndex if needed
    if (state.activeHistoryIndex >= state.cleanImageHistory.length) {
      // Was pointing to deleted or beyond, move to last
      state.activeHistoryIndex = state.cleanImageHistory.length - 1
    } else if (state.activeHistoryIndex === versionIndex) {
      // Was pointing to deleted version, stay at same index (now points to next item)
      // But if that puts us at the end, decrement
      if (state.activeHistoryIndex >= state.cleanImageHistory.length) {
        state.activeHistoryIndex = state.cleanImageHistory.length - 1
      }
    } else if (state.activeHistoryIndex > versionIndex) {
      // Was pointing after deleted, decrement
      state.activeHistoryIndex--
    }

    // Update cleanImage to match new activeHistoryIndex
    state.cleanImage = state.cleanImageHistory[state.activeHistoryIndex].image
    state.cleanImageIsOriginal = state.cleanImageHistory[state.activeHistoryIndex].isOriginal

    // Trigger reactivity update
    slideStates.value[slideIndex] = { ...state }
    return true
  }

  /**
   * Clean up workers
   */
  const cleanup = async () => {
    await ocr.terminate()
    inpainting.terminate()
  }

  // Watch for GPU fallback and log notification
  watch(ocr.gpuFallbackOccurred, (occurred) => {
    if (occurred) {
      addLog(t('slideToPptx.logs.gpuMemoryError'), 'warning')
      addLog(t('slideToPptx.logs.gpuFallbackComplete'), 'info')
    }
  })

  // Watch for model size fallback and log notification
  watch(ocr.modelSizeFallbackOccurred, (occurred) => {
    if (occurred) {
      addLog(t('ocrSettings.modelSizeFallback'), 'warning')
    }
  })

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
    ocrGpuFallbackOccurred: ocr.gpuFallbackOccurred,
    ocrModelSizeFallbackOccurred: ocr.modelSizeFallbackOccurred,
    setOcrEngine: ocr.setEngine,
    detectOcrCapabilities: ocr.detectCapabilities,
    clearOcrModelCache: ocr.clearModelCache,

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
    deleteRegionsBatch,
    addManualRegion,
    resetRegions,
    resizeRegion,
    reprocessSlide,

    // Polygon mode methods (trapezoid)
    togglePolygonMode,
    moveVertex,

    // Separator line methods
    addSeparatorLine,
    deleteSeparatorLine,
    getSeparatorLines,

    // Region change detection
    hasRegionsChangedSinceCleanImage,

    // Edit history methods (undo/redo)
    undo,
    redo,
    canUndo,
    canRedo,
    clearEditHistory,

    // WYSIWYG layout re-merge
    remergeMergedRegions,
    remergeAllSlides,

    // Clean image version history
    selectCleanImageVersion,
    getCleanImageHistory,
    deleteCleanImageVersion,
  }
}
