/**
 * Inpainting Worker Composable
 * Wraps the OpenCV.js inpainting worker for text removal from images
 */

import { ref, shallowRef, onUnmounted } from 'vue'

/**
 * @typedef {Object} InpaintOptions
 * @property {'TELEA'|'NS'} algorithm - Inpainting algorithm
 * @property {number} radius - Inpainting radius
 * @property {boolean} dilateMask - Whether to dilate the mask
 * @property {number} dilateIterations - Number of dilation iterations
 */

/**
 * @returns {Object} Inpainting worker composable
 */
export function useInpaintingWorker() {
  const isLoading = ref(false)
  const isReady = ref(false)
  const status = ref('')
  const error = ref(null)
  const worker = shallowRef(null)

  // Pending promises for async operations
  let pendingResolve = null
  let pendingReject = null

  /**
   * Initialize the inpainting worker
   */
  const initialize = async () => {
    if (worker.value) return
    if (isLoading.value) {
      // Wait for existing initialization
      while (!isReady.value && !error.value) {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      if (error.value) throw new Error(error.value)
      return
    }

    isLoading.value = true
    status.value = 'Initializing inpainting worker...'
    error.value = null

    try {
      // Create worker (classic worker, not module - needed for importScripts)
      const newWorker = new Worker(
        new URL('../workers/inpainting.worker.js', import.meta.url)
      )

      // Set up message handler
      newWorker.onmessage = (e) => {
        const { type, message, imageData, maskData } = e.data

        switch (type) {
          case 'ready':
            isReady.value = true
            status.value = 'Inpainting worker ready'
            if (pendingResolve) {
              pendingResolve()
              pendingResolve = null
              pendingReject = null
            }
            break

          case 'status':
            status.value = message
            break

          case 'result':
            if (pendingResolve) {
              pendingResolve(imageData)
              pendingResolve = null
              pendingReject = null
            }
            break

          case 'maskResult':
            if (pendingResolve) {
              pendingResolve(maskData)
              pendingResolve = null
              pendingReject = null
            }
            break

          case 'error':
            error.value = message
            status.value = `Error: ${message}`
            if (pendingReject) {
              pendingReject(new Error(message))
              pendingResolve = null
              pendingReject = null
            }
            break
        }
      }

      newWorker.onerror = (e) => {
        const errorMessage = e.message || 'Worker error'
        error.value = errorMessage
        status.value = `Worker error: ${errorMessage}`
        if (pendingReject) {
          pendingReject(new Error(errorMessage))
          pendingResolve = null
          pendingReject = null
        }
      }

      worker.value = newWorker

      // Initialize OpenCV in the worker
      await new Promise((resolve, reject) => {
        pendingResolve = resolve
        pendingReject = reject
        newWorker.postMessage({ type: 'init' })
      })
    } catch (err) {
      error.value = err.message
      status.value = 'Failed to initialize worker'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Perform inpainting on an image
   * @param {ImageData} imageData - Source image data
   * @param {ImageData} maskData - Mask image data (white = areas to inpaint)
   * @param {InpaintOptions} options - Inpainting options
   * @returns {Promise<ImageData>} Inpainted image data
   */
  const inpaint = async (imageData, maskData, options = {}) => {
    if (!worker.value || !isReady.value) {
      await initialize()
    }

    isLoading.value = true
    status.value = 'Processing inpainting...'
    error.value = null

    try {
      const result = await new Promise((resolve, reject) => {
        pendingResolve = resolve
        pendingReject = reject

        // Clone the data before sending (worker will transfer ownership)
        const imageClone = new ImageData(
          new Uint8ClampedArray(imageData.data),
          imageData.width,
          imageData.height
        )
        const maskClone = new ImageData(
          new Uint8ClampedArray(maskData.data),
          maskData.width,
          maskData.height
        )

        worker.value.postMessage(
          {
            type: 'inpaint',
            imageData: imageClone,
            maskData: maskClone,
            options: {
              algorithm: options.algorithm || 'TELEA',
              radius: options.radius || 1,
              dilateMask: options.dilateMask ?? true,
              dilateIterations: options.dilateIterations ?? 2,
            },
          },
          [imageClone.data.buffer, maskClone.data.buffer]
        )
      })

      status.value = 'Inpainting complete'
      return result
    } catch (err) {
      error.value = err.message
      status.value = `Inpainting failed: ${err.message}`
      throw err
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Inpaint multiple images
   * @param {Array<{image: ImageData, mask: ImageData}>} items - Images and masks
   * @param {InpaintOptions} options - Inpainting options
   * @param {function} onProgress - Progress callback (current, total)
   * @returns {Promise<ImageData[]>} Array of inpainted images
   */
  const inpaintMultiple = async (items, options = {}, onProgress) => {
    const results = []

    for (let i = 0; i < items.length; i++) {
      if (onProgress) {
        onProgress(i + 1, items.length)
      }
      const result = await inpaint(items[i].image, items[i].mask, options)
      results.push(result)
    }

    return results
  }

  /**
   * Dilate a mask to expand regions
   * @param {ImageData} maskData - Mask image data
   * @param {number} iterations - Number of dilation iterations
   * @returns {Promise<ImageData>} Dilated mask
   */
  const dilateMask = async (maskData, iterations = 2) => {
    if (!worker.value || !isReady.value) {
      await initialize()
    }

    return new Promise((resolve, reject) => {
      pendingResolve = resolve
      pendingReject = reject

      const maskClone = new ImageData(
        new Uint8ClampedArray(maskData.data),
        maskData.width,
        maskData.height
      )

      worker.value.postMessage(
        {
          type: 'dilateMask',
          maskData: maskClone,
          options: { iterations },
        },
        [maskClone.data.buffer]
      )
    })
  }

  /**
   * Convert an image URL/data URL to ImageData
   * @param {string} src - Image source (URL or data URL)
   * @returns {Promise<ImageData>} Image data
   */
  const imageToImageData = async (src) => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'

      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)
        resolve(ctx.getImageData(0, 0, img.width, img.height))
      }

      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = src
    })
  }

  /**
   * Convert ImageData to a data URL
   * @param {ImageData} imageData - Image data
   * @param {string} type - Image MIME type
   * @returns {string} Data URL
   */
  const imageDataToDataUrl = (imageData, type = 'image/png') => {
    const canvas = document.createElement('canvas')
    canvas.width = imageData.width
    canvas.height = imageData.height
    const ctx = canvas.getContext('2d')
    ctx.putImageData(imageData, 0, 0)
    return canvas.toDataURL(type)
  }

  /**
   * Terminate the worker
   */
  const terminate = () => {
    if (worker.value) {
      worker.value.terminate()
      worker.value = null
      isReady.value = false
      status.value = 'Worker terminated'
    }
  }

  // Clean up on unmount
  onUnmounted(() => {
    terminate()
  })

  return {
    isLoading,
    isReady,
    status,
    error,
    initialize,
    inpaint,
    inpaintMultiple,
    dilateMask,
    imageToImageData,
    imageDataToDataUrl,
    terminate,
  }
}
