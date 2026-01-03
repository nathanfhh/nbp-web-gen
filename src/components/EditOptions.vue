<script setup>
import { useGeneratorStore } from '@/stores/generator'

const store = useGeneratorStore()

const resolutions = [
  { value: '1k', label: '1K' },
  { value: '2k', label: '2K' },
  { value: '4k', label: '4K' },
]
</script>

<template>
  <div class="space-y-6">
    <!-- Edit mode warning -->
    <p v-if="store.referenceImages.length === 0" class="text-xs text-amber-400/80">
      編輯模式需要至少上傳一張圖片
    </p>

    <!-- Resolution -->
    <div class="space-y-3">
      <label class="block text-sm font-medium text-gray-300">輸出解析度</label>
      <div class="grid grid-cols-3 gap-3">
        <button
          v-for="res in resolutions"
          :key="res.value"
          @click="store.editOptions.resolution = res.value"
          class="py-3 px-4 rounded-xl text-sm font-medium transition-all"
          :class="store.editOptions.resolution === res.value
            ? 'bg-purple-500/30 border border-purple-500 text-purple-300'
            : 'bg-white/5 border border-transparent text-gray-400 hover:bg-white/10'"
        >
          {{ res.label }}
        </button>
      </div>
    </div>
  </div>
</template>
