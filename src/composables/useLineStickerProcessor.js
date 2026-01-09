import { ref, computed, reactive } from 'vue'
import JSZip from 'jszip'

// LINE Sticker specifications
const LINE_SPECS = {
  maxWidth: 370,
  maxHeight: 320,
  maxFileSize: 1 * 1024 * 1024, // 1MB
  validCounts: [8, 16, 24, 32, 40],
}

// Generate unique ID
let idCounter = 0
const generateId = () => `img_${Date.now()}_${idCounter++}`

export function useLineStickerProcessor() {
  // Image list
  const images = ref([])
  // { id, file, name, size, width, height, preview, status, processed, processedBlob, processedSize }

  // Processing options
  const options = reactive({
    filenameFormat: 'original', // 'original' | 'sequential'
  })

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

    // Dimension check
    const dimensionFailedItems = imgs.filter(
      (img) => img.width > LINE_SPECS.maxWidth || img.height > LINE_SPECS.maxHeight,
    )

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
    }
  })

  // All specs passed
  const allPassed = computed(
    () =>
      images.value.length > 0 &&
      specChecks.value.fileSize.passed &&
      specChecks.value.dimensions.passed &&
      specChecks.value.count.passed &&
      specChecks.value.format.passed,
  )

  // Needs processing (dimensions or file size not compliant)
  const needsProcessing = computed(() => {
    return images.value.some(
      (img) =>
        img.width > LINE_SPECS.maxWidth ||
        img.height > LINE_SPECS.maxHeight ||
        img.size > LINE_SPECS.maxFileSize,
    )
  })

  // Can download (has images and all are either processed or already compliant)
  const canDownload = computed(() => {
    if (images.value.length === 0) return false
    // Format must be PNG
    if (!specChecks.value.format.passed) return false
    // All images must either be compliant or processed
    return images.value.every((img) => {
      const isCompliant =
        img.width <= LINE_SPECS.maxWidth &&
        img.height <= LINE_SPECS.maxHeight &&
        img.size <= LINE_SPECS.maxFileSize
      return isCompliant || img.status === 'processed'
    })
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

  // Process single image (scale + quantize if needed)
  const processSingleImage = async (imageData, worker) => {
    const { file, width, height } = imageData

    // Check if processing needed
    const needsScale = width > LINE_SPECS.maxWidth || height > LINE_SPECS.maxHeight
    const scaleFactor = calculateScaleFactor(width, height)
    const newWidth = Math.round(width * scaleFactor)
    const newHeight = Math.round(height * scaleFactor)

    // Create canvas and draw scaled image
    const canvas = document.createElement('canvas')
    canvas.width = newWidth
    canvas.height = newHeight
    const ctx = canvas.getContext('2d')

    // Load image
    const img = new Image()
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = reject
      img.src = URL.createObjectURL(file)
    })

    // Draw with high quality scaling
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, newWidth, newHeight)

    // Clean up
    URL.revokeObjectURL(img.src)

    // Try to get PNG blob
    let blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))

    // If still over 1MB, apply color quantization
    if (blob.size > LINE_SPECS.maxFileSize && worker) {
      const imgData = ctx.getImageData(0, 0, newWidth, newHeight)

      // Try progressive quantization: 256 -> 128 -> 64 colors
      for (const colors of [256, 128, 64]) {
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
              imageData: imgData.data,
              width: newWidth,
              height: newHeight,
              targetColors: colors,
            },
            [imgData.data.buffer],
          )
        })

        // Put quantized data back to canvas
        const newImgData = new ImageData(new Uint8ClampedArray(quantizedData), newWidth, newHeight)
        ctx.putImageData(newImgData, 0, 0)

        // Get new blob
        blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))

        // If under 1MB, we're done
        if (blob.size <= LINE_SPECS.maxFileSize) {
          break
        }
      }
    }

    return {
      blob,
      size: blob.size,
      width: newWidth,
      height: newHeight,
      scaled: needsScale,
    }
  }

  // Process all images that need processing
  const processImages = async () => {
    const imagesToProcess = images.value.filter(
      (img) =>
        img.width > LINE_SPECS.maxWidth ||
        img.height > LINE_SPECS.maxHeight ||
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
    const zip = new JSZip()

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
  }
}
