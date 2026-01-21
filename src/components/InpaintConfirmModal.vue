<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const isOpen = ref(false)
const originalImage = ref(null)
const cleanImage = ref(null)
const customPrompt = ref('')
const slideIndex = ref(0)
const resolvePromise = ref(null)

/**
 * Show the confirmation modal
 * @param {Object} options
 * @param {string} options.originalImage - Original slide image data URL
 * @param {string|null} options.cleanImage - Current clean image (or null if not generated)
 * @param {string} options.existingPrompt - Pre-fill custom prompt from previous session
 * @param {number} options.slideIndex - Slide index (0-based)
 * @returns {Promise<{action: 'regenerate'|'skip', customPrompt: string}|null>}
 */
const show = (options = {}) => {
  originalImage.value = options.originalImage || null
  cleanImage.value = options.cleanImage || null
  customPrompt.value = options.existingPrompt || ''
  slideIndex.value = options.slideIndex ?? 0
  isOpen.value = true

  return new Promise((resolve) => {
    resolvePromise.value = resolve
  })
}

const regenerate = () => {
  isOpen.value = false
  resolvePromise.value?.({
    action: 'regenerate',
    customPrompt: customPrompt.value.trim(),
  })
}

const skip = () => {
  isOpen.value = false
  resolvePromise.value?.({
    action: 'skip',
    customPrompt: customPrompt.value.trim(),
  })
}

defineExpose({ show })
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-[10010] flex items-center justify-center p-4"
      >
        <!-- Backdrop (no click to close - user must choose an option) -->
        <div class="absolute inset-0 bg-bg-overlay backdrop-blur-sm"></div>

        <!-- Modal -->
        <div class="relative glass-strong rounded-2xl p-6 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
          <!-- Header -->
          <div class="flex items-center gap-3 mb-2">
            <div class="w-10 h-10 rounded-xl bg-mode-generate-muted flex items-center justify-center">
              <svg class="w-5 h-5 text-mode-generate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h3 class="text-lg font-semibold text-text-primary">
                {{ t('slideToPptx.inpaintConfirm.title') }}
              </h3>
              <p class="text-sm text-text-muted">
                {{ t('slideToPptx.inpaintConfirm.subtitle', { page: slideIndex + 1 }) }}
              </p>
            </div>
          </div>

          <!-- Description -->
          <p class="text-sm text-text-secondary mb-5 leading-relaxed">
            {{ t('slideToPptx.inpaintConfirm.description') }}
          </p>

          <!-- Image comparison -->
          <div class="grid grid-cols-2 gap-4 mb-5">
            <!-- Original image -->
            <div class="space-y-2">
              <div class="text-xs font-medium text-text-muted uppercase tracking-wide">
                {{ t('slideToPptx.original') }}
              </div>
              <div class="aspect-video rounded-xl overflow-hidden bg-bg-muted border border-border-muted">
                <img
                  v-if="originalImage"
                  :src="originalImage"
                  :alt="t('slideToPptx.original')"
                  class="w-full h-full object-contain"
                />
                <div v-else class="w-full h-full flex items-center justify-center text-text-muted text-sm">
                  {{ t('slideToPptx.inpaintConfirm.noCleanImage') }}
                </div>
              </div>
            </div>

            <!-- Clean image (previous result) -->
            <div class="space-y-2">
              <div class="text-xs font-medium text-text-muted uppercase tracking-wide">
                {{ t('slideToPptx.inpaintConfirm.currentClean') }}
              </div>
              <div class="aspect-video rounded-xl overflow-hidden bg-bg-muted border border-border-muted">
                <img
                  v-if="cleanImage"
                  :src="cleanImage"
                  :alt="t('slideToPptx.inpaintConfirm.currentClean')"
                  class="w-full h-full object-contain"
                />
                <div v-else class="w-full h-full flex items-center justify-center text-text-muted text-sm">
                  {{ t('slideToPptx.inpaintConfirm.noCleanImage') }}
                </div>
              </div>
            </div>
          </div>

          <!-- Custom prompt input -->
          <div class="space-y-2 mb-6">
            <label class="text-sm font-medium text-text-primary">
              {{ t('slideToPptx.inpaintConfirm.customPromptLabel') }}
              <span class="text-text-muted font-normal">{{ t('common.optional') }}</span>
            </label>
            <textarea
              v-model="customPrompt"
              :placeholder="t('slideToPptx.inpaintConfirm.customPromptPlaceholder')"
              class="w-full h-20 px-3 py-2 rounded-xl bg-bg-input border border-border-muted text-text-primary placeholder-text-muted text-sm resize-none focus:outline-none focus:ring-2 focus:ring-mode-generate focus:border-transparent"
            />
            <p class="text-xs text-text-muted">
              {{ t('slideToPptx.inpaintConfirm.customPromptHint') }}
            </p>
          </div>

          <!-- Buttons -->
          <div class="flex gap-3 justify-end">
            <button
              @click="skip"
              class="py-2.5 px-5 rounded-xl text-sm font-medium transition-all bg-bg-muted border border-border-muted text-text-secondary hover:bg-bg-interactive"
            >
              {{ t('slideToPptx.inpaintConfirm.useExisting') }}
            </button>
            <button
              @click="regenerate"
              class="py-2.5 px-5 rounded-xl text-sm font-medium transition-all bg-mode-generate text-text-on-brand hover:opacity-90"
            >
              {{ t('slideToPptx.inpaintConfirm.regenerate') }}
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
  transition: all 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .glass-strong,
.modal-leave-to .glass-strong {
  transform: scale(0.95);
}
</style>
