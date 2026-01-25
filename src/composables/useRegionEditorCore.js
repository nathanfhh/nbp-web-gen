/**
 * Core utilities for OCR Region Editor
 *
 * Provides coordinate transformation and shared utility functions
 * used by various region editor tools.
 */

import { computed } from 'vue'

/**
 * Check if two line segments (p1-p2 and p3-p4) intersect (proper crossing only)
 * Uses the cross product orientation test.
 * @param {Array<number>} p1
 * @param {Array<number>} p2
 * @param {Array<number>} p3
 * @param {Array<number>} p4
 * @returns {boolean}
 */
function segmentsIntersect(p1, p2, p3, p4) {
  const d1 = cross(p3, p4, p1)
  const d2 = cross(p3, p4, p2)
  const d3 = cross(p1, p2, p3)
  const d4 = cross(p1, p2, p4)

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true
  }
  return false
}

/**
 * Cross product of vectors (b - a) and (c - a)
 */
function cross(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
}

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

  /**
   * Get vertex handle positions for a polygon-mode region
   * Returns 4 vertices from the region's polygon array
   * @param {Object} region - Region with polygon property [[x,y], ...]
   * @returns {{nw: {x,y}, ne: {x,y}, se: {x,y}, sw: {x,y}}} Vertex positions
   */
  const getVertexHandles = (region) => {
    const poly = region.polygon
    // polygon order: [nw, ne, se, sw] (top-left, top-right, bottom-right, bottom-left)
    return {
      nw: { x: poly[0][0], y: poly[0][1] },
      ne: { x: poly[1][0], y: poly[1][1] },
      se: { x: poly[2][0], y: poly[2][1] },
      sw: { x: poly[3][0], y: poly[3][1] },
    }
  }

  /**
   * Check if a quadrilateral (4-point polygon) is valid (non-self-intersecting)
   * Tests that no two non-adjacent edges cross each other.
   * @param {Array<Array<number>>} polygon - 4 points [[x,y], ...]
   * @returns {boolean} True if the quad is valid
   */
  const isValidQuad = (polygon) => {
    if (!polygon || polygon.length !== 4) return false

    // Check non-adjacent edge pairs: (edge 0-1 vs edge 2-3) and (edge 1-2 vs edge 3-0)
    return (
      !segmentsIntersect(polygon[0], polygon[1], polygon[2], polygon[3]) &&
      !segmentsIntersect(polygon[1], polygon[2], polygon[3], polygon[0])
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
    getVertexHandles,
    isValidQuad,
    getSeparatorMidpoint,
    rectsIntersect,
  }
}
