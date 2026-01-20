/**
 * Magnifier composable for OCR Region Editor
 *
 * Provides magnifier preview functionality during resize operations.
 * Shows a zoomed view of the area around the cursor for precise positioning.
 */

import { ref, computed } from 'vue'

/**
 * @param {Object} options
 * @param {import('vue').Ref<string>|string} options.imageUrl - URL of the image to magnify
 * @param {import('vue').Ref<{width: number, height: number}>|Object} options.imageDimensions - Image dimensions
 */
export function useMagnifier({ imageUrl, imageDimensions }) {
  // State
  const showMagnifier = ref(false)
  const magnifierTarget = ref({ x: 0, y: 0 })

  // Constants
  const MAGNIFIER_SIZE = 120 // px
  const MAGNIFIER_ZOOM = 2.5 // zoom factor

  /**
   * Get image URL (handles both ref and plain string)
   */
  const getImageUrl = () => {
    return typeof imageUrl === 'string' ? imageUrl : imageUrl.value
  }

  /**
   * Get image dimensions (handles both ref and plain object)
   */
  const getDimensions = () => {
    return imageDimensions.value ?? imageDimensions
  }

  /**
   * Computed style for magnifier image background
   */
  const magnifierStyle = computed(() => {
    const dims = getDimensions()
    const url = getImageUrl()
    const target = magnifierTarget.value
    const halfSize = MAGNIFIER_SIZE / 2

    return {
      backgroundImage: `url(${url})`,
      backgroundPosition: `-${target.x * MAGNIFIER_ZOOM - halfSize}px -${target.y * MAGNIFIER_ZOOM - halfSize}px`,
      backgroundSize: `${dims.width * MAGNIFIER_ZOOM}px ${dims.height * MAGNIFIER_ZOOM}px`,
    }
  })

  /**
   * Show magnifier at specified coordinates
   * @param {{x: number, y: number}} coords - Image coordinates to focus on
   */
  const show = (coords) => {
    magnifierTarget.value = coords
    showMagnifier.value = true
  }

  /**
   * Update magnifier target position
   * @param {{x: number, y: number}} coords - New image coordinates
   */
  const updateTarget = (coords) => {
    magnifierTarget.value = coords
  }

  /**
   * Hide magnifier
   */
  const hide = () => {
    showMagnifier.value = false
  }

  return {
    // State
    showMagnifier,
    magnifierTarget,
    // Computed
    magnifierStyle,
    // Methods
    show,
    updateTarget,
    hide,
    // Constants (for external styling if needed)
    MAGNIFIER_SIZE,
    MAGNIFIER_ZOOM,
  }
}
