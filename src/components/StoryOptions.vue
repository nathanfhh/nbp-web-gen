<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGeneratorStore } from '@/stores/generator'

const { t } = useI18n()
const store = useGeneratorStore()

const resolutions = [
  { value: '1k', label: '1K' },
  { value: '2k', label: '2K' },
  { value: '4k', label: '4K' },
]

const stepsOptions = computed(() => [
  { value: 2, label: t('story.stepsUnit', { count: 2 }) },
  { value: 3, label: t('story.stepsUnit', { count: 3 }) },
  { value: 4, label: t('story.stepsUnit', { count: 4 }) },
  { value: 5, label: t('story.stepsUnit', { count: 5 }) },
  { value: 6, label: t('story.stepsUnit', { count: 6 }) },
  { value: 7, label: t('story.stepsUnit', { count: 7 }) },
  { value: 8, label: t('story.stepsUnit', { count: 8 }) },
])

const typeOptions = computed(() => [
  { value: 'unspecified', label: t('story.type.unspecified') },
  { value: 'story', label: t('story.type.story') },
  { value: 'process', label: t('story.type.process') },
  { value: 'tutorial', label: t('story.type.tutorial') },
  { value: 'timeline', label: t('story.type.timeline') },
])

const styleOptions = computed(() => [
  { value: 'unspecified', label: t('story.style.unspecified') },
  { value: 'consistent', label: t('story.style.consistent') },
  { value: 'evolving', label: t('story.style.evolving') },
])

const transitionOptions = computed(() => [
  { value: 'unspecified', label: t('story.transition.unspecified') },
  { value: 'smooth', label: t('story.transition.smooth') },
  { value: 'dramatic', label: t('story.transition.dramatic') },
  { value: 'fade', label: t('story.transition.fade') },
])

const formatOptions = computed(() => [
  { value: 'unspecified', label: t('story.format.unspecified') },
  { value: 'storyboard', label: t('story.format.storyboard') },
  { value: 'individual', label: t('story.format.individual') },
])
</script>

<template>
  <div class="space-y-6">
    <!-- Resolution -->
    <div class="space-y-3">
      <label class="block text-sm font-medium text-gray-300">{{ $t('options.quality') }}</label>
      <div class="grid grid-cols-3 gap-3">
        <button
          v-for="res in resolutions"
          :key="res.value"
          @click="store.storyOptions.resolution = res.value"
          class="py-3 px-4 rounded-xl text-sm font-medium transition-all"
          :class="store.storyOptions.resolution === res.value
            ? 'bg-purple-500/30 border border-purple-500 text-purple-300'
            : 'bg-white/5 border border-transparent text-gray-400 hover:bg-white/10'"
        >
          {{ res.label }}
        </button>
      </div>
    </div>

    <!-- Steps -->
    <div class="space-y-3">
      <label class="block text-sm font-medium text-gray-300">{{ $t('story.steps') }}</label>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="step in stepsOptions"
          :key="step.value"
          @click="store.storyOptions.steps = step.value"
          class="py-2 px-4 rounded-lg text-sm font-medium transition-all"
          :class="store.storyOptions.steps === step.value
            ? 'bg-purple-500/30 border border-purple-500 text-purple-300'
            : 'bg-white/5 border border-transparent text-gray-400 hover:bg-white/10'"
        >
          {{ step.label }}
        </button>
      </div>
      <p class="text-xs text-gray-500">{{ $t('story.stepsHint') }}</p>
    </div>

    <!-- Type -->
    <div class="space-y-3">
      <label class="block text-sm font-medium text-gray-300">{{ $t('story.type.label') }}</label>
      <select v-model="store.storyOptions.type" class="select-premium">
        <option v-for="opt in typeOptions" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>
    </div>

    <!-- Style -->
    <div class="space-y-3">
      <label class="block text-sm font-medium text-gray-300">{{ $t('story.style.label') }}</label>
      <div class="grid grid-cols-3 gap-3">
        <button
          v-for="opt in styleOptions"
          :key="opt.value"
          @click="store.storyOptions.style = opt.value"
          class="py-3 px-4 rounded-xl text-sm font-medium transition-all"
          :class="store.storyOptions.style === opt.value
            ? 'bg-purple-500/30 border border-purple-500 text-purple-300'
            : 'bg-white/5 border border-transparent text-gray-400 hover:bg-white/10'"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <!-- Transition -->
    <div class="space-y-3">
      <label class="block text-sm font-medium text-gray-300">{{ $t('story.transition.label') }}</label>
      <div class="grid grid-cols-2 gap-3">
        <button
          v-for="opt in transitionOptions"
          :key="opt.value"
          @click="store.storyOptions.transition = opt.value"
          class="py-3 px-4 rounded-xl text-sm font-medium transition-all"
          :class="store.storyOptions.transition === opt.value
            ? 'bg-cyan-500/30 border border-cyan-500 text-cyan-300'
            : 'bg-white/5 border border-transparent text-gray-400 hover:bg-white/10'"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <!-- Format -->
    <div class="space-y-3">
      <label class="block text-sm font-medium text-gray-300">{{ $t('story.format.label') }}</label>
      <div class="grid grid-cols-3 gap-3">
        <button
          v-for="opt in formatOptions"
          :key="opt.value"
          @click="store.storyOptions.format = opt.value"
          class="py-3 px-4 rounded-xl text-sm font-medium transition-all"
          :class="store.storyOptions.format === opt.value
            ? 'bg-amber-500/30 border border-amber-500 text-amber-300'
            : 'bg-white/5 border border-transparent text-gray-400 hover:bg-white/10'"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

  </div>
</template>
