<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { registerPlaying, unregisterPlaying } from '@/composables/useGlobalAudioManager'

const { t } = useI18n()

const props = defineProps({
  audioUrl: {
    type: String,
    default: null,
  },
  // Whether to show auto-play toggle (for slides mode with multiple audio)
  showAutoPlay: {
    type: Boolean,
    default: false,
  },
  // v-model for auto-play state
  autoPlay: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['ended', 'update:autoPlay'])

// Playback speed options (sorted for menu display)
const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2]
const STORAGE_KEY = 'nbp-audio-playback-rate'
const IDLE_TIMEOUT = 3000 // Hide after 3 seconds of inactivity

const audioRef = ref(null)
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const isDragging = ref(false)
const playbackRate = ref(1)
const showSpeedMenu = ref(false)

// Auto-hide functionality
const isVisible = ref(true)
let idleTimer = null

const showPlayer = () => {
  isVisible.value = true
  resetIdleTimer()
}

const hidePlayer = () => {
  // Don't hide if speed menu is open
  if (showSpeedMenu.value) return
  isVisible.value = false
}

const resetIdleTimer = () => {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(hidePlayer, IDLE_TIMEOUT)
}

// Show on any interaction
const onInteraction = () => {
  showPlayer()
}

// Flag to auto-play when audio is ready (for auto-play feature)
const playWhenReady = ref(false)

// Flag to auto-play next audio after current one ends (internal auto-play logic)
const pendingAutoPlayNext = ref(false)

// Load saved playback rate from localStorage
onMounted(() => {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) {
    const rate = parseFloat(saved)
    if (SPEED_OPTIONS.includes(rate)) {
      playbackRate.value = rate
      // If audio is already loaded, apply rate immediately
      // (loadedmetadata may have fired before onMounted)
      if (audioRef.value) {
        audioRef.value.playbackRate = rate
      }
    }
  }
  // Start idle timer for auto-hide
  resetIdleTimer()
})

const progressPercent = () => {
  if (!duration.value) return 0
  return (currentTime.value / duration.value) * 100
}

const formatTime = (seconds) => {
  if (!seconds || !isFinite(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// Pause function for global audio manager
const pausePlayback = () => {
  if (audioRef.value) {
    audioRef.value.pause()
  }
}

const togglePlay = () => {
  if (!audioRef.value) return
  if (isPlaying.value) {
    audioRef.value.pause()
  } else {
    audioRef.value.play()
  }
}

// Toggle auto-play
const toggleAutoPlay = () => {
  emit('update:autoPlay', !props.autoPlay)
}

// Toggle speed menu
const toggleSpeedMenu = () => {
  showSpeedMenu.value = !showSpeedMenu.value
}

// Select playback speed from menu
const selectSpeed = (speed) => {
  playbackRate.value = speed
  showSpeedMenu.value = false

  // Save to localStorage
  localStorage.setItem(STORAGE_KEY, speed.toString())

  // Apply to audio element
  if (audioRef.value) {
    audioRef.value.playbackRate = speed
  }

  // Reset idle timer after interaction
  resetIdleTimer()
}

// Close menu when clicking outside
const onClickOutside = () => {
  showSpeedMenu.value = false
}

const onTimeUpdate = () => {
  if (!isDragging.value && audioRef.value) {
    currentTime.value = audioRef.value.currentTime
  }
}

const onLoadedMetadata = () => {
  if (audioRef.value) {
    duration.value = audioRef.value.duration
    // Apply saved playback rate when audio loads
    audioRef.value.playbackRate = playbackRate.value

    // Auto-play if flag is set (from play() called before audio was ready)
    if (playWhenReady.value) {
      playWhenReady.value = false
      audioRef.value.play()
    }
  }
}

const onPlay = () => {
  isPlaying.value = true
  // Ensure playback rate is applied when playback starts
  // (some browsers may reset it, or it may not have been set yet)
  if (audioRef.value) {
    audioRef.value.playbackRate = playbackRate.value
  }
  // Register with global audio manager
  registerPlaying(audioRef.value, pausePlayback)
}

const onPause = () => {
  isPlaying.value = false
  // Unregister from global audio manager
  unregisterPlaying(pausePlayback)
}

const onEnded = () => {
  isPlaying.value = false
  currentTime.value = 0
  unregisterPlaying(pausePlayback)

  // If auto-play is enabled, set flag to play next audio when it loads
  if (props.autoPlay) {
    pendingAutoPlayNext.value = true
  }

  // Emit ended event for parent to advance to next page
  emit('ended')
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
  (newUrl) => {
    if (isPlaying.value) {
      unregisterPlaying(pausePlayback)
    }
    isPlaying.value = false
    currentTime.value = 0
    duration.value = 0
    showSpeedMenu.value = false

    // Show player when new audio loads
    if (newUrl) {
      showPlayer()
    }

    // If pending auto-play from previous audio ending, transfer to playWhenReady
    if (pendingAutoPlayNext.value && newUrl) {
      pendingAutoPlayNext.value = false
      playWhenReady.value = true
    }
  },
)

// Play method for parent component (auto-play feature)
// If audio is not ready yet, set flag to play when ready
const play = () => {
  if (!audioRef.value) return

  // Check if audio is ready (has duration)
  if (audioRef.value.readyState >= 1) {
    audioRef.value.play()
  } else {
    // Audio not ready yet, set flag to play when loaded
    playWhenReady.value = true
  }
}

defineExpose({ play, togglePlay })

onUnmounted(() => {
  document.removeEventListener('mousemove', onProgressMouseMove)
  document.removeEventListener('mouseup', onProgressMouseUp)
  if (isPlaying.value) {
    unregisterPlaying(pausePlayback)
  }
  // Clean up idle timer
  if (idleTimer) clearTimeout(idleTimer)
})
</script>

<template>
  <!-- Hover zone - always visible and interactive for hover detection -->
  <div
    v-if="audioUrl"
    class="lightbox-audio-hover-zone"
    @mouseenter="onInteraction"
    @touchstart.stop="onInteraction"
  >
    <div
      class="lightbox-audio-player"
      :class="{ 'is-hidden': !isVisible }"
      @click.stop="onInteraction"
      @mousedown.stop="onInteraction"
    >
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
      <button
        @click="togglePlay"
        class="audio-play-btn"
        :title="isPlaying ? t('common.pause') : t('common.play')"
      >
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
          <div class="audio-progress-fill" :style="{ width: `${progressPercent()}%` }" />
          <div class="audio-progress-thumb" :style="{ left: `${progressPercent()}%` }" />
        </div>
      </div>

      <!-- Time Display -->
      <span class="audio-time">
        {{ formatTime(currentTime) }} / {{ formatTime(duration) }}
      </span>

      <!-- Playback Speed Dropdown -->
      <div class="audio-speed-wrapper">
        <button
          @click="toggleSpeedMenu"
          class="audio-speed-btn"
          :title="t('lightbox.playbackSpeed')"
        >
          {{ playbackRate }}x
        </button>

        <!-- Speed Menu -->
        <Transition name="speed-menu">
          <div v-if="showSpeedMenu" class="audio-speed-menu" @click.stop>
            <div class="audio-speed-menu-backdrop" @click="onClickOutside" />
            <div class="audio-speed-menu-content">
              <button
                v-for="speed in SPEED_OPTIONS"
                :key="speed"
                @click="selectSpeed(speed)"
                class="audio-speed-option"
                :class="{ 'active': playbackRate === speed }"
              >
                {{ speed }}x
              </button>
            </div>
          </div>
        </Transition>
      </div>

      <!-- Auto-play Toggle (slides mode) -->
      <button
        v-if="showAutoPlay"
        @click="toggleAutoPlay"
        class="audio-autoplay-btn"
        :class="{ 'active': autoPlay }"
        :title="t('lightbox.autoPlayHint')"
      >
        <!-- Play in circle (off) / Pause in circle (on) -->
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <!-- Circle -->
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" />
          <!-- Play triangle (when off) or Pause bars (when on) -->
          <path v-if="!autoPlay" d="M10 8l6 4-6 4V8z" />
          <g v-else>
            <rect x="9" y="8" width="2" height="8" rx="0.5" />
            <rect x="13" y="8" width="2" height="8" rx="0.5" />
          </g>
        </svg>
      </button>
    </div>
  </div>
  </div>
</template>

<style scoped>
/* Hover zone - always interactive, positioned at bottom of lightbox */
.lightbox-audio-hover-zone {
  position: absolute;
  bottom: 4.5rem;
  left: 50%;
  transform: translateX(-50%);
  width: max(280px, 40vw);
  max-width: 600px;
  /* Extend hover zone slightly beyond the player for easier targeting */
  padding: 12px 0;
  /* Always allow interaction for hover detection */
  pointer-events: auto;
}

.lightbox-audio-player {
  width: 100%;
  padding: 8px 16px;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: 12px;
  /* Auto-hide transition */
  opacity: 1;
  transition: opacity 0.3s ease;
}

/* Hidden state - fade out and allow clicks through */
.lightbox-audio-player.is-hidden {
  opacity: 0;
  pointer-events: none;
}

/* Show player when hovering on zone (desktop) */
.lightbox-audio-hover-zone:hover .lightbox-audio-player.is-hidden {
  opacity: 1;
  pointer-events: auto;
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

/* Speed dropdown wrapper */
.audio-speed-wrapper {
  position: relative;
  flex-shrink: 0;
}

.audio-speed-btn {
  min-width: 40px;
  padding: 4px 8px;
  font-size: 0.7rem;
  font-weight: 600;
  color: white;
  background: rgba(255, 255, 255, 0.15);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}

.audio-speed-btn:hover {
  background: rgba(255, 255, 255, 0.25);
}

/* Speed menu */
.audio-speed-menu {
  position: absolute;
  bottom: calc(100% + 8px);
  right: 0;
  z-index: 10;
}

.audio-speed-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: -1;
}

.audio-speed-menu-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.audio-speed-option {
  padding: 6px 16px;
  font-size: 0.75rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.8);
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
  text-align: center;
  white-space: nowrap;
}

.audio-speed-option:hover {
  background: rgba(255, 255, 255, 0.15);
  color: white;
}

.audio-speed-option.active {
  background: var(--color-mode-generate);
  color: white;
}

/* Auto-play button */
.audio-autoplay-btn {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.6);
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.audio-autoplay-btn:hover {
  color: white;
  border-color: rgba(255, 255, 255, 0.4);
}

.audio-autoplay-btn.active {
  color: white;
  background: var(--color-mode-generate);
  border-color: var(--color-mode-generate);
}

/* Menu transition */
.speed-menu-enter-active,
.speed-menu-leave-active {
  transition: opacity 0.15s, transform 0.15s;
}

.speed-menu-enter-from,
.speed-menu-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

/* Mobile responsive */
@media (max-width: 640px) {
  .lightbox-audio-hover-zone {
    width: max(240px, 70vw);
    bottom: 4rem;
  }

  .lightbox-audio-player {
    padding: 6px 12px;
    border-radius: 8px;
  }

  .audio-player-inner {
    gap: 8px;
  }

  .audio-time {
    min-width: 65px;
    font-size: 0.7rem;
  }

  .audio-play-btn {
    width: 28px;
    height: 28px;
  }

  .audio-speed-btn {
    min-width: 36px;
    padding: 3px 6px;
    font-size: 0.65rem;
  }

  .audio-speed-option {
    padding: 8px 20px;
    font-size: 0.8rem;
  }

  .audio-autoplay-btn {
    width: 26px;
    height: 26px;
  }
}
</style>
