<script setup>
import { ref, computed } from 'vue'
import { useGeneratorStore } from '@/stores/generator'
import { PREDEFINED_STYLES, PREDEFINED_VARIATIONS } from '@/composables/useApi'

const store = useGeneratorStore()
const customStyleInput = ref('')
const customVariationInput = ref('')

const resolutions = [
  { value: '1k', label: '1K (1024px)' },
  { value: '2k', label: '2K (2048px)' },
  { value: '4k', label: '4K (4096px)' },
]

const ratios = [
  { value: '1:1', label: '1:1 正方形' },
  { value: '3:4', label: '3:4 直式' },
  { value: '4:3', label: '4:3 橫式' },
  { value: '9:16', label: '9:16 手機' },
  { value: '16:9', label: '16:9 寬屏' },
  { value: '21:9', label: '21:9 超寬' },
]

const toggleStyle = (style) => {
  const styles = store.generateOptions.styles
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
    if (!store.generateOptions.styles.includes(style)) {
      store.generateOptions.styles.push(style)
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
  const index = store.generateOptions.styles.indexOf(style)
  if (index !== -1) {
    store.generateOptions.styles.splice(index, 1)
  }
}

const removeVariation = (variation) => {
  const index = store.generateOptions.variations.indexOf(variation)
  if (index !== -1) {
    store.generateOptions.variations.splice(index, 1)
  }
}

const isCustomStyle = (style) => {
  return !PREDEFINED_STYLES.some(s => s.value === style)
}

const isCustomVariation = (variation) => {
  return !PREDEFINED_VARIATIONS.some(v => v.value === variation)
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
      <label class="block text-sm font-medium text-gray-300">解析度</label>
      <div class="grid grid-cols-3 gap-3">
        <button
          v-for="res in resolutions"
          :key="res.value"
          @click="store.generateOptions.resolution = res.value"
          class="py-3 px-4 rounded-xl text-sm font-medium transition-all"
          :class="store.generateOptions.resolution === res.value
            ? 'bg-purple-500/30 border border-purple-500 text-purple-300'
            : 'bg-white/5 border border-transparent text-gray-400 hover:bg-white/10'"
        >
          {{ res.label }}
        </button>
      </div>
    </div>

    <!-- Ratio -->
    <div class="space-y-3">
      <label class="block text-sm font-medium text-gray-300">寬高比</label>
      <div class="grid grid-cols-3 gap-3">
        <button
          v-for="ratio in ratios"
          :key="ratio.value"
          @click="store.generateOptions.ratio = ratio.value"
          class="py-3 px-4 rounded-xl text-sm font-medium transition-all"
          :class="store.generateOptions.ratio === ratio.value
            ? 'bg-purple-500/30 border border-purple-500 text-purple-300'
            : 'bg-white/5 border border-transparent text-gray-400 hover:bg-white/10'"
        >
          {{ ratio.label }}
        </button>
      </div>
    </div>

    <!-- Styles -->
    <div class="space-y-3">
      <label class="block text-sm font-medium text-gray-300">風格</label>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="style in PREDEFINED_STYLES"
          :key="style.value"
          @click="toggleStyle(style.value)"
          class="py-2 px-4 rounded-lg text-sm font-medium transition-all"
          :class="store.generateOptions.styles.includes(style.value)
            ? 'bg-purple-500/30 border border-purple-500 text-purple-300'
            : 'bg-white/5 border border-transparent text-gray-400 hover:bg-white/10'"
        >
          {{ style.label }}
        </button>
      </div>

      <!-- Selected styles -->
      <div v-if="store.generateOptions.styles.length > 0" class="flex flex-wrap gap-2 pt-2">
        <span
          v-for="style in store.generateOptions.styles"
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
          placeholder="自訂風格"
          class="input-premium text-sm flex-1"
          @keydown.enter="handleStyleEnter"
        />
        <button @click="addCustomStyle" class="btn-secondary py-2 px-4 text-sm">
          新增
        </button>
      </div>
    </div>

    <!-- Variations -->
    <div class="space-y-3">
      <label class="block text-sm font-medium text-gray-300">變化類型</label>
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
          placeholder="自訂變化"
          class="input-premium text-sm flex-1"
          @keydown.enter="handleVariationEnter"
        />
        <button @click="addCustomVariation" class="btn-secondary py-2 px-4 text-sm">
          新增
        </button>
      </div>
    </div>

  </div>
</template>
