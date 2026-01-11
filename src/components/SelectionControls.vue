<script setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps({
  isAllSelected: {
    type: Boolean,
    required: true,
  },
  selectedCount: {
    type: Number,
    required: true,
  },
})

const emit = defineEmits(['select-all', 'deselect-all'])
</script>

<template>
  <div class="flex items-center justify-between mb-3 flex-shrink-0">
    <div class="flex items-center gap-2">
      <button
        v-if="!isAllSelected"
        @click="emit('select-all')"
        class="text-xs px-2 py-1 rounded-lg bg-bg-muted hover:bg-bg-interactive text-text-secondary transition-all"
      >
        {{ t('historyTransfer.selectAll') }}
      </button>
      <button
        v-else
        @click="emit('deselect-all')"
        class="text-xs px-2 py-1 rounded-lg bg-bg-muted hover:bg-bg-interactive text-text-secondary transition-all"
      >
        {{ t('historyTransfer.deselectAll') }}
      </button>
    </div>
    <span class="text-xs text-text-muted">
      {{ t('historyTransfer.selectedCount', { count: selectedCount }) }}
    </span>
  </div>
</template>
