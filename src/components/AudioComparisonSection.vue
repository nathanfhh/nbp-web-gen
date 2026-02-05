<script setup>
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps({
  // Original audio URL (may be null for first-time generation)
  originalAudioUrl: {
    type: String,
    default: null,
  },
  // New audio URL (always present when comparing)
  newAudioUrl: {
    type: String,
    required: true,
  },
  // Selected choice: 'original' | 'new'
  modelValue: {
    type: String,
    default: 'new',
  },
  // Whether original can be selected (false for first-time generation)
  canKeepOriginal: {
    type: Boolean,
    default: true,
  },
})

const emit = defineEmits(['update:modelValue'])

// Audio playback state
const isPlayingOriginal = ref(false)
const isPlayingNew = ref(false)
const originalAudioRef = ref(null)
const newAudioRef = ref(null)

// Reset playback state when URLs change
watch(
  () => [props.originalAudioUrl, props.newAudioUrl],
  () => {
    isPlayingOriginal.value = false
    isPlayingNew.value = false
  },
)

// Play/pause original audio
const toggleOriginalAudio = () => {
  if (!props.originalAudioUrl || !originalAudioRef.value) return

  // Pause new if playing
  if (isPlayingNew.value && newAudioRef.value) {
    newAudioRef.value.pause()
    isPlayingNew.value = false
  }

  if (isPlayingOriginal.value) {
    originalAudioRef.value.pause()
    isPlayingOriginal.value = false
  } else {
    originalAudioRef.value.play()
    isPlayingOriginal.value = true
  }
}

// Play/pause new audio
const toggleNewAudio = () => {
  if (!newAudioRef.value) return

  // Pause original if playing
  if (isPlayingOriginal.value && originalAudioRef.value) {
    originalAudioRef.value.pause()
    isPlayingOriginal.value = false
  }

  if (isPlayingNew.value) {
    newAudioRef.value.pause()
    isPlayingNew.value = false
  } else {
    newAudioRef.value.play()
    isPlayingNew.value = true
  }
}

// Audio ended handlers
const handleOriginalEnded = () => {
  isPlayingOriginal.value = false
}

const handleNewEnded = () => {
  isPlayingNew.value = false
}

// Select option
const selectOption = (value) => {
  if (value === 'original' && !props.canKeepOriginal) return
  emit('update:modelValue', value)
}
</script>

<template>
  <div class="space-y-4">
    <!-- Section Title -->
    <div class="text-sm font-medium text-text-secondary text-center">
      {{ t('slides.audioSection') }}
    </div>

    <!-- Audio Options Grid -->
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <!-- Original Audio -->
      <div class="space-y-2">
        <div class="text-sm font-medium text-text-secondary text-center">
          {{ t('slides.originalAudio') }}
        </div>
        <div
          class="relative rounded-xl p-4 transition-all cursor-pointer ring-2"
          :class="[
            modelValue === 'original' && canKeepOriginal
              ? 'ring-brand-primary bg-brand-primary/5'
              : 'ring-transparent bg-bg-muted hover:ring-border-default',
            !canKeepOriginal ? 'opacity-50 cursor-not-allowed' : '',
          ]"
          @click="selectOption('original')"
        >
          <div v-if="originalAudioUrl" class="flex items-center justify-center gap-3">
            <!-- Play/Pause Button -->
            <button
              @click.stop="toggleOriginalAudio"
              class="w-12 h-12 rounded-full flex items-center justify-center transition-all"
              :class="
                isPlayingOriginal
                  ? 'bg-brand-primary text-text-on-brand'
                  : 'bg-bg-interactive text-text-primary hover:bg-brand-primary hover:text-text-on-brand'
              "
            >
              <svg v-if="isPlayingOriginal" class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
              <svg v-else class="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>
            <span class="text-xs text-text-muted">{{ t('slides.clickToPlay') }}</span>
          </div>

          <!-- No existing audio -->
          <div v-else class="flex flex-col items-center justify-center py-2">
            <svg class="w-8 h-8 text-text-muted mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
            <span class="text-xs text-text-muted">{{ t('slides.noExistingAudio') }}</span>
          </div>

          <!-- Hidden Audio Element -->
          <audio
            v-if="originalAudioUrl"
            ref="originalAudioRef"
            :src="originalAudioUrl"
            @ended="handleOriginalEnded"
            class="hidden"
          />

          <!-- Selection Indicator -->
          <div
            v-if="modelValue === 'original' && canKeepOriginal"
            class="absolute top-2 right-2 w-5 h-5 rounded-full bg-brand-primary flex items-center justify-center"
          >
            <svg class="w-3 h-3 text-text-on-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>
      </div>

      <!-- New Audio -->
      <div class="space-y-2">
        <div class="text-sm font-medium text-text-secondary text-center">
          {{ t('slides.newAudio') }}
        </div>
        <div
          class="relative rounded-xl p-4 transition-all cursor-pointer ring-2"
          :class="
            modelValue === 'new'
              ? 'ring-mode-generate bg-mode-generate/5'
              : 'ring-transparent bg-bg-muted hover:ring-border-default'
          "
          @click="selectOption('new')"
        >
          <div class="flex items-center justify-center gap-3">
            <!-- Play/Pause Button -->
            <button
              @click.stop="toggleNewAudio"
              class="w-12 h-12 rounded-full flex items-center justify-center transition-all"
              :class="
                isPlayingNew
                  ? 'bg-mode-generate text-text-on-brand'
                  : 'bg-bg-interactive text-text-primary hover:bg-mode-generate hover:text-text-on-brand'
              "
            >
              <svg v-if="isPlayingNew" class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
              <svg v-else class="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>
            <span class="text-xs text-text-muted">{{ t('slides.clickToPlay') }}</span>
          </div>

          <!-- Hidden Audio Element -->
          <audio
            ref="newAudioRef"
            :src="newAudioUrl"
            @ended="handleNewEnded"
            class="hidden"
          />

          <!-- Selection Indicator -->
          <div
            v-if="modelValue === 'new'"
            class="absolute top-2 right-2 w-5 h-5 rounded-full bg-mode-generate flex items-center justify-center"
          >
            <svg class="w-3 h-3 text-text-on-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
