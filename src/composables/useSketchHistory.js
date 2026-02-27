/**
 * Sketch History composable for undo/redo functionality
 *
 * Uses the generator store for state persistence across edit sessions.
 * History is stored in RAM and persists until page refresh.
 */

import { storeToRefs } from 'pinia'
import { useGeneratorStore } from '@/stores/generator'

/**
 * @param {Object} options
 * @param {Function} options.getFabricCanvas - Function to get the Fabric.js canvas instance
 */
export function useSketchHistory({ getFabricCanvas }) {
  const store = useGeneratorStore()

  // Use storeToRefs to maintain reactivity for computed properties
  const { sketchCanUndo, sketchCanRedo, sketchHistoryIndex } = storeToRefs(store)

  // Flag to prevent saving during restore operations
  let isRestoring = false

  // ============================================================================
  // Computed (delegate to store)
  // ============================================================================

  // Alias for external use
  const canUndo = sketchCanUndo
  const canRedo = sketchCanRedo

  // ============================================================================
  // Methods
  // ============================================================================

  /**
   * Save current canvas state as a snapshot
   * Called after each completed stroke
   */
  const saveSnapshot = () => {
    const canvas = getFabricCanvas()
    if (!canvas || isRestoring) return

    // Get current canvas state as JSON
    // Include backgroundImage explicitly to preserve it during undo/redo
    const json = JSON.stringify(canvas.toJSON(['backgroundImage']))

    store.saveSketchSnapshot(json)
  }

  /**
   * Restore canvas to a specific history state
   */
  const restoreSnapshot = async (index) => {
    const canvas = getFabricCanvas()
    if (!canvas) return

    const json = store.getSketchSnapshot(index)
    if (!json) return

    isRestoring = true

    try {
      await canvas.loadFromJSON(json)
      canvas.renderAll()
      store.setSketchHistoryIndex(index)
    } finally {
      isRestoring = false
    }
  }

  /**
   * Undo the last action
   */
  const undo = () => {
    if (!canUndo.value) return
    restoreSnapshot(sketchHistoryIndex.value - 1)
  }

  /**
   * Redo the previously undone action
   */
  const redo = () => {
    if (!canRedo.value) return
    restoreSnapshot(sketchHistoryIndex.value + 1)
  }

  /**
   * Reset history (clear all snapshots)
   */
  const reset = () => {
    store.clearSketchHistory()
  }

  // ============================================================================
  // Return API
  // ============================================================================

  return {
    // State (reactive)
    canUndo,
    canRedo,

    // Methods
    saveSnapshot,
    undo,
    redo,
    reset,
  }
}
