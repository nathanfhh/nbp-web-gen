<script setup>
/**
 * OCR Region Editor Component
 *
 * Allows users to manually edit OCR detection regions:
 * - Delete existing regions (hover + click delete button)
 * - Draw new regions (rectangle drawing tool)
 * - Optional text input for new regions
 */

import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps({
  // Regions to display and edit
  regions: {
    type: Array,
    default: () => [],
  },
  // Image dimensions for coordinate mapping
  imageDimensions: {
    type: Object,
    default: () => ({ width: 0, height: 0 }),
  },
  // Whether regions have been edited
  isEdited: {
    type: Boolean,
    default: false,
  },
  // Whether reprocessing is in progress
  isReprocessing: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits([
  'delete-region',
  'add-region',
  'resize-region',
  'reset',
  'done',
])

// ============================================================================
// State
// ============================================================================

const svgRef = ref(null)
const selectedIndex = ref(null) // Selected region index (click to select)
const isDrawModeActive = ref(false)
const isDrawing = ref(false)
const drawStart = ref(null)
const drawRect = ref(null)

// Text input dialog state
const showTextDialog = ref(false)
const pendingBounds = ref(null)
const newRegionText = ref('')

// Resize state
const isResizing = ref(false)
const resizeHandle = ref(null) // 'nw', 'ne', 'sw', 'se'
const resizeStart = ref(null)
const resizeOriginalBounds = ref(null)

// ============================================================================
// Computed
// ============================================================================

const hasValidDimensions = computed(() => {
  return props.imageDimensions.width > 0 && props.imageDimensions.height > 0
})

// ============================================================================
// Coordinate Transformation
// ============================================================================

/**
 * Convert mouse event coordinates to image coordinates
 */
const getImageCoords = (e) => {
  if (!svgRef.value) return { x: 0, y: 0 }

  const svg = svgRef.value
  const rect = svg.getBoundingClientRect()
  const scaleX = props.imageDimensions.width / rect.width
  const scaleY = props.imageDimensions.height / rect.height

  return {
    x: Math.max(0, Math.min(props.imageDimensions.width, (e.clientX - rect.left) * scaleX)),
    y: Math.max(0, Math.min(props.imageDimensions.height, (e.clientY - rect.top) * scaleY)),
  }
}

// ============================================================================
// Region Interactions (Selection-based)
// ============================================================================

/**
 * Select a region by clicking on it
 */
const onRegionClick = (index, e) => {
  if (isDrawModeActive.value) return
  e.stopPropagation()
  selectedIndex.value = index
}

/**
 * Deselect region when clicking on empty area
 */
const onBackgroundClick = () => {
  if (isDrawModeActive.value) return
  if (!isResizing.value) {
    selectedIndex.value = null
  }
}

/**
 * Delete the currently selected region
 */
const onDeleteClick = (e) => {
  e.stopPropagation()
  if (selectedIndex.value !== null) {
    emit('delete-region', selectedIndex.value)
    selectedIndex.value = null
  }
}

/**
 * Get delete button position (center of region)
 */
const getDeleteButtonCenter = (region) => {
  return {
    x: region.bounds.x + region.bounds.width / 2,
    y: region.bounds.y + region.bounds.height / 2,
  }
}

// ============================================================================
// Drawing Tool
// ============================================================================

const toggleDrawMode = () => {
  isDrawModeActive.value = !isDrawModeActive.value
  if (!isDrawModeActive.value) {
    // Reset drawing state when exiting draw mode
    isDrawing.value = false
    drawStart.value = null
    drawRect.value = null
  }
  // Deselect when entering draw mode
  if (isDrawModeActive.value) {
    selectedIndex.value = null
  }
}

const onMouseDown = (e) => {
  if (!isDrawModeActive.value) return

  const coords = getImageCoords(e)
  drawStart.value = coords
  isDrawing.value = true
}

const onMouseMove = (e) => {
  const current = getImageCoords(e)

  // Handle resize
  if (isResizing.value) {
    handleResizeMove(current)
    return
  }

  // Handle drawing
  if (!isDrawing.value || !drawStart.value) return
  drawRect.value = {
    x: Math.min(drawStart.value.x, current.x),
    y: Math.min(drawStart.value.y, current.y),
    width: Math.abs(current.x - drawStart.value.x),
    height: Math.abs(current.y - drawStart.value.y),
  }
}

const onMouseUp = () => {
  if (isResizing.value) {
    finishResize()
    return
  }
  finishDrawing()
}

const finishDrawing = () => {
  if (!isDrawing.value || !drawRect.value) {
    isDrawing.value = false
    drawStart.value = null
    drawRect.value = null
    return
  }

  // Minimum size check (10x10 pixels in image coordinates)
  if (drawRect.value.width >= 10 && drawRect.value.height >= 10) {
    // Show text input dialog
    pendingBounds.value = { ...drawRect.value }
    showTextDialog.value = true
  }

  isDrawing.value = false
  drawStart.value = null
  drawRect.value = null
}

// ============================================================================
// Touch Events for Drawing
// ============================================================================

/**
 * Convert touch event to image coordinates
 */
const getTouchImageCoords = (touch) => {
  if (!svgRef.value) return { x: 0, y: 0 }

  const svg = svgRef.value
  const rect = svg.getBoundingClientRect()
  const scaleX = props.imageDimensions.width / rect.width
  const scaleY = props.imageDimensions.height / rect.height

  return {
    x: Math.max(0, Math.min(props.imageDimensions.width, (touch.clientX - rect.left) * scaleX)),
    y: Math.max(0, Math.min(props.imageDimensions.height, (touch.clientY - rect.top) * scaleY)),
  }
}

const onTouchStart = (e) => {
  if (!isDrawModeActive.value) return
  if (e.touches.length !== 1) return // Only single touch for drawing

  e.preventDefault()
  const coords = getTouchImageCoords(e.touches[0])
  drawStart.value = coords
  isDrawing.value = true
}

const onTouchMove = (e) => {
  if (e.touches.length !== 1) return

  const current = getTouchImageCoords(e.touches[0])

  // Handle resize
  if (isResizing.value) {
    e.preventDefault()
    handleResizeMove(current)
    return
  }

  // Handle drawing
  if (!isDrawing.value || !drawStart.value) return
  e.preventDefault()
  drawRect.value = {
    x: Math.min(drawStart.value.x, current.x),
    y: Math.min(drawStart.value.y, current.y),
    width: Math.abs(current.x - drawStart.value.x),
    height: Math.abs(current.y - drawStart.value.y),
  }
}

const onTouchEnd = (e) => {
  // Handle resize end
  if (isResizing.value) {
    e.preventDefault()
    finishResize()
    return
  }

  // Handle draw end
  if (!isDrawing.value) return
  e.preventDefault()
  finishDrawing()
}

// ============================================================================
// Resize Handles
// ============================================================================

/**
 * Get resize handle positions for a region
 */
const getResizeHandles = (region) => {
  const { x, y, width, height } = region.bounds
  return {
    nw: { x, y },
    ne: { x: x + width, y },
    sw: { x, y: y + height },
    se: { x: x + width, y: y + height },
  }
}

/**
 * Start resizing the selected region
 */
const onResizeStart = (handle, e) => {
  e.stopPropagation()
  e.preventDefault()

  if (selectedIndex.value === null) return
  const region = props.regions[selectedIndex.value]
  if (!region) return

  isResizing.value = true
  resizeHandle.value = handle
  resizeStart.value = getImageCoords(e)
  resizeOriginalBounds.value = { ...region.bounds }
}

/**
 * Handle resize move (called from main mousemove)
 */
const handleResizeMove = (coords) => {
  if (!isResizing.value || !resizeOriginalBounds.value || selectedIndex.value === null) return

  const orig = resizeOriginalBounds.value
  const handle = resizeHandle.value
  let newBounds = { ...orig }

  // Calculate new bounds based on which handle is being dragged
  if (handle === 'nw') {
    newBounds.x = Math.min(coords.x, orig.x + orig.width - 10)
    newBounds.y = Math.min(coords.y, orig.y + orig.height - 10)
    newBounds.width = orig.x + orig.width - newBounds.x
    newBounds.height = orig.y + orig.height - newBounds.y
  } else if (handle === 'ne') {
    newBounds.y = Math.min(coords.y, orig.y + orig.height - 10)
    newBounds.width = Math.max(10, coords.x - orig.x)
    newBounds.height = orig.y + orig.height - newBounds.y
  } else if (handle === 'sw') {
    newBounds.x = Math.min(coords.x, orig.x + orig.width - 10)
    newBounds.width = orig.x + orig.width - newBounds.x
    newBounds.height = Math.max(10, coords.y - orig.y)
  } else if (handle === 'se') {
    newBounds.width = Math.max(10, coords.x - orig.x)
    newBounds.height = Math.max(10, coords.y - orig.y)
  }

  // Constrain to image bounds
  newBounds.x = Math.max(0, newBounds.x)
  newBounds.y = Math.max(0, newBounds.y)
  newBounds.width = Math.min(newBounds.width, props.imageDimensions.width - newBounds.x)
  newBounds.height = Math.min(newBounds.height, props.imageDimensions.height - newBounds.y)

  // Emit resize event for real-time preview
  emit('resize-region', { index: selectedIndex.value, bounds: newBounds })
}

/**
 * Finish resizing
 */
const finishResize = () => {
  isResizing.value = false
  resizeHandle.value = null
  resizeStart.value = null
  resizeOriginalBounds.value = null
}

/**
 * Handle resize touch start
 */
const onResizeTouchStart = (handle, e) => {
  if (e.touches.length !== 1) return
  e.stopPropagation()
  e.preventDefault()

  if (selectedIndex.value === null) return
  const region = props.regions[selectedIndex.value]
  if (!region) return

  isResizing.value = true
  resizeHandle.value = handle
  resizeStart.value = getTouchImageCoords(e.touches[0])
  resizeOriginalBounds.value = { ...region.bounds }
}

// ============================================================================
// Text Input Dialog
// ============================================================================

const confirmNewRegion = () => {
  if (pendingBounds.value) {
    emit('add-region', { bounds: pendingBounds.value, text: newRegionText.value.trim() })
  }
  cancelTextDialog()
}

const skipTextInput = () => {
  if (pendingBounds.value) {
    emit('add-region', { bounds: pendingBounds.value, text: '' })
  }
  cancelTextDialog()
}

const cancelTextDialog = () => {
  showTextDialog.value = false
  pendingBounds.value = null
  newRegionText.value = ''
}

// ============================================================================
// Toolbar Actions
// ============================================================================

const onDone = () => {
  isDrawModeActive.value = false
  emit('done')
}

const onReset = () => {
  isDrawModeActive.value = false
  selectedIndex.value = null
  emit('reset')
}

// ============================================================================
// Keyboard Shortcuts
// ============================================================================

const handleKeydown = (e) => {
  if (e.key === 'Escape') {
    if (showTextDialog.value) {
      cancelTextDialog()
    } else if (isDrawModeActive.value) {
      toggleDrawMode()
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get region color based on recognition source
 */
const getRegionColor = (region) => {
  if (region.recognitionSource === 'manual') {
    return {
      fill: 'rgba(168, 85, 247, 0.2)', // Purple for manual
      stroke: 'rgba(168, 85, 247, 0.9)',
    }
  }
  if (region.recognitionSource === 'tesseract') {
    return {
      fill: 'rgba(234, 179, 8, 0.2)', // Yellow for tesseract
      stroke: 'rgba(234, 179, 8, 0.9)',
    }
  }
  if (region.recognitionFailed) {
    return {
      fill: 'rgba(239, 68, 68, 0.2)', // Red for failed
      stroke: 'rgba(239, 68, 68, 0.9)',
    }
  }
  return {
    fill: 'rgba(16, 185, 129, 0.2)', // Green for paddle
    stroke: 'rgba(16, 185, 129, 0.9)',
  }
}
</script>

<template>
  <div class="ocr-region-editor">
    <!-- Editing Toolbar -->
    <div class="edit-toolbar" :class="{ 'pointer-events-none opacity-70': isReprocessing }">
      <button
        @click="onDone"
        class="toolbar-btn toolbar-btn-primary"
        :disabled="isReprocessing"
      >
        <svg v-if="isReprocessing" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
        {{ t('slideToPptx.regionEditor.done') }}
      </button>

      <button
        @click="onReset"
        class="toolbar-btn"
        :disabled="!isEdited"
        :class="{ 'opacity-50 cursor-not-allowed': !isEdited }"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        {{ t('slideToPptx.regionEditor.reset') }}
      </button>

      <button
        @click="toggleDrawMode"
        class="toolbar-btn"
        :class="{ 'toolbar-btn-active': isDrawModeActive }"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        {{ isDrawModeActive ? t('slideToPptx.regionEditor.drawing') : t('slideToPptx.regionEditor.drawRect') }}
      </button>

      <!-- Region count indicator -->
      <span class="region-count">
        {{ t('slideToPptx.regionEditor.regionCount', { count: regions.length }) }}
      </span>
    </div>

    <!-- Hint text -->
    <div class="edit-hint" v-if="!isDrawModeActive && selectedIndex === null">
      {{ t('slideToPptx.regionEditor.hint') }}
    </div>
    <div class="edit-hint" v-else-if="isDrawModeActive">
      {{ t('slideToPptx.regionEditor.drawHint') }}
    </div>
    <div class="edit-hint" v-else-if="selectedIndex !== null">
      {{ t('slideToPptx.regionEditor.selectedHint') }}
    </div>

    <!-- SVG Overlay for region editing -->
    <svg
      v-if="hasValidDimensions"
      ref="svgRef"
      class="edit-overlay-svg"
      :class="{ 'cursor-crosshair': isDrawModeActive }"
      :viewBox="`0 0 ${imageDimensions.width} ${imageDimensions.height}`"
      preserveAspectRatio="none"
      @click="onBackgroundClick"
      @mousedown="onMouseDown"
      @mousemove="onMouseMove"
      @mouseup="onMouseUp"
      @mouseleave="onMouseUp"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
    >
      <!-- All regions (unselected) -->
      <g
        v-for="(region, idx) in regions"
        :key="`region-${idx}`"
        @click.stop="onRegionClick(idx, $event)"
        class="region-group"
        :class="{ 'region-selected': selectedIndex === idx }"
      >
        <!-- Region rectangle -->
        <rect
          :x="region.bounds.x"
          :y="region.bounds.y"
          :width="region.bounds.width"
          :height="region.bounds.height"
          :fill="selectedIndex === idx ? 'rgba(59, 130, 246, 0.2)' : getRegionColor(region).fill"
          :stroke="selectedIndex === idx ? 'rgba(59, 130, 246, 0.9)' : getRegionColor(region).stroke"
          stroke-width="2"
          vector-effect="non-scaling-stroke"
          class="region-rect"
        />
      </g>

      <!-- Selected region controls (rendered on top) -->
      <g v-if="selectedIndex !== null && regions[selectedIndex] && !isDrawModeActive">
        <!-- Resize handles at corners -->
        <g
          v-for="(pos, handle) in getResizeHandles(regions[selectedIndex])"
          :key="`handle-${handle}`"
          @mousedown.stop="onResizeStart(handle, $event)"
          @touchstart.stop="onResizeTouchStart(handle, $event)"
          class="resize-handle"
          :class="`resize-handle-${handle}`"
        >
          <!-- Larger transparent hit area -->
          <circle
            :cx="pos.x"
            :cy="pos.y"
            r="16"
            fill="transparent"
          />
          <!-- Visible handle -->
          <circle
            :cx="pos.x"
            :cy="pos.y"
            r="8"
            fill="white"
            stroke="rgba(59, 130, 246, 0.9)"
            stroke-width="2"
            vector-effect="non-scaling-stroke"
          />
        </g>

        <!-- Delete button at center -->
        <g
          class="delete-button-group"
          @click.stop="onDeleteClick($event)"
        >
          <!-- Larger transparent hit area -->
          <circle
            :cx="getDeleteButtonCenter(regions[selectedIndex]).x"
            :cy="getDeleteButtonCenter(regions[selectedIndex]).y"
            r="24"
            fill="transparent"
          />
          <!-- Visible button -->
          <circle
            :cx="getDeleteButtonCenter(regions[selectedIndex]).x"
            :cy="getDeleteButtonCenter(regions[selectedIndex]).y"
            r="16"
            fill="rgba(239, 68, 68, 0.9)"
          />
          <text
            :x="getDeleteButtonCenter(regions[selectedIndex]).x"
            :y="getDeleteButtonCenter(regions[selectedIndex]).y"
            text-anchor="middle"
            dominant-baseline="central"
            fill="white"
            font-size="20"
            font-weight="bold"
            class="delete-button-text"
          >×</text>
        </g>
      </g>

      <!-- Drawing preview -->
      <rect
        v-if="isDrawing && drawRect"
        :x="drawRect.x"
        :y="drawRect.y"
        :width="drawRect.width"
        :height="drawRect.height"
        fill="rgba(168, 85, 247, 0.2)"
        stroke="rgba(168, 85, 247, 0.9)"
        stroke-width="2"
        stroke-dasharray="6 3"
        vector-effect="non-scaling-stroke"
      />
    </svg>

    <!-- Text Input Dialog -->
    <Teleport to="body">
      <div
        v-if="showTextDialog"
        class="text-dialog-overlay"
        @click.self="cancelTextDialog"
      >
        <div class="text-dialog">
          <h3 class="text-dialog-title">
            {{ t('slideToPptx.regionEditor.addRegion') }}
          </h3>
          <p class="text-dialog-hint">
            {{ t('slideToPptx.regionEditor.textHint') }}
          </p>
          <input
            v-model="newRegionText"
            type="text"
            class="text-dialog-input"
            :placeholder="t('slideToPptx.regionEditor.textPlaceholder')"
            @keydown.enter="confirmNewRegion"
            @keydown.esc="cancelTextDialog"
            autofocus
          />
          <div class="text-dialog-actions">
            <button @click="skipTextInput" class="dialog-btn dialog-btn-secondary">
              {{ t('slideToPptx.regionEditor.skip') }}
            </button>
            <button @click="confirmNewRegion" class="dialog-btn dialog-btn-primary">
              {{ t('slideToPptx.regionEditor.add') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.ocr-region-editor {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

/* Toolbar */
.edit-toolbar {
  position: absolute;
  top: 1rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 30;
  display: flex;
  gap: 0.5rem;
  align-items: center;
  padding: 0.5rem;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(8px);
  border-radius: 0.75rem;
  pointer-events: auto;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-secondary);
  background: transparent;
  border: 1px solid var(--color-border-muted);
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.toolbar-btn:hover:not(:disabled) {
  color: var(--color-text-primary);
  background: rgba(255, 255, 255, 0.1);
}

.toolbar-btn-primary {
  color: white;
  background: var(--color-brand-primary);
  border-color: var(--color-brand-primary);
}

.toolbar-btn-primary:hover {
  filter: brightness(1.1);
}

.toolbar-btn-active {
  color: white;
  background: rgba(168, 85, 247, 0.8);
  border-color: rgba(168, 85, 247, 0.8);
}

.region-count {
  padding: 0 0.5rem;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

/* Hint text */
.edit-hint {
  position: absolute;
  top: 4rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 25;
  padding: 0.5rem 1rem;
  font-size: 0.75rem;
  color: var(--color-text-muted);
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  border-radius: 0.5rem;
  pointer-events: none;
  white-space: nowrap;
}

/* SVG Overlay */
.edit-overlay-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: auto;
}

.cursor-crosshair {
  cursor: crosshair;
}

/* Region styling */
.region-group {
  cursor: pointer;
}

.region-rect {
  transition: fill 0.15s ease, stroke 0.15s ease;
}

.region-selected .region-rect {
  cursor: move;
}

/* Resize handles */
.resize-handle {
  cursor: pointer;
}

.resize-handle-nw {
  cursor: nwse-resize;
}

.resize-handle-ne {
  cursor: nesw-resize;
}

.resize-handle-sw {
  cursor: nesw-resize;
}

.resize-handle-se {
  cursor: nwse-resize;
}

/* Delete button */
.delete-button-group {
  cursor: pointer;
}

.delete-button-text {
  pointer-events: none;
  user-select: none;
}

/* Text Dialog */
.text-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
}

.text-dialog {
  width: 90%;
  max-width: 400px;
  padding: 1.5rem;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-muted);
  border-radius: 1rem;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}

.text-dialog-title {
  margin: 0 0 0.5rem;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-text-primary);
}

.text-dialog-hint {
  margin: 0 0 1rem;
  font-size: 0.875rem;
  color: var(--color-text-muted);
}

.text-dialog-input {
  width: 100%;
  padding: 0.75rem;
  font-size: 1rem;
  color: var(--color-text-primary);
  background: var(--color-bg-muted);
  border: 1px solid var(--color-border-muted);
  border-radius: 0.5rem;
  outline: none;
  transition: border-color 0.15s ease;
}

.text-dialog-input:focus {
  border-color: var(--color-brand-primary);
}

.text-dialog-actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 1rem;
  justify-content: flex-end;
}

.dialog-btn {
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.dialog-btn-secondary {
  color: var(--color-text-secondary);
  background: transparent;
  border: 1px solid var(--color-border-muted);
}

.dialog-btn-secondary:hover {
  background: rgba(255, 255, 255, 0.1);
}

.dialog-btn-primary {
  color: white;
  background: var(--color-brand-primary);
  border: 1px solid var(--color-brand-primary);
}

.dialog-btn-primary:hover {
  filter: brightness(1.1);
}
</style>
