<script>
// Module-level singleton: track currently playing instance across all VoicePreviewButton instances
let currentlyPlaying = null
</script>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'

const props = defineProps({
  voiceName: {
    type: String,
    required: true,
  },
  size: {
    type: Number,
    default: 32,
  },
})

const audio = ref(null)
const isPlaying = ref(false)
const progress = ref(0)

// Stop this instance (called by other instances)
const stopPlayback = () => {
  if (audio.value) {
    audio.value.pause()
    audio.value.currentTime = 0
  }
  isPlaying.value = false
  progress.value = 0
}

// Circle geometry
const strokeWidth = 3
const radius = computed(() => (props.size - strokeWidth) / 2)
const circumference = computed(() => 2 * Math.PI * radius.value)
const strokeDashoffset = computed(() => circumference.value * (1 - progress.value))

// Audio file path (with base URL for GitHub Pages)
const audioSrc = computed(() => {
  const name = props.voiceName.toLowerCase()
  const base = import.meta.env.BASE_URL || '/'
  return `${base}voice-samples/${name}.ogg`
})

// Reset audio when voiceName changes
watch(
  () => props.voiceName,
  () => {
    if (audio.value) {
      audio.value.pause()
      audio.value.removeEventListener('timeupdate', onTimeUpdate)
      audio.value.removeEventListener('ended', onEnded)
      audio.value = null
    }
    isPlaying.value = false
    progress.value = 0
    if (currentlyPlaying === stopPlayback) {
      currentlyPlaying = null
    }
  },
)

// Update progress during playback
const onTimeUpdate = () => {
  if (audio.value && audio.value.duration) {
    progress.value = audio.value.currentTime / audio.value.duration
  }
}

const onEnded = () => {
  isPlaying.value = false
  progress.value = 0
  if (currentlyPlaying === stopPlayback) {
    currentlyPlaying = null
  }
}

const togglePlay = async () => {
  if (!audio.value) {
    audio.value = new Audio(audioSrc.value)
    audio.value.addEventListener('timeupdate', onTimeUpdate)
    audio.value.addEventListener('ended', onEnded)
  }

  if (isPlaying.value) {
    audio.value.pause()
    isPlaying.value = false
    currentlyPlaying = null
  } else {
    // Stop any other playing instance first
    if (currentlyPlaying && currentlyPlaying !== stopPlayback) {
      currentlyPlaying()
    }

    // Reset if ended
    if (audio.value.ended) {
      audio.value.currentTime = 0
      progress.value = 0
    }
    try {
      await audio.value.play()
      isPlaying.value = true
      currentlyPlaying = stopPlayback
    } catch (err) {
      console.warn('Audio play failed:', err)
    }
  }
}

// Cleanup
onBeforeUnmount(() => {
  if (audio.value) {
    audio.value.pause()
    audio.value.removeEventListener('timeupdate', onTimeUpdate)
    audio.value.removeEventListener('ended', onEnded)
    audio.value = null
  }
  if (currentlyPlaying === stopPlayback) {
    currentlyPlaying = null
  }
})
</script>

<template>
  <button
    type="button"
    class="voice-preview-btn"
    :style="{ width: `${size}px`, height: `${size}px` }"
    :title="isPlaying ? $t('common.pause') : $t('slides.narration.previewVoice')"
    @click.stop="togglePlay"
  >
    <!-- Circular progress -->
    <svg
      class="voice-preview-btn__ring"
      :width="size"
      :height="size"
      :viewBox="`0 0 ${size} ${size}`"
    >
      <!-- Background circle -->
      <circle
        class="voice-preview-btn__track"
        :cx="size / 2"
        :cy="size / 2"
        :r="radius"
        fill="none"
        :stroke-width="strokeWidth"
      />
      <!-- Progress circle -->
      <circle
        class="voice-preview-btn__progress"
        :cx="size / 2"
        :cy="size / 2"
        :r="radius"
        fill="none"
        :stroke-width="strokeWidth"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="strokeDashoffset"
        stroke-linecap="round"
      />
    </svg>

    <!-- Play/Pause icon -->
    <div class="voice-preview-btn__icon">
      <!-- Pause icon -->
      <svg v-if="isPlaying" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
        <rect x="6" y="4" width="4" height="16" rx="1" />
        <rect x="14" y="4" width="4" height="16" rx="1" />
      </svg>
      <!-- Play icon -->
      <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
        <path d="M8 5.14v14.72a1 1 0 001.5.86l11-7.36a1 1 0 000-1.72l-11-7.36a1 1 0 00-1.5.86z" />
      </svg>
    </div>
  </button>
</template>

<style scoped>
.voice-preview-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: none;
  border-radius: 50%;
  background: var(--color-bg-muted);
  cursor: pointer;
  transition: background 0.2s ease;
}

.voice-preview-btn:hover {
  background: var(--color-bg-interactive);
}

.voice-preview-btn__ring {
  position: absolute;
  top: 0;
  left: 0;
  transform: rotate(-90deg);
}

.voice-preview-btn__track {
  stroke: var(--color-border-muted);
}

.voice-preview-btn__progress {
  stroke: var(--color-mode-generate);
  transition: stroke-dashoffset 0.1s linear;
}

.voice-preview-btn__icon {
  position: relative;
  z-index: 1;
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.voice-preview-btn:hover .voice-preview-btn__icon {
  color: var(--color-text-primary);
}
</style>
