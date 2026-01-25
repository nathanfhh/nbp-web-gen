/**
 * Editor Keyboard composable for OCR Region Editor
 *
 * Handles keyboard shortcuts for the region editor:
 * - Ctrl+Z / Cmd+Z: Undo
 * - Ctrl+Shift+Z / Cmd+Shift+Z / Ctrl+Y / Cmd+Y: Redo
 * - Escape: Exit modes or cancel actions
 * - Delete / Backspace: Delete selected separator
 * - R: Reset
 * - D: Draw mode (rectangle)
 * - S: Separator mode
 * - V: Selection mode
 * - T: Trapezoid toggle (when region selected)
 */

import { onMounted, onUnmounted } from 'vue'

/**
 * @param {Object} options
 * @param {Function} options.onUndo - Callback for undo action
 * @param {Function} options.onRedo - Callback for redo action
 * @param {Function} options.canUndo - Function to check if undo is available: () => boolean
 * @param {Function} options.canRedo - Function to check if redo is available: () => boolean
 * @param {Function} options.isTextDialogOpen - Function to check if text dialog is open: () => boolean
 * @param {Function} options.cancelTextDialog - Callback to cancel text dialog
 * @param {Function} options.hasPendingSelection - Function to check pending selection: () => boolean
 * @param {Function} options.cancelSelection - Callback to cancel selection
 * @param {Function} options.isSelectionModeActive - Function to check selection mode: () => boolean
 * @param {Function} options.toggleSelectionMode - Callback to toggle selection mode
 * @param {Function} options.isSeparatorModeActive - Function to check separator mode: () => boolean
 * @param {Function} options.isSeparatorDrawing - Function to check if separator is being drawn: () => boolean
 * @param {Function} options.cancelSeparatorDrawing - Callback to cancel separator drawing
 * @param {Function} options.toggleSeparatorMode - Callback to toggle separator mode
 * @param {Function} options.isDrawModeActive - Function to check draw mode: () => boolean
 * @param {Function} options.toggleDrawMode - Callback to toggle draw mode
 * @param {Function} options.hasSelectedSeparator - Function to check selected separator: () => boolean
 * @param {Function} options.getSelectedSeparatorId - Function to get selected separator ID: () => string|number|null
 * @param {Function} options.deleteSeparator - Callback to delete separator: (id) => void
 * @param {Function} options.onReset - Callback for reset action (R key)
 * @param {Function} options.onToggleTrapezoid - Callback for trapezoid toggle (T key)
 * @param {Function} options.hasSelectedRegion - Function to check if a region is selected: () => boolean
 */
export function useEditorKeyboard({
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  isTextDialogOpen,
  cancelTextDialog,
  hasPendingSelection,
  cancelSelection,
  isSelectionModeActive,
  toggleSelectionMode,
  isSeparatorModeActive,
  isSeparatorDrawing,
  cancelSeparatorDrawing,
  toggleSeparatorMode,
  isDrawModeActive,
  toggleDrawMode,
  hasSelectedSeparator,
  getSelectedSeparatorId,
  deleteSeparator,
  onReset,
  onToggleTrapezoid,
  hasSelectedRegion,
}) {
  /**
   * Handle keydown events
   * @param {KeyboardEvent} e
   */
  const handleKeydown = (e) => {
    const textDialogOpen = isTextDialogOpen()

    // =========================================================================
    // Escape: Always handle (closes text dialog if open, or exits modes)
    // =========================================================================
    if (e.key === 'Escape') {
      if (textDialogOpen) {
        cancelTextDialog()
        return
      }

      // Cancel pending selection
      if (hasPendingSelection()) {
        cancelSelection()
        return
      }

      // Exit selection mode
      if (isSelectionModeActive()) {
        toggleSelectionMode()
        return
      }

      // Cancel separator drawing or exit separator mode
      if (isSeparatorModeActive()) {
        if (isSeparatorDrawing()) {
          cancelSeparatorDrawing()
        } else {
          toggleSeparatorMode()
        }
        return
      }

      // Exit draw mode
      if (isDrawModeActive()) {
        toggleDrawMode()
        return
      }

      return
    }

    // =========================================================================
    // Skip all other shortcuts when text dialog is open
    // (Let the input field handle its own keyboard events)
    // =========================================================================
    if (textDialogOpen) return

    // =========================================================================
    // Modifier key shortcuts (Ctrl/Cmd combinations)
    // =========================================================================

    // Undo: Ctrl+Z / Cmd+Z
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault()
      if (canUndo()) {
        onUndo()
      }
      return
    }

    // Redo: Ctrl+Shift+Z / Cmd+Shift+Z or Ctrl+Y / Cmd+Y
    if ((e.ctrlKey || e.metaKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
      e.preventDefault()
      if (canRedo()) {
        onRedo()
      }
      return
    }

    // =========================================================================
    // Delete/Backspace: Delete selected separator
    // =========================================================================
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (hasSelectedSeparator()) {
        const id = getSelectedSeparatorId()
        if (id !== null) {
          deleteSeparator(id)
        }
      }
      return
    }

    // =========================================================================
    // Single-key tool shortcuts
    // =========================================================================

    // R: Reset
    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault()
      onReset?.()
      return
    }

    // D: Draw mode (rectangle)
    if (e.key === 'd' || e.key === 'D') {
      e.preventDefault()
      toggleDrawMode?.()
      return
    }

    // S: Separator mode
    if (e.key === 's' || e.key === 'S') {
      e.preventDefault()
      toggleSeparatorMode?.()
      return
    }

    // V: Selection mode
    if (e.key === 'v' || e.key === 'V') {
      e.preventDefault()
      toggleSelectionMode?.()
      return
    }

    // T: Trapezoid toggle (only when a region is selected)
    if (e.key === 't' || e.key === 'T') {
      if (hasSelectedRegion?.()) {
        e.preventDefault()
        onToggleTrapezoid?.()
      }
      return
    }
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  onMounted(() => {
    window.addEventListener('keydown', handleKeydown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown)
  })

  return {
    // Exposed for testing if needed
    handleKeydown,
  }
}
