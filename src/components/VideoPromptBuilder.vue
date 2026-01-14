<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGeneratorStore } from '@/stores/generator'
import {
  VIDEO_STYLE_OPTIONS,
  VIDEO_CAMERA_OPTIONS,
  VIDEO_COMPOSITION_OPTIONS,
  VIDEO_LENS_OPTIONS,
  VIDEO_AMBIANCE_OPTIONS,
  VIDEO_ACTION_OPTIONS,
  VIDEO_NEGATIVE_OPTIONS,
} from '@/constants'

const { t } = useI18n()
const store = useGeneratorStore()

// Use videoPromptOptions from store
const promptOptions = computed(() => store.videoPromptOptions)

// Category definitions with their options
const categories = [
  {
    id: 'style',
    options: VIDEO_STYLE_OPTIONS,
    multiSelect: true,
    hasCustom: true,
    selected: () => promptOptions.value.styles,
    custom: () => promptOptions.value.customStyle,
    toggle: (val) => toggleOption('styles', val),
    setCustom: (val) => (promptOptions.value.customStyle = val),
  },
  {
    id: 'camera',
    options: VIDEO_CAMERA_OPTIONS,
    multiSelect: true,
    hasCustom: false,
    selected: () => promptOptions.value.cameras,
    toggle: (val) => toggleOption('cameras', val),
  },
  {
    id: 'composition',
    options: VIDEO_COMPOSITION_OPTIONS,
    multiSelect: false,
    hasCustom: false,
    selected: () => (promptOptions.value.composition ? [promptOptions.value.composition] : []),
    toggle: (val) => {
      promptOptions.value.composition = promptOptions.value.composition === val ? '' : val
    },
  },
  {
    id: 'lens',
    options: VIDEO_LENS_OPTIONS,
    multiSelect: true,
    hasCustom: false,
    selected: () => promptOptions.value.lenses,
    toggle: (val) => toggleOption('lenses', val),
  },
  {
    id: 'ambiance',
    options: VIDEO_AMBIANCE_OPTIONS,
    multiSelect: true,
    hasCustom: true,
    selected: () => promptOptions.value.ambiances,
    custom: () => promptOptions.value.customAmbiance,
    toggle: (val) => toggleOption('ambiances', val),
    setCustom: (val) => (promptOptions.value.customAmbiance = val),
  },
  {
    id: 'action',
    options: VIDEO_ACTION_OPTIONS,
    multiSelect: true,
    hasCustom: true,
    selected: () => promptOptions.value.actions,
    custom: () => promptOptions.value.customAction,
    toggle: (val) => toggleOption('actions', val),
    setCustom: (val) => (promptOptions.value.customAction = val),
  },
]

// Negative prompt category
const negativeCategory = {
  id: 'negative',
  options: VIDEO_NEGATIVE_OPTIONS,
  multiSelect: true,
  hasCustom: true,
  selected: () => promptOptions.value.negatives,
  custom: () => promptOptions.value.customNegative,
  toggle: (val) => toggleOption('negatives', val),
  setCustom: (val) => (promptOptions.value.customNegative = val),
}

// Toggle option in multi-select array
const toggleOption = (field, value) => {
  const arr = promptOptions.value[field]
  const index = arr.indexOf(value)
  if (index === -1) {
    arr.push(value)
  } else {
    arr.splice(index, 1)
  }
}

// Check if an option is selected
const isSelected = (category, value) => {
  return category.selected().includes(value)
}

// Build the final prompt string (for preview)
const builtPrompt = computed(() => {
  const parts = []

  // Add subject (main prompt input is in HomeView, this is just for preview)
  if (store.prompt) {
    parts.push(store.prompt)
  }

  // Add styles
  const styles = [...promptOptions.value.styles]
  if (promptOptions.value.customStyle) {
    styles.push(promptOptions.value.customStyle)
  }
  if (styles.length > 0) {
    parts.push(styles.map((s) => t(`videoPrompt.style.${s}`, s)).join(', ') + ' style')
  }

  // Add camera
  if (promptOptions.value.cameras.length > 0) {
    parts.push(promptOptions.value.cameras.map((c) => t(`videoPrompt.camera.${c}`, c)).join(', '))
  }

  // Add composition
  if (promptOptions.value.composition) {
    parts.push(t(`videoPrompt.composition.${promptOptions.value.composition}`, promptOptions.value.composition))
  }

  // Add lens
  if (promptOptions.value.lenses.length > 0) {
    parts.push(promptOptions.value.lenses.map((l) => t(`videoPrompt.lens.${l}`, l)).join(', '))
  }

  // Add ambiance
  const ambiances = [...promptOptions.value.ambiances]
  if (promptOptions.value.customAmbiance) {
    ambiances.push(promptOptions.value.customAmbiance)
  }
  if (ambiances.length > 0) {
    parts.push(ambiances.map((a) => t(`videoPrompt.ambiance.${a}`, a)).join(', '))
  }

  // Add actions
  const actions = [...promptOptions.value.actions]
  if (promptOptions.value.customAction) {
    actions.push(promptOptions.value.customAction)
  }
  if (actions.length > 0) {
    parts.push(actions.map((a) => t(`videoPrompt.action.${a}`, a)).join(', '))
  }

  return parts.join('. ')
})

// Build the negative prompt string
const builtNegativePrompt = computed(() => {
  const negatives = [...promptOptions.value.negatives]
  if (promptOptions.value.customNegative) {
    negatives.push(promptOptions.value.customNegative)
  }
  return negatives.map((n) => t(`videoPrompt.negative.${n}`, n)).join(', ')
})

// Expose built prompts to parent
defineExpose({
  builtPrompt,
  builtNegativePrompt,
})

// Track collapsed state for each category
const collapsedCategories = ref(new Set())

const toggleCollapse = (categoryId) => {
  if (collapsedCategories.value.has(categoryId)) {
    collapsedCategories.value.delete(categoryId)
  } else {
    collapsedCategories.value.add(categoryId)
  }
}

const isCollapsed = (categoryId) => collapsedCategories.value.has(categoryId)

// Get category icon
const getCategoryIcon = (categoryId) => {
  const icons = {
    style: 'M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4',
    camera: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z',
    composition: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z',
    lens: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7',
    ambiance: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z',
    action: 'M13 10V3L4 14h7v7l9-11h-7z',
    negative: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636',
    audio: 'M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z',
  }
  return icons[categoryId] || icons.style
}
</script>

<template>
  <div class="space-y-4">
    <!-- Positive Prompt Categories -->
    <div
      v-for="category in categories"
      :key="category.id"
      class="rounded-xl border border-border-muted overflow-hidden"
    >
      <!-- Category Header -->
      <button
        @click="toggleCollapse(category.id)"
        class="w-full flex items-center justify-between px-4 py-3 bg-bg-muted hover:bg-bg-interactive transition-colors"
      >
        <div class="flex items-center gap-2">
          <svg class="w-4 h-4 text-mode-generate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="getCategoryIcon(category.id)" />
          </svg>
          <span class="text-sm font-medium text-text-primary">
            {{ $t(`videoPrompt.categories.${category.id}`) }}
          </span>
          <span v-if="category.selected().length > 0" class="px-1.5 py-0.5 rounded-full text-xs bg-mode-generate-muted text-mode-generate font-semibold">
            {{ category.selected().length }}
          </span>
        </div>
        <svg
          class="w-4 h-4 text-text-muted transition-transform"
          :class="{ 'rotate-180': !isCollapsed(category.id) }"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <!-- Category Options -->
      <div v-show="!isCollapsed(category.id)" class="p-4 space-y-3 bg-bg-primary">
        <!-- Option Chips -->
        <div class="flex flex-wrap gap-2">
          <button
            v-for="option in category.options"
            :key="option.value"
            @click="category.toggle(option.value)"
            class="px-3 py-1.5 rounded-lg text-xs font-medium transition-all border"
            :class="
              isSelected(category, option.value)
                ? 'bg-mode-generate-muted text-mode-generate border-mode-generate'
                : 'bg-bg-muted text-text-muted border-transparent hover:bg-bg-interactive hover:text-text-primary'
            "
          >
            {{ $t(`videoPrompt.${category.id}.${option.value}`, option.value) }}
          </button>
        </div>

        <!-- Custom Input -->
        <div v-if="category.hasCustom" class="pt-2">
          <input
            type="text"
            :value="category.custom()"
            @input="category.setCustom($event.target.value)"
            :placeholder="$t('videoPrompt.customPlaceholder')"
            class="w-full px-3 py-2 rounded-lg bg-bg-muted border border-border-muted text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-primary focus:border-brand-primary"
          />
        </div>
      </div>
    </div>

    <!-- Negative Prompt Category -->
    <div class="rounded-xl border border-status-error/30 overflow-hidden">
      <!-- Header -->
      <button
        @click="toggleCollapse('negative')"
        class="w-full flex items-center justify-between px-4 py-3 bg-status-error/5 hover:bg-status-error/10 transition-colors"
      >
        <div class="flex items-center gap-2">
          <svg class="w-4 h-4 text-status-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="getCategoryIcon('negative')" />
          </svg>
          <span class="text-sm font-medium text-text-primary">
            {{ $t('videoPrompt.categories.negative') }}
          </span>
          <span v-if="negativeCategory.selected().length > 0" class="px-1.5 py-0.5 rounded-full text-xs bg-status-error-muted text-status-error font-semibold">
            {{ negativeCategory.selected().length }}
          </span>
        </div>
        <svg
          class="w-4 h-4 text-text-muted transition-transform"
          :class="{ 'rotate-180': !isCollapsed('negative') }"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <!-- Options -->
      <div v-show="!isCollapsed('negative')" class="p-4 space-y-3 bg-bg-primary">
        <div class="flex flex-wrap gap-2">
          <button
            v-for="option in negativeCategory.options"
            :key="option.value"
            @click="negativeCategory.toggle(option.value)"
            class="px-3 py-1.5 rounded-lg text-xs font-medium transition-all border"
            :class="
              isSelected(negativeCategory, option.value)
                ? 'bg-status-error-muted text-status-error border-status-error'
                : 'bg-bg-muted text-text-muted border-transparent hover:bg-bg-interactive hover:text-status-error'
            "
          >
            {{ $t(`videoPrompt.negative.${option.value}`, option.value) }}
          </button>
        </div>

        <!-- Custom Negative Input -->
        <div class="pt-2">
          <input
            type="text"
            :value="negativeCategory.custom()"
            @input="negativeCategory.setCustom($event.target.value)"
            :placeholder="$t('videoPrompt.customNegativePlaceholder')"
            class="w-full px-3 py-2 rounded-lg bg-bg-muted border border-status-error/30 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-status-error focus:border-status-error"
          />
        </div>
      </div>
    </div>

    <!-- Audio Prompts Section (Veo 3.1 always generates audio) -->
    <div class="rounded-xl border border-border-muted overflow-hidden">
      <button
        @click="toggleCollapse('audio')"
        class="w-full flex items-center justify-between px-4 py-3 bg-bg-muted hover:bg-bg-interactive transition-colors"
      >
        <div class="flex items-center gap-2">
          <svg class="w-4 h-4 text-mode-generate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="getCategoryIcon('audio')" />
          </svg>
          <span class="text-sm font-medium text-text-primary">
            {{ $t('videoPrompt.categories.audio') }}
          </span>
        </div>
        <svg
          class="w-4 h-4 text-text-muted transition-transform"
          :class="{ 'rotate-180': !isCollapsed('audio') }"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <div v-show="!isCollapsed('audio')" class="p-4 space-y-4 bg-bg-primary">
        <!-- Dialogue -->
        <div class="space-y-2">
          <label class="block text-xs font-medium text-text-secondary">
            {{ $t('videoPrompt.audio.dialogue') }}
          </label>
          <input
            v-model="promptOptions.dialogue"
            type="text"
            :placeholder="$t('videoPrompt.audio.dialoguePlaceholder')"
            class="w-full px-3 py-2 rounded-lg bg-bg-muted border border-border-muted text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-primary focus:border-brand-primary"
          />
          <p class="text-xs text-text-muted">{{ $t('videoPrompt.audio.dialogueHint') }}</p>
        </div>

        <!-- Sound Effects -->
        <div class="space-y-2">
          <label class="block text-xs font-medium text-text-secondary">
            {{ $t('videoPrompt.audio.soundEffects') }}
          </label>
          <input
            v-model="promptOptions.soundEffects"
            type="text"
            :placeholder="$t('videoPrompt.audio.soundEffectsPlaceholder')"
            class="w-full px-3 py-2 rounded-lg bg-bg-muted border border-border-muted text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-primary focus:border-brand-primary"
          />
        </div>

        <!-- Ambient Sound -->
        <div class="space-y-2">
          <label class="block text-xs font-medium text-text-secondary">
            {{ $t('videoPrompt.audio.ambientSound') }}
          </label>
          <input
            v-model="promptOptions.ambientSound"
            type="text"
            :placeholder="$t('videoPrompt.audio.ambientSoundPlaceholder')"
            class="w-full px-3 py-2 rounded-lg bg-bg-muted border border-border-muted text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand-primary focus:border-brand-primary"
          />
        </div>
      </div>
    </div>

    <!-- Prompt Preview -->
    <div class="rounded-xl border border-border-muted p-4 bg-bg-muted space-y-3">
      <div class="flex items-center gap-2">
        <svg class="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
        <span class="text-xs font-medium text-text-secondary">{{ $t('videoPrompt.preview') }}</span>
      </div>

      <!-- Positive Prompt Preview -->
      <div v-if="builtPrompt" class="space-y-1">
        <p class="text-xs text-text-muted">{{ $t('videoPrompt.positivePreview') }}</p>
        <p class="text-sm text-text-primary leading-relaxed">{{ builtPrompt }}</p>
      </div>
      <p v-else class="text-sm text-text-muted italic">{{ $t('videoPrompt.emptyPreview') }}</p>

      <!-- Negative Prompt Preview -->
      <div v-if="builtNegativePrompt" class="space-y-1 pt-2 border-t border-border-muted">
        <p class="text-xs text-status-error">{{ $t('videoPrompt.negativePreview') }}</p>
        <p class="text-sm text-text-muted leading-relaxed">{{ builtNegativePrompt }}</p>
      </div>
    </div>
  </div>
</template>
