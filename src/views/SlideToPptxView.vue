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

// OCR overlay toggle
const showOcrOverlay = ref(true)

// Sync settings with composable
const settings = slideToPptx.settings

// Current image
const currentImage = computed(() => images.value[currentIndex.value])

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

const goBack = () => {
  router.push('/')
}

// Computed properties from composable
const isProcessing = computed(() => slideToPptx.isProcessing.value)
const currentStep = computed(() => slideToPptx.currentStep.value)
const progress = computed(() => slideToPptx.progress.value)
const logs = computed(() => slideToPptx.logs.value)
const slideStates = computed(() => slideToPptx.slideStates.value)

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

            <!-- Image Container -->
            <div class="relative aspect-video rounded-xl overflow-hidden bg-bg-muted border border-border-muted">
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
            <div class="flex items-center justify-between mt-4">
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  v-model="showOcrOverlay"
                  class="w-4 h-4 rounded border-border-muted text-mode-generate focus:ring-mode-generate"
                />
                <span class="text-sm text-text-secondary">{{ $t('slideToPptx.showOcrResult') }}</span>
              </label>

              <!-- Thumbnail Strip -->
              <div class="flex gap-2 overflow-x-auto max-w-[50%]">
                <button
                  v-for="(img, idx) in images"
                  :key="img.id"
                  @click="currentIndex = idx"
                  class="relative flex-shrink-0 w-12 h-8 rounded border-2 overflow-hidden transition-colors"
                  :class="idx === currentIndex ? 'border-mode-generate' : 'border-transparent hover:border-border-muted'"
                >
                  <img :src="img.preview" alt="" class="w-full h-full object-cover" />
                  <!-- Status indicator -->
                  <div
                    v-if="getSlideStatus(idx) !== 'pending'"
                    class="absolute bottom-0 right-0 w-3 h-3 rounded-tl"
                    :class="{
                      'bg-status-success': getSlideStatus(idx) === 'done',
                      'bg-status-error': getSlideStatus(idx) === 'error',
                      'bg-mode-generate animate-pulse': ['ocr', 'mask', 'inpaint'].includes(getSlideStatus(idx)),
                    }"
                  ></div>
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
            <h2 class="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
              <svg class="w-5 h-5 text-mode-generate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {{ $t('slideToPptx.settings') }}
            </h2>

            <!-- Inpaint Method -->
            <div class="space-y-3 mb-6">
              <label class="block text-sm text-text-muted">{{ $t('slideToPptx.inpaintMethod') }}</label>

              <label class="flex items-start gap-3 cursor-pointer group p-3 rounded-lg border border-border-muted hover:border-mode-generate transition-colors"
                :class="{ 'border-mode-generate bg-mode-generate-muted/30': settings.inpaintMethod === 'opencv' }">
                <input
                  type="radio"
                  value="opencv"
                  v-model="settings.inpaintMethod"
                  class="mt-0.5 w-4 h-4 text-mode-generate border-border-muted focus:ring-mode-generate"
                />
                <div>
                  <span class="text-text-primary font-medium">OpenCV.js</span>
                  <span class="ml-2 px-2 py-0.5 text-xs rounded-full bg-status-success-muted text-status-success">{{ $t('slideToPptx.free') }}</span>
                  <p class="text-xs text-text-muted mt-1">{{ $t('slideToPptx.opencvDesc') }}</p>
                </div>
              </label>

              <label class="flex items-start gap-3 cursor-pointer group p-3 rounded-lg border border-border-muted hover:border-mode-generate transition-colors"
                :class="{ 'border-mode-generate bg-mode-generate-muted/30': settings.inpaintMethod === 'gemini' }">
                <input
                  type="radio"
                  value="gemini"
                  v-model="settings.inpaintMethod"
                  class="mt-0.5 w-4 h-4 text-mode-generate border-border-muted focus:ring-mode-generate"
                />
                <div>
                  <span class="text-text-primary font-medium">Gemini API</span>
                  <span class="ml-2 px-2 py-0.5 text-xs rounded-full bg-status-warning-muted text-status-warning">{{ $t('slideToPptx.paid') }}</span>
                  <p class="text-xs text-text-muted mt-1">{{ $t('slideToPptx.geminiDesc') }}</p>
                </div>
              </label>
            </div>

            <!-- OpenCV Algorithm (only when opencv selected) -->
            <div v-if="settings.inpaintMethod === 'opencv'" class="space-y-3 mb-6">
              <label class="block text-sm text-text-muted">{{ $t('slideToPptx.algorithm') }}</label>

              <div class="grid grid-cols-2 gap-2">
                <label class="flex items-center gap-2 cursor-pointer p-2 rounded-lg border border-border-muted hover:border-mode-generate transition-colors"
                  :class="{ 'border-mode-generate bg-mode-generate-muted/30': settings.opencvAlgorithm === 'TELEA' }">
                  <input
                    type="radio"
                    value="TELEA"
                    v-model="settings.opencvAlgorithm"
                    class="w-4 h-4 text-mode-generate border-border-muted focus:ring-mode-generate"
                  />
                  <span class="text-sm text-text-primary">TELEA</span>
                </label>

                <label class="flex items-center gap-2 cursor-pointer p-2 rounded-lg border border-border-muted hover:border-mode-generate transition-colors"
                  :class="{ 'border-mode-generate bg-mode-generate-muted/30': settings.opencvAlgorithm === 'NS' }">
                  <input
                    type="radio"
                    value="NS"
                    v-model="settings.opencvAlgorithm"
                    class="w-4 h-4 text-mode-generate border-border-muted focus:ring-mode-generate"
                  />
                  <span class="text-sm text-text-primary">NS</span>
                </label>
              </div>
              <p class="text-xs text-text-muted">
                {{ settings.opencvAlgorithm === 'TELEA' ? $t('slideToPptx.teleaHint') : $t('slideToPptx.nsHint') }}
              </p>
            </div>

            <!-- Advanced Settings -->
            <details v-if="settings.inpaintMethod === 'opencv'" class="mb-6">
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
