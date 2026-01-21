<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useOcrSettings } from '@/composables/useOcrSettings'

const { t } = useI18n()
const { settings, updateSetting, resetToDefaults, defaults, rules, categories } = useOcrSettings()

const emit = defineEmits(['close'])

const isOpen = ref(false)
const localSettings = ref({})
const hasUnsavedChanges = ref(false)

// Copy settings to local state when opening
const open = () => {
  localSettings.value = { ...settings }
  hasUnsavedChanges.value = false
  isOpen.value = true
}

// Apply all pending changes and close
const close = () => {
  // Apply all local changes to actual settings
  if (hasUnsavedChanges.value) {
    Object.entries(localSettings.value).forEach(([key, value]) => {
      if (settings[key] !== value) {
        updateSetting(key, value)
      }
    })
  }
  isOpen.value = false
  emit('close')
}

const handleReset = () => {
  resetToDefaults()
  localSettings.value = { ...settings }
  hasUnsavedChanges.value = true
}

const handleSliderInput = (key, event) => {
  const value = parseFloat(event.target.value)
  localSettings.value[key] = value
  hasUnsavedChanges.value = true
  // Don't call updateSetting here - only update on close
}

// Check if current value differs from default (use localSettings for real-time display)
const isModified = (key) => {
  return localSettings.value[key] !== defaults[key]
}

// Format value for display
const formatValue = (key, value) => {
  const rule = rules[key]
  if (rule.step < 1) {
    const decimals = String(rule.step).split('.')[1]?.length || 0
    return value.toFixed(decimals)
  }
  return value.toString()
}

// Check if any settings are modified (including modelSize)
const hasModifications = computed(() => {
  // Check modelSize
  if (settings.modelSize !== defaults.modelSize) return true
  // Check all category params
  return categories.some((cat) => cat.params.some((key) => settings[key] !== defaults[key]))
})

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
          class="relative glass-strong rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden shadow-2xl flex flex-col"
        >
          <!-- Header -->
          <div class="p-5 border-b border-border-muted flex-shrink-0">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <!-- Settings Icon -->
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
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 class="text-lg font-semibold text-text-primary">
                    {{ t('ocrSettings.title') }}
                  </h3>
                  <p class="text-xs text-text-muted mt-0.5">
                    {{ t('ocrSettings.subtitle') }}
                  </p>
                </div>
              </div>
              <!-- Close Button -->
              <button
                @click="close"
                class="p-2 rounded-lg hover:bg-bg-interactive transition-colors text-text-muted hover:text-text-primary"
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
          <div class="flex-1 overflow-y-auto p-5 space-y-6">
            <!-- Category Groups -->
            <div v-for="category in categories" :key="category.key" class="space-y-4">
              <!-- Category Header -->
              <div class="flex items-center gap-2">
                <span
                  class="text-xs font-semibold uppercase tracking-wider px-2 py-1 rounded-md bg-bg-muted text-text-muted"
                >
                  {{ t(`ocrSettings.categories.${category.key}`) }}
                </span>
                <div class="flex-1 h-px bg-border-muted"></div>
              </div>

              <!-- Parameters in this category -->
              <div class="space-y-4 pl-1">
                <div v-for="key in category.params" :key="key" class="space-y-2">
                  <!-- Label Row -->
                  <div class="flex items-center justify-between">
                    <label class="text-sm font-medium text-text-primary flex items-center gap-2">
                      {{ t(`ocrSettings.params.${key}.label`) }}
                      <span
                        v-if="isModified(key)"
                        class="text-[10px] px-1.5 py-0.5 rounded bg-mode-generate-muted text-mode-generate"
                      >
                        {{ t('ocrSettings.modified') }}
                      </span>
                    </label>
                    <div class="flex items-center gap-2">
                      <!-- Current Value -->
                      <span class="text-sm font-mono text-text-primary min-w-[3.5rem] text-right">
                        {{ formatValue(key, localSettings[key]) }}
                      </span>
                      <!-- Default Value -->
                      <span class="text-xs text-text-muted">
                        ({{ t('ocrSettings.default') }}: {{ formatValue(key, defaults[key]) }})
                      </span>
                    </div>
                  </div>

                  <!-- Slider -->
                  <input
                    type="range"
                    :value="localSettings[key]"
                    :min="rules[key].min"
                    :max="rules[key].max"
                    :step="rules[key].step"
                    @input="handleSliderInput(key, $event)"
                    class="slider-input"
                  />

                  <!-- Description -->
                  <p class="text-xs text-text-muted leading-relaxed">
                    {{ t(`ocrSettings.params.${key}.description`) }}
                  </p>

                  <!-- Effect Hint -->
                  <p class="text-xs text-text-secondary leading-relaxed">
                    {{ t(`ocrSettings.params.${key}.effect`) }}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="p-5 border-t border-border-muted flex-shrink-0">
            <div class="flex items-center justify-between">
              <!-- Reset Button -->
              <button
                @click="handleReset"
                :disabled="!hasModifications"
                class="px-4 py-2 text-sm font-medium rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed text-text-muted hover:text-text-primary hover:bg-bg-interactive"
              >
                {{ t('ocrSettings.resetToDefaults') }}
              </button>

              <!-- Confirm Button (settings auto-save on change) -->
              <button
                @click="close"
                class="px-4 py-2.5 rounded-xl text-sm font-medium transition-all bg-mode-generate text-text-on-brand hover:opacity-90"
              >
                {{ t('common.confirm') }}
              </button>
            </div>
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

/* Custom slider styling - fix thumb vertical centering */
.slider-input {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 20px; /* Container height for vertical centering */
  background: transparent;
  cursor: pointer;
}

/* Webkit (Chrome, Safari, Edge) */
.slider-input::-webkit-slider-runnable-track {
  width: 100%;
  height: 8px;
  border-radius: 4px;
  background: var(--color-bg-muted);
}

.slider-input::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--color-mode-generate);
  cursor: pointer;
  margin-top: -5px; /* (track height - thumb height) / 2 = (8 - 18) / 2 = -5 */
  transition: transform 0.15s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.slider-input::-webkit-slider-thumb:hover {
  transform: scale(1.1);
}

/* Firefox */
.slider-input::-moz-range-track {
  width: 100%;
  height: 8px;
  border-radius: 4px;
  background: var(--color-bg-muted);
}

.slider-input::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--color-mode-generate);
  cursor: pointer;
  border: none;
  transition: transform 0.15s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.slider-input::-moz-range-thumb:hover {
  transform: scale(1.1);
}

/* Focus state */
.slider-input:focus {
  outline: none;
}

.slider-input:focus::-webkit-slider-thumb {
  box-shadow:
    0 0 0 3px var(--color-bg-surface),
    0 0 0 5px var(--color-mode-generate-muted);
}

.slider-input:focus::-moz-range-thumb {
  box-shadow:
    0 0 0 3px var(--color-bg-surface),
    0 0 0 5px var(--color-mode-generate-muted);
}
</style>
