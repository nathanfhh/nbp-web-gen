<script setup>
import { computed } from 'vue'
import { useGeneratorStore } from '@/stores/generator'
import { buildPrompt } from '@/composables/useApi'

const store = useGeneratorStore()

const composedPrompt = computed(() => {
  if (!store.prompt) return ''
  return buildPrompt(store.prompt, store.getCurrentOptions, store.currentMode)
})

const copyToClipboard = async () => {
  try {
    await navigator.clipboard.writeText(composedPrompt.value)
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}
</script>

<template>
  <div v-if="store.prompt" class="glass p-4">
    <div class="flex items-center justify-between mb-3">
      <h4 class="text-sm font-medium text-gray-400 flex items-center gap-2">
        <svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
        組合後的 Prompt
      </h4>
      <button
        @click="copyToClipboard"
        class="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-gray-500 hover:text-gray-300"
        title="複製"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      </button>
    </div>
    <div class="bg-black/30 rounded-lg p-3 font-mono text-xs text-amber-200/80 leading-relaxed break-all">
      {{ composedPrompt }}
    </div>
  </div>
</template>
