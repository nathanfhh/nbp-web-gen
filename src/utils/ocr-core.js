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
// Text Region Merging
// ============================================================================

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
 * Merge individual text lines into logical text blocks
 *
 * Groups lines based on:
 * - Vertical proximity (within 1.2x line height)
 * - Similar font size (within 25% difference)
 * - Horizontal alignment/overlap
 *
 * @param {Array} rawResults - Array of OCR results with bounds, text, confidence
 * @returns {Array} - Merged text blocks with combined bounds and inferred alignment
 */
export function mergeTextRegions(rawResults) {
  if (rawResults.length === 0) return []

  // Only merge regions with successful recognition
  const successfulResults = rawResults.filter((r) => !r.recognitionFailed)
  if (successfulResults.length === 0) return []

  const sorted = [...successfulResults].sort((a, b) => a.bounds.y - b.bounds.y)
  const groups = []

  for (const line of sorted) {
    let added = false

    for (let i = groups.length - 1; i >= 0; i--) {
      const group = groups[i]
      const lastLine = group.lines[group.lines.length - 1]

      // Check vertical proximity
      const verticalDist = line.bounds.y - (lastLine.bounds.y + lastLine.bounds.height)
      const avgHeight = (line.bounds.height + lastLine.bounds.height) / 2
      const isCloseVertically = verticalDist < avgHeight * 1.2 && verticalDist > -avgHeight * 0.5

      // Check similar font size
      const heightDiffRatio =
        Math.abs(line.bounds.height - lastLine.bounds.height) /
        Math.max(line.bounds.height, lastLine.bounds.height)
      const isSimilarSize = heightDiffRatio < 0.25

      // Check horizontal alignment
      const l1 = lastLine.bounds.x
      const r1 = lastLine.bounds.x + lastLine.bounds.width
      const l2 = line.bounds.x
      const r2 = line.bounds.x + line.bounds.width
      const overlap = Math.max(0, Math.min(r1, r2) - Math.max(l1, l2))
      const minWidth = Math.min(lastLine.bounds.width, line.bounds.width)
      const isHorizontallyAligned =
        overlap > minWidth * 0.3 || Math.abs((l1 + r1) / 2 - (l2 + r2) / 2) < minWidth * 0.5

      if (isCloseVertically && isSimilarSize && isHorizontallyAligned) {
        group.lines.push(line)
        added = true
        break
      }
    }

    if (!added) {
      groups.push({ lines: [line] })
    }
  }

  // Convert groups to merged results
  return groups.map((group) => {
    const lines = group.lines

    const minX = Math.min(...lines.map((l) => l.bounds.x))
    const minY = Math.min(...lines.map((l) => l.bounds.y))
    const maxX = Math.max(...lines.map((l) => l.bounds.x + l.bounds.width))
    const maxY = Math.max(...lines.map((l) => l.bounds.y + l.bounds.height))

    const text = lines.map((l) => l.text).join('\n')
    const confidence = lines.reduce((sum, l) => sum + l.confidence, 0) / lines.length
    const alignment = inferAlignment(lines)

    return {
      text,
      confidence,
      bounds: {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      },
      polygon: [
        [minX, minY],
        [maxX, minY],
        [maxX, maxY],
        [minX, maxY],
      ],
      alignment,
      fontSize: lines.reduce((sum, l) => sum + l.bounds.height, 0) / lines.length,
    }
  })
}

// ============================================================================
// Tesseract Fallback - Confidence Threshold
// ============================================================================

/**
 * Calculate minimum Tesseract confidence threshold
 * Combines text length and character type factors
 *
 * === Research References ===
 *
 * 1. Tesseract Confidence Values (Google Groups)
 *    https://groups.google.com/g/tesseract-ocr/c/SN8L0IA_0D4
 *    - Values < 95% are usually unusable
 *    - Values > 99% are usually correct
 *    - Recommended threshold: 97.5-98.5% for strict use cases
 *    - Note: Confidence is NOT accuracy, but neural network probability
 *
 * 2. Triage of OCR Results Using Confidence Scores (ResearchGate)
 *    https://www.researchgate.net/publication/2855972
 *    - ROC analysis: Can reject 90% of errors while only rejecting 33% correct words
 *    - For isolated digits (short text): 90% error rejection with only 13% false rejection
 *    - Short text confidence is MORE reliable but needs HIGHER threshold
 *
 * 3. TDWI - How Accurate is Your OCR Data?
 *    https://tdwi.org/articles/2018/03/05/diq-all-how-accurate-is-your-data.aspx
 *    - Page-level 99% accuracy ≠ field-level 99%
 *    - Each text region in slides = independent field, needs stricter standard
 *
 * 4. Microsoft Document Intelligence - Confidence Scores
 *    https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/concept/accuracy-confidence
 *    - Recommended threshold: 0.7-0.9 depending on use case strictness
 *
 * === Design Decisions ===
 *
 * Length Factor:
 * - Short text (≤3 chars): Higher threshold (65%) - errors are very obvious (e.g., "5%" → "S%")
 * - Medium-short (4-8 chars): Moderate-high (55%) - common in slides (years, labels)
 * - Medium (9-15 chars): Moderate (45%) - phrases with some context
 * - Long (>15 chars): Lower threshold (35%) - sentences have context for validation
 *
 * Character Type Factor:
 * - High numeric ratio (>50%): +10% - digits are easily confused (0/O, 1/l/I, 5/S, 8/B)
 * - Contains confusing chars in short text: +5% - extra caution for ambiguous cases
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
