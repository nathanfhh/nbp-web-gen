<script setup>
import { ref, computed } from 'vue'

// Local state for content expansion
const isContentExpanded = ref(false)

// Local state for inline content editing
const isEditingContent = ref(false)
const editingContentText = ref('')

const props = defineProps({
  page: {
    type: Object,
    required: true,
  },
  index: {
    type: Number,
    required: true,
  },
  totalPages: {
    type: Number,
    required: true,
  },
  isGenerating: {
    type: Boolean,
    default: false,
  },
  isAnalyzing: {
    type: Boolean,
    default: false,
  },
  isComparing: {
    type: Boolean,
    default: false,
  },
  expandedStyleGuide: {
    type: Boolean,
    default: false,
  },
  expandedScript: {
    type: Boolean,
    default: false,
  },
  pageScript: {
    type: String,
    default: '',
  },
  narrationEnabled: {
    type: Boolean,
    default: false,
  },
  globalReferenceCount: {
    type: Number,
    default: 0,
  },
  maxReferenceImages: {
    type: Number,
    default: 5,
  },
})

const emit = defineEmits([
  'move-up',
  'move-down',
  'regenerate',
  'delete',
  'toggle-style',
  'toggle-script',
  'update-style-guide',
  'update-script',
  'update-content',
  'view-image',
  'remove-reference',
  'add-reference',
])

// Whether this page has any dirty flag
const isDirty = computed(() => {
  return props.page.contentDirty || props.page.styleDirty || props.page.narrationDirty
})

// Status badge classes
const statusClass = computed(() => {
  const classes = {
    pending: 'bg-bg-muted text-text-muted',
    generating: 'bg-mode-generate-muted text-mode-generate animate-pulse',
    done: 'bg-status-success-muted text-status-success',
    error: 'bg-status-error-muted text-status-error',
    comparing: 'bg-status-warning-muted text-status-warning',
  }
  return classes[props.page.status] || classes.pending
})

// Check if content is long enough to need expansion
// Roughly 80 chars per line × 2 lines = 160, or has multiple paragraphs
const needsExpansion = computed(() => {
  const content = props.page.content || ''
  return content.length > 100 || content.includes('\n\n') || (content.match(/\n/g) || []).length > 1
})

// Can add more page references
const canAddReference = computed(() => {
  const currentCount = (props.page.referenceImages?.length || 0) + props.globalReferenceCount
  return currentCount < props.maxReferenceImages
})

// Start inline content editing
const startEditContent = () => {
  editingContentText.value = props.page.content
  isEditingContent.value = true
}

// Save inline content editing
const saveEditContent = () => {
  emit('update-content', editingContentText.value)
  isEditingContent.value = false
}

// Cancel inline content editing
const cancelEditContent = () => {
  isEditingContent.value = false
  editingContentText.value = ''
}

// Handle file upload for page reference
const handleReferenceUpload = (event) => {
  const file = event.target.files?.[0]
  if (!file) return
  emit('add-reference', file)
  event.target.value = '' // Reset input
}
</script>

<template>
  <div
    class="p-3 rounded-xl bg-bg-muted border transition-all"
    :class="{
      'border-mode-generate bg-mode-generate-muted/30': page.status === 'generating',
      'border-status-warning': isDirty && page.status !== 'generating',
      'border-border-muted': !isDirty && page.status !== 'generating',
    }"
  >
    <!-- Page Header -->
    <div class="flex items-center justify-between mb-2">
      <div class="flex items-center gap-2">
        <span class="text-xs font-mono text-text-muted">#{{ page.pageNumber }}</span>
        <!-- Status Badge -->
        <span :class="statusClass" class="text-xs px-2 py-0.5 rounded-md">
          {{ $t(`slides.status.${page.status}`) }}
        </span>
        <!-- Dirty badge -->
        <span
          v-if="isDirty"
          class="text-xs px-2 py-0.5 rounded-md bg-status-warning-muted text-status-warning"
        >
          {{ $t('slides.modified') }}
        </span>
      </div>

      <!-- Action Buttons -->
      <div class="flex items-center gap-1">
        <!-- Move Up -->
        <button
          v-if="index > 0"
          @click="emit('move-up')"
          class="p-1.5 rounded-lg hover:bg-bg-interactive transition-colors"
          :title="$t('slides.moveUp')"
          :disabled="isGenerating"
        >
          <svg class="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
          </svg>
        </button>
        <!-- Move Down -->
        <button
          v-if="index < totalPages - 1"
          @click="emit('move-down')"
          class="p-1.5 rounded-lg hover:bg-bg-interactive transition-colors"
          :title="$t('slides.moveDown')"
          :disabled="isGenerating"
        >
          <svg class="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <!-- Edit Content -->
        <button
          v-if="!isEditingContent"
          @click="startEditContent"
          class="p-1.5 rounded-lg hover:bg-bg-interactive transition-colors"
          :title="$t('slides.editContent')"
          :disabled="isGenerating || isComparing"
        >
          <svg class="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
        <!-- Regenerate -->
        <button
          v-if="page.status === 'done' || page.status === 'error'"
          @click="emit('regenerate')"
          class="p-1.5 rounded-lg hover:bg-bg-interactive transition-colors"
          :title="$t('slides.regenerate')"
          :disabled="isGenerating || isComparing"
        >
          <svg class="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
        <!-- Delete -->
        <button
          @click="emit('delete')"
          class="p-1.5 rounded-lg hover:bg-status-error-muted transition-colors"
          :title="$t('common.delete')"
          :disabled="isGenerating || isComparing"
        >
          <svg class="w-4 h-4 text-text-muted hover:text-status-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Page Content: Edit Mode -->
    <div v-if="isEditingContent" class="mt-1">
      <textarea
        v-model="editingContentText"
        class="input-premium min-h-[80px] text-sm w-full"
        rows="4"
      />
      <div class="flex items-center gap-2 mt-2">
        <button
          @click="saveEditContent"
          class="px-3 py-1 text-xs font-medium rounded-lg bg-mode-generate text-text-on-brand hover:opacity-90 transition-opacity"
        >
          {{ $t('slides.editContentSave') }}
        </button>
        <button
          @click="cancelEditContent"
          class="px-3 py-1 text-xs font-medium rounded-lg bg-bg-interactive text-text-secondary hover:bg-bg-interactive/80 transition-opacity"
        >
          {{ $t('slides.editContentCancel') }}
        </button>
      </div>
    </div>

    <!-- Page Content Preview (expandable) -->
    <div v-else class="relative">
      <p
        class="text-sm text-text-secondary whitespace-pre-line"
        :class="{ 'line-clamp-2': !isContentExpanded && needsExpansion }"
      >{{ page.content }}</p>
      <!-- Expand/Collapse button -->
      <button
        v-if="needsExpansion"
        @click="isContentExpanded = !isContentExpanded"
        class="text-xs text-mode-generate hover:text-mode-generate/80 mt-1 flex items-center gap-1 transition-colors"
      >
        <span>{{ isContentExpanded ? $t('common.collapse') : $t('common.expand') }}</span>
        <svg
          class="w-3 h-3 transition-transform"
          :class="{ 'rotate-180': isContentExpanded }"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    </div>

    <!-- Per-page Style Guide (collapsible) -->
    <div class="mt-3 pt-3 border-t border-border-muted/50">
      <button
        @click="emit('toggle-style')"
        class="flex items-center gap-2 text-xs text-text-muted hover:text-text-secondary transition-colors w-full"
      >
        <svg
          class="w-3 h-3 transition-transform"
          :class="{ 'rotate-90': expandedStyleGuide }"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
        <span>{{ $t('slides.pageStyleGuide') }}</span>
        <span v-if="page.styleGuide" class="text-mode-generate">●</span>
      </button>

      <div v-show="expandedStyleGuide" class="mt-2 space-y-2">
        <textarea
          :value="page.styleGuide"
          @input="emit('update-style-guide', $event.target.value)"
          :placeholder="$t('slides.pageStylePlaceholder')"
          class="input-premium min-h-[60px] text-xs"
          :disabled="isGenerating || isAnalyzing"
        />
        <p class="text-xs text-text-muted">{{ $t('slides.pageStyleHint') }}</p>
      </div>
    </div>

    <!-- Per-page Script Preview (if narration enabled & scripts generated) -->
    <div
      v-if="narrationEnabled && pageScript"
      class="mt-3 pt-3 border-t border-border-muted/50"
    >
      <button
        @click="emit('toggle-script')"
        class="flex items-center gap-2 text-xs text-text-muted hover:text-text-secondary transition-colors w-full"
      >
        <svg
          class="w-3 h-3 transition-transform"
          :class="{ 'rotate-90': expandedScript }"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
        <span>{{ $t('slides.narration.pageScript') }}</span>
        <span class="text-mode-generate">●</span>
      </button>

      <div v-show="expandedScript" class="mt-2">
        <textarea
          :value="pageScript"
          @input="emit('update-script', $event.target.value)"
          :placeholder="$t('slides.narration.scriptPlaceholder')"
          class="input-premium min-h-[80px] text-xs w-full"
          :disabled="isGenerating"
        />
      </div>
    </div>

    <!-- Thumbnail Preview (if generated) -->
    <div v-if="page.image?.data" class="mt-3">
      <button
        type="button"
        class="block rounded-lg focus:outline-none focus:ring-2 focus:ring-mode-generate"
        :aria-label="$t('slides.slidePreview', { n: page.pageNumber })"
        @click="emit('view-image')"
      >
        <img
          :src="`data:${page.image.mimeType || 'image/png'};base64,${page.image.data}`"
          class="w-full max-w-[200px] rounded-lg border border-border-muted cursor-pointer hover:opacity-80 transition-opacity"
          :alt="$t('slides.slidePreview', { n: page.pageNumber })"
        />
      </button>
    </div>

    <!-- Page-specific Reference Images -->
    <div class="mt-3 pt-3 border-t border-border-muted/50">
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs text-text-muted">{{ $t('slides.pageReferences') }}</span>
        <span class="text-xs text-text-muted">
          {{ Math.min((page.referenceImages?.length || 0) + globalReferenceCount, maxReferenceImages) }}/{{ maxReferenceImages }}
        </span>
      </div>
      <div class="flex flex-wrap gap-2">
        <!-- Page reference images -->
        <div
          v-for="(img, refIndex) in page.referenceImages"
          :key="`ref-${refIndex}`"
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
              @click="emit('remove-reference', refIndex)"
              class="w-5 h-5 bg-status-error/80 rounded text-white hover:bg-status-error"
              :disabled="isGenerating"
            >
              <svg class="w-3 h-3 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <!-- Add button for page references -->
        <label
          v-if="canAddReference"
          class="flex items-center justify-center w-14 h-14 border-2 border-dashed border-border-muted rounded-md cursor-pointer hover:border-mode-generate transition-colors"
          :class="{ 'opacity-50 cursor-not-allowed': isGenerating }"
        >
          <input
            type="file"
            accept="image/*"
            class="hidden"
            @change="handleReferenceUpload"
            :disabled="isGenerating"
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
</template>
