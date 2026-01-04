<script setup>
import { useGeneratorStore } from '@/stores/generator'

const store = useGeneratorStore()

const modes = [
  {
    id: 'generate',
    name: '生成',
    description: '從文字描述創建圖片',
    icon: 'sparkles',
  },
  {
    id: 'sticker',
    name: '貼圖',
    description: '生成可裁切的貼圖素材',
    icon: 'sticker',
  },
  {
    id: 'edit',
    name: '編輯',
    description: '修改現有圖片',
    icon: 'pencil',
  },
  {
    id: 'story',
    name: '故事',
    description: '生成連續故事序列',
    icon: 'film',
  },
  {
    id: 'diagram',
    name: '圖表',
    description: '創建技術圖表',
    icon: 'chart',
  },
]

const selectMode = (mode) => {
  store.setMode(mode)
}
</script>

<template>
  <div class="grid grid-cols-2 gap-3">
    <button
      v-for="mode in modes"
      :key="mode.id"
      @click="selectMode(mode.id)"
      class="mode-card p-3"
      :class="{ active: store.currentMode === mode.id }"
      :title="mode.description"
    >
      <div class="flex items-center justify-around gap-2">
        <!-- Icon -->
        <div
          class="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center transition-colors"
          :class="store.currentMode === mode.id ? 'bg-purple-500/30' : 'bg-white/5'"
        >
          <!-- Sparkles -->
          <svg v-if="mode.icon === 'sparkles'" class="w-4 h-4" :class="store.currentMode === mode.id ? 'text-purple-400' : 'text-gray-400'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
          <!-- Sticker -->
          <svg v-else-if="mode.icon === 'sticker'" class="w-4 h-4" :class="store.currentMode === mode.id ? 'text-purple-400' : 'text-gray-400'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <!-- Pencil -->
          <svg v-else-if="mode.icon === 'pencil'" class="w-4 h-4" :class="store.currentMode === mode.id ? 'text-purple-400' : 'text-gray-400'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          <!-- Film -->
          <svg v-else-if="mode.icon === 'film'" class="w-4 h-4" :class="store.currentMode === mode.id ? 'text-purple-400' : 'text-gray-400'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
          </svg>
          <!-- Chart -->
          <svg v-else-if="mode.icon === 'chart'" class="w-4 h-4" :class="store.currentMode === mode.id ? 'text-purple-400' : 'text-gray-400'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>

        <!-- Text - Only mode name, description in tooltip -->
        <span class="font-medium text-white text-sm">{{ mode.name }}</span>
      </div>
    </button>
  </div>
</template>
