/**
 * Sketch History composable for undo/redo functionality
 *
 * Manages canvas state snapshots using Fabric.js JSON serialization.
 * Uses a fixed-size history buffer to limit memory usage.
 */

import { ref, computed } from 'vue'

/**
 * @param {Object} options
 * @param {Function} options.getFabricCanvas - Function to get the Fabric.js canvas instance
 * @param {number} options.maxHistory - Maximum number of history entries (default: 30)
 */
export function useSketchHistory({ getFabricCanvas, maxHistory = 30 }) {
  // ============================================================================
  // State
  // ============================================================================

  // History stores JSON snapshots of canvas state
  const history = ref([])
  const historyIndex = ref(-1)

  // Flag to prevent saving during restore operations
  let isRestoring = false

  // ============================================================================
  // Computed
  // ============================================================================

  const canUndo = computed(() => historyIndex.value > 0)
  const canRedo = computed(() => historyIndex.value < history.value.length - 1)

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
    const json = JSON.stringify(canvas.toJSON())

    // If we're not at the end of history, truncate future states
    if (historyIndex.value < history.value.length - 1) {
      history.value = history.value.slice(0, historyIndex.value + 1)
    }

    // Add new snapshot
    history.value.push(json)

    // Trim history if it exceeds max size
    if (history.value.length > maxHistory) {
      history.value.shift()
      // Adjust index since we removed from the beginning
      historyIndex.value--
    }

    // Update index to point to latest
    historyIndex.value = history.value.length - 1
  }

  /**
   * Restore canvas to a specific history state
   */
  const restoreSnapshot = async (index) => {
    const canvas = getFabricCanvas()
    if (!canvas || index < 0 || index >= history.value.length) return

    const json = history.value[index]
    if (!json) return

    isRestoring = true

    try {
      await canvas.loadFromJSON(json)
      canvas.renderAll()
      historyIndex.value = index
    } finally {
      isRestoring = false
    }
  }

  /**
   * Undo the last action
   */
  const undo = () => {
    if (!canUndo.value) return
    restoreSnapshot(historyIndex.value - 1)
  }

  /**
   * Redo the previously undone action
   */
  const redo = () => {
    if (!canRedo.value) return
    restoreSnapshot(historyIndex.value + 1)
  }

  /**
   * Reset history (clear all snapshots)
   */
  const reset = () => {
    history.value = []
    historyIndex.value = -1
  }

  /**
   * Get current history stats (for debugging)
   */
  const getStats = () => ({
    total: history.value.length,
    current: historyIndex.value,
    canUndo: canUndo.value,
    canRedo: canRedo.value,
  })

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
    getStats,
  }
}
