<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatFileSize, calculateCompressionRatio } from '@/composables/useImageCompression'
import { useImageStorage } from '@/composables/useImageStorage'
import { usePdfGenerator } from '@/composables/usePdfGenerator'
import { useToast } from '@/composables/useToast'
import StickerCropper from '@/components/StickerCropper.vue'
import JSZip from 'jszip'

const { t } = useI18n()
const toast = useToast()

const props = defineProps({
  images: {
    type: Array,
    default: () => [],
  },
  modelValue: {
    type: Boolean,
    default: false,
  },
  initialIndex: {
    type: Number,
    default: 0,
  },
  // Image metadata from OPFS storage
  imageMetadata: {
    type: Array,
    default: () => [],
  },
  // Is this historical images (from history, only WebP available)
  isHistorical: {
    type: Boolean,
    default: false,
  },
  // Is this from sticker mode (show crop button)
  isStickerMode: {
    type: Boolean,
    default: false,
  },
  // History ID for unique sticker naming
  historyId: {
    type: Number,
    default: null,
  },
})

const emit = defineEmits(['update:modelValue', 'close'])

// Image storage for OPFS access
const imageStorage = useImageStorage()

// PDF generator
const pdfGenerator = usePdfGenerator()

// Download format preference (original or webp)
const DOWNLOAD_PREF_KEY = 'nbp-download-format'
const downloadFormat = ref(localStorage.getItem(DOWNLOAD_PREF_KEY) || 'original')
const showDownloadMenu = ref(false)

const currentIndex = ref(props.initialIndex)
const isAnimating = ref(false)
const slideDirection = ref('') // 'left' or 'right'
const isVisible = ref(false)
const isClosing = ref(false)

// Zoom and pan state
const scale = ref(1)
const translateX = ref(0)
const translateY = ref(0)
const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })
const imageRef = ref(null)

const MIN_SCALE = 0.5
const MAX_SCALE = 5
const ZOOM_SENSITIVITY = 0.002
const PINCH_SENSITIVITY = 0.01

// Touch state
const isTouching = ref(false)
const touchStartDistance = ref(0)
const touchStartScale = ref(1)
const touchStartPos = ref({ x: 0, y: 0 })
const lastTouchCenter = ref({ x: 0, y: 0 })
const lastTapTime = ref(0)
const touchMoved = ref(false)

// Reset zoom and pan
const resetTransform = () => {
  scale.value = 1
  translateX.value = 0
  translateY.value = 0
}

// Track if we pushed history state
const historyStatePushed = ref(false)

// Handle browser back button / gesture
const handlePopState = (e) => {
  if (props.modelValue && e.state?.lightbox !== true) {
    // User pressed back while lightbox is open - close it
    emit('update:modelValue', false)
  }
}

// Watch for external open
watch(() => props.modelValue, (newVal) => {
  if (newVal) {
    currentIndex.value = props.initialIndex
    isVisible.value = true
    isClosing.value = false
    resetTransform()
    document.body.style.overflow = 'hidden'

    // Push history state to intercept back gesture/button
    if (!historyStatePushed.value) {
      history.pushState({ lightbox: true }, '')
      historyStatePushed.value = true
    }
  } else {
    isClosing.value = true

    // Pop the history state we added (if still there)
    if (historyStatePushed.value) {
      historyStatePushed.value = false
      // Only go back if we're on our pushed state
      if (history.state?.lightbox === true) {
        history.back()
      }
    }

    setTimeout(() => {
      isVisible.value = false
      isClosing.value = false
      resetTransform()
      document.body.style.overflow = ''
    }, 300)
  }
})

// Watch initial index changes
watch(() => props.initialIndex, (newVal) => {
  currentIndex.value = newVal
})

// Reset transform when image changes
watch(currentIndex, () => {
  resetTransform()
})

const currentImage = computed(() => {
  return props.images[currentIndex.value] || null
})

const hasPrev = computed(() => currentIndex.value > 0)
const hasNext = computed(() => currentIndex.value < props.images.length - 1)

const close = () => {
  emit('update:modelValue', false)
  emit('close')
}

const goToPrev = () => {
  if (!hasPrev.value || isAnimating.value) return
  slideDirection.value = 'right'
  isAnimating.value = true
  setTimeout(() => {
    currentIndex.value--
    setTimeout(() => {
      isAnimating.value = false
      slideDirection.value = ''
    }, 300)
  }, 150)
}

const goToNext = () => {
  if (!hasNext.value || isAnimating.value) return
  slideDirection.value = 'left'
  isAnimating.value = true
  setTimeout(() => {
    currentIndex.value++
    setTimeout(() => {
      isAnimating.value = false
      slideDirection.value = ''
    }, 300)
  }, 150)
}

const goToIndex = (index) => {
  if (index === currentIndex.value || isAnimating.value) return
  slideDirection.value = index > currentIndex.value ? 'left' : 'right'
  isAnimating.value = true
  setTimeout(() => {
    currentIndex.value = index
    setTimeout(() => {
      isAnimating.value = false
      slideDirection.value = ''
    }, 300)
  }, 150)
}

// Keyboard navigation
const handleKeydown = (e) => {
  if (!props.modelValue) return

  switch (e.key) {
    case 'ArrowLeft':
      e.preventDefault()
      goToPrev()
      break
    case 'ArrowRight':
      e.preventDefault()
      goToNext()
      break
    case 'Escape':
      e.preventDefault()
      close()
      break
    case '0':
      // Reset zoom with 0 key
      e.preventDefault()
      resetTransform()
      break
  }
}

// Wheel event for zoom (scroll) and pan (Mac trackpad)
const handleWheel = (e) => {
  if (!props.modelValue) return
  e.preventDefault()

  // Pinch-to-zoom on Mac trackpad (ctrlKey is set for pinch gestures)
  if (e.ctrlKey) {
    const delta = -e.deltaY * PINCH_SENSITIVITY
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale.value + delta))
    scale.value = newScale
    return
  }

  // Detect mouse wheel vs trackpad:
  // - Mouse wheel: deltaX is 0, deltaY is discrete (typically >=50)
  // - Trackpad: both deltaX and deltaY can have small continuous values
  const isMouseWheel = e.deltaX === 0 && Math.abs(e.deltaY) >= 40

  if (isMouseWheel) {
    // Mouse wheel: always zoom (even when zoomed in)
    const delta = -e.deltaY * ZOOM_SENSITIVITY
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale.value + delta))
    scale.value = newScale
    return
  }

  // Trackpad behavior
  if (scale.value > 1) {
    // When zoomed in: trackpad swipe to pan
    translateX.value -= e.deltaX
    translateY.value -= e.deltaY
    constrainPan()
    return
  }

  // When not zoomed: vertical scroll to zoom
  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
    const delta = -e.deltaY * ZOOM_SENSITIVITY
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale.value + delta))
    scale.value = newScale
  }
}

// Constrain pan to keep image visible
// Allows panning proportional to zoom level, ensuring image stays partially visible
const constrainPan = () => {
  const maxPanX = Math.max(0, (scale.value - 1) * window.innerWidth * 0.4)
  const maxPanY = Math.max(0, (scale.value - 1) * window.innerHeight * 0.35)
  translateX.value = Math.max(-maxPanX, Math.min(maxPanX, translateX.value))
  translateY.value = Math.max(-maxPanY, Math.min(maxPanY, translateY.value))
}

// Mouse events for drag (left-click or middle-click)
const handleMouseDown = (e) => {
  // Left mouse button (0) or middle mouse button (1)
  if (e.button === 0 || e.button === 1) {
    e.preventDefault()
    isDragging.value = true
    dragStart.value = { x: e.clientX - translateX.value, y: e.clientY - translateY.value }
  }
}

const handleMouseMove = (e) => {
  if (!isDragging.value) return
  e.preventDefault()
  translateX.value = e.clientX - dragStart.value.x
  translateY.value = e.clientY - dragStart.value.y
  constrainPan()
}

// Double-click to toggle zoom
const handleDoubleClick = (e) => {
  e.preventDefault()
  if (scale.value > 1) {
    resetTransform()
  } else {
    scale.value = 2
  }
}

// ============================================
// Touch Events for Mobile Devices
// ============================================

// Calculate distance between two touch points
const getTouchDistance = (touches) => {
  const dx = touches[0].clientX - touches[1].clientX
  const dy = touches[0].clientY - touches[1].clientY
  return Math.sqrt(dx * dx + dy * dy)
}

// Calculate center point between two touches
const getTouchCenter = (touches) => {
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2,
  }
}

const handleTouchStart = (e) => {
  if (!props.modelValue) return

  const touches = e.touches
  touchMoved.value = false

  if (touches.length === 1) {
    // Single finger - prepare for drag or double-tap
    isTouching.value = true
    touchStartPos.value = {
      x: touches[0].clientX - translateX.value,
      y: touches[0].clientY - translateY.value,
    }
    lastTouchCenter.value = {
      x: touches[0].clientX,
      y: touches[0].clientY,
    }
  } else if (touches.length === 2) {
    // Two fingers - prepare for pinch zoom
    e.preventDefault()
    isTouching.value = true
    touchStartDistance.value = getTouchDistance(touches)
    touchStartScale.value = scale.value
    lastTouchCenter.value = getTouchCenter(touches)
    touchStartPos.value = {
      x: lastTouchCenter.value.x - translateX.value,
      y: lastTouchCenter.value.y - translateY.value,
    }
  }
}

const handleTouchMove = (e) => {
  if (!props.modelValue || !isTouching.value) return

  const touches = e.touches
  touchMoved.value = true

  if (touches.length === 1 && scale.value > 1) {
    // Single finger drag (only when zoomed in)
    e.preventDefault()
    translateX.value = touches[0].clientX - touchStartPos.value.x
    translateY.value = touches[0].clientY - touchStartPos.value.y
    constrainPan()
  } else if (touches.length === 2) {
    // Two finger pinch zoom
    e.preventDefault()

    // Calculate new scale
    const currentDistance = getTouchDistance(touches)
    const scaleChange = currentDistance / touchStartDistance.value
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, touchStartScale.value * scaleChange))
    scale.value = newScale

    // Move with pinch center
    const currentCenter = getTouchCenter(touches)
    translateX.value = currentCenter.x - touchStartPos.value.x
    translateY.value = currentCenter.y - touchStartPos.value.y
    constrainPan()
  }
}

const handleTouchEnd = (e) => {
  if (!props.modelValue) return

  const touches = e.touches
  const changedTouch = e.changedTouches[0]

  // All fingers lifted
  if (touches.length === 0) {
    // Calculate swipe distance
    const deltaX = changedTouch.clientX - lastTouchCenter.value.x
    const deltaY = changedTouch.clientY - lastTouchCenter.value.y

    // Check for double-tap (only if minimal movement)
    if (!touchMoved.value || (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10)) {
      const now = Date.now()
      const timeDiff = now - lastTapTime.value

      if (timeDiff < 300 && timeDiff > 0) {
        // Double tap detected - toggle zoom
        e.preventDefault()
        if (scale.value > 1) {
          resetTransform()
        } else {
          scale.value = 2.5
        }
        lastTapTime.value = 0
        isTouching.value = false
        return
      } else {
        lastTapTime.value = now
      }
    }

    // Check for swipe down to close (only when not zoomed)
    if (scale.value <= 1 && touchMoved.value && deltaY > 80 && Math.abs(deltaX) < 50) {
      close()
      isTouching.value = false
      return
    }

    // Check for swipe navigation (only when not zoomed)
    if (scale.value <= 1 && touchMoved.value && Math.abs(deltaX) > 50) {
      if (deltaX > 0 && hasPrev.value) {
        goToPrev()
      } else if (deltaX < 0 && hasNext.value) {
        goToNext()
      }
    }

    isTouching.value = false
  } else if (touches.length === 1) {
    // One finger remaining - switch to single finger drag mode
    touchStartPos.value = {
      x: touches[0].clientX - translateX.value,
      y: touches[0].clientY - translateY.value,
    }
    touchStartDistance.value = 0
  }
}

// Computed transform style
const imageTransformStyle = computed(() => ({
  transform: `translate(${translateX.value}px, ${translateY.value}px) scale(${scale.value})`,
  cursor: isDragging.value ? 'grabbing' : (scale.value > 1 ? 'grab' : 'default'),
  transition: (isDragging.value || isTouching.value) ? 'none' : 'transform 0.1s ease-out',
}))

// Global mouseup to handle drag end even when mouse leaves the image
const handleGlobalMouseUp = () => {
  isDragging.value = false
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('mouseup', handleGlobalMouseUp)
  window.addEventListener('popstate', handlePopState)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('mouseup', handleGlobalMouseUp)
  window.removeEventListener('popstate', handlePopState)
  document.body.style.overflow = ''

  // Clean up history state if component unmounts while open
  if (historyStatePushed.value && history.state?.lightbox === true) {
    history.back()
  }
})

const getImageSrc = (image) => {
  // Historical images use Object URL from OPFS
  if (image.url) {
    return image.url
  }
  // Fresh images use base64 data
  if (image.data) {
    return `data:${image.mimeType};base64,${image.data}`
  }
  // Fallback: return placeholder or empty
  return ''
}

// Image dimensions
const imageDimensions = ref({ width: 0, height: 0 })

const onImageLoad = (e) => {
  imageDimensions.value = {
    width: e.target.naturalWidth,
    height: e.target.naturalHeight,
  }
}

// Calculate file size from base64 (for fresh images without metadata)
const calcBase64Size = (base64String) => {
  if (!base64String) return 0
  return Math.round((base64String.length * 3) / 4)
}

// Get current image metadata
const currentMetadata = computed(() => {
  if (!props.imageMetadata || props.imageMetadata.length === 0) return null
  return props.imageMetadata[currentIndex.value] || null
})

// Check if compression info is available
const hasCompressionInfo = computed(() => {
  return currentMetadata.value && currentMetadata.value.originalSize && currentMetadata.value.compressedSize
})

const currentImageInfo = computed(() => {
  if (!currentImage.value) return null

  const meta = currentMetadata.value
  const info = {
    width: meta?.width || imageDimensions.value.width,
    height: meta?.height || imageDimensions.value.height,
    mimeType: currentImage.value.mimeType,
  }

  // If we have metadata with compression info
  if (meta && meta.originalSize) {
    info.originalSize = formatFileSize(meta.originalSize)
    info.compressedSize = formatFileSize(meta.compressedSize)
    info.originalFormat = meta.originalFormat || 'image/png'
    info.compressionRatio = calculateCompressionRatio(meta.originalSize, meta.compressedSize)
  } else {
    // Fall back to calculating from base64
    info.size = formatFileSize(calcBase64Size(currentImage.value.data))
  }

  return info
})

// Handle download button click
const handleDownloadClick = () => {
  if (props.isHistorical) {
    downloadCurrentImage()
  } else {
    showDownloadMenu.value = !showDownloadMenu.value
  }
}

// Handle format selection
const handleFormatSelect = (format) => {
  downloadFormat.value = format
  localStorage.setItem(DOWNLOAD_PREF_KEY, format)
  showDownloadMenu.value = false
  downloadCurrentImage()
}

// Download current image
const isDownloading = ref(false)

const downloadCurrentImage = async () => {
  if (!currentImage.value || isDownloading.value) return

  isDownloading.value = true
  showDownloadMenu.value = false

  const link = document.createElement('a')
  const timestamp = Date.now()
  const imageNum = currentIndex.value + 1

  try {
    if (props.isHistorical) {
      // Historical images: always download WebP from OPFS
      const meta = currentMetadata.value
      if (meta?.opfsPath) {
        const base64 = await imageStorage.getImageBase64(meta.opfsPath)
        if (base64) {
          link.href = `data:image/webp;base64,${base64}`
          link.download = `generated-image-${timestamp}-${imageNum}.webp`
        }
      }
    } else if (downloadFormat.value === 'webp') {
      // Fresh image, download WebP
      if (currentMetadata.value?.opfsPath) {
        // WebP already saved in OPFS
        const base64 = await imageStorage.getImageBase64(currentMetadata.value.opfsPath)
        if (base64) {
          link.href = `data:image/webp;base64,${base64}`
          link.download = `generated-image-${timestamp}-${imageNum}.webp`
        }
      } else {
        // WebP not ready yet, compress on-the-fly
        const { compressToWebP, blobToBase64 } = await import('@/composables/useImageCompression')
        const compressed = await compressToWebP(currentImage.value, { quality: 0.85 })
        const base64 = await blobToBase64(compressed.blob)
        link.href = `data:image/webp;base64,${base64}`
        link.download = `generated-image-${timestamp}-${imageNum}.webp`
      }
    } else {
      // Fresh image, download original
      link.href = getImageSrc(currentImage.value)
      const ext = currentImage.value.mimeType?.split('/')[1] || 'png'
      link.download = `generated-image-${timestamp}-${imageNum}.${ext}`
    }

    if (link.href) {
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  } finally {
    isDownloading.value = false
  }
}

// Close download menu when clicking outside
const closeDownloadMenu = () => {
  showDownloadMenu.value = false
}

// Sticker Cropper state
const showCropper = ref(false)
const cropperImageSrc = ref('')

const openCropper = () => {
  if (!currentImage.value) return
  cropperImageSrc.value = getImageSrc(currentImage.value)
  showCropper.value = true
}

const closeCropper = () => {
  showCropper.value = false
  cropperImageSrc.value = ''
}

// Batch download state
const showBatchMenu = ref(false)
const isBatchDownloading = ref(false)

const toggleBatchMenu = () => {
  showBatchMenu.value = !showBatchMenu.value
  showDownloadMenu.value = false
}

// Convert image to blob
const imageToBlob = async (image) => {
  if (image.url) {
    // Historical images - fetch from Object URL
    const response = await fetch(image.url)
    return await response.blob()
  }
  if (image.data) {
    // Fresh images - convert base64 to blob
    const byteString = atob(image.data)
    const arrayBuffer = new ArrayBuffer(byteString.length)
    const uint8Array = new Uint8Array(arrayBuffer)
    for (let i = 0; i < byteString.length; i++) {
      uint8Array[i] = byteString.charCodeAt(i)
    }
    return new Blob([arrayBuffer], { type: image.mimeType || 'image/png' })
  }
  return null
}


// Download all images as ZIP
const downloadAllAsZip = async () => {
  if (props.images.length === 0 || isBatchDownloading.value) return

  isBatchDownloading.value = true
  showBatchMenu.value = false

  try {
    const zip = new JSZip()

    for (let i = 0; i < props.images.length; i++) {
      const image = props.images[i]
      const blob = await imageToBlob(image)
      if (blob) {
        const ext = image.mimeType?.split('/')[1] || 'png'
        zip.file(`image-${i + 1}.${ext}`, blob)
      }
    }

    const content = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(content)

    const link = document.createElement('a')
    link.href = url
    link.download = `images-${Date.now()}.zip`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    URL.revokeObjectURL(url)
  } catch (err) {
    console.error('ZIP generation failed:', err)
    toast.error(t('lightbox.zipError'))
  } finally {
    isBatchDownloading.value = false
  }
}

// Download all images as PDF (using Web Worker via composable)
const downloadAllAsPdf = async () => {
  if (props.images.length === 0 || isBatchDownloading.value) return

  isBatchDownloading.value = true
  showBatchMenu.value = false

  try {
    // Prepare image data for worker
    const imageDataArray = []
    for (const image of props.images) {
      const blob = await imageToBlob(image)
      if (!blob) continue

      const arrayBuffer = await blob.arrayBuffer()
      const mimeType = image.mimeType || blob.type || 'image/png'
      imageDataArray.push({ data: arrayBuffer, mimeType })
    }

    await pdfGenerator.generateAndDownload(imageDataArray, `images-${Date.now()}`)
  } catch (err) {
    console.error('PDF generation failed:', err)
    toast.error(t('lightbox.pdfError'))
  } finally {
    isBatchDownloading.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="lightbox">
      <div
        v-if="isVisible"
        class="lightbox-overlay"
        :class="{ 'is-closing': isClosing }"
        @click.self="close"
        @click="closeDownloadMenu"
      >
        <!-- Top toolbar -->
        <div class="lightbox-toolbar">
          <!-- Zoom indicator / Reset button -->
          <button
            v-if="scale !== 1"
            @click="resetTransform"
            class="lightbox-btn lightbox-zoom-indicator"
            :title="$t('lightbox.resetZoom')"
          >
            {{ Math.round(scale * 100) }}%
          </button>

          <!-- Crop button (only for sticker mode) -->
          <button
            v-if="isStickerMode"
            @click="openCropper"
            class="lightbox-btn flex items-center gap-2"
            :title="$t('lightbox.cropSticker')"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span class="text-xs font-medium">{{ $t('lightbox.crop') }}</span>
          </button>

          <!-- Download button with format selector -->
          <div class="download-container" @click.stop>
            <!-- Combined download button -->
            <button
              @click="handleDownloadClick"
              class="lightbox-btn flex items-center gap-2"
              :class="{ 'opacity-50 cursor-wait': isDownloading }"
              :disabled="isDownloading"
              :title="isHistorical ? $t('lightbox.downloadWebp') : $t('lightbox.selectFormat')"
            >
              <!-- Loading spinner -->
              <svg v-if="isDownloading" class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
              </svg>
              <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <!-- Show current format -->
              <span class="text-xs font-medium">
                {{ isHistorical ? $t('lightbox.webp') : (downloadFormat === 'webp' ? $t('lightbox.webp') : $t('lightbox.original')) }}
              </span>
              <!-- Dropdown arrow for fresh images -->
              <svg v-if="!isHistorical" class="w-3 h-3 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            <!-- Download format dropdown -->
            <div
              v-if="showDownloadMenu && !isHistorical"
              class="download-dropdown"
            >
              <button
                @click="handleFormatSelect('original')"
                class="download-option"
                :class="downloadFormat === 'original' ? 'active' : ''"
              >
                <span class="w-4">{{ downloadFormat === 'original' ? '✓' : '' }}</span>
                {{ $t('lightbox.originalFormat') }}
              </button>
              <button
                @click="handleFormatSelect('webp')"
                class="download-option"
                :class="downloadFormat === 'webp' ? 'active' : ''"
              >
                <span class="w-4">{{ downloadFormat === 'webp' ? '✓' : '' }}</span>
                WebP
              </button>
            </div>
          </div>

          <!-- Batch download button (only when multiple images) -->
          <div v-if="images.length > 1" class="download-container" @click.stop>
            <button
              @click="toggleBatchMenu"
              class="lightbox-btn flex items-center gap-2"
              :class="{ 'opacity-50 cursor-wait': isBatchDownloading }"
              :disabled="isBatchDownloading"
              :title="$t('lightbox.downloadAll')"
            >
              <svg v-if="isBatchDownloading" class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
              </svg>
              <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              <span class="text-xs font-medium">{{ $t('lightbox.all') }} ({{ images.length }})</span>
              <svg class="w-3 h-3 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            <!-- Batch download dropdown -->
            <div v-if="showBatchMenu" class="download-dropdown">
              <button @click="downloadAllAsZip" class="download-option">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                ZIP
              </button>
              <button @click="downloadAllAsPdf" class="download-option">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                PDF
              </button>
            </div>
          </div>

          <!-- Close button -->
          <button
            @click="close"
            class="lightbox-btn flex items-center gap-2"
            :title="$t('lightbox.close')"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span class="text-xs font-medium">{{ $t('lightbox.close') }}</span>
          </button>
        </div>


        <!-- Navigation: Previous -->
        <button
          v-if="images.length > 1"
          @click="goToPrev"
          :disabled="!hasPrev"
          class="lightbox-nav lightbox-nav-prev"
          :class="{ 'opacity-30 cursor-not-allowed': !hasPrev }"
        >
          <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <!-- Image container -->
        <div
          class="lightbox-content"
          @wheel.prevent="handleWheel"
          @mousedown="handleMouseDown"
          @mousemove="handleMouseMove"
          @dblclick="handleDoubleClick"
          @touchstart="handleTouchStart"
          @touchmove="handleTouchMove"
          @touchend="handleTouchEnd"
        >
          <div
            class="lightbox-image-wrapper"
            :class="{
              'slide-out-left': isAnimating && slideDirection === 'left',
              'slide-out-right': isAnimating && slideDirection === 'right',
              'slide-in-left': !isAnimating && slideDirection === 'left',
              'slide-in-right': !isAnimating && slideDirection === 'right',
            }"
          >
            <img
              v-if="currentImage"
              ref="imageRef"
              :src="getImageSrc(currentImage)"
              :alt="`Image ${currentIndex + 1}`"
              class="lightbox-image"
              :style="imageTransformStyle"
              draggable="false"
              @load="onImageLoad"
            />
          </div>
        </div>

        <!-- Navigation: Next -->
        <button
          v-if="images.length > 1"
          @click="goToNext"
          :disabled="!hasNext"
          class="lightbox-nav lightbox-nav-next"
          :class="{ 'opacity-30 cursor-not-allowed': !hasNext }"
        >
          <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <!-- Thumbnails / Dots -->
        <div v-if="images.length > 1" class="lightbox-dots">
          <button
            v-for="(image, index) in images"
            :key="index"
            @click="goToIndex(index)"
            class="lightbox-dot"
            :class="{ 'active': index === currentIndex }"
          >
            <span class="sr-only">Image {{ index + 1 }}</span>
          </button>
        </div>

        <!-- Counter -->
        <div class="lightbox-counter">
          {{ currentIndex + 1 }} / {{ images.length }}
        </div>

        <!-- Image Info -->
        <div v-if="currentImageInfo" class="lightbox-info">
          <!-- Dimensions -->
          <span v-if="currentImageInfo.width && currentImageInfo.height">
            {{ currentImageInfo.width }} × {{ currentImageInfo.height }}
          </span>

          <!-- Compression info (if available) -->
          <template v-if="hasCompressionInfo">
            <span class="lightbox-info-divider"></span>
            <span class="text-gray-400">{{ currentImageInfo.originalFormat?.split('/')[1]?.toUpperCase() || 'PNG' }}</span>
            <span class="text-gray-500">{{ currentImageInfo.originalSize }}</span>
            <span class="lightbox-info-arrow">→</span>
            <span class="text-purple-400">WebP</span>
            <span class="text-purple-300">{{ currentImageInfo.compressedSize }}</span>
            <span class="lightbox-info-ratio text-emerald-400">-{{ currentImageInfo.compressionRatio }}%</span>
          </template>

          <!-- Simple size (no compression info) -->
          <template v-else-if="currentImageInfo.size">
            <span class="lightbox-info-divider"></span>
            <span>{{ currentImageInfo.size }}</span>
          </template>

          <!-- Historical indicator -->
          <template v-if="isHistorical">
            <span class="lightbox-info-divider"></span>
            <span class="text-amber-400 text-xs">{{ $t('lightbox.historical') }}</span>
          </template>
        </div>
      </div>
    </Transition>

    <!-- Sticker Cropper -->
    <StickerCropper
      v-model="showCropper"
      :image-src="cropperImageSrc"
      :image-index="currentIndex"
      :history-id="historyId"
      @close="closeCropper"
    />
  </Teleport>
</template>

<style scoped>
.lightbox-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.95);
  backdrop-filter: blur(8px);
  animation: lightbox-fade-in 0.3s ease-out;
}

.lightbox-overlay.is-closing {
  animation: lightbox-fade-out 0.3s ease-out forwards;
}

@keyframes lightbox-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes lightbox-fade-out {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

.lightbox-toolbar {
  position: absolute;
  top: 1rem;
  right: 1rem;
  z-index: 20;
  display: flex;
  gap: 0.5rem;
}

.lightbox-btn {
  padding: 0.75rem;
  color: white;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 9999px;
  transition: all 0.2s;
}

.lightbox-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(1.1);
}

.lightbox-zoom-indicator {
  font-size: 0.875rem;
  font-weight: 500;
  min-width: 3.5rem;
  font-variant-numeric: tabular-nums;
}

.lightbox-nav {
  position: absolute;
  top: 50%;
  z-index: 10;
  transform: translateY(-50%);
  padding: 1rem;
  color: white;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 9999px;
  transition: all 0.2s;
}

.lightbox-nav:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.2);
  transform: translateY(-50%) scale(1.1);
}

.lightbox-nav-prev {
  left: 1rem;
}

.lightbox-nav-next {
  right: 1rem;
}

.lightbox-content {
  max-width: 90vw;
  max-height: 85vh;
  overflow: visible;
  user-select: none;
  touch-action: none;
}

.lightbox-image-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  animation: lightbox-zoom-in 0.3s ease-out;
}

@keyframes lightbox-zoom-in {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.lightbox-overlay.is-closing .lightbox-image-wrapper {
  animation: lightbox-zoom-out 0.3s ease-out forwards;
}

@keyframes lightbox-zoom-out {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.9);
  }
}

/* Slide animations */
.slide-out-left {
  animation: slide-out-left 0.15s ease-in forwards;
}

.slide-out-right {
  animation: slide-out-right 0.15s ease-in forwards;
}

.slide-in-left {
  animation: slide-in-left 0.15s ease-out;
}

.slide-in-right {
  animation: slide-in-right 0.15s ease-out;
}

@keyframes slide-out-left {
  to {
    opacity: 0;
    transform: translateX(-50px);
  }
}

@keyframes slide-out-right {
  to {
    opacity: 0;
    transform: translateX(50px);
  }
}

@keyframes slide-in-left {
  from {
    opacity: 0;
    transform: translateX(50px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes slide-in-right {
  from {
    opacity: 0;
    transform: translateX(-50px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.lightbox-image {
  max-width: 90vw;
  max-height: 85vh;
  object-fit: contain;
  border-radius: 0.5rem;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}

.lightbox-dots {
  position: absolute;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 0.5rem;
}

.lightbox-dot {
  width: 0.625rem;
  height: 0.625rem;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.3);
  transition: all 0.2s;
}

.lightbox-dot:hover {
  background: rgba(255, 255, 255, 0.5);
}

.lightbox-dot.active {
  background: white;
  transform: scale(1.2);
}

.lightbox-counter {
  position: absolute;
  bottom: 1.5rem;
  right: 1.5rem;
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.875rem;
  font-variant-numeric: tabular-nums;
}

.lightbox-info {
  position: absolute;
  bottom: 1.5rem;
  left: 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 0.5rem;
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
}

.lightbox-info-divider {
  width: 1px;
  height: 1rem;
  background: rgba(255, 255, 255, 0.3);
}

.lightbox-info-arrow {
  color: rgba(255, 255, 255, 0.4);
  margin: 0 0.25rem;
}

.lightbox-info-ratio {
  font-weight: 500;
  margin-left: 0.25rem;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

/* Download button container */
.download-container {
  position: relative;
}

/* Download format dropdown */
.download-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 0.5rem;
  min-width: 8rem;
  background: rgba(30, 30, 40, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
  backdrop-filter: blur(8px);
  overflow: hidden;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
  z-index: 30;
}

/* Download option - force light text on dark bg regardless of theme */
.download-option {
  width: 100%;
  padding: 0.5rem 1rem;
  text-align: left;
  font-size: 0.875rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #ffffff !important;
  background: transparent;
  transition: background 0.15s;
}

.download-option:hover {
  background: rgba(255, 255, 255, 0.1);
}

.download-option.active {
  color: #c084fc !important; /* purple-400 */
}

/* Vue transition */
.lightbox-enter-active,
.lightbox-leave-active {
  transition: opacity 0.3s ease;
}

.lightbox-enter-from,
.lightbox-leave-to {
  opacity: 0;
}
</style>
