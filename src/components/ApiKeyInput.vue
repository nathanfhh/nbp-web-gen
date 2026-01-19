<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGeneratorStore } from '@/stores/generator'
import { useApiKeyManager } from '@/composables/useApiKeyManager'

useI18n() // Enable $t in template
const store = useGeneratorStore()
const {
  getPaidApiKey,
  getFreeTierApiKey,
  setFreeTierApiKey,
} = useApiKeyManager()

// Paid API Key state
const paidInputKey = ref('')
const showPaidKey = ref(false)
const isEditingPaid = ref(false)
const paidApiKey = ref('')

// Free Tier API Key state
const freeTierInputKey = ref('')
const showFreeTierKey = ref(false)
const isEditingFreeTier = ref(false)
const freeTierApiKey = ref('')

// Load keys on mount
onMounted(() => {
  paidApiKey.value = getPaidApiKey()
  freeTierApiKey.value = getFreeTierApiKey()

  if (!paidApiKey.value) {
    isEditingPaid.value = true
  }
})

// Watch for store API key changes (for backward compatibility)
watch(
  () => store.hasApiKey,
  (hasKey) => {
    paidApiKey.value = getPaidApiKey()
    if (hasKey && isEditingPaid.value && !paidInputKey.value.trim()) {
      isEditingPaid.value = false
    }
  },
  { immediate: true }
)

// Masked key display
const maskedPaidKey = computed(() => maskKey(paidApiKey.value))
const maskedFreeTierKey = computed(() => maskKey(freeTierApiKey.value))

function maskKey(key) {
  if (!key) return ''
  if (key.length <= 8) return '*'.repeat(key.length)
  return key.slice(0, 4) + '*'.repeat(key.length - 8) + key.slice(-4)
}

// Paid API Key actions
const savePaidKey = () => {
  if (paidInputKey.value.trim()) {
    store.saveApiKey(paidInputKey.value.trim())
    paidApiKey.value = paidInputKey.value.trim()
    paidInputKey.value = ''
    isEditingPaid.value = false
  }
}

const clearPaidKey = () => {
  store.saveApiKey('')
  paidApiKey.value = ''
  paidInputKey.value = ''
  isEditingPaid.value = true
}

const startEditingPaid = () => {
  isEditingPaid.value = true
  paidInputKey.value = ''
}

const cancelEditingPaid = () => {
  isEditingPaid.value = false
  paidInputKey.value = ''
}

// Free Tier API Key actions
const saveFreeTierKey = () => {
  if (freeTierInputKey.value.trim()) {
    setFreeTierApiKey(freeTierInputKey.value.trim())
    freeTierApiKey.value = freeTierInputKey.value.trim()
    freeTierInputKey.value = ''
    isEditingFreeTier.value = false
  }
}

const clearFreeTierKey = () => {
  setFreeTierApiKey('')
  freeTierApiKey.value = ''
  freeTierInputKey.value = ''
  isEditingFreeTier.value = false
}

const startEditingFreeTier = () => {
  isEditingFreeTier.value = true
  freeTierInputKey.value = ''
}

const cancelEditingFreeTier = () => {
  isEditingFreeTier.value = false
  freeTierInputKey.value = ''
}
</script>

<template>
  <div class="space-y-4">
    <!-- Paid API Key Section -->
    <div class="glass p-6">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <div
            class="w-8 h-8 flex-shrink-0 rounded-lg flex items-center justify-center transition-all"
            :class="paidApiKey ? 'bg-status-success-solid' : 'bg-status-warning-muted'"
          >
            <svg
              v-if="paidApiKey"
              class="w-4 h-4 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
            </svg>
            <svg v-else class="w-4 h-4 text-status-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
              />
            </svg>
          </div>
          <div>
            <h3 class="font-semibold text-text-primary text-sm">{{ $t('apiKey.title') }}</h3>
            <p class="text-xs text-text-muted">{{ $t('apiKey.paidHint') }}</p>
          </div>
        </div>
        <button
          v-if="paidApiKey && !isEditingPaid"
          @click="startEditingPaid"
          class="text-xs text-text-muted hover:text-text-primary transition-colors"
        >
          {{ $t('common.change') }}
        </button>
      </div>

      <!-- Display saved paid key -->
      <div v-if="paidApiKey && !isEditingPaid" class="flex items-center gap-2">
        <div class="flex-1 min-w-0 input-premium font-mono text-sm overflow-hidden text-ellipsis whitespace-nowrap">
          {{ showPaidKey ? paidApiKey : maskedPaidKey }}
        </div>
        <button
          @click="clearPaidKey"
          class="flex-shrink-0 w-8 h-8 rounded-lg hover:bg-status-error/10 transition-colors flex items-center justify-center group"
          :title="$t('common.clear')"
        >
          <svg class="w-4 h-4 text-text-muted group-hover:text-status-error transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
        <button
          @click="showPaidKey = !showPaidKey"
          class="flex-shrink-0 w-8 h-8 rounded-lg bg-bg-muted hover:bg-bg-interactive transition-colors flex items-center justify-center"
        >
          <svg v-if="showPaidKey" class="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
            />
          </svg>
          <svg v-else class="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
          </svg>
        </button>
      </div>

      <!-- Input paid key -->
      <div v-else class="space-y-4">
        <div class="relative">
          <input
            v-model="paidInputKey"
            :type="showPaidKey ? 'text' : 'password'"
            :placeholder="$t('apiKey.placeholder')"
            class="input-premium pr-12 font-mono"
            @keyup.enter="savePaidKey"
          />
          <button
            @click="showPaidKey = !showPaidKey"
            class="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg hover:bg-bg-muted transition-colors"
            :aria-label="showPaidKey ? $t('apiKey.hideKey') : $t('apiKey.showKey')"
          >
            <svg v-if="showPaidKey" class="w-5 h-5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
              />
            </svg>
            <svg v-else class="w-5 h-5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              />
            </svg>
          </button>
        </div>
        <div class="flex gap-3">
          <button @click="savePaidKey" :disabled="!paidInputKey.trim()" class="btn-premium flex-1">
            {{ $t('apiKey.save') }}
          </button>
          <button v-if="paidApiKey" @click="cancelEditingPaid" class="btn-secondary">
            {{ $t('common.cancel') }}
          </button>
        </div>
        <p class="text-xs text-text-muted">
          {{ $t('apiKey.hint') }}
          <a href="https://aistudio.google.com/apikey" target="_blank" class="text-mode-generate hover:text-mode-generate">
            {{ $t('apiKey.getKey') }}
          </a>
        </p>
      </div>
    </div>

    <!-- Free Tier API Key Section -->
    <div class="glass p-6">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <div
            class="w-8 h-8 flex-shrink-0 rounded-lg flex items-center justify-center transition-all"
            :class="freeTierApiKey ? 'bg-brand-primary/20' : 'bg-bg-muted'"
          >
            <svg
              class="w-4 h-4"
              :class="freeTierApiKey ? 'text-brand-primary' : 'text-text-muted'"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div>
            <h3 class="font-semibold text-text-primary text-sm">{{ $t('apiKey.freeTierTitle') }}</h3>
            <p class="text-xs text-text-muted">{{ $t('apiKey.freeTierSubtitle') }}</p>
          </div>
        </div>
        <button
          v-if="freeTierApiKey && !isEditingFreeTier"
          @click="startEditingFreeTier"
          class="text-xs text-text-muted hover:text-text-primary transition-colors"
        >
          {{ $t('common.change') }}
        </button>
      </div>

      <!-- Display saved free tier key -->
      <div v-if="freeTierApiKey && !isEditingFreeTier" class="flex items-center gap-2">
        <div class="flex-1 min-w-0 input-premium font-mono text-sm overflow-hidden text-ellipsis whitespace-nowrap">
          {{ showFreeTierKey ? freeTierApiKey : maskedFreeTierKey }}
        </div>
        <button
          @click="clearFreeTierKey"
          class="flex-shrink-0 w-8 h-8 rounded-lg hover:bg-status-error/10 transition-colors flex items-center justify-center group"
          :title="$t('common.clear')"
        >
          <svg class="w-4 h-4 text-text-muted group-hover:text-status-error transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
        <button
          @click="showFreeTierKey = !showFreeTierKey"
          class="flex-shrink-0 w-8 h-8 rounded-lg bg-bg-muted hover:bg-bg-interactive transition-colors flex items-center justify-center"
        >
          <svg v-if="showFreeTierKey" class="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
            />
          </svg>
          <svg v-else class="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
          </svg>
        </button>
      </div>

      <!-- Input free tier key or show add button -->
      <div v-else-if="isEditingFreeTier" class="space-y-4">
        <div class="relative">
          <input
            v-model="freeTierInputKey"
            :type="showFreeTierKey ? 'text' : 'password'"
            :placeholder="$t('apiKey.freeTierPlaceholder')"
            class="input-premium pr-12 font-mono"
            @keyup.enter="saveFreeTierKey"
          />
          <button
            @click="showFreeTierKey = !showFreeTierKey"
            class="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg hover:bg-bg-muted transition-colors"
            :aria-label="showFreeTierKey ? $t('apiKey.hideKey') : $t('apiKey.showKey')"
          >
            <svg v-if="showFreeTierKey" class="w-5 h-5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
              />
            </svg>
            <svg v-else class="w-5 h-5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              />
            </svg>
          </button>
        </div>
        <div class="flex gap-3">
          <button @click="saveFreeTierKey" :disabled="!freeTierInputKey.trim()" class="btn-premium flex-1">
            {{ $t('apiKey.save') }}
          </button>
          <button @click="cancelEditingFreeTier" class="btn-secondary">
            {{ $t('common.cancel') }}
          </button>
        </div>
      </div>

      <!-- Add free tier key button -->
      <div v-else>
        <button @click="startEditingFreeTier" class="btn-secondary w-full flex items-center justify-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          {{ $t('apiKey.addFreeTier') }}
        </button>
        <p class="text-xs text-text-muted mt-3">
          {{ $t('apiKey.freeTierHint') }}
        </p>
      </div>
    </div>
  </div>
</template>
