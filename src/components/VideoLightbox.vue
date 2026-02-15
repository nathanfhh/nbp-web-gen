<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatFileSize } from '@/composables/useImageCompression'
import { useVideoStorage } from '@/composables/useVideoStorage'
import { useToast } from '@/composables/useToast'
import { useHistoryState } from '@/composables/useHistoryState'

const { t } = useI18n()
const toast = useToast()
const videoStorage = useVideoStorage()

const props = defineProps({
  videoUrl: {
    type: String,
    default: null,
  },
  modelValue: {
    type: Boolean,
    default: false,
  },
  metadata: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(['update:modelValue', 'close'])

const videoRef = ref(null)
const isVisible = ref(false)
const isClosing = ref(false)
const isDownloading = ref(false)

// History state management for back gesture/button support
const { pushState, popState } = useHistoryState('videoLightbox', {
  onBackNavigation: () => {
    emit('update:modelValue', false)
  },
})

// Watch for external open
watch(() => props.modelValue, (newVal) => {
  if (newVal) {
    isVisible.value = true
    isClosing.value = false
    document.body.style.overflow = 'hidden'
    pushState()
  } else {
    isClosing.value = true
    popState()
    setTimeout(() => {
      isVisible.value = false
      isClosing.value = false
      document.body.style.overflow = ''
    }, 300)
  }
})

const close = () => {
  emit('update:modelValue', false)
  emit('close')
}

// Video info
const videoInfo = computed(() => {
  if (!props.metadata) return null
  return {
    width: props.metadata.width || 0,
    height: props.metadata.height || 0,
    size: formatFileSize(props.metadata.size || 0),
    historyId: props.metadata.historyId,
    prompt: props.metadata.prompt,
  }
})

// Download video
const downloadVideo = async () => {
  if (isDownloading.value) return

  // Need either opfsPath (from history) or videoUrl (from preview)
  const hasOpfsPath = !!props.metadata?.opfsPath
  const hasVideoUrl = !!props.videoUrl

  if (!hasOpfsPath && !hasVideoUrl) return

  isDownloading.value = true

  try {
    let blob
    let downloadUrl

    if (hasOpfsPath) {
      // Load from OPFS (history video)
      blob = await videoStorage.loadVideoBlob(props.metadata.opfsPath)
      if (!blob) {
        throw new Error('Failed to load video from storage')
      }
      downloadUrl = URL.createObjectURL(blob)
    } else {
      // Use videoUrl directly (preview video, already a blob URL)
      downloadUrl = props.videoUrl
    }

    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = `video-${props.metadata?.historyId || Date.now()}.mp4`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)

    // Only revoke if we created the URL
    if (hasOpfsPath) {
      URL.revokeObjectURL(downloadUrl)
    }

    toast.success(t('toast.downloadSuccess'))
  } catch (err) {
    console.error('Failed to download video:', err)
    toast.error(t('toast.downloadFailed'))
  } finally {
    isDownloading.value = false
  }
}

// Keyboard navigation
const handleKeydown = (e) => {
  if (!props.modelValue) return

  switch (e.key) {
    case 'Escape':
      e.stopPropagation()
      e.preventDefault()
      close()
      break
    case ' ':
      e.preventDefault()
      if (videoRef.value) {
        if (videoRef.value.paused) {
          videoRef.value.play()
        } else {
          videoRef.value.pause()
        }
      }
      break
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown, true)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown, true)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="lightbox">
      <div
        v-if="isVisible"
        class="lightbox-overlay"
        :class="{ 'is-closing': isClosing }"
        @click.self="close"
      >
        <!-- Top toolbar -->
        <div class="lightbox-toolbar">
          <!-- Download button -->
          <button
            @click="downloadVideo"
            class="lightbox-btn flex items-center gap-2"
            :class="{ 'opacity-50 cursor-wait': isDownloading }"
            :disabled="isDownloading"
            :title="$t('common.download')"
          >
            <svg v-if="isDownloading" class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
            <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span class="text-xs font-medium">{{ $t('common.download') }}</span>
          </button>

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

        <!-- Video container -->
        <div class="lightbox-content">
          <div class="lightbox-video-wrapper">
            <video
              v-if="videoUrl"
              ref="videoRef"
              :src="videoUrl"
              class="lightbox-video"
              controls
              autoplay
              playsinline
            />
          </div>
        </div>

        <!-- Video Info -->
        <div v-if="videoInfo" class="lightbox-info">
          <div class="lightbox-info-row">
            <!-- Dimensions -->
            <span v-if="videoInfo.width && videoInfo.height">
              {{ videoInfo.width }} × {{ videoInfo.height }}
            </span>

            <!-- File size -->
            <template v-if="videoInfo.size">
              <span class="lightbox-info-divider"></span>
              <span>{{ videoInfo.size }}</span>
            </template>

            <!-- History ID -->
            <template v-if="videoInfo.historyId">
              <span class="lightbox-info-divider"></span>
              <span class="text-text-muted">#{{ videoInfo.historyId }}</span>
            </template>
          </div>

          <!-- Prompt (truncated) -->
          <div v-if="videoInfo.prompt" class="lightbox-info-row text-text-muted">
            <span class="truncate max-w-[300px]">{{ videoInfo.prompt }}</span>
          </div>
        </div>
      </div>
    </Transition>
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
  padding: 0;
  margin: 0;
  box-sizing: border-box;
}

.lightbox-overlay.is-closing {
  animation: lightbox-fade-out 0.3s ease-out forwards;
}

@keyframes lightbox-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes lightbox-fade-out {
  from { opacity: 1; }
  to { opacity: 0; }
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

.lightbox-content {
  max-width: 90vw;
  max-height: 85vh;
  overflow: visible;
  user-select: none;
  margin: auto;
  position: relative;
}

.lightbox-video-wrapper {
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

.lightbox-overlay.is-closing .lightbox-video-wrapper {
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

.lightbox-video {
  max-width: 90vw;
  max-height: 85vh;
  border-radius: 0.5rem;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
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

.lightbox-info-divider {
  width: 1px;
  height: 1rem;
  background: rgba(255, 255, 255, 0.3);
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
