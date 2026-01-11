<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const isOpen = ref(false)
const title = ref('')
const message = ref('')
const confirmText = ref('')
const cancelText = ref('')
const resolvePromise = ref(null)

const show = (options = {}) => {
  title.value = options.title || t('confirm.defaultTitle')
  message.value = options.message || t('confirm.defaultMessage')
  confirmText.value = options.confirmText || t('common.confirm')
  cancelText.value = options.cancelText || t('common.cancel')
  isOpen.value = true

  return new Promise((resolve) => {
    resolvePromise.value = resolve
  })
}

const confirm = () => {
  isOpen.value = false
  resolvePromise.value?.(true)
}

const cancel = () => {
  isOpen.value = false
  resolvePromise.value?.(false)
}

defineExpose({ show })
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-[10000] flex items-center justify-center p-4"
        @click.self="cancel"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>

        <!-- Modal -->
        <div class="relative glass-strong rounded-2xl p-6 w-full max-w-sm shadow-2xl">
          <!-- Icon -->
          <div class="w-12 h-12 rounded-xl bg-status-warning-muted flex items-center justify-center mx-auto mb-4">
            <svg class="w-6 h-6 text-status-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>

          <!-- Title -->
          <h3 class="text-lg font-semibold text-text-primary text-center mb-2">
            {{ title }}
          </h3>

          <!-- Message -->
          <p class="text-sm text-text-muted text-center mb-6">
            {{ message }}
          </p>

          <!-- Buttons -->
          <div class="flex gap-3">
            <button
              @click="cancel"
              class="flex-1 py-2.5 px-4 rounded-xl text-sm font-medium transition-all bg-bg-muted border border-border-muted text-text-secondary hover:bg-bg-interactive"
            >
              {{ cancelText }}
            </button>
            <button
              @click="confirm"
              class="flex-1 py-2.5 px-4 rounded-xl text-sm font-medium transition-all bg-mode-generate-muted border border-mode-generate text-mode-generate hover:bg-blue-500/40"
            >
              {{ confirmText }}
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
