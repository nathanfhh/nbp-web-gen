import { ref, computed, watch } from 'vue'

/**
 * Composable for LINE Sticker Tool UI logic
 * Handles drag/drop, cover picker, status helpers, and stats
 *
 * @param {Object} deps - Dependencies
 * @param {import('vue').Ref<Array>} deps.images - Images array ref
 * @param {Object} deps.LINE_SPECS - LINE specifications constants
 * @param {Function} deps.setCoverImageFromSticker - Set cover from sticker function
 * @param {Function} deps.setCoverImageFromFile - Set cover from file function
 * @param {Function} deps.addImages - Add images function
 * @returns {Object} UI state and helpers
 */
export function useLineStickerToolUI(deps) {
  const { images, LINE_SPECS, setCoverImageFromSticker, setCoverImageFromFile, addImages } = deps

  // Drag state
  const isDragging = ref(false)
  const fileInput = ref(null)

  // Cover image picker state
  const showStickerPicker = ref(false)
  const pickerTarget = ref(null) // 'main' | 'tab'
  const mainFileInput = ref(null)
  const tabFileInput = ref(null)

  // Image element refs for scroll into view
  const imageRefs = ref({})

  /**
   * Set image ref for scroll tracking
   */
  const setImageRef = (id, el) => {
    if (el) {
      imageRefs.value[id] = el
    } else {
      delete imageRefs.value[id]
    }
  }

  /**
   * Watch for processing status and scroll to current processing image
   */
  const setupProcessingScroll = () => {
    watch(
      () => images.value.find((img) => img.status === 'processing'),
      (processingImg) => {
        if (processingImg && imageRefs.value[processingImg.id]) {
          imageRefs.value[processingImg.id].scrollIntoView({
            behavior: 'instant',
            block: 'center',
          })
        }
      },
    )
  }

  // Drag event handlers
  const handleDragOver = (e) => {
    e.preventDefault()
    isDragging.value = true
  }

  const handleDragLeave = () => {
    isDragging.value = false
  }

  const handleDrop = (e) => {
    e.preventDefault()
    isDragging.value = false
    const files = e.dataTransfer.files
    if (files.length) {
      addImages(files)
    }
  }

  const handleFileSelect = (e) => {
    const files = e.target.files
    if (files.length) {
      addImages(files)
    }
    e.target.value = ''
  }

  const openFilePicker = () => {
    fileInput.value?.click()
  }

  // Cover picker handlers
  const openStickerPicker = (target) => {
    pickerTarget.value = target
    showStickerPicker.value = true
  }

  const selectStickerForCover = async (stickerId) => {
    if (pickerTarget.value) {
      await setCoverImageFromSticker(pickerTarget.value, stickerId)
    }
    showStickerPicker.value = false
    pickerTarget.value = null
  }

  const handleCoverFileSelect = async (type, event) => {
    const file = event.target.files?.[0]
    if (file) {
      await setCoverImageFromFile(type, file)
    }
    event.target.value = ''
  }

  // Status helpers
  const getStatusClass = (img) => {
    const isCompliant =
      img.width <= LINE_SPECS.maxWidth &&
      img.height <= LINE_SPECS.maxHeight &&
      img.size <= LINE_SPECS.maxFileSize &&
      img.file.type === 'image/png'

    if (img.status === 'processing') return 'border-blue-500 animate-pulse'
    if (img.status === 'processed') return 'border-emerald-500'
    if (img.status === 'error') return 'border-red-500'
    if (!isCompliant) return 'border-amber-500'
    return 'border-white/20'
  }

  const getDisplayDimensions = (img) => {
    if (img.processedBlob) {
      return `${img.processedWidth} × ${img.processedHeight}`
    }
    return `${img.width} × ${img.height}`
  }

  const needsWarning = (img) => {
    return (
      img.width > LINE_SPECS.maxWidth ||
      img.height > LINE_SPECS.maxHeight ||
      img.width % 2 !== 0 ||
      img.height % 2 !== 0 ||
      img.size > LINE_SPECS.maxFileSize ||
      img.file.type !== 'image/png'
    )
  }

  const formatFailedItems = (items) => {
    if (items.length === 0) return ''
    const indices = items.map((item) => {
      const idx = images.value.findIndex((img) => img.id === item.id)
      return `#${idx + 1}`
    })
    return indices.join(', ')
  }

  // Stats computed
  const dimensionStats = computed(() => {
    const oversized = images.value.filter(
      (img) => img.width > LINE_SPECS.maxWidth || img.height > LINE_SPECS.maxHeight,
    )
    const processed = oversized.filter((img) => img.processedBlob)
    const stillOversized = images.value.filter((img) => {
      const w = img.processedBlob ? img.processedWidth : img.width
      const h = img.processedBlob ? img.processedHeight : img.height
      return w > LINE_SPECS.maxWidth || h > LINE_SPECS.maxHeight
    })
    return {
      originalOversized: oversized.length,
      processedCount: processed.length,
      stillOversized: stillOversized.length,
      hasProcessed: processed.length > 0,
    }
  })

  const fileSizeStats = computed(() => {
    const oversized = images.value.filter((img) => img.size > LINE_SPECS.maxFileSize)
    const processed = oversized.filter((img) => img.processedBlob)
    const stillOversized = images.value.filter((img) => {
      const size = img.processedBlob ? img.processedSize : img.size
      return size > LINE_SPECS.maxFileSize
    })
    return {
      originalOversized: oversized.length,
      processedCount: processed.length,
      stillOversized: stillOversized.length,
      hasProcessed: processed.length > 0,
    }
  })

  const evenDimensionStats = computed(() => {
    const oddDimension = images.value.filter(
      (img) => img.width % 2 !== 0 || img.height % 2 !== 0,
    )
    const processed = oddDimension.filter((img) => img.processedBlob)
    const stillOdd = images.value.filter((img) => {
      const w = img.processedBlob ? img.processedWidth : img.width
      const h = img.processedBlob ? img.processedHeight : img.height
      return w % 2 !== 0 || h % 2 !== 0
    })
    return {
      originalOdd: oddDimension.length,
      processedCount: processed.length,
      stillOdd: stillOdd.length,
      hasProcessed: processed.length > 0,
    }
  })

  const suggestedCount = computed(() => {
    const current = images.value.length
    if (LINE_SPECS.validCounts.includes(current)) return null
    const closest = LINE_SPECS.validCounts.reduce((prev, curr) =>
      Math.abs(curr - current) < Math.abs(prev - current) ? curr : prev,
    )
    return closest
  })

  return {
    // Drag state
    isDragging,
    fileInput,

    // Cover picker state
    showStickerPicker,
    pickerTarget,
    mainFileInput,
    tabFileInput,

    // Image refs
    imageRefs,
    setImageRef,
    setupProcessingScroll,

    // Drag handlers
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFileSelect,
    openFilePicker,

    // Cover picker handlers
    openStickerPicker,
    selectStickerForCover,
    handleCoverFileSelect,

    // Status helpers
    getStatusClass,
    getDisplayDimensions,
    needsWarning,
    formatFailedItems,

    // Stats
    dimensionStats,
    fileSizeStats,
    evenDimensionStats,
    suggestedCount,
  }
}
