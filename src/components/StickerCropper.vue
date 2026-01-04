<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import JSZip from 'jszip'
import { useToast } from '@/composables/useToast'

const toast = useToast()

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  imageSrc: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['update:modelValue', 'close'])

// State
const isVisible = ref(false)
const isClosing = ref(false)
const isProcessing = ref(false)
const isDownloading = ref(false)

// Canvas refs
const sourceCanvasRef = ref(null)
const previewCanvasRef = ref(null)
const previewContainerRef = ref(null)

// Image state
const originalImage = ref(null)
const imageLoaded = ref(false)

// Background removal settings
const tolerance = ref(30)
const backgroundColor = ref({ r: 0, g: 0, b: 0 })
const isPickingColor = ref(false)

// Preview background (for quality check)
const previewBgWhite = ref(false)

// Cropped stickers
const croppedStickers = ref([])
const selectedStickers = ref(new Set())

// Watch for open/close
watch(() => props.modelValue, (newVal) => {
  if (newVal) {
    isVisible.value = true
    isClosing.value = false
    document.body.style.overflow = 'hidden'
    loadImage()
  } else {
    isClosing.value = true
    setTimeout(() => {
      isVisible.value = false
      isClosing.value = false
      document.body.style.overflow = ''
      resetState()
    }, 300)
  }
})

// Watch for preview background toggle - regenerate preview URLs
watch(previewBgWhite, (useWhiteBg) => {
  if (croppedStickers.value.length === 0) return

  // Update big preview canvas
  const sourceCanvas = sourceCanvasRef.value
  const previewCanvas = previewCanvasRef.value
  if (sourceCanvas && previewCanvas) {
    const previewCtx = previewCanvas.getContext('2d')
    previewCanvas.width = sourceCanvas.width
    previewCanvas.height = sourceCanvas.height

    if (useWhiteBg) {
      previewCtx.fillStyle = '#ffffff'
      previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height)
    } else {
      previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height)
    }
    previewCtx.drawImage(sourceCanvas, 0, 0)
  }

  // Regenerate previewDataUrl for each sticker
  croppedStickers.value = croppedStickers.value.map(sticker => {
    const stickerPreviewCanvas = document.createElement('canvas')
    stickerPreviewCanvas.width = sticker.width
    stickerPreviewCanvas.height = sticker.height
    const stickerPreviewCtx = stickerPreviewCanvas.getContext('2d')

    if (useWhiteBg) {
      stickerPreviewCtx.fillStyle = '#ffffff'
      stickerPreviewCtx.fillRect(0, 0, sticker.width, sticker.height)
    }

    // Draw from the original transparent canvas
    stickerPreviewCtx.drawImage(sticker.canvas, 0, 0)

    return {
      ...sticker,
      previewDataUrl: stickerPreviewCanvas.toDataURL('image/png'),
    }
  })
})

// Load image when src changes
watch(() => props.imageSrc, () => {
  if (props.modelValue && props.imageSrc) {
    loadImage()
  }
})

const loadImage = () => {
  if (!props.imageSrc) return

  imageLoaded.value = false
  const img = new Image()
  img.crossOrigin = 'anonymous'

  img.onload = () => {
    originalImage.value = img
    imageLoaded.value = true
    // Auto-detect background color from top-left pixel
    detectBackgroundColor()
  }

  img.onerror = () => {
    console.error('Failed to load image')
  }

  img.src = props.imageSrc
}

const detectBackgroundColor = () => {
  if (!originalImage.value || !sourceCanvasRef.value) return

  const canvas = sourceCanvasRef.value
  const ctx = canvas.getContext('2d', { willReadFrequently: true })

  canvas.width = originalImage.value.width
  canvas.height = originalImage.value.height
  ctx.drawImage(originalImage.value, 0, 0)

  // Get top-left pixel color
  const imageData = ctx.getImageData(0, 0, 1, 1)
  backgroundColor.value = {
    r: imageData.data[0],
    g: imageData.data[1],
    b: imageData.data[2],
  }
}

const handleCanvasClick = (e) => {
  if (!isPickingColor.value || !sourceCanvasRef.value || !originalImage.value) return

  const canvas = sourceCanvasRef.value
  const container = previewContainerRef.value
  const imgWidth = originalImage.value.width
  const imgHeight = originalImage.value.height

  // Check if canvas has valid dimensions
  if (canvas.width === 0 || canvas.height === 0) {
    toast.warning('請先等待圖片載入完成')
    return
  }

  if (!container) {
    toast.warning('請先等待圖片載入完成')
    return
  }

  const containerRect = container.getBoundingClientRect()

  if (containerRect.width === 0 || containerRect.height === 0) {
    toast.warning('請先等待圖片載入完成')
    return
  }

  // Calculate how the image is displayed in the container (centered, maintaining aspect ratio)
  const containerAspect = containerRect.width / containerRect.height
  const imageAspect = imgWidth / imgHeight

  let displayWidth, displayHeight, offsetX, offsetY

  if (imageAspect > containerAspect) {
    // Image is wider - constrained by width
    displayWidth = containerRect.width
    displayHeight = containerRect.width / imageAspect
    offsetX = 0
    offsetY = (containerRect.height - displayHeight) / 2
  } else {
    // Image is taller - constrained by height
    displayHeight = containerRect.height
    displayWidth = containerRect.height * imageAspect
    offsetX = (containerRect.width - displayWidth) / 2
    offsetY = 0
  }

  // Get click position relative to the actual image area
  const clickX = e.clientX - containerRect.left - offsetX
  const clickY = e.clientY - containerRect.top - offsetY

  // Check if click is within the image bounds
  if (clickX < 0 || clickX > displayWidth || clickY < 0 || clickY > displayHeight) {
    toast.warning('請點擊圖片區域')
    return
  }

  // Scale to original image coordinates
  const x = Math.floor((clickX / displayWidth) * imgWidth)
  const y = Math.floor((clickY / displayHeight) * imgHeight)

  // Clamp coordinates to valid range
  const clampedX = Math.max(0, Math.min(imgWidth - 1, x))
  const clampedY = Math.max(0, Math.min(imgHeight - 1, y))

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const imageData = ctx.getImageData(clampedX, clampedY, 1, 1)

  backgroundColor.value = {
    r: imageData.data[0],
    g: imageData.data[1],
    b: imageData.data[2],
  }

  isPickingColor.value = false
  toast.success('已選取背景顏色')
}

const processImage = () => {
  if (!originalImage.value || !sourceCanvasRef.value || !previewCanvasRef.value) return

  isProcessing.value = true
  croppedStickers.value = []
  selectedStickers.value.clear()

  // Use requestAnimationFrame to prevent UI blocking
  requestAnimationFrame(() => {
    try {
      const sourceCanvas = sourceCanvasRef.value
      const previewCanvas = previewCanvasRef.value
      const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true })
      const previewCtx = previewCanvas.getContext('2d')

      // Draw original image
      sourceCanvas.width = originalImage.value.width
      sourceCanvas.height = originalImage.value.height
      ctx.drawImage(originalImage.value, 0, 0)

      // Get image data
      const imageData = ctx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height)
      const data = imageData.data

      // Remove background
      const { r: bgR, g: bgG, b: bgB } = backgroundColor.value
      const tol = tolerance.value * 3

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]

        // Calculate color difference
        const diff = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB)

        if (diff <= tol) {
          data[i + 3] = 0 // Set alpha to 0
        }
      }

      // Put processed image data back
      ctx.putImageData(imageData, 0, 0)

      // Copy to preview canvas (with optional white background)
      previewCanvas.width = sourceCanvas.width
      previewCanvas.height = sourceCanvas.height
      if (previewBgWhite.value) {
        previewCtx.fillStyle = '#ffffff'
        previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height)
      }
      previewCtx.drawImage(sourceCanvas, 0, 0)

      // Find and crop individual stickers
      findAndCropStickers(sourceCanvas, previewBgWhite.value)
    } finally {
      isProcessing.value = false
    }
  })
}

const findAndCropStickers = (canvas, useWhiteBg = false) => {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const width = canvas.width
  const height = canvas.height
  const imgData = ctx.getImageData(0, 0, width, height).data

  // Helper: check if row has content
  const isRowHasContent = (y) => {
    for (let x = 0; x < width; x++) {
      if (imgData[(y * width + x) * 4 + 3] > 0) return true
    }
    return false
  }

  // Helper: check if column has content in Y range
  const isColHasContent = (x, yStart, yEnd) => {
    for (let y = yStart; y < yEnd; y++) {
      if (imgData[(y * width + x) * 4 + 3] > 0) return true
    }
    return false
  }

  const regions = []

  // Step 1: Find horizontal rows with content
  const rowRegions = []
  let inContent = false
  let startY = 0

  for (let y = 0; y < height; y++) {
    const hasContent = isRowHasContent(y)
    if (hasContent && !inContent) {
      inContent = true
      startY = y
    } else if (!hasContent && inContent) {
      inContent = false
      rowRegions.push({ y: startY, h: y - startY })
    }
  }
  if (inContent) rowRegions.push({ y: startY, h: height - startY })

  // Step 2: For each row, find columns with content
  rowRegions.forEach(row => {
    let inItem = false
    let startX = 0

    for (let x = 0; x < width; x++) {
      const hasContent = isColHasContent(x, row.y, row.y + row.h)
      if (hasContent && !inItem) {
        inItem = true
        startX = x
      } else if (!hasContent && inItem) {
        inItem = false
        regions.push({ x: startX, y: row.y, w: x - startX, h: row.h })
      }
    }
    if (inItem) regions.push({ x: startX, y: row.y, w: width - startX, h: row.h })
  })

  // Filter out small noise regions (< 20x20)
  const MIN_SIZE = 20
  const validRegions = regions.filter(r => r.w > MIN_SIZE && r.h > MIN_SIZE)

  // Crop each region
  const stickers = validRegions.map((rect, index) => {
    // Original canvas (transparent background) for download
    const stickerCanvas = document.createElement('canvas')
    stickerCanvas.width = rect.w
    stickerCanvas.height = rect.h
    const stickerCtx = stickerCanvas.getContext('2d')
    stickerCtx.drawImage(canvas, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h)

    // Preview canvas (with optional white background)
    const previewCanvas = document.createElement('canvas')
    previewCanvas.width = rect.w
    previewCanvas.height = rect.h
    const previewCtx = previewCanvas.getContext('2d')
    if (useWhiteBg) {
      previewCtx.fillStyle = '#ffffff'
      previewCtx.fillRect(0, 0, rect.w, rect.h)
    }
    previewCtx.drawImage(canvas, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h)

    return {
      id: index,
      canvas: stickerCanvas,
      dataUrl: stickerCanvas.toDataURL('image/png'),
      previewDataUrl: previewCanvas.toDataURL('image/png'),
      width: rect.w,
      height: rect.h,
      rect,
    }
  })

  croppedStickers.value = stickers

  // Select all by default
  stickers.forEach(s => selectedStickers.value.add(s.id))

  // Show toast
  if (stickers.length > 0) {
    toast.success(`成功裁切出 ${stickers.length} 張貼圖`)
  } else {
    toast.warning('未偵測到獨立貼圖，請調整容許值後重試')
  }
}

const toggleSelectSticker = (id) => {
  if (selectedStickers.value.has(id)) {
    selectedStickers.value.delete(id)
  } else {
    selectedStickers.value.add(id)
  }
  // Trigger reactivity
  selectedStickers.value = new Set(selectedStickers.value)
}

const selectAllStickers = () => {
  croppedStickers.value.forEach(s => selectedStickers.value.add(s.id))
  selectedStickers.value = new Set(selectedStickers.value)
}

const deselectAllStickers = () => {
  selectedStickers.value.clear()
  selectedStickers.value = new Set(selectedStickers.value)
}

const downloadSingleSticker = (sticker) => {
  const link = document.createElement('a')
  link.href = sticker.dataUrl
  link.download = `sticker-${sticker.id + 1}.png`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

const downloadSelectedAsZip = async () => {
  const selected = croppedStickers.value.filter(s => selectedStickers.value.has(s.id))
  if (selected.length === 0) return

  isDownloading.value = true

  try {
    const zip = new JSZip()

    for (const sticker of selected) {
      // Convert data URL to blob
      const response = await fetch(sticker.dataUrl)
      const blob = await response.blob()
      zip.file(`sticker-${sticker.id + 1}.png`, blob)
    }

    const content = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(content)

    const link = document.createElement('a')
    link.href = url
    link.download = `stickers-${Date.now()}.zip`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    URL.revokeObjectURL(url)
  } finally {
    isDownloading.value = false
  }
}

const close = () => {
  emit('update:modelValue', false)
  emit('close')
}

const resetState = () => {
  imageLoaded.value = false
  originalImage.value = null
  croppedStickers.value = []
  selectedStickers.value.clear()
  tolerance.value = 30
  isPickingColor.value = false
}

// Background color display
const bgColorHex = computed(() => {
  const { r, g, b } = backgroundColor.value
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
})

// Keyboard handling
const handleKeydown = (e) => {
  if (!props.modelValue) return
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="cropper">
      <div
        v-if="isVisible"
        class="cropper-overlay"
        :class="{ 'is-closing': isClosing }"
      >
        <!-- Header -->
        <div class="cropper-header">
          <h2 class="text-lg font-semibold text-white flex items-center gap-2">
            <svg class="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            貼圖裁切工具
          </h2>
          <button
            @click="close"
            class="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Main content -->
        <div class="cropper-content">
          <!-- Left: Settings & Preview -->
          <div class="cropper-left">
            <!-- Settings Panel -->
            <div class="settings-panel">
              <h3 class="text-sm font-medium text-gray-300 mb-3">去背設定</h3>

              <!-- Background Color -->
              <div class="mb-4">
                <label class="block text-xs text-gray-400 mb-2">背景顏色</label>
                <div class="flex items-center gap-2">
                  <div
                    class="w-8 h-8 rounded border border-white/20"
                    :style="{ backgroundColor: bgColorHex }"
                  ></div>
                  <span class="text-sm text-gray-300 font-mono">{{ bgColorHex }}</span>
                  <button
                    @click="isPickingColor = !isPickingColor"
                    class="ml-auto px-3 py-1.5 text-xs rounded-lg transition-colors"
                    :class="isPickingColor
                      ? 'bg-purple-500 text-white'
                      : 'bg-white/10 text-gray-300 hover:bg-white/20'"
                  >
                    {{ isPickingColor ? '取色中...' : '點擊取色' }}
                  </button>
                </div>
              </div>

              <!-- Tolerance -->
              <div class="mb-4">
                <label class="block text-xs text-gray-400 mb-2">
                  容許值 (Tolerance): <span class="text-purple-400 font-medium">{{ tolerance }}</span>
                </label>
                <input
                  v-model="tolerance"
                  type="range"
                  min="0"
                  max="100"
                  class="w-full accent-purple-500"
                />
                <p class="text-xs text-gray-500 mt-1">數值越高，越能去除接近背景色的像素</p>
              </div>

              <!-- Preview Background Toggle -->
              <div class="mb-4 flex items-center justify-between">
                <label class="text-xs text-gray-400">白色背景預覽</label>
                <button
                  @click="previewBgWhite = !previewBgWhite"
                  class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
                  :class="previewBgWhite ? 'bg-purple-500' : 'bg-gray-600'"
                >
                  <span
                    class="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
                    :class="previewBgWhite ? 'translate-x-[18px]' : 'translate-x-1'"
                  />
                </button>
              </div>

              <!-- Process Button -->
              <button
                @click="processImage"
                :disabled="!imageLoaded || isProcessing"
                class="w-full py-2.5 px-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2"
                :class="imageLoaded && !isProcessing
                  ? 'bg-purple-500 hover:bg-purple-600 text-white'
                  : 'bg-gray-700 text-gray-400 cursor-not-allowed'"
              >
                <svg v-if="isProcessing" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
                {{ isProcessing ? '處理中...' : '開始處理' }}
              </button>
            </div>

            <!-- Preview Canvas -->
            <div class="preview-panel">
              <h3 class="text-sm font-medium text-gray-300 mb-3">預覽</h3>
              <div
                ref="previewContainerRef"
                class="preview-container"
                :class="{ 'cursor-crosshair': isPickingColor, 'bg-white': previewBgWhite }"
                @click="handleCanvasClick"
              >
                <canvas ref="sourceCanvasRef" class="hidden"></canvas>
                <!-- Only show preview canvas after processing -->
                <canvas
                  v-show="croppedStickers.length > 0"
                  ref="previewCanvasRef"
                  class="preview-canvas"
                  :class="{ 'opacity-50': isProcessing }"
                ></canvas>
                <!-- Show original image before processing -->
                <img
                  v-if="croppedStickers.length === 0 && imageLoaded"
                  :src="imageSrc"
                  class="preview-image"
                  alt="Original"
                />
                <div v-if="!imageLoaded" class="preview-placeholder">
                  <svg class="w-12 h-12 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p class="text-gray-500 text-sm mt-2">載入圖片中...</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Right: Cropped Stickers -->
          <div class="cropper-right">
            <div class="stickers-header">
              <h3 class="text-sm font-medium text-gray-300">
                裁切結果
                <span v-if="croppedStickers.length" class="text-purple-400">
                  ({{ croppedStickers.length }} 張)
                </span>
              </h3>
              <div v-if="croppedStickers.length" class="flex items-center gap-2">
                <button
                  @click="selectAllStickers"
                  class="text-xs text-gray-400 hover:text-white transition-colors"
                >
                  全選
                </button>
                <span class="text-gray-600">|</span>
                <button
                  @click="deselectAllStickers"
                  class="text-xs text-gray-400 hover:text-white transition-colors"
                >
                  取消全選
                </button>
              </div>
            </div>

            <!-- Stickers Grid -->
            <div v-if="croppedStickers.length" class="stickers-grid">
              <div
                v-for="sticker in croppedStickers"
                :key="sticker.id"
                class="sticker-card"
                :class="{ 'selected': selectedStickers.has(sticker.id) }"
                @click="toggleSelectSticker(sticker.id)"
              >
                <div class="sticker-preview">
                  <img :src="sticker.previewDataUrl" :alt="`Sticker ${sticker.id + 1}`" />
                </div>
                <div class="sticker-info">
                  <span class="text-xs text-gray-400">
                    {{ sticker.width }} x {{ sticker.height }}
                  </span>
                  <button
                    @click.stop="downloadSingleSticker(sticker)"
                    class="sticker-download"
                    title="下載此貼圖"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </button>
                </div>
                <!-- Checkbox overlay -->
                <div class="sticker-checkbox">
                  <svg v-if="selectedStickers.has(sticker.id)" class="w-5 h-5 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                  </svg>
                  <div v-else class="w-5 h-5 rounded-full border-2 border-gray-500"></div>
                </div>
              </div>
            </div>

            <!-- Empty state -->
            <div v-else class="stickers-empty">
              <svg class="w-16 h-16 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p class="text-gray-500 text-sm mt-3">調整設定後點擊「開始處理」</p>
              <p class="text-gray-600 text-xs mt-1">系統將自動偵測並裁切貼圖</p>
            </div>

            <!-- Download All Button -->
            <div v-if="croppedStickers.length" class="stickers-actions">
              <button
                @click="downloadSelectedAsZip"
                :disabled="selectedStickers.size === 0 || isDownloading"
                class="download-all-btn"
                :class="selectedStickers.size > 0 && !isDownloading
                  ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                  : 'bg-gray-700 text-gray-400 cursor-not-allowed'"
              >
                <svg v-if="isDownloading" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
                <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {{ isDownloading ? '打包中...' : `下載已選 (${selectedStickers.size} 張)` }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.cropper-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  background: rgba(10, 10, 15, 0.98);
  backdrop-filter: blur(8px);
  animation: cropper-fade-in 0.3s ease-out;
  /* Force light text colors regardless of theme (dark background overlay) */
  color: #e5e7eb;
  overflow: hidden;
}

/* Force all text to be light in cropper (override theme) */
.cropper-overlay :deep(.text-gray-300),
.cropper-overlay .text-gray-300 {
  color: #d1d5db !important;
}

.cropper-overlay :deep(.text-gray-400),
.cropper-overlay .text-gray-400 {
  color: #9ca3af !important;
}

.cropper-overlay :deep(.text-gray-500),
.cropper-overlay .text-gray-500 {
  color: #6b7280 !important;
}

.cropper-overlay :deep(.text-gray-600),
.cropper-overlay .text-gray-600 {
  color: #4b5563 !important;
}

.cropper-overlay :deep(.text-white),
.cropper-overlay .text-white {
  color: #ffffff !important;
}

.cropper-overlay.is-closing {
  animation: cropper-fade-out 0.3s ease-out forwards;
}

@keyframes cropper-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes cropper-fade-out {
  from { opacity: 1; }
  to { opacity: 0; }
}

.cropper-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}

.cropper-content {
  display: flex;
  flex: 1 1 0;
  overflow: auto;
  min-height: 0;
  -webkit-overflow-scrolling: touch;
}

.cropper-left {
  width: 400px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.settings-panel {
  padding: 1.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.preview-panel {
  flex: 1;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.preview-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><rect fill="%231a1a1f" width="20" height="20"/><rect fill="%23252530" width="10" height="10"/><rect fill="%23252530" x="10" y="10" width="10" height="10"/></svg>');
  border-radius: 0.5rem;
  overflow: hidden;
  position: relative;
}

.preview-canvas,
.preview-image {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.preview-placeholder {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.cropper-right {
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  min-height: 0;
  -webkit-overflow-scrolling: touch;
}

.stickers-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}

.stickers-grid {
  flex: 1 1 0;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 1rem;
  padding: 1.5rem;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  align-content: start;
  min-height: 0;
}

.sticker-card {
  width: 140px;
  position: relative;
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid transparent;
  border-radius: 0.75rem;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
}

.sticker-card:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(139, 92, 246, 0.3);
}

.sticker-card.selected {
  border-color: rgba(139, 92, 246, 0.6);
  background: rgba(139, 92, 246, 0.1);
}

.sticker-preview {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem;
  background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><rect fill="%231a1a1f" width="16" height="16"/><rect fill="%23252530" width="8" height="8"/><rect fill="%23252530" x="8" y="8" width="8" height="8"/></svg>');
}

.sticker-preview img {
  max-width: 100%;
  height: auto;
  object-fit: contain;
}

.sticker-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem;
  background: rgba(0, 0, 0, 0.3);
  flex-shrink: 0;
  margin-top: auto;
}

.sticker-download {
  padding: 0.25rem;
  color: #9ca3af;
  transition: color 0.2s;
}

.sticker-download:hover {
  color: #22d3ee;
}

.sticker-checkbox {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
}

.stickers-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.stickers-actions {
  padding: 1rem 1.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}

.download-all-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  font-weight: 500;
  transition: all 0.2s;
}

/* Vue transition */
.cropper-enter-active,
.cropper-leave-active {
  transition: opacity 0.3s ease;
}

.cropper-enter-from,
.cropper-leave-to {
  opacity: 0;
}

/* Small screens (tablet and below) */
@media (max-width: 900px) {
  .cropper-left {
    width: 320px;
  }
}

/* Mobile responsiveness */
@media (max-width: 768px) {
  .cropper-content {
    flex-direction: column;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .cropper-left {
    width: 100%;
    flex: none;
    border-right: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    overflow: visible;
  }

  .settings-panel {
    padding: 1rem;
  }

  .preview-panel {
    padding: 1rem;
    min-height: 250px;
    flex: none;
  }

  .preview-container {
    min-height: 200px;
    height: 200px;
  }

  .cropper-right {
    flex: none;
    min-height: auto;
    overflow: visible;
  }

  .stickers-grid {
    flex: none;
    overflow: visible;
    min-height: auto;
  }

  .sticker-card {
    width: 100px;
  }

  .stickers-empty {
    min-height: 150px;
  }

  .stickers-actions {
    position: sticky;
    bottom: 0;
    background: rgba(10, 10, 15, 0.95);
  }
}
</style>
