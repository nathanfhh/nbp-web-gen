<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ApiKeyInput from '@/components/ApiKeyInput.vue'

const { t } = useI18n()
const emit = defineEmits(['close'])
const isOpen = ref(false)

const open = () => {
  isOpen.value = true
}

const close = () => {
  isOpen.value = false
  emit('close')
}

defineExpose({ open, close })
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-[10010] flex items-center justify-center p-4"
        @click.self="close"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-bg-overlay backdrop-blur-sm"></div>

        <!-- Modal -->
        <div
          class="relative glass-strong rounded-2xl w-full max-w-md max-h-[85vh] overflow-hidden shadow-2xl flex flex-col"
        >
          <!-- Header -->
          <div class="p-5 border-b border-border-muted flex-shrink-0">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <!-- Key Icon -->
                <div
                  class="w-10 h-10 rounded-xl bg-mode-generate-muted flex items-center justify-center"
                >
                  <svg
                    class="w-5 h-5 text-mode-generate"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 class="text-lg font-semibold text-text-primary">
                    {{ t('apiKeyModal.title') }}
                  </h3>
                  <p class="text-xs text-text-muted mt-0.5">
                    {{ t('apiKeyModal.subtitle') }}
                  </p>
                </div>
              </div>
              <!-- Close Button -->
              <button
                @click="close"
                class="p-2 rounded-lg hover:bg-bg-interactive transition-colors text-text-muted hover:text-text-primary"
                :aria-label="t('common.cancel')"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>

          <!-- Content (Scrollable) -->
          <div class="flex-1 overflow-y-auto p-5">
            <ApiKeyInput />
          </div>

          <!-- Footer -->
          <div class="p-5 border-t border-border-muted flex-shrink-0">
            <button
              @click="close"
              class="w-full px-4 py-2.5 rounded-xl text-sm font-medium transition-all bg-mode-generate text-text-on-brand hover:opacity-90"
            >
              {{ t('common.confirm') }}
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
