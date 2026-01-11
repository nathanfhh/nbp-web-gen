<script setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps({
  hasSelection: {
    type: Boolean,
    required: true,
  },
  isExporting: {
    type: Boolean,
    default: false,
  },
  progressCurrent: {
    type: Number,
    default: 0,
  },
  progressTotal: {
    type: Number,
    default: 0,
  },
})

const emit = defineEmits(['export', 'sync'])
</script>

<template>
  <div class="flex gap-3 mb-4 flex-shrink-0">
    <button
      @click="emit('export')"
      :disabled="!hasSelection || isExporting"
      class="flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all bg-mode-generate-muted border border-mode-generate text-mode-generate hover:bg-mode-generate-muted disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
    >
      <template v-if="isExporting">
        <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span>{{ progressCurrent }}/{{ progressTotal }}</span>
      </template>
      <template v-else>
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        <span>{{ t('historyTransfer.export.button') }}</span>
      </template>
    </button>
    <button
      @click="emit('sync')"
      class="flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all bg-status-info-muted border border-status-info text-status-info hover:bg-status-info-muted flex items-center justify-center gap-2"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
      <span>{{ t('peerSync.title') }}</span>
    </button>
  </div>
</template>
