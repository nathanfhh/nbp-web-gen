/**
 * Separator Tool composable for OCR Region Editor
 *
 * Handles separator line drawing (two-point) and selection/deletion.
 * Separator lines prevent automatic text block merging during layout analysis.
 */

import { ref, computed } from 'vue'

/**
 * @param {Object} options
 * @param {Function} options.getImageCoords - Function to convert event to image coords: (e) => {x, y}
 * @param {Function} options.onAddSeparator - Callback when separator is added: ({start, end}) => void
 * @param {Function} options.onDeleteSeparator - Callback when separator is deleted: (id) => void
 * @param {Function} options.onModeEnter - Callback when separator mode is entered: () => void
 * @param {Function} options.onModeExit - Callback when separator mode is exited: () => void
 */
export function useSeparatorTool({
  getImageCoords,
  onAddSeparator,
  onDeleteSeparator,
  onModeEnter,
  onModeExit,
}) {
  // State
  const isSeparatorModeActive = ref(false)
  const separatorFirstPoint = ref(null)
  const separatorPreview = ref(null) // { start, end } for preview line
  const selectedSeparatorId = ref(null)

  /**
   * Check if separator mode is active
   */
  const isActive = computed(() => isSeparatorModeActive.value)

  /**
   * Check if currently drawing (first point is set)
   */
  const isDrawing = computed(() => separatorFirstPoint.value !== null)

  /**
   * Toggle separator mode on/off
   */
  const toggleSeparatorMode = (forceState = null) => {
    const newState = forceState !== null ? forceState : !isSeparatorModeActive.value

    if (newState) {
      // Entering separator mode
      isSeparatorModeActive.value = true
      onModeEnter?.()
    } else {
      // Exiting separator mode
      isSeparatorModeActive.value = false
      resetDrawingState()
      onModeExit?.()
    }
  }

  /**
   * Reset drawing state
   */
  const resetDrawingState = () => {
    separatorFirstPoint.value = null
    separatorPreview.value = null
  }

  /**
   * Cancel current drawing (first point) without exiting mode
   */
  const cancelDrawing = () => {
    resetDrawingState()
  }

  // ============================================================================
  // Drawing Events
  // ============================================================================

  /**
   * Handle click for separator line drawing (two-point)
   * @param {MouseEvent} e
   * @returns {boolean} True if event was handled
   */
  const onSeparatorClick = (e) => {
    if (!isSeparatorModeActive.value) return false
    e.stopPropagation()

    const coords = getImageCoords(e)

    if (!separatorFirstPoint.value) {
      // First point: start the line
      separatorFirstPoint.value = coords
    } else {
      // Second point: finish the line
      onAddSeparator({
        start: separatorFirstPoint.value,
        end: coords,
      })
      // Reset for next line
      resetDrawingState()
    }
    return true
  }

  /**
   * Update separator preview line on mouse move
   * @param {{x: number, y: number}} coords - Current image coordinates
   * @returns {boolean} True if preview was updated
   */
  const updateSeparatorPreview = (coords) => {
    if (!isSeparatorModeActive.value || !separatorFirstPoint.value) return false

    separatorPreview.value = {
      start: separatorFirstPoint.value,
      end: coords,
    }
    return true
  }

  // ============================================================================
  // Selection Events
  // ============================================================================

  /**
   * Select a separator line by clicking on it
   * @param {string|number} separatorId - Separator ID
   * @param {Event} e - Click event
   * @param {Function} isDrawModeActive - Function to check if draw mode is active
   * @param {Function} clearRegionSelection - Optional callback to clear region selection
   */
  const onSeparatorClick_Select = (separatorId, e, isDrawModeActive, clearRegionSelection) => {
    // Original behavior: only block when separator mode or draw mode is active
    if (isSeparatorModeActive.value || isDrawModeActive?.()) return
    e.stopPropagation()
    selectedSeparatorId.value = separatorId
    // Clear region selection when selecting a separator (mutual exclusion)
    clearRegionSelection?.()
  }

  /**
   * Delete the currently selected separator line
   * @param {Event} e - Click event
   */
  const onDeleteSeparatorClick = (e) => {
    e.stopPropagation()
    if (selectedSeparatorId.value !== null) {
      onDeleteSeparator(selectedSeparatorId.value)
      selectedSeparatorId.value = null
    }
  }

  /**
   * Clear separator selection
   */
  const clearSelection = () => {
    selectedSeparatorId.value = null
  }

  /**
   * Check if a specific separator is selected
   * @param {string|number} id - Separator ID
   * @returns {boolean} True if separator is selected
   */
  const isSelected = (id) => {
    return selectedSeparatorId.value === id
  }

  /**
   * Check if any separator is selected
   * @returns {boolean} True if any separator is selected
   */
  const hasSelection = () => {
    return selectedSeparatorId.value !== null
  }

  /**
   * Get the currently selected separator ID
   * @returns {string|number|null} Selected ID or null
   */
  const getSelectedId = () => {
    return selectedSeparatorId.value
  }

  return {
    // State
    isSeparatorModeActive,
    separatorFirstPoint,
    separatorPreview,
    selectedSeparatorId,
    // Computed
    isActive,
    isDrawing,
    // Mode control
    toggleSeparatorMode,
    resetDrawingState,
    cancelDrawing,
    // Drawing events
    onSeparatorClick,
    updateSeparatorPreview,
    // Selection events
    onSeparatorClick_Select,
    onDeleteSeparatorClick,
    clearSelection,
    isSelected,
    hasSelection,
    getSelectedId,
  }
}
