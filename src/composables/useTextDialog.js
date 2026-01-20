/**
 * Text Dialog composable for OCR Region Editor
 *
 * Manages the text input dialog for newly drawn regions.
 * Allows users to optionally enter text for manual regions.
 */

import { ref } from 'vue'

/**
 * @param {Object} options
 * @param {Function} options.onConfirm - Callback when region is confirmed: (bounds, text) => void
 */
export function useTextDialog({ onConfirm }) {
  // State
  const showTextDialog = ref(false)
  const pendingBounds = ref(null)
  const newRegionText = ref('')

  /**
   * Open dialog with pending bounds from drawing
   * @param {Object} bounds - Region bounds {x, y, width, height}
   */
  const openDialog = (bounds) => {
    pendingBounds.value = { ...bounds }
    newRegionText.value = ''
    showTextDialog.value = true
  }

  /**
   * Confirm and add region with entered text
   */
  const confirmNewRegion = () => {
    if (pendingBounds.value) {
      onConfirm(pendingBounds.value, newRegionText.value.trim())
    }
    closeDialog()
  }

  /**
   * Skip text input and add region with empty text
   */
  const skipTextInput = () => {
    if (pendingBounds.value) {
      onConfirm(pendingBounds.value, '')
    }
    closeDialog()
  }

  /**
   * Cancel dialog without adding region
   */
  const cancelTextDialog = () => {
    closeDialog()
  }

  /**
   * Close and reset dialog state
   */
  const closeDialog = () => {
    showTextDialog.value = false
    pendingBounds.value = null
    newRegionText.value = ''
  }

  /**
   * Check if dialog is currently open
   */
  const isOpen = () => showTextDialog.value

  return {
    // State
    showTextDialog,
    pendingBounds,
    newRegionText,
    // Methods
    openDialog,
    confirmNewRegion,
    skipTextInput,
    cancelTextDialog,
    isOpen,
  }
}
