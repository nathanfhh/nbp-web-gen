/**
 * Core utilities for OCR Region Editor
 *
 * Provides coordinate transformation and shared utility functions
 * used by various region editor tools.
 */

import { computed } from 'vue'

/**
 * @param {Object} options
 * @param {import('vue').Ref<SVGElement|null>} options.svgRef - Reference to the SVG overlay element
 * @param {import('vue').Ref<{width: number, height: number}>|Object} options.imageDimensions - Image dimensions (reactive or plain object)
 */
export function useRegionEditorCore({ svgRef, imageDimensions }) {
  /**
   * Check if image has valid dimensions for rendering
   */
  const hasValidDimensions = computed(() => {
    const dims = imageDimensions.value ?? imageDimensions
    return dims.width > 0 && dims.height > 0
  })

  /**
   * Get image dimensions (handles both ref and plain object)
   */
  const getDimensions = () => {
    return imageDimensions.value ?? imageDimensions
  }

  /**
   * Convert mouse event coordinates to image coordinates
   * @param {MouseEvent} e - Mouse event
   * @returns {{x: number, y: number}} Image coordinates clamped to bounds
   */
  const getImageCoords = (e) => {
    if (!svgRef.value) return { x: 0, y: 0 }

    const svg = svgRef.value
    const rect = svg.getBoundingClientRect()
    const dims = getDimensions()
    const scaleX = dims.width / rect.width
    const scaleY = dims.height / rect.height

    return {
      x: Math.max(0, Math.min(dims.width, (e.clientX - rect.left) * scaleX)),
      y: Math.max(0, Math.min(dims.height, (e.clientY - rect.top) * scaleY)),
    }
  }

  /**
   * Convert touch coordinates to image coordinates
   * @param {Touch} touch - Touch object from touch event
   * @returns {{x: number, y: number}} Image coordinates clamped to bounds
   */
  const getTouchImageCoords = (touch) => {
    if (!svgRef.value) return { x: 0, y: 0 }

    const svg = svgRef.value
    const rect = svg.getBoundingClientRect()
    const dims = getDimensions()
    const scaleX = dims.width / rect.width
    const scaleY = dims.height / rect.height

    return {
      x: Math.max(0, Math.min(dims.width, (touch.clientX - rect.left) * scaleX)),
      y: Math.max(0, Math.min(dims.height, (touch.clientY - rect.top) * scaleY)),
    }
  }

  /**
   * Get region color based on recognition source
   * @param {Object} region - Region object with recognitionSource and recognitionFailed properties
   * @returns {{fill: string, stroke: string}} Fill and stroke colors
   */
  const getRegionColor = (region) => {
    if (region.recognitionSource === 'manual') {
      return {
        fill: 'rgba(168, 85, 247, 0.2)', // Purple for manual
        stroke: 'rgba(168, 85, 247, 0.9)',
      }
    }
    if (region.recognitionSource === 'tesseract') {
      return {
        fill: 'rgba(234, 179, 8, 0.2)', // Yellow for tesseract
        stroke: 'rgba(234, 179, 8, 0.9)',
      }
    }
    if (region.recognitionFailed) {
      return {
        fill: 'rgba(239, 68, 68, 0.2)', // Red for failed
        stroke: 'rgba(239, 68, 68, 0.9)',
      }
    }
    return {
      fill: 'rgba(16, 185, 129, 0.2)', // Green for paddle
      stroke: 'rgba(16, 185, 129, 0.9)',
    }
  }

  /**
   * Get delete button position (center of region)
   * @param {Object} region - Region with bounds property
   * @returns {{x: number, y: number}} Center coordinates
   */
  const getDeleteButtonCenter = (region) => {
    return {
      x: region.bounds.x + region.bounds.width / 2,
      y: region.bounds.y + region.bounds.height / 2,
    }
  }

  /**
   * Get delete button size based on region bounds
   * Scales proportionally with the smaller dimension, with min/max limits
   * @param {Object} region - Region with bounds property
   * @returns {{radius: number, hitRadius: number, fontSize: number}} Button dimensions
   */
  const getDeleteButtonSize = (region) => {
    const minDimension = Math.min(region.bounds.width, region.bounds.height)
    const scaledRadius = minDimension * 0.15
    const radius = Math.max(16, Math.min(40, scaledRadius))
    return {
      radius,
      hitRadius: radius * 1.5,
      fontSize: radius * 1.25,
    }
  }

  /**
   * Get resize handle positions for a region
   * @param {Object} region - Region with bounds property
   * @returns {{nw: {x,y}, ne: {x,y}, sw: {x,y}, se: {x,y}}} Corner positions
   */
  const getResizeHandles = (region) => {
    const { x, y, width, height } = region.bounds
    return {
      nw: { x, y },
      ne: { x: x + width, y },
      sw: { x, y: y + height },
      se: { x: x + width, y: y + height },
    }
  }

  /**
   * Get midpoint of a separator line (for delete button placement)
   * @param {Object} separator - Separator with start and end points
   * @returns {{x: number, y: number}} Midpoint coordinates
   */
  const getSeparatorMidpoint = (separator) => {
    return {
      x: (separator.start.x + separator.end.x) / 2,
      y: (separator.start.y + separator.end.y) / 2,
    }
  }

  /**
   * Check if two rectangles intersect
   * @param {Object} r1 - First rectangle {x, y, width, height}
   * @param {Object} r2 - Second rectangle {x, y, width, height}
   * @returns {boolean} True if rectangles intersect
   */
  const rectsIntersect = (r1, r2) => {
    return !(
      r1.x + r1.width < r2.x ||
      r2.x + r2.width < r1.x ||
      r1.y + r1.height < r2.y ||
      r2.y + r2.height < r1.y
    )
  }

  return {
    // Computed
    hasValidDimensions,
    // Coordinate transformation
    getImageCoords,
    getTouchImageCoords,
    getDimensions,
    // Region utilities
    getRegionColor,
    getDeleteButtonCenter,
    getDeleteButtonSize,
    getResizeHandles,
    getSeparatorMidpoint,
    rectsIntersect,
  }
}
