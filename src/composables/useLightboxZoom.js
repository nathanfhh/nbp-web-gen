import { ref, computed } from 'vue'

// Constants for zoom behavior
export const MIN_SCALE = 0.5
export const MAX_SCALE = 5
export const ZOOM_SENSITIVITY = 0.002
export const PINCH_SENSITIVITY = 0.01

/**
 * Composable for lightbox zoom and pan functionality
 * Handles mouse wheel zoom, trackpad gestures, and drag-to-pan
 *
 * @returns {Object} Zoom state and handlers
 */
export function useLightboxZoom() {
  // Zoom and pan state
  const scale = ref(1)
  const translateX = ref(0)
  const translateY = ref(0)
  const isDragging = ref(false)
  const dragStart = ref({ x: 0, y: 0 })
  const imageRef = ref(null)

  /**
   * Reset zoom and pan to default state
   */
  const resetTransform = () => {
    scale.value = 1
    translateX.value = 0
    translateY.value = 0
  }

  /**
   * Constrain pan to keep image visible
   * Allows panning proportional to zoom level
   */
  const constrainPan = () => {
    const maxPanX = Math.max(0, (scale.value - 1) * window.innerWidth * 0.4)
    const maxPanY = Math.max(0, (scale.value - 1) * window.innerHeight * 0.35)
    translateX.value = Math.max(-maxPanX, Math.min(maxPanX, translateX.value))
    translateY.value = Math.max(-maxPanY, Math.min(maxPanY, translateY.value))
  }

  /**
   * Handle wheel event for zoom (scroll) and pan (Mac trackpad)
   * @param {WheelEvent} e - Wheel event
   * @param {boolean} isActive - Whether the lightbox is active
   */
  const handleWheel = (e, isActive = true) => {
    if (!isActive) return
    e.preventDefault()

    // Pinch-to-zoom on Mac trackpad (ctrlKey is set for pinch gestures)
    if (e.ctrlKey) {
      const delta = -e.deltaY * PINCH_SENSITIVITY
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale.value + delta))
      scale.value = newScale
      return
    }

    // Detect mouse wheel vs trackpad:
    // - Mouse wheel: deltaX is 0, deltaY is discrete (typically >=50)
    // - Trackpad: both deltaX and deltaY can have small continuous values
    const isMouseWheel = e.deltaX === 0 && Math.abs(e.deltaY) >= 40

    if (isMouseWheel) {
      // Mouse wheel: always zoom (even when zoomed in)
      const delta = -e.deltaY * ZOOM_SENSITIVITY
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale.value + delta))
      scale.value = newScale
      return
    }

    // Trackpad behavior
    if (scale.value > 1) {
      // When zoomed in: trackpad swipe to pan
      translateX.value -= e.deltaX
      translateY.value -= e.deltaY
      constrainPan()
      return
    }

    // When not zoomed: vertical scroll to zoom
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      const delta = -e.deltaY * ZOOM_SENSITIVITY
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale.value + delta))
      scale.value = newScale
    }
  }

  /**
   * Handle mouse down for drag start (left-click or middle-click)
   * @param {MouseEvent} e - Mouse event
   */
  const handleMouseDown = (e) => {
    // Left mouse button (0) or middle mouse button (1)
    if (e.button === 0 || e.button === 1) {
      e.preventDefault()
      isDragging.value = true
      dragStart.value = { x: e.clientX - translateX.value, y: e.clientY - translateY.value }
    }
  }

  /**
   * Handle mouse move for dragging
   * @param {MouseEvent} e - Mouse event
   */
  const handleMouseMove = (e) => {
    if (!isDragging.value) return
    e.preventDefault()
    translateX.value = e.clientX - dragStart.value.x
    translateY.value = e.clientY - dragStart.value.y
    constrainPan()
  }

  /**
   * Handle global mouse up to end drag
   */
  const handleGlobalMouseUp = () => {
    isDragging.value = false
  }

  /**
   * Handle double-click to toggle zoom
   * @param {MouseEvent} e - Mouse event
   */
  const handleDoubleClick = (e) => {
    e.preventDefault()
    if (scale.value > 1) {
      resetTransform()
    } else {
      scale.value = 2
    }
  }

  /**
   * Focus view on a specific region
   * @param {Object} bounds - Region bounds { x, y, width, height } in image coordinates
   * @param {Object} imageDimensions - Image dimensions { width, height }
   * @param {Object} containerDimensions - Container dimensions { width, height } (viewport)
   */
  const focusOnRegion = (bounds, imageDimensions, containerDimensions) => {
    if (!bounds || !imageDimensions || !containerDimensions) return

    // Step 1: If currently < 100%, zoom to 150% first
    // If already >= 100%, keep current scale
    const targetScale = scale.value < 1 ? 1.5 : Math.max(scale.value, 1.5)
    scale.value = targetScale

    // Step 2: Calculate region center in image coordinates (0-1 normalized)
    const regionCenterX = (bounds.x + bounds.width / 2) / imageDimensions.width
    const regionCenterY = (bounds.y + bounds.height / 2) / imageDimensions.height

    // At scale 1, the image fills the container (object-contain behavior)
    // Calculate how the image is positioned within the container
    const imageAspect = imageDimensions.width / imageDimensions.height
    const containerAspect = containerDimensions.width / containerDimensions.height

    let displayedWidth, displayedHeight
    if (imageAspect > containerAspect) {
      // Image is wider than container - width fills, height is letterboxed
      displayedWidth = containerDimensions.width
      displayedHeight = containerDimensions.width / imageAspect
    } else {
      // Image is taller than container - height fills, width is pillarboxed
      displayedHeight = containerDimensions.height
      displayedWidth = containerDimensions.height * imageAspect
    }

    // Step 3: Calculate the offset from container center to region center (in displayed pixels at scale 1)
    const offsetX = (regionCenterX - 0.5) * displayedWidth
    const offsetY = (regionCenterY - 0.5) * displayedHeight

    // Apply scale to get the actual offset at current zoom
    translateX.value = -offsetX * targetScale
    translateY.value = -offsetY * targetScale

    // Step 4: Constrain to valid pan range
    constrainPan()
  }

  /**
   * Computed transform style for the image
   * @param {boolean} isTouching - Whether touch is active (passed from touch composable)
   */
  const createImageTransformStyle = (isTouching = false) => {
    return computed(() => ({
      transform: `translate(${translateX.value}px, ${translateY.value}px) scale(${scale.value})`,
      cursor: isDragging.value ? 'grabbing' : (scale.value > 1 ? 'grab' : 'default'),
      transition: (isDragging.value || isTouching) ? 'none' : 'transform 0.1s ease-out',
    }))
  }

  return {
    // State
    scale,
    translateX,
    translateY,
    isDragging,
    dragStart,
    imageRef,

    // Methods
    resetTransform,
    constrainPan,
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleGlobalMouseUp,
    handleDoubleClick,
    createImageTransformStyle,
    focusOnRegion,
  }
}
