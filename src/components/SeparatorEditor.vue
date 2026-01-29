<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps({
  imageSrc: {
    type: String,
    required: true,
  },
  imageWidth: {
    type: Number,
    required: true,
  },
  imageHeight: {
    type: Number,
    required: true,
  },
  // From useStickerSeparator
  separatorLines: {
    type: Array,
    required: true,
  },
  isDrawing: {
    type: Boolean,
    default: false,
  },
  firstPoint: {
    type: Object,
    default: null,
  },
  previewLine: {
    type: Object,
    default: null,
  },
  selectedLineId: {
    type: [Number, null],
    default: null,
  },
  zoom: {
    type: Number,
    default: 1,
  },
  pan: {
    type: Object,
    default: () => ({ x: 0, y: 0 }),
  },
  isDragging: {
    type: Boolean,
    default: false,
  },
  isTouching: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits([
  'startDrawing',
  'cancelDrawing',
  'setFirstPoint',
  'updatePreviewLine',
  'completeDrawing',
  'selectLine',
  'deselectLine',
  'deleteLine',
  'clearAllLines',
  'resetZoomPan',
  'containerReady',
  'wheel',
  'mousedown',
  'mousemove',
  'mouseup',
  'touchstart',
  'touchmove',
  'touchend',
])

const containerRef = ref(null)
const mousePosition = ref(null)
const containerSize = ref({ width: 0, height: 0 })

// Calculate display dimensions to fit image in container
const displayDimensions = computed(() => {
  const cw = containerSize.value.width
  const ch = containerSize.value.height
  const iw = props.imageWidth
  const ih = props.imageHeight

  if (!cw || !ch || !iw || !ih) {
    return { width: iw || 400, height: ih || 300 }
  }

  // Scale to fit within container
  const scaleX = cw / iw
  const scaleY = ch / ih
  const scale = Math.min(scaleX, scaleY, 1) // Don't scale up beyond original

  return {
    width: Math.round(iw * scale),
    height: Math.round(ih * scale),
  }
})

// Transform style for the image wrapper
const transformStyle = computed(() => ({
  transform: `translate(${props.pan.x}px, ${props.pan.y}px) scale(${props.zoom})`,
  cursor: props.isDragging
    ? 'grabbing'
    : props.isDrawing
      ? 'crosshair'
      : props.zoom > 1
        ? 'grab'
        : 'default',
  transition: props.isDragging || props.isTouching ? 'none' : 'transform 0.1s ease-out',
}))

// Extend line to edges for display
// NOTE: This function is duplicated in stickerSegmentation.worker.js for processing.
//       If you modify this logic, update both locations.
const extendLineToEdges = (start, end) => {
  const width = props.imageWidth
  const height = props.imageHeight
  const dx = end.x - start.x
  const dy = end.y - start.y

  if (dx === 0 && dy === 0) {
    return { start, end }
  }

  let extStart, extEnd

  if (Math.abs(dx) >= Math.abs(dy)) {
    const slope = dy / dx
    extStart = {
      x: 0,
      y: Math.round(start.y + slope * (0 - start.x)),
    }
    extEnd = {
      x: width - 1,
      y: Math.round(start.y + slope * (width - 1 - start.x)),
    }
  } else {
    const slope = dx / dy
    extStart = {
      x: Math.round(start.x + slope * (0 - start.y)),
      y: 0,
    }
    extEnd = {
      x: Math.round(start.x + slope * (height - 1 - start.y)),
      y: height - 1,
    }
  }

  // Clamp to bounds
  extStart.x = Math.max(0, Math.min(width - 1, extStart.x))
  extStart.y = Math.max(0, Math.min(height - 1, extStart.y))
  extEnd.x = Math.max(0, Math.min(width - 1, extEnd.x))
  extEnd.y = Math.max(0, Math.min(height - 1, extEnd.y))

  return { start: extStart, end: extEnd }
}

// Extended lines for display
const extendedLines = computed(() => {
  return props.separatorLines.map((line) => {
    const extended = extendLineToEdges(line.start, line.end)
    return {
      ...line,
      displayStart: extended.start,
      displayEnd: extended.end,
    }
  })
})

// Extended preview line
const extendedPreviewLine = computed(() => {
  if (!props.previewLine) return null
  const extended = extendLineToEdges(props.previewLine.start, props.previewLine.end)
  return {
    start: extended.start,
    end: extended.end,
  }
})

// Get image coordinates from mouse event
const getImageCoords = (event) => {
  if (!containerRef.value) return null

  const img = containerRef.value.querySelector('img')
  if (!img) return null

  const imgRect = img.getBoundingClientRect()

  let clientX, clientY
  if (event.touches && event.touches.length > 0) {
    clientX = event.touches[0].clientX
    clientY = event.touches[0].clientY
  } else if (event.changedTouches && event.changedTouches.length > 0) {
    clientX = event.changedTouches[0].clientX
    clientY = event.changedTouches[0].clientY
  } else {
    clientX = event.clientX
    clientY = event.clientY
  }

  const relX = clientX - imgRect.left
  const relY = clientY - imgRect.top

  return {
    x: Math.max(0, Math.min(props.imageWidth, (relX / imgRect.width) * props.imageWidth)),
    y: Math.max(0, Math.min(props.imageHeight, (relY / imgRect.height) * props.imageHeight)),
  }
}

// Event handlers
const handleWheel = (e) => {
  emit('wheel', e)
}

const handleMouseDown = (e) => {
  if (props.isDrawing && e.button === 0) {
    e.preventDefault()
    const coords = getImageCoords(e)
    if (coords) {
      if (!props.firstPoint) {
        emit('setFirstPoint', coords)
      } else {
        emit('completeDrawing', coords)
      }
    }
  } else {
    emit('mousedown', e)
  }
}

const handleMouseMove = (e) => {
  const coords = getImageCoords(e)
  mousePosition.value = coords

  if (props.isDrawing && props.firstPoint && coords) {
    emit('updatePreviewLine', coords)
  }

  emit('mousemove', e)
}

const handleMouseUp = (e) => {
  emit('mouseup', e)
}

const handleTouchStart = (e) => {
  if (e.touches.length === 1 && props.isDrawing) {
    e.preventDefault()
    const coords = getImageCoords(e)
    if (coords) {
      if (!props.firstPoint) {
        emit('setFirstPoint', coords)
      } else {
        emit('completeDrawing', coords)
      }
    }
  } else {
    emit('touchstart', e)
  }
}

const handleTouchMove = (e) => {
  if (props.isDrawing && props.firstPoint && e.touches.length === 1) {
    const coords = getImageCoords(e)
    if (coords) {
      emit('updatePreviewLine', coords)
    }
  }
  emit('touchmove', e)
}

const handleTouchEnd = (e) => {
  emit('touchend', e)
}

const handleLineClick = (e, lineId) => {
  e.stopPropagation()
  if (props.selectedLineId === lineId) {
    emit('deselectLine')
  } else {
    emit('selectLine', lineId)
  }
}

const handleCanvasClick = () => {
  if (!props.isDrawing && props.selectedLineId !== null) {
    emit('deselectLine')
  }
}

// Keyboard handling
const handleKeydown = (e) => {
  if (e.key === '0') {
    e.preventDefault()
    emit('resetZoomPan')
  } else if (e.key === 'Escape' && props.isDrawing) {
    e.preventDefault()
    emit('cancelDrawing')
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && props.selectedLineId !== null) {
    e.preventDefault()
    emit('deleteLine', props.selectedLineId)
  }
}

// Update container size
const updateContainerSize = () => {
  if (containerRef.value) {
    const rect = containerRef.value.getBoundingClientRect()
    containerSize.value = { width: rect.width, height: rect.height }
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('resize', updateContainerSize)

  // Get container dimensions after DOM is ready
  nextTick(() => {
    updateContainerSize()
    emit('containerReady', containerSize.value)
  })
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', updateContainerSize)
})
</script>

<template>
  <div class="separator-editor">
    <!-- Toolbar -->
    <div class="separator-toolbar">
      <button
        @click="isDrawing ? emit('cancelDrawing') : emit('startDrawing')"
        class="toolbar-btn"
        :class="{ active: isDrawing }"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
          />
        </svg>
        {{ isDrawing ? t('stickerCropper.separator.cancelDraw') : t('stickerCropper.separator.draw') }}
      </button>

      <button
        @click="emit('clearAllLines')"
        :disabled="separatorLines.length === 0"
        class="toolbar-btn"
        :class="{ disabled: separatorLines.length === 0 }"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
        {{ t('common.clearAll') }}
      </button>

      <button @click="emit('resetZoomPan')" class="toolbar-btn">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        {{ t('stickerCropper.separator.resetView') }} (0)
      </button>

      <!-- Delete button for selected line (touch-friendly) -->
      <button
        v-if="selectedLineId !== null"
        @click="emit('deleteLine', selectedLineId)"
        class="toolbar-btn delete-btn"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
        {{ t('stickerCropper.separator.delete') }}
      </button>

      <span class="line-count">
        {{ t('stickerCropper.separator.lineCount', { count: separatorLines.length }) }}
      </span>
    </div>

    <!-- Canvas Area -->
    <div
      ref="containerRef"
      class="editor-canvas"
      @wheel.prevent="handleWheel"
      @mousedown="handleMouseDown"
      @mousemove="handleMouseMove"
      @mouseup="handleMouseUp"
      @mouseleave="handleMouseUp"
      @touchstart="handleTouchStart"
      @touchmove="handleTouchMove"
      @touchend="handleTouchEnd"
      @click="handleCanvasClick"
    >
      <div class="image-wrapper" :style="transformStyle">
        <img
          :src="imageSrc"
          :width="displayDimensions.width"
          :height="displayDimensions.height"
          draggable="false"
        />

        <!-- SVG overlay for lines - same size as img -->
        <svg
          class="lines-overlay"
          :width="displayDimensions.width"
          :height="displayDimensions.height"
          :viewBox="`0 0 ${imageWidth} ${imageHeight}`"
          preserveAspectRatio="none"
        >
          <!-- Existing lines (extended to edges) -->
          <line
            v-for="line in extendedLines"
            :key="line.id"
            :x1="line.displayStart.x"
            :y1="line.displayStart.y"
            :x2="line.displayEnd.x"
            :y2="line.displayEnd.y"
            class="separator-line"
            :class="{ selected: selectedLineId === line.id }"
            @click.stop="handleLineClick($event, line.id)"
          />

          <!-- Original line segments (clickable handles) -->
          <line
            v-for="line in separatorLines"
            :key="`handle-${line.id}`"
            :x1="line.start.x"
            :y1="line.start.y"
            :x2="line.end.x"
            :y2="line.end.y"
            class="line-handle"
            :class="{ selected: selectedLineId === line.id }"
            @click.stop="handleLineClick($event, line.id)"
          />

          <!-- Start/End points -->
          <template v-for="line in separatorLines" :key="`points-${line.id}`">
            <circle
              :cx="line.start.x"
              :cy="line.start.y"
              r="6"
              class="line-point"
              :class="{ selected: selectedLineId === line.id }"
            />
            <circle
              :cx="line.end.x"
              :cy="line.end.y"
              r="6"
              class="line-point"
              :class="{ selected: selectedLineId === line.id }"
            />
          </template>

          <!-- Preview line while drawing -->
          <template v-if="extendedPreviewLine">
            <line
              :x1="extendedPreviewLine.start.x"
              :y1="extendedPreviewLine.start.y"
              :x2="extendedPreviewLine.end.x"
              :y2="extendedPreviewLine.end.y"
              class="preview-line"
            />
          </template>

          <!-- First point indicator -->
          <circle v-if="firstPoint" :cx="firstPoint.x" :cy="firstPoint.y" r="8" class="first-point" />
        </svg>
      </div>
    </div>

    <!-- Hint -->
    <p class="editor-hint">
      <template v-if="isDrawing">
        {{ firstPoint ? t('stickerCropper.separator.hintEnd') : t('stickerCropper.separator.hintStart') }}
      </template>
      <template v-else>
        {{ t('stickerCropper.separator.zoomHint') }}
      </template>
    </p>
  </div>
</template>

<style scoped>
.separator-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  position: relative;
}

.separator-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.75rem;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 0.5rem;
  margin-bottom: 0.75rem;
  flex-shrink: 0;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 500;
  border-radius: 0.375rem;
  background: rgba(255, 255, 255, 0.1);
  color: var(--color-text-secondary);
  transition: all 0.2s;
}

.toolbar-btn:hover:not(.disabled) {
  background: rgba(255, 255, 255, 0.2);
  color: var(--color-text-primary);
}

.toolbar-btn.active {
  background: var(--color-brand-primary);
  color: var(--color-text-on-brand);
}

.toolbar-btn.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.toolbar-btn.delete-btn {
  background: rgba(239, 68, 68, 0.2);
  color: var(--color-status-error);
}

.toolbar-btn.delete-btn:hover {
  background: rgba(239, 68, 68, 0.3);
}

.line-count {
  margin-left: auto;
  font-size: 0.75rem;
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
}

.editor-canvas {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><rect fill="%231a1a1f" width="20" height="20"/><rect fill="%23252530" width="10" height="10"/><rect fill="%23252530" x="10" y="10" width="10" height="10"/></svg>');
  border-radius: 0.5rem;
  overflow: hidden;
  position: relative;
  min-height: 0;
}

.image-wrapper {
  position: relative;
  transform-origin: center center;
}

.image-wrapper img {
  display: block;
  user-select: none;
  -webkit-user-drag: none;
}

.lines-overlay {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
}

.separator-line {
  stroke: var(--color-brand-primary);
  stroke-width: 3;
  stroke-dasharray: 10 5;
  pointer-events: stroke;
  cursor: pointer;
  transition: stroke-width 0.15s;
}

.separator-line:hover,
.separator-line.selected {
  stroke-width: 5;
}

.separator-line.selected {
  stroke: var(--color-status-warning);
}

.line-handle {
  stroke: transparent;
  stroke-width: 16;
  pointer-events: stroke;
  cursor: pointer;
}

.line-point {
  fill: var(--color-brand-primary);
  stroke: white;
  stroke-width: 2;
  pointer-events: none;
  transition: fill 0.15s;
}

.line-point.selected {
  fill: var(--color-status-warning);
}

.preview-line {
  stroke: var(--color-brand-primary);
  stroke-width: 3;
  stroke-dasharray: 6 4;
  opacity: 0.7;
}

.first-point {
  fill: var(--color-brand-primary);
  stroke: white;
  stroke-width: 3;
  animation: pulse-point 1s ease-in-out infinite;
}

@keyframes pulse-point {
  0%,
  100% {
    opacity: 1;
    r: 8;
  }
  50% {
    opacity: 0.7;
    r: 10;
  }
}

.editor-hint {
  margin-top: 0.75rem;
  font-size: 0.75rem;
  color: var(--color-text-muted);
  text-align: center;
  flex-shrink: 0;
}

@media (max-width: 768px) {
  .separator-toolbar {
    padding: 0.5rem;
    gap: 0.375rem;
  }

  .toolbar-btn {
    padding: 0.375rem 0.5rem;
    font-size: 0.6875rem;
  }

  .line-count {
    width: 100%;
    justify-content: center;
    margin-left: 0;
    margin-top: 0.25rem;
  }
}
</style>
