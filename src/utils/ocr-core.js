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
 * This approach is ideal for structured documents like slides and papers.
 *
 * @param {Array} rawResults - Array of OCR results with bounds, text, confidence
 * @returns {Array} - Merged text blocks with combined bounds and inferred alignment
 */
export function mergeTextRegions(rawResults) {
  // 1. Preprocessing: Filter invalid data
  const validRegions = rawResults.filter((r) => !r.recognitionFailed && r.text.trim().length > 0)
  if (validRegions.length === 0) return []

  // 2. Recursive XY-Cut
  // Splits page into independent zones down to the paragraph/block level
  const leafZones = performRecursiveXYCut(validRegions)

  // 3. Block Creation
  // Convert each leaf zone into a text block
  return leafZones.map(createBlockFromRegions)
}

// ============================================================================
// Phase 1: Recursive XY-Cut (Macro Layout Analysis)
// ============================================================================

/**
 * Recursively cuts the document into rectangular zones based on whitespace separators.
 *
 * @param {Array} regions - List of text regions
 * @param {number} depth - Recursion depth limit
 * @returns {Array<Array>} - Array of region groups (zones)
 */
function performRecursiveXYCut(regions, depth = 0) {
  // Stop recursion if too deep or too few regions
  if (depth > 10 || regions.length < 2) return [regions]

  const bounds = getGroupBounds(regions)
  const medianHeight = getMedianLineHeight(regions)

  // 1. Try Vertical Cut (Separating Columns) - Higher Priority
  // Look for wide vertical gaps in the X-projection
  // Threshold: 1.5x line height (Columns are usually separated by wide gaps)
  const verticalCut = findBestCut(regions, bounds, 'x', medianHeight * 1.5)
  if (verticalCut) {
    const left = regions.filter((r) => r.bounds.x + r.bounds.width / 2 < verticalCut)
    const right = regions.filter((r) => r.bounds.x + r.bounds.width / 2 >= verticalCut)
    return [...performRecursiveXYCut(left, depth + 1), ...performRecursiveXYCut(right, depth + 1)]
  }

  // 2. Try Horizontal Cut (Separating Sections/Paragraphs)
  // Look for wide horizontal gaps in the Y-projection
  // Threshold: 0.3x line height (Standard paragraph spacing)
  const horizontalCut = findBestCut(regions, bounds, 'y', medianHeight * 0.3)
  if (horizontalCut) {
    const top = regions.filter((r) => r.bounds.y + r.bounds.height / 2 < horizontalCut)
    const bottom = regions.filter((r) => r.bounds.y + r.bounds.height / 2 >= horizontalCut)
    return [...performRecursiveXYCut(top, depth + 1), ...performRecursiveXYCut(bottom, depth + 1)]
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
 * Helper: Create a final merged block from a list of regions
 */
function createBlockFromRegions(regions) {
  if (regions.length === 0) return null

  // 1. Robust Sorting (Reading Order)
  // Sort by Y-center first (lines), then by X (words in line)
  regions.sort((a, b) => {
    const aCenterY = a.bounds.y + a.bounds.height / 2
    const bCenterY = b.bounds.y + b.bounds.height / 2
    // Threshold to 0.7 for better tolerance
    const threshold = Math.min(a.bounds.height, b.bounds.height) * 0.7

    // If Y-centers are close enough, they are on the same line -> Sort Left-to-Right
    if (Math.abs(aCenterY - bCenterY) < threshold) {
      return a.bounds.x - b.bounds.x
    }
    // Otherwise -> Sort Top-Down
    return aCenterY - bCenterY
  })

  // 2. Smart Text Joining
  // Determine whether to use space " " or newline "\n" based on vertical position
  let text = regions[0].text
  for (let i = 1; i < regions.length; i++) {
    const prev = regions[i - 1]
    const curr = regions[i]

    const prevCenterY = prev.bounds.y + prev.bounds.height / 2
    const currCenterY = curr.bounds.y + curr.bounds.height / 2
    const threshold = Math.min(prev.bounds.height, curr.bounds.height) * 0.7

    // Check if on the same line
    const isSameLine = Math.abs(prevCenterY - currCenterY) < threshold

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
  const avgHeight = regions.reduce((sum, r) => sum + r.bounds.height, 0) / regions.length

  return {
    text,
    confidence: avgConfidence,
    bounds,
    polygon: [
      [bounds.x, bounds.y],
      [bounds.x + bounds.width, bounds.y],
      [bounds.x + bounds.width, bounds.y + bounds.height],
      [bounds.x, bounds.y + bounds.height],
    ],
    alignment: inferAlignment(regions),
    fontSize: avgHeight,
    // Keep original lines for potential detailed editing later
    lines: regions,
  }
}

// ============================================================================
// Utilities & Data Structures
// ============================================================================

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
