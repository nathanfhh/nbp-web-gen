/**
 * Selection Tool composable for OCR Region Editor
 *
 * Handles batch selection of regions using a rectangle selection box.
 * Allows users to select multiple regions for batch deletion.
 */

import { ref, computed } from 'vue'

/**
 * @param {Object} options
 * @param {Function} options.getImageCoords - Function to convert event to image coords: (e) => {x, y}
 * @param {Function} options.getRegions - Function to get current regions: () => Array
 * @param {Function} options.rectsIntersect - Function to check rect intersection: (r1, r2) => boolean
 * @param {Function} options.onBatchDelete - Callback when batch delete is confirmed: (indices) => void
 * @param {Function} options.onModeEnter - Callback when selection mode is entered: () => void
 * @param {Function} options.onModeExit - Callback when selection mode is exited: () => void
 */
export function useSelectionTool({
  getImageCoords,
  getRegions,
  rectsIntersect,
  onBatchDelete,
  onModeEnter,
  onModeExit,
}) {
  // State
  const isSelectionModeActive = ref(false)
  const isSelecting = ref(false)
  const selectionStart = ref(null)
  const selectionRect = ref(null)
  const selectedRegionIndices = ref([])

  /**
   * Check if selection mode is active
   */
  const isActive = computed(() => isSelectionModeActive.value)

  /**
   * Check if currently selecting (dragging)
   */
  const isCurrentlySelecting = computed(() => isSelecting.value)

  /**
   * Check if there are selected regions pending confirmation
   */
  const hasPendingSelection = computed(
    () => selectionRect.value !== null && selectedRegionIndices.value.length > 0 && !isSelecting.value,
  )

  /**
   * Toggle selection mode on/off
   */
  const toggleSelectionMode = (forceState = null) => {
    const newState = forceState !== null ? forceState : !isSelectionModeActive.value

    if (newState) {
      // Entering selection mode
      isSelectionModeActive.value = true
      onModeEnter?.()
    } else {
      // Exiting selection mode
      isSelectionModeActive.value = false
      resetSelectionState()
      onModeExit?.()
    }
  }

  /**
   * Reset all selection state
   */
  const resetSelectionState = () => {
    isSelecting.value = false
    selectionStart.value = null
    selectionRect.value = null
    selectedRegionIndices.value = []
  }

  /**
   * Update selected regions based on current selection rect
   */
  const updateSelectedRegions = () => {
    if (!selectionRect.value) {
      selectedRegionIndices.value = []
      return
    }

    const regions = getRegions()
    const indices = []
    regions.forEach((region, idx) => {
      if (rectsIntersect(selectionRect.value, region.bounds)) {
        indices.push(idx)
      }
    })
    selectedRegionIndices.value = indices
  }

  // ============================================================================
  // Mouse Events
  // ============================================================================

  /**
   * Handle mouse down - start selection
   * @param {MouseEvent} e
   * @returns {boolean} True if event was handled
   */
  const onMouseDown = (e) => {
    if (!isSelectionModeActive.value) return false

    e.stopPropagation()
    const coords = getImageCoords(e)
    selectionStart.value = coords
    isSelecting.value = true
    selectionRect.value = { x: coords.x, y: coords.y, width: 0, height: 0 }
    selectedRegionIndices.value = []
    return true
  }

  /**
   * Handle mouse move - update selection rect
   * @param {MouseEvent} e
   * @returns {boolean} True if event was handled
   */
  const onMouseMove = (e) => {
    if (!isSelecting.value || !selectionStart.value) return false

    const current = getImageCoords(e)
    selectionRect.value = {
      x: Math.min(selectionStart.value.x, current.x),
      y: Math.min(selectionStart.value.y, current.y),
      width: Math.abs(current.x - selectionStart.value.x),
      height: Math.abs(current.y - selectionStart.value.y),
    }
    updateSelectedRegions()
    return true
  }

  /**
   * Handle mouse up - finish selection
   * @returns {boolean} True if event was handled
   */
  const onMouseUp = () => {
    if (!isSelecting.value) return false

    isSelecting.value = false
    // If no regions selected, cancel selection
    if (selectedRegionIndices.value.length === 0) {
      cancelSelection()
    }
    // Otherwise keep selectionRect visible for confirmation UI
    return true
  }

  // ============================================================================
  // Actions
  // ============================================================================

  /**
   * Confirm and delete selected regions
   */
  const confirmBatchDelete = () => {
    if (selectedRegionIndices.value.length === 0) return

    // Emit batch delete with the selected region indices
    onBatchDelete([...selectedRegionIndices.value])

    // Reset selection state
    resetSelectionState()
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

  /**
   * Get the number of selected regions
   * @returns {number} Count of selected regions
   */
  const getSelectedCount = () => {
    return selectedRegionIndices.value.length
  }

  return {
    // State
    isSelectionModeActive,
    isSelecting,
    selectionRect,
    selectedRegionIndices,
    // Computed
    isActive,
    isCurrentlySelecting,
    hasPendingSelection,
    // Mode control
    toggleSelectionMode,
    resetSelectionState,
    // Mouse events
    onMouseDown,
    onMouseMove,
    onMouseUp,
    // Actions
    confirmBatchDelete,
    cancelSelection,
    getSelectedCount,
  }
}
