/**
 * Draw Tool composable for OCR Region Editor
 *
 * Handles rectangle drawing for creating new regions.
 * Supports both mouse and touch interactions.
 */

import { ref, computed } from 'vue'

// Minimum size for a valid region (in image coordinates)
const MIN_REGION_SIZE = 10

/**
 * @param {Object} options
 * @param {Function} options.getImageCoords - Function to convert event to image coords: (e) => {x, y}
 * @param {Function} options.getTouchImageCoords - Function to convert touch to image coords: (touch) => {x, y}
 * @param {Function} options.onDrawComplete - Callback when drawing completes with valid size: (bounds) => void
 * @param {Function} options.onModeEnter - Callback when draw mode is entered: () => void
 * @param {Function} options.onModeExit - Callback when draw mode is exited: () => void
 */
export function useDrawTool({
  getImageCoords,
  getTouchImageCoords,
  onDrawComplete,
  onModeEnter,
  onModeExit,
}) {
  // State
  const isDrawModeActive = ref(false)
  const isDrawing = ref(false)
  const drawStart = ref(null)
  const drawRect = ref(null)

  /**
   * Check if draw mode is active
   */
  const isActive = computed(() => isDrawModeActive.value)

  /**
   * Toggle draw mode on/off
   */
  const toggleDrawMode = (forceState = null) => {
    const newState = forceState !== null ? forceState : !isDrawModeActive.value

    if (newState) {
      // Entering draw mode
      isDrawModeActive.value = true
      onModeEnter?.()
    } else {
      // Exiting draw mode
      isDrawModeActive.value = false
      resetDrawingState()
      onModeExit?.()
    }
  }

  /**
   * Reset drawing state (called when exiting draw mode or finishing)
   */
  const resetDrawingState = () => {
    isDrawing.value = false
    drawStart.value = null
    drawRect.value = null
  }

  // ============================================================================
  // Mouse Events
  // ============================================================================

  /**
   * Handle mouse down - start drawing
   * @param {MouseEvent} e
   * @returns {boolean} True if event was handled
   */
  const onMouseDown = (e) => {
    if (!isDrawModeActive.value) return false

    e.stopPropagation()
    const coords = getImageCoords(e)
    drawStart.value = coords
    isDrawing.value = true
    return true
  }

  /**
   * Handle mouse move - update drawing preview
   * @param {MouseEvent} e
   * @returns {boolean} True if event was handled
   */
  const onMouseMove = (e) => {
    if (!isDrawing.value || !drawStart.value) return false

    const current = getImageCoords(e)
    drawRect.value = {
      x: Math.min(drawStart.value.x, current.x),
      y: Math.min(drawStart.value.y, current.y),
      width: Math.abs(current.x - drawStart.value.x),
      height: Math.abs(current.y - drawStart.value.y),
    }
    return true
  }

  /**
   * Handle mouse up - finish drawing
   * @returns {boolean} True if event was handled
   */
  const onMouseUp = () => {
    if (!isDrawing.value) return false
    finishDrawing()
    return true
  }

  // ============================================================================
  // Touch Events
  // ============================================================================

  /**
   * Handle touch start - start drawing
   * @param {TouchEvent} e
   * @returns {boolean} True if event was handled
   */
  const onTouchStart = (e) => {
    if (!isDrawModeActive.value) return false
    if (e.touches.length !== 1) return false

    e.preventDefault()
    e.stopPropagation()

    const coords = getTouchImageCoords(e.touches[0])
    drawStart.value = coords
    isDrawing.value = true
    return true
  }

  /**
   * Handle touch move - update drawing preview
   * @param {TouchEvent} e
   * @returns {boolean} True if event was handled
   */
  const onTouchMove = (e) => {
    if (!isDrawing.value || !drawStart.value) return false
    if (e.touches.length !== 1) return false

    e.preventDefault()
    const current = getTouchImageCoords(e.touches[0])
    drawRect.value = {
      x: Math.min(drawStart.value.x, current.x),
      y: Math.min(drawStart.value.y, current.y),
      width: Math.abs(current.x - drawStart.value.x),
      height: Math.abs(current.y - drawStart.value.y),
    }
    return true
  }

  /**
   * Handle touch end - finish drawing
   * @param {TouchEvent} e
   * @returns {boolean} True if event was handled
   */
  const onTouchEnd = (e) => {
    if (!isDrawing.value) return false
    e.preventDefault()
    finishDrawing()
    return true
  }

  // ============================================================================
  // Core Logic
  // ============================================================================

  /**
   * Finish drawing and trigger callback if size is valid
   */
  const finishDrawing = () => {
    if (!isDrawing.value || !drawRect.value) {
      resetDrawingState()
      return
    }

    // Check minimum size
    if (drawRect.value.width >= MIN_REGION_SIZE && drawRect.value.height >= MIN_REGION_SIZE) {
      onDrawComplete({ ...drawRect.value })
    }

    resetDrawingState()
  }

  return {
    // State
    isDrawModeActive,
    isDrawing,
    drawRect,
    // Computed
    isActive,
    // Mode control
    toggleDrawMode,
    resetDrawingState,
    // Mouse events
    onMouseDown,
    onMouseMove,
    onMouseUp,
    // Touch events
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  }
}
