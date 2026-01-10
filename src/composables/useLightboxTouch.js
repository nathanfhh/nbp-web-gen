import { ref } from 'vue'
import { MIN_SCALE, MAX_SCALE } from './useLightboxZoom'

/**
 * Composable for lightbox touch gesture handling
 * Supports pinch-to-zoom, double-tap zoom, swipe navigation, and swipe-down-to-close
 *
 * @param {Object} deps - Dependencies from zoom composable
 * @param {import('vue').Ref<number>} deps.scale - Current zoom scale
 * @param {import('vue').Ref<number>} deps.translateX - Current X translation
 * @param {import('vue').Ref<number>} deps.translateY - Current Y translation
 * @param {Function} deps.resetTransform - Reset zoom function
 * @param {Function} deps.constrainPan - Constrain pan bounds function
 * @returns {Object} Touch state and handlers
 */
export function useLightboxTouch(deps) {
  const { scale, translateX, translateY, resetTransform, constrainPan } = deps

  // Touch state
  const isTouching = ref(false)
  const touchStartDistance = ref(0)
  const touchStartScale = ref(1)
  const touchStartPos = ref({ x: 0, y: 0 })
  const lastTouchCenter = ref({ x: 0, y: 0 })
  const lastTapTime = ref(0)
  const touchMoved = ref(false)

  /**
   * Calculate distance between two touch points
   * @param {TouchList} touches - Touch points
   * @returns {number} Distance in pixels
   */
  const getTouchDistance = (touches) => {
    const dx = touches[0].clientX - touches[1].clientX
    const dy = touches[0].clientY - touches[1].clientY
    return Math.sqrt(dx * dx + dy * dy)
  }

  /**
   * Calculate center point between two touches
   * @param {TouchList} touches - Touch points
   * @returns {{x: number, y: number}} Center coordinates
   */
  const getTouchCenter = (touches) => {
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    }
  }

  /**
   * Handle touch start event
   * @param {TouchEvent} e - Touch event
   * @param {boolean} isActive - Whether the lightbox is active
   */
  const handleTouchStart = (e, isActive = true) => {
    if (!isActive) return

    const touches = e.touches
    touchMoved.value = false

    if (touches.length === 1) {
      // Single finger - prepare for drag or double-tap
      isTouching.value = true
      touchStartPos.value = {
        x: touches[0].clientX - translateX.value,
        y: touches[0].clientY - translateY.value,
      }
      lastTouchCenter.value = {
        x: touches[0].clientX,
        y: touches[0].clientY,
      }
    } else if (touches.length === 2) {
      // Two fingers - prepare for pinch zoom
      e.preventDefault()
      isTouching.value = true
      touchStartDistance.value = getTouchDistance(touches)
      touchStartScale.value = scale.value
      lastTouchCenter.value = getTouchCenter(touches)
      touchStartPos.value = {
        x: lastTouchCenter.value.x - translateX.value,
        y: lastTouchCenter.value.y - translateY.value,
      }
    }
  }

  /**
   * Handle touch move event
   * @param {TouchEvent} e - Touch event
   * @param {boolean} isActive - Whether the lightbox is active
   */
  const handleTouchMove = (e, isActive = true) => {
    if (!isActive || !isTouching.value) return

    const touches = e.touches
    touchMoved.value = true

    if (touches.length === 1 && scale.value > 1) {
      // Single finger drag (only when zoomed in)
      e.preventDefault()
      translateX.value = touches[0].clientX - touchStartPos.value.x
      translateY.value = touches[0].clientY - touchStartPos.value.y
      constrainPan()
    } else if (touches.length === 2) {
      // Two finger pinch zoom
      e.preventDefault()

      // Calculate new scale
      const currentDistance = getTouchDistance(touches)
      const scaleChange = currentDistance / touchStartDistance.value
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, touchStartScale.value * scaleChange))
      scale.value = newScale

      // Move with pinch center
      const currentCenter = getTouchCenter(touches)
      translateX.value = currentCenter.x - touchStartPos.value.x
      translateY.value = currentCenter.y - touchStartPos.value.y
      constrainPan()
    }
  }

  /**
   * Handle touch end event
   * @param {TouchEvent} e - Touch event
   * @param {boolean} isActive - Whether the lightbox is active
   * @param {Object} navigation - Navigation callbacks
   * @param {Function} navigation.close - Close lightbox callback
   * @param {Function} navigation.goToPrev - Go to previous image callback
   * @param {Function} navigation.goToNext - Go to next image callback
   * @param {boolean} navigation.hasPrev - Whether previous image exists
   * @param {boolean} navigation.hasNext - Whether next image exists
   */
  const handleTouchEnd = (e, isActive = true, navigation = {}) => {
    if (!isActive) return

    const { close, goToPrev, goToNext, hasPrev, hasNext } = navigation
    const touches = e.touches
    const changedTouch = e.changedTouches[0]

    // All fingers lifted
    if (touches.length === 0) {
      // Calculate swipe distance
      const deltaX = changedTouch.clientX - lastTouchCenter.value.x
      const deltaY = changedTouch.clientY - lastTouchCenter.value.y

      // Check for double-tap (only if minimal movement)
      if (!touchMoved.value || (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10)) {
        const now = Date.now()
        const timeDiff = now - lastTapTime.value

        if (timeDiff < 300 && timeDiff > 0) {
          // Double tap detected - toggle zoom
          e.preventDefault()
          if (scale.value > 1) {
            resetTransform()
          } else {
            scale.value = 2.5
          }
          lastTapTime.value = 0
          isTouching.value = false
          return
        } else {
          lastTapTime.value = now
        }
      }

      // Check for swipe down to close (only when not zoomed)
      if (scale.value <= 1 && touchMoved.value && deltaY > 80 && Math.abs(deltaX) < 50) {
        close?.()
        isTouching.value = false
        return
      }

      // Check for swipe navigation (only when not zoomed)
      if (scale.value <= 1 && touchMoved.value && Math.abs(deltaX) > 50) {
        if (deltaX > 0 && hasPrev) {
          goToPrev?.()
        } else if (deltaX < 0 && hasNext) {
          goToNext?.()
        }
      }

      isTouching.value = false
    } else if (touches.length === 1) {
      // One finger remaining - switch to single finger drag mode
      touchStartPos.value = {
        x: touches[0].clientX - translateX.value,
        y: touches[0].clientY - translateY.value,
      }
      touchStartDistance.value = 0
    }
  }

  return {
    // State
    isTouching,
    touchMoved,
    lastTouchCenter,

    // Methods
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  }
}
