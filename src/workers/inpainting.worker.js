/**
 * Inpainting Worker
 * Uses OpenCV.js to remove text from images using inpainting algorithms
 */

/* global cv, importScripts */

// OpenCV.js CDN URL
const OPENCV_CDN_URL = 'https://docs.opencv.org/4.9.0/opencv.js'

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
  const { algorithm = 'TELEA', radius = 3 } = options

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
  const { type, imageData, maskData, options } = e.data

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
          },
          [result.data.buffer]
        )
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
