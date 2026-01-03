<script setup>
import { computed } from 'vue'
import { useGeneratorStore } from '@/stores/generator'

const store = useGeneratorStore()

const modeLabels = {
  generate: '生成',
  edit: '編輯',
  story: '故事',
  diagram: '圖表',
}

const formatTime = (timestamp) => {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now - date

  if (diff < 60000) return '剛剛'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分鐘前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小時前`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`

  return date.toLocaleDateString('zh-TW', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const truncatePrompt = (prompt, maxLength = 60) => {
  if (prompt.length <= maxLength) return prompt
  return prompt.slice(0, maxLength) + '...'
}

const loadHistoryItem = (item) => {
  store.prompt = item.prompt
  store.setMode(item.mode)
  store.temperature = item.options?.temperature ?? 1.0
  store.seed = item.options?.seed ?? ''

  if (item.mode === 'generate' && item.options) {
    store.generateOptions.resolution = item.options.resolution || '1k'
    store.generateOptions.ratio = item.options.ratio || '1:1'
    store.generateOptions.styles = item.options.styles || []
    store.generateOptions.variations = item.options.variations || []
  } else if (item.mode === 'story' && item.options) {
    Object.assign(store.storyOptions, item.options)
  } else if (item.mode === 'diagram' && item.options) {
    Object.assign(store.diagramOptions, item.options)
  }
}

const deleteItem = async (id, event) => {
  event.stopPropagation()
  await store.removeFromHistory(id)
}

const clearAll = async () => {
  if (confirm('確定要清除所有歷史紀錄嗎？')) {
    await store.clearHistory()
  }
}
</script>

<template>
  <div class="glass p-6">
    <div class="flex items-center justify-between mb-6">
      <h3 class="font-semibold text-white flex items-center gap-2">
        <svg class="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        歷史紀錄
        <span v-if="store.historyCount > 0" class="badge">{{ store.historyCount }}</span>
      </h3>
      <button
        v-if="store.history.length > 0"
        @click="clearAll"
        class="text-xs text-gray-500 hover:text-red-400 transition-colors"
      >
        清除全部
      </button>
    </div>

    <div v-if="store.history.length > 0" class="space-y-3 max-h-[400px] overflow-y-auto pr-2">
      <div
        v-for="item in store.history"
        :key="item.id"
        @click="loadHistoryItem(item)"
        class="history-item group"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-2">
              <span
                class="text-xs px-2 py-0.5 rounded-md font-medium"
                :class="{
                  'bg-purple-500/20 text-purple-300': item.mode === 'generate',
                  'bg-cyan-500/20 text-cyan-300': item.mode === 'edit',
                  'bg-amber-500/20 text-amber-300': item.mode === 'story',
                  'bg-emerald-500/20 text-emerald-300': item.mode === 'diagram',
                }"
              >
                {{ modeLabels[item.mode] || item.mode }}
              </span>
              <span class="text-xs text-gray-500">
                {{ formatTime(item.timestamp) }}
              </span>
            </div>
            <p class="text-sm text-gray-300 truncate">
              {{ truncatePrompt(item.prompt) }}
            </p>
            <div v-if="item.status" class="mt-2">
              <span
                class="text-xs px-2 py-0.5 rounded-md"
                :class="item.status === 'success' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'"
              >
                {{ item.status === 'success' ? '成功' : '失敗' }}
              </span>
            </div>
          </div>
          <button
            @click="deleteItem(item.id, $event)"
            class="opacity-0 group-hover:opacity-100 p-2 rounded-lg hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-all"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <div v-else class="text-center py-8">
      <div class="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mx-auto mb-4">
        <svg class="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <p class="text-sm text-gray-500">尚無歷史紀錄</p>
    </div>
  </div>
</template>
