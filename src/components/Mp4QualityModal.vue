<script setup>
import { ref, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const MP4_QUALITY_KEY = 'nbp-mp4-quality'
const MP4_RESOLUTION_KEY = 'nbp-mp4-resolution'

const RESOLUTION_TIERS = [
  { key: '1080p', maxWidth: 1920, maxHeight: 1080 },
  { key: '1440p', maxWidth: 2560, maxHeight: 1440 },
  { key: '2160p', maxWidth: 3840, maxHeight: 2160 },
]

const BITRATE_MAP = {
  '1080p': { low: 4_000_000, medium: 8_000_000, high: 12_000_000 },
  '1440p': { low: 6_000_000, medium: 14_000_000, high: 20_000_000 },
  '2160p': { low: 10_000_000, medium: 20_000_000, high: 30_000_000 },
}

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  sourceWidth: {
    type: Number,
    default: 1920,
  },
  sourceHeight: {
    type: Number,
    default: 1080,
  },
})

const emit = defineEmits(['update:modelValue', 'confirm'])

// Local state
const selectedQuality = ref(localStorage.getItem(MP4_QUALITY_KEY) || 'medium')
const selectedResolution = ref(localStorage.getItem(MP4_RESOLUTION_KEY) || '1080p')

// Determine which resolution tiers are available based on source image dimensions
// Uses 90% threshold: source must be at least 90% of the tier's resolution to enable it.
// This prevents misleading options (e.g. 2752×1536 won't show "2160p" since it's far from 4K).
const availableResolutions = computed(() => {
  return RESOLUTION_TIERS.map((tier, idx) => {
    if (idx === 0) return { ...tier, enabled: true }
    const enabled = props.sourceWidth >= tier.maxWidth * 0.9 || props.sourceHeight >= tier.maxHeight * 0.9
    return { ...tier, enabled }
  })
})

const hasDisabledResolutions = computed(() => {
  return availableResolutions.value.some(r => !r.enabled)
})

// Dynamic bitrate based on current resolution + quality selection
const currentBitrates = computed(() => {
  return BITRATE_MAP[selectedResolution.value] || BITRATE_MAP['1080p']
})

const selectedBitrate = computed(() => {
  return currentBitrates.value[selectedQuality.value] || currentBitrates.value.medium
})

// Format bitrate for display (e.g. 8000000 → "8 Mbps")
function formatBitrate(bps) {
  return `${bps / 1_000_000} Mbps`
}

// Reset to stored preferences when modal opens, clamping resolution if needed
watch(
  () => props.modelValue,
  (newVal) => {
    if (newVal) {
      selectedQuality.value = localStorage.getItem(MP4_QUALITY_KEY) || 'medium'
      const storedRes = localStorage.getItem(MP4_RESOLUTION_KEY) || '1080p'
      // Clamp: if stored resolution is no longer available, fall back to highest available
      const isStored = availableResolutions.value.find(r => r.key === storedRes)
      if (isStored?.enabled) {
        selectedResolution.value = storedRes
      } else {
        const highest = [...availableResolutions.value].reverse().find(r => r.enabled)
        selectedResolution.value = highest?.key || '1080p'
      }
    }
  },
)

const handleResolutionSelect = (tier) => {
  if (tier.enabled) {
    selectedResolution.value = tier.key
  }
}

const handleConfirm = () => {
  localStorage.setItem(MP4_QUALITY_KEY, selectedQuality.value)
  localStorage.setItem(MP4_RESOLUTION_KEY, selectedResolution.value)
  const tier = RESOLUTION_TIERS.find(r => r.key === selectedResolution.value)
  emit('confirm', {
    videoBitrate: selectedBitrate.value,
    maxWidth: tier?.maxWidth || 1920,
    maxHeight: tier?.maxHeight || 1080,
  })
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

          <div class="p-6 space-y-5">
            <!-- Resolution Selection -->
            <div>
              <div class="text-sm font-medium text-text-primary mb-2">
                {{ $t('lightbox.mp4Quality.resolution') }}
              </div>
              <div class="flex gap-2">
                <button
                  v-for="tier in availableResolutions"
                  :key="tier.key"
                  @click="handleResolutionSelect(tier)"
                  :disabled="!tier.enabled"
                  class="flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all border-2"
                  :class="[
                    !tier.enabled
                      ? 'opacity-40 cursor-not-allowed border-border-muted text-text-muted'
                      : selectedResolution === tier.key
                        ? 'border-mode-generate bg-mode-generate/10 text-text-primary'
                        : 'border-border-muted text-text-secondary hover:border-border-default cursor-pointer'
                  ]"
                >
                  <span>{{ tier.key }}</span>
                  <svg v-if="!tier.enabled" class="w-3.5 h-3.5 inline-block ml-1 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </button>
              </div>
              <p v-if="hasDisabledResolutions" class="text-xs text-text-muted mt-1.5">
                {{ $t('lightbox.mp4Quality.resolutionLimited') }}
              </p>
            </div>

            <!-- Quality Options -->
            <div class="space-y-3">
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
                  <div class="text-xs text-text-muted">{{ t('lightbox.mp4Quality.lowDesc', { bitrate: formatBitrate(currentBitrates.low) }) }}</div>
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
                  <div class="text-xs text-text-muted">{{ t('lightbox.mp4Quality.mediumDesc', { bitrate: formatBitrate(currentBitrates.medium) }) }}</div>
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
                  <div class="text-xs text-text-muted">{{ t('lightbox.mp4Quality.highDesc', { bitrate: formatBitrate(currentBitrates.high) }) }}</div>
                </div>
              </label>
            </div>
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
