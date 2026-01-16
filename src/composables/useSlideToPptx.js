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
import { useOcrWorker } from './useOcrWorker'
import { useInpaintingWorker } from './useInpaintingWorker'
import { usePptxExport } from './usePptxExport'

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
 * @property {Array} ocrResults - OCR detection results
 * @property {ImageData} mask - Generated mask
 * @property {string} cleanImage - Text-removed image data URL
 * @property {string} error - Error message if failed
 */

/**
 * @returns {Object} Slide to PPTX composable
 */
export function useSlideToPptx() {
  // Sub-composables
  const ocr = useOcrWorker()
  const inpainting = useInpaintingWorker()
  const pptx = usePptxExport()

  // State
  const isProcessing = ref(false)
  const isCancelled = ref(false)
  const currentStep = ref('') // 'ocr' | 'mask' | 'inpaint' | 'pptx'
  const currentSlide = ref(0)
  const totalSlides = ref(0)
  const progress = ref(0)
  const logs = ref([])

  // Settings
  const settings = reactive({
    inpaintMethod: 'opencv',
    opencvAlgorithm: 'TELEA',
    inpaintRadius: 3,
    maskPadding: 5,
    slideRatio: 'auto',
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
   * @returns {Promise<{imageData: ImageData, width: number, height: number}>}
   */
  const loadImage = async (src) => {
    const dataUrl = toDataUrl(src)
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)
        resolve({
          imageData: ctx.getImageData(0, 0, img.width, img.height),
          width: img.width,
          height: img.height,
        })
      }
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = dataUrl
    })
  }

  /**
   * Process a single slide
   * @param {number} index - Slide index
   * @param {string} imageSrc - Image data URL
   * @returns {Promise<SlideProcessingState>}
   */
  const processSlide = async (index, imageSrc) => {
    const state = slideStates.value[index]

    // Convert to data URL once at the start
    const imageDataUrl = toDataUrl(imageSrc)

    if (isCancelled.value) {
      state.status = 'error'
      state.error = 'Cancelled'
      return state
    }

    try {
      // Step 1: Load image
      addLog(`Slide ${index + 1}: Loading image...`)
      const { imageData, width, height } = await loadImage(imageDataUrl)
      state.width = width
      state.height = height

      // Step 2: OCR
      currentStep.value = 'ocr'
      state.status = 'ocr'
      addLog(`Slide ${index + 1}: Running OCR...`)

      const ocrResults = await ocr.recognize(imageDataUrl)
      state.ocrResults = ocrResults
      addLog(`Slide ${index + 1}: Found ${ocrResults.length} text regions`, 'success')

      if (isCancelled.value) {
        state.status = 'error'
        state.error = 'Cancelled'
        return state
      }

      // Step 3: Generate mask
      currentStep.value = 'mask'
      state.status = 'mask'
      addLog(`Slide ${index + 1}: Generating mask...`)

      const mask = ocr.generateMask(width, height, ocrResults, settings.maskPadding)
      state.mask = mask

      if (isCancelled.value) {
        state.status = 'error'
        state.error = 'Cancelled'
        return state
      }

      // Step 4: Inpaint (remove text)
      currentStep.value = 'inpaint'
      state.status = 'inpaint'
      addLog(`Slide ${index + 1}: Removing text (${settings.inpaintMethod})...`)

      if (settings.inpaintMethod === 'opencv') {
        const inpaintedData = await inpainting.inpaint(imageData, mask, {
          algorithm: settings.opencvAlgorithm,
          radius: settings.inpaintRadius,
          dilateMask: true,
          dilateIterations: Math.ceil(settings.maskPadding / 2),
        })

        // Convert ImageData to data URL
        state.cleanImage = inpainting.imageDataToDataUrl(inpaintedData)
      } else {
        // Gemini API method - to be implemented
        // For now, just use the original image
        addLog(`Slide ${index + 1}: Gemini API not yet implemented, using original`, 'warning')
        state.cleanImage = imageDataUrl
      }

      addLog(`Slide ${index + 1}: Text removal complete`, 'success')

      state.status = 'done'
      return state
    } catch (error) {
      state.status = 'error'
      state.error = error.message
      addLog(`Slide ${index + 1}: Error - ${error.message}`, 'error')
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

    // Initialize slide states
    slideStates.value = images.map(() => ({
      status: 'pending',
      ocrResults: [],
      mask: null,
      cleanImage: null,
      width: 0,
      height: 0,
      error: null,
    }))

    addLog(`Starting processing of ${images.length} slides...`)

    try {
      // Initialize workers
      addLog('Initializing OCR engine...')
      await ocr.initialize()

      addLog('Initializing inpainting engine...')
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
        addLog('Processing cancelled', 'warning')
        return false
      }

      // Check if all slides processed successfully
      const successCount = slideStates.value.filter((s) => s.status === 'done').length
      const failCount = slideStates.value.filter((s) => s.status === 'error').length

      if (successCount === 0) {
        addLog('All slides failed to process', 'error')
        return false
      }

      if (failCount > 0) {
        addLog(`${failCount} slides failed, continuing with ${successCount} successful slides`, 'warning')
      }

      // Generate PPTX
      currentStep.value = 'pptx'
      progress.value = 85
      addLog('Generating PPTX file...')

      const successfulSlides = slideStates.value
        .filter((s) => s.status === 'done')
        .map((s) => pptx.createSlideData(s.cleanImage, s.ocrResults, s.width, s.height))

      await pptx.downloadPptx(successfulSlides, {
        ratio: settings.slideRatio,
        title: 'Converted Presentation',
      })

      progress.value = 100
      addLog('PPTX download complete!', 'success')

      if (callbacks.onComplete) {
        callbacks.onComplete(successCount, failCount)
      }

      return true
    } catch (error) {
      addLog(`Processing failed: ${error.message}`, 'error')
      if (callbacks.onError) {
        callbacks.onError(error)
      }
      return false
    } finally {
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
      addLog('Cancellation requested...', 'warning')
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
    clearLogs()
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

    // Sub-composable status
    ocrStatus: ocr.status,
    ocrProgress: ocr.progress,
    inpaintingStatus: inpainting.status,
    pptxStatus: pptx.status,

    // Methods
    processAll,
    cancel,
    reset,
    cleanup,
    addLog,
    clearLogs,
  }
}
