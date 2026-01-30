<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from '@/composables/useToast'
import { useHistoryState } from '@/composables/useHistoryState'
import { useColorPicker } from '@/composables/useColorPicker'
import { useStickerDownload } from '@/composables/useStickerDownload'
import { useStickerEdit } from '@/composables/useStickerEdit'
import { useStickerSeparator } from '@/composables/useStickerSeparator'
import StickerLightbox from '@/components/StickerLightbox.vue'
import SeparatorEditor from '@/components/SeparatorEditor.vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import SegmentationWorker from '@/workers/stickerSegmentation.worker.js?worker'

const { t } = useI18n()
const toast = useToast()

// Composables
const {
  isPickingColor,
  backgroundColor,
  colorPickerMagnifierRef,
  showColorPickerMagnifier,
  colorPickerMagnifierPos,
  detectBackgroundColor,
  resetColorPicker,
  handleColorPickerPointerDown,
  handleColorPickerPointerMove,
  handleColorPickerPointerUp,
  handleCanvasClick,
} = useColorPicker()

const {
  isDownloading,
  downloadSingleSticker,
  downloadSelectedAsZip,
  downloadSelectedAsPdf,
} = useStickerDownload()

const {
  editingSticker,
  editCanvasRef,
  editTolerance,
  editHistory,
  editPreviewBgWhite,
  magnifierRef,
  showMagnifier,
  magnifierPos,
  openEditMode,
  closeEditMode,
  resetEdit,
  undoEdit,
  applyEdit,
  resetEditState,
  handleEditPointerDown,
  handleEditPointerMove,
  handleEditPointerUp,
} = useStickerEdit()

// Separator composable for manual mode
const {
  segmentationMode,
  activeTab,
  separatorLines,
  isDrawing: isSeparatorDrawing,
  firstPoint: separatorFirstPoint,
  previewLine: separatorPreviewLine,
  selectedLineId,
  canUndo: separatorCanUndo,
  canRedo: separatorCanRedo,
  zoom: separatorZoom,
  pan: separatorPan,
  isDragging: separatorIsDragging,
  isTouching: separatorIsTouching,
  startDrawing: startSeparatorDrawing,
  cancelDrawing: cancelSeparatorDrawing,
  setFirstPoint: setSeparatorFirstPoint,
  updatePreviewLine: updateSeparatorPreviewLine,
  completeDrawing: completeSeparatorDrawing,
  selectLine,
  deselectLine,
  deleteLine,
  clearAllLines,
  undo: separatorUndo,
  redo: separatorRedo,
  initHistory: initSeparatorHistory,
  resetZoomPan,
  fitToContainer,
  handleWheel: handleSeparatorWheel,
  handleMouseDown: handleSeparatorMouseDown,
  handleMouseMove: handleSeparatorMouseMove,
  handleMouseUp: handleSeparatorMouseUp,
  handleTouchStart: handleSeparatorTouchStart,
  handleTouchMove: handleSeparatorTouchMove,
  handleTouchEnd: handleSeparatorTouchEnd,
  resetState: resetSeparatorState,
} = useStickerSeparator()

// Web Worker for CCL segmentation
let segmentationWorker = null
let rafId = null
let processingContext = null
let isMounted = false

// Create worker with handlers
const createSegmentationWorker = () => {
  const worker = new SegmentationWorker()

  worker.onerror = (err) => {
    console.error('Segmentation worker error:', err)
    isProcessing.value = false
    processingContext = null
    if (!isMounted) return
    toast.error(t('stickerCropper.toast.processingError'))
  }

  worker.onmessage = (e) => {
    if (!isMounted || !processingContext) return
    const { width, height, ctx, sourceCanvas, previewCanvas, startTime, MIN_DISPLAY_TIME, useWhiteBg } = processingContext
    const { imageData: processedData, regions } = e.data

    const newImageData = new ImageData(
      new Uint8ClampedArray(processedData),
      width,
      height
    )
    ctx.putImageData(newImageData, 0, 0)

    const previewCtx = previewCanvas.getContext('2d')
    previewCanvas.width = width
    previewCanvas.height = height
    if (useWhiteBg) {
      previewCtx.fillStyle = '#ffffff'
      previewCtx.fillRect(0, 0, width, height)
    }
    previewCtx.drawImage(sourceCanvas, 0, 0)

    cropStickersFromRegions(sourceCanvas, regions, useWhiteBg, () => {
      const elapsed = Date.now() - startTime
      const remaining = MIN_DISPLAY_TIME - elapsed
      if (remaining > 0) {
        setTimeout(() => {
          if (isMounted) {
            isProcessing.value = false
            // In manual mode, switch to results tab after processing
            if (segmentationMode.value === 'manual') {
              activeTab.value = 'results'
            }
          }
        }, remaining)
      } else {
        if (isMounted) {
          isProcessing.value = false
          // In manual mode, switch to results tab after processing
          if (segmentationMode.value === 'manual') {
            activeTab.value = 'results'
          }
        }
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

const emit = defineEmits(['update:modelValue', 'close', 'extractCharacter'])

// State
const isVisible = ref(false)
const isClosing = ref(false)
const isProcessing = ref(false)

// Canvas refs
const sourceCanvasRef = ref(null)
const previewCanvasRef = ref(null)
const previewContainerRef = ref(null)

// Image state
const originalImage = ref(null)
const imageLoaded = ref(false)

// Settings
const tolerance = ref(30)
const erosion = ref(0)

// Preview background
const previewBgWhite = ref(false)

// Cropped stickers
const croppedStickers = ref([])
const selectedStickers = ref(new Set())

// Preview sticker
const previewSticker = ref(null)

// Confirm modal ref
const confirmModalRef = ref(null)

// Check if there's unsaved work (cropped stickers exist)
const hasUnsavedWork = computed(() => croppedStickers.value.length > 0)

// Warn user before leaving page with unsaved work
const handleBeforeUnload = (e) => {
  if (hasUnsavedWork.value && props.modelValue) {
    e.preventDefault()
    // Modern browsers ignore custom messages, but we still need to set returnValue
    e.returnValue = ''
    return ''
  }
}

// History state management
const { pushState, popState } = useHistoryState('stickerCropper', {
  onBackNavigation: async () => {
    if (hasUnsavedWork.value) {
      // Re-push state first to prevent immediate close (popstate already fired)
      pushState()
      // Show styled confirmation modal
      const confirmed = await confirmModalRef.value?.show({
        title: t('stickerCropper.unsavedTitle'),
        message: t('stickerCropper.unsavedWarning'),
        confirmText: t('stickerCropper.unsavedConfirm'),
        cancelText: t('common.cancel'),
      })
      if (!confirmed) {
        // User cancelled - stay on cropper (state already pushed)
        return
      }
    }
    close()
  },
})

// Watch for open/close
watch(() => props.modelValue, (newVal) => {
  if (newVal) {
    isVisible.value = true
    isClosing.value = false
    document.body.style.overflow = 'hidden'
    loadImage()
    pushState()
  } else {
    isClosing.value = true
    popState()
    setTimeout(() => {
      isVisible.value = false
      isClosing.value = false
      document.body.style.overflow = ''
      resetState()
    }, 300)
  }
})

// Watch for preview background toggle
watch(previewBgWhite, (useWhiteBg) => {
  toast.info(useWhiteBg ? t('stickerCropper.toast.whiteBg') : t('stickerCropper.toast.transparentBg'))

  if (croppedStickers.value.length === 0) return

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

  croppedStickers.value = croppedStickers.value.map(sticker => {
    const stickerPreviewCanvas = document.createElement('canvas')
    stickerPreviewCanvas.width = sticker.width
    stickerPreviewCanvas.height = sticker.height
    const stickerPreviewCtx = stickerPreviewCanvas.getContext('2d')

    if (useWhiteBg) {
      stickerPreviewCtx.fillStyle = '#ffffff'
      stickerPreviewCtx.fillRect(0, 0, sticker.width, sticker.height)
    }

    stickerPreviewCtx.drawImage(sticker.canvas, 0, 0)

    return {
      ...sticker,
      previewDataUrl: stickerPreviewCanvas.toDataURL('image/png'),
    }
  })
})

// Watch for image src changes
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
    nextTick(() => {
      detectBackgroundColor(img, sourceCanvasRef.value)
    })
  }

  img.onerror = () => {
    console.error('Failed to load image')
  }

  img.src = props.imageSrc
}

// Color picker event wrappers
const onColorPickerPointerDown = (e) => {
  handleColorPickerPointerDown(e, sourceCanvasRef.value, previewContainerRef.value, originalImage.value)
}

const onColorPickerPointerMove = (e) => {
  handleColorPickerPointerMove(e, sourceCanvasRef.value, previewContainerRef.value, originalImage.value)
}

const onColorPickerPointerUp = (e) => {
  handleColorPickerPointerUp(e, sourceCanvasRef.value, previewContainerRef.value, originalImage.value)
}

const onCanvasClick = (e) => {
  handleCanvasClick(e, sourceCanvasRef.value, previewContainerRef.value, originalImage.value)
}

const processImage = () => {
  if (!originalImage.value || !sourceCanvasRef.value || !previewCanvasRef.value) return
  if (isProcessing.value) return

  // In manual mode, require at least one separator line
  if (segmentationMode.value === 'manual' && separatorLines.value.length === 0) {
    toast.warning(t('stickerCropper.toast.noSeparatorLines'))
    return
  }

  isProcessing.value = true
  croppedStickers.value = []
  selectedStickers.value.clear()

  // Exit drawing mode to prevent accidental touches
  cancelSeparatorDrawing()

  const startTime = Date.now()
  const MIN_DISPLAY_TIME = 500

  nextTick(() => {
    requestAnimationFrame(() => {
      const sourceCanvas = sourceCanvasRef.value
      const previewCanvas = previewCanvasRef.value
      const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true })

      sourceCanvas.width = originalImage.value.width
      sourceCanvas.height = originalImage.value.height
      ctx.drawImage(originalImage.value, 0, 0)

      const imageData = ctx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height)
      const width = sourceCanvas.width
      const height = sourceCanvas.height

      if (!segmentationWorker) {
        segmentationWorker = createSegmentationWorker()
      }

      processingContext = {
        width,
        height,
        ctx,
        sourceCanvas,
        previewCanvas,
        startTime,
        MIN_DISPLAY_TIME,
        useWhiteBg: previewBgWhite.value,
      }

      const { r, g, b } = backgroundColor.value

      // Prepare message payload
      const payload = {
        imageData: imageData.data,
        width,
        height,
        backgroundColor: { r, g, b },
        tolerance: tolerance.value,
        erosion: erosion.value,
        minSize: 20,
        mode: segmentationMode.value,
        // Must extract primitive values to avoid Vue proxy serialization issues
        separatorLines: separatorLines.value.map((line) => ({
          start: { x: line.start.x, y: line.start.y },
          end: { x: line.end.x, y: line.end.y },
        })),
      }

      segmentationWorker.postMessage(payload, [imageData.data.buffer])
    })
  })
}

/**
 * Trim transparent padding from a canvas
 * Scans from all 4 edges to find the content bounds and crops to that area
 * @param {HTMLCanvasElement} canvas - The canvas to trim
 * @returns {{canvas: HTMLCanvasElement, width: number, height: number} | null} - Trimmed canvas or null if all transparent
 */
const trimTransparentPadding = (canvas) => {
  const ctx = canvas.getContext('2d')
  const width = canvas.width
  const height = canvas.height
  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data

  // Helper to check if pixel at (x, y) is non-transparent (alpha > 0)
  const isOpaque = (x, y) => data[(y * width + x) * 4 + 3] > 0

  // Find minX: scan from left
  let minX = 0
  outer: for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      if (isOpaque(x, y)) {
        minX = x
        break outer
      }
    }
  }

  // Find maxX: scan from right
  let maxX = width - 1
  outer: for (let x = width - 1; x >= 0; x--) {
    for (let y = 0; y < height; y++) {
      if (isOpaque(x, y)) {
        maxX = x
        break outer
      }
    }
  }

  // Find minY: scan from top
  let minY = 0
  outer: for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isOpaque(x, y)) {
        minY = y
        break outer
      }
    }
  }

  // Find maxY: scan from bottom
  let maxY = height - 1
  outer: for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      if (isOpaque(x, y)) {
        maxY = y
        break outer
      }
    }
  }

  // Check if image is completely transparent
  if (minX > maxX || minY > maxY) {
    return null
  }

  // Calculate new dimensions
  const newWidth = maxX - minX + 1
  const newHeight = maxY - minY + 1

  // If no trimming needed, return original
  if (newWidth === width && newHeight === height) {
    return { canvas, width, height }
  }

  // Create trimmed canvas
  const trimmedCanvas = document.createElement('canvas')
  trimmedCanvas.width = newWidth
  trimmedCanvas.height = newHeight
  const trimmedCtx = trimmedCanvas.getContext('2d')
  trimmedCtx.drawImage(canvas, minX, minY, newWidth, newHeight, 0, 0, newWidth, newHeight)

  return { canvas: trimmedCanvas, width: newWidth, height: newHeight }
}

const cropStickersFromRegions = (canvas, validRegions, useWhiteBg, onComplete) => {
  if (validRegions.length === 0) {
    if (isMounted) toast.warning(t('stickerCropper.toast.noStickers'))
    onComplete?.()
    processingContext = null
    return
  }

  const stickers = []
  let index = 0

  const processNext = () => {
    if (!isMounted) {
      rafId = null
      return
    }

    if (index >= validRegions.length) {
      croppedStickers.value = stickers
      stickers.forEach(s => selectedStickers.value.add(s.id))
      toast.success(t('stickerCropper.toast.cropSuccess', { count: stickers.length }))
      rafId = null
      onComplete?.()
      return
    }

    const STICKERS_PER_FRAME = 2
    for (let i = 0; i < STICKERS_PER_FRAME && index < validRegions.length; i++, index++) {
      const rect = validRegions[index]

      // First, crop the region from main canvas
      const rawCanvas = document.createElement('canvas')
      rawCanvas.width = rect.w
      rawCanvas.height = rect.h
      const rawCtx = rawCanvas.getContext('2d')
      rawCtx.drawImage(canvas, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h)

      // Trim transparent padding
      const trimmed = trimTransparentPadding(rawCanvas)
      if (!trimmed) {
        // Completely transparent, skip this region
        continue
      }

      const stickerCanvas = trimmed.canvas
      const finalWidth = trimmed.width
      const finalHeight = trimmed.height

      // Create preview canvas with optional white background
      const previewCanvas = document.createElement('canvas')
      previewCanvas.width = finalWidth
      previewCanvas.height = finalHeight
      const previewCtx = previewCanvas.getContext('2d')
      if (useWhiteBg) {
        previewCtx.fillStyle = '#ffffff'
        previewCtx.fillRect(0, 0, finalWidth, finalHeight)
      }
      previewCtx.drawImage(stickerCanvas, 0, 0)

      stickers.push({
        id: stickers.length,
        canvas: stickerCanvas,
        dataUrl: stickerCanvas.toDataURL('image/png'),
        previewDataUrl: previewCanvas.toDataURL('image/png'),
        width: finalWidth,
        height: finalHeight,
        rect,
      })
    }

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

// Preview
const openPreview = (sticker) => {
  previewSticker.value = sticker
}

const closePreview = () => {
  previewSticker.value = null
}

// Edit mode
const openEdit = (sticker) => {
  openEditMode(sticker, {
    tolerance: tolerance.value,
    previewBgWhite: previewBgWhite.value,
  })
}

const handleApplyEdit = () => {
  applyEdit(croppedStickers.value, previewBgWhite.value)
}

// Download wrappers
const handleDownloadSingle = (sticker) => {
  downloadSingleSticker(sticker, imagePrefix.value)
}

const handleDownloadZip = () => {
  downloadSelectedAsZip(croppedStickers.value, selectedStickers.value, imagePrefix.value)
}

const handleDownloadPdf = () => {
  downloadSelectedAsPdf(croppedStickers.value, selectedStickers.value, imagePrefix.value)
}

// Navigate to character extractor
const extractCharacterFromSticker = (sticker) => {
  const imageData = {
    data: sticker.dataUrl.split(',')[1],
    mimeType: 'image/png',
    preview: sticker.dataUrl,
  }
  sessionStorage.setItem('characterExtractorImage', JSON.stringify(imageData))
  emit('extractCharacter')
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
  erosion.value = 0
  resetColorPicker()
  previewSticker.value = null
  resetEditState()
  resetSeparatorState()
}

// Handle separator editor container ready - reset zoom to 1 and init history
const handleSeparatorContainerReady = () => {
  fitToContainer()
  initSeparatorHistory()
}

// Handle clear all lines with confirmation
const handleClearAllLines = async () => {
  if (separatorLines.value.length === 0) return

  const confirmed = await confirmModalRef.value?.show({
    title: t('stickerCropper.separator.clearAllTitle'),
    message: t('stickerCropper.separator.clearAllMessage'),
    confirmText: t('common.clearAll'),
    cancelText: t('common.cancel'),
  })

  if (confirmed) {
    clearAllLines()
  }
}

// Computed
const bgColorHex = computed(() => {
  const { r, g, b } = backgroundColor.value
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
})

const imagePrefix = computed(() => {
  const imgNum = props.imageIndex + 1
  return props.historyId ? `${props.historyId}-${imgNum}` : `${imgNum}`
})

// Keyboard handling
const handleKeydown = (e) => {
  if (!props.modelValue) return
  if (e.key === 'Escape') {
    e.preventDefault()
    // Only handle ESC for sub-panels (preview/edit), not for closing the main cropper
    // This prevents accidentally losing work in progress
    if (previewSticker.value) {
      closePreview()
    } else if (editingSticker.value) {
      closeEditMode()
    }
    // Do nothing when in main cropper view - user must click X button to close
  }
}

onMounted(() => {
  isMounted = true
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('beforeunload', handleBeforeUnload)
})

onUnmounted(() => {
  isMounted = false
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('beforeunload', handleBeforeUnload)
  document.body.style.overflow = ''

  isProcessing.value = false
  processingContext = null
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
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
          <h2 class="text-lg font-semibold text-text-primary flex items-center gap-2">
            <svg class="w-5 h-5 text-mode-generate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {{ $t('stickerCropper.title') }}
          </h2>
          <button
            @click="close"
            class="p-2 rounded-lg hover:bg-bg-interactive text-text-muted hover:text-text-primary transition-colors"
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
              <h3 class="text-sm font-medium text-text-secondary mb-3">{{ $t('stickerCropper.settings.title') }}</h3>

              <!-- Mode Selector -->
              <div class="mb-4">
                <label class="block text-xs text-text-muted mb-2">{{ $t('stickerCropper.settings.mode') }}</label>
                <div class="mode-selector">
                  <button
                    @click="segmentationMode = 'auto'"
                    class="mode-btn"
                    :class="{ active: segmentationMode === 'auto' }"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    {{ $t('stickerCropper.settings.modeAuto') }}
                  </button>
                  <button
                    @click="segmentationMode = 'manual'"
                    class="mode-btn"
                    :class="{ active: segmentationMode === 'manual' }"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    {{ $t('stickerCropper.settings.modeManual') }}
                  </button>
                </div>
              </div>

              <!-- Background Color -->
              <div class="mb-4">
                <label class="block text-xs text-text-muted mb-2">{{ $t('stickerCropper.settings.bgColor') }}</label>
                <div class="flex items-center gap-2">
                  <div
                    class="w-8 h-8 rounded border border-border-default"
                    :style="{ backgroundColor: bgColorHex }"
                  ></div>
                  <span class="text-sm text-text-secondary font-mono">{{ bgColorHex }}</span>
                  <button
                    @click="isPickingColor = !isPickingColor"
                    class="ml-auto px-3 py-1.5 text-xs rounded-lg transition-colors"
                    :class="isPickingColor
                      ? 'bg-brand-primary text-text-primary'
                      : 'bg-bg-interactive text-text-secondary hover:bg-bg-interactive-hover'"
                  >
                    {{ isPickingColor ? $t('stickerCropper.settings.pickingColor') : $t('stickerCropper.settings.pickColor') }}
                  </button>
                </div>
              </div>

              <!-- Tolerance -->
              <div class="mb-4">
                <label class="block text-xs text-text-muted mb-2">
                  {{ $t('stickerCropper.settings.tolerance') }}: <span class="text-mode-generate font-medium">{{ tolerance }}</span>
                </label>
                <input
                  v-model="tolerance"
                  type="range"
                  min="0"
                  max="100"
                  class="w-full"
                  :style="{ accentColor: 'var(--color-brand-primary)' }"
                />
                <p class="text-xs text-text-muted mt-1">{{ $t('stickerCropper.settings.toleranceHint') }}</p>
              </div>

              <!-- Edge Erosion -->
              <div class="mb-4">
                <label class="block text-xs text-text-muted mb-2">{{ $t('stickerCropper.settings.erosion') }}</label>
                <div class="flex gap-1">
                  <button
                    v-for="n in [0, 1, 2, 3]"
                    :key="n"
                    @click="erosion = n"
                    class="flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors"
                    :class="erosion === n
                      ? 'bg-brand-primary text-text-on-brand'
                      : 'bg-bg-interactive text-text-secondary hover:bg-bg-interactive-hover'"
                  >
                    {{ $t('stickerCropper.settings.erosionPx', { n }) }}
                  </button>
                </div>
                <p class="text-xs text-text-muted mt-1">{{ $t('stickerCropper.settings.erosionHint') }}</p>
              </div>

              <!-- Preview Background Toggle -->
              <div class="mb-4 flex items-center justify-between">
                <label class="text-xs text-text-muted">{{ $t('stickerCropper.settings.whiteBgPreview') }}</label>
                <button
                  @click="previewBgWhite = !previewBgWhite"
                  class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
                  :class="previewBgWhite ? 'bg-brand-primary' : 'bg-control-inactive'"
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
                  ? 'bg-brand-primary hover:bg-brand-primary-hover btn-process-text'
                  : 'bg-control-disabled text-text-muted cursor-not-allowed'"
              >
                <svg v-if="isProcessing" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
                {{ isProcessing ? $t('stickerCropper.buttons.processing') : $t('stickerCropper.buttons.process') }}
              </button>
            </div>

            <!-- Preview Canvas (Auto mode only) -->
            <div v-if="segmentationMode === 'auto'" class="preview-panel">
              <h3 class="text-sm font-medium text-text-secondary mb-3">{{ $t('stickerCropper.preview.title') }}</h3>
              <div
                ref="previewContainerRef"
                class="preview-container"
                :class="{ 'cursor-crosshair': isPickingColor, 'bg-white': previewBgWhite }"
                @click="onCanvasClick"
                @mousedown="onColorPickerPointerDown"
                @mousemove="onColorPickerPointerMove"
                @mouseup="onColorPickerPointerUp"
                @mouseleave="showColorPickerMagnifier = false"
                @touchstart="onColorPickerPointerDown"
                @touchmove="onColorPickerPointerMove"
                @touchend="onColorPickerPointerUp"
              >
                <canvas ref="sourceCanvasRef" class="hidden"></canvas>
                <canvas
                  v-show="croppedStickers.length > 0"
                  ref="previewCanvasRef"
                  class="preview-canvas"
                  :class="{ 'opacity-50': isProcessing }"
                ></canvas>
                <img
                  v-if="croppedStickers.length === 0 && imageLoaded"
                  :src="imageSrc"
                  class="preview-image"
                  alt="Original"
                />
                <div v-if="!imageLoaded" class="preview-placeholder">
                  <svg class="w-12 h-12 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p class="text-text-muted text-sm mt-2">{{ $t('stickerCropper.preview.loading') }}</p>
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

            <!-- Hidden canvas for processing (always needed) -->
            <canvas v-if="segmentationMode === 'manual'" ref="sourceCanvasRef" class="hidden"></canvas>
            <canvas v-if="segmentationMode === 'manual'" ref="previewCanvasRef" class="hidden"></canvas>
          </div>

          <!-- Right: Cropped Stickers / Separator Editor -->
          <div class="cropper-right">
            <!-- Tab Bar (Manual mode only) -->
            <div v-if="segmentationMode === 'manual'" class="tab-bar">
              <button
                @click="activeTab = 'editor'"
                class="tab-btn"
                :class="{ active: activeTab === 'editor' }"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                {{ $t('stickerCropper.tabs.editor') }}
              </button>
              <button
                @click="activeTab = 'results'"
                class="tab-btn"
                :class="{ active: activeTab === 'results' }"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {{ $t('stickerCropper.tabs.results') }}
                <span v-if="croppedStickers.length" class="tab-badge">{{ croppedStickers.length }}</span>
              </button>
            </div>

            <!-- Separator Editor (Manual mode, Editor tab) -->
            <div v-if="segmentationMode === 'manual' && activeTab === 'editor'" class="separator-editor-container">
              <SeparatorEditor
                v-if="imageLoaded && originalImage"
                :image-src="imageSrc"
                :image-width="originalImage.width"
                :image-height="originalImage.height"
                :separator-lines="separatorLines"
                :is-drawing="isSeparatorDrawing"
                :first-point="separatorFirstPoint"
                :preview-line="separatorPreviewLine"
                :selected-line-id="selectedLineId"
                :can-undo="separatorCanUndo"
                :can-redo="separatorCanRedo"
                :zoom="separatorZoom"
                :pan="separatorPan"
                :is-dragging="separatorIsDragging"
                :is-touching="separatorIsTouching"
                @start-drawing="startSeparatorDrawing"
                @cancel-drawing="cancelSeparatorDrawing"
                @set-first-point="setSeparatorFirstPoint"
                @update-preview-line="updateSeparatorPreviewLine"
                @complete-drawing="completeSeparatorDrawing"
                @select-line="selectLine"
                @deselect-line="deselectLine"
                @delete-line="deleteLine"
                @clear-all-lines="handleClearAllLines"
                @undo="separatorUndo"
                @redo="separatorRedo"
                @reset-zoom-pan="resetZoomPan"
                @container-ready="handleSeparatorContainerReady"
                @wheel="handleSeparatorWheel"
                @mousedown="handleSeparatorMouseDown"
                @mousemove="(e) => handleSeparatorMouseMove(e, originalImage.width, originalImage.height)"
                @mouseup="handleSeparatorMouseUp"
                @touchstart="handleSeparatorTouchStart"
                @touchmove="(e) => handleSeparatorTouchMove(e, originalImage.width, originalImage.height)"
                @touchend="handleSeparatorTouchEnd"
              />
              <div v-else class="separator-editor-placeholder">
                <svg class="w-12 h-12 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p class="text-text-muted text-sm mt-2">{{ $t('stickerCropper.preview.loading') }}</p>
              </div>
            </div>

            <!-- Results Header (Auto mode OR Manual mode with Results tab) -->
            <div v-if="segmentationMode === 'auto' || activeTab === 'results'" class="stickers-header">
              <h3 class="text-sm font-medium text-text-secondary">
                {{ $t('stickerCropper.results.title') }}
                <span v-if="croppedStickers.length" class="text-mode-generate">
                  {{ $t('stickerCropper.results.count', { count: croppedStickers.length }) }}
                </span>
              </h3>
              <div v-if="croppedStickers.length" class="flex items-center gap-2">
                <button
                  @click="selectAllStickers"
                  class="text-xs text-text-muted hover:text-text-primary transition-colors"
                >
                  {{ $t('stickerCropper.results.selectAll') }}
                </button>
                <span class="text-text-muted">|</span>
                <button
                  @click="deselectAllStickers"
                  class="text-xs text-text-muted hover:text-text-primary transition-colors"
                >
                  {{ $t('stickerCropper.results.deselectAll') }}
                </button>
              </div>
            </div>

            <!-- Stickers Grid (Auto mode OR Manual mode with Results tab) -->
            <div v-if="croppedStickers.length && (segmentationMode === 'auto' || activeTab === 'results')" class="stickers-grid">
              <div
                v-for="sticker in croppedStickers"
                :key="sticker.id"
                class="sticker-card"
                :class="{ 'selected': selectedStickers.has(sticker.id) }"
              >
                <div class="sticker-preview" @click="openPreview(sticker)">
                  <img :src="sticker.previewDataUrl" :alt="`Sticker ${sticker.id + 1}`" />
                </div>
                <div class="sticker-info">
                  <span class="text-xs text-text-muted">
                    {{ sticker.width }} x {{ sticker.height }}
                  </span>
                  <button
                    @click.stop="handleDownloadSingle(sticker)"
                    class="sticker-download"
                    :title="$t('stickerCropper.results.downloadThis')"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </button>
                </div>
                <button
                  @click.stop="openEdit(sticker)"
                  class="sticker-edit-btn"
                  :title="$t('stickerCropper.edit.button')"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
                <button
                  @click.stop="extractCharacterFromSticker(sticker)"
                  class="sticker-extract-btn"
                  :title="$t('characterExtractor.extract')"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </button>
                <div
                  class="sticker-checkbox"
                  @click.stop="toggleSelectSticker(sticker.id)"
                >
                  <svg v-if="selectedStickers.has(sticker.id)" class="w-5 h-5 text-mode-generate" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                  </svg>
                  <div v-else class="w-5 h-5 rounded-full border-2 border-border-muted"></div>
                </div>
              </div>
            </div>

            <!-- Empty state (Auto mode OR Manual mode with Results tab) -->
            <div v-else-if="segmentationMode === 'auto' || activeTab === 'results'" class="stickers-empty">
              <svg class="w-16 h-16 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p class="text-text-muted text-sm mt-3">{{ $t('stickerCropper.results.hint') }}</p>
              <p class="text-text-muted text-xs mt-1">{{ $t('stickerCropper.results.autoDetect') }}</p>
            </div>

            <!-- Download Buttons (Auto mode OR Manual mode with Results tab) -->
            <div v-if="croppedStickers.length && (segmentationMode === 'auto' || activeTab === 'results')" class="stickers-actions">
              <button
                @click="handleDownloadZip"
                :disabled="selectedStickers.size === 0 || isDownloading"
                class="download-btn"
                :class="selectedStickers.size > 0 && !isDownloading
                  ? 'bg-status-success-solid hover:bg-status-success-hover text-white'
                  : 'bg-control-disabled text-text-muted cursor-not-allowed'"
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
                @click="handleDownloadPdf"
                :disabled="selectedStickers.size === 0 || isDownloading"
                class="download-btn"
                :class="selectedStickers.size > 0 && !isDownloading
                  ? 'bg-mode-generate-solid hover:bg-mode-generate-hover text-white'
                  : 'bg-control-disabled text-text-muted cursor-not-allowed'"
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
              <p class="text-text-primary font-medium mt-4">{{ $t('stickerCropper.overlay.processing') }}</p>
              <p class="text-text-muted text-sm mt-1">{{ $t('stickerCropper.overlay.hint') }}</p>
            </div>
          </div>
        </Transition>

        <!-- Edit Mode Overlay -->
        <Transition name="fade">
          <div v-if="editingSticker" class="edit-overlay">
            <div class="edit-panel">
              <div class="edit-header">
                <h3 class="text-lg font-semibold text-text-primary flex items-center gap-2">
                  <svg class="w-5 h-5 text-mode-generate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  {{ $t('stickerCropper.edit.title') }}
                </h3>
                <div class="flex items-center gap-2">
                  <button
                    @click="editPreviewBgWhite = !editPreviewBgWhite"
                    class="p-2 rounded-lg transition-colors"
                    :class="editPreviewBgWhite ? 'bg-bg-interactive-hover text-text-primary' : 'hover:bg-bg-interactive text-text-muted'"
                    :title="$t('stickerCropper.settings.whiteBgPreview')"
                  >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </button>
                  <button
                    @click="closeEditMode"
                    class="p-2 rounded-lg hover:bg-bg-interactive text-text-muted hover:text-text-primary transition-colors"
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
                  <label class="text-xs text-text-muted">
                    {{ $t('stickerCropper.edit.tolerance') }}: <span class="text-mode-generate font-medium">{{ editTolerance }}</span>
                  </label>
                  <input
                    v-model="editTolerance"
                    type="range"
                    min="0"
                    max="100"
                    class="w-full"
                  :style="{ accentColor: 'var(--color-brand-primary)' }"
                  />
                </div>
                <p class="edit-hint text-xs text-text-muted">{{ $t('stickerCropper.edit.hint') }}</p>
              </div>

              <div class="edit-actions">
                <button
                  @click="undoEdit"
                  :disabled="editHistory.length === 0"
                  class="edit-btn-icon"
                  :class="editHistory.length > 0 ? 'text-text-secondary hover:bg-bg-interactive-hover' : 'text-text-muted cursor-not-allowed'"
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
                  @click="handleApplyEdit"
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

    <!-- Sticker Lightbox -->
    <StickerLightbox
      :sticker="previewSticker"
      @close="closePreview"
    />

    <!-- Confirm modal for unsaved work warning -->
    <ConfirmModal ref="confirmModalRef" />
  </Teleport>
</template>

<style scoped>
@import './StickerCropper.css';
</style>
