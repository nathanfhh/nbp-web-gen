<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useToast } from '@/composables/useToast'
import { useSlideToPptx } from '@/composables/useSlideToPptx'
import { useIndexedDB } from '@/composables/useIndexedDB'
import { useImageStorage } from '@/composables/useImageStorage'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()
const toast = useToast()

// Use composables
const slideToPptx = useSlideToPptx()
const indexedDB = useIndexedDB()
const imageStorage = useImageStorage()

// Image state
const images = ref([])
const currentIndex = ref(0)
const isLoading = ref(true)
const historyRecord = ref(null)

// Log container ref for auto-scroll
const logContainer = ref(null)

// Thumbnail refs for auto-scroll
const thumbnailContainer = ref(null)
const thumbnailRefs = ref({})

// Select slide and scroll to center
const selectSlide = (idx) => {
  currentIndex.value = idx
  nextTick(() => {
    const thumbnail = thumbnailRefs.value[idx]
    if (thumbnail && thumbnailContainer.value) {
      thumbnail.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      })
    }
  })
}

// OCR overlay toggle
const showOcrOverlay = ref(true)

// Sync settings with composable
const settings = slideToPptx.settings

// Current image and slide state
const currentImage = computed(() => images.value[currentIndex.value])
const currentSlideState = computed(() => slideStates.value[currentIndex.value])

// Navigation
const hasPrev = computed(() => currentIndex.value > 0)
const hasNext = computed(() => currentIndex.value < images.value.length - 1)

const goToPrev = () => {
  if (hasPrev.value) currentIndex.value--
}

const goToNext = () => {
  if (hasNext.value) currentIndex.value++
}

/**
 * Load images from history record via IndexedDB + OPFS
 * @param {number} historyId - History record ID
 */
const loadFromHistory = async (historyId) => {
  try {
    // Get history record from IndexedDB
    const record = await indexedDB.getHistoryById(historyId)
    if (!record) {
      toast.error(t('slideToPptx.historyNotFound'))
      return false
    }

    if (!record.images || record.images.length === 0) {
      toast.error(t('slideToPptx.noImagesInHistory'))
      return false
    }

    historyRecord.value = record

    // Load actual images from OPFS
    const loadedImages = await imageStorage.loadHistoryImages(record)

    // Convert to format needed by the view
    images.value = loadedImages.map((img, idx) => ({
      id: idx,
      data: null, // Will be loaded on demand for processing
      mimeType: img.mimeType || 'image/webp',
      preview: img.url || img.thumbnail,
      opfsPath: img.opfsPath,
    }))

    return true
  } catch (e) {
    console.error('Failed to load from history:', e)
    toast.error(t('slideToPptx.loadFailed'))
    return false
  }
}

/**
 * Load images from sessionStorage (legacy method)
 */
const loadFromSessionStorage = () => {
  const storedImages = sessionStorage.getItem('slideToPptxImages')
  if (!storedImages) return false

  try {
    const parsed = JSON.parse(storedImages)
    images.value = parsed.map((img, idx) => ({
      id: idx,
      data: img.data,
      mimeType: img.mimeType || 'image/webp',
      preview: `data:${img.mimeType || 'image/webp'};base64,${img.data}`,
    }))
    sessionStorage.removeItem('slideToPptxImages')
    return true
  } catch {
    return false
  }
}

// Load images on mount
onMounted(async () => {
  try {
    const historyId = route.query['history-id']

    if (historyId) {
      // Load from IndexedDB by history_id
      const success = await loadFromHistory(Number(historyId))
      if (!success) {
        // Try sessionStorage as fallback
        loadFromSessionStorage()
      }
    } else {
      // Legacy: try sessionStorage
      if (!loadFromSessionStorage()) {
        // No images found anywhere
        toast.error(t('slideToPptx.noImagesFound'))
      }
    }
  } catch (e) {
    console.error('Failed to load images:', e)
    toast.error(t('slideToPptx.loadFailed'))
  } finally {
    isLoading.value = false
  }
})

// Prevent accidental page close during processing
const handleBeforeUnload = (e) => {
  if (slideToPptx.isProcessing.value) {
    e.preventDefault()
    e.returnValue = t('slideToPptx.confirmLeave')
    return e.returnValue
  }
}

onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload)
})

onUnmounted(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
})

const goBack = () => {
  router.push('/')
}

// Computed properties from composable
const isProcessing = computed(() => slideToPptx.isProcessing.value)
const currentStep = computed(() => slideToPptx.currentStep.value)
const progress = computed(() => slideToPptx.progress.value)
const logs = computed(() => slideToPptx.logs.value)
const slideStates = slideToPptx.slideStates

// Setting mode and preview mode from composable
const settingMode = computed({
  get: () => slideToPptx.settingMode.value,
  set: (v) => { slideToPptx.settingMode.value = v },
})

// Check if a slide has custom settings
const hasCustomSettings = (index) => {
  return slideStates.value[index]?.overrideSettings !== null
}

// Check if current page has custom settings
const currentPageHasCustomSettings = computed(() => {
  return hasCustomSettings(currentIndex.value)
})

// Update a setting - handles both global and per-page modes
const updateSetting = (key, value) => {
  if (settingMode.value === 'global') {
    // Update global settings
    settings[key] = value
  } else {
    // Per-page mode: create/update override for current page
    const currentOverride = slideStates.value[currentIndex.value]?.overrideSettings || {}
    slideToPptx.setSlideSettings(currentIndex.value, {
      ...currentOverride,
      [key]: value,
    })
  }
}

// Reset current page to use global settings
const resetToGlobalSettings = () => {
  slideToPptx.setSlideSettings(currentIndex.value, null)
}

// Get the display value for a setting (respects per-page mode)
const getSettingValue = (key) => {
  if (settingMode.value === 'per-page') {
    const override = slideStates.value[currentIndex.value]?.overrideSettings
    if (override && key in override) {
      return override[key]
    }
  }
  return settings[key]
}

// Get successful slides for download
const successfulSlides = computed(() => {
  return slideStates.value
    .map((state, idx) => ({ ...state, originalIndex: idx }))
    .filter(s => s.status === 'done')
})

// Download PPTX
const downloadPptx = async () => {
  const success = await slideToPptx.downloadPptx()
  if (success) {
    toast.success(t('slideToPptx.downloadSuccess'))
  }
}

// Current slide's OCR results
const currentOcrResults = computed(() => {
  if (slideStates.value[currentIndex.value]) {
    return slideStates.value[currentIndex.value].ocrResults || []
  }
  return []
})

// Auto-scroll log to bottom when new logs are added
watch(logs, () => {
  nextTick(() => {
    if (logContainer.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight
    }
  })
}, { deep: true })

// Initialize slideStates when images are loaded (for per-page settings)
watch(
  () => images.value.length,
  (count) => {
    if (count > 0) {
      slideToPptx.initSlideStates(count)
    }
  },
  { immediate: true }
)

// Prepare images for processing (load from OPFS if needed)
const prepareImagesForProcessing = async () => {
  const preparedImages = []

  for (const img of images.value) {
    if (img.data) {
      // Already has base64 data (from sessionStorage)
      preparedImages.push({
        data: img.data,
        mimeType: img.mimeType,
      })
    } else if (img.opfsPath) {
      // Load from OPFS (getImageBase64 already returns raw base64 without prefix)
      const base64 = await imageStorage.getImageBase64(img.opfsPath)
      if (base64) {
        preparedImages.push({
          data: base64,
          mimeType: img.mimeType,
        })
      }
    } else if (img.preview) {
      // Use preview URL (blob URL) - convert to base64
      const response = await fetch(img.preview)
      const blob = await response.blob()
      const base64 = await new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.readAsDataURL(blob)
      })
      preparedImages.push({
        data: base64.split(',')[1],
        mimeType: img.mimeType,
      })
    }
  }

  return preparedImages
}

// Start processing
const startProcessing = async () => {
  if (images.value.length === 0) {
    toast.error(t('slideToPptx.noImages'))
    return
  }

  // Prepare images (load from OPFS if needed)
  const preparedImages = await prepareImagesForProcessing()

  if (preparedImages.length === 0) {
    toast.error(t('slideToPptx.loadFailed'))
    return
  }

  await slideToPptx.processAll(preparedImages, {
    onComplete: (successCount, failCount) => {
      if (failCount === 0) {
        toast.success(t('slideToPptx.success.complete'))
      } else {
        toast.warning(t('slideToPptx.partialSuccess', { success: successCount, failed: failCount }))
      }
    },
    onError: () => {
      toast.error(t('slideToPptx.errors.pptxFailed'))
    },
  })
}

// Cancel processing
const cancelProcessing = () => {
  slideToPptx.cancel()
}

// Clean up on unmount
onUnmounted(() => {
  slideToPptx.cleanup()
  imageStorage.cleanupCache()
})

// Detect slide ratio from first image
const detectedRatio = computed(() => {
  if (images.value.length === 0) return null
  // Try to detect from image dimensions if available
  // For now, return a default
  return '16:9'
})

// Get slide status badge
const getSlideStatus = (index) => {
  if (!slideStates.value[index]) return 'pending'
  return slideStates.value[index].status
}
</script>

<template>
  <div class="relative z-10 min-h-screen">
    <!-- Header -->
    <header class="sticky top-0 z-50 backdrop-blur-xl bg-glass-bg-strong border-b border-border-subtle shadow-card">
      <div class="container mx-auto px-4 py-4 flex items-center justify-between">
        <button
          @click="goBack"
          class="flex items-center gap-2 text-text-muted hover:text-text-primary transition-colors"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
          <span>{{ $t('common.back') }}</span>
        </button>
        <h1 class="text-xl font-semibold text-text-primary">{{ $t('slideToPptx.title') }}</h1>
        <div class="w-24"></div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="container mx-auto px-4 py-8">
      <!-- Loading State -->
      <div v-if="isLoading" class="flex items-center justify-center h-64">
        <div class="animate-spin w-8 h-8 border-2 border-mode-generate border-t-transparent rounded-full"></div>
      </div>

      <!-- No Images State -->
      <div v-else-if="images.length === 0" class="text-center py-16">
        <div class="w-20 h-20 mx-auto mb-6 rounded-full bg-bg-muted flex items-center justify-center">
          <svg class="w-10 h-10 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <p class="text-text-muted text-lg mb-4">{{ $t('slideToPptx.noImagesFound') }}</p>
        <button @click="goBack" class="btn-primary">
          {{ $t('common.back') }}
        </button>
      </div>

      <!-- Main Grid -->
      <div v-else class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Left: Image Preview -->
        <div class="lg:col-span-2 space-y-4">
          <!-- Preview Card -->
          <div class="glass p-6">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-lg font-semibold text-text-primary flex items-center gap-2">
                <svg class="w-5 h-5 text-mode-generate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {{ $t('slideToPptx.preview') }}
              </h2>
              <span class="text-sm text-text-muted">
                {{ currentIndex + 1 }} / {{ images.length }}
              </span>
            </div>

            <!-- Image Container - Side by side when processed -->
            <div v-if="currentSlideState?.cleanImage" class="grid grid-cols-2 gap-4">
              <!-- Original Image -->
              <div class="space-y-2">
                <h4 class="text-xs font-medium text-text-muted text-center">{{ $t('slideToPptx.original') }}</h4>
                <div class="relative aspect-video rounded-xl overflow-hidden bg-bg-muted border border-border-muted">
                  <img
                    v-if="currentImage"
                    :src="currentImage.preview"
                    alt="Original"
                    class="absolute inset-0 w-full h-full object-contain"
                  />
                  <!-- OCR Overlay on original -->
                  <div v-if="showOcrOverlay && currentOcrResults.length > 0" class="absolute inset-0 pointer-events-none">
                    <svg class="w-full h-full" :viewBox="`0 0 ${slideStates[currentIndex]?.width || 1920} ${slideStates[currentIndex]?.height || 1080}`" preserveAspectRatio="xMidYMid meet">
                      <rect
                        v-for="(result, idx) in currentOcrResults"
                        :key="idx"
                        :x="result.bounds.x"
                        :y="result.bounds.y"
                        :width="result.bounds.width"
                        :height="result.bounds.height"
                        fill="rgba(59, 130, 246, 0.2)"
                        stroke="rgba(59, 130, 246, 0.8)"
                        stroke-width="2"
                      />
                    </svg>
                  </div>
                </div>
              </div>
              <!-- Processed Image -->
              <div class="space-y-2">
                <h4 class="text-xs font-medium text-text-muted text-center">{{ $t('slideToPptx.processed') }}</h4>
                <div class="relative aspect-video rounded-xl overflow-hidden bg-bg-muted border border-border-muted">
                  <img
                    :src="currentSlideState.cleanImage"
                    alt="Processed"
                    class="absolute inset-0 w-full h-full object-contain"
                  />
                </div>
              </div>
            </div>

            <!-- Single Image Container - Before processing -->
            <div v-else class="relative aspect-video rounded-xl overflow-hidden bg-bg-muted border border-border-muted">
              <img
                v-if="currentImage"
                :src="currentImage.preview"
                alt="Slide preview"
                class="absolute inset-0 w-full h-full object-contain"
              />

              <!-- OCR Overlay -->
              <div v-if="showOcrOverlay && currentOcrResults.length > 0" class="absolute inset-0 pointer-events-none">
                <svg class="w-full h-full" :viewBox="`0 0 ${slideStates[currentIndex]?.width || 1920} ${slideStates[currentIndex]?.height || 1080}`" preserveAspectRatio="xMidYMid meet">
                  <rect
                    v-for="(result, idx) in currentOcrResults"
                    :key="idx"
                    :x="result.bounds.x"
                    :y="result.bounds.y"
                    :width="result.bounds.width"
                    :height="result.bounds.height"
                    fill="rgba(59, 130, 246, 0.2)"
                    stroke="rgba(59, 130, 246, 0.8)"
                    stroke-width="2"
                  />
                </svg>
              </div>

              <!-- Navigation Arrows -->
              <button
                v-if="hasPrev"
                @click="goToPrev"
                class="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition-colors"
              >
                <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                v-if="hasNext"
                @click="goToNext"
                class="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition-colors"
              >
                <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            <!-- OCR Toggle -->
            <div class="mt-4">
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  v-model="showOcrOverlay"
                  class="w-4 h-4 rounded border-border-muted accent-mode-generate focus:ring-mode-generate"
                />
                <span class="text-sm text-text-secondary">{{ $t('slideToPptx.showOcrResult') }}</span>
              </label>
            </div>

            <!-- Thumbnail Strip - Full Width Below -->
            <div class="mt-4 -mx-2">
              <!-- Processing indicator (shows during processing) -->
              <div v-if="isProcessing" class="px-2 mb-2 flex items-center gap-2">
                <div class="w-2 h-2 rounded-full bg-mode-generate animate-pulse"></div>
                <span class="text-sm text-text-secondary">
                  {{ $t('slideToPptx.processingPage', { current: slideToPptx.currentSlide.value, total: images.length }) }}
                </span>
              </div>

              <!-- Thumbnails with hidden scrollbar -->
              <div
                ref="thumbnailContainer"
                class="flex gap-3 overflow-x-auto px-2 py-2 thumbnail-scroll-hidden"
              >
                <button
                  v-for="(img, idx) in images"
                  :key="img.id"
                  :ref="el => { if (el) thumbnailRefs[idx] = el }"
                  @click="selectSlide(idx)"
                  class="relative flex-shrink-0 group"
                >
                  <!-- Thumbnail with page number -->
                  <div
                    class="relative w-20 h-12 rounded-lg overflow-hidden transition-all duration-200"
                    :class="idx === currentIndex
                      ? 'ring-2 ring-mode-generate ring-offset-2 ring-offset-bg-elevated scale-105 shadow-lg'
                      : 'opacity-70 hover:opacity-100 hover:scale-102'"
                  >
                    <img :src="img.preview" alt="" class="w-full h-full object-cover" />

                    <!-- Page number badge -->
                    <div class="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[10px] font-bold"
                      :class="idx === currentIndex
                        ? 'bg-mode-generate text-white'
                        : 'bg-black/50 text-white'">
                      {{ idx + 1 }}
                    </div>

                    <!-- Status indicator (larger, more visible) -->
                    <div
                      v-if="getSlideStatus(idx) !== 'pending'"
                      class="absolute bottom-1 right-1 w-4 h-4 rounded-full flex items-center justify-center"
                      :class="{
                        'bg-status-success': getSlideStatus(idx) === 'done',
                        'bg-status-error': getSlideStatus(idx) === 'error',
                        'bg-mode-generate': ['ocr', 'mask', 'inpaint'].includes(getSlideStatus(idx)),
                      }"
                    >
                      <!-- Check icon for done -->
                      <svg v-if="getSlideStatus(idx) === 'done'" class="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                      </svg>
                      <!-- X icon for error -->
                      <svg v-else-if="getSlideStatus(idx) === 'error'" class="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                      </svg>
                      <!-- Spinner for processing -->
                      <svg v-else class="w-2.5 h-2.5 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    </div>
                  </div>

                  <!-- Custom settings indicator (only in per-page mode) -->
                  <div
                    v-if="settingMode === 'per-page' && hasCustomSettings(idx)"
                    class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-status-warning flex items-center justify-center shadow"
                    :title="$t('slideToPptx.hasCustomSettings')"
                  >
                    <svg class="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd" />
                    </svg>
                  </div>
                </button>
              </div>
            </div>
          </div>

          <!-- Progress & Log -->
          <div v-if="isProcessing || logs.length > 0" class="glass p-6">
            <h2 class="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
              <svg class="w-5 h-5 text-mode-generate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              {{ $t('slideToPptx.progress') }}
            </h2>

            <!-- Progress Bar -->
            <div class="mb-4">
              <div class="flex justify-between text-sm text-text-muted mb-2">
                <span>{{ currentStep ? $t(`slideToPptx.steps.${currentStep}`) : $t('slideToPptx.ready') }}</span>
                <span>{{ progress }}%</span>
              </div>
              <div class="h-2 bg-bg-muted rounded-full overflow-hidden">
                <div
                  class="h-full bg-mode-generate transition-all duration-300"
                  :style="{ width: `${progress}%` }"
                ></div>
              </div>
            </div>

            <!-- Log -->
            <div ref="logContainer" class="max-h-40 overflow-y-auto space-y-1 font-mono text-xs">
              <div
                v-for="(log, idx) in logs"
                :key="idx"
                class="flex gap-2"
                :class="{
                  'text-text-muted': log.type === 'info',
                  'text-status-success': log.type === 'success',
                  'text-status-error': log.type === 'error',
                }"
              >
                <span class="text-text-muted">{{ log.timestamp }}</span>
                <span>{{ log.message }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Right: Settings -->
        <div class="space-y-4">
          <div class="glass p-6">
            <!-- Settings Header - changes based on mode -->
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-lg font-semibold text-text-primary flex items-center gap-2">
                <svg class="w-5 h-5 text-mode-generate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span v-if="settingMode === 'global'">{{ $t('slideToPptx.settings') }}</span>
                <span v-else>{{ $t('slideToPptx.slideSettings', { index: currentIndex + 1 }) }}</span>
              </h2>
              <!-- Reset to global button (only in per-page mode when has custom settings) -->
              <button
                v-if="settingMode === 'per-page' && currentPageHasCustomSettings"
                @click="resetToGlobalSettings"
                class="text-xs px-2 py-1 rounded-lg text-status-warning hover:bg-status-warning-muted transition-colors"
              >
                {{ $t('slideToPptx.resetToGlobal') }}
              </button>
            </div>

            <!-- Setting Mode Toggle -->
            <div class="mb-6">
              <label class="block text-sm text-text-muted mb-2">{{ $t('slideToPptx.settingMode') }}</label>
              <div class="flex rounded-xl bg-bg-muted p-1">
                <button
                  @click="settingMode = 'global'"
                  class="flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                  :class="settingMode === 'global'
                    ? 'bg-brand-primary text-text-on-brand'
                    : 'text-text-muted hover:text-text-primary'"
                >
                  {{ $t('slideToPptx.globalMode') }}
                </button>
                <button
                  @click="settingMode = 'per-page'"
                  class="flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                  :class="settingMode === 'per-page'
                    ? 'bg-brand-primary text-text-on-brand'
                    : 'text-text-muted hover:text-text-primary'"
                >
                  {{ $t('slideToPptx.perPageMode') }}
                </button>
              </div>
              <p class="text-xs text-text-muted mt-2">
                {{ settingMode === 'global'
                  ? $t('slideToPptx.globalModeDesc')
                  : $t('slideToPptx.perPageModeDesc') }}
              </p>
            </div>

            <!-- Per-page mode: current page indicator -->
            <div v-if="settingMode === 'per-page'" class="mb-6 p-3 rounded-lg border border-mode-generate/30"
              :class="currentPageHasCustomSettings ? 'bg-status-warning-muted/30' : 'bg-mode-generate-muted/30'">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium text-text-primary">
                  {{ $t('slideToPptx.editingPage', { index: currentIndex + 1, total: images.length }) }}
                </span>
                <span v-if="currentPageHasCustomSettings" class="px-2 py-0.5 text-xs rounded-full bg-status-warning-muted text-status-warning font-medium">
                  {{ $t('slideToPptx.customized') }}
                </span>
                <span v-else class="px-2 py-0.5 text-xs rounded-full bg-bg-muted text-text-muted">
                  {{ $t('slideToPptx.usingGlobal') }}
                </span>
              </div>
            </div>

            <!-- Inpaint Method -->
            <div class="space-y-3 mb-6">
              <label class="block text-sm text-text-muted">{{ $t('slideToPptx.inpaintMethod') }}</label>

              <label class="flex items-start gap-3 cursor-pointer group p-3 rounded-lg border border-border-muted hover:border-mode-generate transition-colors"
                :class="{ 'border-mode-generate bg-mode-generate-muted/30': getSettingValue('inpaintMethod') === 'opencv' }">
                <input
                  type="radio"
                  name="inpaintMethod"
                  value="opencv"
                  :checked="getSettingValue('inpaintMethod') === 'opencv'"
                  @change="updateSetting('inpaintMethod', 'opencv')"
                  class="mt-0.5 w-4 h-4 accent-mode-generate border-border-muted focus:ring-mode-generate"
                />
                <div>
                  <span class="text-text-primary font-medium">OpenCV.js</span>
                  <span class="ml-2 px-2 py-0.5 text-xs rounded-full bg-status-success-muted text-status-success">{{ $t('slideToPptx.free') }}</span>
                  <p class="text-xs text-text-muted mt-1">{{ $t('slideToPptx.opencvDesc') }}</p>
                </div>
              </label>

              <label class="flex items-start gap-3 cursor-pointer group p-3 rounded-lg border border-border-muted hover:border-mode-generate transition-colors"
                :class="{ 'border-mode-generate bg-mode-generate-muted/30': getSettingValue('inpaintMethod') === 'gemini' }">
                <input
                  type="radio"
                  name="inpaintMethod"
                  value="gemini"
                  :checked="getSettingValue('inpaintMethod') === 'gemini'"
                  @change="updateSetting('inpaintMethod', 'gemini')"
                  class="mt-0.5 w-4 h-4 accent-mode-generate border-border-muted focus:ring-mode-generate"
                />
                <div>
                  <span class="text-text-primary font-medium">Gemini API</span>
                  <span class="ml-2 px-2 py-0.5 text-xs rounded-full bg-status-warning-muted text-status-warning">{{ $t('slideToPptx.paid') }}</span>
                  <p class="text-xs text-text-muted mt-1">{{ $t('slideToPptx.geminiDesc') }}</p>
                </div>
              </label>
            </div>

            <!-- OpenCV Algorithm (only when opencv selected) -->
            <div v-if="getSettingValue('inpaintMethod') === 'opencv'" class="space-y-3 mb-6">
              <label class="block text-sm text-text-muted">{{ $t('slideToPptx.algorithm') }}</label>

              <div class="grid grid-cols-2 gap-2">
                <label class="flex items-center gap-2 cursor-pointer p-2 rounded-lg border border-border-muted hover:border-mode-generate transition-colors"
                  :class="{ 'border-mode-generate bg-mode-generate-muted/30': getSettingValue('opencvAlgorithm') === 'NS' }">
                  <input
                    type="radio"
                    name="opencvAlgorithm"
                    value="NS"
                    :checked="getSettingValue('opencvAlgorithm') === 'NS'"
                    @change="updateSetting('opencvAlgorithm', 'NS')"
                    class="w-4 h-4 accent-mode-generate border-border-muted focus:ring-mode-generate"
                  />
                  <span class="text-sm text-text-primary">NS</span>
                </label>

                <label class="flex items-center gap-2 cursor-pointer p-2 rounded-lg border border-border-muted hover:border-mode-generate transition-colors"
                  :class="{ 'border-mode-generate bg-mode-generate-muted/30': getSettingValue('opencvAlgorithm') === 'TELEA' }">
                  <input
                    type="radio"
                    name="opencvAlgorithm"
                    value="TELEA"
                    :checked="getSettingValue('opencvAlgorithm') === 'TELEA'"
                    @change="updateSetting('opencvAlgorithm', 'TELEA')"
                    class="w-4 h-4 accent-mode-generate border-border-muted focus:ring-mode-generate"
                  />
                  <span class="text-sm text-text-primary">TELEA</span>
                </label>
              </div>
              <p class="text-xs text-text-muted">
                {{ getSettingValue('opencvAlgorithm') === 'NS' ? $t('slideToPptx.nsHint') : $t('slideToPptx.teleaHint') }}
              </p>
            </div>

            <!-- Gemini Model (only when gemini selected) -->
            <div v-if="getSettingValue('inpaintMethod') === 'gemini'" class="space-y-3 mb-6">
              <label class="block text-sm text-text-muted">{{ $t('slideToPptx.geminiModel') }}</label>

              <label class="flex items-start gap-3 cursor-pointer group p-3 rounded-lg border border-border-muted hover:border-mode-generate transition-colors"
                :class="{ 'border-mode-generate bg-mode-generate-muted/30': getSettingValue('geminiModel') === '2.0' }">
                <input
                  type="radio"
                  name="geminiModel"
                  value="2.0"
                  :checked="getSettingValue('geminiModel') === '2.0'"
                  @change="updateSetting('geminiModel', '2.0')"
                  class="mt-0.5 w-4 h-4 accent-mode-generate border-border-muted focus:ring-mode-generate"
                />
                <div>
                  <span class="text-text-primary font-medium">Nano Banana (2.0)</span>
                  <span class="ml-2 px-2 py-0.5 text-xs rounded-full bg-status-success-muted text-status-success">{{ $t('slideToPptx.freeTierAvailable') }}</span>
                  <p class="text-xs text-text-muted mt-1">{{ $t('slideToPptx.gemini20Desc') }}</p>
                </div>
              </label>

              <label class="flex items-start gap-3 cursor-pointer group p-3 rounded-lg border border-border-muted hover:border-mode-generate transition-colors"
                :class="{ 'border-mode-generate bg-mode-generate-muted/30': getSettingValue('geminiModel') === '3.0' }">
                <input
                  type="radio"
                  name="geminiModel"
                  value="3.0"
                  :checked="getSettingValue('geminiModel') === '3.0'"
                  @change="updateSetting('geminiModel', '3.0')"
                  class="mt-0.5 w-4 h-4 accent-mode-generate border-border-muted focus:ring-mode-generate"
                />
                <div>
                  <span class="text-text-primary font-medium">Nano Banana Pro (3.0)</span>
                  <span class="ml-2 px-2 py-0.5 text-xs rounded-full bg-status-warning-muted text-status-warning">{{ $t('slideToPptx.paid') }}</span>
                  <p class="text-xs text-text-muted mt-1">{{ $t('slideToPptx.gemini30Desc') }}</p>
                </div>
              </label>
            </div>

            <!-- Advanced Settings (only in global mode, for simplicity) -->
            <details v-if="settingMode === 'global' && settings.inpaintMethod === 'opencv'" class="mb-6">
              <summary class="text-sm text-text-muted cursor-pointer hover:text-text-primary">
                {{ $t('slideToPptx.advancedSettings') }}
              </summary>
              <div class="mt-3 space-y-4 pl-2">
                <!-- Inpaint Radius -->
                <div>
                  <label class="flex justify-between text-xs text-text-muted mb-1">
                    <span>{{ $t('slideToPptx.inpaintRadius') }}</span>
                    <span>{{ settings.inpaintRadius }}px</span>
                  </label>
                  <input
                    type="range"
                    v-model.number="settings.inpaintRadius"
                    min="1"
                    max="10"
                    class="w-full accent-mode-generate"
                  />
                </div>

                <!-- Mask Padding -->
                <div>
                  <label class="flex justify-between text-xs text-text-muted mb-1">
                    <span>{{ $t('slideToPptx.maskPadding') }}</span>
                    <span>{{ settings.maskPadding }}px</span>
                  </label>
                  <input
                    type="range"
                    v-model.number="settings.maskPadding"
                    min="0"
                    max="20"
                    class="w-full accent-mode-generate"
                  />
                </div>
              </div>
            </details>

            <!-- Slide Ratio -->
            <div class="mb-6">
              <label class="block text-sm text-text-muted mb-2">{{ $t('slideToPptx.slideRatio') }}</label>
              <select
                v-model="settings.slideRatio"
                class="w-full px-4 py-3 rounded-xl bg-bg-muted border border-border-muted text-text-primary focus:outline-none focus:border-mode-generate transition-colors"
              >
                <option value="auto" class="bg-bg-elevated">
                  {{ $t('slideToPptx.autoDetect') }} {{ detectedRatio ? `(${detectedRatio})` : '' }}
                </option>
                <option value="16:9" class="bg-bg-elevated">16:9</option>
                <option value="4:3" class="bg-bg-elevated">4:3</option>
                <option value="9:16" class="bg-bg-elevated">9:16</option>
              </select>
            </div>

            <!-- Start/Cancel Button -->
            <div class="space-y-2">
              <button
                v-if="!isProcessing"
                @click="startProcessing"
                :disabled="images.length === 0"
                class="w-full py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
                :class="images.length > 0
                  ? 'bg-brand-primary hover:bg-brand-primary-hover text-text-on-brand'
                  : 'bg-bg-interactive text-text-muted cursor-not-allowed'"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {{ $t('slideToPptx.actions.start') }}
              </button>

              <button
                v-else
                @click="cancelProcessing"
                class="w-full py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 bg-status-error hover:bg-status-error/80 text-white"
              >
                <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {{ $t('slideToPptx.actions.cancel') }}
              </button>

              <!-- Download PPTX Button (shows after processing complete) -->
              <button
                v-if="!isProcessing && successfulSlides.length > 0"
                @click="downloadPptx"
                class="w-full py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 bg-status-success hover:bg-status-success/80 text-white"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {{ $t('slideToPptx.downloadPptx') }} ({{ successfulSlides.length }})
              </button>
            </div>
          </div>

          <!-- Tip: Clean backgrounds -->
          <div class="glass p-4 border-l-4 border-status-success">
            <div class="flex items-start gap-3">
              <svg class="w-5 h-5 text-status-success flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <p class="text-xs text-text-secondary">
                {{ $t('slideToPptx.cleanBackgroundTip') }}
              </p>
            </div>
          </div>

          <!-- Info -->
          <div class="glass p-4">
            <div class="flex items-start gap-3">
              <svg class="w-5 h-5 text-mode-generate flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p class="text-xs text-text-muted">
                {{ $t('slideToPptx.infoText') }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>

  </div>
</template>

<style scoped>
/* Hide scrollbar while maintaining scroll functionality */
.thumbnail-scroll-hidden {
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE 10+ */
}

.thumbnail-scroll-hidden::-webkit-scrollbar {
  display: none; /* Chrome, Safari, Edge */
}
</style>
