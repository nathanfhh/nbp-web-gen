import { ref, computed } from 'vue'

// Zoom constraints
export const MIN_SCALE = 0.1
export const MAX_SCALE = 5
export const ZOOM_SENSITIVITY = 0.003
export const PINCH_SENSITIVITY = 0.01

/**
 * Composable for separator line management in manual crop mode
 * Handles line drawing, zoom/pan, and coordinate conversion
 */
export function useStickerSeparator() {
  // Mode state
  const segmentationMode = ref('auto') // 'auto' | 'manual'
  const activeTab = ref('editor') // 'editor' | 'results'

  // Line state
  const separatorLines = ref([]) // [{id, start: {x,y}, end: {x,y}}]
  const isDrawing = ref(false) // First point placed
  const firstPoint = ref(null) // Current drawing start point
  const previewLine = ref(null) // Preview while drawing
  const selectedLineId = ref(null) // For deletion
  let lineIdCounter = 0

  // Zoom/Pan state
  const zoom = ref(1)
  const pan = ref({ x: 0, y: 0 })
  const isDragging = ref(false)
  const dragStart = ref({ x: 0, y: 0 })

  // Touch state
  const isTouching = ref(false)
  const touchStartDistance = ref(0)
  const touchStartScale = ref(1)
  const touchStartPos = ref({ x: 0, y: 0 })
  const lastTouchCenter = ref({ x: 0, y: 0 })
  const lastTapTime = ref(0)
  const touchMoved = ref(false)

  // Line management
  const addLine = (start, end) => {
    const id = ++lineIdCounter
    separatorLines.value.push({ id, start, end })
    return id
  }

  const deleteLine = (id) => {
    const index = separatorLines.value.findIndex((l) => l.id === id)
    if (index !== -1) {
      separatorLines.value.splice(index, 1)
    }
    if (selectedLineId.value === id) {
      selectedLineId.value = null
    }
  }

  const clearAllLines = () => {
    separatorLines.value = []
    selectedLineId.value = null
    cancelDrawing()
  }

  const selectLine = (id) => {
    selectedLineId.value = id
  }

  const deselectLine = () => {
    selectedLineId.value = null
  }

  // Drawing management
  const startDrawing = () => {
    isDrawing.value = true
    firstPoint.value = null
    previewLine.value = null
  }

  const cancelDrawing = () => {
    isDrawing.value = false
    firstPoint.value = null
    previewLine.value = null
  }

  const setFirstPoint = (point) => {
    firstPoint.value = point
  }

  const updatePreviewLine = (endPoint) => {
    if (firstPoint.value && endPoint) {
      previewLine.value = {
        start: firstPoint.value,
        end: endPoint,
      }
    }
  }

  const completeDrawing = (endPoint) => {
    if (firstPoint.value && endPoint) {
      addLine(firstPoint.value, endPoint)
    }
    // Reset for next line (stay in drawing mode)
    firstPoint.value = null
    previewLine.value = null
  }

  // Coordinate conversion
  const getImageCoords = (event, containerRef, imageWidth, imageHeight) => {
    if (!containerRef) return null

    const img = containerRef.querySelector('img')
    if (!img) return null

    const imgRect = img.getBoundingClientRect()

    let clientX, clientY
    if (event.touches && event.touches.length > 0) {
      clientX = event.touches[0].clientX
      clientY = event.touches[0].clientY
    } else if (event.changedTouches && event.changedTouches.length > 0) {
      clientX = event.changedTouches[0].clientX
      clientY = event.changedTouches[0].clientY
    } else {
      clientX = event.clientX
      clientY = event.clientY
    }

    const relX = clientX - imgRect.left
    const relY = clientY - imgRect.top

    return {
      x: Math.max(0, Math.min(imageWidth, (relX / imgRect.width) * imageWidth)),
      y: Math.max(0, Math.min(imageHeight, (relY / imgRect.height) * imageHeight)),
    }
  }

  // Zoom/Pan management
  const resetZoomPan = () => {
    zoom.value = 1
    pan.value = { x: 0, y: 0 }
  }

  // Reset view to initial state (image sizing is handled by component)
  const fitToContainer = () => {
    zoom.value = 1
    pan.value = { x: 0, y: 0 }
  }

  const constrainPan = (containerWidth, containerHeight) => {
    const maxPanX = Math.max(0, (zoom.value - 1) * containerWidth * 0.4)
    const maxPanY = Math.max(0, (zoom.value - 1) * containerHeight * 0.35)
    pan.value.x = Math.max(-maxPanX, Math.min(maxPanX, pan.value.x))
    pan.value.y = Math.max(-maxPanY, Math.min(maxPanY, pan.value.y))
  }

  const handleWheel = (e, containerWidth, containerHeight) => {
    e.preventDefault()

    // Disable zoom/pan while in drawing mode to prevent accidental gestures
    if (isDrawing.value) {
      return
    }

    // Pinch-to-zoom on Mac trackpad (ctrlKey is set during pinch gesture)
    if (e.ctrlKey) {
      const delta = -e.deltaY * PINCH_SENSITIVITY
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, zoom.value + delta))
      zoom.value = newScale
      return
    }

    // Detect mouse wheel vs trackpad based on deltaMode and delta values
    // Mouse wheel typically has deltaMode 0 and larger delta values
    const isMouseWheel = e.deltaMode === 0 && e.deltaX === 0 && Math.abs(e.deltaY) >= 20

    if (isMouseWheel) {
      // Mouse wheel: always zoom (both in and out)
      const delta = -e.deltaY * ZOOM_SENSITIVITY * 2 // Increased sensitivity for mouse wheel
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, zoom.value + delta))
      zoom.value = newScale
      return
    }

    // Trackpad: primarily vertical movement = zoom, horizontal = pan when zoomed
    const absX = Math.abs(e.deltaX)
    const absY = Math.abs(e.deltaY)

    // If mostly vertical movement, use for zooming
    if (absY > absX * 1.5) {
      const delta = -e.deltaY * ZOOM_SENSITIVITY
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, zoom.value + delta))
      zoom.value = newScale
    } else if (zoom.value !== 1) {
      // If zoomed and horizontal movement, pan
      pan.value.x -= e.deltaX
      pan.value.y -= e.deltaY
      constrainPan(containerWidth, containerHeight)
    }
  }

  const handleMouseDown = (e) => {
    // Only start drag if not in drawing mode or if middle mouse button
    if ((e.button === 0 && !isDrawing.value) || e.button === 1) {
      e.preventDefault()
      isDragging.value = true
      dragStart.value = { x: e.clientX - pan.value.x, y: e.clientY - pan.value.y }
    }
  }

  const handleMouseMove = (e, containerWidth, containerHeight) => {
    if (!isDragging.value) return
    e.preventDefault()
    pan.value.x = e.clientX - dragStart.value.x
    pan.value.y = e.clientY - dragStart.value.y
    constrainPan(containerWidth, containerHeight)
  }

  const handleMouseUp = () => {
    isDragging.value = false
  }

  // Touch handlers for pinch zoom
  const getTouchDistance = (touches) => {
    const dx = touches[0].clientX - touches[1].clientX
    const dy = touches[0].clientY - touches[1].clientY
    return Math.sqrt(dx * dx + dy * dy)
  }

  const getTouchCenter = (touches) => {
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    }
  }

  const handleTouchStart = (e) => {
    const touches = e.touches
    touchMoved.value = false

    if (touches.length === 1) {
      isTouching.value = true
      touchStartPos.value = {
        x: touches[0].clientX - pan.value.x,
        y: touches[0].clientY - pan.value.y,
      }
      lastTouchCenter.value = {
        x: touches[0].clientX,
        y: touches[0].clientY,
      }
    } else if (touches.length === 2) {
      e.preventDefault()
      isTouching.value = true
      touchStartDistance.value = getTouchDistance(touches)
      touchStartScale.value = zoom.value
      lastTouchCenter.value = getTouchCenter(touches)
      touchStartPos.value = {
        x: lastTouchCenter.value.x - pan.value.x,
        y: lastTouchCenter.value.y - pan.value.y,
      }
    }
  }

  const handleTouchMove = (e, containerWidth, containerHeight) => {
    if (!isTouching.value) return

    const touches = e.touches
    touchMoved.value = true

    if (touches.length === 1 && zoom.value > 1 && !isDrawing.value) {
      // Single finger drag (only when zoomed in and not drawing)
      e.preventDefault()
      pan.value.x = touches[0].clientX - touchStartPos.value.x
      pan.value.y = touches[0].clientY - touchStartPos.value.y
      constrainPan(containerWidth, containerHeight)
    } else if (touches.length === 2) {
      // Two finger pinch zoom
      e.preventDefault()

      const currentDistance = getTouchDistance(touches)
      const scaleChange = currentDistance / touchStartDistance.value
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, touchStartScale.value * scaleChange))
      zoom.value = newScale

      const currentCenter = getTouchCenter(touches)
      pan.value.x = currentCenter.x - touchStartPos.value.x
      pan.value.y = currentCenter.y - touchStartPos.value.y
      constrainPan(containerWidth, containerHeight)
    }
  }

  const handleTouchEnd = (e) => {
    const touches = e.touches
    const changedTouch = e.changedTouches[0]

    if (touches.length === 0) {
      // Check for double-tap to reset zoom
      if (!touchMoved.value) {
        const deltaX = changedTouch.clientX - lastTouchCenter.value.x
        const deltaY = changedTouch.clientY - lastTouchCenter.value.y

        if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10) {
          const now = Date.now()
          const timeDiff = now - lastTapTime.value

          if (timeDiff < 300 && timeDiff > 0) {
            // Double tap detected - toggle zoom
            e.preventDefault()
            if (zoom.value > 1) {
              resetZoomPan()
            } else {
              zoom.value = 2
            }
            lastTapTime.value = 0
            isTouching.value = false
            return
          } else {
            lastTapTime.value = now
          }
        }
      }

      isTouching.value = false
    } else if (touches.length === 1) {
      // One finger remaining
      touchStartPos.value = {
        x: touches[0].clientX - pan.value.x,
        y: touches[0].clientY - pan.value.y,
      }
      touchStartDistance.value = 0
    }
  }

  // Computed transform style
  const transformStyle = computed(() => ({
    transform: `translate(${pan.value.x}px, ${pan.value.y}px) scale(${zoom.value})`,
    cursor: isDragging.value ? 'grabbing' : zoom.value > 1 ? 'grab' : 'default',
    transition: isDragging.value || isTouching.value ? 'none' : 'transform 0.1s ease-out',
  }))

  // Reset all state
  const resetState = () => {
    segmentationMode.value = 'auto'
    activeTab.value = 'editor'
    separatorLines.value = []
    isDrawing.value = false
    firstPoint.value = null
    previewLine.value = null
    selectedLineId.value = null
    lineIdCounter = 0
    resetZoomPan()
  }

  return {
    // Mode state
    segmentationMode,
    activeTab,

    // Line state
    separatorLines,
    isDrawing,
    firstPoint,
    previewLine,
    selectedLineId,

    // Zoom/Pan state
    zoom,
    pan,
    isDragging,
    isTouching,

    // Computed
    transformStyle,

    // Line methods
    addLine,
    deleteLine,
    clearAllLines,
    selectLine,
    deselectLine,

    // Drawing methods
    startDrawing,
    cancelDrawing,
    setFirstPoint,
    updatePreviewLine,
    completeDrawing,

    // Coordinate methods
    getImageCoords,

    // Zoom/Pan methods
    resetZoomPan,
    fitToContainer,
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,

    // Reset
    resetState,
  }
}
