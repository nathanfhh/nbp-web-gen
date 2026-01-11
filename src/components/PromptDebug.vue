<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGeneratorStore } from '@/stores/generator'
import { buildPrompt } from '@/composables/useApi'
import { useCharacterExtraction } from '@/composables/useCharacterExtraction'
import { useToast } from '@/composables/useToast'

const { t } = useI18n()
const store = useGeneratorStore()
const toast = useToast()
const { buildCharacterPrompt } = useCharacterExtraction()

const composedPrompt = computed(() => {
  if (!store.prompt) return ''

  // Build base prompt with mode-specific enhancements
  const baseEnhanced = buildPrompt(store.prompt, store.getCurrentOptions, store.currentMode)

  // Prepend character description if a character is selected
  if (store.selectedCharacter) {
    const characterDesc = buildCharacterPrompt(store.selectedCharacter)
    if (characterDesc) {
      return `[Character: ${characterDesc}]\n\n${baseEnhanced}`
    }
  }

  return baseEnhanced
})

const copyToClipboard = async () => {
  try {
    await navigator.clipboard.writeText(composedPrompt.value)
    toast.success(t('thinking.copiedToClipboard'))
  } catch (err) {
    console.error('Failed to copy:', err)
    toast.error(t('thinking.copyFailed'))
  }
}
</script>

<template>
  <div v-if="store.prompt" class="glass p-4">
    <div class="flex items-center justify-between mb-3">
      <h4 class="text-sm font-medium text-text-muted flex items-center gap-2">
        <svg class="w-4 h-4 text-status-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
        {{ $t('promptDebug.title') }}
      </h4>
      <button
        @click="copyToClipboard"
        class="p-1.5 rounded-lg hover:bg-bg-interactive transition-colors text-text-muted hover:text-gray-300"
        :title="$t('common.copy')"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      </button>
    </div>
    <div class="bg-bg-muted rounded-lg p-3 font-mono text-xs text-amber-200/80 leading-relaxed break-all">
      {{ composedPrompt }}
    </div>
  </div>
</template>
