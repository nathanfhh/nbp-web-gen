<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import JSZip from 'jszip'
import { usePdfGenerator } from '@/composables/usePdfGenerator'
import { useToast } from '@/composables/useToast'
import { useAnalytics } from '@/composables/useAnalytics'
import SegmentationWorker from '@/workers/stickerSegmentation.worker.js?worker'

const { t } = useI18n()
const toast = useToast()
const { trackCropStickers, trackDownloadStickers } = useAnalytics()
const pdfGenerator = usePdfGenerator()

// Web Worker for CCL segmentation
let segmentationWorker = null
let rafId = null  // Track rAF for cleanup
let processingContext = null  // Store context for worker callbacks
let isMounted = false  // Guard against callbacks after unmount

// Create worker with handlers set once
const createSegmentationWorker = () => {
  const worker = new SegmentationWorker()

  worker.onerror = (err) => {
    console.error('Segmentation worker error:', err)
    // Always reset processing state on error, even after unmount
    isProcessing.value = false
    processingContext = null
    if (!isMounted) return
    toast.error(t('stickerCropper.toast.processingError'))
  }

  worker.onmessage = (e) => {
    if (!isMounted || !processingContext) return
    const { width, height, ctx, sourceCanvas, previewCanvas, startTime, MIN_DISPLAY_TIME, useWhiteBg } = processingContext
    const { imageData: processedData, regions } = e.data

    // Put processed image data back to canvas
    const newImageData = new ImageData(
      new Uint8ClampedArray(processedData),
      width,
      height
    )
    ctx.putImageData(newImageData, 0, 0)

    // Copy to preview canvas
    const previewCtx = previewCanvas.getContext('2d')
    previewCanvas.width = width
    previewCanvas.height = height
    if (useWhiteBg) {
      previewCtx.fillStyle = '#ffffff'
      previewCtx.fillRect(0, 0, width, height)
    }
    previewCtx.drawImage(sourceCanvas, 0, 0)

    // Crop stickers from regions, then finish processing
    cropStickersFromRegions(sourceCanvas, regions, useWhiteBg, () => {
      // Ensure minimum display time
      const elapsed = Date.now() - startTime
      const remaining = MIN_DISPLAY_TIME - elapsed
      if (remaining > 0) {
        setTimeout(() => {
          if (isMounted) isProcessing.value = false
        }, remaining)
      } else {
        if (isMounted) isProcessing.value = false
      }
      processingContext = null
    })
  }

  return worker
}

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  imageSrc: {
    type: String,
    default: '',
  },
  imageIndex: {
    type: Number,
    default: 0,
  },
  historyId: {
    type: Number,
    default: null,
  },
})

const emit = defineEmits(['update:modelValue', 'close'])

// State
const isVisible = ref(false)
const isClosing = ref(false)
const isProcessing = ref(false)
const isDownloading = ref(false)

// Canvas refs
const sourceCanvasRef = ref(null)
const previewCanvasRef = ref(null)
const previewContainerRef = ref(null)

// Image state
const originalImage = ref(null)
const imageLoaded = ref(false)

// Background removal settings
const tolerance = ref(30)
const backgroundColor = ref({ r: 0, g: 0, b: 0 })
const isPickingColor = ref(false)

// Preview background (for quality check)
const previewBgWhite = ref(false)

// Cropped stickers
const croppedStickers = ref([])
const selectedStickers = ref(new Set())

// Simple preview for sticker (avoid circular import with ImageLightbox)
const previewSticker = ref(null)

// Edit mode state
const editingSticker = ref(null)
const editCanvasRef = ref(null)
const editTolerance = ref(30)
const originalEditImageData = ref(null)
const editHistory = ref([])  // Undo stack
const maxHistorySize = 20
const editPreviewBgWhite = ref(false)  // White background preview in edit mode

// Edit mode magnifier state
const magnifierRef = ref(null)
const showMagnifier = ref(false)
const magnifierPos = ref({ x: 0, y: 0 })
const magnifierCanvasPos = ref({ x: 0, y: 0 })

// Color picker magnifier state
const colorPickerMagnifierRef = ref(null)
const showColorPickerMagnifier = ref(false)
const colorPickerMagnifierPos = ref({ x: 0, y: 0 })
const colorPickerMagnifierCanvasPos = ref({ x: 0, y: 0 })

// Track if we pushed history state (for back gesture handling)
const historyStatePushed = ref(false)

// Handle browser back button / gesture
const handlePopState = (e) => {
  if (props.modelValue && e.state?.stickerCropper !== true) {
    // User pressed back while cropper is open - close it
    close()
  }
}

// Watch for open/close
watch(() => props.modelValue, (newVal) => {
  if (newVal) {
    isVisible.value = true
    isClosing.value = false
    document.body.style.overflow = 'hidden'
    loadImage()

    // Push history state to intercept back gesture/button
    if (!historyStatePushed.value) {
      history.pushState({ stickerCropper: true }, '')
      historyStatePushed.value = true
    }
  } else {
    isClosing.value = true

    // Pop the history state we added (if still there)
    if (historyStatePushed.value) {
      historyStatePushed.value = false
      // Only go back if we're on our pushed state
      if (history.state?.stickerCropper === true) {
        history.back()
      }
    }

    setTimeout(() => {
      isVisible.value = false
      isClosing.value = false
      document.body.style.overflow = ''
      resetState()
    }, 300)
  }
})

// Watch for preview background toggle - regenerate preview URLs
watch(previewBgWhite, (useWhiteBg) => {
  toast.info(useWhiteBg ? t('stickerCropper.toast.whiteBg') : t('stickerCropper.toast.transparentBg'))

  if (croppedStickers.value.length === 0) return

  // Update big preview canvas
  const sourceCanvas = sourceCanvasRef.value
  const previewCanvas = previewCanvasRef.value
  if (sourceCanvas && previewCanvas) {
    const previewCtx = previewCanvas.getContext('2d')
    previewCanvas.width = sourceCanvas.width
    previewCanvas.height = sourceCanvas.height

    if (useWhiteBg) {
      previewCtx.fillStyle = '#ffffff'
      previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height)
    } else {
      previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height)
    }
    previewCtx.drawImage(sourceCanvas, 0, 0)
  }

  // Regenerate previewDataUrl for each sticker
  croppedStickers.value = croppedStickers.value.map(sticker => {
    const stickerPreviewCanvas = document.createElement('canvas')
    stickerPreviewCanvas.width = sticker.width
    stickerPreviewCanvas.height = sticker.height
    const stickerPreviewCtx = stickerPreviewCanvas.getContext('2d')

    if (useWhiteBg) {
      stickerPreviewCtx.fillStyle = '#ffffff'
      stickerPreviewCtx.fillRect(0, 0, sticker.width, sticker.height)
    }

    // Draw from the original transparent canvas
    stickerPreviewCtx.drawImage(sticker.canvas, 0, 0)

    return {
      ...sticker,
      previewDataUrl: stickerPreviewCanvas.toDataURL('image/png'),
    }
  })
})

// Load image when src changes
watch(() => props.imageSrc, () => {
  if (props.modelValue && props.imageSrc) {
    loadImage()
  }
})

const loadImage = () => {
  if (!props.imageSrc) return

  imageLoaded.value = false
  const img = new Image()
  img.crossOrigin = 'anonymous'

  img.onload = () => {
    originalImage.value = img
    imageLoaded.value = true
    // Auto-detect background color from top-left pixel
    detectBackgroundColor()
  }

  img.onerror = () => {
    console.error('Failed to load image')
  }

  img.src = props.imageSrc
}

const detectBackgroundColor = () => {
  if (!originalImage.value || !sourceCanvasRef.value) return

  const canvas = sourceCanvasRef.value
  const ctx = canvas.getContext('2d', { willReadFrequently: true })

  canvas.width = originalImage.value.width
  canvas.height = originalImage.value.height
  ctx.drawImage(originalImage.value, 0, 0)

  // Get top-left pixel color
  const imageData = ctx.getImageData(0, 0, 1, 1)
  backgroundColor.value = {
    r: imageData.data[0],
    g: imageData.data[1],
    b: imageData.data[2],
  }
}

// Calculate position in preview image coordinates
const getPreviewImagePosition = (e) => {
  const canvas = sourceCanvasRef.value
  const container = previewContainerRef.value
  const imgWidth = originalImage.value?.width || 0
  const imgHeight = originalImage.value?.height || 0

  if (!canvas || !container || imgWidth === 0 || imgHeight === 0) {
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

// Color picker magnifier handlers
const handleColorPickerPointerDown = (e) => {
  if (!isPickingColor.value || !sourceCanvasRef.value || !originalImage.value) return

  const pos = getPreviewImagePosition(e)
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
    updateColorPickerMagnifier()
  })

  e.preventDefault()
}

const handleColorPickerPointerMove = (e) => {
  if (!showColorPickerMagnifier.value || !isPickingColor.value) return

  const pos = getPreviewImagePosition(e)
  if (!pos) return

  colorPickerMagnifierCanvasPos.value = { x: pos.x, y: pos.y, imgWidth: pos.imgWidth, imgHeight: pos.imgHeight }
  colorPickerMagnifierPos.value = {
    x: pos.clientX,
    y: pos.clientY - 80,
  }

  updateColorPickerMagnifier()
  e.preventDefault()
}

const handleColorPickerPointerUp = (e) => {
  if (!showColorPickerMagnifier.value) return

  showColorPickerMagnifier.value = false

  const eventObj = e.changedTouches ? e.changedTouches[0] : e
  const pos = getPreviewImagePosition(eventObj)
  if (!pos) {
    toast.warning(t('stickerCropper.toast.clickImage'))
    return
  }

  // Pick color at position
  const canvas = sourceCanvasRef.value
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const imageData = ctx.getImageData(pos.x, pos.y, 1, 1)

  backgroundColor.value = {
    r: imageData.data[0],
    g: imageData.data[1],
    b: imageData.data[2],
  }

  isPickingColor.value = false
  toast.success(t('stickerCropper.toast.colorPicked'))
}

const updateColorPickerMagnifier = () => {
  if (!colorPickerMagnifierRef.value || !sourceCanvasRef.value) return

  const magCanvas = colorPickerMagnifierRef.value
  const magCtx = magCanvas.getContext('2d')
  const srcCanvas = sourceCanvasRef.value

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
    srcCanvas,
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

const handleCanvasClick = (e) => {
  // Legacy click handler - only used when magnifier isn't active
  if (!isPickingColor.value || !sourceCanvasRef.value || !originalImage.value) return
  if (showColorPickerMagnifier.value) return  // Magnifier handles this

  const pos = getPreviewImagePosition(e)
  if (!pos) {
    toast.warning(t('stickerCropper.toast.clickImage'))
    return
  }

  const canvas = sourceCanvasRef.value
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const imageData = ctx.getImageData(pos.x, pos.y, 1, 1)

  backgroundColor.value = {
    r: imageData.data[0],
    g: imageData.data[1],
    b: imageData.data[2],
  }

  isPickingColor.value = false
  toast.success(t('stickerCropper.toast.colorPicked'))
}

const processImage = () => {
  if (!originalImage.value || !sourceCanvasRef.value || !previewCanvasRef.value) return
  if (isProcessing.value) return  // Prevent concurrent processing

  isProcessing.value = true
  croppedStickers.value = []
  selectedStickers.value.clear()

  const startTime = Date.now()
  const MIN_DISPLAY_TIME = 500

  // Use nextTick + rAF to ensure loading overlay paints before Worker starts
  nextTick(() => {
    requestAnimationFrame(() => {
      const sourceCanvas = sourceCanvasRef.value
      const previewCanvas = previewCanvasRef.value
      const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true })

      // Draw original image
      sourceCanvas.width = originalImage.value.width
      sourceCanvas.height = originalImage.value.height
      ctx.drawImage(originalImage.value, 0, 0)

      // Get image data
      const imageData = ctx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height)
      const width = sourceCanvas.width
      const height = sourceCanvas.height

      // Create worker if not exists (handlers are set once at creation)
      if (!segmentationWorker) {
        segmentationWorker = createSegmentationWorker()
      }

      // Store context for worker callback (capture values at invocation time)
      processingContext = {
        width,
        height,
        ctx,
        sourceCanvas,
        previewCanvas,
        startTime,
        MIN_DISPLAY_TIME,
        useWhiteBg: previewBgWhite.value,  // Capture current value for consistency
      }

      // Send to Worker (transferable for zero-copy)
      // Note: Must spread reactive objects for structured clone
      const { r, g, b } = backgroundColor.value
      segmentationWorker.postMessage(
        {
          imageData: imageData.data,
          width,
          height,
          backgroundColor: { r, g, b },
          tolerance: tolerance.value,
          minSize: 20,
        },
        [imageData.data.buffer]
      )
    })
  })
}

const cropStickersFromRegions = (canvas, validRegions, useWhiteBg, onComplete) => {
  if (validRegions.length === 0) {
    if (isMounted) toast.warning(t('stickerCropper.toast.noStickers'))
    onComplete?.()
    processingContext = null  // Clear stale context after callback
    return
  }

  // Process stickers in batches using rAF to avoid blocking UI
  const stickers = []
  let index = 0

  const processNext = () => {
    // Guard against unmounted state
    if (!isMounted) {
      rafId = null
      return
    }

    if (index >= validRegions.length) {
      // All done
      croppedStickers.value = stickers
      stickers.forEach(s => selectedStickers.value.add(s.id))
      toast.success(t('stickerCropper.toast.cropSuccess', { count: stickers.length }))
      trackCropStickers({
        count: stickers.length,
        imageWidth: canvas.width,
        imageHeight: canvas.height,
      })
      rafId = null
      onComplete?.()
      return
    }

    // Process stickers in batches to balance responsiveness vs throughput
    // 2 per frame keeps UI smooth while avoiding excessive rAF overhead
    const STICKERS_PER_FRAME = 2
    for (let i = 0; i < STICKERS_PER_FRAME && index < validRegions.length; i++, index++) {
      const rect = validRegions[index]

      // Original canvas (transparent background)
      const stickerCanvas = document.createElement('canvas')
      stickerCanvas.width = rect.w
      stickerCanvas.height = rect.h
      const stickerCtx = stickerCanvas.getContext('2d')
      stickerCtx.drawImage(canvas, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h)

      // Preview canvas (with optional white background)
      const previewCanvas = document.createElement('canvas')
      previewCanvas.width = rect.w
      previewCanvas.height = rect.h
      const previewCtx = previewCanvas.getContext('2d')
      if (useWhiteBg) {
        previewCtx.fillStyle = '#ffffff'
        previewCtx.fillRect(0, 0, rect.w, rect.h)
      }
      previewCtx.drawImage(canvas, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h)

      stickers.push({
        id: stickers.length,
        canvas: stickerCanvas,
        dataUrl: stickerCanvas.toDataURL('image/png'),
        previewDataUrl: previewCanvas.toDataURL('image/png'),
        width: rect.w,
        height: rect.h,
        rect,
      })
    }

    // Continue next frame
    rafId = requestAnimationFrame(processNext)
  }

  rafId = requestAnimationFrame(processNext)
}

const toggleSelectSticker = (id) => {
  if (selectedStickers.value.has(id)) {
    selectedStickers.value.delete(id)
  } else {
    selectedStickers.value.add(id)
  }
  // Trigger reactivity
  selectedStickers.value = new Set(selectedStickers.value)
}

const selectAllStickers = () => {
  croppedStickers.value.forEach(s => selectedStickers.value.add(s.id))
  selectedStickers.value = new Set(selectedStickers.value)
}

const deselectAllStickers = () => {
  selectedStickers.value.clear()
  selectedStickers.value = new Set(selectedStickers.value)
}

// Simple preview (avoid circular import with ImageLightbox)
const openPreview = (sticker) => {
  previewSticker.value = sticker
}

const closePreview = () => {
  previewSticker.value = null
}

// Edit mode functions
const openEditMode = (sticker) => {
  editingSticker.value = { ...sticker }
  editTolerance.value = 30
  editHistory.value = []  // Clear undo history
  showMagnifier.value = false
  editPreviewBgWhite.value = false  // Reset to transparent preview
  nextTick(() => {
    const canvas = editCanvasRef.value
    if (!canvas) return
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    canvas.width = sticker.width
    canvas.height = sticker.height
    ctx.drawImage(sticker.canvas, 0, 0)
    // Store original for reset
    originalEditImageData.value = ctx.getImageData(0, 0, sticker.width, sticker.height)
  })
}

const closeEditMode = () => {
  editingSticker.value = null
  originalEditImageData.value = null
  editHistory.value = []
  showMagnifier.value = false
  editPreviewBgWhite.value = false
}

const resetEdit = () => {
  if (!editCanvasRef.value || !originalEditImageData.value) return
  const ctx = editCanvasRef.value.getContext('2d')
  ctx.putImageData(originalEditImageData.value, 0, 0)
  editHistory.value = []  // Clear history on reset
}

const undoEdit = () => {
  if (editHistory.value.length === 0 || !editCanvasRef.value) return
  const lastState = editHistory.value.pop()
  const ctx = editCanvasRef.value.getContext('2d')
  ctx.putImageData(lastState, 0, 0)
  // Force reactivity
  editHistory.value = [...editHistory.value]
}

const saveEditState = () => {
  if (!editCanvasRef.value || !editingSticker.value) return
  const ctx = editCanvasRef.value.getContext('2d', { willReadFrequently: true })
  const imageData = ctx.getImageData(0, 0, editingSticker.value.width, editingSticker.value.height)
  editHistory.value.push(imageData)
  // Limit history size
  if (editHistory.value.length > maxHistorySize) {
    editHistory.value.shift()
  }
}

/**
 * Flood fill to remove background from clicked point
 */
const floodFillRemove = (data, width, height, startX, startY, targetColor, tolerance = 30) => {
  const tol = tolerance * 3
  const visited = new Uint8Array(width * height)
  const queue = []

  const matchesTarget = (idx) => {
    // Skip already transparent pixels
    if (data[idx + 3] === 0) return false
    const diff = Math.abs(data[idx] - targetColor.r) +
                 Math.abs(data[idx + 1] - targetColor.g) +
                 Math.abs(data[idx + 2] - targetColor.b)
    return diff <= tol
  }

  const startPos = startY * width + startX
  const startIdx = startPos * 4

  // Check if starting point is valid
  if (!matchesTarget(startIdx)) return 0

  queue.push(startPos)
  visited[startPos] = 1
  let removedCount = 0

  while (queue.length > 0) {
    const pos = queue.shift()
    const x = pos % width
    const y = Math.floor(pos / width)

    // Set to transparent
    data[pos * 4 + 3] = 0
    removedCount++

    // 4-connected neighbors
    const neighbors = [
      { nx: x - 1, ny: y },
      { nx: x + 1, ny: y },
      { nx: x, ny: y - 1 },
      { nx: x, ny: y + 1 },
    ]

    for (const { nx, ny } of neighbors) {
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
      const nPos = ny * width + nx
      if (visited[nPos]) continue
      if (!matchesTarget(nPos * 4)) continue

      visited[nPos] = 1
      queue.push(nPos)
    }
  }

  return removedCount
}

// Calculate canvas position from event
const getCanvasPosition = (e, canvas) => {
  const rect = canvas.getBoundingClientRect()
  const scaleX = editingSticker.value.width / rect.width
  const scaleY = editingSticker.value.height / rect.height

  const clientX = e.touches ? e.touches[0].clientX : e.clientX
  const clientY = e.touches ? e.touches[0].clientY : e.clientY

  const x = Math.floor((clientX - rect.left) * scaleX)
  const y = Math.floor((clientY - rect.top) * scaleY)

  return {
    x: Math.max(0, Math.min(editingSticker.value.width - 1, x)),
    y: Math.max(0, Math.min(editingSticker.value.height - 1, y)),
    clientX,
    clientY,
    rect,
  }
}

// Magnifier handlers (works on both desktop and mobile)
const handleEditPointerDown = (e) => {
  if (!editCanvasRef.value || !editingSticker.value) return

  const pos = getCanvasPosition(e, editCanvasRef.value)
  magnifierCanvasPos.value = { x: pos.x, y: pos.y }

  // Position magnifier above cursor/finger
  magnifierPos.value = {
    x: pos.clientX,
    y: pos.clientY - 80,
  }
  showMagnifier.value = true

  // Update magnifier after it's visible
  nextTick(() => {
    updateMagnifier()
  })

  // Prevent default to avoid text selection
  e.preventDefault()
}

const handleEditPointerMove = (e) => {
  if (!showMagnifier.value || !editCanvasRef.value || !editingSticker.value) return

  const pos = getCanvasPosition(e, editCanvasRef.value)
  magnifierCanvasPos.value = { x: pos.x, y: pos.y }
  magnifierPos.value = {
    x: pos.clientX,
    y: pos.clientY - 80,
  }

  // Update magnifier canvas
  updateMagnifier()

  e.preventDefault()
}

const handleEditPointerUp = (e) => {
  if (!showMagnifier.value) return
  if (!editCanvasRef.value || !editingSticker.value) return

  showMagnifier.value = false

  // Get position from touch or mouse event
  const eventObj = e.changedTouches ? e.changedTouches[0] : e
  const pos = getCanvasPosition(eventObj, editCanvasRef.value)
  performFloodFill(pos.x, pos.y)
}

const updateMagnifier = () => {
  if (!magnifierRef.value || !editCanvasRef.value || !editingSticker.value) return

  const magCanvas = magnifierRef.value
  const magCtx = magCanvas.getContext('2d')
  const srcCanvas = editCanvasRef.value

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
  const srcX = magnifierCanvasPos.value.x - srcSize / 2
  const srcY = magnifierCanvasPos.value.y - srcSize / 2

  magCtx.imageSmoothingEnabled = false
  magCtx.drawImage(
    srcCanvas,
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

const performFloodFill = (x, y) => {
  if (!editCanvasRef.value || !editingSticker.value) return

  const canvas = editCanvasRef.value
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const imageData = ctx.getImageData(0, 0, editingSticker.value.width, editingSticker.value.height)

  // Get clicked pixel color
  const clickedIdx = (y * editingSticker.value.width + x) * 4
  const targetColor = {
    r: imageData.data[clickedIdx],
    g: imageData.data[clickedIdx + 1],
    b: imageData.data[clickedIdx + 2],
  }

  // Check if already transparent
  if (imageData.data[clickedIdx + 3] === 0) {
    toast.info(t('stickerCropper.edit.alreadyTransparent'))
    return
  }

  // Save state before modification for undo
  saveEditState()

  // Perform flood fill
  const removedCount = floodFillRemove(
    imageData.data,
    editingSticker.value.width,
    editingSticker.value.height,
    x,
    y,
    targetColor,
    editTolerance.value
  )

  if (removedCount > 0) {
    ctx.putImageData(imageData, 0, 0)
    toast.success(t('stickerCropper.edit.removed', { count: removedCount }))
  }
}


const applyEdit = () => {
  if (!editCanvasRef.value || !editingSticker.value) return

  const sticker = croppedStickers.value.find(s => s.id === editingSticker.value.id)
  if (!sticker) return

  const editCanvas = editCanvasRef.value

  // Update transparent background dataUrl
  sticker.dataUrl = editCanvas.toDataURL('image/png')

  // Create new canvas for sticker.canvas
  const newCanvas = document.createElement('canvas')
  newCanvas.width = sticker.width
  newCanvas.height = sticker.height
  const newCtx = newCanvas.getContext('2d')
  newCtx.drawImage(editCanvas, 0, 0)
  sticker.canvas = newCanvas

  // Update previewDataUrl based on current preview background setting
  const previewCanvas = document.createElement('canvas')
  previewCanvas.width = sticker.width
  previewCanvas.height = sticker.height
  const previewCtx = previewCanvas.getContext('2d')

  if (previewBgWhite.value) {
    previewCtx.fillStyle = '#ffffff'
    previewCtx.fillRect(0, 0, sticker.width, sticker.height)
  }
  previewCtx.drawImage(editCanvas, 0, 0)
  sticker.previewDataUrl = previewCanvas.toDataURL('image/png')

  toast.success(t('stickerCropper.edit.applied'))
  closeEditMode()
}

const downloadSingleSticker = (sticker) => {
  const link = document.createElement('a')
  link.href = sticker.dataUrl
  link.download = `image-${imagePrefix.value}-sticker-${sticker.id + 1}.png`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  trackDownloadStickers({ count: 1, format: 'single' })
}

const downloadSelectedAsZip = async () => {
  const selected = croppedStickers.value.filter(s => selectedStickers.value.has(s.id))
  if (selected.length === 0) return

  isDownloading.value = true

  try {
    const zip = new JSZip()

    for (const sticker of selected) {
      // Convert data URL to blob
      const response = await fetch(sticker.dataUrl)
      const blob = await response.blob()
      zip.file(`image-${imagePrefix.value}-sticker-${sticker.id + 1}.png`, blob)
    }

    const content = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(content)

    const link = document.createElement('a')
    link.href = url
    link.download = `image-${imagePrefix.value}-stickers.zip`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    URL.revokeObjectURL(url)
    trackDownloadStickers({ count: selected.length, format: 'zip' })
  } catch (err) {
    console.error('ZIP generation failed:', err)
    toast.error(t('stickerCropper.toast.zipError'))
  } finally {
    isDownloading.value = false
  }
}

const downloadSelectedAsPdf = async () => {
  const selected = croppedStickers.value.filter(s => selectedStickers.value.has(s.id))
  if (selected.length === 0) return

  isDownloading.value = true

  try {
    // Prepare image data for worker
    const imageDataArray = []
    for (const sticker of selected) {
      const response = await fetch(sticker.dataUrl)
      const blob = await response.blob()
      const arrayBuffer = await blob.arrayBuffer()
      imageDataArray.push({ data: arrayBuffer, mimeType: 'image/png' })
    }

    await pdfGenerator.generateAndDownload(imageDataArray, `image-${imagePrefix.value}-stickers`)
    trackDownloadStickers({ count: selected.length, format: 'pdf' })
  } catch (err) {
    console.error('PDF generation failed:', err)
    toast.error(t('stickerCropper.toast.pdfError'))
  } finally {
    isDownloading.value = false
  }
}

const close = () => {
  emit('update:modelValue', false)
  emit('close')
}

const resetState = () => {
  imageLoaded.value = false
  originalImage.value = null
  croppedStickers.value = []
  selectedStickers.value.clear()
  tolerance.value = 30
  isPickingColor.value = false
  // Clear preview and edit state
  previewSticker.value = null
  editingSticker.value = null
  originalEditImageData.value = null
  editHistory.value = []
  editPreviewBgWhite.value = false
  showMagnifier.value = false
  showColorPickerMagnifier.value = false
}

// Background color display
const bgColorHex = computed(() => {
  const { r, g, b } = backgroundColor.value
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
})

// Unique identifier for sticker filenames (historyId-imageIndex or just imageIndex+1)
const imagePrefix = computed(() => {
  const imgNum = props.imageIndex + 1
  return props.historyId ? `${props.historyId}-${imgNum}` : `${imgNum}`
})

// Keyboard handling
const handleKeydown = (e) => {
  if (!props.modelValue) return
  if (e.key === 'Escape') {
    e.preventDefault()
    // Close in order: preview -> edit mode -> cropper
    if (previewSticker.value) {
      closePreview()
    } else if (editingSticker.value) {
      closeEditMode()
    } else {
      close()
    }
  }
}

onMounted(() => {
  isMounted = true
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('popstate', handlePopState)
})

onUnmounted(() => {
  isMounted = false
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('popstate', handlePopState)
  document.body.style.overflow = ''

  // Clean up history state if component unmounts while open
  if (historyStatePushed.value && history.state?.stickerCropper === true) {
    history.back()
  }

  // Reset processing state to avoid stuck state
  isProcessing.value = false
  processingContext = null
  // Cancel pending rAF
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  // Terminate worker to free resources
  if (segmentationWorker) {
    segmentationWorker.terminate()
    segmentationWorker = null
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="cropper">
      <div
        v-if="isVisible"
        class="cropper-overlay"
        :class="{ 'is-closing': isClosing }"
      >
        <!-- Header -->
        <div class="cropper-header">
          <h2 class="text-lg font-semibold text-white flex items-center gap-2">
            <svg class="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {{ $t('stickerCropper.title') }}
          </h2>
          <button
            @click="close"
            class="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Main content -->
        <div class="cropper-content">
          <!-- Left: Settings & Preview -->
          <div class="cropper-left">
            <!-- Settings Panel -->
            <div class="settings-panel">
              <h3 class="text-sm font-medium text-gray-300 mb-3">{{ $t('stickerCropper.settings.title') }}</h3>

              <!-- Background Color -->
              <div class="mb-4">
                <label class="block text-xs text-gray-400 mb-2">{{ $t('stickerCropper.settings.bgColor') }}</label>
                <div class="flex items-center gap-2">
                  <div
                    class="w-8 h-8 rounded border border-white/20"
                    :style="{ backgroundColor: bgColorHex }"
                  ></div>
                  <span class="text-sm text-gray-300 font-mono">{{ bgColorHex }}</span>
                  <button
                    @click="isPickingColor = !isPickingColor"
                    class="ml-auto px-3 py-1.5 text-xs rounded-lg transition-colors"
                    :class="isPickingColor
                      ? 'bg-purple-500 text-white'
                      : 'bg-white/10 text-gray-300 hover:bg-white/20'"
                  >
                    {{ isPickingColor ? $t('stickerCropper.settings.pickingColor') : $t('stickerCropper.settings.pickColor') }}
                  </button>
                </div>
              </div>

              <!-- Tolerance -->
              <div class="mb-4">
                <label class="block text-xs text-gray-400 mb-2">
                  {{ $t('stickerCropper.settings.tolerance') }}: <span class="text-purple-400 font-medium">{{ tolerance }}</span>
                </label>
                <input
                  v-model="tolerance"
                  type="range"
                  min="0"
                  max="100"
                  class="w-full accent-purple-500"
                />
                <p class="text-xs text-gray-500 mt-1">{{ $t('stickerCropper.settings.toleranceHint') }}</p>
              </div>

              <!-- Preview Background Toggle -->
              <div class="mb-4 flex items-center justify-between">
                <label class="text-xs text-gray-400">{{ $t('stickerCropper.settings.whiteBgPreview') }}</label>
                <button
                  @click="previewBgWhite = !previewBgWhite"
                  class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
                  :class="previewBgWhite ? 'bg-purple-500' : 'bg-gray-600'"
                >
                  <span
                    class="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
                    :class="previewBgWhite ? 'translate-x-[18px]' : 'translate-x-1'"
                  />
                </button>
              </div>

              <!-- Process Button -->
              <button
                @click="processImage"
                :disabled="!imageLoaded || isProcessing"
                class="w-full py-2.5 px-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2"
                :class="imageLoaded && !isProcessing
                  ? 'bg-purple-500 hover:bg-purple-600 text-white'
                  : 'bg-gray-700 text-gray-400 cursor-not-allowed'"
              >
                <svg v-if="isProcessing" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
                {{ isProcessing ? $t('stickerCropper.buttons.processing') : $t('stickerCropper.buttons.process') }}
              </button>
            </div>

            <!-- Preview Canvas -->
            <div class="preview-panel">
              <h3 class="text-sm font-medium text-gray-300 mb-3">{{ $t('stickerCropper.preview.title') }}</h3>
              <div
                ref="previewContainerRef"
                class="preview-container"
                :class="{ 'cursor-crosshair': isPickingColor, 'bg-white': previewBgWhite }"
                @click="handleCanvasClick"
                @mousedown="handleColorPickerPointerDown"
                @mousemove="handleColorPickerPointerMove"
                @mouseup="handleColorPickerPointerUp"
                @mouseleave="showColorPickerMagnifier = false"
                @touchstart="handleColorPickerPointerDown"
                @touchmove="handleColorPickerPointerMove"
                @touchend="handleColorPickerPointerUp"
              >
                <canvas ref="sourceCanvasRef" class="hidden"></canvas>
                <!-- Only show preview canvas after processing -->
                <canvas
                  v-show="croppedStickers.length > 0"
                  ref="previewCanvasRef"
                  class="preview-canvas"
                  :class="{ 'opacity-50': isProcessing }"
                ></canvas>
                <!-- Show original image before processing -->
                <img
                  v-if="croppedStickers.length === 0 && imageLoaded"
                  :src="imageSrc"
                  class="preview-image"
                  alt="Original"
                />
                <div v-if="!imageLoaded" class="preview-placeholder">
                  <svg class="w-12 h-12 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p class="text-gray-500 text-sm mt-2">{{ $t('stickerCropper.preview.loading') }}</p>
                </div>

                <!-- Color picker magnifier -->
                <div
                  v-show="showColorPickerMagnifier"
                  class="color-picker-magnifier"
                  :style="{
                    left: `${colorPickerMagnifierPos.x}px`,
                    top: `${colorPickerMagnifierPos.y}px`,
                  }"
                >
                  <canvas ref="colorPickerMagnifierRef" width="100" height="100"></canvas>
                </div>
              </div>
            </div>
          </div>

          <!-- Right: Cropped Stickers -->
          <div class="cropper-right">
            <div class="stickers-header">
              <h3 class="text-sm font-medium text-gray-300">
                {{ $t('stickerCropper.results.title') }}
                <span v-if="croppedStickers.length" class="text-purple-400">
                  {{ $t('stickerCropper.results.count', { count: croppedStickers.length }) }}
                </span>
              </h3>
              <div v-if="croppedStickers.length" class="flex items-center gap-2">
                <button
                  @click="selectAllStickers"
                  class="text-xs text-gray-400 hover:text-white transition-colors"
                >
                  {{ $t('stickerCropper.results.selectAll') }}
                </button>
                <span class="text-gray-600">|</span>
                <button
                  @click="deselectAllStickers"
                  class="text-xs text-gray-400 hover:text-white transition-colors"
                >
                  {{ $t('stickerCropper.results.deselectAll') }}
                </button>
              </div>
            </div>

            <!-- Stickers Grid -->
            <div v-if="croppedStickers.length" class="stickers-grid">
              <div
                v-for="sticker in croppedStickers"
                :key="sticker.id"
                class="sticker-card"
                :class="{ 'selected': selectedStickers.has(sticker.id) }"
              >
                <!-- Preview area - click to enlarge -->
                <div class="sticker-preview" @click="openPreview(sticker)">
                  <img :src="sticker.previewDataUrl" :alt="`Sticker ${sticker.id + 1}`" />
                </div>
                <div class="sticker-info">
                  <span class="text-xs text-gray-400">
                    {{ sticker.width }} x {{ sticker.height }}
                  </span>
                  <button
                    @click.stop="downloadSingleSticker(sticker)"
                    class="sticker-download"
                    :title="$t('stickerCropper.results.downloadThis')"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </button>
                </div>
                <!-- Edit button - top left -->
                <button
                  @click.stop="openEditMode(sticker)"
                  class="sticker-edit-btn"
                  :title="$t('stickerCropper.edit.button')"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
                <!-- Checkbox area - click to toggle selection -->
                <div
                  class="sticker-checkbox"
                  @click.stop="toggleSelectSticker(sticker.id)"
                >
                  <svg v-if="selectedStickers.has(sticker.id)" class="w-5 h-5 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                  </svg>
                  <div v-else class="w-5 h-5 rounded-full border-2 border-gray-500"></div>
                </div>
              </div>
            </div>

            <!-- Empty state -->
            <div v-else class="stickers-empty">
              <svg class="w-16 h-16 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p class="text-gray-500 text-sm mt-3">{{ $t('stickerCropper.results.hint') }}</p>
              <p class="text-gray-600 text-xs mt-1">{{ $t('stickerCropper.results.autoDetect') }}</p>
            </div>

            <!-- Download Buttons -->
            <div v-if="croppedStickers.length" class="stickers-actions">
              <button
                @click="downloadSelectedAsZip"
                :disabled="selectedStickers.size === 0 || isDownloading"
                class="download-btn"
                :class="selectedStickers.size > 0 && !isDownloading
                  ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                  : 'bg-gray-700 text-gray-400 cursor-not-allowed'"
              >
                <svg v-if="isDownloading" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
                <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {{ isDownloading ? $t('stickerCropper.buttons.downloading') : $t('stickerCropper.buttons.downloadZip', { count: selectedStickers.size }) }}
              </button>
              <button
                @click="downloadSelectedAsPdf"
                :disabled="selectedStickers.size === 0 || isDownloading"
                class="download-btn"
                :class="selectedStickers.size > 0 && !isDownloading
                  ? 'bg-rose-500 hover:bg-rose-600 text-white'
                  : 'bg-gray-700 text-gray-400 cursor-not-allowed'"
              >
                <svg v-if="isDownloading" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
                <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                {{ isDownloading ? $t('stickerCropper.buttons.downloading') : $t('stickerCropper.buttons.downloadPdf', { count: selectedStickers.size }) }}
              </button>
            </div>
          </div>
        </div>

        <!-- Processing Overlay -->
        <Transition name="fade">
          <div v-if="isProcessing" class="processing-overlay">
            <div class="processing-content">
              <div class="processing-spinner">
                <svg class="w-12 h-12" viewBox="0 0 50 50">
                  <circle
                    class="processing-circle"
                    cx="25"
                    cy="25"
                    r="20"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="4"
                  />
                </svg>
              </div>
              <p class="text-white font-medium mt-4">{{ $t('stickerCropper.overlay.processing') }}</p>
              <p class="text-gray-400 text-sm mt-1">{{ $t('stickerCropper.overlay.hint') }}</p>
            </div>
          </div>
        </Transition>

        <!-- Edit Mode Overlay -->
        <Transition name="fade">
          <div v-if="editingSticker" class="edit-overlay">
            <div class="edit-panel">
              <div class="edit-header">
                <h3 class="text-lg font-semibold text-white flex items-center gap-2">
                  <svg class="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  {{ $t('stickerCropper.edit.title') }}
                </h3>
                <div class="flex items-center gap-2">
                  <!-- White background toggle -->
                  <button
                    @click="editPreviewBgWhite = !editPreviewBgWhite"
                    class="p-2 rounded-lg transition-colors"
                    :class="editPreviewBgWhite ? 'bg-white/20 text-white' : 'hover:bg-white/10 text-gray-400'"
                    :title="$t('stickerCropper.settings.whiteBgPreview')"
                  >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </button>
                  <button
                    @click="closeEditMode"
                    class="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                  >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div class="edit-canvas-container" :class="{ 'edit-canvas-bg-white': editPreviewBgWhite }">
                <canvas
                  ref="editCanvasRef"
                  class="edit-canvas"
                  @mousedown="handleEditPointerDown"
                  @mousemove="handleEditPointerMove"
                  @mouseup="handleEditPointerUp"
                  @mouseleave="showMagnifier = false"
                  @touchstart="handleEditPointerDown"
                  @touchmove="handleEditPointerMove"
                  @touchend="handleEditPointerUp"
                />
              </div>

              <div class="edit-controls">
                <div class="edit-tolerance">
                  <label class="text-xs text-gray-400">
                    {{ $t('stickerCropper.edit.tolerance') }}: <span class="text-purple-400 font-medium">{{ editTolerance }}</span>
                  </label>
                  <input
                    v-model="editTolerance"
                    type="range"
                    min="0"
                    max="100"
                    class="w-full accent-purple-500"
                  />
                </div>
                <p class="edit-hint text-xs text-gray-500">{{ $t('stickerCropper.edit.hint') }}</p>
              </div>

              <div class="edit-actions">
                <button
                  @click="undoEdit"
                  :disabled="editHistory.length === 0"
                  class="edit-btn-icon"
                  :class="editHistory.length > 0 ? 'text-gray-300 hover:bg-white/20' : 'text-gray-600 cursor-not-allowed'"
                  :title="$t('stickerCropper.edit.undo')"
                >
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                </button>
                <button
                  @click="resetEdit"
                  class="edit-btn-secondary"
                >
                  {{ $t('stickerCropper.edit.reset') }}
                </button>
                <button
                  @click="applyEdit"
                  class="edit-btn-primary"
                >
                  {{ $t('stickerCropper.edit.done') }}
                </button>
              </div>
            </div>

            <!-- Magnifier -->
            <div
              v-show="showMagnifier"
              class="edit-magnifier"
              :style="{
                left: `${magnifierPos.x}px`,
                top: `${magnifierPos.y}px`,
              }"
            >
              <canvas ref="magnifierRef" width="100" height="100"></canvas>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>

    <!-- Simple sticker preview overlay -->
    <Transition name="fade">
      <div v-if="previewSticker" class="sticker-lightbox" @click="closePreview">
        <div class="sticker-lightbox-content" @click.stop>
          <button @click="closePreview" class="sticker-lightbox-close">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div class="sticker-lightbox-img-wrap">
            <img :src="previewSticker.previewDataUrl" :alt="`Sticker ${previewSticker.id + 1}`" class="sticker-lightbox-img" />
          </div>
          <div class="sticker-lightbox-info">
            <span class="text-sm text-gray-400">{{ previewSticker.width }} x {{ previewSticker.height }}</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.cropper-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  background: rgba(10, 10, 15, 0.98);
  backdrop-filter: blur(8px);
  animation: cropper-fade-in 0.3s ease-out;
  /* Force light text colors regardless of theme (dark background overlay) */
  color: #e5e7eb;
  overflow: hidden;
}

/* Force all text to be light in cropper (override theme) */
.cropper-overlay :deep(.text-gray-300),
.cropper-overlay .text-gray-300 {
  color: #d1d5db !important;
}

.cropper-overlay :deep(.text-gray-400),
.cropper-overlay .text-gray-400 {
  color: #9ca3af !important;
}

.cropper-overlay :deep(.text-gray-500),
.cropper-overlay .text-gray-500 {
  color: #6b7280 !important;
}

.cropper-overlay :deep(.text-gray-600),
.cropper-overlay .text-gray-600 {
  color: #4b5563 !important;
}

.cropper-overlay :deep(.text-white),
.cropper-overlay .text-white {
  color: #ffffff !important;
}

.cropper-overlay.is-closing {
  animation: cropper-fade-out 0.3s ease-out forwards;
}

@keyframes cropper-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes cropper-fade-out {
  from { opacity: 1; }
  to { opacity: 0; }
}

.cropper-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}

.cropper-content {
  display: flex;
  flex: 1 1 0;
  overflow: auto;
  min-height: 0;
  -webkit-overflow-scrolling: touch;
}

.cropper-left {
  width: 400px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.settings-panel {
  padding: 1.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.preview-panel {
  flex: 1;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.preview-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><rect fill="%231a1a1f" width="20" height="20"/><rect fill="%23252530" width="10" height="10"/><rect fill="%23252530" x="10" y="10" width="10" height="10"/></svg>');
  border-radius: 0.5rem;
  overflow: visible;  /* Allow magnifier to show outside */
  position: relative;
}

/* Color picker magnifier */
.color-picker-magnifier {
  position: fixed;
  transform: translate(-50%, -100%);
  pointer-events: none;
  z-index: 10003;
  border-radius: 50%;
  overflow: hidden;
  border: 3px solid rgba(139, 92, 246, 0.8);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}

.color-picker-magnifier canvas {
  display: block;
  border-radius: 50%;
}

.preview-canvas,
.preview-image {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.preview-placeholder {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.cropper-right {
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  min-height: 0;
  -webkit-overflow-scrolling: touch;
}

.stickers-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}

.stickers-grid {
  flex: 1 1 0;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 1rem;
  padding: 1.5rem;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  align-content: start;
  min-height: 0;
}

.sticker-card {
  width: 140px;
  position: relative;
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid transparent;
  border-radius: 0.75rem;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
}

.sticker-card:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(139, 92, 246, 0.3);
}

.sticker-card.selected {
  border-color: rgba(139, 92, 246, 0.6);
  background: rgba(139, 92, 246, 0.1);
}

.sticker-preview {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem;
  background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><rect fill="%231a1a1f" width="16" height="16"/><rect fill="%23252530" width="8" height="8"/><rect fill="%23252530" x="8" y="8" width="8" height="8"/></svg>');
  cursor: zoom-in;
}

.sticker-preview img {
  max-width: 100%;
  height: auto;
  object-fit: contain;
}

.sticker-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem;
  background: rgba(0, 0, 0, 0.3);
  flex-shrink: 0;
  margin-top: auto;
}

.sticker-download {
  padding: 0.25rem;
  color: #9ca3af;
  transition: color 0.2s;
}

.sticker-download:hover {
  color: #22d3ee;
}

.sticker-checkbox {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  padding: 0.5rem;
  min-width: 44px;
  min-height: 44px;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  cursor: pointer;
}

.sticker-edit-btn {
  position: absolute;
  top: 0.5rem;
  left: 0.5rem;
  padding: 0.375rem;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 0.375rem;
  color: #9ca3af;
  transition: all 0.2s;
  opacity: 0;
}

.sticker-card:hover .sticker-edit-btn {
  opacity: 1;
}

.sticker-edit-btn:hover {
  background: rgba(139, 92, 246, 0.8);
  color: white;
}

.stickers-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.stickers-actions {
  padding: 1rem 1.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
  display: flex;
  gap: 0.5rem;
}

.download-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem 0.5rem;
  border-radius: 0.5rem;
  font-weight: 500;
  font-size: 0.875rem;
  transition: all 0.2s;
}

/* Vue transition */
.cropper-enter-active,
.cropper-leave-active {
  transition: opacity 0.3s ease;
}

.cropper-enter-from,
.cropper-leave-to {
  opacity: 0;
}

/* Fade transition for processing overlay */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Processing overlay */
.processing-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(10, 10, 15, 0.9);
  backdrop-filter: blur(4px);
}

.processing-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.processing-spinner {
  color: #a855f7;
  animation: pulse 2s ease-in-out infinite;
}

.processing-circle {
  stroke-dasharray: 90, 150;
  stroke-dashoffset: 0;
  stroke-linecap: round;
  animation: spin 1.5s linear infinite, dash 1.5s ease-in-out infinite;
  transform-origin: center;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@keyframes dash {
  0% {
    stroke-dasharray: 1, 150;
    stroke-dashoffset: 0;
  }
  50% {
    stroke-dasharray: 90, 150;
    stroke-dashoffset: -35;
  }
  100% {
    stroke-dasharray: 90, 150;
    stroke-dashoffset: -124;
  }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

/* Small screens (tablet and below) */
@media (max-width: 900px) {
  .cropper-left {
    width: 320px;
  }
}

/* Mobile responsiveness */
@media (max-width: 768px) {
  .cropper-content {
    flex-direction: column;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .cropper-left {
    width: 100%;
    flex: none;
    border-right: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    overflow: visible;
  }

  .settings-panel {
    padding: 1rem;
  }

  .preview-panel {
    padding: 1rem;
    min-height: 250px;
    flex: none;
  }

  .preview-container {
    min-height: 200px;
    height: 200px;
  }

  .cropper-right {
    flex: none;
    min-height: auto;
    overflow: visible;
  }

  .stickers-grid {
    flex: none;
    overflow: visible;
    min-height: auto;
  }

  .sticker-card {
    width: 100px;
  }

  .stickers-empty {
    min-height: 150px;
  }

  .stickers-actions {
    position: sticky;
    bottom: 0;
    background: rgba(10, 10, 15, 0.95);
  }

  /* Mobile: always show edit button */
  .sticker-edit-btn {
    opacity: 1;
  }
}

/* Edit mode overlay */
.edit-overlay {
  position: fixed;
  inset: 0;
  z-index: 10001;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(10, 10, 15, 0.95);
  backdrop-filter: blur(8px);
  padding: 1rem;
}

.edit-panel {
  background: rgba(30, 30, 40, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 1rem;
  padding: 1.5rem;
  width: 100%;
  max-width: 500px;
  /* Calculate max height: viewport - overlay padding (2rem) - safe area */
  max-height: calc(100vh - 2rem);
  max-height: calc(100dvh - 2rem);  /* Dynamic viewport for mobile */
  display: flex;
  flex-direction: column;
}

.edit-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
  flex-shrink: 0;
}

.edit-canvas-container {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  /* Transparent checkerboard background */
  background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><rect fill="%231a1a1f" width="20" height="20"/><rect fill="%23252530" width="10" height="10"/><rect fill="%23252530" x="10" y="10" width="10" height="10"/></svg>');
  border-radius: 0.5rem;
  overflow: hidden;
  min-height: 120px;
  padding: 1rem;
}

.edit-canvas-container.edit-canvas-bg-white {
  background: #ffffff;
}

.edit-canvas {
  max-width: 100%;
  /* Limit canvas height directly */
  max-height: calc(100vh - 350px);
  max-height: calc(100dvh - 350px);
  object-fit: contain;
  cursor: crosshair;
  touch-action: none; /* Prevent scroll during touch */
}

.edit-controls {
  margin-top: 1rem;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 0.5rem;
  flex-shrink: 0;
}

.edit-tolerance {
  margin-bottom: 0.5rem;
}

.edit-hint {
  margin-top: 0.5rem;
}

.edit-actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 1rem;
  flex-shrink: 0;
}

.edit-btn-icon {
  padding: 0.75rem;
  border-radius: 0.5rem;
  background: rgba(255, 255, 255, 0.1);
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.edit-btn-secondary {
  flex: 1;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  font-weight: 500;
  background: rgba(255, 255, 255, 0.1);
  color: #d1d5db;
  transition: all 0.2s;
}

.edit-btn-secondary:hover {
  background: rgba(255, 255, 255, 0.2);
}

.edit-btn-primary {
  flex: 1;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  font-weight: 500;
  background: #8b5cf6;
  color: white;
  transition: all 0.2s;
}

.edit-btn-primary:hover {
  background: #7c3aed;
}

/* Magnifier */
.edit-magnifier {
  position: fixed;
  transform: translate(-50%, -100%);
  pointer-events: none;
  z-index: 10002;
  border-radius: 50%;
  overflow: hidden;
  border: 3px solid rgba(139, 92, 246, 0.8);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}

.edit-magnifier canvas {
  display: block;
  border-radius: 50%;
}

@media (max-width: 768px) {
  .edit-overlay {
    padding: 0.5rem;
  }

  .edit-panel {
    max-width: 100%;
    max-height: calc(100vh - 1rem);
    max-height: calc(100dvh - 1rem);
    padding: 1rem;
    width: 100%;
  }

  .edit-canvas-container {
    min-height: 100px;
  }

  .edit-canvas {
    max-height: calc(100vh - 300px);
    max-height: calc(100dvh - 300px);
  }

  .edit-controls {
    padding: 0.75rem;
  }
}

/* Simple sticker lightbox (avoid class name conflict with main preview) */
.sticker-lightbox {
  position: fixed;
  inset: 0;
  z-index: 10002;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(10, 10, 15, 0.95);
  backdrop-filter: blur(8px);
}

.sticker-lightbox-content {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 90vw;
  max-height: 90vh;
}

.sticker-lightbox-close {
  position: absolute;
  top: -3rem;
  right: 0;
  padding: 0.5rem;
  color: #9ca3af;
  transition: color 0.2s;
}

.sticker-lightbox-close:hover {
  color: white;
}

.sticker-lightbox-img-wrap {
  /* Transparent checkerboard background */
  background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><rect fill="%231a1a1f" width="20" height="20"/><rect fill="%23252530" width="10" height="10"/><rect fill="%23252530" x="10" y="10" width="10" height="10"/></svg>');
  border-radius: 0.5rem;
  overflow: hidden;
  padding: 1rem;
}

.sticker-lightbox-img {
  max-width: 80vw;
  max-height: 70vh;
  object-fit: contain;
}

.sticker-lightbox-info {
  margin-top: 1rem;
  text-align: center;
}
</style>
