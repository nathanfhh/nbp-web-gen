<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'

const props = defineProps({
  audioUrl: {
    type: String,
    default: null,
  },
})

const audioRef = ref(null)
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const isDragging = ref(false)

const progressPercent = computed(() => {
  if (!duration.value) return 0
  return (currentTime.value / duration.value) * 100
})

const formatTime = (seconds) => {
  if (!seconds || !isFinite(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const togglePlay = () => {
  if (!audioRef.value) return
  if (isPlaying.value) {
    audioRef.value.pause()
  } else {
    audioRef.value.play()
  }
}

const onTimeUpdate = () => {
  if (!isDragging.value && audioRef.value) {
    currentTime.value = audioRef.value.currentTime
  }
}

const onLoadedMetadata = () => {
  if (audioRef.value) {
    duration.value = audioRef.value.duration
  }
}

const onPlay = () => {
  isPlaying.value = true
}

const onPause = () => {
  isPlaying.value = false
}

const onEnded = () => {
  isPlaying.value = false
  currentTime.value = 0
}

// Progress bar seek
const progressBarRef = ref(null)

const seek = (event) => {
  if (!progressBarRef.value || !audioRef.value || !duration.value) return
  const rect = progressBarRef.value.getBoundingClientRect()
  const x = Math.max(0, Math.min(event.clientX - rect.left, rect.width))
  const percent = x / rect.width
  audioRef.value.currentTime = percent * duration.value
  currentTime.value = audioRef.value.currentTime
}

const onProgressMouseDown = (event) => {
  isDragging.value = true
  seek(event)
  document.addEventListener('mousemove', onProgressMouseMove)
  document.addEventListener('mouseup', onProgressMouseUp)
}

const onProgressMouseMove = (event) => {
  if (isDragging.value) seek(event)
}

const onProgressMouseUp = () => {
  isDragging.value = false
  document.removeEventListener('mousemove', onProgressMouseMove)
  document.removeEventListener('mouseup', onProgressMouseUp)
}

// Touch support for progress bar
const onProgressTouchStart = (event) => {
  isDragging.value = true
  const touch = event.touches[0]
  seek(touch)
}

const onProgressTouchMove = (event) => {
  if (!isDragging.value) return
  event.preventDefault()
  const touch = event.touches[0]
  seek(touch)
}

const onProgressTouchEnd = () => {
  isDragging.value = false
}

// Stop playback when audio URL changes (page switch)
watch(
  () => props.audioUrl,
  () => {
    isPlaying.value = false
    currentTime.value = 0
    duration.value = 0
  },
)

onUnmounted(() => {
  document.removeEventListener('mousemove', onProgressMouseMove)
  document.removeEventListener('mouseup', onProgressMouseUp)
})
</script>

<template>
  <div v-if="audioUrl" class="lightbox-audio-player" @click.stop @mousedown.stop @touchstart.stop>
    <audio
      ref="audioRef"
      :src="audioUrl"
      @timeupdate="onTimeUpdate"
      @loadedmetadata="onLoadedMetadata"
      @play="onPlay"
      @pause="onPause"
      @ended="onEnded"
    />

    <div class="audio-player-inner">
      <!-- Play/Pause Button -->
      <button @click="togglePlay" class="audio-play-btn">
        <!-- Play Icon -->
        <svg v-if="!isPlaying" class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z" />
        </svg>
        <!-- Pause Icon -->
        <svg v-else class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
        </svg>
      </button>

      <!-- Progress Bar -->
      <div
        ref="progressBarRef"
        class="audio-progress-bar"
        @mousedown="onProgressMouseDown"
        @touchstart.passive="onProgressTouchStart"
        @touchmove="onProgressTouchMove"
        @touchend="onProgressTouchEnd"
      >
        <div class="audio-progress-track">
          <div class="audio-progress-fill" :style="{ width: `${progressPercent}%` }" />
          <div class="audio-progress-thumb" :style="{ left: `${progressPercent}%` }" />
        </div>
      </div>

      <!-- Time Display -->
      <span class="audio-time">
        {{ formatTime(currentTime) }} / {{ formatTime(duration) }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.lightbox-audio-player {
  position: absolute;
  bottom: 4.5rem;
  left: 50%;
  transform: translateX(-50%);
  width: max(280px, 40vw);
  max-width: 600px;
  padding: 8px 16px;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: 12px;
}

.audio-player-inner {
  display: flex;
  align-items: center;
  gap: 12px;
}

.audio-play-btn {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: white;
  background: rgba(255, 255, 255, 0.15);
  transition: background 0.15s;
  cursor: pointer;
  border: none;
}

.audio-play-btn:hover {
  background: rgba(255, 255, 255, 0.25);
}

.audio-progress-bar {
  flex: 1;
  height: 24px;
  display: flex;
  align-items: center;
  cursor: pointer;
  touch-action: none;
}

.audio-progress-track {
  position: relative;
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
}

.audio-progress-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 2px;
  transition: width 0.05s linear;
}

.audio-progress-thumb {
  position: absolute;
  top: 50%;
  width: 12px;
  height: 12px;
  background: white;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  transition: left 0.05s linear;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.audio-progress-bar:hover .audio-progress-thumb {
  width: 14px;
  height: 14px;
}

.audio-time {
  flex-shrink: 0;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.6);
  min-width: 80px;
  text-align: right;
}

/* Mobile responsive */
@media (max-width: 640px) {
  .lightbox-audio-player {
    width: max(240px, 70vw);
    padding: 6px 12px;
    border-radius: 8px;
    bottom: 4rem;
  }

  .audio-time {
    min-width: 65px;
    font-size: 0.7rem;
  }

  .audio-play-btn {
    width: 28px;
    height: 28px;
  }
}
</style>
