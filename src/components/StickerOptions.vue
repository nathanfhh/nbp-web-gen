<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGeneratorStore } from '@/stores/generator'
import { useStyleOptions } from '@/composables/useStyleOptions'
import { useMultiArrayToggle } from '@/composables/useArrayToggle'
import { RESOLUTION_OPTIONS, RATIO_OPTIONS_STANDARD } from '@/constants'

const { t } = useI18n()
const store = useGeneratorStore()
const { PREDEFINED_STYLES } = useStyleOptions()

const customStyleInput = ref('')

const options = computed(() => store.stickerOptions)

// Use multi array toggle for all array options
const togglers = useMultiArrayToggle({
  styles: () => options.value.styles,
  tones: () => options.value.tones,
  languages: () => options.value.languages,
  cameraAngles: () => options.value.cameraAngles,
  expressions: () => options.value.expressions,
})

// Context options with i18n
const contexts = computed(() => [
  { value: 'chat', label: t('sticker.context.chat') },
  { value: 'group', label: t('sticker.context.group') },
  { value: 'boss', label: t('sticker.context.boss') },
  { value: 'couple', label: t('sticker.context.couple') },
  { value: 'custom', label: t('sticker.context.custom') },
])

// Tone options with i18n
const tones = computed(() => [
  { value: 'formal', label: t('sticker.text.tone.formal') },
  { value: 'polite', label: t('sticker.text.tone.polite') },
  { value: 'friendly', label: t('sticker.text.tone.friendly') },
  { value: 'sarcastic', label: t('sticker.text.tone.sarcastic') },
])

// Language options with i18n
const languages = computed(() => [
  { value: 'zh-TW', label: t('sticker.text.language.zhTW') },
  { value: 'en', label: t('sticker.text.language.en') },
  { value: 'ja', label: t('sticker.text.language.ja') },
])

// Camera angle options with i18n
const cameraAngles = computed(() => [
  { value: 'headshot', label: t('sticker.composition.cameraAngle.headshot') },
  { value: 'halfbody', label: t('sticker.composition.cameraAngle.halfbody') },
  { value: 'fullbody', label: t('sticker.composition.cameraAngle.fullbody') },
])

// Expression options with i18n
const expressions = computed(() => [
  { value: 'natural', label: t('sticker.composition.expression.natural') },
  { value: 'exaggerated', label: t('sticker.composition.expression.exaggerated') },
  { value: 'crazy', label: t('sticker.composition.expression.crazy') },
])

const addCustomStyle = () => {
  togglers.styles.addFromInput(customStyleInput.value)
  customStyleInput.value = ''
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
      <label class="block text-sm font-medium text-gray-300">{{ $t('options.resolution') }}</label>
      <div class="grid grid-cols-3 gap-3">
        <button
          v-for="res in RESOLUTION_OPTIONS"
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
      <label class="block text-sm font-medium text-gray-300">{{ $t('options.aspectRatio') }}</label>
      <div class="grid grid-cols-5 gap-2">
        <button
          v-for="ratio in RATIO_OPTIONS_STANDARD"
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

    <!-- Layout -->
    <div class="space-y-3">
      <label class="block text-sm font-medium text-gray-300">{{ $t('sticker.layout') }}</label>
      <div class="flex items-center gap-4">
        <!-- Rows -->
        <div class="flex items-center gap-2">
          <span class="text-xs text-gray-400 w-8">{{ $t('sticker.rows') }}</span>
          <div class="flex items-center gap-1">
            <button
              @click="options.layoutRows = Math.max(1, options.layoutRows - 1)"
              class="w-8 h-8 rounded-lg bg-white/5 text-gray-400 hover:bg-white/10 transition-colors flex items-center justify-center"
              :class="{ 'opacity-50 cursor-not-allowed': options.layoutRows <= 1 }"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" />
              </svg>
            </button>
            <span class="w-8 text-center text-pink-300 font-medium">{{ options.layoutRows }}</span>
            <button
              @click="options.layoutRows = Math.min(5, options.layoutRows + 1)"
              class="w-8 h-8 rounded-lg bg-white/5 text-gray-400 hover:bg-white/10 transition-colors flex items-center justify-center"
              :class="{ 'opacity-50 cursor-not-allowed': options.layoutRows >= 5 }"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        </div>
        <!-- X separator -->
        <span class="text-gray-500 font-medium">×</span>
        <!-- Cols -->
        <div class="flex items-center gap-2">
          <span class="text-xs text-gray-400 w-8">{{ $t('sticker.cols') }}</span>
          <div class="flex items-center gap-1">
            <button
              @click="options.layoutCols = Math.max(1, options.layoutCols - 1)"
              class="w-8 h-8 rounded-lg bg-white/5 text-gray-400 hover:bg-white/10 transition-colors flex items-center justify-center"
              :class="{ 'opacity-50 cursor-not-allowed': options.layoutCols <= 1 }"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" />
              </svg>
            </button>
            <span class="w-8 text-center text-pink-300 font-medium">{{ options.layoutCols }}</span>
            <button
              @click="options.layoutCols = Math.min(5, options.layoutCols + 1)"
              class="w-8 h-8 rounded-lg bg-white/5 text-gray-400 hover:bg-white/10 transition-colors flex items-center justify-center"
              :class="{ 'opacity-50 cursor-not-allowed': options.layoutCols >= 5 }"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        </div>
      </div>
      <!-- Layout preview -->
      <div class="flex items-center gap-2">
        <span class="text-xs text-gray-500">{{ $t('sticker.preview') }}</span>
        <div
          class="grid gap-0.5 p-2 bg-white/5 rounded-lg"
          :style="{
            gridTemplateRows: `repeat(${options.layoutRows}, 1fr)`,
            gridTemplateColumns: `repeat(${options.layoutCols}, 1fr)`
          }"
        >
          <div
            v-for="i in options.layoutRows * options.layoutCols"
            :key="i"
            class="w-4 h-4 bg-pink-500/30 rounded-sm"
          ></div>
        </div>
        <span class="text-xs text-gray-400">
          {{ $t('sticker.totalStickers', { count: options.layoutRows * options.layoutCols }) }}
        </span>
      </div>
    </div>

    <!-- Divider -->
    <div class="border-t border-white/10"></div>

    <!-- Context/Usage -->
    <div class="space-y-3">
      <label class="block text-sm font-medium text-gray-300">{{ $t('sticker.context.title') }}</label>
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
        :placeholder="$t('sticker.context.placeholder')"
        class="input-premium text-sm w-full"
      />
    </div>

    <!-- Divider -->
    <div class="border-t border-white/10"></div>

    <!-- Text Related -->
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <label class="text-sm font-medium text-gray-300">{{ $t('sticker.text.title') }}</label>
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
          <label class="block text-xs font-medium text-gray-400">{{ $t('sticker.text.tone.label') }}</label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="tone in tones"
              :key="tone.value"
              @click="togglers.tones.toggle(tone.value)"
              class="py-2 px-4 rounded-lg text-sm font-medium transition-all"
              :class="togglers.tones.has(tone.value)
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
            :placeholder="$t('sticker.text.tone.placeholder')"
            class="input-premium text-xs w-full"
          />
        </div>

        <!-- Language (multi-select) -->
        <div class="space-y-2">
          <label class="block text-xs font-medium text-gray-400">{{ $t('sticker.text.language.label') }}</label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="lang in languages"
              :key="lang.value"
              @click="togglers.languages.toggle(lang.value)"
              class="py-2 px-4 rounded-lg text-sm font-medium transition-all"
              :class="togglers.languages.has(lang.value)
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
            :placeholder="$t('sticker.text.language.placeholder')"
            class="input-premium text-xs w-full"
          />
        </div>
      </div>
    </div>

    <!-- Divider -->
    <div class="border-t border-white/10"></div>

    <!-- Composition -->
    <div class="space-y-4">
      <label class="block text-sm font-medium text-gray-300">{{ $t('sticker.composition.title') }}</label>

      <!-- Camera Angles (multi-select) -->
      <div class="space-y-2">
        <label class="block text-xs font-medium text-gray-400">{{ $t('sticker.composition.cameraAngle.label') }}</label>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="angle in cameraAngles"
            :key="angle.value"
            @click="togglers.cameraAngles.toggle(angle.value)"
            class="py-2 px-4 rounded-lg text-sm font-medium transition-all"
            :class="togglers.cameraAngles.has(angle.value)
              ? 'bg-emerald-500/30 border border-emerald-500 text-emerald-300'
              : 'bg-white/5 border border-transparent text-gray-400 hover:bg-white/10'"
          >
            {{ angle.label }}
          </button>
        </div>
      </div>

      <!-- Expression Intensity (multi-select) -->
      <div class="space-y-2">
        <label class="block text-xs font-medium text-gray-400">{{ $t('sticker.composition.expression.label') }}</label>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="expr in expressions"
            :key="expr.value"
            @click="togglers.expressions.toggle(expr.value)"
            class="py-2 px-4 rounded-lg text-sm font-medium transition-all"
            :class="togglers.expressions.has(expr.value)
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
      <label class="block text-sm font-medium text-gray-300">{{ $t('options.styles') }}</label>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="style in PREDEFINED_STYLES"
          :key="style.value"
          @click="togglers.styles.toggle(style.value)"
          class="py-2 px-4 rounded-lg text-sm font-medium transition-all"
          :class="togglers.styles.has(style.value)
            ? 'bg-blue-500/30 border border-blue-500 text-blue-300'
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
          <button @click="togglers.styles.remove(style)" class="tag-remove">
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

  </div>
</template>
