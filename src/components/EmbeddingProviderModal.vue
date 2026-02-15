<script setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  currentProvider: {
    type: String,
    default: null,
  },
})

const emit = defineEmits(['update:modelValue', 'select'])

function selectProvider(provider) {
  emit('select', provider)
  emit('update:modelValue', false)
}

function dismiss() {
  emit('update:modelValue', false)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="provider-modal">
      <div
        v-if="modelValue"
        class="fixed inset-0 z-[9995] flex items-center justify-center px-4"
        role="dialog"
        aria-modal="true"
        :aria-label="t('search.providerModal.title')"
      >
        <!-- Backdrop (dismissible when re-selecting, not on first time) -->
        <div
          class="absolute inset-0 bg-bg-overlay backdrop-blur-sm"
          @click="currentProvider ? dismiss() : undefined"
        />

        <!-- Modal -->
        <div class="relative w-full max-w-md glass-strong rounded-2xl shadow-xl overflow-hidden">
          <!-- Header -->
          <div class="px-5 pt-5 pb-2 text-center relative">
            <!-- Close button (only when re-selecting, not first time) -->
            <button
              v-if="currentProvider"
              @click="dismiss"
              class="absolute top-3 right-3 p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-interactive transition-all"
              :aria-label="t('common.close')"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h3 class="font-semibold text-text-primary text-base">
              {{ t('search.providerModal.title') }}
            </h3>
            <p class="text-xs text-text-muted mt-1">
              {{ t('search.providerModal.subtitle') }}
            </p>
          </div>

          <!-- Provider Cards -->
          <div class="px-5 py-4 grid grid-cols-2 gap-3">
            <!-- Local Model Card -->
            <button
              @click="selectProvider('local')"
              class="group flex flex-col items-center text-center p-4 rounded-xl border-2 transition-all cursor-pointer"
              :class="
                currentProvider === 'local'
                  ? 'border-brand-primary bg-bg-interactive ring-1 ring-brand-primary/30'
                  : 'border-border-muted hover:border-brand-primary bg-bg-muted/50 hover:bg-bg-interactive'
              "
            >
              <span class="text-2xl mb-2">📱</span>
              <span class="font-medium text-sm text-text-primary mb-1">
                {{ t('search.providerModal.local.title') }}
              </span>
              <span class="text-xs px-1.5 py-0.5 rounded bg-status-success-muted text-status-success font-medium mb-2">
                {{ t('search.providerModal.local.badge') }}
              </span>
              <p class="text-xs text-text-muted mb-2">
                {{ t('search.providerModal.local.description') }}
              </p>
              <div class="text-xs text-text-muted space-y-0.5 w-full text-left">
                <p class="text-status-success">✓ {{ t('search.providerModal.local.pros') }}</p>
                <p class="text-text-muted">✗ {{ t('search.providerModal.local.cons') }}</p>
              </div>
              <span
                class="mt-3 text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
                :class="
                  currentProvider === 'local'
                    ? 'bg-brand-primary text-text-on-brand'
                    : 'bg-bg-muted text-text-secondary group-hover:bg-brand-primary group-hover:text-text-on-brand'
                "
              >
                {{ currentProvider === 'local' ? t('search.providerModal.current') : t('search.providerModal.select') }}
              </span>
            </button>

            <!-- Gemini API Card -->
            <button
              @click="selectProvider('gemini')"
              class="group flex flex-col items-center text-center p-4 rounded-xl border-2 transition-all cursor-pointer"
              :class="
                currentProvider === 'gemini'
                  ? 'border-brand-primary bg-bg-interactive ring-1 ring-brand-primary/30'
                  : 'border-border-muted hover:border-brand-primary bg-bg-muted/50 hover:bg-bg-interactive'
              "
            >
              <span class="text-2xl mb-2">☁️</span>
              <span class="font-medium text-sm text-text-primary mb-1">
                {{ t('search.providerModal.gemini.title') }}
              </span>
              <span class="text-xs px-1.5 py-0.5 rounded bg-brand-primary/15 text-brand-primary font-medium mb-2">
                {{ t('search.providerModal.gemini.badge') }}
              </span>
              <p class="text-xs text-text-muted mb-2">
                {{ t('search.providerModal.gemini.description') }}
              </p>
              <div class="text-xs text-text-muted space-y-0.5 w-full text-left">
                <p class="text-status-success">✓ {{ t('search.providerModal.gemini.pros') }}</p>
                <p class="text-text-muted">✗ {{ t('search.providerModal.gemini.cons') }}</p>
              </div>
              <span
                class="mt-3 text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
                :class="
                  currentProvider === 'gemini'
                    ? 'bg-brand-primary text-text-on-brand'
                    : 'bg-bg-muted text-text-secondary group-hover:bg-brand-primary group-hover:text-text-on-brand'
                "
              >
                {{ currentProvider === 'gemini' ? t('search.providerModal.current') : t('search.providerModal.select') }}
              </span>
            </button>
          </div>

          <!-- Footer hint -->
          <div class="px-5 pb-4 text-center">
            <p class="text-xs text-text-muted">
              💡 {{ t('search.providerModal.switchHint') }}
            </p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.provider-modal-enter-active,
.provider-modal-leave-active {
  transition: opacity 0.2s ease;
}
.provider-modal-enter-active .glass-strong,
.provider-modal-leave-active .glass-strong {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.provider-modal-enter-from,
.provider-modal-leave-to {
  opacity: 0;
}
.provider-modal-enter-from .glass-strong {
  transform: scale(0.95) translateY(-10px);
  opacity: 0;
}
.provider-modal-leave-to .glass-strong {
  transform: scale(0.95) translateY(-10px);
  opacity: 0;
}
</style>
