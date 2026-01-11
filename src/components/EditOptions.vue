<script setup>
import { useI18n } from 'vue-i18n'
import { useGeneratorStore } from '@/stores/generator'

useI18n() // Enable $t in template
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
    <p v-if="store.referenceImages.length === 0" class="text-xs text-status-warning">
      {{ $t('edit.warning') }}
    </p>

    <!-- Resolution -->
    <div class="space-y-3">
      <label class="block text-sm font-medium text-text-secondary">{{ $t('options.outputResolution') }}</label>
      <div class="grid grid-cols-3 gap-3">
        <button
          v-for="res in resolutions"
          :key="res.value"
          @click="store.editOptions.resolution = res.value"
          class="py-3 px-4 rounded-xl text-sm font-medium transition-all"
          :class="store.editOptions.resolution === res.value
            ? 'bg-mode-generate-muted border border-mode-generate text-mode-generate'
            : 'bg-bg-muted border border-transparent text-text-muted hover:bg-bg-interactive'"
        >
          {{ res.label }}
        </button>
      </div>
    </div>
  </div>
</template>
