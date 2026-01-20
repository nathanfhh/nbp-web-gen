/**
 * Delete Tool composable for OCR Region Editor
 *
 * Handles single region selection and deletion.
 * Provides click-to-select behavior and delete button logic.
 */

import { ref } from 'vue'

/**
 * @param {Object} options
 * @param {Function} options.onDelete - Callback when region is deleted: (index) => void
 * @param {Function} options.isDrawModeActive - Function to check if draw mode is active: () => boolean
 * @param {Function} options.exitOtherModes - Function to exit other modes: () => void
 */
export function useDeleteTool({ onDelete, isDrawModeActive, exitOtherModes }) {
  // State
  const selectedIndex = ref(null)

  /**
   * Select a region by clicking on it
   * Only blocked when draw mode is active (original behavior)
   * @param {number} index - Region index
   * @param {Event} e - Click event
   */
  const onRegionClick = (index, e) => {
    if (isDrawModeActive()) return
    e.stopPropagation()
    selectedIndex.value = index
  }

  /**
   * Programmatically select a region by index (for parent component)
   * @param {number} index - Region index
   * @param {number} regionsLength - Total number of regions (for bounds check)
   */
  const selectRegion = (index, regionsLength) => {
    if (index < 0 || index >= regionsLength) return
    exitOtherModes()
    selectedIndex.value = index
  }

  /**
   * Handle delete button click
   * @param {Event} e - Click event
   */
  const onDeleteClick = (e) => {
    e.stopPropagation()
    if (selectedIndex.value !== null) {
      onDelete(selectedIndex.value)
      selectedIndex.value = null
    }
  }

  /**
   * Clear selection (deselect current region)
   */
  const clearSelection = () => {
    selectedIndex.value = null
  }

  /**
   * Check if a specific region is selected
   * @param {number} index - Region index
   * @returns {boolean} True if region is selected
   */
  const isSelected = (index) => {
    return selectedIndex.value === index
  }

  /**
   * Check if any region is selected
   * @returns {boolean} True if any region is selected
   */
  const hasSelection = () => {
    return selectedIndex.value !== null
  }

  /**
   * Get the currently selected index
   * @returns {number|null} Selected index or null
   */
  const getSelectedIndex = () => {
    return selectedIndex.value
  }

  return {
    // State
    selectedIndex,
    // Event handlers
    onRegionClick,
    onDeleteClick,
    // Methods
    selectRegion,
    clearSelection,
    isSelected,
    hasSelection,
    getSelectedIndex,
  }
}
