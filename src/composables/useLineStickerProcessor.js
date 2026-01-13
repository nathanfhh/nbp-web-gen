import { ref, computed, reactive } from 'vue'
import JSZip from 'jszip'
import { useToast } from '@/composables/useToast'
import { useI18n } from 'vue-i18n'

// LINE Sticker specifications
const LINE_SPECS = {
  maxWidth: 370,
  maxHeight: 320,
  maxFileSize: 1 * 1024 * 1024, // 1MB
  validCounts: [8, 16, 24, 32, 40],
  // Cover images
  main: { width: 240, height: 240 },
  tab: { width: 96, height: 74 },
}

// Generate unique ID
let idCounter = 0
const generateId = () => `img_${Date.now()}_${idCounter++}`

// Round number to nearest even (LINE requires even dimensions)
const roundToEven = (n) => Math.floor(n / 2) * 2

export function useLineStickerProcessor() {
  const toast = useToast()
  const { t } = useI18n()

  // Image list
  const images = ref([])
  // { id, file, name, size, width, height, preview, status, processed, processedBlob, processedSize }

  // Processing options
  const options = reactive({
    filenameFormat: 'sequential', // 'original' | 'sequential'
  })

  // Cover images state
  // { source: 'sticker' | 'upload', sourceId?: string, file?: File, preview: string, processedBlob: Blob, processedPreview: string }
  const mainImage = ref(null)
  const tabImage = ref(null)

  // Processing state
  const isProcessing = ref(false)
  const processProgress = ref({ current: 0, total: 0 })

  // Spec checks (computed)
  const specChecks = computed(() => {
    const imgs = images.value

    // File size check
    const fileSizeFailedItems = imgs.filter((img) => {
      const size = img.processedBlob ? img.processedSize : img.size
      return size > LINE_SPECS.maxFileSize
    })

    // Dimension check (use processed dimensions if available)
    const dimensionFailedItems = imgs.filter((img) => {
      const w = img.processedBlob ? img.processedWidth : img.width
      const h = img.processedBlob ? img.processedHeight : img.height
      return w > LINE_SPECS.maxWidth || h > LINE_SPECS.maxHeight
    })

    // Even dimension check (LINE requires width and height to be even)
    const evenDimensionFailedItems = imgs.filter((img) => {
      const w = img.processedBlob ? img.processedWidth : img.width
      const h = img.processedBlob ? img.processedHeight : img.height
      return w % 2 !== 0 || h % 2 !== 0
    })

    // Format check
    const formatFailedItems = imgs.filter((img) => img.file.type !== 'image/png')

    // Count check
    const currentCount = imgs.length
    const countPassed = LINE_SPECS.validCounts.includes(currentCount)

    return {
      fileSize: {
        passed: fileSizeFailedItems.length === 0 && imgs.length > 0,
        failedItems: fileSizeFailedItems,
        hint: 'lineStickerTool.specs.fileSizeHint',
      },
      dimensions: {
        passed: dimensionFailedItems.length === 0 && imgs.length > 0,
        failedItems: dimensionFailedItems,
        hint: 'lineStickerTool.specs.dimensionsHint',
      },
      evenDimensions: {
        passed: evenDimensionFailedItems.length === 0 && imgs.length > 0,
        failedItems: evenDimensionFailedItems,
        hint: 'lineStickerTool.specs.evenDimensionsHint',
      },
      count: {
        passed: countPassed,
        current: currentCount,
        validOptions: LINE_SPECS.validCounts,
        hint: 'lineStickerTool.specs.countHint',
      },
      format: {
        passed: formatFailedItems.length === 0 && imgs.length > 0,
        failedItems: formatFailedItems,
        hint: 'lineStickerTool.specs.formatHint',
      },
      coverImages: {
        passed: !!(mainImage.value?.processedBlob && tabImage.value?.processedBlob),
        hasMain: !!mainImage.value?.processedBlob,
        hasTab: !!tabImage.value?.processedBlob,
        hint: 'lineStickerTool.specs.coverImagesHint',
      },
    }
  })

  // All specs passed
  const allPassed = computed(
    () =>
      images.value.length > 0 &&
      specChecks.value.fileSize.passed &&
      specChecks.value.dimensions.passed &&
      specChecks.value.evenDimensions.passed &&
      specChecks.value.count.passed &&
      specChecks.value.format.passed &&
      specChecks.value.coverImages.passed,
  )

  // Needs processing (dimensions, even dimensions, or file size not compliant)
  const needsProcessing = computed(() => {
    return images.value.some(
      (img) =>
        img.width > LINE_SPECS.maxWidth ||
        img.height > LINE_SPECS.maxHeight ||
        img.width % 2 !== 0 ||
        img.height % 2 !== 0 ||
        img.size > LINE_SPECS.maxFileSize,
    )
  })

  // Can download (only requires images to exist)
  const canDownload = computed(() => {
    return images.value.length > 0
  })

  // Read image file and extract metadata
  const readImageFile = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const dataUrl = e.target.result
        const img = new Image()
        img.onload = () => {
          resolve({
            width: img.width,
            height: img.height,
            preview: dataUrl,
          })
        }
        img.onerror = reject
        img.src = dataUrl
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  // Add images
  const addImages = async (files) => {
    const fileArray = Array.from(files)

    for (const file of fileArray) {
      // Skip non-image files
      if (!file.type.startsWith('image/')) continue

      try {
        const { width, height, preview } = await readImageFile(file)

        images.value.push({
          id: generateId(),
          file,
          name: file.name,
          size: file.size,
          width,
          height,
          preview,
          status: 'pending', // 'pending' | 'processing' | 'processed' | 'error'
          processed: false,
          processedBlob: null,
          processedSize: 0,
          processedWidth: 0,
          processedHeight: 0,
        })
      } catch (err) {
        console.error('Failed to read image:', file.name, err)
      }
    }
  }

  // Remove single image
  const removeImage = (id) => {
    const index = images.value.findIndex((img) => img.id === id)
    if (index !== -1) {
      // Revoke object URL if exists
      const img = images.value[index]
      if (img.processedBlob) {
        URL.revokeObjectURL(img.preview)
      }
      images.value.splice(index, 1)
    }
  }

  // Clear all images
  const clearAll = () => {
    // Revoke all object URLs
    images.value.forEach((img) => {
      if (img.processedBlob) {
        URL.revokeObjectURL(img.preview)
      }
    })
    images.value = []

    // Also clear cover images
    if (mainImage.value?.processedPreview) {
      URL.revokeObjectURL(mainImage.value.processedPreview)
    }
    if (tabImage.value?.processedPreview) {
      URL.revokeObjectURL(tabImage.value.processedPreview)
    }
    mainImage.value = null
    tabImage.value = null
  }

  // Process cover image (resize to target dimensions with aspect ratio preserved, center on transparent background)
  const processCoverImage = async (sourceBlob, targetWidth, targetHeight) => {
    // Load source image
    const img = new Image()
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = reject
      img.src = URL.createObjectURL(sourceBlob)
    })

    // Calculate scaling to fit within target while preserving aspect ratio
    const scale = Math.min(targetWidth / img.width, targetHeight / img.height)
    const scaledWidth = Math.round(img.width * scale)
    const scaledHeight = Math.round(img.height * scale)

    // Create canvas with target dimensions (transparent background)
    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const ctx = canvas.getContext('2d')

    // Center the scaled image
    const offsetX = Math.round((targetWidth - scaledWidth) / 2)
    const offsetY = Math.round((targetHeight - scaledHeight) / 2)

    // Use high quality scaling
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, offsetX, offsetY, scaledWidth, scaledHeight)

    // Clean up
    URL.revokeObjectURL(img.src)

    // Get PNG blob
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    const preview = canvas.toDataURL('image/png')

    return { blob, preview }
  }

  // Set cover image from existing sticker
  const setCoverImageFromSticker = async (type, stickerId) => {
    const sticker = images.value.find((img) => img.id === stickerId)
    if (!sticker) return

    const targetRef = type === 'main' ? mainImage : tabImage
    const specs = type === 'main' ? LINE_SPECS.main : LINE_SPECS.tab

    // Get source blob (prefer processed if available)
    const sourceBlob = sticker.processedBlob || sticker.file

    // Process to target dimensions
    const { blob, preview } = await processCoverImage(sourceBlob, specs.width, specs.height)

    // Revoke old preview URL if exists
    if (targetRef.value?.processedPreview) {
      URL.revokeObjectURL(targetRef.value.processedPreview)
    }

    targetRef.value = {
      source: 'sticker',
      sourceId: stickerId,
      preview: sticker.preview,
      processedBlob: blob,
      processedPreview: preview,
    }
  }

  // Set cover image from uploaded file
  const setCoverImageFromFile = async (type, file) => {
    if (!file || !file.type.startsWith('image/')) return

    const targetRef = type === 'main' ? mainImage : tabImage
    const specs = type === 'main' ? LINE_SPECS.main : LINE_SPECS.tab

    // Read file for preview
    const { preview: originalPreview } = await readImageFile(file)

    // Process to target dimensions
    const { blob, preview } = await processCoverImage(file, specs.width, specs.height)

    // Revoke old preview URL if exists
    if (targetRef.value?.processedPreview) {
      URL.revokeObjectURL(targetRef.value.processedPreview)
    }

    targetRef.value = {
      source: 'upload',
      file,
      preview: originalPreview,
      processedBlob: blob,
      processedPreview: preview,
    }
  }

  // Remove cover image
  const removeCoverImage = (type) => {
    const targetRef = type === 'main' ? mainImage : tabImage
    if (targetRef.value?.processedPreview) {
      URL.revokeObjectURL(targetRef.value.processedPreview)
    }
    targetRef.value = null
  }

  // Calculate scale factor
  const calculateScaleFactor = (width, height) => {
    if (width <= LINE_SPECS.maxWidth && height <= LINE_SPECS.maxHeight) {
      return 1
    }
    const wRatio = LINE_SPECS.maxWidth / width
    const hRatio = LINE_SPECS.maxHeight / height
    return Math.min(wRatio, hRatio)
  }

  // Process single image (scale only, quantize only if absolutely necessary)
  const processSingleImage = async (imageData, worker) => {
    const { file, width, height, size } = imageData

    // Check if processing needed
    const needsScale = width > LINE_SPECS.maxWidth || height > LINE_SPECS.maxHeight
    const scaleFactor = calculateScaleFactor(width, height)
    // LINE requires even dimensions, so round to nearest even number
    const newWidth = roundToEven(Math.round(width * scaleFactor))
    const newHeight = roundToEven(Math.round(height * scaleFactor))

    // Check if dimensions are odd (need processing even if under size limit)
    const needsEvenFix = width % 2 !== 0 || height % 2 !== 0

    // If no scaling needed, dimensions are even, and file is already under 1MB, return original
    if (!needsScale && !needsEvenFix && size <= LINE_SPECS.maxFileSize) {
      return {
        blob: file,
        size: size,
        width: width,
        height: height,
        scaled: false,
        quantized: false,
      }
    }

    // Create canvas and draw scaled image
    const canvas = document.createElement('canvas')
    canvas.width = newWidth
    canvas.height = newHeight
    // Use willReadFrequently for better performance if we need to read pixel data later
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    // Load image
    const img = new Image()
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = reject
      img.src = URL.createObjectURL(file)
    })

    // For non-scaling (just need PNG conversion), use nearest-neighbor to preserve pixels
    // For scaling down, use high quality smoothing
    if (needsScale) {
      // Multi-step downscaling for better quality (step down by 50% at a time)
      let currentWidth = width
      let currentHeight = height
      let sourceCanvas = document.createElement('canvas')
      sourceCanvas.width = width
      sourceCanvas.height = height
      const sourceCtx = sourceCanvas.getContext('2d')
      sourceCtx.drawImage(img, 0, 0)

      // Step down gradually for better quality
      while (currentWidth > newWidth * 2 || currentHeight > newHeight * 2) {
        const stepWidth = Math.max(Math.round(currentWidth / 2), newWidth)
        const stepHeight = Math.max(Math.round(currentHeight / 2), newHeight)

        const stepCanvas = document.createElement('canvas')
        stepCanvas.width = stepWidth
        stepCanvas.height = stepHeight
        const stepCtx = stepCanvas.getContext('2d')
        stepCtx.imageSmoothingEnabled = true
        stepCtx.imageSmoothingQuality = 'high'
        stepCtx.drawImage(sourceCanvas, 0, 0, stepWidth, stepHeight)

        sourceCanvas = stepCanvas
        currentWidth = stepWidth
        currentHeight = stepHeight
      }

      // Final step to target size
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(sourceCanvas, 0, 0, newWidth, newHeight)
    } else {
      // No scaling, just draw directly
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(img, 0, 0)
    }

    // Clean up
    URL.revokeObjectURL(img.src)

    // Try to get PNG blob (no quantization first)
    let blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    let quantized = false

    // Only if still over 1MB AND we have a worker, apply color quantization as last resort
    if (blob.size > LINE_SPECS.maxFileSize && worker) {
      console.warn(`Image ${imageData.name} is ${(blob.size / 1024 / 1024).toFixed(2)}MB after resize, applying quantization...`)

      // Try progressive quantization: 256 -> 128 -> 64 colors
      for (const colors of [256, 128, 64]) {
        // Need to re-read image data since buffer was transferred
        const freshImgData = ctx.getImageData(0, 0, newWidth, newHeight)

        const quantizedData = await new Promise((resolve, reject) => {
          const handler = (e) => {
            worker.removeEventListener('message', handler)
            if (e.data.error) {
              reject(new Error(e.data.error))
            } else {
              resolve(e.data.imageData)
            }
          }
          worker.addEventListener('message', handler)
          worker.postMessage(
            {
              imageData: freshImgData.data,
              width: newWidth,
              height: newHeight,
              targetColors: colors,
            },
            [freshImgData.data.buffer],
          )
        })

        // Put quantized data back to canvas
        const newImgData = new ImageData(new Uint8ClampedArray(quantizedData), newWidth, newHeight)
        ctx.putImageData(newImgData, 0, 0)

        // Get new blob
        blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
        quantized = true

        console.log(`Quantized to ${colors} colors: ${(blob.size / 1024 / 1024).toFixed(2)}MB`)

        // If under 1MB, we're done
        if (blob.size <= LINE_SPECS.maxFileSize) {
          break
        }
      }
    }

    console.log(`Processed ${imageData.name}:`, {
      originalSize: `${(size / 1024).toFixed(1)}KB`,
      newSize: `${(blob.size / 1024).toFixed(1)}KB`,
      originalDimensions: `${width}×${height}`,
      newDimensions: `${newWidth}×${newHeight}`,
      scaled: needsScale,
      quantized,
    })

    return {
      blob,
      size: blob.size,
      width: newWidth,
      height: newHeight,
      scaled: needsScale,
      quantized,
    }
  }

  // Process all images that need processing
  const processImages = async () => {
    const imagesToProcess = images.value.filter(
      (img) =>
        img.width > LINE_SPECS.maxWidth ||
        img.height > LINE_SPECS.maxHeight ||
        img.width % 2 !== 0 ||
        img.height % 2 !== 0 ||
        img.size > LINE_SPECS.maxFileSize,
    )

    if (imagesToProcess.length === 0) return

    isProcessing.value = true
    processProgress.value = { current: 0, total: imagesToProcess.length }

    // Create worker
    let worker = null
    try {
      worker = new Worker(new URL('@/workers/pngQuantization.worker.js', import.meta.url), {
        type: 'module',
      })
    } catch (err) {
      console.warn('Worker creation failed, will skip quantization:', err)
    }

    try {
      for (let i = 0; i < imagesToProcess.length; i++) {
        const img = imagesToProcess[i]
        img.status = 'processing'

        try {
          const result = await processSingleImage(img, worker)
          img.processedBlob = result.blob
          img.processedSize = result.size
          img.processedWidth = result.width
          img.processedHeight = result.height
          img.wasScaled = result.scaled
          img.wasQuantized = result.quantized
          img.processed = true
          img.status = 'processed'
        } catch (err) {
          console.error('Failed to process image:', img.name, err)
          img.status = 'error'
        }

        processProgress.value.current = i + 1
      }
    } finally {
      if (worker) {
        worker.terminate()
      }
      isProcessing.value = false
    }
  }

  // Download as ZIP
  const downloadAsZip = async () => {
    // Warn if not fully compliant
    if (!allPassed.value) {
      toast.warning(t('lineStickerTool.toast.notFullyCompliant'))
    }

    const zip = new JSZip()

    // Add sticker images
    images.value.forEach((img, index) => {
      // Get blob (processed or original)
      const blob = img.processedBlob || img.file

      // Generate filename
      let filename
      if (options.filenameFormat === 'sequential') {
        const num = String(index + 1).padStart(2, '0')
        filename = `${num}.png`
      } else {
        // Ensure .png extension
        filename = img.name.toLowerCase().endsWith('.png') ? img.name : `${img.name}.png`
      }

      zip.file(filename, blob)
    })

    // Add cover images
    if (mainImage.value?.processedBlob) {
      zip.file('main.png', mainImage.value.processedBlob)
    }
    if (tabImage.value?.processedBlob) {
      zip.file('tab.png', tabImage.value.processedBlob)
    }

    // Generate and download
    const content = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(content)
    const a = document.createElement('a')
    a.href = url
    a.download = `line-stickers-${Date.now()}.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Format file size for display
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  return {
    // State
    images,
    options,
    isProcessing,
    processProgress,
    mainImage,
    tabImage,

    // Computed
    specChecks,
    allPassed,
    needsProcessing,
    canDownload,

    // Constants
    LINE_SPECS,

    // Methods
    addImages,
    removeImage,
    clearAll,
    processImages,
    downloadAsZip,
    formatFileSize,
    setCoverImageFromSticker,
    setCoverImageFromFile,
    removeCoverImage,
  }
}
