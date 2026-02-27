/**
 * OCR Core Utilities
 *
 * Shared functions for both Worker (WASM) and Main Thread (WebGPU) OCR implementations.
 * These functions have NO external dependencies (no ort, no Tesseract).
 *
 * Architecture:
 * - Worker (WASM): src/workers/ocr.worker.js
 * - Main Thread (WebGPU): src/composables/useOcrMainThread.js (future)
 * - Unified Interface: src/composables/useOcr.js (future)
 *
 * @see docs/ocr-optimization-plan.md for architecture details
 */

import { OCR_DEFAULTS } from '@/constants/ocrDefaults'

// ============================================================================
// Constants
// ============================================================================

/**
 * ImageNet normalization parameters used by PaddleOCR detection model
 */
export const DETECTION_MEAN = [0.485, 0.456, 0.406]
export const DETECTION_STD = [0.229, 0.224, 0.225]

/**
 * Recognition model parameters
 */
export const RECOGNITION_TARGET_HEIGHT = 48
export const RECOGNITION_MAX_WIDTH = 1280

/**
 * Detection model parameters
 */
export const DETECTION_MAX_SIDE_LEN = 1280
export const DETECTION_THRESHOLD = 0.3
export const DETECTION_BOX_THRESHOLD = 0.6
export const DETECTION_MIN_AREA = 100

// ============================================================================
// Hybrid Layout Analysis Engine
// Combined Recursive XY-Cut (Macro) + Graph-Based Clustering (Micro)
// ============================================================================

/**
 * Merge individual text lines into logical text blocks using Recursive XY-Cut.
 *
 * Strategy: Recursive XY-Cut (Macro Layout Analysis)
 * Recursively cuts the document into rectangular zones based on whitespace separators.
 * - First attempts to split vertically (Columns)
 * - Then attempts to split horizontally (Paragraphs/Sections)
 * - Leaf nodes become the final text blocks
 *
 * Manual separator lines (any angle) are used to pre-partition regions before XY-Cut.
 * If a separator line intersects the line connecting two region centers, they will
 * be placed in separate groups and never merged together.
 *
 * This approach is ideal for structured documents like slides and papers.
 *
 * @param {Array} rawResults - Array of OCR results with bounds, text, confidence
 * @param {Array} separatorLines - Array of manual separator lines (any angle)
 *   Each separator: { id, start: {x, y}, end: {x, y} }
 * @param {Object} layoutSettings - Layout analysis settings (optional)
 *   Uses OCR_DEFAULTS as fallback for any missing values
 * @returns {Array} - Merged text blocks with combined bounds and inferred alignment
 */
export function mergeTextRegions(rawResults, separatorLines = [], layoutSettings = {}) {
  // Merge settings with defaults (Single Source of Truth)
  const settings = {
    verticalCutThreshold: layoutSettings.verticalCutThreshold ?? OCR_DEFAULTS.verticalCutThreshold,
    horizontalCutThreshold:
      layoutSettings.horizontalCutThreshold ?? OCR_DEFAULTS.horizontalCutThreshold,
    sameLineThreshold: layoutSettings.sameLineThreshold ?? OCR_DEFAULTS.sameLineThreshold,
    fontSizeDiffThreshold:
      layoutSettings.fontSizeDiffThreshold ?? OCR_DEFAULTS.fontSizeDiffThreshold,
    colorDiffThreshold: layoutSettings.colorDiffThreshold ?? OCR_DEFAULTS.colorDiffThreshold,
  }

  // 1. Preprocessing: Filter invalid data
  const validRegions = rawResults.filter((r) => !r.recognitionFailed && r.text.trim().length > 0)
  if (validRegions.length === 0) return []

  // 2. Pre-partition: Split regions into groups that should never be merged
  // Two regions are in the same group only if no separator line intersects their center-to-center line
  const partitionedGroups = partitionBySeparators(validRegions, separatorLines)

  // 3. Apply XY-Cut to each partition separately, then combine results
  const allLeafZones = []
  for (const group of partitionedGroups) {
    if (group.length === 0) continue
    const leafZones = performRecursiveXYCut(group, 0, settings)
    allLeafZones.push(...leafZones)
  }

  // 4. Block Creation
  // Convert each leaf zone into a text block
  return allLeafZones.map((regions) => createBlockFromRegions(regions, settings)).filter(Boolean)
}

/**
 * Partition regions into groups based on separator lines.
 * Two regions are separated if they are on opposite sides of a separator line.
 * Uses signed distance to line equation: Ax + By + C = 0
 *
 * Uses Union-Find (Disjoint Set) to efficiently group connected regions.
 *
 * @param {Array} regions - List of valid text regions
 * @param {Array} separatorLines - Manual separator lines
 * @returns {Array<Array>} - Array of region groups
 */
function partitionBySeparators(regions, separatorLines) {
  if (separatorLines.length === 0) return [regions]
  if (regions.length <= 1) return [regions]

  const n = regions.length

  // Union-Find data structure
  const parent = Array.from({ length: n }, (_, i) => i)
  const rank = new Array(n).fill(0)

  function find(x) {
    if (parent[x] !== x) parent[x] = find(parent[x])
    return parent[x]
  }

  function union(x, y) {
    const px = find(x)
    const py = find(y)
    if (px === py) return
    if (rank[px] < rank[py]) {
      parent[px] = py
    } else if (rank[px] > rank[py]) {
      parent[py] = px
    } else {
      parent[py] = px
      rank[px]++
    }
  }

  // Pre-calculate which side of each separator line each region is on
  // Side: 1 = positive side, -1 = negative side, 0 = straddles the line
  const regionSides = separatorLines.map((sep) => {
    return regions.map((r) => getRegionSideOfLine(r.bounds, sep.start, sep.end))
  })

  // Try to union regions that are NOT separated by any line
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const boundsI = regions[i].bounds
      const boundsJ = regions[j].bounds

      // Check if any separator line separates these two regions
      // A separator only applies if:
      // 1. Its range overlaps with the union of the two regions' bounding boxes
      // 2. The two regions are on opposite sides (one +1, one -1)
      const isSeparated = separatorLines.some((sep, sepIdx) => {
        const sideI = regionSides[sepIdx][i]
        const sideJ = regionSides[sepIdx][j]

        // First check if on opposite sides
        const onOppositeSides = (sideI === 1 && sideJ === -1) || (sideI === -1 && sideJ === 1)
        if (!onOppositeSides) return false

        // Then check if separator is relevant (its range overlaps with the two regions)
        return isSeparatorRelevantToRegions(sep, boundsI, boundsJ)
      })

      // Also check if either region straddles any RELEVANT separator line
      // Straddling regions should NOT act as bridges between sides
      const anyStraddles = separatorLines.some((sep, sepIdx) => {
        const straddles = regionSides[sepIdx][i] === 0 || regionSides[sepIdx][j] === 0
        if (!straddles) return false
        // Only count if separator is relevant to these regions
        return isSeparatorRelevantToRegions(sep, boundsI, boundsJ)
      })

      if (!isSeparated && !anyStraddles) {
        union(i, j)
      }
    }
  }

  // Collect groups
  const groups = new Map()
  for (let i = 0; i < n; i++) {
    const root = find(i)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root).push(regions[i])
  }

  return Array.from(groups.values())
}

/**
 * Check if a separator line is relevant to a pair of regions.
 * A separator is relevant if its bounding box overlaps with the union
 * of the two regions' bounding boxes.
 *
 * This prevents a line drawn in one area from affecting distant regions.
 *
 * @param {Object} sep - Separator { start: {x, y}, end: {x, y} }
 * @param {Object} boundsA - First region's bounds
 * @param {Object} boundsB - Second region's bounds
 * @returns {boolean} True if separator is relevant to these regions
 */
function isSeparatorRelevantToRegions(sep, boundsA, boundsB) {
  // Calculate separator's bounding box
  const sepMinX = Math.min(sep.start.x, sep.end.x)
  const sepMaxX = Math.max(sep.start.x, sep.end.x)
  const sepMinY = Math.min(sep.start.y, sep.end.y)
  const sepMaxY = Math.max(sep.start.y, sep.end.y)

  // Calculate union bounding box of the two regions
  const unionMinX = Math.min(boundsA.x, boundsB.x)
  const unionMaxX = Math.max(boundsA.x + boundsA.width, boundsB.x + boundsB.width)
  const unionMinY = Math.min(boundsA.y, boundsB.y)
  const unionMaxY = Math.max(boundsA.y + boundsA.height, boundsB.y + boundsB.height)

  // Check if bounding boxes overlap (with some padding for near-misses)
  const padding = 10 // Small padding to catch edge cases
  return (
    sepMaxX + padding >= unionMinX &&
    sepMinX - padding <= unionMaxX &&
    sepMaxY + padding >= unionMinY &&
    sepMinY - padding <= unionMaxY
  )
}

/**
 * Determine which side of a line a bounding box is on.
 * Line is defined by two points (p1, p2), extended infinitely.
 *
 * Uses line equation: (y2-y1)(x-x1) - (x2-x1)(y-y1) = 0
 * Substitute each corner and check the sign.
 *
 * @param {Object} bounds - Bounding box { x, y, width, height }
 * @param {{x: number, y: number}} p1 - First point of line
 * @param {{x: number, y: number}} p2 - Second point of line
 * @returns {number} 1 if all corners on positive side, -1 if all on negative side, 0 if straddles
 */
function getRegionSideOfLine(bounds, p1, p2) {
  // Line equation coefficients: A*x + B*y + C = 0
  const A = p2.y - p1.y
  const B = -(p2.x - p1.x)
  const C = (p2.x - p1.x) * p1.y - (p2.y - p1.y) * p1.x

  // Get the four corners of the bounding box
  const corners = [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x, y: bounds.y + bounds.height },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
  ]

  // Calculate signed distance for each corner
  let hasPositive = false
  let hasNegative = false

  for (const corner of corners) {
    const value = A * corner.x + B * corner.y + C
    if (value > 0) hasPositive = true
    else if (value < 0) hasNegative = true
  }

  if (hasPositive && !hasNegative) return 1 // All on positive side
  if (hasNegative && !hasPositive) return -1 // All on negative side
  return 0 // Straddles the line (some positive, some negative)
}

// ============================================================================
// Phase 1: Recursive XY-Cut (Macro Layout Analysis)
// ============================================================================

/**
 * Recursively cuts the document into rectangular zones based on whitespace separators.
 *
 * @param {Array} regions - List of text regions
 * @param {number} depth - Recursion depth limit
 * @param {Object} settings - Layout settings with thresholds
 * @returns {Array<Array>} - Array of region groups (zones)
 */
function performRecursiveXYCut(regions, depth = 0, settings = {}) {
  // Stop recursion if too deep or too few regions
  if (depth > 10 || regions.length < 2) return [regions]

  const bounds = getGroupBounds(regions)
  const medianHeight = getMedianLineHeight(regions)

  // 1. Try Vertical Cut (Separating Columns) - Higher Priority
  // Look for wide vertical gaps in the X-projection
  // Threshold: verticalCutThreshold * line height (Columns are usually separated by wide gaps)
  const verticalThreshold = settings.verticalCutThreshold ?? OCR_DEFAULTS.verticalCutThreshold
  const verticalCut = findBestCut(regions, bounds, 'x', medianHeight * verticalThreshold)
  if (verticalCut) {
    const left = regions.filter((r) => r.bounds.x + r.bounds.width / 2 < verticalCut)
    const right = regions.filter((r) => r.bounds.x + r.bounds.width / 2 >= verticalCut)
    return [
      ...performRecursiveXYCut(left, depth + 1, settings),
      ...performRecursiveXYCut(right, depth + 1, settings),
    ]
  }

  // 2. Try Horizontal Cut (Separating Sections/Paragraphs)
  // Look for wide horizontal gaps in the Y-projection
  // Threshold: horizontalCutThreshold * line height (Standard paragraph spacing)
  const horizontalThreshold =
    settings.horizontalCutThreshold ?? OCR_DEFAULTS.horizontalCutThreshold
  const horizontalCut = findBestCut(regions, bounds, 'y', medianHeight * horizontalThreshold)
  if (horizontalCut) {
    const top = regions.filter((r) => r.bounds.y + r.bounds.height / 2 < horizontalCut)
    const bottom = regions.filter((r) => r.bounds.y + r.bounds.height / 2 >= horizontalCut)
    return [
      ...performRecursiveXYCut(top, depth + 1, settings),
      ...performRecursiveXYCut(bottom, depth + 1, settings),
    ]
  }

  // 3. Try Font Size Cut (Separating Headers from Body Text)
  // Even without whitespace gaps, split where font sizes differ significantly
  // This prevents titles from merging with body text when they're close together
  const fontSizeThreshold = settings.fontSizeDiffThreshold ?? OCR_DEFAULTS.fontSizeDiffThreshold
  const fontSizeCut = findFontSizeCut(regions, fontSizeThreshold)
  if (fontSizeCut) {
    const top = regions.filter((r) => r.bounds.y + r.bounds.height / 2 < fontSizeCut)
    const bottom = regions.filter((r) => r.bounds.y + r.bounds.height / 2 >= fontSizeCut)
    return [
      ...performRecursiveXYCut(top, depth + 1, settings),
      ...performRecursiveXYCut(bottom, depth + 1, settings),
    ]
  }

  // No valid cuts found, this is an atomic block
  return [regions]
}

/**
 * Helper: Calculate median line height of regions
 * Used as a relative unit for gap thresholds
 */
function getMedianLineHeight(regions) {
  if (regions.length === 0) return 20 // Fallback
  const heights = regions.map((r) => r.bounds.height).sort((a, b) => a - b)
  return heights[Math.floor(heights.length / 2)]
}

/**
 * Find the best split position along a specific axis
 * @param {Array} regions
 * @param {Object} bounds - Bounding box of all regions
 * @param {'x'|'y'} axis - Axis to project onto
 * @param {number} minGapSize - Minimum gap size to consider a cut
 * @returns {number|null} - Cut position or null
 */
function findBestCut(regions, bounds, axis, minGapSize) {
  const isX = axis === 'x'
  const rangeStart = isX ? bounds.x : bounds.y
  const rangeEnd = isX ? bounds.x + bounds.width : bounds.y + bounds.height
  const totalSize = rangeEnd - rangeStart

  // Project regions onto the axis
  const projection = new Uint8Array(Math.ceil(totalSize) + 1)
  for (const r of regions) {
    const start = Math.floor((isX ? r.bounds.x : r.bounds.y) - rangeStart)
    const end = Math.ceil(
      (isX ? r.bounds.x + r.bounds.width : r.bounds.y + r.bounds.height) - rangeStart
    )
    for (let i = Math.max(0, start); i < Math.min(projection.length, end); i++) {
      projection[i] = 1
    }
  }

  // Find gaps
  let maxGapSize = 0
  let bestCut = null
  let currentGapStart = null

  for (let i = 0; i < projection.length; i++) {
    if (projection[i] === 0) {
      if (currentGapStart === null) currentGapStart = i
    } else {
      if (currentGapStart !== null) {
        const gapSize = i - currentGapStart
        // Use the relative threshold passed in
        if (gapSize > maxGapSize && gapSize > minGapSize) {
          maxGapSize = gapSize
          bestCut = rangeStart + currentGapStart + gapSize / 2
        }
        currentGapStart = null
      }
    }
  }

  return bestCut
}

/**
 * Find cut position based on font size (height) differences between adjacent regions.
 * This helps separate headers from body text even when they're close together.
 *
 * @param {Array} regions - List of text regions
 * @param {number} threshold - Height ratio threshold (e.g., 1.5 means 50% difference)
 * @returns {number|null} - Cut Y position or null if no significant difference found
 */
function findFontSizeCut(regions, threshold) {
  if (regions.length < 2) return null

  // Sort regions by Y position (top to bottom)
  const sorted = [...regions].sort((a, b) => {
    const aCenterY = a.bounds.y + a.bounds.height / 2
    const bCenterY = b.bounds.y + b.bounds.height / 2
    return aCenterY - bCenterY
  })

  let maxRatio = 0
  let bestCutY = null

  // Find adjacent pairs with significant height difference
  for (let i = 0; i < sorted.length - 1; i++) {
    const curr = sorted[i]
    const next = sorted[i + 1]

    const currHeight = curr.bounds.height
    const nextHeight = next.bounds.height

    // Calculate height ratio (always >= 1)
    const ratio = Math.max(currHeight, nextHeight) / Math.min(currHeight, nextHeight)

    // Check if this is the largest ratio and exceeds threshold
    if (ratio > threshold && ratio > maxRatio) {
      maxRatio = ratio
      // Cut between the two regions (at the midpoint of the gap)
      const currBottom = curr.bounds.y + curr.bounds.height
      const nextTop = next.bounds.y
      bestCutY = (currBottom + nextTop) / 2
    }
  }

  return bestCutY
}

/**
 * Parse hex color string to RGB array
 * @param {string} hex - Hex color (with or without #)
 * @returns {[number, number, number]} RGB values
 */
function hexToRgb(hex) {
  const cleanHex = hex.replace('#', '')
  const r = parseInt(cleanHex.substring(0, 2), 16)
  const g = parseInt(cleanHex.substring(2, 4), 16)
  const b = parseInt(cleanHex.substring(4, 6), 16)
  return [r, g, b]
}

/**
 * Calculate color distance (Euclidean in RGB space)
 * @param {string} color1 - Hex color string
 * @param {string} color2 - Hex color string
 * @returns {number} Distance (0-441.67 for RGB)
 */
function colorDistance(color1, color2) {
  const [r1, g1, b1] = hexToRgb(color1)
  const [r2, g2, b2] = hexToRgb(color2)
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2)
}

/**
 * Unify colors in a region group if they are similar, or preserve distinct colors
 *
 * Logic:
 * - If all colors are within threshold of each other → use the most common color (mode)
 * - If any color is distinctly different → preserve individual colors (e.g., highlights)
 *
 * @param {Array} regions - Array of regions with optional textColor property
 * @param {Object} settings - Layout settings with colorDiffThreshold
 */
function unifyOrPreserveColors(regions, settings = {}) {
  const colorThreshold = settings.colorDiffThreshold ?? OCR_DEFAULTS.colorDiffThreshold

  // Collect all colors (filter out undefined/null)
  const colors = regions.map((r) => r.textColor).filter(Boolean)

  if (colors.length === 0) {
    // No colors extracted, leave as-is (will use default black in PPTX)
    return
  }

  if (colors.length === 1) {
    // Only one region has color, apply to all that don't have one
    const singleColor = colors[0]
    regions.forEach((r) => {
      if (!r.textColor) r.textColor = singleColor
    })
    return
  }

  // Check if any pair of colors differs significantly
  let hasDistinctColors = false
  for (let i = 0; i < colors.length && !hasDistinctColors; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      if (colorDistance(colors[i], colors[j]) > colorThreshold) {
        hasDistinctColors = true
        break
      }
    }
  }

  if (hasDistinctColors) {
    // Preserve individual colors (e.g., highlighted text)
    // Fill in missing colors with the most common one
    const colorCounts = {}
    colors.forEach((c) => {
      colorCounts[c] = (colorCounts[c] || 0) + 1
    })
    const modeColor = Object.entries(colorCounts).sort((a, b) => b[1] - a[1])[0][0]

    regions.forEach((r) => {
      if (!r.textColor) r.textColor = modeColor
    })
  } else {
    // All colors are similar → unify to mode (most common)
    const colorCounts = {}
    colors.forEach((c) => {
      colorCounts[c] = (colorCounts[c] || 0) + 1
    })
    const modeColor = Object.entries(colorCounts).sort((a, b) => b[1] - a[1])[0][0]

    // Apply mode color to ALL regions (removes noise)
    regions.forEach((r) => {
      r.textColor = modeColor
    })
  }
}

/**
 * Helper: Create a final merged block from a list of regions
 * @param {Array} regions - Array of text regions to merge
 * @param {Object} settings - Layout settings with thresholds
 */
function createBlockFromRegions(regions, settings = {}) {
  if (regions.length === 0) return null

  const sameLineThreshold = settings.sameLineThreshold ?? OCR_DEFAULTS.sameLineThreshold

  // Pre-compute rotation info for polygon-mode regions
  // If all regions are polygon-mode with similar rotation, use rotation-aware comparison
  const allPolygon = regions.every((r) => r.isPolygonMode && r.polygon)
  let useRotatedComparison = false
  let avgRotationRad = 0

  if (allPolygon && regions.length > 0) {
    const angles = regions.map((r) => getPolygonRotationAngle(r.polygon))
    const minAngle = Math.min(...angles)
    const maxAngle = Math.max(...angles)
    const angleDiff = Math.abs(maxAngle - minAngle)

    // Use rotation-aware comparison if angles are consistent and rotation is significant
    if (angleDiff <= 15 && Math.abs(angles[0]) > 0.5) {
      useRotatedComparison = true
      avgRotationRad = (angles.reduce((a, b) => a + b, 0) / angles.length) * (Math.PI / 180)
    }
  }

  /**
   * Get effective height of a region (edge-based for polygon, bounds-based otherwise)
   */
  const getEffectiveHeight = (region) => {
    if (region.isPolygonMode && region.polygon && region.polygon.length === 4) {
      const [nw, ne, se, sw] = region.polygon
      const leftH = Math.hypot(sw[0] - nw[0], sw[1] - nw[1])
      const rightH = Math.hypot(se[0] - ne[0], se[1] - ne[1])
      return (leftH + rightH) / 2
    }
    return region.bounds.height
  }

  /**
   * Get centroid of a region
   */
  const getCentroid = (region) => {
    if (region.isPolygonMode && region.polygon && region.polygon.length === 4) {
      const [nw, ne, se, sw] = region.polygon
      return {
        x: (nw[0] + ne[0] + se[0] + sw[0]) / 4,
        y: (nw[1] + ne[1] + se[1] + sw[1]) / 4,
      }
    }
    return {
      x: region.bounds.x + region.bounds.width / 2,
      y: region.bounds.y + region.bounds.height / 2,
    }
  }

  /**
   * Project a point onto perpendicular axis (for rotated text)
   * This gives the "vertical" position in the text's coordinate system
   */
  const getPerpendicularProjection = (region) => {
    const centroid = getCentroid(region)
    const perpAngle = avgRotationRad + Math.PI / 2
    return centroid.x * Math.cos(perpAngle) + centroid.y * Math.sin(perpAngle)
  }

  /**
   * Project a point onto parallel axis (for rotated text)
   * This gives the "horizontal" position in the text's coordinate system
   */
  const getParallelProjection = (region) => {
    const centroid = getCentroid(region)
    return centroid.x * Math.cos(avgRotationRad) + centroid.y * Math.sin(avgRotationRad)
  }

  /**
   * Check if two regions are on the same visual line
   */
  const areSameLine = (a, b) => {
    const threshold = Math.min(getEffectiveHeight(a), getEffectiveHeight(b)) * sameLineThreshold

    if (useRotatedComparison) {
      // For rotated text: compare projections onto perpendicular axis
      const aProj = getPerpendicularProjection(a)
      const bProj = getPerpendicularProjection(b)
      return Math.abs(aProj - bProj) < threshold
    } else {
      // Default: compare Y-centers
      const aCenterY = a.bounds.y + a.bounds.height / 2
      const bCenterY = b.bounds.y + b.bounds.height / 2
      return Math.abs(aCenterY - bCenterY) < threshold
    }
  }

  // 1. Robust Sorting (Reading Order)
  // Sort by "vertical" position first (lines), then by "horizontal" (words in line)
  // For rotated text, uses projection onto rotated axes
  regions.sort((a, b) => {
    const threshold = Math.min(getEffectiveHeight(a), getEffectiveHeight(b)) * sameLineThreshold

    if (useRotatedComparison) {
      // Rotated text: use projections
      const aPerpProj = getPerpendicularProjection(a)
      const bPerpProj = getPerpendicularProjection(b)

      if (Math.abs(aPerpProj - bPerpProj) < threshold) {
        // Same line -> sort by parallel projection (reading direction)
        return getParallelProjection(a) - getParallelProjection(b)
      }
      // Different lines -> sort by perpendicular projection (line order)
      return aPerpProj - bPerpProj
    } else {
      // Non-rotated: use Y-center and X
      const aCenterY = a.bounds.y + a.bounds.height / 2
      const bCenterY = b.bounds.y + b.bounds.height / 2

      if (Math.abs(aCenterY - bCenterY) < threshold) {
        return a.bounds.x - b.bounds.x
      }
      return aCenterY - bCenterY
    }
  })

  // 2. Process colors: unify similar colors or preserve distinct ones (e.g., highlights)
  unifyOrPreserveColors(regions, settings)

  // 3. Smart Text Joining
  // Determine whether to use space " " or newline "\n" based on visual line position
  let text = regions[0].text
  for (let i = 1; i < regions.length; i++) {
    const prev = regions[i - 1]
    const curr = regions[i]

    // Check if on the same visual line (rotation-aware)
    const isSameLine = areSameLine(prev, curr)

    // Join with space if same line, newline if logically distinct line
    const separator = isSameLine ? ' ' : '\n'

    // Prevent double spaces if OCR already provided one
    if (separator === ' ' && (text.endsWith(' ') || curr.text.startsWith(' '))) {
      text += curr.text
    } else {
      text += separator + curr.text
    }
  }

  const bounds = getGroupBounds(regions)
  const avgConfidence = regions.reduce((sum, r) => sum + r.confidence, 0) / regions.length

  // Use MAX line height for fontSize (not average)
  // Rationale: OCR detection boxes may be undersized (cropped), but rarely oversized.
  // The largest line height best represents the actual text size.
  const maxHeight = Math.max(...regions.map((r) => r.bounds.height))

  // Propagate polygon-mode (trapezoid) data only when:
  // 1. ALL constituent regions are polygon-mode
  // 2. All regions have similar rotation angles (within threshold)
  // 3. Regions are vertically stacked (not side-by-side)
  //
  // Otherwise, fall back to axis-aligned bounding box (no rotation).
  const ROTATION_DIFF_THRESHOLD = 15 // degrees

  const allPolygonMode = regions.every((r) => r.isPolygonMode && r.polygon)
  let usePolygonMode = false
  let polygon

  if (allPolygonMode && regions.length > 0) {
    // Check rotation angle consistency
    const angles = regions.map((r) => getPolygonRotationAngle(r.polygon))
    const minAngle = Math.min(...angles)
    const maxAngle = Math.max(...angles)
    const angleDiff = Math.abs(maxAngle - minAngle)

    if (angleDiff <= ROTATION_DIFF_THRESHOLD && isVerticallyStacked(regions)) {
      // All conditions met: merge as polygon
      if (regions.length === 1) {
        // Single region: use its polygon directly
        polygon = [...regions[0].polygon]
        usePolygonMode = true
      } else {
        // Multiple regions: create a rotated bounding box using average angle
        const avgAngle = angles.reduce((a, b) => a + b, 0) / angles.length
        const mergedPolygon = createRotatedBoundingBox(regions, avgAngle)
        if (mergedPolygon) {
          polygon = mergedPolygon
          usePolygonMode = true
        }
      }
    }
  }

  if (!usePolygonMode) {
    // Fall back to axis-aligned bounding box
    polygon = [
      [bounds.x, bounds.y],
      [bounds.x + bounds.width, bounds.y],
      [bounds.x + bounds.width, bounds.y + bounds.height],
      [bounds.x, bounds.y + bounds.height],
    ]
  }

  return {
    text,
    confidence: avgConfidence,
    bounds,
    polygon,
    ...(usePolygonMode ? { isPolygonMode: true } : {}),
    alignment: inferAlignment(regions),
    fontSize: maxHeight,
    // Keep original lines for potential detailed editing later
    // Each line now has textColor property (possibly unified)
    lines: regions,
  }
}

// ============================================================================
// Utilities & Data Structures
// ============================================================================

/**
 * Calculate the rotation angle (in degrees) of a polygon region.
 * Uses the average of top-edge and bottom-edge angles relative to horizontal.
 *
 * @param {Array<[number, number]>} polygon - [nw, ne, se, sw] vertices
 * @returns {number} Rotation angle in degrees (-90 to +90)
 */
function getPolygonRotationAngle(polygon) {
  if (!polygon || polygon.length !== 4) return 0
  const [nw, ne, se, sw] = polygon
  const topAngle = Math.atan2(ne[1] - nw[1], ne[0] - nw[0])
  const bottomAngle = Math.atan2(se[1] - sw[1], se[0] - sw[0])
  return ((topAngle + bottomAngle) / 2) * (180 / Math.PI)
}

/**
 * Check if regions are arranged primarily vertically (stacked) vs horizontally (side-by-side).
 * Compares Y-span to X-span of the first and last region centers.
 *
 * @param {Array} regions - Sorted regions (reading order)
 * @returns {boolean} True if vertically stacked
 */
function isVerticallyStacked(regions) {
  if (regions.length <= 1) return true
  const first = regions[0]
  const last = regions[regions.length - 1]
  const firstCenterY = first.bounds.y + first.bounds.height / 2
  const lastCenterY = last.bounds.y + last.bounds.height / 2
  const firstCenterX = first.bounds.x + first.bounds.width / 2
  const lastCenterX = last.bounds.x + last.bounds.width / 2
  const yDiff = Math.abs(lastCenterY - firstCenterY)
  const xDiff = Math.abs(lastCenterX - firstCenterX)
  return yDiff >= xDiff
}

/**
 * Create a rotated bounding box that encompasses all polygon regions.
 * Uses the average rotation angle and computes the minimal enclosing rotated rectangle.
 *
 * @param {Array} regions - Polygon regions to merge
 * @param {number} angleDeg - Rotation angle in degrees
 * @returns {Array<[number, number]>} Merged polygon [nw, ne, se, sw]
 */
function createRotatedBoundingBox(regions, angleDeg) {
  // Collect all vertices from all polygons
  const allPoints = []
  for (const r of regions) {
    if (r.polygon && r.polygon.length === 4) {
      allPoints.push(...r.polygon)
    }
  }

  if (allPoints.length === 0) {
    return null
  }

  // Convert angle to radians
  const angleRad = (angleDeg * Math.PI) / 180
  const cos = Math.cos(-angleRad) // Negative to rotate points to axis-aligned space
  const sin = Math.sin(-angleRad)

  // Rotate all points to axis-aligned space
  const rotatedPoints = allPoints.map(([x, y]) => [
    x * cos - y * sin,
    x * sin + y * cos,
  ])

  // Find bounding box in rotated space
  let minX = Infinity,
    minY = Infinity
  let maxX = -Infinity,
    maxY = -Infinity
  for (const [x, y] of rotatedPoints) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }

  // Create rectangle corners in rotated space
  const rectCorners = [
    [minX, minY], // nw in rotated space
    [maxX, minY], // ne
    [maxX, maxY], // se
    [minX, maxY], // sw
  ]

  // Rotate back to original space
  const cosBack = Math.cos(angleRad)
  const sinBack = Math.sin(angleRad)
  return rectCorners.map(([x, y]) => [
    x * cosBack - y * sinBack,
    x * sinBack + y * cosBack,
  ])
}

/**
 * Get bounding box for a group of regions
 */
function getGroupBounds(regions) {
  let minX = Infinity,
    minY = Infinity
  let maxX = -Infinity,
    maxY = -Infinity

  for (const r of regions) {
    minX = Math.min(minX, r.bounds.x)
    minY = Math.min(minY, r.bounds.y)
    maxX = Math.max(maxX, r.bounds.x + r.bounds.width)
    maxY = Math.max(maxY, r.bounds.y + r.bounds.height)
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

/**
 * Calculate standard deviation of an array
 * @param {Array<number>} arr
 * @returns {number}
 */
export function getStandardDeviation(arr) {
  if (arr.length <= 1) return 0
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length
  const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length
  return Math.sqrt(variance)
}

/**
 * Infer text alignment from line positions
 *
 * Compares standard deviation of left edges, centers, and right edges
 * to determine the most consistent alignment.
 *
 * @param {Array} lines - Array of line objects with bounds
 * @returns {'left'|'center'|'right'}
 */
export function inferAlignment(lines) {
  if (lines.length <= 1) return 'left'

  const lefts = lines.map((l) => l.bounds.x)
  const centers = lines.map((l) => l.bounds.x + l.bounds.width / 2)
  const rights = lines.map((l) => l.bounds.x + l.bounds.width)

  const leftStd = getStandardDeviation(lefts)
  const centerStd = getStandardDeviation(centers)
  const rightStd = getStandardDeviation(rights)

  if (centerStd < leftStd * 0.8 && centerStd < rightStd * 0.8) return 'center'
  if (rightStd < leftStd * 0.8 && rightStd < centerStd) return 'right'

  return 'left'
}

/**
 * Calculate minimum Tesseract confidence threshold
 * Combines text length and character type factors
 *
 * @param {string} text - The recognized text
 * @returns {number} - Minimum confidence threshold (0-100)
 */
export function getMinTesseractConfidence(text) {
  const length = text.length

  // === 1. Base threshold by length ===
  let baseThreshold
  if (length <= 3) {
    baseThreshold = 65 // Very short: "5%", "OK", "Q1"
  } else if (length <= 8) {
    baseThreshold = 55 // Short: "2024年", "Hello", "第一季"
  } else if (length <= 15) {
    baseThreshold = 45 // Medium: "第一季度報告", "Revenue Growth"
  } else {
    baseThreshold = 35 // Long: Full sentences with context
  }

  // === 2. Adjustment by character type ===
  const numericRatio = (text.match(/[\d]/g) || []).length / length
  const hasConfusingChars = /[0O1lI|]/.test(text)

  let adjustment = 0

  // High numeric ratio (>50%): digits are prone to confusion
  if (numericRatio > 0.5) {
    adjustment += 10
  }

  // Contains confusing characters in short text
  if (hasConfusingChars && length <= 8) {
    adjustment += 5
  }

  // === 3. Final threshold (cap at 80%) ===
  return Math.min(baseThreshold + adjustment, 80)
}

// ============================================================================
// WebGPU Detection (for future useOcr.js)
// ============================================================================

/**
 * Check if WebGPU is available and usable
 *
 * @returns {Promise<boolean>}
 */
export async function hasWebGPU() {
  if (typeof navigator === 'undefined' || !navigator.gpu) return false
  try {
    const adapter = await navigator.gpu.requestAdapter()
    return !!adapter
  } catch {
    return false
  }
}

/**
 * Check if running on mobile device
 *
 * Mobile devices often have WebGPU support issues or limited GPU memory,
 * so we prefer WASM Worker on mobile.
 *
 * @returns {boolean}
 */
export function isMobile() {
  if (typeof navigator === 'undefined') return false
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Load image as ImageBitmap
 *
 * Supports data URL input. Works in both Worker and Main Thread contexts.
 *
 * @param {string} imageDataUrl - Data URL of the image
 * @returns {Promise<ImageBitmap>}
 */
export async function loadImage(imageDataUrl) {
  const response = await fetch(imageDataUrl)
  const blob = await response.blob()
  return createImageBitmap(blob)
}

/**
 * Crop a region from ImageBitmap and return as data URL
 *
 * Used for Tesseract fallback to extract individual text regions.
 *
 * @param {ImageBitmap} bitmap - Source image
 * @param {Object} bounds - { x, y, width, height }
 * @param {number} padding - Extra padding around the region (default: 5)
 * @returns {Promise<string>} - Data URL of cropped region
 */
export async function cropRegionToDataUrl(bitmap, bounds, padding = 5) {
  const canvas = new OffscreenCanvas(
    Math.min(bounds.width + padding * 2, bitmap.width),
    Math.min(bounds.height + padding * 2, bitmap.height)
  )
  const ctx = canvas.getContext('2d')

  const srcX = Math.max(0, bounds.x - padding)
  const srcY = Math.max(0, bounds.y - padding)
  const srcW = Math.min(bounds.width + padding * 2, bitmap.width - srcX)
  const srcH = Math.min(bounds.height + padding * 2, bitmap.height - srcY)

  ctx.drawImage(bitmap, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH)

  const blob = await canvas.convertToBlob({ type: 'image/png' })
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

// ============================================================================
// Detection Preprocessing & Postprocessing
// Shared between Worker (WASM) and Main Thread (WebGPU)
// ============================================================================

/**
 * Preprocess image for DBNet detection model
 *
 * Steps:
 * 1. Scale image (only downscale if larger than maxSideLen)
 * 2. Pad to multiple of 32
 * 3. Normalize with ImageNet mean/std
 * 4. Create tensor in BGR order (PaddleOCR format)
 *
 * @param {ImageBitmap} bitmap - Source image
 * @param {Object} settings - OCR settings { maxSideLen, ... }
 * @param {Function} TensorClass - ONNX Runtime Tensor class (ort.Tensor)
 * @returns {Object} - { tensor, width, height, originalWidth, originalHeight, scaleX, scaleY }
 */
export function preprocessForDetection(bitmap, settings, TensorClass) {
  const maxSideLen = settings.maxSideLen
  let width = bitmap.width
  let height = bitmap.height

  // Only downscale if the image is larger than maxSideLen
  const ratio = maxSideLen / Math.max(width, height)
  const scale = ratio < 1 ? ratio : 1

  width = Math.round(width * scale)
  height = Math.round(height * scale)

  // Pad to multiple of 32 (required by DBNet)
  const newWidth = Math.ceil(width / 32) * 32
  const newHeight = Math.ceil(height / 32) * 32

  // Use OffscreenCanvas (works in both Worker and Main Thread)
  const canvas = new OffscreenCanvas(newWidth, newHeight)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, newWidth, newHeight)
  ctx.drawImage(bitmap, 0, 0, width, height)

  const imageData = ctx.getImageData(0, 0, newWidth, newHeight)
  const data = imageData.data

  // ImageNet normalization parameters
  const mean = DETECTION_MEAN
  const std = DETECTION_STD

  // Create normalized tensor in BGR order (PaddleOCR format)
  const float32Data = new Float32Array(3 * newWidth * newHeight)
  for (let i = 0; i < newWidth * newHeight; i++) {
    const r = data[i * 4] / 255
    const g = data[i * 4 + 1] / 255
    const b = data[i * 4 + 2] / 255

    // BGR Order (PaddleOCR uses BGR, not RGB)
    float32Data[i] = (b - mean[2]) / std[2]
    float32Data[newWidth * newHeight + i] = (g - mean[1]) / std[1]
    float32Data[2 * newWidth * newHeight + i] = (r - mean[0]) / std[0]
  }

  const tensor = new TensorClass('float32', float32Data, [1, 3, newHeight, newWidth])

  return {
    tensor,
    width: newWidth,
    height: newHeight,
    originalWidth: bitmap.width,
    originalHeight: bitmap.height,
    scaleX: bitmap.width / width,
    scaleY: bitmap.height / height,
  }
}

/**
 * Post-process DBNet detection output to extract text boxes
 *
 * Steps:
 * 1. Threshold the probability map to binary mask
 * 2. Apply morphological dilation to connect characters
 * 3. Find connected components (8-connectivity)
 * 4. Calculate expanded bounding boxes using unclip ratio
 * 5. Filter by confidence and area
 *
 * @param {Object} outputTensor - ONNX output tensor
 * @param {Object} settings - OCR settings { threshold, boxThreshold, unclipRatio, dilationH, dilationV }
 * @param {number} width - Preprocessed image width
 * @param {number} height - Preprocessed image height
 * @param {number} scaleX - X scale factor to original
 * @param {number} scaleY - Y scale factor to original
 * @param {number} originalWidth - Original image width
 * @param {number} originalHeight - Original image height
 * @returns {Array<{box: Array, score: number}>} - Array of detected boxes with scores
 */
export function postProcessDetection(
  outputTensor,
  settings,
  width,
  height,
  scaleX,
  scaleY,
  originalWidth,
  originalHeight
) {
  const { threshold, boxThreshold, unclipRatio, dilationH, dilationV } = settings
  const minArea = 100

  const data = outputTensor.data
  const outputDims = outputTensor.dims

  // Handle different output dimension formats
  let outputH, outputW
  if (outputDims.length === 4) {
    outputH = outputDims[2]
    outputW = outputDims[3]
  } else if (outputDims.length === 3) {
    outputH = outputDims[1]
    outputW = outputDims[2]
  } else {
    outputH = outputDims[0]
    outputW = outputDims[1]
  }

  const actualWidth = outputW || width
  const actualHeight = outputH || height
  const finalScaleX = scaleX * (width / actualWidth)
  const finalScaleY = scaleY * (height / actualHeight)

  // 1. Create binary mask from probability map
  let mask = new Uint8Array(actualWidth * actualHeight)
  for (let i = 0; i < actualWidth * actualHeight; i++) {
    mask[i] = data[i] > threshold ? 255 : 0
  }

  // Save raw mask for scoring (before dilation)
  const rawMask = new Uint8Array(mask)

  // 2. Apply morphological dilation to connect characters
  mask = dilateMask(mask, actualWidth, actualHeight, dilationH, dilationV)

  // 3. Find connected components (8-connectivity)
  const components = findConnectedComponents(mask, actualWidth, actualHeight)

  // 4. Extract boxes from components
  const boxes = []
  for (const component of components) {
    // Calculate bounding box from [x, y] coordinates
    let minX = Infinity,
      maxX = -Infinity
    let minY = Infinity,
      maxY = -Infinity
    let scoreSum = 0
    let rawPixelCount = 0

    for (const [px, py] of component) {
      minX = Math.min(minX, px)
      maxX = Math.max(maxX, px)
      minY = Math.min(minY, py)
      maxY = Math.max(maxY, py)

      // Only count score from raw (undilated) mask pixels
      const pIdx = py * actualWidth + px
      if (rawMask[pIdx] === 255) {
        scoreSum += data[pIdx]
        rawPixelCount++
      }
    }

    // Filter by size constraints
    const boxW = maxX - minX + 1
    const boxH = maxY - minY + 1
    const boxArea = boxW * boxH

    if (boxArea < minArea || rawPixelCount < 10) continue

    // Calculate score from raw pixels only (not dilated)
    const score = rawPixelCount > 0 ? scoreSum / rawPixelCount : 0
    if (score < boxThreshold) continue

    // 5. Apply unclip expansion (DBNet boxes are shrunk during training)
    const area = component.length
    const perimeter = 2 * (boxW + boxH)
    const offset = (area * unclipRatio) / perimeter

    const expandedMinX = Math.max(0, minX - offset)
    const expandedMinY = Math.max(0, minY - offset)
    const expandedMaxX = Math.min(actualWidth - 1, maxX + offset)
    const expandedMaxY = Math.min(actualHeight - 1, maxY + offset)

    // Scale to original image coordinates
    const box = [
      [expandedMinX * finalScaleX, expandedMinY * finalScaleY],
      [expandedMaxX * finalScaleX, expandedMinY * finalScaleY],
      [expandedMaxX * finalScaleX, expandedMaxY * finalScaleY],
      [expandedMinX * finalScaleX, expandedMaxY * finalScaleY],
    ]

    // Clamp to original image bounds
    for (const point of box) {
      point[0] = Math.max(0, Math.min(originalWidth, point[0]))
      point[1] = Math.max(0, Math.min(originalHeight, point[1]))
    }

    boxes.push({ box, score })
  }

  return boxes
}

/**
 * Apply morphological dilation to binary mask
 *
 * @param {Uint8Array} mask - Binary mask
 * @param {number} width - Mask width
 * @param {number} height - Mask height
 * @param {number} iterationsH - Horizontal dilation iterations
 * @param {number} iterationsV - Vertical dilation iterations
 * @returns {Uint8Array} - Dilated mask
 */
function dilateMask(mask, width, height, iterationsH = 2, iterationsV = 1) {
  let current = mask
  let next = new Uint8Array(mask.length)

  // 1. Horizontal Dilation (Connect characters in a line)
  for (let iter = 0; iter < iterationsH; iter++) {
    next.fill(0)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x
        if (current[idx] === 255) {
          next[idx] = 255
          if (x > 0) next[idx - 1] = 255
          if (x < width - 1) next[idx + 1] = 255
        }
      }
    }
    ;[current, next] = [next, current]
  }

  // 2. Vertical Dilation (Connect strokes, less aggressive)
  for (let iter = 0; iter < iterationsV; iter++) {
    next.fill(0)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x
        if (current[idx] === 255) {
          next[idx] = 255
          if (y > 0) next[idx - width] = 255
          if (y < height - 1) next[idx + width] = 255
        }
      }
    }
    ;[current, next] = [next, current]
  }

  return current
}

/**
 * Find connected components in binary mask using flood fill
 * Uses 8-connectivity (includes diagonals) for better text region detection
 *
 * @param {Uint8Array} mask - Binary mask
 * @param {number} width - Mask width
 * @param {number} height - Mask height
 * @returns {Array<Array<[number, number]>>} - Array of components (each component is array of [x, y] coordinates)
 */
function findConnectedComponents(mask, width, height) {
  const visited = new Set()
  const components = []

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      if (mask[idx] === 0 || visited.has(idx)) continue

      const component = []
      const queue = [[x, y]]
      visited.add(idx)

      let head = 0
      while (head < queue.length) {
        const [cx, cy] = queue[head++]
        component.push([cx, cy])

        // 8-connectivity neighbors (including diagonals)
        const neighbors = [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
          [cx - 1, cy - 1],
          [cx + 1, cy - 1],
          [cx - 1, cy + 1],
          [cx + 1, cy + 1],
        ]

        for (const [nx, ny] of neighbors) {
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
          const nidx = ny * width + nx
          if (mask[nidx] === 0 || visited.has(nidx)) continue
          visited.add(nidx)
          queue.push([nx, ny])
        }
      }

      if (component.length > 0) {
        components.push(component)
      }
    }
  }

  return components
}

// ============================================================================
// Recognition Preprocessing & Decoding
// ============================================================================

/**
 * Preprocess a detected text region for recognition model
 *
 * @param {ImageBitmap} bitmap - Source image
 * @param {Array} box - Polygon coordinates [[x,y], [x,y], [x,y], [x,y]]
 * @param {Function} TensorClass - ONNX Runtime Tensor class
 * @returns {Object|null} - Tensor or null if region is invalid
 */
export function preprocessForRecognition(bitmap, box, TensorClass) {
  const targetHeight = RECOGNITION_TARGET_HEIGHT
  const maxWidth = RECOGNITION_MAX_WIDTH

  const xs = box.map((p) => p[0])
  const ys = box.map((p) => p[1])
  const x0 = Math.floor(Math.min(...xs))
  const y0 = Math.floor(Math.min(...ys))
  const x1 = Math.ceil(Math.max(...xs))
  const y1 = Math.ceil(Math.max(...ys))

  const cropWidth = x1 - x0
  const cropHeight = y1 - y0

  if (cropWidth <= 0 || cropHeight <= 0) return null

  const aspectRatio = cropWidth / cropHeight
  let targetWidth = Math.round(targetHeight * aspectRatio)
  targetWidth = Math.min(targetWidth, maxWidth)
  targetWidth = Math.max(targetWidth, 10)

  const canvas = new OffscreenCanvas(targetWidth, targetHeight)
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, targetWidth, targetHeight)
  ctx.drawImage(bitmap, x0, y0, cropWidth, cropHeight, 0, 0, targetWidth, targetHeight)

  const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight)
  const data = imageData.data

  const float32Data = new Float32Array(3 * targetWidth * targetHeight)
  for (let i = 0; i < targetWidth * targetHeight; i++) {
    const r = (data[i * 4] / 255 - 0.5) / 0.5
    const g = (data[i * 4 + 1] / 255 - 0.5) / 0.5
    const b = (data[i * 4 + 2] / 255 - 0.5) / 0.5

    // BGR Order (PaddleOCR format)
    float32Data[i] = b
    float32Data[targetWidth * targetHeight + i] = g
    float32Data[2 * targetWidth * targetHeight + i] = r
  }

  return new TensorClass('float32', float32Data, [1, 3, targetHeight, targetWidth])
}

/**
 * Decode CTC output from recognition model
 *
 * @param {Object} output - ONNX output tensor
 * @param {Array<string>} dictionary - Character dictionary
 * @returns {{ text: string, confidence: number }}
 */
export function decodeRecognition(output, dictionary) {
  const data = output.data
  const dims = output.dims
  const seqLen = dims[1]
  const vocabSize = dims[2]

  let text = ''
  let totalConf = 0
  let charCount = 0
  let prevIdx = 0

  for (let t = 0; t < seqLen; t++) {
    let maxIdx = 0
    let maxVal = data[t * vocabSize]

    for (let v = 1; v < vocabSize; v++) {
      const val = data[t * vocabSize + v]
      if (val > maxVal) {
        maxVal = val
        maxIdx = v
      }
    }

    if (maxIdx !== 0 && maxIdx !== prevIdx) {
      if (maxIdx === vocabSize - 1) {
        text += ' '
        totalConf += Math.exp(maxVal)
        charCount++
      } else if (maxIdx < dictionary.length) {
        text += dictionary[maxIdx]
        totalConf += Math.exp(maxVal)
        charCount++
      }
    }

    prevIdx = maxIdx
  }

  const confidence = charCount > 0 ? Math.round((totalConf / charCount) * 100) : 0
  return { text, confidence: Math.min(100, confidence) }
}

// ============================================================================
// Tesseract.js Fallback Factory
// Creates Tesseract fallback functions with shared logic for Worker and Main Thread
// ============================================================================

/**
 * Create Tesseract fallback functions
 *
 * Factory function that returns Tesseract helper functions. Each caller (Worker/Main Thread)
 * gets its own Tesseract worker instance but shares the same logic.
 *
 * @param {Function} Tesseract - Tesseract.js module (must be imported by caller)
 * @param {Function} onProgress - Progress callback: (value: number, message: string) => void
 * @returns {Object} - { initializeTesseract, recognizeWithTesseract, applyTesseractFallback, terminateTesseract }
 *
 * @example
 * // In Worker:
 * import Tesseract from 'tesseract.js'
 * const { applyTesseractFallback, terminateTesseract } = createTesseractFallback(
 *   Tesseract,
 *   (value, msg) => self.postMessage({ type: 'progress', stage: 'tesseract', value, message: msg })
 * )
 *
 * @example
 * // In Main Thread:
 * import Tesseract from 'tesseract.js'
 * const { applyTesseractFallback, terminateTesseract } = createTesseractFallback(
 *   Tesseract,
 *   (value, msg) => onProgress?.(value, msg, 'tesseract')
 * )
 */
export function createTesseractFallback(Tesseract, onProgress = () => {}) {
  // Instance state (each caller gets its own)
  let tesseractWorker = null
  let tesseractInitPromise = null

  /**
   * Initialize Tesseract worker (lazy, singleton per instance)
   */
  async function initializeTesseract() {
    if (tesseractWorker) return tesseractWorker
    if (tesseractInitPromise) return tesseractInitPromise

    tesseractInitPromise = (async () => {
      onProgress(0, 'Loading Tesseract fallback...')

      // Suppress "Parameter not found" warnings from Tesseract
      const originalWarn = console.warn
      console.warn = (...args) => {
        const message = args[0]?.toString() || ''
        if (!message.includes('Parameter not found')) {
          originalWarn.apply(console, args)
        }
      }

      try {
        tesseractWorker = await Tesseract.createWorker(['eng', 'chi_tra'], 1, {
          errorHandler: (err) => {
            if (!err.message?.includes('Parameter not found')) {
              console.error('Tesseract error:', err)
            }
          },
        })
      } finally {
        console.warn = originalWarn
      }

      onProgress(100, 'Tesseract ready')
      return tesseractWorker
    })()

    return tesseractInitPromise
  }

  /**
   * Recognize a single region with Tesseract
   *
   * @param {ImageBitmap} bitmap - Source image
   * @param {Object} region - Region with bounds property
   * @returns {Promise<{text: string, confidence: number}|null>}
   */
  async function recognizeWithTesseract(bitmap, region) {
    try {
      const worker = await initializeTesseract()
      const croppedDataUrl = await cropRegionToDataUrl(bitmap, region.bounds)

      const result = await worker.recognize(croppedDataUrl)
      const text = result.data.text.trim()
      const confidence = result.data.confidence

      const minConfidence = getMinTesseractConfidence(text)
      if (text && confidence >= minConfidence) {
        return { text, confidence }
      }
      return null
    } catch (error) {
      console.warn('Tesseract recognition failed:', error)
      return null
    }
  }

  /**
   * Apply Tesseract fallback for regions that failed PaddleOCR recognition
   *
   * @param {ImageBitmap} bitmap - Source image
   * @param {Array} rawResults - Array of OCR results (will be mutated)
   * @returns {Promise<Array>} - Same array with recovered regions updated
   */
  async function applyTesseractFallback(bitmap, rawResults) {
    const failedRegions = rawResults.filter((r) => r.recognitionFailed)

    if (failedRegions.length === 0) {
      return rawResults
    }

    onProgress(0, `Trying Tesseract fallback for ${failedRegions.length} region(s)...`)

    let recoveredCount = 0
    for (let i = 0; i < failedRegions.length; i++) {
      const region = failedRegions[i]
      const tesseractResult = await recognizeWithTesseract(bitmap, region)

      if (tesseractResult) {
        region.text = tesseractResult.text
        region.confidence = tesseractResult.confidence
        region.recognitionFailed = false
        region.failureReason = null
        region.recognitionSource = 'tesseract'
        recoveredCount++
      }

      const progress = Math.round(((i + 1) / failedRegions.length) * 100)
      onProgress(progress, `Tesseract: ${i + 1}/${failedRegions.length}`)
    }

    if (recoveredCount > 0) {
      onProgress(100, `Tesseract recovered ${recoveredCount}/${failedRegions.length} region(s)`)
    } else {
      onProgress(100, `Tesseract could not recover any regions`)
    }

    return rawResults
  }

  /**
   * Terminate Tesseract worker and clean up resources
   */
  async function terminateTesseract() {
    if (tesseractWorker) {
      await tesseractWorker.terminate()
      tesseractWorker = null
      tesseractInitPromise = null
    }
  }

  return {
    initializeTesseract,
    recognizeWithTesseract,
    applyTesseractFallback,
    terminateTesseract,
  }
}
