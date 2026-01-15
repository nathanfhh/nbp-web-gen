<script setup>
import { ref, computed, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGeneratorStore } from '@/stores/generator'
import { useApi } from '@/composables/useApi'
import { useToast } from '@/composables/useToast'

const { t } = useI18n()
const store = useGeneratorStore()
const toast = useToast()
const { splitSlidesContent } = useApi()

// Modal state
const isOpen = ref(false)

// Form state
const rawContent = ref('')
const additionalNotes = ref('')
const targetPages = ref(10)
const selectedModel = ref('gemini-3-flash-preview')

// Processing state
const isProcessing = ref(false)
const thinkingProcess = ref([])
const thinkingPanelRef = ref(null)

// Model options (same as analysisModels in SlidesOptions)
const models = [
  { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash' },
  { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro' },
]

// Computed
const canSubmit = computed(() => {
  return rawContent.value.trim().length > 0 && !isProcessing.value
})

// Methods
const open = () => {
  isOpen.value = true
  // Reset state
  rawContent.value = ''
  additionalNotes.value = ''
  targetPages.value = 10
  selectedModel.value = 'gemini-3-flash-preview'
  thinkingProcess.value = []
}

const close = () => {
  if (isProcessing.value) return // Don't close while processing
  isOpen.value = false
}

const handleThinkingChunk = (chunk) => {
  thinkingProcess.value.push({
    type: 'text',
    content: chunk,
  })
  // Auto-scroll to bottom
  nextTick(() => {
    if (thinkingPanelRef.value) {
      thinkingPanelRef.value.scrollTop = thinkingPanelRef.value.scrollHeight
    }
  })
}

const handleSplit = async () => {
  if (!canSubmit.value) return

  isProcessing.value = true
  thinkingProcess.value = []

  try {
    const result = await splitSlidesContent(
      rawContent.value,
      {
        model: selectedModel.value,
        targetPages: targetPages.value,
        additionalNotes: additionalNotes.value,
      },
      handleThinkingChunk,
    )

    // Fill in the results
    // Global description → store.prompt
    store.prompt = result.globalDescription

    // Pages → store.slidesOptions.pagesRaw (separated by \n---\n)
    const pagesContent = result.pages
      .sort((a, b) => a.pageNumber - b.pageNumber)
      .map((p) => p.content)
      .join('\n---\n')
    store.slidesOptions.pagesRaw = pagesContent

    toast.success(t('slides.contentSplitter.success', { count: result.pages.length }))
    isOpen.value = false
  } catch (err) {
    toast.error(err.message || t('slides.contentSplitter.error'))
  } finally {
    isProcessing.value = false
  }
}

// Expose open method
defineExpose({ open })
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        @click.self="close"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-bg-overlay backdrop-blur-sm" />

        <!-- Modal Content -->
        <div class="relative glass-strong rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <!-- Header -->
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-xl font-semibold text-text-primary flex items-center gap-2">
              <svg class="w-6 h-6 text-mode-generate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {{ $t('slides.contentSplitter.title') }}
            </h2>
            <button
              @click="close"
              :disabled="isProcessing"
              class="p-2 rounded-lg hover:bg-bg-interactive text-text-muted hover:text-text-primary transition-colors disabled:opacity-50"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Model Selector -->
          <div class="mb-6">
            <label class="block text-sm font-medium text-text-secondary mb-2">
              {{ $t('slides.contentSplitter.model') }}
            </label>
            <div class="grid grid-cols-2 gap-2">
              <button
                v-for="model in models"
                :key="model.value"
                @click="selectedModel = model.value"
                :disabled="isProcessing"
                class="py-2 px-3 rounded-lg text-sm font-medium transition-all"
                :class="
                  selectedModel === model.value
                    ? 'bg-brand-primary/20 border border-brand-primary text-brand-primary'
                    : 'bg-bg-muted border border-transparent text-text-muted hover:bg-bg-interactive'
                "
              >
                {{ model.label }}
              </button>
            </div>
          </div>

          <!-- Raw Material -->
          <div class="mb-6">
            <label class="block text-sm font-medium text-text-secondary mb-2">
              {{ $t('slides.contentSplitter.rawMaterial') }}
            </label>
            <textarea
              v-model="rawContent"
              :placeholder="$t('slides.contentSplitter.rawMaterialPlaceholder')"
              :disabled="isProcessing"
              class="input-premium min-h-[200px] resize-y"
            />
          </div>

          <!-- Additional Notes -->
          <div class="mb-6">
            <label class="block text-sm font-medium text-text-secondary mb-2">
              {{ $t('slides.contentSplitter.additionalNotes') }}
            </label>
            <textarea
              v-model="additionalNotes"
              :placeholder="$t('slides.contentSplitter.additionalNotesPlaceholder')"
              :disabled="isProcessing"
              class="input-premium min-h-[80px] resize-y"
            />
          </div>

          <!-- Target Pages Slider -->
          <div class="mb-6">
            <div class="flex items-center justify-between mb-2">
              <label class="text-sm font-medium text-text-secondary">
                {{ $t('slides.contentSplitter.targetPages') }}
              </label>
              <span class="text-sm font-mono text-mode-generate px-2 py-1 rounded-md bg-mode-generate-muted">
                {{ targetPages }} {{ $t('slides.contentSplitter.pages') }}
              </span>
            </div>
            <input
              v-model.number="targetPages"
              type="range"
              min="1"
              max="30"
              :disabled="isProcessing"
              class="slider-premium w-full"
            />
            <div class="flex justify-between text-xs text-text-muted mt-1">
              <span>1</span>
              <span>15</span>
              <span>30</span>
            </div>
          </div>

          <!-- Thinking Process -->
          <div
            v-if="isProcessing && thinkingProcess.length > 0"
            ref="thinkingPanelRef"
            class="mb-6 p-4 rounded-xl bg-bg-muted/50 border border-border-muted max-h-[200px] overflow-y-auto"
          >
            <div class="flex items-center gap-2 mb-2">
              <svg class="w-4 h-4 text-mode-generate animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
              </svg>
              <span class="text-sm text-text-secondary">{{ $t('slides.contentSplitter.processing') }}</span>
            </div>
            <div class="text-xs text-text-muted font-mono whitespace-pre-wrap">
              {{ thinkingProcess.map(item => item.content).join('') }}
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="flex gap-3">
            <button
              @click="close"
              :disabled="isProcessing"
              class="flex-1 py-3 px-4 rounded-xl text-sm font-medium bg-bg-muted text-text-secondary hover:bg-bg-interactive transition-colors disabled:opacity-50"
            >
              {{ $t('common.cancel') }}
            </button>
            <button
              @click="handleSplit"
              :disabled="!canSubmit"
              class="flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
              :class="
                canSubmit
                  ? 'bg-brand-primary text-text-on-brand hover:bg-brand-primary-dark'
                  : 'bg-bg-muted text-text-muted cursor-not-allowed'
              "
            >
              <svg v-if="isProcessing" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
              </svg>
              <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              {{ isProcessing ? $t('slides.contentSplitter.processing') : $t('slides.contentSplitter.splitButton') }}
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
  transition: opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .glass-strong,
.modal-leave-active .glass-strong {
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.modal-enter-from .glass-strong,
.modal-leave-to .glass-strong {
  transform: scale(0.95);
  opacity: 0;
}
</style>
