/**
 * Resize Tool composable for OCR Region Editor
 *
 * Handles region resizing via corner handles.
 * Supports both mouse and touch interactions with optional magnifier integration.
 */

import { ref, computed } from 'vue'

// Minimum region size during resize
const MIN_SIZE = 10

/**
 * @param {Object} options
 * @param {Function} options.getImageCoords - Function to convert event to image coords: (e) => {x, y}
 * @param {Function} options.getTouchImageCoords - Function to convert touch to image coords: (touch) => {x, y}
 * @param {Function} options.getSelectedRegion - Function to get selected region: () => Region|null
 * @param {Function} options.getSelectedIndex - Function to get selected index: () => number|null
 * @param {Function} options.getImageDimensions - Function to get image dimensions: () => {width, height}
 * @param {Function} options.onResize - Callback during resize: ({index, bounds}) => void
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
  onMagnifierShow,
  onMagnifierUpdate,
  onMagnifierHide,
}) {
  // State
  const isResizing = ref(false)
  const resizeHandle = ref(null) // 'nw', 'ne', 'sw', 'se'
  const resizeStart = ref(null)
  const resizeOriginalBounds = ref(null)

  /**
   * Check if currently resizing
   */
  const isActive = computed(() => isResizing.value)

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
    resizeStart.value = getImageCoords(e)
    resizeOriginalBounds.value = { ...region.bounds }

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
    if (!isResizing.value || !resizeOriginalBounds.value || selectedIndex === null) return

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

    // Update magnifier
    onMagnifierUpdate?.(coords)
  }

  /**
   * Finish resizing
   */
  const finishResize = () => {
    isResizing.value = false
    resizeHandle.value = null
    resizeStart.value = null
    resizeOriginalBounds.value = null

    // Hide magnifier
    onMagnifierHide?.()
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
    resizeStart.value = getTouchImageCoords(e.touches[0])
    resizeOriginalBounds.value = { ...region.bounds }

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
