<script setup>
import { ref } from 'vue'
import { useGeneratorStore } from '@/stores/generator'
import { useStyleOptions } from '@/composables/useStyleOptions'
import { useArrayToggle } from '@/composables/useArrayToggle'
import { RESOLUTION_OPTIONS, RATIO_OPTIONS_FULL } from '@/constants'

const store = useGeneratorStore()
const { PREDEFINED_STYLES, PREDEFINED_VARIATIONS } = useStyleOptions()

const customStyleInput = ref('')
const customVariationInput = ref('')

// Options ref
const options = store.generateOptions

// Use array toggle composable for styles and variations
const stylesToggle = useArrayToggle(() => options.styles)
const variationsToggle = useArrayToggle(() => options.variations)

// Handle Enter key for IME input (prevent triggering during composition)
const handleStyleEnter = (event) => {
  if (!event.isComposing) {
    stylesToggle.addFromInput(customStyleInput.value)
    customStyleInput.value = ''
  }
}

const handleVariationEnter = (event) => {
  if (!event.isComposing) {
    variationsToggle.addFromInput(customVariationInput.value)
    customVariationInput.value = ''
  }
}

const addCustomStyle = () => {
  stylesToggle.addFromInput(customStyleInput.value)
  customStyleInput.value = ''
}

const addCustomVariation = () => {
  variationsToggle.addFromInput(customVariationInput.value)
  customVariationInput.value = ''
}
</script>

<template>
  <div class="space-y-6">
    <!-- Resolution -->
    <div class="space-y-3">
      <label class="block text-sm font-medium text-text-secondary">{{ $t('options.resolution') }}</label>
      <div class="grid grid-cols-3 gap-3">
        <button
          v-for="res in RESOLUTION_OPTIONS"
          :key="res.value"
          @click="options.resolution = res.value"
          class="py-3 px-4 rounded-xl text-sm font-medium transition-all"
          :class="options.resolution === res.value
            ? 'bg-mode-generate-muted border border-mode-generate text-mode-generate'
            : 'bg-bg-muted border border-transparent text-text-muted hover:bg-bg-interactive'"
        >
          {{ res.label }}
        </button>
      </div>
    </div>

    <!-- Ratio -->
    <div class="space-y-3">
      <label class="block text-sm font-medium text-text-secondary">{{ $t('options.aspectRatio') }}</label>
      <div class="grid grid-cols-3 gap-3">
        <button
          v-for="ratio in RATIO_OPTIONS_FULL"
          :key="ratio.value"
          @click="options.ratio = ratio.value"
          class="py-3 px-4 rounded-xl text-sm font-medium transition-all flex flex-col items-center justify-center gap-1.5"
          :class="options.ratio === ratio.value
            ? 'bg-mode-generate-muted border border-mode-generate text-mode-generate'
            : 'bg-bg-muted border border-transparent text-text-muted hover:bg-bg-interactive'"
        >
          <!-- Ratio icons with correct proportions -->
          <!-- 1:1 -->
          <svg v-if="ratio.value === '1:1'" class="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="1" y="1" width="14" height="14" rx="1" />
          </svg>
          <!-- 3:4 (portrait) -->
          <svg v-else-if="ratio.value === '3:4'" class="w-3 h-4" viewBox="0 0 12 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="1" y="1" width="10" height="14" rx="1" />
          </svg>
          <!-- 4:3 (landscape) -->
          <svg v-else-if="ratio.value === '4:3'" class="w-4 h-3" viewBox="0 0 16 12" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="1" y="1" width="14" height="10" rx="1" />
          </svg>
          <!-- 9:16 (tall) -->
          <svg v-else-if="ratio.value === '9:16'" class="w-2.5 h-4" viewBox="0 0 9 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="1" y="1" width="7" height="14" rx="1" />
          </svg>
          <!-- 16:9 (wide) -->
          <svg v-else-if="ratio.value === '16:9'" class="w-5 h-3" viewBox="0 0 16 9" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="1" y="1" width="14" height="7" rx="1" />
          </svg>
          <!-- 21:9 (ultrawide) -->
          <svg v-else-if="ratio.value === '21:9'" class="w-6 h-2.5" viewBox="0 0 21 9" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="1" y="1" width="19" height="7" rx="1" />
          </svg>
          {{ ratio.label }}
        </button>
      </div>
    </div>

    <!-- Styles -->
    <div class="space-y-3">
      <label class="block text-sm font-medium text-text-secondary">{{ $t('options.styles') }}</label>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="style in PREDEFINED_STYLES"
          :key="style.value"
          @click="stylesToggle.toggle(style.value)"
          class="py-2 px-4 rounded-lg text-sm font-medium transition-all"
          :class="stylesToggle.has(style.value)
            ? 'bg-mode-generate-muted border border-mode-generate text-mode-generate'
            : 'bg-bg-muted border border-transparent text-text-muted hover:bg-bg-interactive'"
        >
          {{ style.label }}
        </button>
      </div>

      <!-- Selected styles -->
      <div v-if="options.styles.length > 0" class="flex flex-wrap gap-2 pt-2">
        <span
          v-for="style in options.styles"
          :key="style"
          class="tag"
        >
          {{ PREDEFINED_STYLES.find(s => s.value === style)?.label || style }}
          <button @click="stylesToggle.remove(style)" class="tag-remove">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </span>
      </div>

      <!-- Custom style input -->
      <div class="flex gap-2">
        <input
          v-model="customStyleInput"
          type="text"
          :placeholder="$t('options.customStyle')"
          class="input-premium text-sm flex-1"
          @keydown.enter="handleStyleEnter"
        />
        <button @click="addCustomStyle" class="btn-secondary py-2 px-4 text-sm">
          {{ $t('common.add') }}
        </button>
      </div>
    </div>

    <!-- Variations -->
    <div class="space-y-3">
      <label class="block text-sm font-medium text-text-secondary">{{ $t('options.variation') }}</label>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="variation in PREDEFINED_VARIATIONS"
          :key="variation.value"
          @click="variationsToggle.toggle(variation.value)"
          class="py-2 px-4 rounded-lg text-sm font-medium transition-all"
          :class="variationsToggle.has(variation.value)
            ? 'bg-status-info-muted border border-status-info text-status-info'
            : 'bg-bg-muted border border-transparent text-text-muted hover:bg-bg-interactive'"
        >
          {{ variation.label }}
        </button>
      </div>

      <!-- Selected variations -->
      <div v-if="options.variations.length > 0" class="flex flex-wrap gap-2 pt-2">
        <span
          v-for="variation in options.variations"
          :key="variation"
          class="tag tag-cyan"
        >
          {{ PREDEFINED_VARIATIONS.find(v => v.value === variation)?.label || variation }}
          <button @click="variationsToggle.remove(variation)" class="tag-remove">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </span>
      </div>

      <!-- Custom variation input -->
      <div class="flex gap-2">
        <input
          v-model="customVariationInput"
          type="text"
          :placeholder="$t('options.customVariation')"
          class="input-premium text-sm flex-1"
          @keydown.enter="handleVariationEnter"
        />
        <button @click="addCustomVariation" class="btn-secondary py-2 px-4 text-sm">
          {{ $t('common.add') }}
        </button>
      </div>
    </div>

  </div>
</template>
