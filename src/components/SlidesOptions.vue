<script setup>
import { computed, watch, ref, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGeneratorStore } from '@/stores/generator'
import { useSlidesGeneration } from '@/composables/useSlidesGeneration'
import { useToast } from '@/composables/useToast'
import SlidesContentSplitter from './SlidesContentSplitter.vue'
import ColorPreviewTextarea from './ColorPreviewTextarea.vue'

const { t } = useI18n()
const store = useGeneratorStore()
const toast = useToast()
const {
  analyzeStyle,
  analysisThinking,
  regeneratePage,
  confirmRegeneration,
  cancelRegeneration,
  reorderPages,
  parsePages,
  deletePage,
} = useSlidesGeneration()

// Content splitter modal ref
const contentSplitterRef = ref(null)

// Thinking panel refs
const thinkingPanelRef = ref(null)
const isThinkingExpanded = ref(false)

// Style mode: 'ai' = AI analyzes, 'manual' = user inputs directly
const styleMode = ref('ai')

// Track which pages have their style guide expanded
const expandedPageStyles = ref({})

// Page limit constant
const MAX_PAGES = 30

// Reference images constants and refs
const MAX_REFERENCE_IMAGES = 5
const globalReferenceInput = ref(null)

// Available models for analysis
const analysisModels = [
  { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash' },
  { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro' },
]

const options = computed(() => store.slidesOptions)

// Ensure styleGuidance exists (for backward compatibility with old localStorage data)
if (store.slidesOptions.styleGuidance === undefined) {
  store.slidesOptions.styleGuidance = ''
}

// Check if page count exceeds limit
const isPageLimitExceeded = computed(() => options.value.totalPages > MAX_PAGES)

const resolutions = [
  { value: '1k', label: '1K' },
  { value: '2k', label: '2K' },
  { value: '4k', label: '4K' },
]

const ratios = [
  { value: '16:9', label: '16:9' },
  { value: '4:3', label: '4:3' },
  { value: '1:1', label: '1:1' },
]

// Watch for raw input changes and parse pages
watch(
  () => options.value.pagesRaw,
  (newVal) => {
    parsePages(newVal)
  },
  { immediate: true },
)

// Watch for page limit exceeded and show error
watch(isPageLimitExceeded, (exceeded) => {
  if (exceeded) {
    toast.error(t('slides.tooManyPages', { max: MAX_PAGES }))
  }
})

// Analyze style button handler
const handleAnalyzeStyle = async () => {
  if (options.value.pages.length === 0) return
  isThinkingExpanded.value = true
  await analyzeStyle(() => {
    // Auto-scroll thinking panel to bottom
    nextTick(() => {
      if (thinkingPanelRef.value) {
        thinkingPanelRef.value.scrollTop = thinkingPanelRef.value.scrollHeight
      }
    })
  })
}

// Computed thinking text for display
const thinkingText = computed(() => {
  return analysisThinking.value.map((chunk) => chunk.content).join('')
})

// Extract hex color codes from analyzed style
const extractedColors = computed(() => {
  const style = options.value.analyzedStyle || ''
  // Match hex colors: #RGB, #RGBA, #RRGGBB, #RRGGBBAA
  const hexPattern = /#([0-9A-Fa-f]{3,4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})\b/g
  const matches = style.match(hexPattern) || []
  // Remove duplicates and return unique colors
  return [...new Set(matches.map((c) => c.toUpperCase()))]
})

// Active color tooltip state
const activeColorTooltip = ref(null)

// Toggle color tooltip
const toggleColorTooltip = (color) => {
  activeColorTooltip.value = activeColorTooltip.value === color ? null : color
}

// Confirm style
const confirmStyle = () => {
  store.slidesOptions.styleConfirmed = true
}

// Edit style (cancel confirmation)
const editStyle = () => {
  store.slidesOptions.styleConfirmed = false
}

// Single page regenerate
const handleRegeneratePage = async (pageId) => {
  await regeneratePage(pageId)
}

// Find page in 'comparing' status (for modal)
const comparingPage = computed(() => {
  return store.slidesOptions.pages.find((p) => p.status === 'comparing')
})

// Comparison modal selection state ('original' or 'new')
const comparisonChoice = ref('new')

// Reset choice when comparing page changes
watch(comparingPage, (newVal) => {
  if (newVal) {
    comparisonChoice.value = 'new' // Default to new image
  }
})

// Confirm the selected choice
const handleConfirmChoice = async () => {
  if (!comparingPage.value) return
  if (comparisonChoice.value === 'new') {
    await confirmRegeneration(comparingPage.value.id)
  } else {
    cancelRegeneration(comparingPage.value.id)
  }
}

// Move page
const movePage = (fromIndex, toIndex) => {
  reorderPages(fromIndex, toIndex)
  // Update raw text to match new order
  store.slidesOptions.pagesRaw = options.value.pages.map((p) => p.content).join('\n---\n')
}

// Delete page
const handleDeletePage = (pageId) => {
  deletePage(pageId)
}

// Get status class for page status badge
const getStatusClass = (status) => {
  switch (status) {
    case 'pending':
      return 'bg-bg-muted text-text-muted'
    case 'generating':
      return 'bg-mode-generate-muted text-mode-generate animate-pulse'
    case 'done':
      return 'bg-status-success-muted text-status-success'
    case 'error':
      return 'bg-status-error-muted text-status-error'
    default:
      return 'bg-bg-muted text-text-muted'
  }
}


// ===== Reference Images Logic =====

// Count global reference images
const globalReferenceCount = computed(() => {
  return options.value.globalReferenceImages?.length || 0
})

// Count all page-specific reference images
const pageReferenceCount = computed(() => {
  return options.value.pages.reduce((sum, p) => sum + (p.referenceImages?.length || 0), 0)
})

// Total reference images across all sources
const totalReferenceCount = computed(() => {
  return globalReferenceCount.value + pageReferenceCount.value
})

// Can add more global reference images?
// Global images can be up to MAX_REFERENCE_IMAGES; each page's combined (global + page-specific) is checked separately
const canAddGlobalReference = computed(() => {
  return globalReferenceCount.value < MAX_REFERENCE_IMAGES
})

// Can add more reference images to a specific page?
// Per-generation limit: global + page-specific ≤ MAX_REFERENCE_IMAGES
const canAddPageReference = (pageIndex) => {
  const page = options.value.pages[pageIndex]
  const pageRefCount = page?.referenceImages?.length || 0
  // When generating this page, combined count must not exceed limit
  return globalReferenceCount.value + pageRefCount < MAX_REFERENCE_IMAGES
}

// Handle global reference image upload
const handleGlobalReferenceUpload = (event) => {
  const file = event.target.files?.[0]
  if (!file || !canAddGlobalReference.value) return

  const reader = new FileReader()
  reader.onload = (e) => {
    const base64 = e.target.result.split(',')[1]
    if (!store.slidesOptions.globalReferenceImages) {
      store.slidesOptions.globalReferenceImages = []
    }
    store.slidesOptions.globalReferenceImages.push({
      data: base64,
      mimeType: file.type,
      preview: e.target.result,
      name: file.name,
    })
  }
  reader.onerror = () => {
    toast.error(t('slides.imageLoadError'))
  }
  reader.readAsDataURL(file)
  event.target.value = ''
}

// Remove global reference image
const removeGlobalReference = (index) => {
  store.slidesOptions.globalReferenceImages.splice(index, 1)
}

// Handle page-specific reference image upload
const handlePageReferenceUpload = (event, pageIndex) => {
  const file = event.target.files?.[0]
  if (!file || !canAddPageReference(pageIndex)) return

  const reader = new FileReader()
  reader.onload = (e) => {
    const base64 = e.target.result.split(',')[1]
    if (!store.slidesOptions.pages[pageIndex].referenceImages) {
      store.slidesOptions.pages[pageIndex].referenceImages = []
    }
    store.slidesOptions.pages[pageIndex].referenceImages.push({
      data: base64,
      mimeType: file.type,
      preview: e.target.result,
      name: file.name,
    })
  }
  reader.onerror = () => {
    toast.error(t('slides.imageLoadError'))
  }
  reader.readAsDataURL(file)
  event.target.value = ''
}

// Remove page-specific reference image
const removePageReference = (pageIndex, refIndex) => {
  store.slidesOptions.pages[pageIndex].referenceImages.splice(refIndex, 1)
}

// Toggle page style guide expansion
const togglePageStyle = (pageId) => {
  expandedPageStyles.value[pageId] = !expandedPageStyles.value[pageId]
}

// Reset all slides options to defaults
const resetSlidesOptions = () => {
  store.resetCurrentOptions()
  // Also clear the main prompt (used as global description in slides mode)
  store.prompt = ''
  // Reset local UI state
  styleMode.value = 'ai'
  isThinkingExpanded.value = false
  expandedPageStyles.value = {}
  toast.success(t('slides.resetSuccess'))
}
</script>

<template>
  <div class="space-y-6">
    <!-- Reset Button -->
    <div class="flex justify-end">
      <button
        @click="resetSlidesOptions"
        :disabled="store.isGenerating || options.isAnalyzing"
        class="flex items-center gap-1.5 py-1.5 px-3 text-xs rounded-lg font-medium transition-all text-text-muted hover:text-status-error hover:bg-status-error/10 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        {{ $t('slides.reset') }}
      </button>
    </div>

    <!-- Resolution & Ratio -->
    <div class="grid grid-cols-2 gap-4">
      <!-- Resolution -->
      <div class="space-y-3">
        <label class="block text-sm font-medium text-text-secondary">{{ $t('options.quality') }}</label>
        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="res in resolutions"
            :key="res.value"
            @click="store.slidesOptions.resolution = res.value"
            class="py-2 px-3 rounded-lg text-sm font-medium transition-all"
            :class="
              store.slidesOptions.resolution === res.value
                ? 'bg-mode-generate-muted border border-mode-generate text-mode-generate'
                : 'bg-bg-muted border border-transparent text-text-muted hover:bg-bg-interactive'
            "
          >
            {{ res.label }}
          </button>
        </div>
      </div>

      <!-- Ratio -->
      <div class="space-y-3">
        <label class="block text-sm font-medium text-text-secondary">{{
          $t('options.aspectRatio')
        }}</label>
        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="ratio in ratios"
            :key="ratio.value"
            @click="store.slidesOptions.ratio = ratio.value"
            class="py-2 px-3 rounded-lg text-sm font-medium transition-all"
            :class="
              store.slidesOptions.ratio === ratio.value
                ? 'bg-mode-generate-muted border border-mode-generate text-mode-generate'
                : 'bg-bg-muted border border-transparent text-text-muted hover:bg-bg-interactive'
            "
          >
            {{ ratio.label }}
          </button>
        </div>
      </div>
    </div>

    <!-- Global Reference Images -->
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <label class="block text-sm font-medium text-text-secondary">
          {{ $t('slides.globalReferences') }}
        </label>
        <span class="text-xs text-text-muted">
          {{ totalReferenceCount }}/{{ MAX_REFERENCE_IMAGES }}
        </span>
      </div>
      <p class="text-xs text-text-muted">{{ $t('slides.globalReferencesHint') }}</p>
      <div class="flex flex-wrap gap-3">
        <!-- Existing global reference images -->
        <div
          v-for="(img, index) in options.globalReferenceImages"
          :key="`global-${index}`"
          class="relative group"
        >
          <img
            :src="img.preview"
            class="w-20 h-20 object-cover rounded-lg border border-border-muted"
            :alt="img.name"
          />
          <div
            class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center"
          >
            <button
              @click="removeGlobalReference(index)"
              class="w-6 h-6 bg-status-error/80 rounded text-white hover:bg-status-error"
              :disabled="store.isGenerating"
            >
              <svg class="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <!-- Global badge -->
          <span class="absolute bottom-1 left-1 px-1.5 py-0.5 rounded text-xs font-medium bg-brand-primary text-text-on-brand">
            {{ $t('slides.globalBadge') }}
          </span>
        </div>
        <!-- Add button -->
        <label
          v-if="canAddGlobalReference"
          class="flex items-center justify-center w-20 h-20 border-2 border-dashed border-border-muted rounded-lg cursor-pointer hover:border-mode-generate transition-colors"
          :class="{ 'opacity-50 cursor-not-allowed': store.isGenerating }"
        >
          <input
            ref="globalReferenceInput"
            type="file"
            accept="image/*"
            class="hidden"
            @change="handleGlobalReferenceUpload"
            :disabled="store.isGenerating"
          />
          <svg class="w-6 h-6 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
        </label>
      </div>
    </div>

    <!-- Pages Input -->
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <label class="text-sm font-medium text-text-secondary">{{
          $t('slides.pagesInput')
        }}</label>
        <button
          @click="contentSplitterRef?.open()"
          :disabled="store.isGenerating || options.isAnalyzing"
          class="flex items-center gap-1.5 py-1 px-2.5 text-xs rounded-md font-medium transition-all text-brand-primary hover:bg-brand-primary/10 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          {{ $t('slides.contentSplitter.button') }}
        </button>
      </div>
      <textarea
        v-model="store.slidesOptions.pagesRaw"
        :placeholder="$t('slides.pagesPlaceholder')"
        rows="10"
        class="input-premium resize-y font-mono text-sm"
        :disabled="store.isGenerating || options.isAnalyzing"
      />
      <p class="text-xs text-text-muted">{{ $t('slides.pagesHint') }}</p>
    </div>

    <!-- Page Count -->
    <div class="text-sm text-text-secondary">
      {{ $t('slides.pageCount', { count: options.totalPages }) }}
    </div>

    <!-- Design Style Section -->
    <div class="space-y-4 p-4 rounded-xl bg-bg-muted/50 border border-border-muted">
      <label class="block text-sm font-medium text-text-primary">{{
        $t('slides.designStyle')
      }}</label>

      <!-- Style Mode Selection -->
      <div class="grid grid-cols-2 gap-2">
        <button
          @click="styleMode = 'ai'"
          class="py-2.5 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2"
          :class="
            styleMode === 'ai'
              ? 'bg-mode-generate-muted border border-mode-generate text-mode-generate'
              : 'bg-bg-muted border border-transparent text-text-muted hover:bg-bg-interactive'
          "
          :disabled="store.isGenerating || options.isAnalyzing"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          {{ $t('slides.styleModeAI') }}
        </button>
        <button
          @click="styleMode = 'manual'"
          class="py-2.5 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2"
          :class="
            styleMode === 'manual'
              ? 'bg-mode-generate-muted border border-mode-generate text-mode-generate'
              : 'bg-bg-muted border border-transparent text-text-muted hover:bg-bg-interactive'
          "
          :disabled="store.isGenerating || options.isAnalyzing"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          {{ $t('slides.styleModeManual') }}
        </button>
      </div>

      <!-- AI Analysis Mode -->
      <div v-if="styleMode === 'ai'" class="space-y-3">
        <!-- Analysis Model Selection -->
        <div class="space-y-2">
          <label class="block text-xs text-text-muted">{{ $t('slides.analysisModel') }}</label>
          <div class="grid grid-cols-2 gap-2">
            <button
              v-for="model in analysisModels"
              :key="model.value"
              @click="store.slidesOptions.analysisModel = model.value"
              class="py-2 px-3 rounded-lg text-sm font-medium transition-all"
              :class="
                store.slidesOptions.analysisModel === model.value
                  ? 'bg-mode-generate-muted border border-mode-generate text-mode-generate'
                  : 'bg-bg-muted border border-transparent text-text-muted hover:bg-bg-interactive'
              "
              :disabled="store.isGenerating || options.isAnalyzing"
            >
              {{ model.label }}
            </button>
          </div>
        </div>

        <!-- Style Guidance (Free Typing) -->
        <div class="space-y-2">
          <label class="block text-xs text-text-muted">{{ $t('slides.styleGuidance') }}</label>
          <ColorPreviewTextarea
            v-model="store.slidesOptions.styleGuidance"
            :placeholder="$t('slides.styleGuidancePlaceholder')"
            :disabled="store.isGenerating || options.isAnalyzing"
            :rows="4"
          />
          <p class="text-xs text-text-muted">{{ $t('slides.styleGuidanceHint') }}</p>
        </div>

        <!-- Analyze Button -->
        <button
          @click="handleAnalyzeStyle"
          :disabled="options.totalPages === 0 || isPageLimitExceeded || options.isAnalyzing || store.isGenerating"
          class="w-full py-2.5 text-sm flex items-center justify-center gap-2 rounded-lg font-medium transition-all bg-brand-primary/20 text-brand-primary hover:bg-brand-primary/30 border border-brand-primary/50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg
            v-if="options.isAnalyzing"
            class="w-4 h-4 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <span>{{ options.isAnalyzing ? $t('slides.analyzing') : $t('slides.analyzeAndPlan') }}</span>
        </button>

        <!-- Thinking Process Panel -->
        <div v-if="thinkingText || options.isAnalyzing" class="space-y-2">
          <button
            @click="isThinkingExpanded = !isThinkingExpanded"
            class="flex items-center gap-2 text-xs text-text-muted hover:text-text-secondary transition-colors"
          >
            <svg
              class="w-3 h-3 transition-transform"
              :class="{ 'rotate-90': isThinkingExpanded }"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
            <span>{{ $t('slides.thinkingProcess') }}</span>
            <span v-if="options.isAnalyzing" class="text-mode-generate animate-pulse">●</span>
          </button>

          <div
            v-show="isThinkingExpanded"
            ref="thinkingPanelRef"
            class="p-3 rounded-lg bg-bg-primary border border-border-muted max-h-[150px] overflow-y-auto"
          >
            <pre class="text-xs text-text-muted whitespace-pre-wrap font-mono">{{ thinkingText || $t('slides.waitingForThinking') }}</pre>
          </div>
        </div>

        <!-- Analysis Error -->
        <div
          v-if="options.analysisError"
          class="p-3 rounded-lg bg-status-error-muted border border-status-error text-status-error text-sm"
        >
          {{ options.analysisError }}
        </div>

        <!-- AI Suggested Style (editable) -->
        <div v-if="options.analyzedStyle" class="space-y-2">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 flex-wrap">
              <label class="block text-xs text-text-muted">{{ $t('slides.suggestedStyle') }}</label>
              <!-- Extracted Color Swatches -->
              <div v-if="extractedColors.length > 0" class="flex items-center gap-1">
                <div
                  v-for="color in extractedColors"
                  :key="color"
                  class="relative"
                >
                  <button
                    @click="toggleColorTooltip(color)"
                    class="w-5 h-5 rounded border border-border-muted shadow-sm cursor-pointer transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
                    :style="{ backgroundColor: color }"
                    :title="color"
                  />
                  <!-- Tooltip -->
                  <Transition name="fade">
                    <div
                      v-if="activeColorTooltip === color"
                      class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 rounded-md glass-strong text-xs font-mono text-text-primary whitespace-nowrap z-10"
                    >
                      {{ color }}
                    </div>
                  </Transition>
                </div>
              </div>
            </div>
            <button
              v-if="options.styleConfirmed"
              @click="editStyle"
              class="text-xs text-mode-generate hover:underline"
              :disabled="store.isGenerating || options.isAnalyzing || comparingPage"
            >
              {{ $t('common.edit') }}
            </button>
          </div>
          <ColorPreviewTextarea
            v-model="store.slidesOptions.analyzedStyle"
            :disabled="options.styleConfirmed || store.isGenerating || options.isAnalyzing || comparingPage"
            :rows="5"
            :class="{ 'opacity-75 cursor-not-allowed': options.styleConfirmed }"
          />
        </div>
      </div>

      <!-- Manual Mode -->
      <div v-else class="space-y-2">
        <div class="flex items-center gap-2 flex-wrap">
          <label class="block text-xs text-text-muted">{{ $t('slides.manualStyleHint') }}</label>
          <!-- Extracted Color Swatches (Manual Mode) -->
          <div v-if="extractedColors.length > 0" class="flex items-center gap-1">
            <div
              v-for="color in extractedColors"
              :key="color"
              class="relative"
            >
              <button
                @click="toggleColorTooltip(color)"
                class="w-5 h-5 rounded border border-border-muted shadow-sm cursor-pointer transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
                :style="{ backgroundColor: color }"
                :title="color"
              />
              <!-- Tooltip -->
              <Transition name="fade">
                <div
                  v-if="activeColorTooltip === color"
                  class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 rounded-md glass-strong text-xs font-mono text-text-primary whitespace-nowrap z-10"
                >
                  {{ color }}
                </div>
              </Transition>
            </div>
          </div>
        </div>
        <ColorPreviewTextarea
          v-model="store.slidesOptions.analyzedStyle"
          :placeholder="$t('slides.manualStylePlaceholder')"
          :disabled="options.styleConfirmed || store.isGenerating || options.isAnalyzing || comparingPage"
          :rows="5"
          :class="{ 'opacity-75 cursor-not-allowed': options.styleConfirmed }"
        />
        <button
          v-if="options.styleConfirmed"
          @click="editStyle"
          class="text-xs text-mode-generate hover:underline"
          :disabled="store.isGenerating || options.isAnalyzing || comparingPage"
        >
          {{ $t('common.edit') }}
        </button>
      </div>

      <!-- Style Confirmed Indicator (shared for both modes) -->
      <div v-if="options.styleConfirmed" class="flex justify-center">
        <div class="flex items-center gap-1.5 text-status-success text-xs">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
          <span>{{ $t('slides.styleApplied') }}</span>
        </div>
      </div>

      <!-- Confirm style button (shared for both modes) -->
      <button
        v-if="!options.styleConfirmed && options.analyzedStyle"
        @click="confirmStyle"
        class="w-full py-2.5 text-sm rounded-lg font-medium transition-all bg-mode-generate text-text-on-brand hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="store.isGenerating || options.isAnalyzing || comparingPage || !options.analyzedStyle.trim()"
      >
        {{ $t('slides.confirmStyle') }}
      </button>
    </div>

    <!-- Pages List (Vertical Layout) -->
    <div v-if="options.pages.length > 0" class="space-y-4">
      <h4 class="text-sm font-medium text-text-primary">{{ $t('slides.pagesList') }}</h4>

      <div class="space-y-3 max-h-[350px] overflow-y-auto pr-1">
        <div
          v-for="(page, index) in options.pages"
          :key="page.id"
          class="p-3 rounded-xl bg-bg-muted border border-border-muted transition-all"
          :class="{ 'border-mode-generate bg-mode-generate-muted/30': page.status === 'generating' }"
        >
          <!-- Page Header -->
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <span class="text-xs font-mono text-text-muted">#{{ page.pageNumber }}</span>
              <!-- Status Badge -->
              <span :class="getStatusClass(page.status)" class="text-xs px-2 py-0.5 rounded-md">
                {{ $t(`slides.status.${page.status}`) }}
              </span>
            </div>

            <!-- Action Buttons -->
            <div class="flex items-center gap-1">
              <!-- Move Up -->
              <button
                v-if="index > 0"
                @click="movePage(index, index - 1)"
                class="p-1.5 rounded-lg hover:bg-bg-interactive transition-colors"
                :title="$t('slides.moveUp')"
                :disabled="store.isGenerating"
              >
                <svg class="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
                </svg>
              </button>
              <!-- Move Down -->
              <button
                v-if="index < options.pages.length - 1"
                @click="movePage(index, index + 1)"
                class="p-1.5 rounded-lg hover:bg-bg-interactive transition-colors"
                :title="$t('slides.moveDown')"
                :disabled="store.isGenerating"
              >
                <svg class="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <!-- Regenerate -->
              <button
                v-if="page.status === 'done' || page.status === 'error'"
                @click="handleRegeneratePage(page.id)"
                class="p-1.5 rounded-lg hover:bg-bg-interactive transition-colors"
                :title="$t('slides.regenerate')"
                :disabled="store.isGenerating || comparingPage"
              >
                <svg class="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <!-- Delete -->
              <button
                @click="handleDeletePage(page.id)"
                class="p-1.5 rounded-lg hover:bg-status-error-muted transition-colors"
                :title="$t('common.delete')"
                :disabled="store.isGenerating || comparingPage"
              >
                <svg class="w-4 h-4 text-text-muted hover:text-status-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Page Content Preview -->
          <p class="text-sm text-text-secondary line-clamp-2">{{ page.content }}</p>

          <!-- Per-page Style Guide (collapsible) -->
          <div class="mt-3 pt-3 border-t border-border-muted/50">
            <button
              @click="togglePageStyle(page.id)"
              class="flex items-center gap-2 text-xs text-text-muted hover:text-text-secondary transition-colors w-full"
            >
              <svg
                class="w-3 h-3 transition-transform"
                :class="{ 'rotate-90': expandedPageStyles[page.id] }"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
              <span>{{ $t('slides.pageStyleGuide') }}</span>
              <span v-if="page.styleGuide" class="text-mode-generate">●</span>
            </button>

            <div v-show="expandedPageStyles[page.id]" class="mt-2 space-y-2">
              <textarea
                v-model="store.slidesOptions.pages[index].styleGuide"
                :placeholder="$t('slides.pageStylePlaceholder')"
                class="input-premium min-h-[60px] text-xs"
                :disabled="store.isGenerating || options.isAnalyzing"
              />
              <p class="text-xs text-text-muted">{{ $t('slides.pageStyleHint') }}</p>
            </div>
          </div>

          <!-- Thumbnail Preview (if generated) -->
          <div v-if="page.image?.data" class="mt-3">
            <img
              :src="`data:${page.image.mimeType || 'image/png'};base64,${page.image.data}`"
              class="w-full max-w-[200px] rounded-lg border border-border-muted"
              alt="Slide preview"
            />
          </div>

          <!-- Page-specific Reference Images -->
          <div class="mt-3 pt-3 border-t border-border-muted/50">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs text-text-muted">{{ $t('slides.pageReferences') }}</span>
              <span class="text-xs text-text-muted">
                {{ Math.min((page.referenceImages?.length || 0) + globalReferenceCount, MAX_REFERENCE_IMAGES) }}/{{ MAX_REFERENCE_IMAGES }}
              </span>
            </div>
            <div class="flex flex-wrap gap-2">
              <!-- Page reference images -->
              <div
                v-for="(img, refIndex) in page.referenceImages"
                :key="`page-${page.id}-ref-${refIndex}`"
                class="relative group"
              >
                <img
                  :src="img.preview"
                  class="w-14 h-14 object-cover rounded-md border border-border-muted"
                  :alt="img.name"
                />
                <div
                  class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-md flex items-center justify-center"
                >
                  <button
                    @click="removePageReference(index, refIndex)"
                    class="w-5 h-5 bg-status-error/80 rounded text-white hover:bg-status-error"
                    :disabled="store.isGenerating"
                  >
                    <svg class="w-3 h-3 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              <!-- Add button for page references -->
              <label
                v-if="canAddPageReference(index)"
                class="flex items-center justify-center w-14 h-14 border-2 border-dashed border-border-muted rounded-md cursor-pointer hover:border-mode-generate transition-colors"
                :class="{ 'opacity-50 cursor-not-allowed': store.isGenerating }"
              >
                <input
                  type="file"
                  accept="image/*"
                  class="hidden"
                  @change="(e) => handlePageReferenceUpload(e, index)"
                  :disabled="store.isGenerating"
                />
                <svg class="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
              </label>
            </div>
          </div>

          <!-- Error Message -->
          <div v-if="page.error" class="mt-2 text-xs text-status-error">
            {{ page.error }}
          </div>
        </div>
      </div>
    </div>

    <!-- Content Splitter Modal -->
    <SlidesContentSplitter ref="contentSplitterRef" />

    <!-- Image Comparison Modal (for regeneration) -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="comparingPage"
          class="fixed inset-0 z-50 flex items-center justify-center bg-bg-overlay"
        >
          <div class="bg-bg-card rounded-2xl shadow-2xl max-w-4xl w-full mx-4 overflow-hidden">
            <!-- Header -->
            <div class="px-6 py-4 border-b border-border-default">
              <h3 class="text-lg font-semibold text-text-primary">
                {{ $t('slides.compareImages') }}
              </h3>
              <p class="text-sm text-text-muted mt-1">
                {{ $t('slides.compareImagesHint', { page: comparingPage.pageNumber }) }}
              </p>
            </div>

            <!-- Image Comparison -->
            <div class="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
              <!-- Original Image -->
              <div class="space-y-3">
                <div class="text-sm font-medium text-text-secondary text-center">
                  {{ $t('slides.originalImage') }}
                </div>
                <div
                  class="aspect-video bg-bg-muted rounded-xl overflow-hidden cursor-pointer ring-2 transition-all"
                  :class="comparisonChoice === 'original' ? 'ring-brand-primary' : 'ring-transparent hover:ring-border-default'"
                  @click="comparisonChoice = 'original'"
                >
                  <img
                    v-if="comparingPage.image"
                    :src="`data:${comparingPage.image.mimeType};base64,${comparingPage.image.data}`"
                    class="w-full h-full object-contain"
                  />
                </div>
              </div>

              <!-- New Image -->
              <div class="space-y-3">
                <div class="text-sm font-medium text-text-secondary text-center">
                  {{ $t('slides.newImage') }}
                </div>
                <div
                  class="aspect-video bg-bg-muted rounded-xl overflow-hidden cursor-pointer ring-2 transition-all"
                  :class="comparisonChoice === 'new' ? 'ring-mode-generate' : 'ring-transparent hover:ring-border-default'"
                  @click="comparisonChoice = 'new'"
                >
                  <img
                    v-if="comparingPage.pendingImage"
                    :src="`data:${comparingPage.pendingImage.mimeType};base64,${comparingPage.pendingImage.data}`"
                    class="w-full h-full object-contain"
                  />
                </div>
              </div>
            </div>

            <!-- Footer with Confirm Button -->
            <div class="px-6 py-4 border-t border-border-default">
              <button
                @click="handleConfirmChoice"
                class="w-full py-2.5 rounded-xl bg-mode-generate text-text-on-brand hover:opacity-90 transition-colors text-sm font-medium"
              >
                {{ comparisonChoice === 'new' ? $t('slides.useNew') : $t('slides.keepOriginal') }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Modal transition */
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
