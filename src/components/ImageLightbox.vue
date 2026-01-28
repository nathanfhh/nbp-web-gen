<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { formatFileSize, calculateCompressionRatio } from '@/composables/useImageCompression'
import { useImageStorage } from '@/composables/useImageStorage'
import { usePdfGenerator } from '@/composables/usePdfGenerator'
import { useToast } from '@/composables/useToast'
import { useHistoryState } from '@/composables/useHistoryState'
import { useLightboxZoom } from '@/composables/useLightboxZoom'
import { useLightboxTouch } from '@/composables/useLightboxTouch'
import { useLightboxDownload } from '@/composables/useLightboxDownload'
import StickerCropper from '@/components/StickerCropper.vue'
import LightboxAudioPlayer from '@/components/LightboxAudioPlayer.vue'

const { t } = useI18n()
const toast = useToast()
const router = useRouter()

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
  // Is this from slides mode (show PPTX button)
  isSlidesMode: {
    type: Boolean,
    default: false,
  },
  // History ID for unique sticker naming
  historyId: {
    type: Number,
    default: null,
  },
  // OCR regions for overlay (merged/raw/failed)
  ocrRegions: {
    type: Object,
    default: () => ({ merged: [], raw: [], failed: [] }),
  },
  // Show OCR overlay
  showOcrOverlay: {
    type: Boolean,
    default: false,
  },
  // Show merged regions
  showMergedRegions: {
    type: Boolean,
    default: true,
  },
  // Show raw regions
  showRawRegions: {
    type: Boolean,
    default: true,
  },
  // Show failed regions (recognition failed)
  showFailedRegions: {
    type: Boolean,
    default: true,
  },
  // Edit mode - disables zoom/pan and enables region editing
  isEditMode: {
    type: Boolean,
    default: false,
  },
  // Hide file size info (for slides mode)
  hideFileSize: {
    type: Boolean,
    default: false,
  },
  // Show "Edit Regions" button (for slides mode OCR editing)
  showEditRegionsButton: {
    type: Boolean,
    default: false,
  },
  // Narration audio URLs (per-page, indexed by image index)
  narrationAudioUrls: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['update:modelValue', 'close', 'edit-regions', 'select-region'])

// Image storage for OPFS access (used by useLightboxDownload)
const imageStorage = useImageStorage()

// PDF generator
const pdfGenerator = usePdfGenerator()

// Initialize zoom composable
const {
  scale,
  translateX,
  translateY,
  isDragging,
  imageRef,
  resetTransform,
  constrainPan,
  handleWheel: zoomHandleWheel,
  handleMouseDown,
  handleMouseMove,
  handleGlobalMouseUp,
  handleDoubleClick,
  focusOnRegion,
} = useLightboxZoom()

// Initialize touch composable with zoom dependencies
const {
  isTouching,
  handleTouchStart: touchHandleStart,
  handleTouchMove: touchHandleMove,
  handleTouchEnd: touchHandleEnd,
} = useLightboxTouch({ scale, translateX, translateY, resetTransform, constrainPan })

// Initialize download composable
const {
  showDownloadMenu,
  isAnyDownloading,
  toggleDownloadMenu,
  closeDownloadMenu,
  getImageSrc,
  downloadWithFormat,
  downloadCurrentImage: downloadDownloadCurrentImage,
  downloadAllAsZip: downloadDownloadAllAsZip,
  downloadAllAsPdf: downloadDownloadAllAsPdf,
  downloadCurrentAudio: downloadDownloadCurrentAudio,
  downloadAllAudioAsZip: downloadDownloadAllAudioAsZip,
} = useLightboxDownload({ imageStorage, pdfGenerator, toast, t })

// Computed image transform style (needs isTouching from touch composable)
const imageTransformStyle = computed(() => ({
  transform: `translate(${translateX.value}px, ${translateY.value}px) scale(${scale.value})`,
  cursor: isDragging.value ? 'grabbing' : (scale.value > 1 ? 'grab' : 'default'),
  transition: (isDragging.value || isTouching.value) ? 'none' : 'transform 0.1s ease-out',
}))

const currentIndex = ref(props.initialIndex)
const isAnimating = ref(false)
const isVisible = ref(false)
const isClosing = ref(false)

// Region sidebar state (for edit mode)
const isRegionSidebarOpen = ref(false)
const imageContainerRef = ref(null)

// Combined region list for sidebar (only raw and failed - merged are not editable)
const visibleRegions = computed(() => {
  const regions = []

  // Add raw regions (green) - successfully recognized text
  if (props.ocrRegions.raw) {
    props.ocrRegions.raw.forEach((r, idx) => {
      regions.push({
        ...r,
        type: 'raw',
        color: 'green',
        label: t('lightbox.regionList.raw'),
        originalIndex: idx,
      })
    })
  }

  // Add failed regions (red) - detection without recognition
  if (props.ocrRegions.failed) {
    props.ocrRegions.failed.forEach((r, idx) => {
      regions.push({
        ...r,
        type: 'failed',
        color: 'red',
        label: t('lightbox.regionList.failed'),
        originalIndex: idx,
      })
    })
  }

  return regions
})

// Check if region sidebar should be available
const showRegionSidebar = computed(() => {
  return props.isEditMode && visibleRegions.value.length > 0
})

// Handle region click - navigate to region and emit select event
const handleRegionClick = (region) => {
  if (!imageDimensions.value.width || !imageContainerRef.value) return

  const containerRect = imageContainerRef.value.getBoundingClientRect()
  focusOnRegion(
    region.bounds,
    imageDimensions.value,
    { width: containerRect.width, height: containerRect.height }
  )

  // Emit select-region event for parent to handle (e.g., select in OcrRegionEditor)
  // Only raw and failed types can be selected (merged regions are computed, not editable)
  if (region.type === 'raw' || region.type === 'failed') {
    emit('select-region', { type: region.type, index: region.originalIndex })
  }

  // Auto-close sidebar after clicking
  isRegionSidebarOpen.value = false
}

// Toggle region sidebar
const toggleRegionSidebar = () => {
  isRegionSidebarOpen.value = !isRegionSidebarOpen.value
}

// History state management for back gesture/button support
const { pushState, popState, cleanupBeforeNavigation } = useHistoryState('lightbox', {
  onBackNavigation: () => {
    // User pressed back while lightbox is open - close it
    emit('update:modelValue', false)
  },
})

// Watch for external open
watch(() => props.modelValue, (newVal) => {
  if (newVal) {
    currentIndex.value = props.initialIndex
    isVisible.value = true
    isClosing.value = false
    resetTransform()
    document.body.style.overflow = 'hidden'

    // Push history state to intercept back gesture/button
    pushState()
  } else {
    isClosing.value = true

    // Pop the history state we added (if still there)
    popState()

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

/**
 * Navigate with View Transition API (crossfade effect)
 * Falls back to instant change for unsupported browsers (Firefox)
 */
const navigateWithTransition = (updateFn) => {
  // Fallback for browsers without View Transition API
  if (!document.startViewTransition) {
    updateFn()
    return
  }

  isAnimating.value = true
  const transition = document.startViewTransition(() => {
    updateFn()
  })

  transition.finished.finally(() => {
    isAnimating.value = false
  })
}

const goToPrev = () => {
  if (!hasPrev.value || isAnimating.value) return
  navigateWithTransition(() => {
    currentIndex.value--
  })
}

const goToNext = () => {
  if (!hasNext.value || isAnimating.value) return
  navigateWithTransition(() => {
    currentIndex.value++
  })
}

const goToIndex = (index) => {
  if (index === currentIndex.value || isAnimating.value) return
  navigateWithTransition(() => {
    currentIndex.value = index
  })
}

// Keyboard navigation
const handleKeydown = (e) => {
  if (!props.modelValue) return

  // When StickerCropper is open, let it handle keyboard events
  // to prevent accidentally closing the lightbox while cropping
  if (showCropper.value) return

  switch (e.key) {
    case 'ArrowLeft':
    case 'ArrowUp':
      e.preventDefault()
      goToPrev()
      break
    case 'ArrowRight':
    case 'ArrowDown':
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

// Wheel event wrapper - global listener for robust handling
const handleWheel = (e) => {
  if (!props.modelValue) return
  // We need to prevent default behavior (scrolling) when lightbox is open
  // This is handled by zoomHandleWheel, but checking here explicitly 
  // ensures we don't interfere when closed.
  zoomHandleWheel(e, props.modelValue)
}

// Mouse down wrapper - simplified for better UX
// If event reaches here (passed through SVG background), it's a drag/pan
const handleMouseDownWrapper = (e) => {
  handleMouseDown(e)
}

// Double click wrapper - disabled in edit mode
const handleDoubleClickWrapper = (e) => {
  if (props.isEditMode) return
  handleDoubleClick(e)
}

// Touch event wrappers - enabled in edit mode for panning
const handleTouchStart = (e) => {
  touchHandleStart(e, props.modelValue)
}

const handleTouchMove = (e) => {
  touchHandleMove(e, props.modelValue)
}

const handleTouchEnd = (e) => {
  touchHandleEnd(e, props.modelValue, {
    close,
    goToPrev,
    goToNext,
    hasPrev: hasPrev.value,
    hasNext: hasNext.value,
  })
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('mouseup', handleGlobalMouseUp)
  // Use non-passive listener to allow preventing default scroll
  window.addEventListener('wheel', handleWheel, { passive: false })
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('mouseup', handleGlobalMouseUp)
  window.removeEventListener('wheel', handleWheel)
  document.body.style.overflow = ''
  // Note: useHistoryState handles its own cleanup in onUnmounted
})

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

// Current page's narration audio URL
const currentAudioUrl = computed(() => {
  if (!props.narrationAudioUrls?.length) return null
  return props.narrationAudioUrls[currentIndex.value] || null
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

// Download wrapper functions
const downloadWithFormatWrapper = async (format) => {
  await downloadWithFormat(format, downloadCurrentImage)
}

const downloadCurrentImage = async () => {
  await downloadDownloadCurrentImage({
    currentImage: currentImage.value,
    currentMetadata: currentMetadata.value,
    currentIndex: currentIndex.value,
    isHistorical: props.isHistorical,
  })
}

const downloadAllAsZip = async () => {
  await downloadDownloadAllAsZip({
    images: props.images,
    historyId: props.historyId,
    audioUrls: props.narrationAudioUrls,
  })
}

const downloadAllAsPdf = async () => {
  await downloadDownloadAllAsPdf({
    images: props.images,
    historyId: props.historyId,
  })
}

// Narration audio download helpers
const hasAnyAudio = computed(() =>
  props.narrationAudioUrls.some((url) => !!url),
)
const hasCurrentAudio = computed(() =>
  !!props.narrationAudioUrls[currentIndex.value],
)

const downloadCurrentAudio = async () => {
  await downloadDownloadCurrentAudio({
    audioUrl: props.narrationAudioUrls[currentIndex.value],
    currentIndex: currentIndex.value,
    historyId: props.historyId,
  })
}

const downloadAllAudioAsZip = async () => {
  await downloadDownloadAllAudioAsZip({
    audioUrls: props.narrationAudioUrls,
    historyId: props.historyId,
  })
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

// Handle extract character from StickerCropper
const handleExtractCharacter = async () => {
  // Close the cropper UI only
  showCropper.value = false
  cropperImageSrc.value = ''

  // Clean up body overflow
  document.body.style.overflow = ''

  // Wait for StickerCropper to process the change and pop its history state
  await nextTick()

  // Wait for StickerCropper history state to be removed
  // This prevents race conditions where nested history.back() calls conflict with router.push()
  const waitForStateCleanup = async (key) => {
    const startTime = Date.now()
    while (history.state && history.state[key] && Date.now() - startTime < 500) {
      await new Promise(r => setTimeout(r, 50))
    }
  }

  await waitForStateCleanup('stickerCropper')

  // CRITICAL: Remove lightbox's history state before vue-router navigation
  // Uses robust history state cleanup (waits for state change instead of fixed timeout)
  await cleanupBeforeNavigation()

  // Final safety check: if we are still in a "lightbox" state (e.g. timeout), force another back
  if (history.state?.lightbox) {
    history.back()
    await waitForStateCleanup('lightbox')
  }

  // Navigate to character extractor
  try {
    await router.push({ name: 'character-extractor', query: { image: '1' } })
  } catch (err) {
    console.error('Router push failed, falling back to location assignment:', err)
    // Fallback for corrupted history state (SecurityError etc)
    const targetUrl = router.resolve({ name: 'character-extractor', query: { image: '1' } }).href
    window.location.href = targetUrl
  }
}

// Navigate to Slide to PPTX tool (for slides mode)
const goToSlideToPptx = async () => {
  if (!props.historyId) {
    toast.error(t('errors.noImagesLoaded'))
    return
  }

  // Clean up body overflow
  document.body.style.overflow = ''

  // Clean up history state before navigation
  await cleanupBeforeNavigation()

  // Navigate to slide-to-pptx tool with history-id
  try {
    await router.push({
      name: 'slide-to-pptx',
      query: { 'history-id': props.historyId },
    })
  } catch (err) {
    console.error('Router push failed, falling back to location assignment:', err)
    const targetUrl = router.resolve({
      name: 'slide-to-pptx',
      query: { 'history-id': props.historyId },
    }).href
    window.location.href = targetUrl
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
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
            </svg>
            <span class="text-xs font-medium">{{ $t('lightbox.crop') }}</span>
          </button>

          <!-- PPTX button (only for slides mode) -->
          <button
            v-if="isSlidesMode"
            @click="goToSlideToPptx"
            class="lightbox-btn flex items-center gap-2"
            :title="$t('lightbox.convertToPptx')"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span class="text-xs font-medium">PPTX</span>
          </button>

          <!-- Edit Regions button (for OCR editing in slides mode) -->
          <button
            v-if="showEditRegionsButton && !isEditMode"
            @click="emit('edit-regions')"
            class="lightbox-btn flex items-center gap-2"
            :title="$t('lightbox.editRegions')"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <span class="text-xs font-medium">{{ $t('lightbox.editRegions') }}</span>
          </button>

          <!-- Unified download button -->
          <div class="download-container" @click.stop>
            <button
              @click="toggleDownloadMenu"
              class="lightbox-btn flex items-center gap-2"
              :class="{ 'opacity-50 cursor-wait': isAnyDownloading }"
              :disabled="isAnyDownloading"
              :title="$t('common.download')"
            >
              <!-- Loading spinner -->
              <svg v-if="isAnyDownloading" class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
              </svg>
              <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <!-- Hide text and chevron on mobile -->
              <span class="hidden sm:inline text-xs font-medium">{{ $t('common.download') }}</span>
              <svg class="hidden sm:block w-3 h-3 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            <!-- Unified download dropdown -->
            <div v-if="showDownloadMenu" class="download-dropdown download-dropdown-wide">
              <!-- Current image section -->
              <div class="download-section-label">{{ $t('lightbox.currentImage') }}</div>
              <button
                v-if="!isHistorical"
                @click="downloadWithFormatWrapper('original')"
                class="download-option"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {{ $t('lightbox.originalFormat') }}
              </button>
              <button
                @click="downloadWithFormatWrapper('webp')"
                class="download-option"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                WebP
              </button>

              <!-- Divider -->
              <div class="download-divider"></div>

              <!-- Batch download section -->
              <div class="download-section-label">
                {{ images.length > 1 ? $t('lightbox.allImages', { count: images.length }) : $t('lightbox.exportAs') }}
              </div>
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

              <!-- Narration audio section -->
              <template v-if="hasAnyAudio">
                <div class="download-divider"></div>
                <div class="download-section-label">
                  {{ $t('lightbox.narrationAudio') }}
                </div>
                <button
                  v-if="hasCurrentAudio"
                  @click="downloadCurrentAudio"
                  class="download-option"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072M12 6v12m0 0l-3-3m3 3l3-3" />
                  </svg>
                  {{ $t('lightbox.currentAudio') }}
                </button>
                <button @click="downloadAllAudioAsZip" class="download-option">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072M12 6v12m0 0l-3-3m3 3l3-3" />
                  </svg>
                  {{ $t('lightbox.allAudioZip') }}
                </button>
              </template>
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
            <!-- Hide text on mobile -->
            <span class="hidden sm:inline text-xs font-medium">{{ $t('lightbox.close') }}</span>
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
          ref="imageContainerRef"
          class="lightbox-content"
          @mousedown="handleMouseDownWrapper"
          @mousemove="handleMouseMove"
          @dblclick="handleDoubleClickWrapper"
          @touchstart="handleTouchStart"
          @touchmove="handleTouchMove"
          @touchend="handleTouchEnd"
        >
          <div class="lightbox-image-wrapper relative">
            <!-- Grid container to stack Image and SVG perfectly -->
            <div 
              class="grid" 
              style="grid-template-areas: 'stack';"
              :style="imageTransformStyle"
            >
              <img
                v-if="currentImage"
                ref="imageRef"
                :key="currentIndex"
                :src="getImageSrc(currentImage)"
                :alt="`Image ${currentIndex + 1}`"
                class="lightbox-image"
                style="grid-area: stack; view-transition-name: lightbox-img;"
                draggable="false"
                @load="onImageLoad"
              />

              <!-- SVG Overlay -->
              <svg
                v-if="showOcrOverlay && imageDimensions.width > 0 && (ocrRegions.merged.length > 0 || ocrRegions.raw.length > 0 || ocrRegions.failed?.length > 0)"
                class="lightbox-image pointer-events-none"
                style="grid-area: stack; width: 100%; height: 100%; position: relative; z-index: 1;"
                :viewBox="`0 0 ${imageDimensions.width} ${imageDimensions.height}`"
                preserveAspectRatio="none"
              >
                <!-- Merged Regions (Blue) -->
                <template v-if="showMergedRegions">
                  <template v-for="(result, idx) in ocrRegions.merged" :key="`merged-${idx}`">
                    <polygon
                      v-if="result.isPolygonMode && result.polygon"
                      :points="result.polygon.map(p => p.join(',')).join(' ')"
                      fill="rgba(59, 130, 246, 0.2)"
                      stroke="rgba(59, 130, 246, 0.8)"
                      stroke-width="2"
                      vector-effect="non-scaling-stroke"
                    />
                    <rect
                      v-else
                      :x="result.bounds.x"
                      :y="result.bounds.y"
                      :width="result.bounds.width"
                      :height="result.bounds.height"
                      fill="rgba(59, 130, 246, 0.2)"
                      stroke="rgba(59, 130, 246, 0.8)"
                      stroke-width="2"
                      vector-effect="non-scaling-stroke"
                    />
                  </template>
                </template>
                <!-- Raw Regions (Green Dashed) -->
                <template v-if="showRawRegions">
                  <template v-for="(result, idx) in ocrRegions.raw" :key="`raw-${idx}`">
                    <polygon
                      v-if="result.isPolygonMode && result.polygon"
                      :points="result.polygon.map(p => p.join(',')).join(' ')"
                      fill="rgba(16, 185, 129, 0.1)"
                      stroke="rgba(16, 185, 129, 0.8)"
                      stroke-width="1"
                      stroke-dasharray="4"
                      vector-effect="non-scaling-stroke"
                    />
                    <rect
                      v-else
                      :x="result.bounds.x"
                      :y="result.bounds.y"
                      :width="result.bounds.width"
                      :height="result.bounds.height"
                      fill="rgba(16, 185, 129, 0.1)"
                      stroke="rgba(16, 185, 129, 0.8)"
                      stroke-width="1"
                      stroke-dasharray="4"
                      vector-effect="non-scaling-stroke"
                    />
                  </template>
                </template>
                <!-- Failed Regions (Red Dashed) -->
                <template v-if="showFailedRegions && ocrRegions.failed?.length > 0">
                  <template v-for="(result, idx) in ocrRegions.failed" :key="`failed-${idx}`">
                    <polygon
                      v-if="result.isPolygonMode && result.polygon"
                      :points="result.polygon.map(p => p.join(',')).join(' ')"
                      fill="rgba(239, 68, 68, 0.15)"
                      stroke="rgba(239, 68, 68, 0.9)"
                      stroke-width="2"
                      stroke-dasharray="6 3"
                      vector-effect="non-scaling-stroke"
                    />
                    <rect
                      v-else
                      :x="result.bounds.x"
                      :y="result.bounds.y"
                      :width="result.bounds.width"
                      :height="result.bounds.height"
                      fill="rgba(239, 68, 68, 0.15)"
                      stroke="rgba(239, 68, 68, 0.9)"
                      stroke-width="2"
                      stroke-dasharray="6 3"
                      vector-effect="non-scaling-stroke"
                    />
                  </template>
                </template>
              </svg>

              <!-- Edit Overlay Slot - for custom region editing UI -->
              <slot
                name="edit-overlay"
                :image-dimensions="imageDimensions"
                :scale="scale"
                :translate-x="translateX"
                :translate-y="translateY"
                :is-edit-mode="isEditMode"
              />

            </div>
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

        <!-- Audio Player (for slides with narration) -->
        <LightboxAudioPlayer :audioUrl="currentAudioUrl" />

        <!-- Image Info (centered, responsive) -->
        <div v-if="currentImageInfo" class="lightbox-info">
          <!-- Row 1: Basic info -->
          <div class="lightbox-info-row">
            <!-- Dimensions -->
            <span v-if="currentImageInfo.width && currentImageInfo.height">
              {{ currentImageInfo.width }} × {{ currentImageInfo.height }}
            </span>

            <!-- Simple size (no compression info) -->
            <template v-if="!hasCompressionInfo && currentImageInfo.size">
              <span class="lightbox-info-divider"></span>
              <span>{{ currentImageInfo.size }}</span>
            </template>

            <!-- Historical indicator -->
            <template v-if="isHistorical">
              <span class="lightbox-info-divider"></span>
              <span class="text-status-warning">{{ $t('lightbox.historical') }}</span>
            </template>

            <!-- Counter -->
            <span class="lightbox-info-divider"></span>
            <span class="lightbox-counter-inline">{{ currentIndex + 1 }} / {{ images.length }}</span>
          </div>

          <!-- Row 2: Compression info (separate row on mobile) -->
          <div v-if="hasCompressionInfo && !hideFileSize" class="lightbox-info-row lightbox-info-compression">
            <span class="text-text-muted">{{ currentImageInfo.originalFormat?.split('/')[1]?.toUpperCase() || 'PNG' }}</span>
            <span class="text-text-muted">{{ currentImageInfo.originalSize }}</span>
            <span class="lightbox-info-arrow">→</span>
            <span class="text-mode-generate">WebP</span>
            <span class="text-mode-generate">{{ currentImageInfo.compressedSize }}</span>
            <span class="lightbox-info-ratio text-status-success">-{{ currentImageInfo.compressionRatio }}%</span>
          </div>
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
      @extract-character="handleExtractCharacter"
    />
  </Teleport>

  <!-- Region Sidebar - Teleported to body to be above edit-toolbar -->
  <Teleport to="body">
    <!-- Region Sidebar Toggle Button -->
    <button
      v-if="isVisible && showRegionSidebar"
      @click.stop="toggleRegionSidebar"
      class="region-sidebar-toggle"
      :class="{ 'is-open': isRegionSidebarOpen }"
      :title="$t('lightbox.regionList.toggle')"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          :d="isRegionSidebarOpen ? 'M15 19l-7-7 7-7' : 'M4 6h16M4 12h16M4 18h16'"
        />
      </svg>
    </button>

    <!-- Region List Sidebar -->
    <div
      v-if="isVisible && showRegionSidebar"
      class="region-sidebar"
      :class="{ 'is-open': isRegionSidebarOpen }"
      @click.stop
      @mousedown.stop
      @touchstart.stop
      @wheel.stop
    >
      <div class="region-sidebar-header">
        <span class="text-sm font-medium text-text-primary">
          {{ $t('lightbox.regionList.title') }}
        </span>
        <span class="text-xs text-text-muted">
          ({{ visibleRegions.length }})
        </span>
      </div>
      <div class="region-sidebar-list">
        <button
          v-for="(region, idx) in visibleRegions"
          :key="`${region.type}-${region.originalIndex}`"
          @click="handleRegionClick(region)"
          @mousedown.stop
          @touchstart.stop
          class="region-sidebar-item"
        >
          <span
            class="region-color-dot"
            :class="{
              'bg-green-500': region.color === 'green',
              'bg-red-500': region.color === 'red',
            }"
          ></span>
          <div class="region-item-content">
            <span class="region-item-index">#{{ idx + 1 }}</span>
            <span class="region-item-label">{{ region.label }}</span>
            <span v-if="region.text" class="region-item-text">
              {{ region.text.slice(0, 20) }}{{ region.text.length > 20 ? '...' : '' }}
            </span>
          </div>
        </button>
      </div>
    </div>
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
  /* Ensure no extra padding/margin affects centering */
  padding: 0;
  margin: 0;
  box-sizing: border-box;
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

/* Mobile: ensure consistent button height */
@media (max-width: 639px) {
  .lightbox-btn {
    min-height: 2.75rem;
    min-width: 2.75rem;
    padding: 0.625rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }
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
  /* Ensure perfect centering in flex container */
  margin: auto;
  position: relative;
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

.lightbox-counter-inline {
  color: rgba(255, 255, 255, 0.6);
  font-variant-numeric: tabular-nums;
}

.lightbox-info {
  position: absolute;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem 0.75rem;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 0.5rem;
  view-transition-name: lightbox-info;
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  max-width: calc(100vw - 2rem);
}

.lightbox-info-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  white-space: nowrap;
}

.lightbox-info-compression {
  opacity: 0.85;
}

/* Desktop: single row layout */
@media (min-width: 640px) {
  .lightbox-info {
    flex-direction: row;
    gap: 0.5rem;
  }

  .lightbox-info-compression {
    padding-left: 0.5rem;
    border-left: 1px solid rgba(255, 255, 255, 0.2);
  }
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
  left: 0;
  right: 0;
  margin-top: 0.5rem;
  min-width: max-content;
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
  color: var(--color-brand-primary-light) !important;
}

/* Wide dropdown for unified download menu */
.download-dropdown-wide {
  min-width: 10rem;
}

/* Section label in dropdown */
.download-section-label {
  padding: 0.375rem 1rem;
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.5);
}

/* Divider in dropdown */
.download-divider {
  height: 1px;
  margin: 0.375rem 0;
  background: rgba(255, 255, 255, 0.1);
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

/* Region Sidebar - positioned at lightbox-overlay level */
.region-sidebar {
  position: fixed;
  top: 4.5rem; /* Below toolbar */
  left: 0;
  bottom: 4rem; /* Above dots/info */
  width: 280px;
  max-width: calc(100% - 3.5rem); /* Leave space for toggle button */
  background: rgba(20, 20, 30, 0.95);
  backdrop-filter: blur(12px);
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0 0.75rem 0.75rem 0;
  display: flex;
  flex-direction: column;
  z-index: 10003; /* Above edit-toolbar (10002) */
  overflow: hidden;
  /* Default: hidden (slide out) */
  transform: translateX(-100%);
  opacity: 0;
  pointer-events: none;
  transition: transform 0.25s ease, opacity 0.25s ease;
}

/* Open state */
.region-sidebar.is-open {
  transform: translateX(0);
  opacity: 1;
  pointer-events: auto;
}

/* Mobile: full width */
@media (max-width: 639px) {
  .region-sidebar {
    top: 4rem;
    width: 85%;
    max-width: 85%;
    border-right: none;
  }
}

.region-sidebar-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}

.region-sidebar-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
}

.region-sidebar-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 0.75rem;
  margin-bottom: 0.25rem;
  text-align: left;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 0.5rem;
  transition: background 0.15s, transform 0.15s;
}

.region-sidebar-item:hover {
  background: rgba(255, 255, 255, 0.12);
  transform: translateX(2px);
}

.region-sidebar-item:active {
  transform: scale(0.98);
}

.region-color-dot {
  width: 0.625rem;
  height: 0.625rem;
  border-radius: 9999px;
  flex-shrink: 0;
}

.region-item-content {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
  flex: 1;
}

.region-item-index {
  font-size: 0.625rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.region-item-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.9);
}

.region-item-text {
  font-size: 0.6875rem;
  color: rgba(255, 255, 255, 0.5);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Sidebar Toggle Button - positioned at lightbox-overlay level */
.region-sidebar-toggle {
  position: fixed;
  top: 4.5rem; /* Align with sidebar top */
  left: 0.75rem;
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(30, 30, 40, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 0.5rem;
  color: white;
  z-index: 10004; /* Above sidebar (10003) */
  transition: all 0.2s;
}

.region-sidebar-toggle:hover {
  background: rgba(50, 50, 60, 0.95);
  transform: scale(1.05);
}

.region-sidebar-toggle.is-open {
  left: calc(280px + 0.5rem);
}

/* Mobile: toggle position */
@media (max-width: 639px) {
  .region-sidebar-toggle {
    top: 4rem;
  }

  .region-sidebar-toggle.is-open {
    left: calc(85% + 0.5rem);
  }
}

</style>

<!-- Global styles for View Transition API (cannot be scoped) -->
<style>
/* Crossfade animation for lightbox image */
::view-transition-old(lightbox-img),
::view-transition-new(lightbox-img) {
  animation-duration: 0.2s;
  animation-timing-function: ease-out;
}

/* Keep info bar stable during transition */
::view-transition-old(lightbox-info),
::view-transition-new(lightbox-info) {
  animation: none;
}

/* Disable root transition to only animate the image */
::view-transition-old(root),
::view-transition-new(root) {
  animation: none;
}
</style>
