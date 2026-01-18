/**
 * Text Measurement Utility using Canvas API
 *
 * Provides accurate text width measurement for PPTX generation.
 * Uses Canvas 2D context to measure actual rendered text width,
 * which is more accurate than heuristic character weight estimation.
 */

// Reusable canvas context for performance
let measureCanvas = null
let measureCtx = null

/**
 * Get or create the measurement canvas context
 * @returns {CanvasRenderingContext2D}
 */
function getMeasureContext() {
  if (!measureCtx) {
    measureCanvas = document.createElement('canvas')
    measureCtx = measureCanvas.getContext('2d')
  }
  return measureCtx
}

/**
 * Default font stack that works across platforms and matches PPTX
 * Arial is available on Windows, Mac, and in PowerPoint
 */
export const PPTX_FONT_STACK = 'Arial, "Microsoft YaHei", "PingFang SC", sans-serif'

/**
 * Expansion factor to account for rendering differences between
 * Canvas (browser) and PowerPoint. PowerPoint typically renders text
 * wider due to different font hinting, kerning, and letter-spacing.
 *
 * This factor INCREASES the measured text width to be more conservative.
 * Example: Canvas measures 100px → we treat it as 100 * 1.15 = 115px
 *
 * If text is still wrapping in PPTX, increase this value (e.g., 1.20)
 * If text boxes have too much empty space, decrease this value (e.g., 1.10)
 */
export const TEXT_WIDTH_EXPANSION = 1.05

/**
 * DPI constants for unit conversion
 * - Screen: 96 DPI (CSS pixels)
 * - Print/PPTX: 72 points per inch
 */
const SCREEN_DPI = 96
const POINTS_PER_INCH = 72

/**
 * Convert points to CSS pixels
 * @param {number} pt - Font size in points
 * @returns {number} Font size in CSS pixels
 */
function ptToPx(pt) {
  return pt * (SCREEN_DPI / POINTS_PER_INCH)
}

/**
 * Measure the width of text using Canvas API
 * @param {string} text - Text to measure
 * @param {string} fontFamily - Font family (e.g., 'Arial')
 * @param {number} fontSizePt - Font size in points
 * @returns {number} Text width in CSS pixels
 */
export function measureTextWidth(text, fontFamily, fontSizePt) {
  const ctx = getMeasureContext()
  const fontSizePx = ptToPx(fontSizePt)
  ctx.font = `${fontSizePx}px ${fontFamily}`
  return ctx.measureText(text).width
}

/**
 * Calculate the optimal font size for text to fit within a given width
 * Uses binary search for efficiency (O(log n) iterations)
 *
 * @param {string} text - Text to fit (including spaces - do NOT trim before calling)
 * @param {number} boxWidthInches - Available width in inches
 * @param {string} fontFamily - Font family to use
 * @param {Object} options - Additional options
 * @param {number} options.minSize - Minimum font size in points (default: 8)
 * @param {number} options.maxSize - Maximum font size in points (default: 120)
 * @param {number} options.expansionFactor - Text width expansion multiplier (default: TEXT_WIDTH_EXPANSION)
 * @returns {number} Optimal font size in points
 */
export function calculateOptimalFontSize(
  text,
  boxWidthInches,
  fontFamily = PPTX_FONT_STACK,
  options = {}
) {
  const { minSize = 8, maxSize = 120, expansionFactor = TEXT_WIDTH_EXPANSION } = options

  // Convert box width to pixels (this is our target)
  const boxWidthPx = boxWidthInches * SCREEN_DPI

  // Handle empty or whitespace-only text
  if (!text || text.length === 0) {
    return minSize
  }

  // Binary search for optimal font size
  let low = minSize
  let high = maxSize
  const precision = 0.5 // Stop when range is less than 0.5pt

  while (high - low > precision) {
    const mid = (low + high) / 2
    // Measure text and apply expansion factor to account for PPTX rendering wider
    const textWidth = measureTextWidth(text, fontFamily, mid) * expansionFactor

    if (textWidth <= boxWidthPx) {
      low = mid // Text fits, try larger
    } else {
      high = mid // Text too wide, try smaller
    }
  }

  // Return the largest size that fits (rounded down for safety)
  return Math.floor(low)
}

/**
 * Calculate optimal font size for multi-line text
 * Returns the font size that fits the widest line
 *
 * IMPORTANT: This function preserves spaces within lines for accurate measurement.
 * Spaces contribute to text width and must be included.
 *
 * @param {string} text - Multi-line text (lines separated by \n)
 * @param {number} boxWidthInches - Available width in inches
 * @param {string} fontFamily - Font family to use
 * @param {Object} options - Additional options (see calculateOptimalFontSize)
 * @returns {number} Optimal font size in points that fits all lines
 */
export function calculateFontSizeForMultilineText(
  text,
  boxWidthInches,
  fontFamily = PPTX_FONT_STACK,
  options = {}
) {
  const { minSize = 8, maxSize = 120 } = options

  const lines = text.split('\n')
  let smallestFittingSize = maxSize

  for (const line of lines) {
    // Only skip completely empty lines, preserve spaces within content
    if (line.length === 0) continue

    // Use the line AS-IS including all spaces
    const lineSize = calculateOptimalFontSize(line, boxWidthInches, fontFamily, options)
    smallestFittingSize = Math.min(smallestFittingSize, lineSize)
  }

  // Ensure we don't go below minimum
  return Math.max(minSize, smallestFittingSize)
}

/**
 * Measure text and return detailed metrics
 * Useful for debugging and fine-tuning
 *
 * @param {string} text - Text to measure
 * @param {string} fontFamily - Font family
 * @param {number} fontSizePt - Font size in points
 * @returns {Object} Text metrics including width, height estimates
 */
export function getTextMetrics(text, fontFamily, fontSizePt) {
  const ctx = getMeasureContext()
  const fontSizePx = ptToPx(fontSizePt)
  ctx.font = `${fontSizePx}px ${fontFamily}`

  const metrics = ctx.measureText(text)

  return {
    width: metrics.width,
    widthInches: metrics.width / SCREEN_DPI,
    // Modern browsers support these additional metrics
    actualBoundingBoxAscent: metrics.actualBoundingBoxAscent || fontSizePx * 0.8,
    actualBoundingBoxDescent: metrics.actualBoundingBoxDescent || fontSizePx * 0.2,
    fontSizePt,
    fontSizePx,
    fontFamily,
  }
}
