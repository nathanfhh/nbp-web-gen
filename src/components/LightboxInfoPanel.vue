<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDraggablePanel } from '@/composables/useDraggablePanel'
import { getModelDisplayName } from '@/utils/model-display-name'

const { t } = useI18n()

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
  mode: {
    type: String,
    default: '',
  },
  options: {
    type: Object,
    default: () => ({}),
  },
})

const visibleRef = computed(() => props.visible)
const {
  panelRef,
  isDragging,
  recentlyInteracted,
  panelStyle,
  onDragMouseDown,
  onDragTouchStart,
  onDragTouchMove,
  onDragTouchEnd,
  onResizeMouseDown,
  onResizeTouchStart,
  onResizeTouchMove,
  onResizeTouchEnd,
  onResizeDblClick,
} = useDraggablePanel('nbp-info-panel', { visible: visibleRef })

defineExpose({ recentlyInteracted })

// Build info items based on mode + options
const infoItems = computed(() => {
  const items = []
  const opts = props.options || {}
  const mode = props.mode

  // Model
  if (mode === 'agent') {
    items.push({ label: t('lightbox.info.model'), value: 'Gemini 3 Flash' })
  } else if (opts.model) {
    const name = getModelDisplayName(opts.model)
    if (name) items.push({ label: t('lightbox.info.model'), value: name })
  }

  // Resolution
  if (['generate', 'sticker', 'edit', 'video'].includes(mode) && opts.resolution) {
    items.push({ label: t('lightbox.info.resolution'), value: opts.resolution })
  }

  // Ratio
  if (['generate', 'sticker', 'edit', 'video'].includes(mode) && opts.ratio) {
    items.push({ label: t('lightbox.info.ratio'), value: opts.ratio })
  }

  // Temperature
  if (opts.temperature !== undefined && opts.temperature !== null) {
    items.push({ label: t('lightbox.info.temperature'), value: String(opts.temperature) })
  }

  // Seed
  if (opts.seed) {
    items.push({ label: t('lightbox.info.seed'), value: String(opts.seed) })
  }

  // Styles (generate/sticker)
  if (['generate', 'sticker'].includes(mode) && opts.styles?.length > 0) {
    items.push({ label: t('lightbox.info.styles'), value: opts.styles.join(', ') })
  }

  // Duration (video)
  if (mode === 'video' && opts.duration) {
    items.push({ label: t('lightbox.info.duration'), value: `${opts.duration}s` })
  }

  // Analysis model (slides)
  if (mode === 'slides' && opts.analysisModel) {
    const name = getModelDisplayName(opts.analysisModel)
    if (name) items.push({ label: t('lightbox.info.analysisModel'), value: name })
  }

  // Pages (slides)
  if (mode === 'slides' && opts.pagesContent?.length > 0) {
    items.push({ label: t('lightbox.info.pages'), value: String(opts.pagesContent.length) })
  }

  // Steps (story)
  if (mode === 'story' && opts.steps) {
    items.push({ label: t('lightbox.info.steps'), value: String(opts.steps) })
  }

  return items
})
</script>

<template>
  <Transition name="info-slide">
    <div
      v-if="visible && infoItems.length > 0"
      ref="panelRef"
      class="info-panel"
      :style="panelStyle"
      @wheel.stop
      @click.stop
    >
      <!-- Drag handle header -->
      <div
        class="info-header"
        :class="{ 'cursor-grabbing': isDragging }"
        @mousedown="onDragMouseDown"
        @touchstart="onDragTouchStart"
        @touchmove="onDragTouchMove"
        @touchend="onDragTouchEnd"
      >
        <!-- Grip indicator -->
        <div class="info-grip" aria-hidden="true">
          <span /><span /><span />
        </div>
        <svg class="w-4 h-4 opacity-70 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span class="flex-1">{{ t('lightbox.info.title') }}</span>
      </div>

      <!-- Content -->
      <div class="info-content" @touchstart.stop @touchmove.stop>
        <div
          v-for="(item, idx) in infoItems"
          :key="idx"
          class="info-row"
        >
          <span class="info-label">{{ item.label }}</span>
          <span class="info-value">{{ item.value }}</span>
        </div>
      </div>

      <!-- Resize handle -->
      <div
        class="info-resize-handle"
        @mousedown.stop="onResizeMouseDown"
        @touchstart.stop="onResizeTouchStart"
        @touchmove.prevent="onResizeTouchMove"
        @touchend="onResizeTouchEnd"
        @dblclick="onResizeDblClick"
      />
    </div>
  </Transition>
</template>

<style scoped>
.info-panel {
  position: absolute;
  bottom: 10rem;
  left: 50%;
  transform: translateX(-50%);
  width: max(260px, 30vw);
  max-width: 400px;
  max-height: 35vh;
  display: flex;
  flex-direction: column;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.75rem;
  z-index: 2;
  overflow: hidden;
}

.info-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.8125rem;
  font-weight: 500;
  flex-shrink: 0;
  cursor: grab;
  user-select: none;
  touch-action: none;
}

.info-header.cursor-grabbing {
  cursor: grabbing;
}

.info-grip {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 2px 0;
  flex-shrink: 0;
}

.info-grip span {
  display: block;
  width: 14px;
  height: 2px;
  border-radius: 1px;
  background: rgba(255, 255, 255, 0.35);
}

.info-content {
  flex: 1;
  overflow-y: auto;
  padding: 0.625rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.info-content::-webkit-scrollbar {
  width: 4px;
}

.info-content::-webkit-scrollbar-track {
  background: transparent;
}

.info-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.75rem;
  font-size: 0.8125rem;
  line-height: 1.5;
}

.info-label {
  color: rgba(255, 255, 255, 0.5);
  flex-shrink: 0;
  white-space: nowrap;
}

.info-value {
  color: rgba(255, 255, 255, 0.9);
  text-align: right;
  word-break: break-word;
}

/* Portrait orientation (mobile) */
@media (orientation: portrait) {
  .info-panel {
    width: max(240px, 70vw);
    max-height: 28vh;
    bottom: 10.5rem;
  }
}

/* Resize handle (top-right corner) */
.info-resize-handle {
  position: absolute;
  top: 0;
  right: 0;
  width: 24px;
  height: 24px;
  cursor: ne-resize;
  touch-action: none;
  z-index: 1;
  border-radius: 0 0.75rem 0 0;
  padding: 4px;
  box-sizing: content-box;
}

.info-resize-handle::before,
.info-resize-handle::after {
  content: '';
  position: absolute;
  background: rgba(255, 255, 255, 0.3);
  height: 1px;
  transform: rotate(-45deg);
  transform-origin: center;
}
.info-resize-handle::before {
  width: 10px;
  top: 8px;
  right: 4px;
}
.info-resize-handle::after {
  width: 6px;
  top: 11px;
  right: 4px;
}

/* Slide transition */
.info-slide-enter-active,
.info-slide-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}

.info-slide-enter-from,
.info-slide-leave-to {
  transform: translateX(-50%) translateY(1rem);
  opacity: 0;
}
</style>
