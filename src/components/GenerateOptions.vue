<script setup>
import { ref } from 'vue'
import { useGeneratorStore } from '@/stores/generator'
import { useStyleOptions } from '@/composables/useStyleOptions'

const store = useGeneratorStore()
const { PREDEFINED_STYLES, PREDEFINED_VARIATIONS } = useStyleOptions()

const customStyleInput = ref('')
const customVariationInput = ref('')

// Options ref
const options = store.generateOptions

const resolutions = [
  { value: '1k', label: '1K' },
  { value: '2k', label: '2K' },
  { value: '4k', label: '4K' },
]

const ratios = [
  { value: '1:1', label: '1:1', icon: 'square' },
  { value: '3:4', label: '3:4', icon: 'portrait' },
  { value: '4:3', label: '4:3', icon: 'landscape' },
  { value: '9:16', label: '9:16', icon: 'tall' },
  { value: '16:9', label: '16:9', icon: 'wide' },
  { value: '21:9', label: '21:9', icon: 'ultrawide' },
]

const toggleStyle = (style) => {
  const styles = options.styles
  const index = styles.indexOf(style)
  if (index === -1) {
    styles.push(style)
  } else {
    styles.splice(index, 1)
  }
}

const toggleVariation = (variation) => {
  const variations = store.generateOptions.variations
  const index = variations.indexOf(variation)
  if (index === -1) {
    variations.push(variation)
  } else {
    variations.splice(index, 1)
  }
}

const addCustomStyle = () => {
  const styles = customStyleInput.value.split(',').map(s => s.trim()).filter(s => s)
  styles.forEach(style => {
    if (!options.styles.includes(style)) {
      options.styles.push(style)
    }
  })
  customStyleInput.value = ''
}

const addCustomVariation = () => {
  const variations = customVariationInput.value.split(',').map(s => s.trim()).filter(s => s)
  variations.forEach(variation => {
    if (!store.generateOptions.variations.includes(variation)) {
      store.generateOptions.variations.push(variation)
    }
  })
  customVariationInput.value = ''
}

const removeStyle = (style) => {
  const index = options.styles.indexOf(style)
  if (index !== -1) {
    options.styles.splice(index, 1)
  }
}

const removeVariation = (variation) => {
  const index = store.generateOptions.variations.indexOf(variation)
  if (index !== -1) {
    store.generateOptions.variations.splice(index, 1)
  }
}

// Handle Enter key for IME input (prevent triggering during composition)
const handleStyleEnter = (event) => {
  if (!event.isComposing) {
    addCustomStyle()
  }
}

const handleVariationEnter = (event) => {
  if (!event.isComposing) {
    addCustomVariation()
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Resolution -->
    <div class="space-y-3">
      <label class="block text-sm font-medium text-gray-300">{{ $t('options.resolution') }}</label>
      <div class="grid grid-cols-3 gap-3">
        <button
          v-for="res in resolutions"
          :key="res.value"
          @click="options.resolution = res.value"
          class="py-3 px-4 rounded-xl text-sm font-medium transition-all"
          :class="options.resolution === res.value
            ? 'bg-purple-500/30 border border-purple-500 text-purple-300'
            : 'bg-white/5 border border-transparent text-gray-400 hover:bg-white/10'"
        >
          {{ res.label }}
        </button>
      </div>
    </div>

    <!-- Ratio -->
    <div class="space-y-3">
      <label class="block text-sm font-medium text-gray-300">{{ $t('options.aspectRatio') }}</label>
      <div class="grid grid-cols-3 gap-3">
        <button
          v-for="ratio in ratios"
          :key="ratio.value"
          @click="options.ratio = ratio.value"
          class="py-3 px-4 rounded-xl text-sm font-medium transition-all flex flex-col items-center justify-center gap-1.5"
          :class="options.ratio === ratio.value
            ? 'bg-purple-500/30 border border-purple-500 text-purple-300'
            : 'bg-white/5 border border-transparent text-gray-400 hover:bg-white/10'"
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
      <label class="block text-sm font-medium text-gray-300">{{ $t('options.styles') }}</label>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="style in PREDEFINED_STYLES"
          :key="style.value"
          @click="toggleStyle(style.value)"
          class="py-2 px-4 rounded-lg text-sm font-medium transition-all"
          :class="options.styles.includes(style.value)
            ? 'bg-purple-500/30 border border-purple-500 text-purple-300'
            : 'bg-white/5 border border-transparent text-gray-400 hover:bg-white/10'"
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
          <button @click="removeStyle(style)" class="tag-remove">
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
      <label class="block text-sm font-medium text-gray-300">{{ $t('options.variation') }}</label>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="variation in PREDEFINED_VARIATIONS"
          :key="variation.value"
          @click="toggleVariation(variation.value)"
          class="py-2 px-4 rounded-lg text-sm font-medium transition-all"
          :class="store.generateOptions.variations.includes(variation.value)
            ? 'bg-cyan-500/30 border border-cyan-500 text-cyan-300'
            : 'bg-white/5 border border-transparent text-gray-400 hover:bg-white/10'"
        >
          {{ variation.label }}
        </button>
      </div>

      <!-- Selected variations -->
      <div v-if="store.generateOptions.variations.length > 0" class="flex flex-wrap gap-2 pt-2">
        <span
          v-for="variation in store.generateOptions.variations"
          :key="variation"
          class="tag"
          style="background: rgba(6, 182, 212, 0.15); border-color: rgba(6, 182, 212, 0.3); color: #22d3ee;"
        >
          {{ PREDEFINED_VARIATIONS.find(v => v.value === variation)?.label || variation }}
          <button @click="removeVariation(variation)" class="tag-remove">
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
