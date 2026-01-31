<script setup>
import { ref, watch, computed } from 'vue'

const MP4_QUALITY_KEY = 'nbp-mp4-quality'

const QUALITY_OPTIONS = {
  low: { bitrate: 4_000_000, label: 'low' },
  medium: { bitrate: 8_000_000, label: 'medium' },
  high: { bitrate: 12_000_000, label: 'high' },
}

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:modelValue', 'confirm'])

// Local state for selection - load from localStorage or default to 'medium'
const selectedQuality = ref(localStorage.getItem(MP4_QUALITY_KEY) || 'medium')

// Reset to stored preference when modal opens
watch(
  () => props.modelValue,
  (newVal) => {
    if (newVal) {
      selectedQuality.value = localStorage.getItem(MP4_QUALITY_KEY) || 'medium'
    }
  },
)

// Computed bitrate based on selection
const selectedBitrate = computed(() => {
  return QUALITY_OPTIONS[selectedQuality.value]?.bitrate || QUALITY_OPTIONS.medium.bitrate
})

const handleConfirm = () => {
  // Save to localStorage for next time
  localStorage.setItem(MP4_QUALITY_KEY, selectedQuality.value)
  emit('confirm', selectedBitrate.value)
  emit('update:modelValue', false)
}

const handleCancel = () => {
  emit('update:modelValue', false)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="modelValue"
        class="fixed inset-0 flex items-center justify-center bg-bg-overlay"
        style="z-index: 10010;"
        @click.self="handleCancel"
      >
        <div class="bg-bg-card rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
          <!-- Header -->
          <div class="px-6 py-4 border-b border-border-default">
            <h3 class="text-lg font-semibold text-text-primary">
              {{ $t('lightbox.mp4Quality.title') }}
            </h3>
            <p class="text-sm text-text-muted mt-1">
              {{ $t('lightbox.mp4Quality.hint') }}
            </p>
          </div>

          <!-- Options -->
          <div class="p-6 space-y-3">
            <!-- Low Quality -->
            <label
              class="flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all"
              :class="selectedQuality === 'low'
                ? 'border-mode-generate bg-mode-generate/10'
                : 'border-border-muted hover:border-border-default'"
            >
              <input
                type="radio"
                v-model="selectedQuality"
                value="low"
                class="sr-only"
              />
              <div
                class="w-10 h-10 rounded-lg flex items-center justify-center"
                :class="selectedQuality === 'low' ? 'bg-mode-generate text-white' : 'bg-bg-muted text-text-muted'"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div class="flex-1">
                <div class="text-sm font-medium text-text-primary">{{ $t('lightbox.mp4Quality.low') }}</div>
                <div class="text-xs text-text-muted">{{ $t('lightbox.mp4Quality.lowDesc') }}</div>
              </div>
            </label>

            <!-- Medium Quality -->
            <label
              class="flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all"
              :class="selectedQuality === 'medium'
                ? 'border-mode-generate bg-mode-generate/10'
                : 'border-border-muted hover:border-border-default'"
            >
              <input
                type="radio"
                v-model="selectedQuality"
                value="medium"
                class="sr-only"
              />
              <div
                class="w-10 h-10 rounded-lg flex items-center justify-center"
                :class="selectedQuality === 'medium' ? 'bg-mode-generate text-white' : 'bg-bg-muted text-text-muted'"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
                </svg>
              </div>
              <div class="flex-1">
                <div class="text-sm font-medium text-text-primary">{{ $t('lightbox.mp4Quality.medium') }}</div>
                <div class="text-xs text-text-muted">{{ $t('lightbox.mp4Quality.mediumDesc') }}</div>
              </div>
            </label>

            <!-- High Quality -->
            <label
              class="flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all"
              :class="selectedQuality === 'high'
                ? 'border-mode-generate bg-mode-generate/10'
                : 'border-border-muted hover:border-border-default'"
            >
              <input
                type="radio"
                v-model="selectedQuality"
                value="high"
                class="sr-only"
              />
              <div
                class="w-10 h-10 rounded-lg flex items-center justify-center"
                :class="selectedQuality === 'high' ? 'bg-mode-generate text-white' : 'bg-bg-muted text-text-muted'"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
              </div>
              <div class="flex-1">
                <div class="text-sm font-medium text-text-primary">{{ $t('lightbox.mp4Quality.high') }}</div>
                <div class="text-xs text-text-muted">{{ $t('lightbox.mp4Quality.highDesc') }}</div>
              </div>
            </label>
          </div>

          <!-- Footer -->
          <div class="px-6 py-4 border-t border-border-default flex gap-3">
            <button
              @click="handleCancel"
              class="flex-1 py-2.5 rounded-xl bg-bg-muted text-text-secondary hover:bg-bg-interactive transition-colors text-sm font-medium"
            >
              {{ $t('common.cancel') }}
            </button>
            <button
              @click="handleConfirm"
              class="flex-1 py-2.5 rounded-xl bg-mode-generate text-text-on-brand hover:opacity-90 transition-colors text-sm font-medium"
            >
              {{ $t('lightbox.mp4Quality.start') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active > div,
.modal-leave-active > div {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.modal-enter-from > div,
.modal-leave-to > div {
  transform: scale(0.95);
  opacity: 0;
}
</style>
