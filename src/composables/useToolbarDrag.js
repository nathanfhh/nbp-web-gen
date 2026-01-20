/**
 * Toolbar Drag composable for OCR Region Editor
 *
 * Handles dragging of the floating toolbar with mouse and touch support.
 * Automatically initializes position (centered horizontally, adjusted for mobile).
 */

import { ref, onMounted, onUnmounted } from 'vue'

/**
 * @param {Object} options
 * @param {import('vue').Ref<HTMLElement|null>} options.toolbarRef - Reference to the toolbar element
 */
export function useToolbarDrag({ toolbarRef }) {
  // State
  const isToolbarDragging = ref(false)
  const toolbarPos = ref({ x: 0, y: 0 })
  const dragStartPos = ref({ x: 0, y: 0 })
  const hasMoved = ref(false) // Track if user has moved it, to disable auto-centering

  /**
   * Initialize toolbar position (centered horizontally)
   * On mobile (< 640px), position lower to avoid Lightbox header buttons
   */
  const initializePosition = () => {
    if (!toolbarRef.value) return

    const rect = toolbarRef.value.getBoundingClientRect()
    const isMobile = window.innerWidth < 640
    toolbarPos.value = {
      x: (window.innerWidth - rect.width) / 2,
      y: isMobile ? 72 : 16, // 4.5rem on mobile (below Lightbox toolbar ~60px), 1rem on desktop
    }
  }

  /**
   * Constrain position to window bounds
   */
  const constrainToWindow = (x, y) => {
    const maxX = window.innerWidth - (toolbarRef.value?.offsetWidth || 0)
    const maxY = window.innerHeight - (toolbarRef.value?.offsetHeight || 0)
    return {
      x: Math.max(0, Math.min(maxX, x)),
      y: Math.max(0, Math.min(maxY, y)),
    }
  }

  // ============================================================================
  // Mouse Events
  // ============================================================================

  const onToolbarMouseDown = (e) => {
    // Ignore clicks on buttons inside toolbar
    if (e.target.closest('button')) return

    isToolbarDragging.value = true
    hasMoved.value = true
    dragStartPos.value = {
      x: e.clientX - toolbarPos.value.x,
      y: e.clientY - toolbarPos.value.y,
    }
  }

  const onWindowMouseMove = (e) => {
    if (!isToolbarDragging.value) return
    e.preventDefault()

    const newX = e.clientX - dragStartPos.value.x
    const newY = e.clientY - dragStartPos.value.y

    toolbarPos.value = constrainToWindow(newX, newY)
  }

  const onWindowMouseUp = () => {
    isToolbarDragging.value = false
  }

  // ============================================================================
  // Touch Events
  // ============================================================================

  const onToolbarTouchStart = (e) => {
    if (e.target.closest('button')) return
    if (e.touches.length !== 1) return

    isToolbarDragging.value = true
    hasMoved.value = true
    const touch = e.touches[0]
    dragStartPos.value = {
      x: touch.clientX - toolbarPos.value.x,
      y: touch.clientY - toolbarPos.value.y,
    }
  }

  const onWindowTouchMove = (e) => {
    if (!isToolbarDragging.value) return
    if (e.touches.length !== 1) return
    e.preventDefault()

    const touch = e.touches[0]
    const newX = touch.clientX - dragStartPos.value.x
    const newY = touch.clientY - dragStartPos.value.y

    toolbarPos.value = constrainToWindow(newX, newY)
  }

  const onWindowTouchEnd = () => {
    isToolbarDragging.value = false
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  const setupEventListeners = () => {
    window.addEventListener('mousemove', onWindowMouseMove)
    window.addEventListener('mouseup', onWindowMouseUp)
    window.addEventListener('touchmove', onWindowTouchMove, { passive: false })
    window.addEventListener('touchend', onWindowTouchEnd)
  }

  const cleanupEventListeners = () => {
    window.removeEventListener('mousemove', onWindowMouseMove)
    window.removeEventListener('mouseup', onWindowMouseUp)
    window.removeEventListener('touchmove', onWindowTouchMove)
    window.removeEventListener('touchend', onWindowTouchEnd)
  }

  onMounted(() => {
    initializePosition()
    setupEventListeners()
  })

  onUnmounted(() => {
    cleanupEventListeners()
  })

  return {
    // State
    isToolbarDragging,
    toolbarPos,
    hasMoved,
    // Event handlers (to be attached to toolbar element)
    onToolbarMouseDown,
    onToolbarTouchStart,
    // Methods
    initializePosition,
  }
}
