<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  existingPrompt: {
    type: String,
    default: '',
  },
  newPrompt: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['update:modelValue', 'replace', 'append', 'cancel'])

const { t } = useI18n()

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const close = () => {
  isOpen.value = false
  emit('cancel')
}

const handleReplace = () => {
  isOpen.value = false
  emit('replace')
}

const handleAppend = () => {
  isOpen.value = false
  emit('append')
}

// Truncate text for preview
const truncate = (text, maxLength = 100) => {
  if (!text) return ''
  return text.length > maxLength ? text.slice(0, maxLength) + '...' : text
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="isOpen" class="modal-overlay" @click.self="close">
        <div class="modal-container glass">
          <!-- Header -->
          <div class="modal-header">
            <div class="header-icon">
              <svg class="w-6 h-6 text-mode-generate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 class="modal-title">{{ t('promptConfirm.title') }}</h3>
          </div>

          <!-- Content -->
          <div class="modal-content">
            <p class="modal-description">{{ t('promptConfirm.description') }}</p>

            <!-- Existing prompt preview -->
            <div class="prompt-preview">
              <label class="preview-label">{{ t('promptConfirm.existingPrompt') }}</label>
              <div class="preview-text">{{ truncate(existingPrompt, 150) }}</div>
            </div>

            <!-- New prompt preview -->
            <div class="prompt-preview">
              <label class="preview-label">{{ t('promptConfirm.newPrompt') }}</label>
              <div class="preview-text new">{{ truncate(newPrompt, 150) }}</div>
            </div>
          </div>

          <!-- Actions -->
          <div class="modal-actions">
            <button class="btn-secondary" @click="close">
              {{ t('common.cancel') }}
            </button>
            <button class="btn-append" @click="handleAppend">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              {{ t('promptConfirm.append') }}
            </button>
            <button class="btn-replace" @click="handleReplace">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {{ t('promptConfirm.replace') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background-color: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
}

.modal-container {
  width: 100%;
  max-width: 480px;
  padding: 1.5rem;
  border-radius: 1rem;
}

.modal-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.header-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.75rem;
  background-color: var(--color-mode-generate-muted);
}

.modal-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-text-primary);
}

.modal-content {
  margin-bottom: 1.5rem;
}

.modal-description {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  margin-bottom: 1rem;
}

.prompt-preview {
  margin-bottom: 0.75rem;
}

.preview-label {
  display: block;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-text-muted);
  margin-bottom: 0.25rem;
}

.preview-text {
  padding: 0.75rem;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--color-text-secondary);
  background-color: var(--color-bg-muted);
  border-radius: 0.5rem;
  border: 1px solid var(--color-border-subtle);
  max-height: 80px;
  overflow-y: auto;
  word-break: break-word;
}

.preview-text.new {
  border-color: var(--color-mode-generate);
  background-color: var(--color-mode-generate-muted);
}

.modal-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
  flex-wrap: wrap;
}

.btn-secondary {
  padding: 0.625rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-secondary);
  background-color: var(--color-bg-muted);
  border: 1px solid var(--color-border-muted);
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-secondary:hover {
  background-color: var(--color-bg-interactive);
}

.btn-append {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.625rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-primary);
  background-color: var(--color-bg-subtle);
  border: 1px solid var(--color-border-muted);
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-append:hover {
  background-color: var(--color-bg-interactive);
  border-color: var(--color-mode-generate);
}

.btn-replace {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.625rem 1rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-on-brand);
  background-color: var(--color-mode-generate);
  border: none;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-replace:hover {
  filter: brightness(1.1);
}

/* Transitions */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-active .modal-container,
.modal-leave-active .modal-container {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-container,
.modal-leave-to .modal-container {
  transform: scale(0.95);
  opacity: 0;
}

/* Responsive */
@media (max-width: 480px) {
  .modal-actions {
    flex-direction: column;
  }

  .modal-actions button {
    width: 100%;
    justify-content: center;
  }
}
</style>
