import { ref, onMounted, onUnmounted } from 'vue'

/**
 * Composable for managing browser history state to handle back gesture/button
 * for modal/overlay components (lightbox, cropper, etc.)
 *
 * @param {string} stateKey - Unique key for this component's history state (e.g., 'lightbox', 'stickerCropper')
 * @param {Object} options - Configuration options
 * @param {Function} options.onBackNavigation - Callback when user navigates back while component is open
 */
export function useHistoryState(stateKey, { onBackNavigation } = {}) {
  const isStatePushed = ref(false)

  /**
   * Handle browser back button / gesture
   */
  const handlePopState = (e) => {
    if (isStatePushed.value && e.state?.[stateKey] !== true) {
      // User pressed back while our state is active
      isStatePushed.value = false
      onBackNavigation?.()
    }
  }

  /**
   * Push history state when opening the component
   */
  const pushState = () => {
    if (isStatePushed.value) return

    history.pushState({ [stateKey]: true }, '')
    isStatePushed.value = true
  }

  /**
   * Pop history state when closing the component
   * @returns {boolean} - Whether a state was popped
   */
  const popState = () => {
    if (!isStatePushed.value) return false

    isStatePushed.value = false

    // Only go back if we're on our pushed state
    if (history.state?.[stateKey] === true) {
      history.back()
      return true
    }
    return false
  }

  /**
   * Clean up history state before router navigation
   * This is critical to avoid conflicts with vue-router
   * @returns {Promise<void>} - Resolves when cleanup is complete
   */
  const cleanupBeforeNavigation = async () => {
    if (!isStatePushed.value) return

    // Remove listener first to avoid callback during cleanup
    window.removeEventListener('popstate', handlePopState)
    isStatePushed.value = false

    if (history.state?.[stateKey] === true) {
      history.back()
      // Wait for history state to actually change
      await waitForHistoryChange(stateKey)
    }
  }

  /**
   * Force cleanup (for unmount scenarios)
   */
  const forceCleanup = () => {
    if (isStatePushed.value && history.state?.[stateKey] === true) {
      history.back()
    }
    isStatePushed.value = false
  }

  // Setup and cleanup
  onMounted(() => {
    window.addEventListener('popstate', handlePopState)
  })

  onUnmounted(() => {
    window.removeEventListener('popstate', handlePopState)
    forceCleanup()
  })

  return {
    isStatePushed,
    pushState,
    popState,
    cleanupBeforeNavigation,
    forceCleanup,
  }
}

/**
 * Wait for history state to change (more robust than fixed timeout)
 * @param {string} stateKey - The state key to check
 * @param {number} maxWaitMs - Maximum wait time in milliseconds
 * @returns {Promise<void>}
 */
function waitForHistoryChange(stateKey, maxWaitMs = 500) {
  return new Promise((resolve) => {
    const startTime = Date.now()
    const checkInterval = 10

    const check = () => {
      // State has changed - we're done
      if (history.state?.[stateKey] !== true) {
        resolve()
        return
      }

      // Timeout - resolve anyway to avoid infinite wait
      if (Date.now() - startTime >= maxWaitMs) {
        console.warn(`[useHistoryState] Timeout waiting for history state change for "${stateKey}"`)
        resolve()
        return
      }

      // Keep checking
      setTimeout(check, checkInterval)
    }

    // Start checking after a small delay (history.back is async)
    setTimeout(check, checkInterval)
  })
}
