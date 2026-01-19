/**
 * Inpainting Worker
 * Uses OpenCV.js to remove text from images using inpainting algorithms
 */

/* global cv, importScripts */

// OpenCV.js CDN URL (official OpenCV distribution)
// Note: Using external CDN without SRI. For production, consider:
// 1. Self-hosting opencv.js (~8MB) for supply chain security
// 2. Adding SRI hash verification if available
const OPENCV_CDN_URL = 'https://docs.opencv.org/4.13.0/opencv.js'

let cvReady = false
let cvLoading = false

/**
 * Load OpenCV.js from CDN
 */
async function loadOpenCV() {
  if (cvReady) return
  if (cvLoading) {
    // Wait for existing load to complete
    while (!cvReady) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    return
  }

  cvLoading = true
  self.postMessage({ type: 'status', message: 'Loading OpenCV.js...' })

  try {
    // Import OpenCV.js
    importScripts(OPENCV_CDN_URL)

    // Wait for OpenCV to be ready
    if (typeof cv === 'undefined') {
      throw new Error('OpenCV.js failed to load')
    }

    // OpenCV.js uses a module pattern, wait for it to be ready
    if (cv.getBuildInformation) {
      cvReady = true
    } else {
      // Wait for cv.onRuntimeInitialized
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('OpenCV.js initialization timeout'))
        }, 30000)

        if (cv.onRuntimeInitialized) {
          cv.onRuntimeInitialized = () => {
            clearTimeout(timeout)
            cvReady = true
            resolve()
          }
        } else {
          // Check periodically if cv is ready
          const checkInterval = setInterval(() => {
            if (cv.getBuildInformation) {
              clearInterval(checkInterval)
              clearTimeout(timeout)
              cvReady = true
              resolve()
            }
          }, 100)
        }
      })
    }

    self.postMessage({ type: 'status', message: 'OpenCV.js ready' })
  } catch (error) {
    cvLoading = false
    throw error
  }
}

/**
 * Perform inpainting on an image
 * @param {ImageData} imageData - Source image data
 * @param {ImageData} maskData - Mask image data (white = areas to inpaint)
 * @param {Object} options - Inpainting options
 * @returns {ImageData} Inpainted image data
 */
function inpaint(imageData, maskData, options = {}) {
  const { algorithm = 'TELEA', radius = 1 } = options

  // Convert ImageData to cv.Mat
  const src = cv.matFromImageData(imageData)
  const mask = cv.matFromImageData(maskData)

  // Convert mask to grayscale if needed
  let grayMask = new cv.Mat()
  if (mask.channels() === 4) {
    cv.cvtColor(mask, grayMask, cv.COLOR_RGBA2GRAY)
  } else if (mask.channels() === 3) {
    cv.cvtColor(mask, grayMask, cv.COLOR_RGB2GRAY)
  } else {
    grayMask = mask.clone()
  }

  // Threshold mask to ensure it's binary (0 or 255)
  cv.threshold(grayMask, grayMask, 127, 255, cv.THRESH_BINARY)

  // Convert source to BGR for inpainting
  const srcBgr = new cv.Mat()
  cv.cvtColor(src, srcBgr, cv.COLOR_RGBA2BGR)

  // Perform inpainting
  const dst = new cv.Mat()
  const inpaintFlag = algorithm === 'NS' ? cv.INPAINT_NS : cv.INPAINT_TELEA
  cv.inpaint(srcBgr, grayMask, dst, radius, inpaintFlag)

  // Convert back to RGBA
  const dstRgba = new cv.Mat()
  cv.cvtColor(dst, dstRgba, cv.COLOR_BGR2RGBA)

  // Get result as ImageData
  const resultData = new ImageData(
    new Uint8ClampedArray(dstRgba.data),
    imageData.width,
    imageData.height
  )

  // Clean up
  src.delete()
  mask.delete()
  grayMask.delete()
  srcBgr.delete()
  dst.delete()
  dstRgba.delete()

  return resultData
}

/**
 * Extract text color from a bounding box region using edge sampling + luminance inversion
 *
 * Algorithm:
 * 1. Sample edge pixels (outer 2px border) to determine background color/luminance
 * 2. Use K-Means (K=2) to cluster all pixels into background and foreground
 * 3. Select the cluster that contrasts with the edge (background) as text color
 * 4. Fallback to black/white based on background luminance if contrast is insufficient
 *
 * @param {ImageData} imageData - Source image data
 * @param {Object} bounds - Bounding box { x, y, width, height }
 * @param {number} edgeWidth - Edge sampling width (default: 2)
 * @returns {string} Hex color string (e.g., "1A1A1A")
 */
function extractTextColor(imageData, bounds, edgeWidth = 2) {
  const { width: imgWidth, data } = imageData
  const { x, y, width, height } = bounds

  // Clamp bounds to image dimensions
  const x0 = Math.max(0, Math.floor(x))
  const y0 = Math.max(0, Math.floor(y))
  const x1 = Math.min(imageData.width, Math.ceil(x + width))
  const y1 = Math.min(imageData.height, Math.ceil(y + height))

  const boxW = x1 - x0
  const boxH = y1 - y0

  if (boxW <= 0 || boxH <= 0) {
    return '000000' // Fallback to black
  }

  // === 1. Sample edge pixels to determine background ===
  const edgePixels = []
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      // Check if pixel is on the edge (within edgeWidth of border)
      const isEdge =
        px < x0 + edgeWidth ||
        px >= x1 - edgeWidth ||
        py < y0 + edgeWidth ||
        py >= y1 - edgeWidth

      if (isEdge) {
        const idx = (py * imgWidth + px) * 4
        edgePixels.push([data[idx], data[idx + 1], data[idx + 2]])
      }
    }
  }

  // Calculate edge (background) average color and luminance
  let edgeR = 0, edgeG = 0, edgeB = 0
  for (const [r, g, b] of edgePixels) {
    edgeR += r
    edgeG += g
    edgeB += b
  }
  const edgeCount = edgePixels.length || 1
  edgeR = Math.round(edgeR / edgeCount)
  edgeG = Math.round(edgeG / edgeCount)
  edgeB = Math.round(edgeB / edgeCount)
  const edgeLuminance = 0.299 * edgeR + 0.587 * edgeG + 0.114 * edgeB

  // === 2. Collect all pixels in the bounding box ===
  const allPixels = []
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const idx = (py * imgWidth + px) * 4
      allPixels.push([data[idx], data[idx + 1], data[idx + 2]])
    }
  }

  if (allPixels.length === 0) {
    return edgeLuminance > 128 ? '000000' : 'FFFFFF'
  }

  // === 3. K-Means clustering (K=2) ===
  const clusters = kMeans(allPixels, 2, 10)

  // === 4. Select the cluster that contrasts with edge (background) ===
  // Calculate luminance for each cluster center
  const clusterLuminances = clusters.map(c =>
    0.299 * c.center[0] + 0.587 * c.center[1] + 0.114 * c.center[2]
  )

  // The text cluster should have the most contrast with the edge luminance
  let textCluster
  if (edgeLuminance > 128) {
    // Light background → text is the darker cluster
    textCluster = clusterLuminances[0] < clusterLuminances[1] ? clusters[0] : clusters[1]
  } else {
    // Dark background → text is the lighter cluster
    textCluster = clusterLuminances[0] > clusterLuminances[1] ? clusters[0] : clusters[1]
  }

  const [r, g, b] = textCluster.center.map(v => Math.round(Math.max(0, Math.min(255, v))))

  // === 5. Verify contrast is sufficient ===
  const textLuminance = 0.299 * r + 0.587 * g + 0.114 * b
  const contrast = Math.abs(textLuminance - edgeLuminance)

  // If contrast is too low (< 30), fallback to pure black or white
  if (contrast < 30) {
    return edgeLuminance > 128 ? '000000' : 'FFFFFF'
  }

  // Convert to hex (without #)
  return ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()
}

/**
 * Simple K-Means clustering for RGB colors
 *
 * @param {Array<[number, number, number]>} pixels - Array of RGB pixels
 * @param {number} k - Number of clusters
 * @param {number} maxIterations - Maximum iterations
 * @returns {Array<{center: [number, number, number], count: number}>} Cluster results
 */
function kMeans(pixels, k, maxIterations = 10) {
  if (pixels.length === 0) {
    return Array(k).fill({ center: [128, 128, 128], count: 0 })
  }

  // Initialize centers using k-means++ style (first random, then furthest)
  const centers = []

  // First center: use pixel at 25% position (likely edge/background)
  centers.push([...pixels[Math.floor(pixels.length * 0.25)]])

  // Second center: find pixel furthest from first center
  let maxDist = 0
  let furthestPixel = pixels[0]
  for (const p of pixels) {
    const dist = colorDistance(p, centers[0])
    if (dist > maxDist) {
      maxDist = dist
      furthestPixel = p
    }
  }
  centers.push([...furthestPixel])

  // Iterate
  for (let iter = 0; iter < maxIterations; iter++) {
    // Assign pixels to nearest center
    const assignments = Array(k).fill(null).map(() => [])

    for (const p of pixels) {
      let minDist = Infinity
      let minIdx = 0
      for (let i = 0; i < k; i++) {
        const dist = colorDistance(p, centers[i])
        if (dist < minDist) {
          minDist = dist
          minIdx = i
        }
      }
      assignments[minIdx].push(p)
    }

    // Update centers
    let converged = true
    for (let i = 0; i < k; i++) {
      if (assignments[i].length === 0) continue

      const newCenter = [0, 0, 0]
      for (const p of assignments[i]) {
        newCenter[0] += p[0]
        newCenter[1] += p[1]
        newCenter[2] += p[2]
      }
      newCenter[0] /= assignments[i].length
      newCenter[1] /= assignments[i].length
      newCenter[2] /= assignments[i].length

      if (colorDistance(newCenter, centers[i]) > 1) {
        converged = false
      }
      centers[i] = newCenter
    }

    if (converged) break
  }

  // Return cluster info
  const result = []
  for (let i = 0; i < k; i++) {
    result.push({
      center: centers[i],
      count: pixels.filter(p => {
        let minIdx = 0
        let minDist = colorDistance(p, centers[0])
        for (let j = 1; j < k; j++) {
          const dist = colorDistance(p, centers[j])
          if (dist < minDist) {
            minDist = dist
            minIdx = j
          }
        }
        return minIdx === i
      }).length
    })
  }

  return result
}

/**
 * Calculate squared Euclidean distance between two RGB colors
 */
function colorDistance(c1, c2) {
  return (c1[0] - c2[0]) ** 2 + (c1[1] - c2[1]) ** 2 + (c1[2] - c2[2]) ** 2
}

/**
 * Extract text colors for multiple regions
 *
 * @param {ImageData} imageData - Source image data
 * @param {Array<{bounds: Object}>} regions - Array of regions with bounds
 * @returns {Array<string>} Array of hex color strings
 */
function extractTextColors(imageData, regions) {
  return regions.map(region => extractTextColor(imageData, region.bounds))
}

/**
 * Dilate the mask to expand text regions
 * @param {ImageData} maskData - Mask image data
 * @param {number} iterations - Number of dilation iterations
 * @returns {ImageData} Dilated mask
 */
function dilateMask(maskData, iterations = 2) {
  const mask = cv.matFromImageData(maskData)

  // Convert to grayscale
  let grayMask = new cv.Mat()
  if (mask.channels() === 4) {
    cv.cvtColor(mask, grayMask, cv.COLOR_RGBA2GRAY)
  } else if (mask.channels() === 3) {
    cv.cvtColor(mask, grayMask, cv.COLOR_RGB2GRAY)
  } else {
    grayMask = mask.clone()
  }

  // Create kernel for dilation
  const kernel = cv.Mat.ones(3, 3, cv.CV_8U)

  // Dilate
  const dilated = new cv.Mat()
  cv.dilate(grayMask, dilated, kernel, new cv.Point(-1, -1), iterations)

  // Convert back to RGBA
  const dilatedRgba = new cv.Mat()
  cv.cvtColor(dilated, dilatedRgba, cv.COLOR_GRAY2RGBA)

  // Get result as ImageData
  const resultData = new ImageData(
    new Uint8ClampedArray(dilatedRgba.data),
    maskData.width,
    maskData.height
  )

  // Clean up
  mask.delete()
  grayMask.delete()
  kernel.delete()
  dilated.delete()
  dilatedRgba.delete()

  return resultData
}

// Handle messages from main thread
self.onmessage = async function (e) {
  const { type, imageData, maskData, options, regions } = e.data

  try {
    switch (type) {
      case 'init':
        await loadOpenCV()
        self.postMessage({ type: 'ready' })
        break

      case 'inpaint': {
        if (!cvReady) {
          await loadOpenCV()
        }

        self.postMessage({ type: 'status', message: 'Processing inpainting...' })

        // Extract text colors BEFORE inpainting (from original image)
        let textColors = null
        if (regions && regions.length > 0) {
          self.postMessage({ type: 'status', message: 'Extracting text colors...' })
          textColors = extractTextColors(imageData, regions)
        }

        // Optionally dilate mask first
        let processedMask = maskData
        if (options?.dilateMask && options.dilateIterations > 0) {
          processedMask = dilateMask(maskData, options.dilateIterations)
        }

        const result = inpaint(imageData, processedMask, options)

        self.postMessage(
          {
            type: 'result',
            imageData: result,
            textColors, // Array of hex color strings, or null
          },
          [result.data.buffer]
        )
        break
      }

      case 'extractColors': {
        // Standalone color extraction (for reprocessing without re-inpainting)
        if (!regions || regions.length === 0) {
          self.postMessage({
            type: 'colorsResult',
            textColors: [],
          })
          break
        }

        self.postMessage({ type: 'status', message: 'Extracting text colors...' })
        const textColors = extractTextColors(imageData, regions)

        self.postMessage({
          type: 'colorsResult',
          textColors,
        })
        break
      }

      case 'dilateMask': {
        if (!cvReady) {
          await loadOpenCV()
        }

        const dilatedMask = dilateMask(maskData, options?.iterations || 2)
        self.postMessage(
          {
            type: 'maskResult',
            maskData: dilatedMask,
          },
          [dilatedMask.data.buffer]
        )
        break
      }

      default:
        self.postMessage({ type: 'error', message: `Unknown command: ${type}` })
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error.message || 'Unknown error occurred',
    })
  }
}
