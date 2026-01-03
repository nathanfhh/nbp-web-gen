<script setup>
import { useGeneratorStore } from '@/stores/generator'
import ImageUploader from './ImageUploader.vue'

const store = useGeneratorStore()

const resolutions = [
  { value: '1k', label: '1K (1024px)' },
  { value: '2k', label: '2K (2048px)' },
  { value: '4k', label: '4K (4096px)' },
]

const typeOptions = [
  { value: 'unspecified', label: '不指定' },
  { value: 'flowchart', label: '流程圖' },
  { value: 'architecture', label: '架構圖' },
  { value: 'network', label: '網路拓撲' },
  { value: 'database', label: '資料庫' },
  { value: 'wireframe', label: '線框圖' },
  { value: 'mindmap', label: '心智圖' },
  { value: 'sequence', label: '時序圖' },
]

const styleOptions = [
  { value: 'unspecified', label: '不指定' },
  { value: 'clean', label: '清爽' },
  { value: 'hand-drawn', label: '手繪' },
  { value: 'technical', label: '技術' },
]

const layoutOptions = [
  { value: 'unspecified', label: '不指定' },
  { value: 'horizontal', label: '水平' },
  { value: 'vertical', label: '垂直' },
  { value: 'hierarchical', label: '階層' },
  { value: 'circular', label: '環形' },
]

const complexityOptions = [
  { value: 'unspecified', label: '不指定' },
  { value: 'simple', label: '簡單' },
  { value: 'detailed', label: '詳細' },
  { value: 'comprehensive', label: '全面' },
]

const annotationsOptions = [
  { value: 'unspecified', label: '不指定' },
  { value: 'minimal', label: '精簡標註' },
  { value: 'detailed', label: '詳細標註' },
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
          @click="store.diagramOptions.resolution = res.value"
          class="py-3 px-4 rounded-xl text-sm font-medium transition-all"
          :class="store.diagramOptions.resolution === res.value
            ? 'bg-purple-500/30 border border-purple-500 text-purple-300'
            : 'bg-white/5 border border-transparent text-gray-400 hover:bg-white/10'"
        >
          {{ res.label }}
        </button>
      </div>
    </div>

    <!-- Type -->
    <div class="space-y-3">
      <label class="block text-sm font-medium text-gray-300">圖表類型</label>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button
          v-for="opt in typeOptions"
          :key="opt.value"
          @click="store.diagramOptions.type = opt.value"
          class="py-3 px-4 rounded-xl text-sm font-medium transition-all"
          :class="store.diagramOptions.type === opt.value
            ? 'bg-purple-500/30 border border-purple-500 text-purple-300'
            : 'bg-white/5 border border-transparent text-gray-400 hover:bg-white/10'"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <!-- Style -->
    <div class="space-y-3">
      <label class="block text-sm font-medium text-gray-300">視覺風格</label>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button
          v-for="opt in styleOptions"
          :key="opt.value"
          @click="store.diagramOptions.style = opt.value"
          class="py-3 px-4 rounded-xl text-sm font-medium transition-all"
          :class="store.diagramOptions.style === opt.value
            ? 'bg-cyan-500/30 border border-cyan-500 text-cyan-300'
            : 'bg-white/5 border border-transparent text-gray-400 hover:bg-white/10'"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <!-- Layout -->
    <div class="space-y-3">
      <label class="block text-sm font-medium text-gray-300">版面配置</label>
      <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
        <button
          v-for="opt in layoutOptions"
          :key="opt.value"
          @click="store.diagramOptions.layout = opt.value"
          class="py-3 px-4 rounded-xl text-sm font-medium transition-all"
          :class="store.diagramOptions.layout === opt.value
            ? 'bg-amber-500/30 border border-amber-500 text-amber-300'
            : 'bg-white/5 border border-transparent text-gray-400 hover:bg-white/10'"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <!-- Complexity -->
    <div class="space-y-3">
      <label class="block text-sm font-medium text-gray-300">複雜度</label>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button
          v-for="opt in complexityOptions"
          :key="opt.value"
          @click="store.diagramOptions.complexity = opt.value"
          class="py-3 px-4 rounded-xl text-sm font-medium transition-all"
          :class="store.diagramOptions.complexity === opt.value
            ? 'bg-emerald-500/30 border border-emerald-500 text-emerald-300'
            : 'bg-white/5 border border-transparent text-gray-400 hover:bg-white/10'"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <!-- Annotations -->
    <div class="space-y-3">
      <label class="block text-sm font-medium text-gray-300">標註等級</label>
      <div class="grid grid-cols-3 gap-3">
        <button
          v-for="opt in annotationsOptions"
          :key="opt.value"
          @click="store.diagramOptions.annotations = opt.value"
          class="py-3 px-4 rounded-xl text-sm font-medium transition-all"
          :class="store.diagramOptions.annotations === opt.value
            ? 'bg-rose-500/30 border border-rose-500 text-rose-300'
            : 'bg-white/5 border border-transparent text-gray-400 hover:bg-white/10'"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <!-- Reference Images -->
    <ImageUploader />
  </div>
</template>
