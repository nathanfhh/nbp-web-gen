<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  modelValue: {
    type: String, // pageId or null
    default: null,
  },
})

const emit = defineEmits(['update:modelValue', 'confirm'])

// Local state for selection
const regenerateChoice = ref('image') // 'image' | 'audio' | 'both'

// Reset choice when modal opens
watch(
  () => props.modelValue,
  (newVal) => {
    if (newVal) {
      regenerateChoice.value = 'image'
    }
  },
)

const handleConfirm = () => {
  emit('confirm', regenerateChoice.value)
  emit('update:modelValue', null)
}

const handleCancel = () => {
  emit('update:modelValue', null)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="modelValue"
        class="fixed inset-0 z-50 flex items-center justify-center bg-bg-overlay"
        @click.self="handleCancel"
      >
        <div class="bg-bg-card rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
          <!-- Header -->
          <div class="px-6 py-4 border-b border-border-default">
            <h3 class="text-lg font-semibold text-text-primary">
              {{ $t('slides.regenerateModal.title') }}
            </h3>
            <p class="text-sm text-text-muted mt-1">
              {{ $t('slides.regenerateModal.hint') }}
            </p>
          </div>

          <!-- Options -->
          <div class="p-6 space-y-3">
            <!-- Image Only -->
            <label
              class="flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all"
              :class="regenerateChoice === 'image'
                ? 'border-mode-generate bg-mode-generate/10'
                : 'border-border-muted hover:border-border-default'"
            >
              <input
                type="radio"
                v-model="regenerateChoice"
                value="image"
                class="sr-only"
              />
              <div
                class="w-10 h-10 rounded-lg flex items-center justify-center"
                :class="regenerateChoice === 'image' ? 'bg-mode-generate text-white' : 'bg-bg-muted text-text-muted'"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <div class="text-sm font-medium text-text-primary">{{ $t('slides.regenerateModal.imageOnly') }}</div>
                <div class="text-xs text-text-muted">{{ $t('slides.regenerateModal.imageOnlyDesc') }}</div>
              </div>
            </label>

            <!-- Audio Only -->
            <label
              class="flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all"
              :class="regenerateChoice === 'audio'
                ? 'border-mode-generate bg-mode-generate/10'
                : 'border-border-muted hover:border-border-default'"
            >
              <input
                type="radio"
                v-model="regenerateChoice"
                value="audio"
                class="sr-only"
              />
              <div
                class="w-10 h-10 rounded-lg flex items-center justify-center"
                :class="regenerateChoice === 'audio' ? 'bg-mode-generate text-white' : 'bg-bg-muted text-text-muted'"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <div>
                <div class="text-sm font-medium text-text-primary">{{ $t('slides.regenerateModal.audioOnly') }}</div>
                <div class="text-xs text-text-muted">{{ $t('slides.regenerateModal.audioOnlyDesc') }}</div>
              </div>
            </label>

            <!-- Both -->
            <label
              class="flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all"
              :class="regenerateChoice === 'both'
                ? 'border-mode-generate bg-mode-generate/10'
                : 'border-border-muted hover:border-border-default'"
            >
              <input
                type="radio"
                v-model="regenerateChoice"
                value="both"
                class="sr-only"
              />
              <div
                class="w-10 h-10 rounded-lg flex items-center justify-center"
                :class="regenerateChoice === 'both' ? 'bg-mode-generate text-white' : 'bg-bg-muted text-text-muted'"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <div>
                <div class="text-sm font-medium text-text-primary">{{ $t('slides.regenerateModal.both') }}</div>
                <div class="text-xs text-text-muted">{{ $t('slides.regenerateModal.bothDesc') }}</div>
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
              {{ $t('slides.regenerateModal.start') }}
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
