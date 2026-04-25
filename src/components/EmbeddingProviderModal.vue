<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useApiKeyManager } from '@/composables/useApiKeyManager'

const { t } = useI18n()
const { hasApiKeyFor } = useApiKeyManager()
// Reactive flag — re-evaluated whenever the OpenAI key changes (the underlying
// getter taps apiKeyVersion in useLocalStorage), so providerOptions stays in
// sync without remounting the modal.
const openaiKeyAvailable = computed(() => hasApiKeyFor({ provider: 'openai' }))

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  currentProvider: {
    type: String,
    default: null,
  },
  hasApiKey: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:modelValue', 'select'])

// Catalog of selectable embedding providers. Each entry maps to a key in
// PROVIDER_CONFIG inside search.worker.js.
const providerOptions = computed(() => [
  {
    id: 'local',
    group: 'local',
    icon: '📱',
    title: t('search.providerModal.local.title'),
    badge: t('search.providerModal.local.badge'),
    dims: 384,
    description: t('search.providerModal.local.description'),
    pros: t('search.providerModal.local.pros'),
    cons: t('search.providerModal.local.cons'),
    requiresKey: false,
    available: true,
  },
  {
    id: 'gemini',
    group: 'gemini',
    icon: '☁️',
    title: t('search.providerModal.gemini.title'),
    badge: t('search.providerModal.gemini.badge'),
    dims: 768,
    description: t('search.providerModal.gemini.description'),
    pros: t('search.providerModal.gemini.pros'),
    cons: t('search.providerModal.gemini.cons'),
    requiresKey: true,
    available: props.hasApiKey,
  },
  {
    id: 'openai-small',
    group: 'openai',
    icon: '🧭',
    title: t('search.providerModal.openai.titleSmall'),
    badge: '1536d',
    dims: 1536,
    description: t('search.providerModal.openai.descriptionSmall'),
    requiresKey: true,
    available: openaiKeyAvailable.value,
  },
  {
    id: 'openai-small-768',
    group: 'openai',
    icon: '🧭',
    title: t('search.providerModal.openai.titleSmall'),
    badge: '768d',
    dims: 768,
    description: t('search.providerModal.openai.descriptionTruncated', { dims: 768 }),
    requiresKey: true,
    available: openaiKeyAvailable.value,
  },
  {
    id: 'openai-large',
    group: 'openai',
    icon: '🧭',
    title: t('search.providerModal.openai.titleLarge'),
    badge: '3072d',
    dims: 3072,
    description: t('search.providerModal.openai.descriptionLarge'),
    requiresKey: true,
    available: openaiKeyAvailable.value,
  },
  {
    id: 'openai-large-1536',
    group: 'openai',
    icon: '🧭',
    title: t('search.providerModal.openai.titleLarge'),
    badge: '1536d',
    dims: 1536,
    description: t('search.providerModal.openai.descriptionTruncated', { dims: 1536 }),
    requiresKey: true,
    available: openaiKeyAvailable.value,
  },
  {
    id: 'openai-large-768',
    group: 'openai',
    icon: '🧭',
    title: t('search.providerModal.openai.titleLarge'),
    badge: '768d',
    dims: 768,
    description: t('search.providerModal.openai.descriptionTruncated', { dims: 768 }),
    requiresKey: true,
    available: openaiKeyAvailable.value,
  },
])

function selectProvider(provider) {
  if (provider === props.currentProvider) return
  if (!confirmIfNeeded()) return
  emit('select', provider)
  emit('update:modelValue', false)
}

function confirmIfNeeded() {
  // First-time setup: no existing index to rebuild, skip the confirm.
  if (!props.currentProvider) return true
  // Switching provider always invalidates the vector index, so confirm.
  const message = t('search.providerModal.rebuildConfirm')
  // Using window.confirm for simplicity; Phase 6 UI polish can replace with inline modal.
  return typeof window === 'undefined' || window.confirm(message)
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

          <!-- Provider List (scrollable for many variants) -->
          <div class="px-4 py-3 max-h-[60vh] overflow-y-auto space-y-2">
            <button
              v-for="opt in providerOptions"
              :key="opt.id"
              @click="opt.available ? selectProvider(opt.id) : undefined"
              :disabled="!opt.available && currentProvider !== opt.id"
              class="w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left"
              :class="[
                currentProvider === opt.id
                  ? 'border-brand-primary bg-bg-interactive ring-1 ring-brand-primary/30 cursor-pointer'
                  : opt.available
                    ? 'border-border-muted hover:border-brand-primary bg-bg-muted/50 hover:bg-bg-interactive cursor-pointer'
                    : 'border-border-muted bg-bg-muted/30 opacity-60 cursor-not-allowed',
              ]"
            >
              <span class="text-2xl shrink-0">{{ opt.icon }}</span>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="font-medium text-sm text-text-primary">{{ opt.title }}</span>
                  <span
                    class="text-[10px] px-1.5 py-0.5 rounded font-medium"
                    :class="
                      opt.group === 'local'
                        ? 'bg-status-success-muted text-status-success'
                        : 'bg-brand-primary/15 text-brand-primary'
                    "
                  >
                    {{ opt.badge }}
                  </span>
                </div>
                <p class="text-xs text-text-muted mt-0.5 line-clamp-2">
                  {{ opt.description }}
                </p>
              </div>
              <span
                v-if="currentProvider === opt.id"
                class="text-xs px-2 py-1 rounded-lg font-medium bg-brand-primary text-text-on-brand shrink-0"
              >
                {{ t('search.providerModal.current') }}
              </span>
              <span
                v-else-if="!opt.available"
                class="text-xs px-2 py-1 rounded-lg font-medium bg-bg-muted text-text-muted shrink-0"
              >
                {{ t('search.providerModal.noApiKey') }}
              </span>
            </button>
          </div>

          <!-- Footer hint -->
          <div class="px-5 pb-4 text-center space-y-1">
            <p v-if="currentProvider" class="text-xs text-status-warning">
              ⚠️ {{ t('search.providerModal.rebuildHint') }}
            </p>
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
