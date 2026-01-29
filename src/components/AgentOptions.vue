<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGeneratorStore } from '@/stores/generator'

const { t } = useI18n()
const store = useGeneratorStore()

// Computed
const contextDepth = computed({
  get: () => store.agentOptions.contextDepth,
  set: (val) => {
    store.agentOptions.contextDepth = val
  },
})

const hasConversation = computed(() => store.agentConversation.length > 0)

const sessionInfo = computed(() => {
  if (!store.agentSessionId) return null

  const messageCount = store.agentConversation.length
  const userMessages = store.agentConversation.filter((m) => m.role === 'user').length
  const modelMessages = store.agentConversation.filter((m) => m.role === 'model').length

  // Calculate session duration if we have messages
  let durationText = ''
  if (messageCount > 0) {
    const firstMessage = store.agentConversation[0]
    const lastMessage = store.agentConversation[messageCount - 1]
    const durationMs = lastMessage.timestamp - firstMessage.timestamp
    const durationMinutes = Math.floor(durationMs / 60000)

    if (durationMinutes < 1) {
      durationText = t('agent.sessionJustStarted')
    } else if (durationMinutes < 60) {
      durationText = t('agent.sessionDuration', { minutes: durationMinutes })
    } else {
      const hours = Math.floor(durationMinutes / 60)
      const mins = durationMinutes % 60
      durationText = t('agent.sessionDurationLong', { hours, minutes: mins })
    }
  }

  return {
    messageCount,
    userMessages,
    modelMessages,
    durationText,
  }
})
</script>

<template>
  <div class="space-y-6">
    <!-- Context Depth Slider -->
    <div>
      <label class="block text-sm font-medium text-text-primary mb-2 flex items-center gap-2">
        <svg class="w-4 h-4 text-mode-generate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
        </svg>
        {{ $t('agent.contextDepth') }}
      </label>
      <div class="flex items-center gap-4">
        <input
          v-model.number="contextDepth"
          type="range"
          min="1"
          max="10"
          step="1"
          class="flex-1 h-2 bg-bg-muted rounded-lg appearance-none cursor-pointer slider-mode-generate"
        />
        <span class="text-sm font-mono text-text-secondary w-8 text-center">{{ contextDepth }}</span>
      </div>
      <p class="text-xs text-text-muted mt-1.5">
        {{ $t('agent.contextDepthHint') }}
      </p>
    </div>

    <!-- Session Info -->
    <div v-if="sessionInfo && hasConversation" class="p-3 rounded-xl bg-bg-muted/50 border border-border-muted">
      <div class="flex items-center gap-2 mb-2">
        <svg class="w-4 h-4 text-mode-generate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span class="text-sm font-medium text-text-primary">{{ $t('agent.sessionInfo') }}</span>
      </div>
      <div class="space-y-1 text-xs text-text-secondary">
        <div class="flex justify-between">
          <span>{{ $t('agent.totalMessages') }}</span>
          <span class="font-mono">{{ sessionInfo.messageCount }}</span>
        </div>
        <div class="flex justify-between">
          <span>{{ $t('agent.userMessages') }}</span>
          <span class="font-mono">{{ sessionInfo.userMessages }}</span>
        </div>
        <div class="flex justify-between">
          <span>{{ $t('agent.modelMessages') }}</span>
          <span class="font-mono">{{ sessionInfo.modelMessages }}</span>
        </div>
        <div v-if="sessionInfo.durationText" class="flex justify-between pt-1 border-t border-border-muted">
          <span>{{ $t('agent.duration') }}</span>
          <span>{{ sessionInfo.durationText }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Custom slider styling */
.slider-mode-generate::-webkit-slider-thumb {
  appearance: none;
  width: 16px;
  height: 16px;
  background: var(--color-mode-generate);
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.15s ease;
}

.slider-mode-generate::-webkit-slider-thumb:hover {
  transform: scale(1.1);
}

.slider-mode-generate::-moz-range-thumb {
  width: 16px;
  height: 16px;
  background: var(--color-mode-generate);
  border: none;
  border-radius: 50%;
  cursor: pointer;
}
</style>
