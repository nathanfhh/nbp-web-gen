<script setup>
defineProps({
  passed: {
    type: Boolean,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  hint: {
    type: String,
    required: true,
  },
  // Stats for before/after display
  stats: {
    type: Object,
    default: null,
  },
  // Label for stats (e.g., "itemsOversized", "itemsOddDimension")
  statsLabel: {
    type: String,
    default: '',
  },
  // Extra info text (e.g., current count, failed items)
  extraInfo: {
    type: String,
    default: '',
  },
  // Warning text (e.g., suggested count, missing items)
  warningText: {
    type: String,
    default: '',
  },
})
</script>

<template>
  <div class="flex items-start gap-3 p-3 rounded-lg bg-bg-muted spec-card">
    <span class="mt-0.5 shrink-0">
      <svg v-if="passed" class="w-5 h-5 text-status-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
      </svg>
      <svg v-else class="w-5 h-5 text-status-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </span>
    <div class="flex-1 min-w-0">
      <p class="font-medium" :class="passed ? 'text-status-success' : 'text-status-error'">
        {{ title }}
        <span v-if="extraInfo" class="text-text-muted font-normal text-sm ml-1">({{ extraInfo }})</span>
      </p>
      <p class="text-xs text-text-muted">{{ hint }}</p>

      <!-- Stats: before → after -->
      <p v-if="stats && stats.original > 0" class="text-xs mt-1">
        <span class="text-status-warning">{{ stats.original }}</span>
        <span v-if="stats.hasProcessed" class="text-text-muted"> → </span>
        <span v-if="stats.hasProcessed" :class="stats.remaining === 0 ? 'text-status-success' : 'text-status-warning'">
          {{ stats.remaining }}
        </span>
        <span class="text-text-muted ml-1">{{ statsLabel }}</span>
      </p>

      <!-- Warning text -->
      <p v-if="warningText" class="text-xs text-status-warning mt-1">
        {{ warningText }}
      </p>
    </div>
  </div>
</template>

<style scoped>
/* Light mode styling */
[data-theme="light"] .spec-card {
  background: rgba(13, 94, 175, 0.05) !important;
}
</style>
