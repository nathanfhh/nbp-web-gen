<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import JSZip from 'jszip'
import { useGeneratorStore } from '@/stores/generator'
import { formatElapsed } from '@/composables/useFormatTime'
import { usePdfGenerator } from '@/composables/usePdfGenerator'
import { useToast } from '@/composables/useToast'
import ImageLightbox from './ImageLightbox.vue'

const { t } = useI18n()
const toast = useToast()
const pdfGenerator = usePdfGenerator()
const store = useGeneratorStore()

// Lightbox state
const lightboxOpen = ref(false)
const lightboxIndex = ref(0)

const openLightbox = (index) => {
  lightboxIndex.value = index
  lightboxOpen.value = true
}

// Live timer for loading state
const currentTime = ref(Date.now())
let timerInterval = null

watch(
  () => store.isGenerating,
  (isGenerating) => {
    if (isGenerating) {
      // Start timer
      currentTime.value = Date.now()
      timerInterval = setInterval(() => {
        currentTime.value = Date.now()
      }, 100)
    } else {
      // Stop timer
      if (timerInterval) {
        clearInterval(timerInterval)
        timerInterval = null
      }
    }
  },
  { immediate: true }
)

onUnmounted(() => {
  if (timerInterval) {
    clearInterval(timerInterval)
  }
})

// Elapsed time during generation
const elapsedTime = computed(() => {
  if (!store.generationStartTime) return '0.0s'
  const elapsed = currentTime.value - store.generationStartTime
  return formatElapsed(elapsed)
})

// Total generation time (after completion)
const totalTime = computed(() => {
  if (!store.generationStartTime || !store.generationEndTime) return null
  const elapsed = store.generationEndTime - store.generationStartTime
  return formatElapsed(elapsed)
})

const downloadImage = (image, index) => {
  const link = document.createElement('a')
  link.href = `data:${image.mimeType};base64,${image.data}`
  link.download = `generated-image-${Date.now()}-${index + 1}.${image.mimeType.split('/')[1] || 'png'}`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// Batch download state
const isBatchDownloading = ref(false)
const showBatchMenu = ref(false)

// Close dropdown when clicking outside
const closeBatchMenu = (e) => {
  if (showBatchMenu.value && !e.target.closest('.relative')) {
    showBatchMenu.value = false
  }
}

watch(showBatchMenu, (val) => {
  if (val) {
    document.addEventListener('click', closeBatchMenu)
  } else {
    document.removeEventListener('click', closeBatchMenu)
  }
})

// Cleanup on unmount
onUnmounted(() => {
  document.removeEventListener('click', closeBatchMenu)
})

// Convert image to Blob
const imageToBlob = (image) => {
  if (image.data) {
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
  if (store.generatedImages.length === 0 || isBatchDownloading.value) return

  isBatchDownloading.value = true
  showBatchMenu.value = false

  try {
    const zip = new JSZip()

    for (let i = 0; i < store.generatedImages.length; i++) {
      const image = store.generatedImages[i]
      const blob = imageToBlob(image)
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

// Download all images as PDF
const downloadAllAsPdf = async () => {
  if (store.generatedImages.length === 0 || isBatchDownloading.value) return

  isBatchDownloading.value = true
  showBatchMenu.value = false

  try {
    const imageDataArray = []
    for (const image of store.generatedImages) {
      const blob = imageToBlob(image)
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

const clearImages = () => {
  store.clearGeneratedImages()
  store.clearGeneratedImagesMetadata()
}
</script>

<template>
  <div v-if="store.generatedImages.length > 0" class="space-y-6 fade-in">
    <div class="flex items-center justify-between">
      <h3 class="font-semibold text-white flex items-center gap-2">
        <svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        {{ $t('preview.title') }}
        <span class="badge">{{ store.generatedImages.length }}</span>
        <!-- Total time badge -->
        <span
          v-if="totalTime"
          class="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono"
        >
          {{ totalTime }}
        </span>
      </h3>
      <div class="flex gap-2">
        <!-- Batch download dropdown -->
        <div class="relative">
          <button
            @click="showBatchMenu = !showBatchMenu"
            class="btn-secondary py-2 px-4 text-sm flex items-center gap-1"
            :class="{ 'opacity-50 cursor-wait': isBatchDownloading }"
            :disabled="isBatchDownloading"
          >
            <svg v-if="isBatchDownloading" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {{ $t('common.downloadAll') }}
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <!-- Dropdown menu -->
          <div
            v-if="showBatchMenu"
            class="batch-download-dropdown"
          >
            <button
              @click="downloadAllAsZip"
              class="batch-download-option"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              ZIP
            </button>
            <button
              @click="downloadAllAsPdf"
              class="batch-download-option"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              PDF
            </button>
          </div>
        </div>
        <button @click="clearImages" class="text-gray-400 hover:text-gray-300 py-2 px-4 text-sm">
          {{ $t('common.clear') }}
        </button>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-4">
      <div
        v-for="(image, index) in store.generatedImages"
        :key="index"
        class="image-preview group cursor-pointer"
        @click="openLightbox(index)"
      >
        <img
          :src="`data:${image.mimeType};base64,${image.data}`"
          :alt="`Generated image ${index + 1}`"
          class="w-full"
        />
        <!-- Always visible zoom button -->
        <button
          @click.stop="openLightbox(index)"
          class="absolute top-2 right-2 p-2 rounded-lg bg-black/50 text-white/80 hover:bg-black/70 hover:text-white transition-all"
          :title="$t('preview.zoom')"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
          </svg>
        </button>
        <div class="image-preview-overlay">
          <div class="flex gap-2">
            <button
              @click.stop="downloadImage(image, index)"
              class="btn-premium py-2 px-4 text-sm"
            >
              <svg class="w-4 h-4 mr-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {{ $t('common.download') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Lightbox -->
    <ImageLightbox
      v-model="lightboxOpen"
      :images="store.generatedImages"
      :image-metadata="store.generatedImagesMetadata"
      :initial-index="lightboxIndex"
      :history-id="store.currentHistoryId"
      :is-historical="false"
      :is-sticker-mode="store.currentMode === 'sticker'"
    />
  </div>

  <!-- Loading state -->
  <div v-else-if="store.isGenerating" class="flex flex-col items-center justify-center py-16 space-y-6">
    <div class="relative">
      <div class="spinner"></div>
      <div class="absolute inset-0 spinner" style="animation-delay: -0.5s; opacity: 0.5;"></div>
      <!-- Timer in center -->
      <div class="absolute inset-0 flex items-center justify-center">
        <span class="text-2xl font-mono font-bold text-white tabular-nums">
          {{ elapsedTime }}
        </span>
      </div>
    </div>
    <div class="text-center">
      <p class="text-white font-medium">{{ $t('preview.loading') }}</p>
      <p class="text-sm text-gray-400 mt-1">{{ $t('preview.loadingHint') }}</p>
    </div>
  </div>

  <!-- Empty state -->
  <div v-else class="flex flex-col items-center justify-center py-16 text-center">
    <div class="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center mb-6">
      <svg class="w-10 h-10 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    </div>
    <p class="text-gray-400">{{ $t('preview.empty') }}</p>
    <p class="text-sm text-gray-500 mt-1">{{ $t('preview.emptyHint') }}</p>
  </div>
</template>

<style scoped>
/* Batch download dropdown - theme-aware */
.batch-download-dropdown {
  position: absolute;
  right: 0;
  left: 0;
  margin-top: 0.25rem;
  padding: 0.25rem 0;
  border-radius: 0.5rem;
  backdrop-filter: blur(12px);
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
  z-index: 50;
  background: var(--glass-strong-bg);
  border: 1px solid var(--glass-border);
}

.batch-download-option {
  width: 100%;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  text-align: left;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-primary);
  background: transparent;
  transition: background 0.15s;
}

.batch-download-option:hover {
  background: var(--glass-bg);
}
</style>
