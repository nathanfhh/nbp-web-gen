<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGeneratorStore } from '@/stores/generator'
import { useSlidesGeneration } from '@/composables/useSlidesGeneration'
import VoiceSettings from './VoiceSettings.vue'

useI18n()
const store = useGeneratorStore()
const { generateScripts, narrationThinking } = useSlidesGeneration()

const options = computed(() => store.slidesOptions)

const narrationEnabled = computed({
  get: () => options.value.narration?.enabled ?? false,
  set: (val) => {
    store.slidesOptions.narration = { ...store.slidesOptions.narration, enabled: val }
  },
})

const narrationSettings = computed({
  get: () => options.value.narration || {},
  set: (val) => {
    store.slidesOptions.narration = val
  },
})

const isGeneratingScripts = computed(() => options.value.narrationStatus === 'generating-scripts')
const hasScripts = computed(() => (options.value.narrationScripts?.length || 0) > 0)

// Thinking panel
const isThinkingExpanded = ref(false)

const handleGenerateScripts = async () => {
  await generateScripts()
}
</script>

<template>
  <div class="space-y-3">
    <!-- Toggle Switch -->
    <div class="flex items-center justify-between">
      <label class="text-sm font-medium text-text-primary flex items-center gap-2">
        <svg class="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
        {{ $t('slides.narration.title') }}
      </label>
      <button
        @click="narrationEnabled = !narrationEnabled"
        class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
        :class="narrationEnabled ? 'bg-mode-generate' : 'bg-bg-interactive'"
        role="switch"
        :aria-checked="narrationEnabled"
      >
        <span
          class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm"
          :class="narrationEnabled ? 'translate-x-6' : 'translate-x-1'"
        />
      </button>
    </div>

    <!-- Settings (expanded when enabled) -->
    <template v-if="narrationEnabled">
      <div class="p-4 rounded-xl bg-bg-muted/50 border border-border-muted space-y-4">
        <VoiceSettings
          v-model="narrationSettings"
          :showStyleOptions="true"
        />

        <!-- Generate Scripts Button -->
        <button
          @click="handleGenerateScripts"
          :disabled="isGeneratingScripts || store.isGenerating || options.pages.length === 0"
          class="w-full py-2.5 text-sm rounded-lg font-medium transition-all bg-mode-generate text-text-on-brand hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <template v-if="isGeneratingScripts">
            <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {{ $t('slides.narration.generatingScripts') }}
          </template>
          <template v-else>
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {{ $t('slides.narration.generateScripts') }}
          </template>
        </button>

        <!-- Thinking Process -->
        <div v-if="narrationThinking.length > 0" class="mt-2">
          <button
            @click="isThinkingExpanded = !isThinkingExpanded"
            class="flex items-center gap-2 text-xs text-text-muted hover:text-text-secondary transition-colors"
          >
            <svg
              class="w-3 h-3 transition-transform"
              :class="{ 'rotate-90': isThinkingExpanded }"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
            {{ $t('slides.thinkingProcess') }}
          </button>
          <div
            v-show="isThinkingExpanded"
            class="mt-2 max-h-[200px] overflow-y-auto text-xs text-text-muted font-mono p-3 rounded-lg bg-bg-muted whitespace-pre-wrap"
          >
            <template v-for="(chunk, i) in narrationThinking" :key="i">{{ chunk.content }}</template>
          </div>
        </div>

        <!-- Script Status -->
        <div v-if="hasScripts" class="flex items-center gap-2 text-xs text-status-success">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
          {{ $t('slides.narration.scriptComplete') }}
          ({{ options.narrationScripts.length }} {{ $t('slides.contentSplitter.pages') }})
        </div>

        <!-- Error -->
        <div v-if="options.narrationError" class="text-xs text-status-error">
          {{ options.narrationError }}
        </div>
      </div>
    </template>
  </div>
</template>
