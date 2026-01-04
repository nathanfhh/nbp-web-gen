<script setup>
import { ref, computed } from 'vue'
import { useGeneratorStore } from '@/stores/generator'
import { PREDEFINED_STYLES } from '@/composables/useApi'

const store = useGeneratorStore()
const customStyleInput = ref('')

const options = computed(() => store.stickerOptions)

// Resolutions
const resolutions = [
  { value: '1k', label: '1K' },
  { value: '2k', label: '2K' },
  { value: '4k', label: '4K' },
]

// Aspect ratios
const ratios = [
  { value: '1:1', label: '1:1' },
  { value: '3:4', label: '3:4' },
  { value: '4:3', label: '4:3' },
  { value: '9:16', label: '9:16' },
  { value: '16:9', label: '16:9' },
]

// Context options
const contexts = [
  { value: 'chat', label: '聊天回覆' },
  { value: 'group', label: '群組互動' },
  { value: 'boss', label: '主管回覆' },
  { value: 'couple', label: '情侶撒嬌' },
  { value: 'custom', label: '其他自訂' },
]

// Tone options
const tones = [
  { value: 'formal', label: '正式' },
  { value: 'polite', label: '禮貌' },
  { value: 'friendly', label: '朋友式' },
  { value: 'sarcastic', label: '嘴砲式' },
]

// Language options
const languages = [
  { value: 'zh-TW', label: '繁中' },
  { value: 'en', label: '英文' },
  { value: 'ja', label: '日文' },
]

// Camera angle options
const cameraAngles = [
  { value: 'headshot', label: '大頭' },
  { value: 'halfbody', label: '半身' },
  { value: 'fullbody', label: '全身' },
]

// Expression options
const expressions = [
  { value: 'natural', label: '自然' },
  { value: 'exaggerated', label: '誇張' },
  { value: 'crazy', label: '崩壞' },
]

// Toggle functions
const toggleStyle = (style) => {
  const styles = options.value.styles
  const index = styles.indexOf(style)
  if (index === -1) {
    styles.push(style)
  } else {
    styles.splice(index, 1)
  }
}

const toggleTone = (tone) => {
  const tones = options.value.tones
  const index = tones.indexOf(tone)
  if (index === -1) {
    tones.push(tone)
  } else {
    tones.splice(index, 1)
  }
}

const toggleLanguage = (lang) => {
  const languages = options.value.languages
  const index = languages.indexOf(lang)
  if (index === -1) {
    languages.push(lang)
  } else {
    languages.splice(index, 1)
  }
}

const toggleCameraAngle = (angle) => {
  const angles = options.value.cameraAngles
  const index = angles.indexOf(angle)
  if (index === -1) {
    angles.push(angle)
  } else {
    angles.splice(index, 1)
  }
}

const toggleExpression = (expr) => {
  const expressions = options.value.expressions
  const index = expressions.indexOf(expr)
  if (index === -1) {
    expressions.push(expr)
  } else {
    expressions.splice(index, 1)
  }
}

const addCustomStyle = () => {
  const styles = customStyleInput.value.split(',').map(s => s.trim()).filter(s => s)
  styles.forEach(style => {
    if (!options.value.styles.includes(style)) {
      options.value.styles.push(style)
    }
  })
  customStyleInput.value = ''
}

const removeStyle = (style) => {
  const index = options.value.styles.indexOf(style)
  if (index !== -1) {
    options.value.styles.splice(index, 1)
  }
}

const handleStyleEnter = (event) => {
  if (!event.isComposing) {
    addCustomStyle()
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
          @click="options.resolution = res.value"
          class="py-3 px-4 rounded-xl text-sm font-medium transition-all"
          :class="options.resolution === res.value
            ? 'bg-pink-500/30 border border-pink-500 text-pink-300'
            : 'bg-white/5 border border-transparent text-gray-400 hover:bg-white/10'"
        >
          {{ res.label }}
        </button>
      </div>
    </div>

    <!-- Ratio -->
    <div class="space-y-3">
      <label class="block text-sm font-medium text-gray-300">寬高比</label>
      <div class="grid grid-cols-5 gap-2">
        <button
          v-for="ratio in ratios"
          :key="ratio.value"
          @click="options.ratio = ratio.value"
          class="py-2.5 px-3 rounded-xl text-sm font-medium transition-all flex flex-col items-center justify-center gap-1"
          :class="options.ratio === ratio.value
            ? 'bg-pink-500/30 border border-pink-500 text-pink-300'
            : 'bg-white/5 border border-transparent text-gray-400 hover:bg-white/10'"
        >
          <!-- Ratio icons -->
          <svg v-if="ratio.value === '1:1'" class="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="1" y="1" width="14" height="14" rx="1" />
          </svg>
          <svg v-else-if="ratio.value === '3:4'" class="w-3 h-4" viewBox="0 0 12 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="1" y="1" width="10" height="14" rx="1" />
          </svg>
          <svg v-else-if="ratio.value === '4:3'" class="w-4 h-3" viewBox="0 0 16 12" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="1" y="1" width="14" height="10" rx="1" />
          </svg>
          <svg v-else-if="ratio.value === '9:16'" class="w-2.5 h-4" viewBox="0 0 9 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="1" y="1" width="7" height="14" rx="1" />
          </svg>
          <svg v-else-if="ratio.value === '16:9'" class="w-5 h-3" viewBox="0 0 16 9" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="1" y="1" width="14" height="7" rx="1" />
          </svg>
          {{ ratio.label }}
        </button>
      </div>
    </div>

    <!-- Divider -->
    <div class="border-t border-white/10"></div>

    <!-- Context/Usage -->
    <div class="space-y-3">
      <label class="block text-sm font-medium text-gray-300">情境用途</label>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="ctx in contexts"
          :key="ctx.value"
          @click="options.context = ctx.value"
          class="py-2 px-4 rounded-lg text-sm font-medium transition-all"
          :class="options.context === ctx.value
            ? 'bg-pink-500/30 border border-pink-500 text-pink-300'
            : 'bg-white/5 border border-transparent text-gray-400 hover:bg-white/10'"
        >
          {{ ctx.label }}
        </button>
      </div>
      <!-- Custom context input -->
      <input
        v-if="options.context === 'custom'"
        v-model="options.customContext"
        type="text"
        placeholder="輸入自訂情境..."
        class="input-premium text-sm w-full"
      />
    </div>

    <!-- Divider -->
    <div class="border-t border-white/10"></div>

    <!-- Text Related -->
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <label class="text-sm font-medium text-gray-300">文字相關</label>
        <button
          @click="options.hasText = !options.hasText"
          class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
          :class="options.hasText ? 'bg-pink-500' : 'bg-gray-600'"
        >
          <span
            class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
            :class="options.hasText ? 'translate-x-6' : 'translate-x-1'"
          />
        </button>
      </div>

      <!-- Text options (shown when hasText is true) -->
      <div v-if="options.hasText" class="space-y-4 pl-4 border-l-2 border-pink-500/30">
        <!-- Tone (multi-select) -->
        <div class="space-y-2">
          <label class="block text-xs font-medium text-gray-400">口吻（可多選）</label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="tone in tones"
              :key="tone.value"
              @click="toggleTone(tone.value)"
              class="py-1.5 px-3 rounded-lg text-xs font-medium transition-all"
              :class="options.tones.includes(tone.value)
                ? 'bg-amber-500/30 border border-amber-500 text-amber-300'
                : 'bg-white/5 border border-transparent text-gray-400 hover:bg-white/10'"
            >
              {{ tone.label }}
            </button>
          </div>
          <!-- Custom tone input -->
          <input
            v-model="options.customTone"
            type="text"
            placeholder="自訂口吻..."
            class="input-premium text-xs w-full"
          />
        </div>

        <!-- Language (multi-select) -->
        <div class="space-y-2">
          <label class="block text-xs font-medium text-gray-400">文字語言（可多選）</label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="lang in languages"
              :key="lang.value"
              @click="toggleLanguage(lang.value)"
              class="py-1.5 px-3 rounded-lg text-xs font-medium transition-all"
              :class="options.languages.includes(lang.value)
                ? 'bg-cyan-500/30 border border-cyan-500 text-cyan-300'
                : 'bg-white/5 border border-transparent text-gray-400 hover:bg-white/10'"
            >
              {{ lang.label }}
            </button>
          </div>
          <!-- Custom language input -->
          <input
            v-model="options.customLanguage"
            type="text"
            placeholder="自訂語言..."
            class="input-premium text-xs w-full"
          />
        </div>
      </div>
    </div>

    <!-- Divider -->
    <div class="border-t border-white/10"></div>

    <!-- Composition -->
    <div class="space-y-4">
      <label class="block text-sm font-medium text-gray-300">構圖</label>

      <!-- Camera Angles (multi-select) -->
      <div class="space-y-2">
        <label class="block text-xs font-medium text-gray-400">鏡位（可多選）</label>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="angle in cameraAngles"
            :key="angle.value"
            @click="toggleCameraAngle(angle.value)"
            class="py-2 px-4 rounded-lg text-sm font-medium transition-all"
            :class="options.cameraAngles.includes(angle.value)
              ? 'bg-emerald-500/30 border border-emerald-500 text-emerald-300'
              : 'bg-white/5 border border-transparent text-gray-400 hover:bg-white/10'"
          >
            {{ angle.label }}
          </button>
        </div>
      </div>

      <!-- Expression Intensity (multi-select) -->
      <div class="space-y-2">
        <label class="block text-xs font-medium text-gray-400">表情誇張度（可多選）</label>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="expr in expressions"
            :key="expr.value"
            @click="toggleExpression(expr.value)"
            class="py-2 px-4 rounded-lg text-sm font-medium transition-all"
            :class="options.expressions.includes(expr.value)
              ? 'bg-violet-500/30 border border-violet-500 text-violet-300'
              : 'bg-white/5 border border-transparent text-gray-400 hover:bg-white/10'"
          >
            {{ expr.label }}
          </button>
        </div>
      </div>
    </div>

    <!-- Divider -->
    <div class="border-t border-white/10"></div>

    <!-- Styles -->
    <div class="space-y-3">
      <label class="block text-sm font-medium text-gray-300">風格</label>
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
          placeholder="自訂風格"
          class="input-premium text-sm flex-1"
          @keydown.enter="handleStyleEnter"
        />
        <button @click="addCustomStyle" class="btn-secondary py-2 px-4 text-sm">
          新增
        </button>
      </div>
    </div>
  </div>
</template>
