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

      while (queue.length > 0) {
        const [cx, cy] = queue.shift()
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
