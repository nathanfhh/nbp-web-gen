/**
 * Image Compression Composable
 *
 * Provides WebP compression using Canvas API and thumbnail generation.
 * Uses browser-native APIs without external dependencies.
 */

// Default compression quality (0.85 provides good balance between size and quality)
const DEFAULT_QUALITY = 0.85

// Thumbnail settings
const THUMBNAIL_MAX_SIZE = 100
const THUMBNAIL_QUALITY = 0.6

/**
 * Convert base64 string to Blob
 * @param {string} base64 - Base64 encoded string (without data URL prefix)
 * @param {string} mimeType - MIME type like 'image/png'
 * @returns {Promise<Blob>}
 */
export const base64ToBlob = async (base64, mimeType) => {
  const response = await fetch(`data:${mimeType};base64,${base64}`)
  return response.blob()
}

/**
 * Convert Blob to base64 string
 * @param {Blob} blob - Blob to convert
 * @returns {Promise<string>} Base64 string (without data URL prefix)
 */
export const blobToBase64 = (blob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      // Remove the data URL prefix (e.g., "data:image/webp;base64,")
      const base64 = dataUrl.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Load an image from base64 data
 * @param {string} base64 - Base64 encoded image data
 * @param {string} mimeType - MIME type
 * @returns {Promise<HTMLImageElement>}
 */
const loadImage = (base64, mimeType) => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = `data:${mimeType};base64,${base64}`
  })
}

/**
 * Get image dimensions from base64 data
 * @param {Object} imageData - { data: base64, mimeType: string }
 * @returns {Promise<{width: number, height: number}>}
 */
export const getImageDimensions = async (imageData) => {
  const img = await loadImage(imageData.data, imageData.mimeType)
  return {
    width: img.naturalWidth,
    height: img.naturalHeight,
  }
}

/**
 * Compress an image to WebP format using Canvas API
 * @param {Object} imageData - { data: base64, mimeType: string }
 * @param {Object} options - Compression options
 * @param {number} options.quality - WebP quality (0-1), default 0.85
 * @param {number} options.maxWidth - Max width (optional, for resizing)
 * @param {number} options.maxHeight - Max height (optional, for resizing)
 * @returns {Promise<{blob: Blob, originalSize: number, compressedSize: number, width: number, height: number}>}
 */
export const compressToWebP = async (imageData, options = {}) => {
  const { quality = DEFAULT_QUALITY, maxWidth, maxHeight } = options

  // Load original image
  const img = await loadImage(imageData.data, imageData.mimeType)

  // Calculate original size
  const originalBlob = await base64ToBlob(imageData.data, imageData.mimeType)
  const originalSize = originalBlob.size

  // Calculate dimensions (with optional max constraints)
  let { naturalWidth: width, naturalHeight: height } = img

  if (maxWidth && width > maxWidth) {
    height = Math.round((height * maxWidth) / width)
    width = maxWidth
  }
  if (maxHeight && height > maxHeight) {
    width = Math.round((width * maxHeight) / height)
    height = maxHeight
  }

  // Create canvas and draw image
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, width, height)

  // Convert to WebP
  const webpBlob = await new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/webp', quality)
  })

  return {
    blob: webpBlob,
    originalSize,
    compressedSize: webpBlob.size,
    width,
    height,
  }
}

/**
 * Generate a thumbnail from image data
 * @param {Object} imageData - { data: base64, mimeType: string }
 * @param {Object} options - Thumbnail options
 * @param {number} options.maxSize - Max width/height, default 100
 * @param {number} options.quality - WebP quality, default 0.6
 * @returns {Promise<string>} Base64 encoded thumbnail (WebP)
 */
export const generateThumbnail = async (imageData, options = {}) => {
  const { maxSize = THUMBNAIL_MAX_SIZE, quality = THUMBNAIL_QUALITY } = options

  // Load original image
  const img = await loadImage(imageData.data, imageData.mimeType)

  // Calculate thumbnail dimensions (maintain aspect ratio)
  let { naturalWidth: width, naturalHeight: height } = img

  if (width > height) {
    if (width > maxSize) {
      height = Math.round((height * maxSize) / width)
      width = maxSize
    }
  } else {
    if (height > maxSize) {
      width = Math.round((width * maxSize) / height)
      height = maxSize
    }
  }

  // Create canvas and draw
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, width, height)

  // Convert to WebP and then to base64
  const thumbnailBlob = await new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/webp', quality)
  })

  return blobToBase64(thumbnailBlob)
}

/**
 * Generate a thumbnail from a Blob
 * @param {Blob} blob - Image blob
 * @param {Object} options - Thumbnail options
 * @param {number} options.maxSize - Max width/height, default 64
 * @param {number} options.quality - WebP quality, default 0.6
 * @returns {Promise<string>} Base64 encoded thumbnail (without data: prefix)
 */
export const generateThumbnailFromBlob = async (blob, options = {}) => {
  const { maxSize = 64, quality = THUMBNAIL_QUALITY } = options

  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(blob)

    img.onload = async () => {
      URL.revokeObjectURL(url)

      // Calculate thumbnail dimensions (maintain aspect ratio)
      let { naturalWidth: width, naturalHeight: height } = img
      const ratio = Math.min(maxSize / width, maxSize / height)
      width = Math.round(width * ratio)
      height = Math.round(height * ratio)

      // Create canvas and draw
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)

      // Convert to WebP and then to base64
      const thumbnailBlob = await new Promise((res) => {
        canvas.toBlob(res, 'image/webp', quality)
      })
      const base64 = await blobToBase64(thumbnailBlob)
      resolve(base64)
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image for thumbnail'))
    }

    img.src = url
  })
}

/**
 * Calculate compression ratio as percentage saved
 * @param {number} originalSize - Original size in bytes
 * @param {number} compressedSize - Compressed size in bytes
 * @returns {string} Percentage saved (e.g., "65.4")
 */
export const calculateCompressionRatio = (originalSize, compressedSize) => {
  if (originalSize === 0) return '0'
  return ((1 - compressedSize / originalSize) * 100).toFixed(1)
}

/**
 * Format file size to human readable string
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size (e.g., "1.5 MB")
 */
export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/**
 * Composable function for use in Vue components
 */
export function useImageCompression() {
  return {
    // Constants
    DEFAULT_QUALITY,
    THUMBNAIL_MAX_SIZE,
    THUMBNAIL_QUALITY,

    // Methods
    base64ToBlob,
    blobToBase64,
    getImageDimensions,
    compressToWebP,
    generateThumbnail,
    generateThumbnailFromBlob,
    calculateCompressionRatio,
    formatFileSize,
  }
}
