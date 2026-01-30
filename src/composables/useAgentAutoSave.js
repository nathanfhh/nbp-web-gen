import { ref } from 'vue'
import { useGeneratorStore } from '@/stores/generator'

/**
 * Agent conversation auto-save composable
 *
 * Provides automatic saving of agent conversations during streaming:
 * - Debounced saves during streaming (every 2.5s)
 * - Emergency saves on visibilitychange (mobile app switch)
 * - Emergency saves on beforeunload (page close/navigation)
 *
 * Usage:
 * ```js
 * const autoSave = useAgentAutoSave()
 * onMounted(() => autoSave.setup())
 * onUnmounted(() => autoSave.cleanup())
 *
 * // During streaming:
 * onPart: () => autoSave.triggerDebouncedSave()
 * onComplete: () => autoSave.cancelDebouncedSave()
 * onError: () => autoSave.cancelDebouncedSave()
 * ```
 */
export function useAgentAutoSave() {
  const store = useGeneratorStore()

  const isSaving = ref(false)
  let debounceTimer = null
  const DEBOUNCE_DELAY = 2500 // 2.5 seconds

  /**
   * Trigger debounced save (called during streaming)
   * Resets timer on each call, so save happens 2.5s after last chunk
   */
  const triggerDebouncedSave = () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(async () => {
      debounceTimer = null
      await performSave(true) // includeStreaming = true
    }, DEBOUNCE_DELAY)
  }

  /**
   * Cancel pending debounced save
   * Call this when streaming ends (complete or error)
   */
  const cancelDebouncedSave = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
  }

  /**
   * Perform emergency save immediately
   * Used for visibilitychange and beforeunload events
   */
  const performEmergencySave = async () => {
    cancelDebouncedSave()
    await performSave(true)
  }

  /**
   * Execute the save operation
   * @param {boolean} includeStreaming - Whether to include current streaming message
   */
  const performSave = async (includeStreaming = false) => {
    // Prevent concurrent saves
    if (isSaving.value) return

    // Skip if nothing to save
    if (store.agentConversation.length === 0 && !store.agentStreamingMessage) {
      return
    }

    isSaving.value = true
    try {
      await store.saveAgentConversation({ includeStreaming })
    } catch (err) {
      console.error('[AgentAutoSave] Save failed:', err)
    } finally {
      isSaving.value = false
    }
  }

  /**
   * Handle visibility change (tab switch, mobile app switch)
   * Save immediately when page becomes hidden
   */
  const handleVisibilityChange = () => {
    if (
      document.hidden &&
      (store.agentStreamingMessage || store.agentConversation.length > 0)
    ) {
      performEmergencySave()
    }
  }

  /**
   * Handle before unload (page close, navigation away)
   * Show confirmation if streaming, attempt emergency save
   */
  const handleBeforeUnload = (e) => {
    if (store.agentStreamingMessage) {
      // Attempt emergency save (may not complete if page closes too fast)
      performEmergencySave()
      // Show browser's native confirmation dialog
      e.preventDefault()
      e.returnValue = ''
    }
  }

  /**
   * Set up event listeners
   * Call this in onMounted
   */
  const setup = () => {
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('beforeunload', handleBeforeUnload)
  }

  /**
   * Clean up event listeners and pending timers
   * Call this in onUnmounted
   */
  const cleanup = () => {
    cancelDebouncedSave()
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    window.removeEventListener('beforeunload', handleBeforeUnload)
  }

  return {
    isSaving,
    triggerDebouncedSave,
    cancelDebouncedSave,
    performEmergencySave,
    performSave,
    setup,
    cleanup,
  }
}
