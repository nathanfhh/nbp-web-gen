import { ref, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from '@/composables/useToast'

/**
 * Composable for color picker functionality with magnifier
 * Used in StickerCropper for picking background color from image
 */
export function useColorPicker() {
  const { t } = useI18n()
  const toast = useToast()

  // Color picker state
  const isPickingColor = ref(false)
  const backgroundColor = ref({ r: 0, g: 0, b: 0 })

  // Magnifier state
  const colorPickerMagnifierRef = ref(null)
  const showColorPickerMagnifier = ref(false)
  const colorPickerMagnifierPos = ref({ x: 0, y: 0 })
  const colorPickerMagnifierCanvasPos = ref({ x: 0, y: 0 })

  /**
   * Calculate position in preview image coordinates
   * @param {Event} e - Mouse or touch event
   * @param {HTMLElement} container - Preview container element
   * @param {HTMLImageElement|null} originalImage - Original image
   * @returns {Object|null} Position info or null if invalid
   */
  const getPreviewImagePosition = (e, container, originalImage) => {
    const imgWidth = originalImage?.width || 0
    const imgHeight = originalImage?.height || 0

    if (!container || imgWidth === 0 || imgHeight === 0) {
      return null
    }

    const containerRect = container.getBoundingClientRect()
    if (containerRect.width === 0 || containerRect.height === 0) {
      return null
    }

    // Calculate how the image is displayed (centered, maintaining aspect ratio)
    const containerAspect = containerRect.width / containerRect.height
    const imageAspect = imgWidth / imgHeight

    let displayWidth, displayHeight, offsetX, offsetY

    if (imageAspect > containerAspect) {
      displayWidth = containerRect.width
      displayHeight = containerRect.width / imageAspect
      offsetX = 0
      offsetY = (containerRect.height - displayHeight) / 2
    } else {
      displayHeight = containerRect.height
      displayWidth = containerRect.height * imageAspect
      offsetX = (containerRect.width - displayWidth) / 2
      offsetY = 0
    }

    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY

    const clickX = clientX - containerRect.left - offsetX
    const clickY = clientY - containerRect.top - offsetY

    // Check if within image bounds
    if (clickX < 0 || clickX > displayWidth || clickY < 0 || clickY > displayHeight) {
      return null
    }

    const x = Math.floor((clickX / displayWidth) * imgWidth)
    const y = Math.floor((clickY / displayHeight) * imgHeight)

    return {
      x: Math.max(0, Math.min(imgWidth - 1, x)),
      y: Math.max(0, Math.min(imgHeight - 1, y)),
      clientX,
      clientY,
      imgWidth,
      imgHeight,
    }
  }

  /**
   * Handle pointer down on preview (start magnifier)
   */
  const handleColorPickerPointerDown = (e, sourceCanvas, container, originalImage) => {
    if (!isPickingColor.value || !sourceCanvas || !originalImage) return

    const pos = getPreviewImagePosition(e, container, originalImage)
    if (!pos) {
      toast.warning(t('stickerCropper.toast.waitLoading'))
      return
    }

    colorPickerMagnifierCanvasPos.value = { x: pos.x, y: pos.y, imgWidth: pos.imgWidth, imgHeight: pos.imgHeight }
    colorPickerMagnifierPos.value = {
      x: pos.clientX,
      y: pos.clientY - 80,
    }
    showColorPickerMagnifier.value = true

    nextTick(() => {
      updateColorPickerMagnifier(sourceCanvas)
    })

    e.preventDefault()
  }

  /**
   * Handle pointer move on preview (update magnifier)
   */
  const handleColorPickerPointerMove = (e, sourceCanvas, container, originalImage) => {
    if (!showColorPickerMagnifier.value || !isPickingColor.value) return

    const pos = getPreviewImagePosition(e, container, originalImage)
    if (!pos) return

    colorPickerMagnifierCanvasPos.value = { x: pos.x, y: pos.y, imgWidth: pos.imgWidth, imgHeight: pos.imgHeight }
    colorPickerMagnifierPos.value = {
      x: pos.clientX,
      y: pos.clientY - 80,
    }

    updateColorPickerMagnifier(sourceCanvas)
    e.preventDefault()
  }

  /**
   * Handle pointer up on preview (pick color)
   */
  const handleColorPickerPointerUp = (e, sourceCanvas, container, originalImage) => {
    if (!showColorPickerMagnifier.value) return

    showColorPickerMagnifier.value = false

    const eventObj = e.changedTouches ? e.changedTouches[0] : e
    const pos = getPreviewImagePosition(eventObj, container, originalImage)
    if (!pos) {
      toast.warning(t('stickerCropper.toast.clickImage'))
      return
    }

    // Pick color at position
    const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true })
    const imageData = ctx.getImageData(pos.x, pos.y, 1, 1)

    backgroundColor.value = {
      r: imageData.data[0],
      g: imageData.data[1],
      b: imageData.data[2],
    }

    isPickingColor.value = false
    toast.success(t('stickerCropper.toast.colorPicked'))
  }

  /**
   * Update magnifier canvas content
   */
  const updateColorPickerMagnifier = (sourceCanvas) => {
    if (!colorPickerMagnifierRef.value || !sourceCanvas) return

    const magCanvas = colorPickerMagnifierRef.value
    const magCtx = magCanvas.getContext('2d')

    const size = 100
    const zoom = 4
    const srcSize = size / zoom

    magCanvas.width = size
    magCanvas.height = size

    // Clear with checkerboard
    magCtx.fillStyle = '#1a1a1f'
    magCtx.fillRect(0, 0, size, size)
    for (let i = 0; i < size; i += 10) {
      for (let j = 0; j < size; j += 10) {
        if ((i + j) % 20 === 0) {
          magCtx.fillStyle = '#252530'
          magCtx.fillRect(i, j, 10, 10)
        }
      }
    }

    // Draw zoomed portion
    const srcX = colorPickerMagnifierCanvasPos.value.x - srcSize / 2
    const srcY = colorPickerMagnifierCanvasPos.value.y - srcSize / 2

    magCtx.imageSmoothingEnabled = false
    magCtx.drawImage(
      sourceCanvas,
      srcX, srcY, srcSize, srcSize,
      0, 0, size, size
    )

    // Draw crosshair
    magCtx.strokeStyle = 'rgba(139, 92, 246, 0.8)'
    magCtx.lineWidth = 1
    magCtx.beginPath()
    magCtx.moveTo(size / 2, 0)
    magCtx.lineTo(size / 2, size)
    magCtx.moveTo(0, size / 2)
    magCtx.lineTo(size, size / 2)
    magCtx.stroke()
  }

  /**
   * Handle legacy canvas click (when magnifier isn't active)
   */
  const handleCanvasClick = (e, sourceCanvas, container, originalImage) => {
    if (!isPickingColor.value || !sourceCanvas || !originalImage) return
    if (showColorPickerMagnifier.value) return // Magnifier handles this

    const pos = getPreviewImagePosition(e, container, originalImage)
    if (!pos) {
      toast.warning(t('stickerCropper.toast.clickImage'))
      return
    }

    const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true })
    const imageData = ctx.getImageData(pos.x, pos.y, 1, 1)

    backgroundColor.value = {
      r: imageData.data[0],
      g: imageData.data[1],
      b: imageData.data[2],
    }

    isPickingColor.value = false
    toast.success(t('stickerCropper.toast.colorPicked'))
  }

  /**
   * Detect background color from top-left pixel
   */
  const detectBackgroundColor = (originalImage, sourceCanvas) => {
    if (!originalImage || !sourceCanvas) return

    const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true })

    sourceCanvas.width = originalImage.width
    sourceCanvas.height = originalImage.height
    ctx.drawImage(originalImage, 0, 0)

    // Get top-left pixel color
    const imageData = ctx.getImageData(0, 0, 1, 1)
    backgroundColor.value = {
      r: imageData.data[0],
      g: imageData.data[1],
      b: imageData.data[2],
    }
  }

  /**
   * Reset color picker state
   */
  const resetColorPicker = () => {
    isPickingColor.value = false
    showColorPickerMagnifier.value = false
  }

  return {
    // State
    isPickingColor,
    backgroundColor,

    // Magnifier state
    colorPickerMagnifierRef,
    showColorPickerMagnifier,
    colorPickerMagnifierPos,

    // Methods
    detectBackgroundColor,
    resetColorPicker,

    // Event handlers
    handleColorPickerPointerDown,
    handleColorPickerPointerMove,
    handleColorPickerPointerUp,
    handleCanvasClick,
  }
}
