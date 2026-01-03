<script setup>
import { useGeneratorStore } from '@/stores/generator'

const store = useGeneratorStore()

const resolutions = [
  { value: '1k', label: '1K' },
  { value: '2k', label: '2K' },
  { value: '4k', label: '4K' },
]

const stepsOptions = [
  { value: 2, label: '2 張' },
  { value: 3, label: '3 張' },
  { value: 4, label: '4 張' },
  { value: 5, label: '5 張' },
  { value: 6, label: '6 張' },
  { value: 7, label: '7 張' },
  { value: 8, label: '8 張' },
]

const typeOptions = [
  { value: 'unspecified', label: '不指定' },
  { value: 'story', label: '故事' },
  { value: 'process', label: '流程' },
  { value: 'tutorial', label: '教學' },
  { value: 'timeline', label: '時間軸' },
]

const styleOptions = [
  { value: 'unspecified', label: '不指定' },
  { value: 'consistent', label: '一致' },
  { value: 'evolving', label: '演進' },
]

const transitionOptions = [
  { value: 'unspecified', label: '不指定' },
  { value: 'smooth', label: '順暢' },
  { value: 'dramatic', label: '戲劇化' },
  { value: 'fade', label: '淡出' },
]

const formatOptions = [
  { value: 'unspecified', label: '不指定' },
  { value: 'storyboard', label: '分鏡板' },
  { value: 'individual', label: '單張' },
]
</script>

<template>
  <div class="space-y-6">
    <!-- Resolution -->
    <div class="space-y-3">
      <label class="block text-sm font-medium text-gray-300">畫質</label>
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
      <label class="block text-sm font-medium text-gray-300">分鏡步驟</label>
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
    </div>

    <!-- Type -->
    <div class="space-y-3">
      <label class="block text-sm font-medium text-gray-300">序列類型</label>
      <select v-model="store.storyOptions.type" class="select-premium">
        <option v-for="opt in typeOptions" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>
    </div>

    <!-- Style -->
    <div class="space-y-3">
      <label class="block text-sm font-medium text-gray-300">視覺一致性</label>
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
      <label class="block text-sm font-medium text-gray-300">轉場效果</label>
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
      <label class="block text-sm font-medium text-gray-300">輸出格式</label>
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
