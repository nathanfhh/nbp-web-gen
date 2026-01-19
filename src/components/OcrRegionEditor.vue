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
  'delete-regions-batch', // For batch deletion from selection tool
  'add-region',
  'resize-region',
  'reset',
  'done',
  'add-separator',
  'delete-separator',
  'undo',
  'redo',
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

// Separator line state
const isSeparatorModeActive = ref(false)
const separatorFirstPoint = ref(null)
const separatorPreview = ref(null) // { start, end } for preview line
const selectedSeparatorId = ref(null)

// Selection tool state (for batch delete)
const isSelectionModeActive = ref(false)
const isSelecting = ref(false)
const selectionStart = ref(null)
const selectionRect = ref(null)
const selectedRegionIndices = ref([]) // Indices of regions inside selection box

// Magnifier state
const showMagnifier = ref(false)
const magnifierTarget = ref({ x: 0, y: 0 })

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
 * Programmatically select a region by index (exposed for parent component)
 */
const selectRegion = (index) => {
  if (index < 0 || index >= props.regions.length) return
  // Exit any active modes
  isDrawModeActive.value = false
  isSeparatorModeActive.value = false
  isSelectionModeActive.value = false
  selectionRect.value = null
  selectedRegionIndices.value = []
  selectedSeparatorId.value = null
  // Select the region
  selectedIndex.value = index
}

// Expose methods for parent component
defineExpose({
  selectRegion,
})

/**
 * Deselect region/separator when clicking on empty area, or handle separator click
 */
const onBackgroundClick = (e) => {
  // Handle separator mode click (for drawing new separator)
  if (isSeparatorModeActive.value) {
    onSeparatorClick(e)
    return
  }

  if (isDrawModeActive.value) return
  if (!isResizing.value) {
    selectedIndex.value = null
    selectedSeparatorId.value = null
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

/**
 * Get delete button size based on region bounds
 * Scales proportionally with the smaller dimension, with min/max limits
 */
const getDeleteButtonSize = (region) => {
  const minDimension = Math.min(region.bounds.width, region.bounds.height)
  const scaledRadius = minDimension * 0.15
  const radius = Math.max(16, Math.min(40, scaledRadius))
  return {
    radius,
    hitRadius: radius * 1.5,
    fontSize: radius * 1.25,
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
    isSeparatorModeActive.value = false // Exit separator mode
    isSelectionModeActive.value = false // Exit selection mode
    selectionRect.value = null
    selectedRegionIndices.value = []
    selectedSeparatorId.value = null
  }
}

// ============================================================================
// Separator Line Tool
// ============================================================================

const toggleSeparatorMode = () => {
  isSeparatorModeActive.value = !isSeparatorModeActive.value
  if (!isSeparatorModeActive.value) {
    // Reset separator state when exiting
    separatorFirstPoint.value = null
    separatorPreview.value = null
  }
  // Exit other modes when entering separator mode
  if (isSeparatorModeActive.value) {
    isDrawModeActive.value = false
    isSelectionModeActive.value = false // Exit selection mode
    selectionRect.value = null
    selectedRegionIndices.value = []
    selectedIndex.value = null
    selectedSeparatorId.value = null
  }
}

/**
 * Handle click for separator line drawing (two-point)
 */
const onSeparatorClick = (e) => {
  if (!isSeparatorModeActive.value) return
  e.stopPropagation()

  const coords = getImageCoords(e)

  if (!separatorFirstPoint.value) {
    // First point: start the line
    separatorFirstPoint.value = coords
  } else {
    // Second point: finish the line
    emit('add-separator', {
      start: separatorFirstPoint.value,
      end: coords,
    })
    // Reset for next line
    separatorFirstPoint.value = null
    separatorPreview.value = null
  }
}

/**
 * Update separator preview line on mouse move
 */
const updateSeparatorPreview = (coords) => {
  if (!isSeparatorModeActive.value || !separatorFirstPoint.value) return
  separatorPreview.value = {
    start: separatorFirstPoint.value,
    end: coords,
  }
}

/**
 * Select a separator line by clicking on it
 */
const onSeparatorClick_Select = (separatorId, e) => {
  if (isSeparatorModeActive.value || isDrawModeActive.value) return
  e.stopPropagation()
  selectedSeparatorId.value = separatorId
  selectedIndex.value = null // Deselect any region
}

/**
 * Delete the currently selected separator line
 */
const onDeleteSeparatorClick = (e) => {
  e.stopPropagation()
  if (selectedSeparatorId.value !== null) {
    emit('delete-separator', selectedSeparatorId.value)
    selectedSeparatorId.value = null
  }
}

/**
 * Get midpoint of a separator line (for delete button placement)
 */
const getSeparatorMidpoint = (separator) => {
  return {
    x: (separator.start.x + separator.end.x) / 2,
    y: (separator.start.y + separator.end.y) / 2,
  }
}

// ============================================================================
// Selection Tool (Batch Delete)
// ============================================================================

const toggleSelectionMode = () => {
  isSelectionModeActive.value = !isSelectionModeActive.value
  if (!isSelectionModeActive.value) {
    // Reset selection state when exiting
    isSelecting.value = false
    selectionStart.value = null
    selectionRect.value = null
    selectedRegionIndices.value = []
  }
  // Exit other modes when entering selection mode
  if (isSelectionModeActive.value) {
    isDrawModeActive.value = false
    isSeparatorModeActive.value = false
    selectedIndex.value = null
    selectedSeparatorId.value = null
  }
}

/**
 * Check if two rectangles intersect
 */
const rectsIntersect = (r1, r2) => {
  return !(
    r1.x + r1.width < r2.x ||
    r2.x + r2.width < r1.x ||
    r1.y + r1.height < r2.y ||
    r2.y + r2.height < r1.y
  )
}

/**
 * Update selected regions based on current selection rect
 */
const updateSelectedRegions = () => {
  if (!selectionRect.value) {
    selectedRegionIndices.value = []
    return
  }

  const indices = []
  props.regions.forEach((region, idx) => {
    if (rectsIntersect(selectionRect.value, region.bounds)) {
      indices.push(idx)
    }
  })
  selectedRegionIndices.value = indices
}

/**
 * Confirm and delete selected regions
 */
const confirmBatchDelete = () => {
  if (selectedRegionIndices.value.length === 0) return

  // Emit batch delete with the selected region indices
  emit('delete-regions-batch', selectedRegionIndices.value)

  // Reset selection state
  isSelecting.value = false
  selectionStart.value = null
  selectionRect.value = null
  selectedRegionIndices.value = []
}

/**
 * Cancel current selection
 */
const cancelSelection = () => {
  isSelecting.value = false
  selectionStart.value = null
  selectionRect.value = null
  selectedRegionIndices.value = []
}

const onMouseDown = (e) => {
  // Handle selection mode
  if (isSelectionModeActive.value) {
    e.stopPropagation()
    const coords = getImageCoords(e)
    selectionStart.value = coords
    isSelecting.value = true
    selectionRect.value = { x: coords.x, y: coords.y, width: 0, height: 0 }
    selectedRegionIndices.value = []
    return
  }

  if (!isDrawModeActive.value) return

  // Prevent event from bubbling to lightbox (stops panning)
  e.stopPropagation()

  const coords = getImageCoords(e)
  drawStart.value = coords
  isDrawing.value = true
}

const onMouseMove = (e) => {
  const current = getImageCoords(e)

  // Handle selection mode
  if (isSelecting.value && selectionStart.value) {
    selectionRect.value = {
      x: Math.min(selectionStart.value.x, current.x),
      y: Math.min(selectionStart.value.y, current.y),
      width: Math.abs(current.x - selectionStart.value.x),
      height: Math.abs(current.y - selectionStart.value.y),
    }
    updateSelectedRegions()
    return
  }

  // Handle resize (also update magnifier target)
  if (isResizing.value) {
    handleResizeMove(current)
    magnifierTarget.value = current
    return
  }

  // Handle separator preview
  if (isSeparatorModeActive.value) {
    updateSeparatorPreview(current)
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
  // Handle selection mode - keep selection visible for confirmation
  if (isSelecting.value) {
    isSelecting.value = false
    // If no regions selected, cancel selection
    if (selectedRegionIndices.value.length === 0) {
      cancelSelection()
    }
    // Otherwise keep selectionRect visible for confirmation UI
    return
  }

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
  e.stopPropagation() // Stop panning
  
  const coords = getTouchImageCoords(e.touches[0])
  drawStart.value = coords
  isDrawing.value = true
}

const onTouchMove = (e) => {
  if (e.touches.length !== 1) return

  const current = getTouchImageCoords(e.touches[0])

  // Handle resize (also update magnifier target)
  if (isResizing.value) {
    e.preventDefault()
    handleResizeMove(current)
    magnifierTarget.value = current
    return
  }

  // Handle separator preview
  if (isSeparatorModeActive.value) {
    e.preventDefault()
    updateSeparatorPreview(current)
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

  // Show magnifier when resizing
  showMagnifier.value = true
  magnifierTarget.value = getImageCoords(e)
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

  // Hide magnifier when done resizing
  showMagnifier.value = false
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

  // Show magnifier when resizing
  showMagnifier.value = true
  magnifierTarget.value = getTouchImageCoords(e.touches[0])
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

const onUndo = () => {
  if (props.canUndo) {
    emit('undo')
    // Clear selections after undo as indices may be invalid
    selectedIndex.value = null
    selectedSeparatorId.value = null
  }
}

const onRedo = () => {
  if (props.canRedo) {
    emit('redo')
    // Clear selections after redo as indices may be invalid
    selectedIndex.value = null
    selectedSeparatorId.value = null
  }
}

// ============================================================================
// Keyboard Shortcuts
// ============================================================================

const handleKeydown = (e) => {
  // Undo: Ctrl+Z / Cmd+Z
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault()
    onUndo()
    return
  }

  // Redo: Ctrl+Shift+Z / Cmd+Shift+Z or Ctrl+Y / Cmd+Y
  if ((e.ctrlKey || e.metaKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
    e.preventDefault()
    onRedo()
    return
  }

  if (e.key === 'Escape') {
    if (showTextDialog.value) {
      cancelTextDialog()
    } else if (selectionRect.value && selectedRegionIndices.value.length > 0) {
      // Cancel pending selection
      cancelSelection()
    } else if (isSelectionModeActive.value) {
      toggleSelectionMode()
    } else if (isSeparatorModeActive.value) {
      // If drawing a separator (first point set), cancel it; otherwise exit mode
      if (separatorFirstPoint.value) {
        separatorFirstPoint.value = null
        separatorPreview.value = null
      } else {
        toggleSeparatorMode()
      }
    } else if (isDrawModeActive.value) {
      toggleDrawMode()
    }
  }
  // Delete key to delete selected separator
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selectedSeparatorId.value !== null) {
      emit('delete-separator', selectedSeparatorId.value)
      selectedSeparatorId.value = null
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
// Toolbar Dragging
// ============================================================================

const toolbarRef = ref(null)
const isToolbarDragging = ref(false)
const toolbarPos = ref({ x: 0, y: 0 })
const dragStartPos = ref({ x: 0, y: 0 })
const hasMoved = ref(false) // Track if user has moved it, to disable auto-centering

// Initialize position centered
onMounted(() => {
  if (toolbarRef.value) {
    const rect = toolbarRef.value.getBoundingClientRect()
    // Center horizontally
    // On mobile (< 640px), position lower to avoid Lightbox header buttons (download + close)
    const isMobile = window.innerWidth < 640
    toolbarPos.value = {
      x: (window.innerWidth - rect.width) / 2,
      y: isMobile ? 72 : 16 // 4.5rem on mobile (below Lightbox toolbar ~60px), 1rem on desktop
    }
  }
  
  window.addEventListener('mousemove', onWindowMouseMove)
  window.addEventListener('mouseup', onWindowMouseUp)
  window.addEventListener('touchmove', onWindowTouchMove, { passive: false })
  window.addEventListener('touchend', onWindowTouchEnd)
})

onUnmounted(() => {
  window.removeEventListener('mousemove', onWindowMouseMove)
  window.removeEventListener('mouseup', onWindowMouseUp)
  window.removeEventListener('touchmove', onWindowTouchMove)
  window.removeEventListener('touchend', onWindowTouchEnd)
})

const onToolbarMouseDown = (e) => {
  // Ignore clicks on buttons inside toolbar
  if (e.target.closest('button')) return
  
  isToolbarDragging.value = true
  hasMoved.value = true
  dragStartPos.value = {
    x: e.clientX - toolbarPos.value.x,
    y: e.clientY - toolbarPos.value.y
  }
}

const onWindowMouseMove = (e) => {
  if (!isToolbarDragging.value) return
  e.preventDefault()
  
  const newX = e.clientX - dragStartPos.value.x
  const newY = e.clientY - dragStartPos.value.y
  
  // Constrain to window
  const maxX = window.innerWidth - (toolbarRef.value?.offsetWidth || 0)
  const maxY = window.innerHeight - (toolbarRef.value?.offsetHeight || 0)
  
  toolbarPos.value = {
    x: Math.max(0, Math.min(maxX, newX)),
    y: Math.max(0, Math.min(maxY, newY))
  }
}

const onWindowMouseUp = () => {
  isToolbarDragging.value = false
}

// Touch support for toolbar
const onToolbarTouchStart = (e) => {
  if (e.target.closest('button')) return
  if (e.touches.length !== 1) return
  
  isToolbarDragging.value = true
  hasMoved.value = true
  const touch = e.touches[0]
  dragStartPos.value = {
    x: touch.clientX - toolbarPos.value.x,
    y: touch.clientY - toolbarPos.value.y
  }
}

const onWindowTouchMove = (e) => {
  if (!isToolbarDragging.value) return
  if (e.touches.length !== 1) return
  e.preventDefault()
  
  const touch = e.touches[0]
  const newX = touch.clientX - dragStartPos.value.x
  const newY = touch.clientY - dragStartPos.value.y
  
  const maxX = window.innerWidth - (toolbarRef.value?.offsetWidth || 0)
  const maxY = window.innerHeight - (toolbarRef.value?.offsetHeight || 0)
  
  toolbarPos.value = {
    x: Math.max(0, Math.min(maxX, newX)),
    y: Math.max(0, Math.min(maxY, newY))
  }
}

const onWindowTouchEnd = () => {
  isToolbarDragging.value = false
}

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
    <!-- Draggable Toolbar (Teleported to body to escape image transform context) -->
    <Teleport to="body">
      <div 
        v-if="hasValidDimensions"
        ref="toolbarRef"
        class="edit-toolbar" 
        :class="{ 'pointer-events-none opacity-70': isReprocessing }"
        :style="{ left: `${toolbarPos.x}px`, top: `${toolbarPos.y}px`, transform: 'none' }"
        @mousedown="onToolbarMouseDown"
        @touchstart="onToolbarTouchStart"
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
          @click="toggleDrawMode"
          class="toolbar-btn"
          :class="{ 'toolbar-btn-active': isDrawModeActive }"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          <span class="hidden sm:inline">{{ isDrawModeActive ? t('slideToPptx.regionEditor.drawing') : t('slideToPptx.regionEditor.drawRect') }}</span>
        </button>

        <!-- Separator line tool -->
        <button
          @click="toggleSeparatorMode"
          class="toolbar-btn"
          :class="{ 'toolbar-btn-separator': isSeparatorModeActive }"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 20L20 4" />
          </svg>
          <span class="hidden sm:inline">{{ isSeparatorModeActive
            ? (separatorFirstPoint ? t('slideToPptx.regionEditor.separatorDrawing') : t('slideToPptx.regionEditor.separator'))
            : t('slideToPptx.regionEditor.separator') }}</span>
        </button>

        <!-- Selection tool for batch delete -->
        <button
          @click="toggleSelectionMode"
          class="toolbar-btn"
          :class="{ 'toolbar-btn-selection': isSelectionModeActive }"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h4a1 1 0 010 2H5a1 1 0 01-1-1zM4 13a1 1 0 011-1h4a1 1 0 010 2H5a1 1 0 01-1-1zM15 4a1 1 0 100 2h4a1 1 0 100-2h-4zM15 12a1 1 0 100 2h4a1 1 0 100-2h-4zM4 19a1 1 0 011-1h14a1 1 0 110 2H5a1 1 0 01-1-1z" />
          </svg>
          <span class="hidden sm:inline">{{ t('slideToPptx.regionEditor.selectArea') }}</span>
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

        <!-- Hint text (Attached to toolbar) -->
        <div class="edit-hint" v-if="isSelectionModeActive && selectedRegionIndices.length > 0">
          {{ t('slideToPptx.regionEditor.selectionConfirm', { count: selectedRegionIndices.length }) }}
        </div>
        <div class="edit-hint" v-else-if="isSelectionModeActive">
          {{ t('slideToPptx.regionEditor.selectionHint') }}
        </div>
        <div class="edit-hint" v-else-if="isSeparatorModeActive">
          {{ separatorFirstPoint ? t('slideToPptx.regionEditor.separatorDrawing') : t('slideToPptx.regionEditor.separatorHint') }}
        </div>
        <div class="edit-hint" v-else-if="selectedSeparatorId !== null">
          {{ t('slideToPptx.regionEditor.separatorSelectedHint') }}
        </div>
        <div class="edit-hint" v-else-if="isDrawModeActive">
          {{ t('slideToPptx.regionEditor.drawHint') }}
        </div>
        <div class="edit-hint" v-else-if="selectedIndex !== null">
          {{ t('slideToPptx.regionEditor.selectedHint') }}
        </div>
        <div class="edit-hint" v-else>
          {{ t('slideToPptx.regionEditor.hint') }}
        </div>
      </div>
    </Teleport>

    <!-- SVG Overlay for region editing -->
    <svg
      v-if="hasValidDimensions"
      ref="svgRef"
      class="edit-overlay-svg"
      :class="{
        'cursor-crosshair': isDrawModeActive || isSeparatorModeActive || isSelectionModeActive,
        'pointer-events-auto': isDrawModeActive || isResizing || isSeparatorModeActive || isSelectionModeActive,
        'pointer-events-none': !isDrawModeActive && !isResizing && !isSeparatorModeActive && !isSelectionModeActive
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
        @click.stop="onRegionClick(idx, $event)"
        class="region-group"
        :class="{ 'region-selected': selectedIndex === idx }"
        pointer-events="auto"
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
      <g v-if="selectedIndex !== null && regions[selectedIndex] && !isDrawModeActive" pointer-events="auto">
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
            :r="getDeleteButtonSize(regions[selectedIndex]).hitRadius"
            fill="transparent"
          />
          <!-- Visible button -->
          <circle
            :cx="getDeleteButtonCenter(regions[selectedIndex]).x"
            :cy="getDeleteButtonCenter(regions[selectedIndex]).y"
            :r="getDeleteButtonSize(regions[selectedIndex]).radius"
            fill="rgba(239, 68, 68, 0.9)"
          />
          <text
            :x="getDeleteButtonCenter(regions[selectedIndex]).x"
            :y="getDeleteButtonCenter(regions[selectedIndex]).y"
            text-anchor="middle"
            dominant-baseline="central"
            fill="white"
            :font-size="getDeleteButtonSize(regions[selectedIndex]).fontSize"
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
        :class="{ 'separator-selected': selectedSeparatorId === sep.id }"
        pointer-events="auto"
        @click.stop="onSeparatorClick_Select(sep.id, $event)"
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
          :stroke="selectedSeparatorId === sep.id ? 'rgba(249, 115, 22, 1)' : 'rgba(249, 115, 22, 0.7)'"
          :stroke-width="selectedSeparatorId === sep.id ? '4' : '3'"
          :stroke-dasharray="selectedSeparatorId === sep.id ? 'none' : '8 4'"
          vector-effect="non-scaling-stroke"
        />
        <!-- Endpoint circles -->
        <circle
          :cx="sep.start.x"
          :cy="sep.start.y"
          r="6"
          :fill="selectedSeparatorId === sep.id ? 'rgba(249, 115, 22, 1)' : 'rgba(249, 115, 22, 0.7)'"
        />
        <circle
          :cx="sep.end.x"
          :cy="sep.end.y"
          r="6"
          :fill="selectedSeparatorId === sep.id ? 'rgba(249, 115, 22, 1)' : 'rgba(249, 115, 22, 0.7)'"
        />
      </g>

      <!-- Selected separator delete button -->
      <g
        v-if="selectedSeparatorId !== null && separatorLines.find(s => s.id === selectedSeparatorId)"
        class="delete-button-group"
        pointer-events="auto"
        @click.stop="onDeleteSeparatorClick($event)"
      >
        <!-- Get the selected separator for positioning -->
        <circle
          :cx="getSeparatorMidpoint(separatorLines.find(s => s.id === selectedSeparatorId)).x"
          :cy="getSeparatorMidpoint(separatorLines.find(s => s.id === selectedSeparatorId)).y"
          r="24"
          fill="transparent"
        />
        <circle
          :cx="getSeparatorMidpoint(separatorLines.find(s => s.id === selectedSeparatorId)).x"
          :cy="getSeparatorMidpoint(separatorLines.find(s => s.id === selectedSeparatorId)).y"
          r="18"
          fill="rgba(239, 68, 68, 0.9)"
        />
        <text
          :x="getSeparatorMidpoint(separatorLines.find(s => s.id === selectedSeparatorId)).x"
          :y="getSeparatorMidpoint(separatorLines.find(s => s.id === selectedSeparatorId)).y"
          text-anchor="middle"
          dominant-baseline="central"
          fill="white"
          font-size="22"
          font-weight="bold"
          class="delete-button-text"
        >×</text>
      </g>

      <!-- Separator preview line (when drawing) -->
      <g v-if="isSeparatorModeActive && separatorPreview">
        <line
          :x1="separatorPreview.start.x"
          :y1="separatorPreview.start.y"
          :x2="separatorPreview.end.x"
          :y2="separatorPreview.end.y"
          stroke="rgba(249, 115, 22, 0.5)"
          stroke-width="3"
          stroke-dasharray="8 4"
          vector-effect="non-scaling-stroke"
        />
        <!-- First point marker -->
        <circle
          :cx="separatorPreview.start.x"
          :cy="separatorPreview.start.y"
          r="8"
          fill="rgba(249, 115, 22, 0.9)"
          stroke="white"
          stroke-width="2"
        />
      </g>

      <!-- First point marker when starting separator (before preview) -->
      <circle
        v-if="isSeparatorModeActive && separatorFirstPoint && !separatorPreview"
        :cx="separatorFirstPoint.x"
        :cy="separatorFirstPoint.y"
        r="8"
        fill="rgba(249, 115, 22, 0.9)"
        stroke="white"
        stroke-width="2"
      />

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

      <!-- Selection box and highlighted regions -->
      <g v-if="isSelectionModeActive || selectionRect">
        <!-- Highlight selected regions (red overlay) -->
        <rect
          v-for="idx in selectedRegionIndices"
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
          v-if="selectionRect"
          :x="selectionRect.x"
          :y="selectionRect.y"
          :width="selectionRect.width"
          :height="selectionRect.height"
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
        v-if="showMagnifier && imageUrl"
        class="magnifier"
      >
        <div class="magnifier-content">
          <div
            class="magnifier-image"
            :style="{
              backgroundImage: `url(${imageUrl})`,
              backgroundPosition: `-${magnifierTarget.x * 2.5 - 60}px -${magnifierTarget.y * 2.5 - 60}px`,
              backgroundSize: `${imageDimensions.width * 2.5}px ${imageDimensions.height * 2.5}px`
            }"
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
        v-if="selectionRect && selectedRegionIndices.length > 0 && !isSelecting"
        class="selection-confirm-bar"
      >
        <span class="selection-count">
          {{ t('slideToPptx.regionEditor.selectionConfirm', { count: selectedRegionIndices.length }) }}
        </span>
        <div class="selection-actions">
          <button @click="cancelSelection" class="selection-btn selection-btn-cancel">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span>{{ t('common.cancel') }}</span>
          </button>
          <button @click="confirmBatchDelete" class="selection-btn selection-btn-confirm">
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
  position: fixed;
  z-index: 9999; /* Ensure it's above lightbox */
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
