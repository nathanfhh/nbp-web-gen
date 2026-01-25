/**
 * Resize Tool composable for OCR Region Editor
 *
 * Handles region resizing via corner handles.
 * Supports both mouse and touch interactions with optional magnifier integration.
 *
 * Two modes:
 * - Rectangle mode (default): handles resize bounds as axis-aligned rectangle
 * - Polygon mode: handles move individual polygon vertices (trapezoid)
 */

import { ref, computed } from 'vue'

// Minimum region size during resize
const MIN_SIZE = 10

// Vertex index mapping: handle name → polygon index
const VERTEX_INDEX = { nw: 0, ne: 1, se: 2, sw: 3 }

/**
 * @param {Object} options
 * @param {Function} options.getImageCoords - Function to convert event to image coords: (e) => {x, y}
 * @param {Function} options.getTouchImageCoords - Function to convert touch to image coords: (touch) => {x, y}
 * @param {Function} options.getSelectedRegion - Function to get selected region: () => Region|null
 * @param {Function} options.getSelectedIndex - Function to get selected index: () => number|null
 * @param {Function} options.getImageDimensions - Function to get image dimensions: () => {width, height}
 * @param {Function} options.onResize - Callback during rectangle resize: ({index, bounds}) => void
 * @param {Function} options.onMoveVertex - Callback for polygon vertex move: ({index, polygon}) => void
 * @param {Function} options.onVertexInvalid - Callback when polygon is self-intersecting after drag: () => void
 * @param {Function} options.isValidQuad - Validation function: (polygon) => boolean
 * @param {Function} options.onMagnifierShow - Optional callback to show magnifier: (coords) => void
 * @param {Function} options.onMagnifierUpdate - Optional callback to update magnifier: (coords) => void
 * @param {Function} options.onMagnifierHide - Optional callback to hide magnifier: () => void
 */
export function useResizeTool({
  getImageCoords,
  getTouchImageCoords,
  getSelectedRegion,
  getSelectedIndex,
  getImageDimensions,
  onResize,
  onMoveVertex,
  onVertexInvalid,
  isValidQuad,
  onMagnifierShow,
  onMagnifierUpdate,
  onMagnifierHide,
}) {
  // State
  const isResizing = ref(false)
  const resizeHandle = ref(null) // 'nw', 'ne', 'sw', 'se'
  const resizeStart = ref(null)
  const resizeOriginalBounds = ref(null)

  // Polygon vertex drag state
  const isVertexDragging = ref(false)
  const vertexOriginalPolygon = ref(null) // save for revert on invalid

  /**
   * Check if currently resizing (either mode)
   */
  const isActive = computed(() => isResizing.value)

  /**
   * Check if the selected region is in polygon mode
   */
  const isPolygonMode = () => {
    const region = getSelectedRegion()
    return region?.isPolygonMode === true
  }

  // ============================================================================
  // Mouse Events
  // ============================================================================

  /**
   * Start resizing on mouse down
   * @param {string} handle - Handle identifier ('nw', 'ne', 'sw', 'se')
   * @param {MouseEvent} e
   */
  const onResizeStart = (handle, e) => {
    e.stopPropagation()
    e.preventDefault()

    const selectedIndex = getSelectedIndex()
    if (selectedIndex === null) return

    const region = getSelectedRegion()
    if (!region) return

    isResizing.value = true
    resizeHandle.value = handle

    if (isPolygonMode()) {
      // Polygon vertex drag mode
      isVertexDragging.value = true
      vertexOriginalPolygon.value = region.polygon.map((p) => [...p])
    } else {
      // Rectangle resize mode
      isVertexDragging.value = false
      resizeStart.value = getImageCoords(e)
      resizeOriginalBounds.value = { ...region.bounds }
    }

    // Show magnifier
    const coords = getImageCoords(e)
    onMagnifierShow?.(coords)
  }

  /**
   * Handle resize move (called from main mousemove)
   * @param {{x: number, y: number}} coords - Current image coordinates
   */
  const handleResizeMove = (coords) => {
    const selectedIndex = getSelectedIndex()
    if (!isResizing.value || selectedIndex === null) return

    if (isVertexDragging.value) {
      handleVertexMove(coords, selectedIndex)
    } else {
      handleRectResize(coords, selectedIndex)
    }

    // Update magnifier
    onMagnifierUpdate?.(coords)
  }

  /**
   * Handle rectangle resize move (original logic)
   */
  const handleRectResize = (coords, selectedIndex) => {
    if (!resizeOriginalBounds.value) return

    const orig = resizeOriginalBounds.value
    const handle = resizeHandle.value
    const dims = getImageDimensions()
    let newBounds = { ...orig }

    // Calculate new bounds based on which handle is being dragged
    if (handle === 'nw') {
      newBounds.x = Math.min(coords.x, orig.x + orig.width - MIN_SIZE)
      newBounds.y = Math.min(coords.y, orig.y + orig.height - MIN_SIZE)
      newBounds.width = orig.x + orig.width - newBounds.x
      newBounds.height = orig.y + orig.height - newBounds.y
    } else if (handle === 'ne') {
      newBounds.y = Math.min(coords.y, orig.y + orig.height - MIN_SIZE)
      newBounds.width = Math.max(MIN_SIZE, coords.x - orig.x)
      newBounds.height = orig.y + orig.height - newBounds.y
    } else if (handle === 'sw') {
      newBounds.x = Math.min(coords.x, orig.x + orig.width - MIN_SIZE)
      newBounds.width = orig.x + orig.width - newBounds.x
      newBounds.height = Math.max(MIN_SIZE, coords.y - orig.y)
    } else if (handle === 'se') {
      newBounds.width = Math.max(MIN_SIZE, coords.x - orig.x)
      newBounds.height = Math.max(MIN_SIZE, coords.y - orig.y)
    }

    // Constrain to image bounds
    newBounds.x = Math.max(0, newBounds.x)
    newBounds.y = Math.max(0, newBounds.y)
    newBounds.width = Math.min(newBounds.width, dims.width - newBounds.x)
    newBounds.height = Math.min(newBounds.height, dims.height - newBounds.y)

    // Emit resize event for real-time preview
    onResize({ index: selectedIndex, bounds: newBounds })
  }

  /**
   * Handle polygon vertex move — updates the dragged vertex position in real-time
   */
  const handleVertexMove = (coords, selectedIndex) => {
    if (!vertexOriginalPolygon.value) return

    const handle = resizeHandle.value
    const vi = VERTEX_INDEX[handle]
    if (vi === undefined) return

    const dims = getImageDimensions()

    // Build new polygon with moved vertex (clamped to image bounds)
    const region = getSelectedRegion()
    if (!region) return

    const newPolygon = region.polygon.map((p) => [...p])
    newPolygon[vi] = [
      Math.max(0, Math.min(dims.width, coords.x)),
      Math.max(0, Math.min(dims.height, coords.y)),
    ]

    // Real-time preview: update region via onResize with recalculated bounds
    const xs = newPolygon.map((p) => p[0])
    const ys = newPolygon.map((p) => p[1])
    const bounds = {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    }

    // Use onResize for real-time preview (updates bounds + polygon directly on region)
    onResize({ index: selectedIndex, bounds, polygon: newPolygon })
  }

  /**
   * Finish resizing
   */
  const finishResize = () => {
    if (isVertexDragging.value) {
      finishVertexDrag()
    }

    isResizing.value = false
    resizeHandle.value = null
    resizeStart.value = null
    resizeOriginalBounds.value = null
    isVertexDragging.value = false
    vertexOriginalPolygon.value = null

    // Hide magnifier
    onMagnifierHide?.()
  }

  /**
   * Finish polygon vertex drag — validate and commit or revert
   */
  const finishVertexDrag = () => {
    const selectedIndex = getSelectedIndex()
    if (selectedIndex === null) return

    const region = getSelectedRegion()
    if (!region || !vertexOriginalPolygon.value) return

    const currentPolygon = region.polygon

    // Validate the quad
    if (isValidQuad && !isValidQuad(currentPolygon)) {
      // Invalid (self-intersecting) — revert to original polygon
      const revertBounds = polygonToBoundsLocal(vertexOriginalPolygon.value)
      onResize({
        index: selectedIndex,
        bounds: revertBounds,
        polygon: vertexOriginalPolygon.value,
      })
      onVertexInvalid?.()
      return
    }

    // Valid — commit via onMoveVertex
    onMoveVertex?.({ index: selectedIndex, polygon: currentPolygon })
  }

  /**
   * Local helper to compute bounds from polygon
   */
  const polygonToBoundsLocal = (polygon) => {
    const xs = polygon.map((p) => p[0])
    const ys = polygon.map((p) => p[1])
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    return {
      x: minX,
      y: minY,
      width: Math.max(...xs) - minX,
      height: Math.max(...ys) - minY,
    }
  }

  // ============================================================================
  // Touch Events
  // ============================================================================

  /**
   * Start resizing on touch
   * @param {string} handle - Handle identifier ('nw', 'ne', 'sw', 'se')
   * @param {TouchEvent} e
   */
  const onResizeTouchStart = (handle, e) => {
    if (e.touches.length !== 1) return
    e.stopPropagation()
    e.preventDefault()

    const selectedIndex = getSelectedIndex()
    if (selectedIndex === null) return

    const region = getSelectedRegion()
    if (!region) return

    isResizing.value = true
    resizeHandle.value = handle

    if (isPolygonMode()) {
      isVertexDragging.value = true
      vertexOriginalPolygon.value = region.polygon.map((p) => [...p])
    } else {
      isVertexDragging.value = false
      resizeStart.value = getTouchImageCoords(e.touches[0])
      resizeOriginalBounds.value = { ...region.bounds }
    }

    // Show magnifier
    const coords = getTouchImageCoords(e.touches[0])
    onMagnifierShow?.(coords)
  }

  /**
   * Handle resize touch move
   * @param {TouchEvent} e
   * @returns {boolean} True if event was handled
   */
  const onResizeTouchMove = (e) => {
    if (!isResizing.value) return false
    if (e.touches.length !== 1) return false

    e.preventDefault()
    const coords = getTouchImageCoords(e.touches[0])
    handleResizeMove(coords)
    return true
  }

  /**
   * Handle resize touch end
   * @param {TouchEvent} e
   * @returns {boolean} True if event was handled
   */
  const onResizeTouchEnd = (e) => {
    if (!isResizing.value) return false
    e.preventDefault()
    finishResize()
    return true
  }

  return {
    // State
    isResizing,
    resizeHandle,
    isVertexDragging,
    // Computed
    isActive,
    // Mouse events
    onResizeStart,
    handleResizeMove,
    finishResize,
    // Touch events
    onResizeTouchStart,
    onResizeTouchMove,
    onResizeTouchEnd,
  }
}
