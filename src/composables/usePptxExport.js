/**
 * PPTX Export Composable
 * Uses PptxGenJS to generate PowerPoint files from images and text
 */

import { ref } from 'vue'
import PptxGenJS from 'pptxgenjs'

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
      pptx.author = options.author || 'Nano Banana Pro'
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

            // Calculate Font Size (Refined Algorithm)
            let fontSize = 12
            
            // 1. Width-Based Estimation (User Request):
            // Estimate based on the width of the longest line and its character count
            let widthBasedSize = 0
            const lines = region.text.split('\n')
            let maxLineWeight = 0
            
            for (const line of lines) {
              let weight = 0
              for (const char of line) {
                // Heuristic weights for Arial-like fonts
                if (/[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/.test(char)) weight += 1.0 // CJK (Wide)
                else if (/[A-Z]/.test(char)) weight += 0.7 // Uppercase
                else if (/[a-z0-9]/.test(char)) weight += 0.55 // Lowercase & Numbers
                else weight += 0.3 // Punctuation/Space
              }
              maxLineWeight = Math.max(maxLineWeight, weight)
            }

            if (maxLineWeight > 0) {
              // Font Size (pt) ≈ (Width (inch) / WeightedCharCount) * 72 (points per inch)
              widthBasedSize = (w / maxLineWeight) * 72
            }

            // 2. Height-Based Estimation (OCR Metadata):
            let heightBasedSize = 0
            if (region.fontSize) {
               // Convert pixel height to points
               heightBasedSize = (region.fontSize / slideData.width) * slideSize.width * 72
            }

            // 3. Selection Logic
            if (widthBasedSize > 0) {
               // Use width-based size to ensure text fits horizontally
               fontSize = widthBasedSize
               
               // Sanity check: if width-based is significantly larger than height-based (e.g. > 1.5x),
               // it might mean the text box is very wide but text is short. 
               // In that case, cap it closer to height-based to avoid huge text.
               if (heightBasedSize > 0 && widthBasedSize > heightBasedSize * 1.5) {
                 fontSize = heightBasedSize * 1.2
               }
            } else if (heightBasedSize > 0) {
               fontSize = heightBasedSize
            } else {
               // Fallback: Estimate from box height (assuming single line)
               fontSize = h * 72 / 1.2
            }

            // Clamp font size
            fontSize = Math.max(8, Math.min(120, Math.round(fontSize)))

            slide.addText(region.text, {
              x,
              y,
              w,
              h,
              fontSize,
              fontFace: 'Arial',
              color: '000000',
              align: region.alignment || 'left', // Use inferred alignment
              valign: 'top', // Align text to top of box (important for multi-line)
              wrap: true,
              // Make text box transparent so background shows through
              fill: { type: 'none' },
              line: { type: 'none' },
            })
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
