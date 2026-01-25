<script setup>
/**
 * OCR Region Editor Component
 *
 * Allows users to manually edit OCR detection regions:
 * - Delete existing regions (hover + click delete button)
 * - Draw new regions (rectangle drawing tool)
 * - Optional text input for new regions
 *
 * Refactored to use specialized composables for each tool.
 */

import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'

// Composables
import { useRegionEditorCore } from '@/composables/useRegionEditorCore'
import { useMagnifier } from '@/composables/useMagnifier'
import { useToolbarDrag } from '@/composables/useToolbarDrag'
import { useTextDialog } from '@/composables/useTextDialog'
import { useDeleteTool } from '@/composables/useDeleteTool'
import { useDrawTool } from '@/composables/useDrawTool'
import { useSeparatorTool } from '@/composables/useSeparatorTool'
import { useSelectionTool } from '@/composables/useSelectionTool'
import { useResizeTool } from '@/composables/useResizeTool'
import { useEditorKeyboard } from '@/composables/useEditorKeyboard'
import ConfirmModal from '@/components/ConfirmModal.vue'

const { t } = useI18n()

// Confirm modal ref
const confirmModalRef = ref(null)

const props = defineProps({
  // Regions to display and edit
  regions: {
    type: Array,
    default: () => [],
  },
  // Separator lines to prevent region merging
  separatorLines: {
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
  // Image URL for magnifier
  imageUrl: {
    type: String,
    default: '',
  },
  // Undo/Redo availability
  canUndo: {
    type: Boolean,
    default: false,
  },
  canRedo: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits([
  'delete-region',
  'delete-regions-batch',
  'add-region',
  'resize-region',
  'toggle-polygon-mode',
  'move-vertex',
  'reset',
  'done',
  'add-separator',
  'delete-separator',
  'undo',
  'redo',
])

// ============================================================================
// Refs
// ============================================================================

const svgRef = ref(null)
const toolbarRef = ref(null)

// ============================================================================
// Core Utilities
// ============================================================================

const core = useRegionEditorCore({
  svgRef,
  imageDimensions: computed(() => props.imageDimensions),
})

// ============================================================================
// Magnifier
// ============================================================================

const magnifier = useMagnifier({
  imageUrl: computed(() => props.imageUrl),
  imageDimensions: computed(() => props.imageDimensions),
})

// ============================================================================
// Toolbar Drag
// ============================================================================

const toolbar = useToolbarDrag({
  toolbarRef,
})

// ============================================================================
// Mode Coordination
// ============================================================================

/**
 * Exit all active modes (called when entering a new mode)
 */
const exitAllModes = () => {
  drawTool.toggleDrawMode(false)
  separatorTool.toggleSeparatorMode(false)
  selectionTool.toggleSelectionMode(false)
  deleteTool.clearSelection()
  separatorTool.clearSelection()
}

// ============================================================================
// Text Dialog
// ============================================================================

const textDialog = useTextDialog({
  onConfirm: (bounds, text) => {
    emit('add-region', { bounds, text })
  },
})

// ============================================================================
// Delete Tool
// ============================================================================

const deleteTool = useDeleteTool({
  onDelete: (index) => {
    emit('delete-region', index)
  },
  isDrawModeActive: () => drawTool.isDrawModeActive.value,
  exitOtherModes: exitAllModes,
})

// ============================================================================
// Draw Tool
// ============================================================================

const drawTool = useDrawTool({
  getImageCoords: core.getImageCoords,
  getTouchImageCoords: core.getTouchImageCoords,
  onDrawComplete: (bounds) => {
    textDialog.openDialog(bounds)
  },
  onModeEnter: () => {
    deleteTool.clearSelection()
    separatorTool.toggleSeparatorMode(false)
    selectionTool.toggleSelectionMode(false)
    separatorTool.clearSelection()
  },
  onModeExit: () => {},
})

// ============================================================================
// Separator Tool
// ============================================================================

const separatorTool = useSeparatorTool({
  getImageCoords: core.getImageCoords,
  onAddSeparator: (line) => {
    emit('add-separator', line)
  },
  onDeleteSeparator: (id) => {
    emit('delete-separator', id)
  },
  onModeEnter: () => {
    drawTool.toggleDrawMode(false)
    selectionTool.toggleSelectionMode(false)
    deleteTool.clearSelection()
    separatorTool.clearSelection()
  },
  onModeExit: () => {},
})

// ============================================================================
// Selection Tool
// ============================================================================

const selectionTool = useSelectionTool({
  getImageCoords: core.getImageCoords,
  getTouchImageCoords: core.getTouchImageCoords,
  getRegions: () => props.regions,
  rectsIntersect: core.rectsIntersect,
  onBatchDelete: (indices) => {
    emit('delete-regions-batch', indices)
  },
  onModeEnter: () => {
    drawTool.toggleDrawMode(false)
    separatorTool.toggleSeparatorMode(false)
    deleteTool.clearSelection()
    separatorTool.clearSelection()
  },
  onModeExit: () => {},
})

// ============================================================================
// Resize Tool
// ============================================================================

const resizeTool = useResizeTool({
  getImageCoords: core.getImageCoords,
  getTouchImageCoords: core.getTouchImageCoords,
  getSelectedRegion: () => {
    const idx = deleteTool.selectedIndex.value
    return idx !== null ? props.regions[idx] : null
  },
  getSelectedIndex: () => deleteTool.selectedIndex.value,
  getImageDimensions: () => props.imageDimensions,
  onResize: ({ index, bounds, polygon }) => {
    emit('resize-region', { index, bounds, polygon })
  },
  onMoveVertex: ({ index, polygon }) => {
    emit('move-vertex', { index, polygon })
  },
  onVertexInvalid: () => {
    // Toast handled by parent or inline hint
  },
  isValidQuad: core.isValidQuad,
  onMagnifierShow: magnifier.show,
  onMagnifierUpdate: magnifier.updateTarget,
  onMagnifierHide: magnifier.hide,
})

// ============================================================================
// Keyboard Shortcuts
// ============================================================================

const onUndo = () => {
  if (props.canUndo) {
    emit('undo')
    deleteTool.clearSelection()
    separatorTool.clearSelection()
  }
}

const onRedo = () => {
  if (props.canRedo) {
    emit('redo')
    deleteTool.clearSelection()
    separatorTool.clearSelection()
  }
}

useEditorKeyboard({
  onUndo,
  onRedo,
  canUndo: () => props.canUndo,
  canRedo: () => props.canRedo,
  isTextDialogOpen: () => textDialog.showTextDialog.value,
  cancelTextDialog: textDialog.cancelTextDialog,
  hasPendingSelection: () => selectionTool.hasPendingSelection.value,
  cancelSelection: selectionTool.cancelSelection,
  isSelectionModeActive: () => selectionTool.isSelectionModeActive.value,
  toggleSelectionMode: selectionTool.toggleSelectionMode,
  isSeparatorModeActive: () => separatorTool.isSeparatorModeActive.value,
  isSeparatorDrawing: () => separatorTool.separatorFirstPoint.value !== null,
  cancelSeparatorDrawing: separatorTool.cancelDrawing,
  toggleSeparatorMode: separatorTool.toggleSeparatorMode,
  isDrawModeActive: () => drawTool.isDrawModeActive.value,
  toggleDrawMode: drawTool.toggleDrawMode,
  hasSelectedSeparator: () => separatorTool.selectedSeparatorId.value !== null,
  getSelectedSeparatorId: () => separatorTool.selectedSeparatorId.value,
  deleteSeparator: (id) => {
    emit('delete-separator', id)
    separatorTool.clearSelection()
  },
})

// ============================================================================
// Event Handlers
// ============================================================================

/**
 * Handle background click (deselect or separator click)
 */
const onBackgroundClick = (e) => {
  if (separatorTool.isSeparatorModeActive.value) {
    separatorTool.onSeparatorClick(e)
    return
  }

  if (drawTool.isDrawModeActive.value) return
  if (!resizeTool.isResizing.value) {
    deleteTool.clearSelection()
    separatorTool.clearSelection()
  }
}

/**
 * Handle mouse down on SVG
 */
const onMouseDown = (e) => {
  if (selectionTool.onMouseDown(e)) return
  if (drawTool.onMouseDown(e)) return
}

/**
 * Handle mouse move on SVG
 */
const onMouseMove = (e) => {
  const current = core.getImageCoords(e)

  if (selectionTool.onMouseMove(e)) return

  if (resizeTool.isResizing.value) {
    resizeTool.handleResizeMove(current)
    magnifier.updateTarget(current)
    return
  }

  if (separatorTool.isSeparatorModeActive.value) {
    separatorTool.updateSeparatorPreview(current)
    return
  }

  if (drawTool.onMouseMove(e)) return
}

/**
 * Handle mouse up on SVG
 */
const onMouseUp = () => {
  if (selectionTool.onMouseUp()) return

  if (resizeTool.isResizing.value) {
    resizeTool.finishResize()
    return
  }

  drawTool.onMouseUp()
}

/**
 * Handle touch start on SVG
 */
const onTouchStart = (e) => {
  if (selectionTool.onTouchStart(e)) return
  if (drawTool.onTouchStart(e)) return
}

/**
 * Handle touch move on SVG
 */
const onTouchMove = (e) => {
  if (e.touches.length !== 1) return

  const current = core.getTouchImageCoords(e.touches[0])

  if (resizeTool.onResizeTouchMove(e)) {
    magnifier.updateTarget(current)
    return
  }

  if (separatorTool.isSeparatorModeActive.value) {
    e.preventDefault()
    separatorTool.updateSeparatorPreview(current)
    return
  }

  if (selectionTool.onTouchMove(e)) return
  if (drawTool.onTouchMove(e)) return
}

/**
 * Handle touch end on SVG
 */
const onTouchEnd = (e) => {
  if (resizeTool.onResizeTouchEnd(e)) return
  if (selectionTool.onTouchEnd(e)) return
  if (drawTool.onTouchEnd(e)) return
}

// ============================================================================
// Toolbar Actions
// ============================================================================

const onToggleTrapezoid = () => {
  const idx = deleteTool.selectedIndex.value
  if (idx === null) return
  emit('toggle-polygon-mode', idx)
}

const onDone = () => {
  drawTool.toggleDrawMode(false)
  emit('done')
}

const onReset = async () => {
  const confirmed = await confirmModalRef.value?.show({
    title: t('slideToPptx.regionEditor.resetTitle'),
    message: t('slideToPptx.regionEditor.confirmReset'),
  })
  if (!confirmed) return
  drawTool.toggleDrawMode(false)
  deleteTool.clearSelection()
  emit('reset')
}

// ============================================================================
// Expose for Parent Component
// ============================================================================

defineExpose({
  selectRegion: (index) => deleteTool.selectRegion(index, props.regions.length),
})
</script>

<template>
  <div class="ocr-region-editor">
    <!-- Draggable Toolbar (Teleported to body to escape image transform context) -->
    <Teleport to="body">
      <div
        v-if="core.hasValidDimensions.value"
        ref="toolbarRef"
        class="edit-toolbar"
        :class="{ 'pointer-events-none opacity-70': isReprocessing }"
        :style="{ left: `${toolbar.toolbarPos.value.x}px`, top: `${toolbar.toolbarPos.value.y}px`, transform: 'none' }"
        @mousedown="toolbar.onToolbarMouseDown"
        @touchstart="toolbar.onToolbarTouchStart"
      >
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
          <span class="hidden sm:inline">{{ t('slideToPptx.regionEditor.done') }}</span>
        </button>

        <!-- Undo button -->
        <button
          @click="onUndo"
          class="toolbar-btn toolbar-btn-icon"
          :disabled="!canUndo"
          :class="{ 'opacity-50 cursor-not-allowed': !canUndo }"
          :title="t('slideToPptx.regionEditor.undo') + ' (Ctrl+Z)'"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
        </button>

        <!-- Redo button -->
        <button
          @click="onRedo"
          class="toolbar-btn toolbar-btn-icon"
          :disabled="!canRedo"
          :class="{ 'opacity-50 cursor-not-allowed': !canRedo }"
          :title="t('slideToPptx.regionEditor.redo') + ' (Ctrl+Shift+Z)'"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
          </svg>
        </button>

        <span class="toolbar-divider"></span>

        <button
          @click="onReset"
          class="toolbar-btn"
          :disabled="!isEdited"
          :class="{ 'opacity-50 cursor-not-allowed': !isEdited }"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span class="hidden sm:inline">{{ t('slideToPptx.regionEditor.reset') }}</span>
        </button>

        <button
          @click="drawTool.toggleDrawMode()"
          class="toolbar-btn"
          :class="{ 'toolbar-btn-active': drawTool.isDrawModeActive.value }"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          <span class="hidden sm:inline">{{ drawTool.isDrawModeActive.value ? t('slideToPptx.regionEditor.drawing') : t('slideToPptx.regionEditor.drawRect') }}</span>
        </button>

        <!-- Separator line tool -->
        <button
          @click="separatorTool.toggleSeparatorMode()"
          class="toolbar-btn"
          :class="{ 'toolbar-btn-separator': separatorTool.isSeparatorModeActive.value }"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 20L20 4" />
          </svg>
          <span class="hidden sm:inline">{{ separatorTool.isSeparatorModeActive.value
            ? (separatorTool.separatorFirstPoint.value ? t('slideToPptx.regionEditor.separatorDrawing') : t('slideToPptx.regionEditor.separator'))
            : t('slideToPptx.regionEditor.separator') }}</span>
        </button>

        <!-- Selection tool for batch delete -->
        <button
          @click="selectionTool.toggleSelectionMode()"
          class="toolbar-btn"
          :class="{ 'toolbar-btn-selection': selectionTool.isSelectionModeActive.value }"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h4a1 1 0 010 2H5a1 1 0 01-1-1zM4 13a1 1 0 011-1h4a1 1 0 010 2H5a1 1 0 01-1-1zM15 4a1 1 0 100 2h4a1 1 0 100-2h-4zM15 12a1 1 0 100 2h4a1 1 0 100-2h-4zM4 19a1 1 0 011-1h14a1 1 0 110 2H5a1 1 0 01-1-1z" />
          </svg>
          <span class="hidden sm:inline">{{ t('slideToPptx.regionEditor.selectArea') }}</span>
        </button>

        <!-- Trapezoid mode toggle (visible when a region is selected) -->
        <button
          v-if="deleteTool.selectedIndex.value !== null && regions[deleteTool.selectedIndex.value]"
          @click.stop="onToggleTrapezoid"
          class="toolbar-btn"
          :class="{ 'toolbar-btn-trapezoid': regions[deleteTool.selectedIndex.value]?.isPolygonMode }"
          :title="regions[deleteTool.selectedIndex.value]?.isPolygonMode
            ? t('slideToPptx.regionEditor.trapezoidRevert')
            : t('slideToPptx.regionEditor.trapezoid')"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18h12L21 6H3l3 12z" />
          </svg>
          <span class="hidden sm:inline">{{
            regions[deleteTool.selectedIndex.value]?.isPolygonMode
              ? t('slideToPptx.regionEditor.trapezoidRevert')
              : t('slideToPptx.regionEditor.trapezoid')
          }}</span>
        </button>

        <!-- Region count indicator -->
        <span class="region-count">
          <!-- Mobile: short format -->
          <span class="sm:hidden">
            {{ regions.length }}<template v-if="separatorLines.length > 0"> · {{ separatorLines.length }}</template>
          </span>
          <!-- Desktop: full format -->
          <span class="hidden sm:inline">
            {{ t('slideToPptx.regionEditor.regionCount', { count: regions.length }) }}
            <template v-if="separatorLines.length > 0">
              · {{ t('slideToPptx.regionEditor.separatorCount', { count: separatorLines.length }) }}
            </template>
          </span>
        </span>

        <!-- Drag handle -->
        <span class="drag-handle" :title="t('slideToPptx.regionEditor.dragHint')">
          <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
            <circle cx="2" cy="2" r="1.5" opacity="0.5"/>
            <circle cx="8" cy="2" r="1.5" opacity="0.5"/>
            <circle cx="2" cy="8" r="1.5" opacity="0.5"/>
            <circle cx="8" cy="8" r="1.5" opacity="0.5"/>
            <circle cx="2" cy="14" r="1.5" opacity="0.5"/>
            <circle cx="8" cy="14" r="1.5" opacity="0.5"/>
          </svg>
        </span>

        <!-- Hint text (Attached to toolbar) -->
        <div class="edit-hint" v-if="selectionTool.isSelectionModeActive.value && selectionTool.selectedRegionIndices.value.length > 0">
          {{ t('slideToPptx.regionEditor.selectionConfirm', { count: selectionTool.selectedRegionIndices.value.length }) }}
        </div>
        <div class="edit-hint" v-else-if="selectionTool.isSelectionModeActive.value">
          {{ t('slideToPptx.regionEditor.selectionHint') }}
        </div>
        <div class="edit-hint" v-else-if="separatorTool.isSeparatorModeActive.value">
          {{ separatorTool.separatorFirstPoint.value ? t('slideToPptx.regionEditor.separatorDrawing') : t('slideToPptx.regionEditor.separatorHint') }}
        </div>
        <div class="edit-hint" v-else-if="separatorTool.selectedSeparatorId.value !== null">
          {{ t('slideToPptx.regionEditor.separatorSelectedHint') }}
        </div>
        <div class="edit-hint" v-else-if="drawTool.isDrawModeActive.value">
          {{ t('slideToPptx.regionEditor.drawHint') }}
        </div>
        <div class="edit-hint" v-else-if="deleteTool.selectedIndex.value !== null && regions[deleteTool.selectedIndex.value]?.isPolygonMode">
          {{ t('slideToPptx.regionEditor.trapezoidHint') }}
        </div>
        <div class="edit-hint" v-else-if="deleteTool.selectedIndex.value !== null">
          {{ t('slideToPptx.regionEditor.selectedHint') }}
        </div>
        <div class="edit-hint" v-else>
          {{ t('slideToPptx.regionEditor.hint') }}
        </div>
      </div>
    </Teleport>

    <!-- SVG Overlay for region editing -->
    <svg
      v-if="core.hasValidDimensions.value"
      ref="svgRef"
      class="edit-overlay-svg"
      :class="{
        'cursor-crosshair': drawTool.isDrawModeActive.value || separatorTool.isSeparatorModeActive.value || selectionTool.isSelectionModeActive.value,
        'pointer-events-auto': drawTool.isDrawModeActive.value || resizeTool.isResizing.value || separatorTool.isSeparatorModeActive.value || selectionTool.isSelectionModeActive.value,
        'pointer-events-none': !drawTool.isDrawModeActive.value && !resizeTool.isResizing.value && !separatorTool.isSeparatorModeActive.value && !selectionTool.isSelectionModeActive.value
      }"
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
        @click.stop="deleteTool.onRegionClick(idx, $event)"
        class="region-group"
        :class="{ 'region-selected': deleteTool.selectedIndex.value === idx }"
        pointer-events="auto"
      >
        <!-- Region shape: polygon for trapezoid mode, rect for normal -->
        <polygon
          v-if="region.isPolygonMode"
          :points="region.polygon.map(p => `${p[0]},${p[1]}`).join(' ')"
          :fill="deleteTool.selectedIndex.value === idx ? 'rgba(59, 130, 246, 0.2)' : core.getRegionColor(region).fill"
          :stroke="deleteTool.selectedIndex.value === idx ? 'rgba(59, 130, 246, 0.9)' : core.getRegionColor(region).stroke"
          stroke-width="2"
          vector-effect="non-scaling-stroke"
          class="region-rect"
        />
        <rect
          v-else
          :x="region.bounds.x"
          :y="region.bounds.y"
          :width="region.bounds.width"
          :height="region.bounds.height"
          :fill="deleteTool.selectedIndex.value === idx ? 'rgba(59, 130, 246, 0.2)' : core.getRegionColor(region).fill"
          :stroke="deleteTool.selectedIndex.value === idx ? 'rgba(59, 130, 246, 0.9)' : core.getRegionColor(region).stroke"
          stroke-width="2"
          vector-effect="non-scaling-stroke"
          class="region-rect"
        />
      </g>

      <!-- Selected region controls (rendered on top) -->
      <g v-if="deleteTool.selectedIndex.value !== null && regions[deleteTool.selectedIndex.value] && !drawTool.isDrawModeActive.value" pointer-events="auto">
        <!-- Polygon mode: purple diamond vertex handles -->
        <template v-if="regions[deleteTool.selectedIndex.value].isPolygonMode">
          <g
            v-for="(pos, handle) in core.getVertexHandles(regions[deleteTool.selectedIndex.value])"
            :key="`vertex-${handle}`"
            @mousedown.stop="resizeTool.onResizeStart(handle, $event)"
            @touchstart.stop="resizeTool.onResizeTouchStart(handle, $event)"
            class="resize-handle vertex-handle"
          >
            <!-- Larger transparent hit area -->
            <circle
              :cx="pos.x"
              :cy="pos.y"
              r="18"
              fill="transparent"
            />
            <!-- Visible diamond handle (rotated square) -->
            <rect
              :x="pos.x - 7"
              :y="pos.y - 7"
              width="14"
              height="14"
              :transform="`rotate(45 ${pos.x} ${pos.y})`"
              fill="white"
              stroke="rgba(168, 85, 247, 0.9)"
              stroke-width="2"
              vector-effect="non-scaling-stroke"
            />
          </g>
        </template>

        <!-- Rectangle mode: blue circle resize handles at corners -->
        <template v-else>
          <g
            v-for="(pos, handle) in core.getResizeHandles(regions[deleteTool.selectedIndex.value])"
            :key="`handle-${handle}`"
            @mousedown.stop="resizeTool.onResizeStart(handle, $event)"
            @touchstart.stop="resizeTool.onResizeTouchStart(handle, $event)"
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
        </template>

        <!-- Delete button at center -->
        <g
          class="delete-button-group"
          @click.stop="deleteTool.onDeleteClick($event)"
        >
          <!-- Larger transparent hit area -->
          <circle
            :cx="core.getDeleteButtonCenter(regions[deleteTool.selectedIndex.value]).x"
            :cy="core.getDeleteButtonCenter(regions[deleteTool.selectedIndex.value]).y"
            :r="core.getDeleteButtonSize(regions[deleteTool.selectedIndex.value]).hitRadius"
            fill="transparent"
          />
          <!-- Visible button -->
          <circle
            :cx="core.getDeleteButtonCenter(regions[deleteTool.selectedIndex.value]).x"
            :cy="core.getDeleteButtonCenter(regions[deleteTool.selectedIndex.value]).y"
            :r="core.getDeleteButtonSize(regions[deleteTool.selectedIndex.value]).radius"
            fill="rgba(239, 68, 68, 0.9)"
          />
          <text
            :x="core.getDeleteButtonCenter(regions[deleteTool.selectedIndex.value]).x"
            :y="core.getDeleteButtonCenter(regions[deleteTool.selectedIndex.value]).y"
            text-anchor="middle"
            dominant-baseline="central"
            fill="white"
            :font-size="core.getDeleteButtonSize(regions[deleteTool.selectedIndex.value]).fontSize"
            font-weight="bold"
            class="delete-button-text"
          >×</text>
        </g>
      </g>

      <!-- Separator lines (existing) -->
      <g
        v-for="sep in separatorLines"
        :key="`sep-${sep.id}`"
        class="separator-group"
        :class="{ 'separator-selected': separatorTool.selectedSeparatorId.value === sep.id }"
        pointer-events="auto"
        @click.stop="separatorTool.onSeparatorClick_Select(sep.id, $event, () => drawTool.isDrawModeActive.value, deleteTool.clearSelection)"
      >
        <!-- Wider transparent hit area for easier clicking -->
        <line
          :x1="sep.start.x"
          :y1="sep.start.y"
          :x2="sep.end.x"
          :y2="sep.end.y"
          stroke="transparent"
          stroke-width="20"
          vector-effect="non-scaling-stroke"
        />
        <!-- Visible separator line -->
        <line
          :x1="sep.start.x"
          :y1="sep.start.y"
          :x2="sep.end.x"
          :y2="sep.end.y"
          :stroke="separatorTool.selectedSeparatorId.value === sep.id ? 'rgba(249, 115, 22, 1)' : 'rgba(249, 115, 22, 0.7)'"
          :stroke-width="separatorTool.selectedSeparatorId.value === sep.id ? '4' : '3'"
          :stroke-dasharray="separatorTool.selectedSeparatorId.value === sep.id ? 'none' : '8 4'"
          vector-effect="non-scaling-stroke"
        />
        <!-- Endpoint circles -->
        <circle
          :cx="sep.start.x"
          :cy="sep.start.y"
          r="6"
          :fill="separatorTool.selectedSeparatorId.value === sep.id ? 'rgba(249, 115, 22, 1)' : 'rgba(249, 115, 22, 0.7)'"
        />
        <circle
          :cx="sep.end.x"
          :cy="sep.end.y"
          r="6"
          :fill="separatorTool.selectedSeparatorId.value === sep.id ? 'rgba(249, 115, 22, 1)' : 'rgba(249, 115, 22, 0.7)'"
        />
      </g>

      <!-- Selected separator delete button -->
      <g
        v-if="separatorTool.selectedSeparatorId.value !== null && separatorLines.find(s => s.id === separatorTool.selectedSeparatorId.value)"
        class="delete-button-group"
        pointer-events="auto"
        @click.stop="separatorTool.onDeleteSeparatorClick($event)"
      >
        <!-- Get the selected separator for positioning -->
        <circle
          :cx="core.getSeparatorMidpoint(separatorLines.find(s => s.id === separatorTool.selectedSeparatorId.value)).x"
          :cy="core.getSeparatorMidpoint(separatorLines.find(s => s.id === separatorTool.selectedSeparatorId.value)).y"
          r="24"
          fill="transparent"
        />
        <circle
          :cx="core.getSeparatorMidpoint(separatorLines.find(s => s.id === separatorTool.selectedSeparatorId.value)).x"
          :cy="core.getSeparatorMidpoint(separatorLines.find(s => s.id === separatorTool.selectedSeparatorId.value)).y"
          r="18"
          fill="rgba(239, 68, 68, 0.9)"
        />
        <text
          :x="core.getSeparatorMidpoint(separatorLines.find(s => s.id === separatorTool.selectedSeparatorId.value)).x"
          :y="core.getSeparatorMidpoint(separatorLines.find(s => s.id === separatorTool.selectedSeparatorId.value)).y"
          text-anchor="middle"
          dominant-baseline="central"
          fill="white"
          font-size="22"
          font-weight="bold"
          class="delete-button-text"
        >×</text>
      </g>

      <!-- Separator preview line (when drawing) -->
      <g v-if="separatorTool.isSeparatorModeActive.value && separatorTool.separatorPreview.value">
        <line
          :x1="separatorTool.separatorPreview.value.start.x"
          :y1="separatorTool.separatorPreview.value.start.y"
          :x2="separatorTool.separatorPreview.value.end.x"
          :y2="separatorTool.separatorPreview.value.end.y"
          stroke="rgba(249, 115, 22, 0.5)"
          stroke-width="3"
          stroke-dasharray="8 4"
          vector-effect="non-scaling-stroke"
        />
        <!-- First point marker -->
        <circle
          :cx="separatorTool.separatorPreview.value.start.x"
          :cy="separatorTool.separatorPreview.value.start.y"
          r="8"
          fill="rgba(249, 115, 22, 0.9)"
          stroke="white"
          stroke-width="2"
        />
      </g>

      <!-- First point marker when starting separator (before preview) -->
      <circle
        v-if="separatorTool.isSeparatorModeActive.value && separatorTool.separatorFirstPoint.value && !separatorTool.separatorPreview.value"
        :cx="separatorTool.separatorFirstPoint.value.x"
        :cy="separatorTool.separatorFirstPoint.value.y"
        r="8"
        fill="rgba(249, 115, 22, 0.9)"
        stroke="white"
        stroke-width="2"
      />

      <!-- Drawing preview -->
      <rect
        v-if="drawTool.isDrawing.value && drawTool.drawRect.value"
        :x="drawTool.drawRect.value.x"
        :y="drawTool.drawRect.value.y"
        :width="drawTool.drawRect.value.width"
        :height="drawTool.drawRect.value.height"
        fill="rgba(168, 85, 247, 0.2)"
        stroke="rgba(168, 85, 247, 0.9)"
        stroke-width="2"
        stroke-dasharray="6 3"
        vector-effect="non-scaling-stroke"
      />

      <!-- Selection box and highlighted regions -->
      <g v-if="selectionTool.isSelectionModeActive.value || selectionTool.selectionRect.value">
        <!-- Highlight selected regions (red overlay) -->
        <rect
          v-for="idx in selectionTool.selectedRegionIndices.value"
          :key="`selected-${idx}`"
          :x="regions[idx].bounds.x"
          :y="regions[idx].bounds.y"
          :width="regions[idx].bounds.width"
          :height="regions[idx].bounds.height"
          fill="rgba(239, 68, 68, 0.4)"
          stroke="rgba(239, 68, 68, 1)"
          stroke-width="3"
          vector-effect="non-scaling-stroke"
        />

        <!-- Selection rectangle -->
        <rect
          v-if="selectionTool.selectionRect.value"
          :x="selectionTool.selectionRect.value.x"
          :y="selectionTool.selectionRect.value.y"
          :width="selectionTool.selectionRect.value.width"
          :height="selectionTool.selectionRect.value.height"
          fill="rgba(239, 68, 68, 0.1)"
          stroke="rgba(239, 68, 68, 0.8)"
          stroke-width="2"
          stroke-dasharray="8 4"
          vector-effect="non-scaling-stroke"
        />

      </g>
    </svg>

    <!-- Magnifier (shows when resizing) -->
    <Teleport to="body">
      <div
        v-if="magnifier.showMagnifier.value && imageUrl"
        class="magnifier"
      >
        <div class="magnifier-content">
          <div
            class="magnifier-image"
            :style="magnifier.magnifierStyle.value"
          ></div>
          <!-- Crosshair -->
          <div class="magnifier-crosshair-h"></div>
          <div class="magnifier-crosshair-v"></div>
        </div>
      </div>
    </Teleport>

    <!-- Selection Confirm Dialog (fixed at bottom center) -->
    <Teleport to="body">
      <div
        v-if="selectionTool.selectionRect.value && selectionTool.selectedRegionIndices.value.length > 0 && !selectionTool.isSelecting.value"
        class="selection-confirm-bar"
      >
        <span class="selection-count">
          {{ t('slideToPptx.regionEditor.selectionConfirm', { count: selectionTool.selectedRegionIndices.value.length }) }}
        </span>
        <div class="selection-actions">
          <button @click="selectionTool.cancelSelection" class="selection-btn selection-btn-cancel">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span>{{ t('common.cancel') }}</span>
          </button>
          <button @click="selectionTool.confirmBatchDelete" class="selection-btn selection-btn-confirm">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span>{{ t('common.delete') }}</span>
          </button>
        </div>
      </div>
    </Teleport>

    <!-- Text Input Dialog -->
    <Teleport to="body">
      <div
        v-if="textDialog.showTextDialog.value"
        class="text-dialog-overlay"
        @click.self="textDialog.cancelTextDialog"
      >
        <div class="text-dialog">
          <h3 class="text-dialog-title">
            {{ t('slideToPptx.regionEditor.addRegion') }}
          </h3>
          <p class="text-dialog-hint">
            {{ t('slideToPptx.regionEditor.textHint') }}
          </p>
          <input
            v-model="textDialog.newRegionText.value"
            type="text"
            class="text-dialog-input"
            :placeholder="t('slideToPptx.regionEditor.textPlaceholder')"
            @keydown.enter="textDialog.confirmNewRegion"
            @keydown.esc="textDialog.cancelTextDialog"
            autofocus
          />
          <div class="text-dialog-actions">
            <button @click="textDialog.skipTextInput" class="dialog-btn dialog-btn-secondary">
              {{ t('slideToPptx.regionEditor.skip') }}
            </button>
            <button @click="textDialog.confirmNewRegion" class="dialog-btn dialog-btn-primary">
              {{ t('slideToPptx.regionEditor.add') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Confirm Modal -->
    <ConfirmModal ref="confirmModalRef" />
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
  position: fixed;
  z-index: 10002; /* Above lightbox overlay (9999) and dialogs */
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem; /* Smaller gap on mobile */
  align-items: center;
  justify-content: center;
  padding: 0.5rem;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(8px);
  border-radius: 0.75rem;
  pointer-events: auto;
  cursor: move;
  user-select: none;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  max-width: calc(100vw - 2rem); /* Prevent overflow on small screens */
}

@media (min-width: 640px) {
  .edit-toolbar {
    gap: 0.5rem;
    flex-wrap: nowrap;
  }
}

.toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  padding: 0.5rem; /* Icon-only on mobile */
  font-size: 0.875rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.85);
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

@media (min-width: 640px) {
  .toolbar-btn {
    padding: 0.5rem 0.75rem; /* Text + icon on desktop */
  }
}

.toolbar-btn:hover:not(:disabled) {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.15);
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

.toolbar-btn-separator {
  color: white;
  background: rgba(249, 115, 22, 0.8);
  border-color: rgba(249, 115, 22, 0.8);
}

.toolbar-btn-selection {
  color: white;
  background: rgba(239, 68, 68, 0.8);
  border-color: rgba(239, 68, 68, 0.8);
}

.toolbar-btn-trapezoid {
  color: white;
  background: rgba(168, 85, 247, 0.8);
  border-color: rgba(168, 85, 247, 0.8);
}

.toolbar-btn-icon {
  padding: 0.5rem;
}

.toolbar-divider {
  width: 1px;
  height: 1.5rem;
  background: rgba(255, 255, 255, 0.2);
  margin: 0 0.25rem;
}

.region-count {
  padding: 0 0.5rem;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.6);
}

.drag-handle {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.25rem;
  margin-left: 0.25rem;
  color: rgba(255, 255, 255, 0.6);
  cursor: move;
  border-radius: 0.25rem;
  transition: color 0.15s, background 0.15s;
}

.drag-handle:hover {
  color: rgba(255, 255, 255, 0.9);
  background: rgba(255, 255, 255, 0.1);
}

/* Hint text */
.edit-hint {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 0.5rem;
  padding: 0.375rem 0.75rem;
  font-size: 0.625rem;
  color: rgba(255, 255, 255, 0.6);
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  border-radius: 0.5rem;
  pointer-events: none;
  white-space: nowrap;
  max-width: calc(100vw - 2rem);
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (min-width: 640px) {
  .edit-hint {
    padding: 0.5rem 1rem;
    font-size: 0.75rem;
  }
}

/* SVG Overlay */
.edit-overlay-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  /* pointer-events controlled by dynamic classes */
}

.pointer-events-none {
  pointer-events: none;
}

.pointer-events-auto {
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

.vertex-handle {
  cursor: move;
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

/* Selection confirm bar (fixed at bottom) */
.selection-confirm-bar {
  position: fixed;
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10001;
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1.25rem;
  background: rgba(30, 30, 40, 0.95);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 1rem;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.selection-count {
  color: white;
  font-size: 0.875rem;
  font-weight: 500;
  white-space: nowrap;
}

.selection-actions {
  display: flex;
  gap: 0.5rem;
}

.selection-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.875rem;
  font-size: 0.875rem;
  font-weight: 500;
  border-radius: 0.5rem;
  transition: all 0.15s ease;
  cursor: pointer;
}

.selection-btn-cancel {
  color: white;
  background: rgba(100, 100, 100, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.selection-btn-cancel:hover {
  background: rgba(120, 120, 120, 0.8);
}

.selection-btn-confirm {
  color: white;
  background: rgba(239, 68, 68, 0.9);
  border: 1px solid rgba(239, 68, 68, 0.5);
}

.selection-btn-confirm:hover {
  background: rgba(220, 50, 50, 1);
}

@media (max-width: 639px) {
  .selection-confirm-bar {
    bottom: 1rem;
    left: 1rem;
    right: 1rem;
    transform: none;
    flex-direction: column;
    gap: 0.75rem;
  }

  .selection-actions {
    width: 100%;
  }

  .selection-btn {
    flex: 1;
    justify-content: center;
  }
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

/* Separator line styling */
.separator-group {
  cursor: pointer;
}

.separator-group line {
  transition: stroke 0.15s ease, stroke-width 0.15s ease;
}

.separator-group circle {
  transition: fill 0.15s ease;
}

/* Magnifier */
.magnifier {
  position: fixed;
  top: 1rem;
  left: 1rem;
  z-index: 10001;
  pointer-events: none;
}

.magnifier-content {
  position: relative;
  width: 120px;
  height: 120px;
  border-radius: 0.75rem;
  overflow: hidden;
  border: 3px solid rgba(59, 130, 246, 0.8);
  background: #000;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}

.magnifier-image {
  width: 100%;
  height: 100%;
  background-repeat: no-repeat;
}

.magnifier-crosshair-h,
.magnifier-crosshair-v {
  position: absolute;
  background: rgba(59, 130, 246, 0.8);
}

.magnifier-crosshair-h {
  top: 50%;
  left: 0;
  right: 0;
  height: 1px;
  transform: translateY(-0.5px);
}

.magnifier-crosshair-v {
  left: 50%;
  top: 0;
  bottom: 0;
  width: 1px;
  transform: translateX(-0.5px);
}
</style>
