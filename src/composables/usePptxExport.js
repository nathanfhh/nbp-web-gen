/**
 * PPTX Export Composable
 * Uses PptxGenJS to generate PowerPoint files from images and text
 */

import { ref } from 'vue'
import PptxGenJS from 'pptxgenjs'
import { OCR_DEFAULTS } from '@/constants/ocrDefaults'
import { getSettings as getOcrSettings } from '@/composables/useOcrSettings'

/**
 * @typedef {Object} SlideData
 * @property {string} backgroundImage - Background image data URL
 * @property {Array<{text: string, bounds: {x: number, y: number, width: number, height: number}}>} textRegions - OCR text regions
 * @property {number} width - Original image width
 * @property {number} height - Original image height
 */

/**
 * @typedef {Object} PptxOptions
 * @property {'16:9'|'4:3'|'9:16'|'auto'} ratio - Slide aspect ratio
 * @property {string} title - Presentation title
 * @property {string} author - Presentation author
 * @property {string} company - Presentation company
 */

/**
 * @returns {Object} PPTX export composable
 */
export function usePptxExport() {
  const isExporting = ref(false)
  const progress = ref(0)
  const status = ref('')

  /**
   * Detect aspect ratio from image dimensions
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @returns {'LAYOUT_16x9'|'LAYOUT_4x3'|'LAYOUT_WIDE'} PptxGenJS layout
   */
  const detectRatio = (width, height) => {
    const ratio = width / height

    // Common presentation ratios
    if (ratio >= 1.7 && ratio <= 1.8) {
      // 16:9 (1.777...)
      return 'LAYOUT_16x9'
    } else if (ratio >= 1.3 && ratio <= 1.4) {
      // 4:3 (1.333...)
      return 'LAYOUT_4x3'
    } else if (ratio >= 0.5 && ratio <= 0.6) {
      // 9:16 portrait (0.5625)
      return { width: 5.625, height: 10 } // Custom portrait size
    } else {
      // Default to widescreen
      return 'LAYOUT_WIDE'
    }
  }

  /**
   * Convert ratio option to PptxGenJS layout
   * @param {string} ratio - Ratio option ('16:9', '4:3', '9:16', 'auto')
   * @param {number} imageWidth - Image width (for auto detection)
   * @param {number} imageHeight - Image height (for auto detection)
   * @returns {string|Object} PptxGenJS layout
   */
  const ratioToLayout = (ratio, imageWidth, imageHeight) => {
    switch (ratio) {
      case '16:9':
        return 'LAYOUT_16x9'
      case '4:3':
        return 'LAYOUT_4x3'
      case '9:16':
        return { width: 5.625, height: 10 }
      case 'auto':
      default:
        return detectRatio(imageWidth, imageHeight)
    }
  }

  /**
   * Convert pixel coordinates to inches (for PptxGenJS)
   * @param {number} px - Pixel value
   * @param {number} imagePx - Total image pixels in that dimension
   * @param {number} slideInches - Total slide inches in that dimension
   * @returns {number} Inches
   */
  const pxToInches = (px, imagePx, slideInches) => {
    return (px / imagePx) * slideInches
  }

  /**
   * Get slide dimensions in inches
   * @param {string|Object} layout - PptxGenJS layout
   * @returns {{width: number, height: number}} Dimensions in inches
   */
  const getSlideSize = (layout) => {
    if (typeof layout === 'object') {
      return layout
    }

    switch (layout) {
      case 'LAYOUT_16x9':
        return { width: 10, height: 5.625 }
      case 'LAYOUT_4x3':
        return { width: 10, height: 7.5 }
      case 'LAYOUT_WIDE':
        return { width: 13.333, height: 7.5 }
      default:
        return { width: 10, height: 5.625 }
    }
  }

  /**
   * Calculate letterbox/pillarbox positioning for image
   * Maintains aspect ratio and centers the image within the slide
   * @param {number} imageWidth - Original image width
   * @param {number} imageHeight - Original image height
   * @param {number} slideWidth - Slide width in inches
   * @param {number} slideHeight - Slide height in inches
   * @returns {{x: number, y: number, w: number, h: number}} Position and size in inches
   */
  const calculateFitPosition = (imageWidth, imageHeight, slideWidth, slideHeight) => {
    const imageRatio = imageWidth / imageHeight
    const slideRatio = slideWidth / slideHeight

    let w, h, x, y

    if (Math.abs(imageRatio - slideRatio) < 0.01) {
      // Ratios match (within 1% tolerance) - fill entire slide
      return { x: 0, y: 0, w: slideWidth, h: slideHeight }
    }

    if (imageRatio > slideRatio) {
      // Image is wider than slide - letterbox (black bars top/bottom)
      w = slideWidth
      h = slideWidth / imageRatio
      x = 0
      y = (slideHeight - h) / 2
    } else {
      // Image is taller than slide - pillarbox (black bars left/right)
      h = slideHeight
      w = slideHeight * imageRatio
      x = (slideWidth - w) / 2
      y = 0
    }

    return { x, y, w, h }
  }

  // ============================================================================
  // Polygon (Trapezoid) Geometry Helpers
  // ============================================================================
  // polygon order: [nw, ne, se, sw]
  //   top    edge = nw → ne  (indices 0 → 1)
  //   right  edge = ne → se  (indices 1 → 2)
  //   bottom edge = sw → se  (indices 3 → 2)
  //   left   edge = nw → sw  (indices 0 → 3)
  //
  // All helpers return null for non-polygon-mode regions so callers can
  // fall back to the rectangle-based path.
  // ============================================================================

  const _isPolygon = (region) =>
    region.isPolygonMode && region.polygon && region.polygon.length === 4

  /** Average of left + right edge lengths (perpendicular to text direction). */
  const getPolygonEffectiveHeight = (region) => {
    if (!_isPolygon(region)) return null
    const [nw, ne, se, sw] = region.polygon
    const leftH = Math.hypot(sw[0] - nw[0], sw[1] - nw[1])
    const rightH = Math.hypot(se[0] - ne[0], se[1] - ne[1])
    return (leftH + rightH) / 2
  }

  /** Average of top + bottom edge lengths (along text direction). */
  const getPolygonEffectiveWidth = (region) => {
    if (!_isPolygon(region)) return null
    const [nw, ne, se, sw] = region.polygon
    const topW = Math.hypot(ne[0] - nw[0], ne[1] - nw[1])
    const bottomW = Math.hypot(se[0] - sw[0], se[1] - sw[1])
    return (topW + bottomW) / 2
  }

  /** Centroid (average of 4 vertices) in pixel coordinates. */
  const getPolygonCentroid = (region) => {
    if (!_isPolygon(region)) return null
    const [nw, ne, se, sw] = region.polygon
    return {
      x: (nw[0] + ne[0] + se[0] + sw[0]) / 4,
      y: (nw[1] + ne[1] + se[1] + sw[1]) / 4,
    }
  }

  /**
   * Rotation angle in degrees, derived from the average of
   * top-edge and bottom-edge angles relative to the horizontal.
   */
  const getPolygonRotation = (region) => {
    if (!_isPolygon(region)) return null
    const [nw, ne, se, sw] = region.polygon
    const topAngle = Math.atan2(ne[1] - nw[1], ne[0] - nw[0])
    const bottomAngle = Math.atan2(se[1] - sw[1], se[0] - sw[0])
    return ((topAngle + bottomAngle) / 2) * (180 / Math.PI)
  }

  // ============================================================================
  // Line-level Geometry Helpers (for individual OCR lines within a region)
  // ============================================================================

  /** Check if a line has valid polygon data */
  const _lineHasPolygon = (line) =>
    line && line.polygon && line.polygon.length === 4

  /** Get centroid of a line (from polygon or bounds) */
  const getLineCentroid = (line) => {
    if (_lineHasPolygon(line)) {
      const [nw, ne, se, sw] = line.polygon
      return {
        x: (nw[0] + ne[0] + se[0] + sw[0]) / 4,
        y: (nw[1] + ne[1] + se[1] + sw[1]) / 4,
      }
    }
    // Fallback to bounds center
    return {
      x: line.bounds.x + line.bounds.width / 2,
      y: line.bounds.y + line.bounds.height / 2,
    }
  }

  /** Get effective height of a line (edge-based for polygon, bounds-based otherwise) */
  const getLineEffectiveHeight = (line) => {
    if (_lineHasPolygon(line)) {
      const [nw, ne, se, sw] = line.polygon
      const leftH = Math.hypot(sw[0] - nw[0], sw[1] - nw[1])
      const rightH = Math.hypot(se[0] - ne[0], se[1] - ne[1])
      return (leftH + rightH) / 2
    }
    return line.bounds.height
  }

  /**
   * Determine if two lines are on the "same visual line" considering rotation.
   * For rotated text, we project line centroids onto the axis perpendicular to
   * the text flow direction and compare the projected distances.
   *
   * @param {Object} prevLine - Previous line
   * @param {Object} currLine - Current line
   * @param {Object} region - Parent region (to get rotation angle)
   * @returns {boolean} True if lines should be joined with space, false for newline
   */
  const areLinesOnSameLine = (prevLine, currLine, region) => {
    const threshold = Math.min(
      getLineEffectiveHeight(prevLine),
      getLineEffectiveHeight(currLine)
    ) * 0.7

    // For polygon-mode regions with rotated text
    if (_isPolygon(region)) {
      const rotationDeg = getPolygonRotation(region)
      if (rotationDeg != null && Math.abs(rotationDeg) > 0.5) {
        // Use rotated coordinate system
        // Perpendicular axis = rotation + 90°
        const perpAngleRad = (rotationDeg + 90) * (Math.PI / 180)

        const prevCentroid = getLineCentroid(prevLine)
        const currCentroid = getLineCentroid(currLine)

        // Project centroids onto perpendicular axis
        // This gives us the "vertical" distance in the rotated text coordinate system
        const prevProj = prevCentroid.x * Math.cos(perpAngleRad) + prevCentroid.y * Math.sin(perpAngleRad)
        const currProj = currCentroid.x * Math.cos(perpAngleRad) + currCentroid.y * Math.sin(perpAngleRad)

        return Math.abs(prevProj - currProj) < threshold
      }
    }

    // Default: use screen Y-coordinate comparison
    const prevCenterY = prevLine.bounds.y + prevLine.bounds.height / 2
    const currCenterY = currLine.bounds.y + currLine.bounds.height / 2
    return Math.abs(prevCenterY - currCenterY) < threshold
  }

  /**
   * Generate a PPTX file from slide data
   * @param {SlideData[]} slides - Array of slide data
   * @param {PptxOptions} options - PPTX options
   * @returns {Promise<Blob>} PPTX file blob
   */
  const generatePptx = async (slides, options = {}) => {
    if (slides.length === 0) {
      throw new Error('No slides provided')
    }

    isExporting.value = true
    progress.value = 0
    status.value = 'Initializing PPTX...'

    try {
      // Create presentation
      const pptx = new PptxGenJS()

      // Set metadata
      pptx.title = options.title || 'Presentation'
      pptx.author = options.author || 'Mediator'
      pptx.company = options.company || 'Mediator'
      pptx.subject = 'Generated from slide images'

      // Determine layout from first slide
      const firstSlide = slides[0]
      const layout = ratioToLayout(
        options.ratio || 'auto',
        firstSlide.width,
        firstSlide.height
      )

      // Set presentation layout
      if (typeof layout === 'object') {
        pptx.defineLayout({ name: 'CUSTOM', width: layout.width, height: layout.height })
        pptx.layout = 'CUSTOM'
      } else {
        pptx.layout = layout
      }

      const slideSize = getSlideSize(layout)

      // Process each slide
      for (let i = 0; i < slides.length; i++) {
        status.value = `Processing slide ${i + 1}/${slides.length}...`
        progress.value = Math.round(((i + 1) / slides.length) * 90)

        const slideData = slides[i]
        const slide = pptx.addSlide()

        // Calculate image position for letterbox/pillarbox positioning
        const imgPos = calculateFitPosition(
          slideData.width,
          slideData.height,
          slideSize.width,
          slideSize.height
        )

        // Add background image (text removed)
        // Use letterbox/pillarbox positioning to maintain aspect ratio
        if (slideData.backgroundImage) {
          slide.addImage({
            data: slideData.backgroundImage,
            x: imgPos.x,
            y: imgPos.y,
            w: imgPos.w,
            h: imgPos.h,
          })
        }

        // Add text boxes for each OCR region
        if (slideData.textRegions && slideData.textRegions.length > 0) {
          for (const region of slideData.textRegions) {
            if (!region.text || !region.text.trim()) continue

            // Convert pixel coordinates to inches
            // Map to image position (not full slide) to match letterbox/pillarbox positioning
            //
            // For polygon-mode (trapezoid) regions the text box uses:
            //   - effective width / height  (average edge lengths, not bounding box)
            //   - centroid-based positioning (center of the 4 vertices)
            //   - rotation angle            (average of top/bottom edge angles)
            const effectiveHeightPx = getPolygonEffectiveHeight(region) ?? region.bounds.height
            const effectiveWidthPx = getPolygonEffectiveWidth(region) ?? region.bounds.width
            const centroid = getPolygonCentroid(region)
            const rotateDeg = getPolygonRotation(region)

            let x, y, w, h
            if (centroid) {
              // Trapezoid: position from centroid, use effective dimensions
              w = pxToInches(effectiveWidthPx, slideData.width, imgPos.w)
              h = pxToInches(effectiveHeightPx, slideData.height, imgPos.h)
              const cx = imgPos.x + pxToInches(centroid.x, slideData.width, imgPos.w)
              const cy = imgPos.y + pxToInches(centroid.y, slideData.height, imgPos.h)
              x = cx - w / 2
              y = cy - h / 2
            } else {
              // Rectangle: original bounds-based positioning
              x = imgPos.x + pxToInches(region.bounds.x, slideData.width, imgPos.w)
              y = imgPos.y + pxToInches(region.bounds.y, slideData.height, imgPos.h)
              w = pxToInches(region.bounds.width, slideData.width, imgPos.w)
              h = pxToInches(effectiveHeightPx, slideData.height, imgPos.h)
            }

            // Calculate Font Size
            // Strategy: Use height-based calculation with median of original line heights
            // This is more reliable than width-based Canvas measurement
            // Get settings from OCR Settings (Single Source of Truth)
            const ocrSettings = getOcrSettings()
            const lineHeightRatio = ocrSettings.lineHeightRatio ?? OCR_DEFAULTS.lineHeightRatio
            const minFontSize = ocrSettings.minFontSize ?? OCR_DEFAULTS.minFontSize
            const maxFontSize = ocrSettings.maxFontSize ?? OCR_DEFAULTS.maxFontSize

            let fontSize
            const debugLines = [] // Debug info

            if (region.lines && region.lines.length > 0) {
              // Get heights of all original lines
              // For polygon-mode regions, use line polygon edge heights instead of
              // axis-aligned bounds.height (which is inflated for slanted text)
              const usePolygonHeight = _isPolygon(region)
              const lineHeights = region.lines
                .filter((line) => line.text && line.text.trim())
                .map((line) => {
                  let heightPx
                  if (usePolygonHeight && line.polygon && line.polygon.length === 4) {
                    const [lnw, lne, lse, lsw] = line.polygon
                    const leftH = Math.hypot(lsw[0] - lnw[0], lsw[1] - lnw[1])
                    const rightH = Math.hypot(lse[0] - lne[0], lse[1] - lne[1])
                    heightPx = (leftH + rightH) / 2
                  } else {
                    heightPx = line.bounds.height
                  }
                  debugLines.push({
                    text: line.text.substring(0, 30) + (line.text.length > 30 ? '...' : ''),
                    heightPx: Math.round(heightPx),
                    color: line.textColor || '(none)',
                  })
                  return heightPx
                })

              if (lineHeights.length > 0) {
                // Use max height (largest line best represents actual text size)
                const maxHeight = Math.max(...lineHeights)

                // Convert max height to font size in points
                // Use imgPos.h (actual image height on slide) for correct scaling
                fontSize =
                  ((maxHeight / slideData.height) * imgPos.h * 72) / lineHeightRatio
              } else {
                // Fallback if no valid lines
                fontSize = (h * 72) / lineHeightRatio
              }
            } else {
              // Single line or no lines data: use effective height
              const heightPx = region.fontSize || effectiveHeightPx
              fontSize = ((heightPx / slideData.height) * imgPos.h * 72) / lineHeightRatio
              debugLines.push({
                text: region.text.substring(0, 30) + (region.text.length > 30 ? '...' : ''),
                heightPx: Math.round(heightPx),
                color: '(single)',
              })
            }

            // Clamp font size to configurable range
            fontSize = Math.max(minFontSize, Math.min(maxFontSize, Math.round(fontSize)))

            // Debug output
            console.group(`📝 Font Size Calculation (Height-based)`)
            console.log(`Final fontSize: ${fontSize}pt`)
            console.table(debugLines)
            console.groupEnd()

            // Determine text content and colors
            // If region has lines with different colors, use array format for per-line colors
            const validLines = region.lines?.filter((line) => line.text && line.text.trim()) || []
            const colors = validLines.map((line) => line.textColor).filter(Boolean)
            const uniqueColors = [...new Set(colors)]
            const hasMultipleColors = uniqueColors.length > 1

            // Default color fallback (black)
            const defaultColor = colors[0] || '000000'

            // Common text box options
            const textBoxOptions = {
              x,
              y,
              w,
              h,
              fontSize,
              fontFace: 'Arial', // Primary font (matches PPTX_FONT_STACK)
              align: region.alignment || 'left', // Use inferred alignment
              valign: 'top', // Align text to top of box (important for multi-line)
              wrap: false, // Let text overflow instead of wrapping (unless \n exists)
              // Make text box transparent so background shows through
              fill: { type: 'none' },
              line: { type: 'none' },
              // Rotation for trapezoid regions (degrees, clockwise)
              ...(rotateDeg != null && Math.abs(rotateDeg) > 0.1 ? { rotate: rotateDeg } : {}),
            }

            if (hasMultipleColors && validLines.length > 0) {
              // Multiple colors: use array format for per-line coloring
              // Group consecutive lines by color and join with appropriate separators
              const textParts = []

              for (let lineIdx = 0; lineIdx < validLines.length; lineIdx++) {
                const line = validLines[lineIdx]
                const lineColor = line.textColor || defaultColor

                // Determine separator: space for same visual line, newline for different lines
                // For rotated regions, uses projection onto perpendicular axis
                let separator = ''
                if (lineIdx > 0) {
                  const prev = validLines[lineIdx - 1]
                  const isSameLine = areLinesOnSameLine(prev, line, region)
                  separator = isSameLine ? ' ' : '\n'
                }

                // Add separator as separate part if needed (inherits previous color)
                if (separator && textParts.length > 0) {
                  textParts.push({
                    text: separator,
                    options: { color: textParts[textParts.length - 1].options.color },
                  })
                }

                // Add the text with its color
                textParts.push({
                  text: line.text,
                  options: { color: lineColor },
                })
              }

              slide.addText(textParts, textBoxOptions)
            } else {
              // Single color: use simple format
              slide.addText(region.text, {
                ...textBoxOptions,
                color: defaultColor,
              })
            }
          }
        }
      }

      // Generate blob
      status.value = 'Generating PPTX file...'
      progress.value = 95

      const blob = await pptx.write({ outputType: 'blob' })

      status.value = 'PPTX generation complete'
      progress.value = 100

      return blob
    } catch (error) {
      status.value = `Error: ${error.message}`
      throw error
    } finally {
      isExporting.value = false
    }
  }

  /**
   * Generate and download a PPTX file
   * @param {SlideData[]} slides - Array of slide data
   * @param {PptxOptions} options - PPTX options
   * @param {string} filename - Download filename
   */
  const downloadPptx = async (slides, options = {}, filename = 'presentation.pptx') => {
    const blob = await generatePptx(slides, options)

    // Create download link
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  /**
   * Create slide data from an image and OCR results
   * @param {string} imageDataUrl - Image data URL (background with text removed)
   * @param {Array<{text: string, bounds: Object}>} ocrResults - OCR results
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @returns {SlideData} Slide data
   */
  const createSlideData = (imageDataUrl, ocrResults, width, height) => {
    return {
      backgroundImage: imageDataUrl,
      textRegions: ocrResults,
      width,
      height,
    }
  }

  return {
    isExporting,
    progress,
    status,
    generatePptx,
    downloadPptx,
    createSlideData,
    detectRatio,
  }
}
