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
export const RECOGNITION_MAX_WIDTH = 320

/**
 * Detection model parameters
 */
export const DETECTION_MAX_SIDE_LEN = 1280
export const DETECTION_THRESHOLD = 0.2
export const DETECTION_BOX_THRESHOLD = 0.5
export const DETECTION_MIN_AREA = 100

// ============================================================================
// Hybrid Layout Analysis Engine
// Combined Recursive XY-Cut (Macro) + Graph-Based Clustering (Micro)
// ============================================================================

/**
 * Merge individual text lines into logical text blocks using a Hybrid approach.
 *
 * Phase 1: Macro-Analysis (Relaxed XY-Cut)
 * Partitions the page into major zones (e.g., columns, headers, footers) based on visual whitespace.
 * This prevents valid text in different columns from being incorrectly merged.
 *
 * Phase 2: Micro-Analysis (Graph Clustering)
 * Within each zone, builds a graph where nodes are text lines and edges represent "affinity".
 * Affinity is calculated based on vertical distance, height similarity, and alignment.
 * Connected components in this graph form the final text blocks.
 *
 * @param {Array} rawResults - Array of OCR results with bounds, text, confidence
 * @returns {Array} - Merged text blocks with combined bounds and inferred alignment
 */
export function mergeTextRegions(rawResults) {
  // 1. Preprocessing: Filter invalid data
  const validRegions = rawResults.filter((r) => !r.recognitionFailed && r.text.trim().length > 0)
  if (validRegions.length === 0) return []

  // 2. Phase 1: Macro Partitioning (XY-Cut)
  // Splits page into independent zones to enforce column separation
  const zones = performRelaxedXYCut(validRegions)

  let finalBlocks = []

  // 3. Phase 2: Local Clustering
  // Run graph-based merging independently within each zone
  for (const zoneRegions of zones) {
    if (zoneRegions.length === 0) continue
    const zoneBlocks = performGraphClustering(zoneRegions)
    finalBlocks = finalBlocks.concat(zoneBlocks)
  }

  return finalBlocks
}

// ============================================================================
// Phase 1: Recursive XY-Cut (Macro Layout Analysis)
// ============================================================================



/**
 * Recursively cuts the document into rectangular zones based on whitespace separators.
 * "Relaxed" means it tolerates small overlaps to avoid over-segmentation.
 *
 * @param {Array} regions - List of text regions
 * @param {number} depth - Recursion depth limit
 * @returns {Array<Array>} - Array of region groups (zones)
 */
function performRelaxedXYCut(regions, depth = 0) {
  // Stop recursion if too deep or too few regions
  if (depth > 10 || regions.length < 2) return [regions]

  const bounds = getGroupBounds(regions)
  const medianHeight = getMedianLineHeight(regions)

  // 1. Try Vertical Cut (Separating Columns) - Higher Priority
  // Look for wide vertical gaps in the X-projection
  // Threshold: 1.5x line height (Columns are usually separated by wide gaps, tightened from 2.0)
  const verticalCut = findBestCut(regions, bounds, 'x', medianHeight * 1.5)
  if (verticalCut) {
    const left = regions.filter((r) => r.bounds.x + r.bounds.width / 2 < verticalCut)
    const right = regions.filter((r) => r.bounds.x + r.bounds.width / 2 >= verticalCut)
    return [...performRelaxedXYCut(left, depth + 1), ...performRelaxedXYCut(right, depth + 1)]
  }

  // 2. Try Horizontal Cut (Separating Sections)
  // Look for wide horizontal gaps in the Y-projection
  // Threshold: 0.3x line height (Sections usually have gaps, tightened from 0.5 to catch tighter layouts)
  const horizontalCut = findBestCut(regions, bounds, 'y', medianHeight * 0.3)
  if (horizontalCut) {
    const top = regions.filter((r) => r.bounds.y + r.bounds.height / 2 < horizontalCut)
    const bottom = regions.filter((r) => r.bounds.y + r.bounds.height / 2 >= horizontalCut)
    return [...performRelaxedXYCut(top, depth + 1), ...performRelaxedXYCut(bottom, depth + 1)]
  }

  // No valid cuts found, this is an atomic zone
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

// ============================================================================
// Phase 2: Graph-Based Clustering (Micro Merging)
// ============================================================================

/**
 * Groups text regions using connected components on an affinity graph.
 *
 * @param {Array} regions
 * @returns {Array} Merged blocks
 */
function performGraphClustering(regions) {
  const n = regions.length
  if (n === 0) return []
  if (n === 1) return [createBlockFromRegions(regions)]

  const ds = new DisjointSet(n)

  // Sort by Y position to optimize neighbor search
  regions.sort((a, b) => a.bounds.y - b.bounds.y)

  // Build Graph Edges
  // Only check neighbors within a reasonable window to avoid O(N^2)
  const LOOKBACK_WINDOW = 10

  for (let i = 0; i < n; i++) {
    const curr = regions[i]
    const start = Math.max(0, i - LOOKBACK_WINDOW)

    for (let j = start; j < i; j++) {
      const prev = regions[j]
      const score = calculateAffinity(prev, curr)

      // Threshold for merging (0.0 - 1.0)
      // Tightened to 0.80 to prevent loose merging of distinct paragraphs
      if (score > 0.80) {
        ds.union(i, j)
      }
    }
  }

  // Group by root representative
  const groups = {}
  for (let i = 0; i < n; i++) {
    const root = ds.find(i)
    if (!groups[root]) groups[root] = []
    groups[root].push(regions[i])
  }

  // Convert groups to blocks
  return Object.values(groups).map(createBlockFromRegions)
}

/**
 * Calculate "Affinity Score" between two text regions.
 * Higher score means they likely belong to the same paragraph.
 *
 * @param {Object} r1 - Region 1 (above)
 * @param {Object} r2 - Region 2 (below)
 * @returns {number} Score 0.0 - 1.0
 */
function calculateAffinity(r1, r2) {
  // 1. Font Size VETO (Critical for Title vs Subtitle)
  // If font size differs by > 10%, they are structurally different elements.
  // Tightened to 0.9 based on latest feedback to separate similar but distinct headers.
  const heightRatio = Math.min(r1.bounds.height, r2.bounds.height) / Math.max(r1.bounds.height, r2.bounds.height)
  if (heightRatio < 0.9) return 0; // Hard stop

  // --- HORIZONTAL REACH VETO ---
  // Check horizontal relationship. Paragraphs must align vertically.
  // Calculate horizontal overlap/gap
  const x1_start = r1.bounds.x;
  const x1_end = r1.bounds.x + r1.bounds.width;
  const x2_start = r2.bounds.x;
  const x2_end = r2.bounds.x + r2.bounds.width;
  
  const xOverlap = Math.max(0, Math.min(x1_end, x2_end) - Math.max(x1_start, x2_start));
  const xGap = Math.max(0, Math.max(x1_start, x2_start) - Math.min(x1_end, x2_end));
  
  const avgHeight = (r1.bounds.height + r2.bounds.height) / 2;

  // If no horizontal overlap, they are side-by-side (or diagonal).
  // We only allow merging if they are VERY close horizontally (like words in a sentence).
  // If xGap > 0.5 * Height, they are likely separate columns or distinct elements.
  if (xOverlap === 0 && xGap > avgHeight * 0.5) {
    return 0; 
  }

  // 2. Vertical Distance Check
  const verticalGap = r2.bounds.y - (r1.bounds.y + r1.bounds.height)

  // --- OVERLAP BONUS ---
  // If regions significantly overlap vertically, they are likely the same block split by OCR.
  // A negative gap means overlap.
  let overlapBonus = 0
  if (verticalGap < 0) {
    // Calculate overlap ratio relative to the smaller region height
    const overlapHeight = Math.min(r1.bounds.y + r1.bounds.height, r2.bounds.y + r2.bounds.height) - Math.max(r1.bounds.y, r2.bounds.y)
    const minHeight = Math.min(r1.bounds.height, r2.bounds.height)
    
    // If overlap is significant (> 20% of the smaller height), give a huge bonus
    if (overlapHeight > minHeight * 0.2) {
      overlapBonus = 0.4 // Strong incentive to merge
    }
  }

  // Too much overlap might be independent floating text (e.g. layers), but usually it's same block.
  // We allow overlap but rely on the bonus to push score up.
  // Gap > 0.9 line height usually means new paragraph/section (Tightened from 1.2)
  if (verticalGap > avgHeight * 0.9) return 0

  // --- SAME-LINE HORIZONTAL GAP CHECK (New) ---
  // If regions are effectively on the same line (high vertical overlap),
  // they must be very close horizontally to merge.
  // Calculate vertical overlap
  const yOverlap = Math.min(r1.bounds.y + r1.bounds.height, r2.bounds.y + r2.bounds.height) - Math.max(r1.bounds.y, r2.bounds.y)
  const minH = Math.min(r1.bounds.height, r2.bounds.height)
  
  // If they overlap vertically by > 50% of the smaller height, they are on the same "line"
  if (yOverlap > minH * 0.5) {
    // Calculate horizontal gap
    const xGap = Math.max(0, Math.max(r1.bounds.x, r2.bounds.x) - Math.min(r1.bounds.x + r1.bounds.width, r2.bounds.x + r2.bounds.width))
    
    // Strict horizontal limit: Gap > 1.5x line height means separate columns/words
    // (e.g. "Item A      Item B")
    if (xGap > avgHeight * 1.5) {
      return 0
    }
  }

  // Decay function for distance
  // If overlapping (gap < 0), use 0 as distance (perfect match)
  const effectiveGap = Math.max(0, verticalGap)
  // Steeper decay: score drops faster as gap increases
  const distanceScore = Math.max(0, 1 - Math.abs(effectiveGap - avgHeight * 0.2) / avgHeight)

  // 3. Horizontal Alignment Score
  const leftDist = Math.abs(r1.bounds.x - r2.bounds.x)
  const centerDist = Math.abs(
    r1.bounds.x + r1.bounds.width / 2 - (r2.bounds.x + r2.bounds.width / 2)
  )
  const alignDist = Math.min(leftDist, centerDist)
  const widthRef = Math.max(r1.bounds.width, r2.bounds.width)

  // Alignment is less strict than distance, but helps confirm relationship
  const alignScore = Math.max(0, 1 - alignDist / (widthRef * 0.5))

  // Weighted Combination
  // Distance is king, but alignment boosts confidence. Overlap bonus is added on top.
  // Cap result at 1.0
  return Math.min(1.0, distanceScore * 0.7 + alignScore * 0.3 + overlapBonus)
}

/**
 * Helper: Create a final merged block from a list of regions
 */
function createBlockFromRegions(regions) {
  // Re-sort lines visually (Top-down, Left-right)
  regions.sort((a, b) => {
    if (Math.abs(a.bounds.y - b.bounds.y) > 10) return a.bounds.y - b.bounds.y
    return a.bounds.x - b.bounds.x
  })

  const bounds = getGroupBounds(regions)
  const text = regions.map((r) => r.text).join('\n')
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
 * Union-Find (Disjoint Set) Data Structure for Clustering
 */
class DisjointSet {
  constructor(size) {
    this.parent = new Int32Array(size).map((_, i) => i)
  }

  find(i) {
    if (this.parent[i] === i) return i
    this.parent[i] = this.find(this.parent[i]) // Path compression
    return this.parent[i]
  }

  union(i, j) {
    const rootI = this.find(i)
    const rootJ = this.find(j)
    if (rootI !== rootJ) {
      this.parent[rootI] = rootJ
    }
  }
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
