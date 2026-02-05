<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
// JSZip is dynamically imported when needed to reduce initial bundle size
import { useGeneratorStore } from '@/stores/generator'
import { registerPlaying, unregisterPlaying } from '@/composables/useGlobalAudioManager'
import { formatElapsed } from '@/composables/useFormatTime'
import { usePdfGenerator } from '@/composables/usePdfGenerator'
import { useMp4Encoder } from '@/composables/useMp4Encoder'
import { useToast } from '@/composables/useToast'
import ImageLightbox from './ImageLightbox.vue'
import VideoLightbox from './VideoLightbox.vue'
import Mp4QualityModal from './Mp4QualityModal.vue'

const { t } = useI18n()
const toast = useToast()
const pdfGenerator = usePdfGenerator()
const mp4Encoder = useMp4Encoder()
const store = useGeneratorStore()

// WebCodecs support check (Firefox does not support it)
const isWebCodecsSupported = computed(() => typeof VideoEncoder !== 'undefined')

// Video preview state
const videoLightboxOpen = ref(false)
const currentVideoUrl = ref(null)
const isVideoDownloading = ref(false)

// Computed: video preview URL
const videoPreviewUrl = computed(() => {
  if (store.generatedVideo?.blob) {
    return URL.createObjectURL(store.generatedVideo.blob)
  }
  return null
})

// Open video in lightbox
const openVideoLightbox = () => {
  if (videoPreviewUrl.value) {
    currentVideoUrl.value = videoPreviewUrl.value
    videoLightboxOpen.value = true
  }
}

// Download video
const downloadVideo = async () => {
  if (!store.generatedVideo?.blob || isVideoDownloading.value) return

  isVideoDownloading.value = true
  try {
    const url = URL.createObjectURL(store.generatedVideo.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `video-${Date.now()}.mp4`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success(t('toast.downloadSuccess'))
  } catch (err) {
    console.error('Failed to download video:', err)
    toast.error(t('toast.downloadFailed'))
  } finally {
    isVideoDownloading.value = false
  }
}

// Clear video
const clearVideo = () => {
  store.clearGeneratedVideo()
}

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

// MP4 quality modal state
const showMp4QualityModal = ref(false)

// Open MP4 quality modal instead of directly downloading
const handleMp4Click = () => {
  showBatchMenu.value = false
  showMp4QualityModal.value = true
}

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

// Download all images as ZIP (includes narration audio if available)
const downloadAllAsZip = async () => {
  if (store.generatedImages.length === 0 || isBatchDownloading.value) return

  isBatchDownloading.value = true
  showBatchMenu.value = false

  try {
    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()

    for (let i = 0; i < store.generatedImages.length; i++) {
      const image = store.generatedImages[i]
      const blob = imageToBlob(image)
      if (blob) {
        const ext = image.mimeType?.split('/')[1] || 'png'
        zip.file(`image-${i + 1}.${ext}`, blob)
      }
    }

    // Include narration audio files
    const audioUrls = store.generatedAudioUrls
    if (audioUrls?.length) {
      for (let i = 0; i < audioUrls.length; i++) {
        if (!audioUrls[i]) continue
        try {
          const response = await fetch(audioUrls[i])
          const blob = await response.blob()
          const ext = blob.type === 'audio/wav' ? 'wav' : 'mp3'
          zip.file(`narration-${i + 1}.${ext}`, blob)
        } catch {
          // Skip failed audio fetch
        }
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

// Download all images + audio as MP4 with specified bitrate
const downloadAllAsMp4 = async (videoBitrate) => {
  if (store.generatedImages.length === 0 || isBatchDownloading.value) return

  isBatchDownloading.value = true
  showBatchMenu.value = false

  try {
    const imageBuffers = []
    const imageMimeTypes = []

    for (const image of store.generatedImages) {
      const blob = imageToBlob(image)
      if (blob) {
        imageBuffers.push(await blob.arrayBuffer())
        imageMimeTypes.push(image.mimeType || blob.type || 'image/png')
      } else {
        imageBuffers.push(null)
        imageMimeTypes.push('image/png')
      }
    }

    const audioBuffers = []
    const audioUrls = store.generatedAudioUrls

    if (audioUrls?.length) {
      for (let i = 0; i < store.generatedImages.length; i++) {
        if (audioUrls[i]) {
          try {
            const response = await fetch(audioUrls[i])
            const blob = await response.blob()
            audioBuffers.push(await blob.arrayBuffer())
          } catch {
            audioBuffers.push(null)
          }
        } else {
          audioBuffers.push(null)
        }
      }
    } else {
      for (let i = 0; i < store.generatedImages.length; i++) {
        audioBuffers.push(null)
      }
    }

    await mp4Encoder.encodeAndDownload({
      images: imageBuffers,
      imageMimeTypes,
      audioBuffers,
      videoBitrate,
    }, `slides-${Date.now()}`)
  } catch (err) {
    console.error('MP4 encoding failed:', err)
    toast.error(t('lightbox.mp4Error'))
  } finally {
    isBatchDownloading.value = false
  }
}

const clearImages = () => {
  store.clearGeneratedImages()
  store.clearGeneratedImagesMetadata()
  store.clearGeneratedAudioUrls()
}

// Audio mutual exclusion - when one audio starts, pause others
// Use WeakMap to store pauseFn reference for each audio element
const audioPauseFnMap = new WeakMap()

const handleAudioPlay = (index, event) => {
  const audioEl = event.target
  // Create and store pauseFn for this audio element
  const pauseFn = () => audioEl.pause()
  audioPauseFnMap.set(audioEl, pauseFn)
  // Register this audio with global manager (will pause any other playing audio)
  registerPlaying(audioEl, pauseFn)
}

const handleAudioPause = (index, event) => {
  const audioEl = event.target
  // Retrieve the same pauseFn reference that was registered
  const pauseFn = audioPauseFnMap.get(audioEl)
  if (pauseFn) {
    unregisterPlaying(pauseFn)
    audioPauseFnMap.delete(audioEl)
  }
}
</script>

<template>
  <!-- Video Preview -->
  <div v-if="store.generatedVideo" class="space-y-6 fade-in">
    <div class="flex items-center justify-between">
      <h3 class="font-semibold text-text-primary flex items-center gap-2">
        <svg class="w-5 h-5 text-status-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        {{ $t('preview.videoTitle') }}
        <!-- Total time badge -->
        <span
          v-if="totalTime"
          class="text-xs px-2 py-0.5 rounded-full bg-status-success-muted text-status-success font-mono"
        >
          {{ totalTime }}
        </span>
      </h3>
      <div class="flex gap-2">
        <button
          @click="downloadVideo"
          class="btn-secondary py-2 px-4 text-sm flex items-center gap-1"
          :class="{ 'opacity-50 cursor-wait': isVideoDownloading }"
          :disabled="isVideoDownloading"
        >
          <svg v-if="isVideoDownloading" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          {{ $t('common.download') }}
        </button>
        <button @click="clearVideo" class="text-text-muted hover:text-text-secondary py-2 px-4 text-sm">
          {{ $t('common.clear') }}
        </button>
      </div>
    </div>

    <!-- Video Player -->
    <div class="relative group cursor-pointer" @click="openVideoLightbox">
      <video
        v-if="videoPreviewUrl"
        :src="videoPreviewUrl"
        class="w-full max-h-[400px] object-contain rounded-xl bg-bg-muted"
        controls
        playsinline
      />
      <!-- Expand button overlay -->
      <button
        @click.stop="openVideoLightbox"
        class="absolute top-3 right-3 p-2 rounded-lg bg-black/50 text-white hover:bg-black/70 transition-all"
        :title="$t('preview.zoom')"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
        </svg>
      </button>
    </div>

    <!-- Video Lightbox -->
    <VideoLightbox
      v-model="videoLightboxOpen"
      :video-url="currentVideoUrl"
    />
  </div>

  <!-- Image Preview -->
  <div v-else-if="store.generatedImages.length > 0" class="space-y-6 fade-in">
    <div class="flex items-center justify-between">
      <h3 class="font-semibold text-text-primary flex items-center gap-2">
        <svg class="w-5 h-5 text-status-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        {{ $t('preview.title') }}
        <span class="badge">{{ store.generatedImages.length }}</span>
        <!-- Total time badge -->
        <span
          v-if="totalTime"
          class="text-xs px-2 py-0.5 rounded-full bg-status-success-muted text-status-success font-mono"
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
            <button
              v-if="isWebCodecsSupported"
              @click="handleMp4Click"
              :disabled="isBatchDownloading"
              :class="{ 'opacity-50 cursor-wait': mp4Encoder.isEncoding.value }"
              class="batch-download-option"
            >
              <svg v-if="mp4Encoder.isEncoding.value" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
              </svg>
              <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              {{ mp4Encoder.isEncoding.value
                ? $t('lightbox.mp4Progress', mp4Encoder.progress.value)
                : 'MP4' }}
            </button>
          </div>
        </div>
        <button @click="clearImages" class="text-text-muted hover:text-text-secondary py-2 px-4 text-sm">
          {{ $t('common.clear') }}
        </button>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-4">
      <div
        v-for="(image, index) in store.generatedImages"
        :key="index"
        class="flex flex-col gap-0"
      >
        <div
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
            class="absolute top-2 right-2 p-2 rounded-lg bg-black/50 text-white hover:bg-black/70 transition-all"
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
        <!-- Mini audio player for narration -->
        <div v-if="store.generatedAudioUrls[index]" class="preview-audio-bar">
          <svg class="w-3.5 h-3.5 flex-shrink-0 text-text-muted" fill="currentColor" viewBox="0 0 24 24">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
          </svg>
          <audio
            :key="store.generatedAudioUrls[index]"
            :src="store.generatedAudioUrls[index]"
            controls
            class="preview-audio-element"
            @click.stop
            @play="handleAudioPlay(index, $event)"
            @pause="handleAudioPause(index, $event)"
          />
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
      :is-slides-mode="store.currentMode === 'slides'"
      :narration-audio-urls="store.generatedAudioUrls"
    />

    <!-- MP4 Quality Modal -->
    <Mp4QualityModal
      v-model="showMp4QualityModal"
      @confirm="downloadAllAsMp4"
    />
  </div>

  <!-- Loading state -->
  <div v-else-if="store.isGenerating" class="flex flex-col items-center justify-center py-16 space-y-6">
    <div class="relative">
      <div class="spinner"></div>
      <div class="absolute inset-0 spinner" style="animation-delay: -0.5s; opacity: 0.5;"></div>
      <!-- Timer in center -->
      <div class="absolute inset-0 flex items-center justify-center">
        <span class="text-2xl font-mono font-bold text-text-primary tabular-nums">
          {{ elapsedTime }}
        </span>
      </div>
    </div>
    <div class="text-center">
      <p class="text-text-primary font-medium">{{ $t('preview.loading') }}</p>
      <p class="text-sm text-text-muted mt-1">{{ $t('preview.loadingHint') }}</p>
    </div>
  </div>

  <!-- Empty state -->
  <div v-else class="flex flex-col items-center justify-center py-16 text-center">
    <div class="w-20 h-20 rounded-2xl bg-bg-muted flex items-center justify-center mb-6">
      <!-- Video mode icon -->
      <svg v-if="store.currentMode === 'video'" class="w-10 h-10 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
      <!-- Image mode icon -->
      <svg v-else class="w-10 h-10 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    </div>
    <p class="text-text-muted">{{ store.currentMode === 'video' ? $t('preview.emptyVideo') : $t('preview.empty') }}</p>
    <p class="text-sm text-text-muted mt-1">{{ store.currentMode === 'video' ? $t('preview.emptyVideoHint') : $t('preview.emptyHint') }}</p>
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

/* Mini audio player bar below image card */
.preview-audio-bar {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.5rem;
  background: var(--color-bg-muted);
  border-radius: 0 0 0.75rem 0.75rem;
  margin-top: -2px;
}

.preview-audio-element {
  flex: 1;
  height: 28px;
  min-width: 0;
}

/* Compact audio controls styling */
.preview-audio-element::-webkit-media-controls-panel {
  background: transparent;
}
</style>
