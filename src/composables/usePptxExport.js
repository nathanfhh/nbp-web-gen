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

        // Add background image (text removed)
        if (slideData.backgroundImage) {
          slide.addImage({
            data: slideData.backgroundImage,
            x: 0,
            y: 0,
            w: '100%',
            h: '100%',
          })
        }

        // Add text boxes for each OCR region
        if (slideData.textRegions && slideData.textRegions.length > 0) {
          for (const region of slideData.textRegions) {
            if (!region.text || !region.text.trim()) continue

            // Convert pixel coordinates to inches
            const x = pxToInches(region.bounds.x, slideData.width, slideSize.width)
            const y = pxToInches(region.bounds.y, slideData.height, slideSize.height)
            const w = pxToInches(region.bounds.width, slideData.width, slideSize.width)
            const h = pxToInches(region.bounds.height, slideData.height, slideSize.height)

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
              const lineHeights = region.lines
                .filter((line) => line.text && line.text.trim())
                .map((line) => {
                  debugLines.push({
                    text: line.text.substring(0, 30) + (line.text.length > 30 ? '...' : ''),
                    heightPx: Math.round(line.bounds.height),
                    color: line.textColor || '(none)',
                  })
                  return line.bounds.height
                })

              if (lineHeights.length > 0) {
                // Use max height (largest line best represents actual text size)
                const maxHeight = Math.max(...lineHeights)

                // Convert max height to font size in points
                fontSize =
                  ((maxHeight / slideData.height) * slideSize.height * 72) / lineHeightRatio
              } else {
                // Fallback if no valid lines
                fontSize = (h * 72) / lineHeightRatio
              }
            } else {
              // Single line or no lines data: use region height directly
              const heightPx = region.fontSize || region.bounds.height
              fontSize = ((heightPx / slideData.height) * slideSize.height * 72) / lineHeightRatio
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
            }

            if (hasMultipleColors && validLines.length > 0) {
              // Multiple colors: use array format for per-line coloring
              // Group consecutive lines by color and join with appropriate separators
              const textParts = []

              for (let lineIdx = 0; lineIdx < validLines.length; lineIdx++) {
                const line = validLines[lineIdx]
                const lineColor = line.textColor || defaultColor

                // Determine separator: space for same visual line, newline for different lines
                let separator = ''
                if (lineIdx > 0) {
                  const prev = validLines[lineIdx - 1]
                  const prevCenterY = prev.bounds.y + prev.bounds.height / 2
                  const currCenterY = line.bounds.y + line.bounds.height / 2
                  const threshold = Math.min(prev.bounds.height, line.bounds.height) * 0.7
                  const isSameLine = Math.abs(prevCenterY - currCenterY) < threshold
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
