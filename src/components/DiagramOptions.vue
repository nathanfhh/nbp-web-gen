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

const typeOptions = computed(() => [
  { value: 'unspecified', label: t('diagram.type.unspecified') },
  { value: 'flowchart', label: t('diagram.type.flowchart') },
  { value: 'architecture', label: t('diagram.type.architecture') },
  { value: 'network', label: t('diagram.type.network') },
  { value: 'database', label: t('diagram.type.database') },
  { value: 'wireframe', label: t('diagram.type.wireframe') },
  { value: 'mindmap', label: t('diagram.type.mindmap') },
  { value: 'sequence', label: t('diagram.type.sequence') },
])

const styleOptions = computed(() => [
  { value: 'unspecified', label: t('diagram.style.unspecified') },
  { value: 'clean', label: t('diagram.style.clean') },
  { value: 'hand-drawn', label: t('diagram.style.handDrawn') },
  { value: 'technical', label: t('diagram.style.technical') },
])

const layoutOptions = computed(() => [
  { value: 'unspecified', label: t('diagram.layout.unspecified') },
  { value: 'horizontal', label: t('diagram.layout.horizontal') },
  { value: 'vertical', label: t('diagram.layout.vertical') },
  { value: 'hierarchical', label: t('diagram.layout.hierarchical') },
  { value: 'circular', label: t('diagram.layout.circular') },
])

const complexityOptions = computed(() => [
  { value: 'unspecified', label: t('diagram.complexity.unspecified') },
  { value: 'simple', label: t('diagram.complexity.simple') },
  { value: 'detailed', label: t('diagram.complexity.detailed') },
  { value: 'comprehensive', label: t('diagram.complexity.comprehensive') },
])

const annotationsOptions = computed(() => [
  { value: 'unspecified', label: t('diagram.annotations.unspecified') },
  { value: 'minimal', label: t('diagram.annotations.minimal') },
  { value: 'detailed', label: t('diagram.annotations.detailed') },
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
          @click="store.diagramOptions.resolution = res.value"
          class="py-3 px-4 rounded-xl text-sm font-medium transition-all"
          :class="store.diagramOptions.resolution === res.value
            ? 'bg-blue-500/30 border border-blue-500 text-blue-300'
            : 'bg-white/5 border border-transparent text-gray-400 hover:bg-white/10'"
        >
          {{ res.label }}
        </button>
      </div>
    </div>

    <!-- Type -->
    <div class="space-y-3">
      <label class="block text-sm font-medium text-gray-300">{{ $t('diagram.type.label') }}</label>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button
          v-for="opt in typeOptions"
          :key="opt.value"
          @click="store.diagramOptions.type = opt.value"
          class="py-3 px-4 rounded-xl text-sm font-medium transition-all"
          :class="store.diagramOptions.type === opt.value
            ? 'bg-blue-500/30 border border-blue-500 text-blue-300'
            : 'bg-white/5 border border-transparent text-gray-400 hover:bg-white/10'"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <!-- Style -->
    <div class="space-y-3">
      <label class="block text-sm font-medium text-gray-300">{{ $t('diagram.style.label') }}</label>
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
      <label class="block text-sm font-medium text-gray-300">{{ $t('diagram.layout.label') }}</label>
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
      <label class="block text-sm font-medium text-gray-300">{{ $t('diagram.complexity.label') }}</label>
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
      <label class="block text-sm font-medium text-gray-300">{{ $t('diagram.annotations.label') }}</label>
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

  </div>
</template>
