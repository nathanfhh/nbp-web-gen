<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps({
  type: {
    type: String,
    required: true, // 'main' | 'tab'
  },
  image: {
    type: Object,
    default: null,
  },
  specs: {
    type: Object,
    required: true, // { width, height }
  },
})

const emit = defineEmits(['open-picker', 'upload-click', 'remove'])

const filename = computed(() => props.type === 'main' ? 'main.png' : 'tab.png')
const aspectRatio = computed(() => props.type === 'main' ? 'aspect-square' : 'aspect-[96/74]')
</script>

<template>
  <div class="p-4 rounded-lg bg-white/5 cover-card">
    <div class="flex items-center justify-between mb-3">
      <div>
        <h3 class="font-medium">{{ filename }}</h3>
        <p class="text-xs text-gray-500">{{ specs.width }} × {{ specs.height }} px</p>
      </div>
      <span
        v-if="image?.processedBlob"
        class="px-2 py-0.5 rounded text-xs bg-emerald-500/20 text-emerald-400"
      >
        {{ t('lineStickerTool.cover.set') }}
      </span>
    </div>

    <!-- Preview area -->
    <div class="flex gap-3 mb-3">
      <div class="flex-1">
        <p class="text-xs text-gray-500 mb-1">{{ t('lineStickerTool.cover.result') }}</p>
        <div :class="[aspectRatio, 'rounded-lg overflow-hidden border border-white/10 checkerboard']">
          <img
            v-if="image?.processedPreview"
            :src="image.processedPreview"
            :alt="`${filename} preview`"
            class="w-full h-full object-contain"
          />
          <div v-else class="w-full h-full flex items-center justify-center text-gray-600">
            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        </div>
      </div>
    </div>

    <!-- Action buttons -->
    <div class="flex gap-2">
      <button
        @click="emit('open-picker', type)"
        class="flex-1 px-3 py-2 text-sm rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
      >
        {{ t('lineStickerTool.cover.fromSticker') }}
      </button>
      <button
        @click="emit('upload-click', type)"
        class="flex-1 px-3 py-2 text-sm rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
      >
        {{ t('lineStickerTool.cover.upload') }}
      </button>
      <button
        v-if="image"
        @click="emit('remove', type)"
        class="px-3 py-2 text-sm rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.checkerboard {
  background-image:
    linear-gradient(45deg, #333 25%, transparent 25%),
    linear-gradient(-45deg, #333 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #333 75%),
    linear-gradient(-45deg, transparent 75%, #333 75%);
  background-size: 12px 12px;
  background-position: 0 0, 0 6px, 6px -6px, -6px 0px;
}

[data-theme="light"] .checkerboard {
  background-image:
    linear-gradient(45deg, #ddd 25%, transparent 25%),
    linear-gradient(-45deg, #ddd 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #ddd 75%),
    linear-gradient(-45deg, transparent 75%, #ddd 75%);
}

[data-theme="light"] .cover-card {
  background: rgba(13, 94, 175, 0.05) !important;
}
</style>
