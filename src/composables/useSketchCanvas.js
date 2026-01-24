/**
 * Sketch Canvas composable using Fabric.js
 *
 * Provides free drawing functionality with brush and eraser tools.
 * Uses Fabric.js for better drawing experience and future extensibility.
 */

import { ref, computed, shallowRef, onUnmounted } from 'vue'
import { Canvas, PencilBrush, FabricImage } from 'fabric'

// Canvas output dimensions per aspect ratio
const CANVAS_SIZES = {
  '1:1': { width: 1024, height: 1024 },
  '16:9': { width: 1024, height: 576 },
  '9:16': { width: 576, height: 1024 },
  '4:3': { width: 1024, height: 768 },
  '3:4': { width: 768, height: 1024 },
}

// LocalStorage key for persisting aspect ratio preference
const STORAGE_KEY = 'nbp-sketch-aspect-ratio'

/**
 * Get saved aspect ratio from localStorage
 */
const getSavedAspectRatio = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && CANVAS_SIZES[saved]) {
      return saved
    }
  } catch {
    // Ignore localStorage errors
  }
  return '1:1' // Default
}

/**
 * Save aspect ratio to localStorage
 */
const saveAspectRatio = (ratio) => {
  try {
    localStorage.setItem(STORAGE_KEY, ratio)
  } catch {
    // Ignore localStorage errors
  }
}

// Default color palette
export const SKETCH_COLORS = [
  '#000000', // Black
  '#FFFFFF', // White
  '#EF4444', // Red
  '#F97316', // Orange
  '#FACC15', // Yellow
  '#22C55E', // Green
  '#3B82F6', // Blue
  '#8B5CF6', // Purple
]

/**
 * @param {Object} options
 * @param {import('vue').Ref<HTMLCanvasElement|null>} options.canvasRef - Reference to the canvas element
 * @param {Object} options.historyManager - Optional history manager from useSketchHistory
 */
export function useSketchCanvas({ canvasRef, historyManager = null }) {
  // ============================================================================
  // State
  // ============================================================================
  const currentTool = ref('brush') // 'brush' | 'eraser' | 'pan'
  const strokeColor = ref('#000000')
  const lineWidth = ref(5)
  const aspectRatio = ref(getSavedAspectRatio())
  const isDrawing = ref(false)

  // Fabric.js canvas instance (use shallowRef to avoid deep reactivity)
  const fabricCanvas = shallowRef(null)

  // Store original brush color when switching to eraser
  let savedBrushColor = '#000000'

  // Store custom canvas size (for background image editing)
  const customCanvasSize = ref(null)

  // Zoom state
  const zoomLevel = ref(1)
  const MIN_ZOOM = 0.25
  const MAX_ZOOM = 4

  // ============================================================================
  // Computed
  // ============================================================================
  const canvasSize = computed(() => {
    if (aspectRatio.value === 'custom' && customCanvasSize.value) {
      return customCanvasSize.value
    }
    return CANVAS_SIZES[aspectRatio.value] || CANVAS_SIZES['1:1']
  })

  // ============================================================================
  // Canvas Setup
  // ============================================================================

  /**
   * Initialize Fabric.js canvas with white background
   * @param {Object} options
   * @param {boolean} options.skipInitialSnapshot - Skip saving initial snapshot (for edit mode)
   */
  const initCanvas = ({ skipInitialSnapshot = false } = {}) => {
    if (!canvasRef.value) return

    // Create Fabric.js canvas
    const canvas = new Canvas(canvasRef.value, {
      isDrawingMode: true,
      width: canvasSize.value.width,
      height: canvasSize.value.height,
      backgroundColor: '#FFFFFF',
      selection: false,
    })

    // Configure pencil brush
    const brush = new PencilBrush(canvas)
    brush.color = strokeColor.value
    brush.width = lineWidth.value
    canvas.freeDrawingBrush = brush

    // Listen for drawing events
    canvas.on('mouse:down', () => {
      isDrawing.value = true
    })

    canvas.on('mouse:up', () => {
      isDrawing.value = false
    })

    // Save history after each path is created
    canvas.on('path:created', () => {
      historyManager?.saveSnapshot()
    })

    fabricCanvas.value = canvas

    // Save initial state (skip if loading content later)
    if (!skipInitialSnapshot) {
      historyManager?.saveSnapshot()
    }
  }

  /**
   * Clear canvas (remove all objects but keep background)
   */
  const clearCanvas = () => {
    if (!fabricCanvas.value) return

    fabricCanvas.value.clear()
    fabricCanvas.value.backgroundColor = '#FFFFFF'
    fabricCanvas.value.renderAll()

    historyManager?.saveSnapshot()
  }

  /**
   * Export canvas as PNG data URL
   */
  const toDataURL = () => {
    if (!fabricCanvas.value) return null

    return fabricCanvas.value.toDataURL({
      format: 'png',
      quality: 1,
      multiplier: 1,
    })
  }

  /**
   * Get image data for output (matches referenceImages format)
   */
  const getImageData = () => {
    const dataUrl = toDataURL()
    if (!dataUrl) return null

    return {
      data: dataUrl.split(',')[1], // Pure base64
      preview: dataUrl, // Full data URL
      mimeType: 'image/png',
      name: `sketch-${Date.now()}.png`,
    }
  }

  /**
   * Get image data with Fabric.js JSON for later editing
   * Extends getImageData with fabricJson for preserving stroke data
   */
  const getImageDataWithJson = () => {
    const imageData = getImageData()
    if (!imageData || !fabricCanvas.value) return imageData

    // Serialize Fabric.js canvas to JSON
    const fabricJson = JSON.stringify(fabricCanvas.value.toJSON())

    return {
      ...imageData,
      fabricJson,
      aspectRatio: aspectRatio.value,
      // Include custom canvas size for non-preset ratios (e.g., background image editing)
      ...(aspectRatio.value === 'custom' && customCanvasSize.value
        ? { canvasWidth: customCanvasSize.value.width, canvasHeight: customCanvasSize.value.height }
        : {}),
    }
  }

  /**
   * Load canvas from Fabric.js JSON (for continuing sketch editing)
   * @param {string} json - Fabric.js JSON string
   * @param {string} ratio - Aspect ratio when saved
   * @param {Object} options - Additional options
   * @param {number} options.canvasWidth - Custom canvas width (for 'custom' ratio)
   * @param {number} options.canvasHeight - Custom canvas height (for 'custom' ratio)
   * @param {boolean} options.skipSnapshot - Skip saving initial snapshot (when history exists)
   */
  const loadFromJson = async (json, ratio, options = {}) => {
    if (!fabricCanvas.value || !json) return false

    try {
      let targetWidth, targetHeight

      // Determine canvas dimensions
      if (ratio === 'custom' && options.canvasWidth && options.canvasHeight) {
        // Custom size from background image editing
        targetWidth = options.canvasWidth
        targetHeight = options.canvasHeight
        customCanvasSize.value = { width: targetWidth, height: targetHeight }
        aspectRatio.value = 'custom'
      } else if (ratio && CANVAS_SIZES[ratio]) {
        // Preset ratio
        targetWidth = CANVAS_SIZES[ratio].width
        targetHeight = CANVAS_SIZES[ratio].height
        aspectRatio.value = ratio
      } else {
        // Fallback: try to get size from JSON, or use default
        const jsonData = JSON.parse(json)
        targetWidth = jsonData.width || CANVAS_SIZES['1:1'].width
        targetHeight = jsonData.height || CANVAS_SIZES['1:1'].height
        aspectRatio.value = '1:1'
      }

      // Reset canvas state
      fabricCanvas.value.clear()
      fabricCanvas.value.setViewportTransform([1, 0, 0, 1, 0, 0])

      // Set canvas dimensions (internal only)
      fabricCanvas.value.setDimensions(
        { width: targetWidth, height: targetHeight },
        { backstoreOnly: true },
      )

      // Load the JSON
      await fabricCanvas.value.loadFromJSON(JSON.parse(json))
      fabricCanvas.value.renderAll()

      // Save initial state for history (skip if history already exists)
      if (!options.skipSnapshot) {
        historyManager?.saveSnapshot()
      }

      return true
    } catch (error) {
      console.error('Failed to load Fabric JSON:', error)
      return false
    }
  }

  /**
   * Load an image as background for drawing on top
   * Used when editing an uploaded image (not a sketch)
   * Uses original image dimensions instead of forcing preset ratios
   * @param {string} imageDataUrl - Image data URL to use as background
   * @param {Object} options - Additional options
   * @param {boolean} options.skipSnapshot - Skip saving initial snapshot (when history exists)
   */
  const loadImageAsBackground = async (imageDataUrl, options = {}) => {
    if (!fabricCanvas.value || !imageDataUrl) {
      throw new Error('Canvas or image data not available')
    }

    try {
      // Load image using Fabric.js v7 API
      const fabricImg = await FabricImage.fromURL(imageDataUrl)

      // Use original image dimensions (capped at reasonable max for performance)
      const maxDimension = 2048
      let imgWidth = fabricImg.width
      let imgHeight = fabricImg.height

      // Scale down if too large
      if (imgWidth > maxDimension || imgHeight > maxDimension) {
        const scale = maxDimension / Math.max(imgWidth, imgHeight)
        imgWidth = Math.round(imgWidth * scale)
        imgHeight = Math.round(imgHeight * scale)
      }

      // Store custom size and mark as custom aspect ratio BEFORE setDimensions
      // so that canvasSize computed updates correctly
      customCanvasSize.value = { width: imgWidth, height: imgHeight }
      aspectRatio.value = 'custom'

      // Reset canvas: clear all objects and reset viewport transform
      fabricCanvas.value.clear()
      fabricCanvas.value.setViewportTransform([1, 0, 0, 1, 0, 0])

      // Set canvas to match image dimensions (internal only, CSS handled separately)
      fabricCanvas.value.setDimensions(
        { width: imgWidth, height: imgHeight },
        { backstoreOnly: true },
      )

      // Configure background image position and scale
      fabricImg.set({
        left: 0,
        top: 0,
        originX: 'left',
        originY: 'top',
        scaleX: imgWidth / fabricImg.width,
        scaleY: imgHeight / fabricImg.height,
      })

      // Set as background image
      fabricCanvas.value.backgroundImage = fabricImg
      fabricCanvas.value.backgroundColor = '#FFFFFF'
      fabricCanvas.value.renderAll()

      // Save initial state for history (skip if history already exists)
      if (!options.skipSnapshot) {
        historyManager?.saveSnapshot()
      }

      return { width: imgWidth, height: imgHeight }
    } catch (error) {
      console.error('Failed to load image as background:', error)
      throw error
    }
  }

  /**
   * Get Fabric.js canvas instance (for history management)
   */
  const getFabricCanvas = () => fabricCanvas.value

  /**
   * Update display size for CSS scaling (fixes coordinate conversion)
   * Fabric.js needs to know the CSS size to correctly translate pointer events
   * @param {number} width - CSS width in pixels
   * @param {number} height - CSS height in pixels
   */
  const updateDisplaySize = (width, height) => {
    if (!fabricCanvas.value) return

    // Set CSS dimensions only - keeps internal resolution intact
    fabricCanvas.value.setDimensions({ width, height }, { cssOnly: true })
  }

  // ============================================================================
  // Zoom Controls
  // ============================================================================

  /**
   * Set zoom level
   * @param {number} level - Zoom level (0.25 to 4)
   */
  const setZoom = (level) => {
    zoomLevel.value = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, level))
  }

  /**
   * Zoom in by a step
   */
  const zoomIn = () => {
    setZoom(zoomLevel.value * 1.25)
  }

  /**
   * Zoom out by a step
   */
  const zoomOut = () => {
    setZoom(zoomLevel.value / 1.25)
  }

  /**
   * Reset zoom to 100%
   */
  const resetZoom = () => {
    zoomLevel.value = 1
  }

  // ============================================================================
  // Tool Settings
  // ============================================================================

  const setTool = (tool) => {
    if (!fabricCanvas.value) return

    if (tool === 'brush') {
      currentTool.value = 'brush'
      fabricCanvas.value.isDrawingMode = true
      // Restore saved color
      fabricCanvas.value.freeDrawingBrush.color = savedBrushColor
      strokeColor.value = savedBrushColor
    } else if (tool === 'eraser') {
      currentTool.value = 'eraser'
      fabricCanvas.value.isDrawingMode = true
      // Save current color and switch to white (simulated eraser)
      savedBrushColor = strokeColor.value
      fabricCanvas.value.freeDrawingBrush.color = '#FFFFFF'
    } else if (tool === 'pan') {
      currentTool.value = 'pan'
      // Disable drawing mode
      fabricCanvas.value.isDrawingMode = false
      // Skip target finding entirely - prevents any object selection/interaction
      fabricCanvas.value.skipTargetFind = true
      fabricCanvas.value.selection = false
    }

    // Re-enable target finding when not in pan mode
    if (tool !== 'pan' && fabricCanvas.value.skipTargetFind) {
      fabricCanvas.value.skipTargetFind = false
    }
  }

  const setColor = (color) => {
    strokeColor.value = color
    savedBrushColor = color

    if (fabricCanvas.value && currentTool.value === 'brush') {
      fabricCanvas.value.freeDrawingBrush.color = color
    }
  }

  const setLineWidth = (width) => {
    const clampedWidth = Math.max(1, Math.min(50, width))
    lineWidth.value = clampedWidth

    if (fabricCanvas.value) {
      fabricCanvas.value.freeDrawingBrush.width = clampedWidth
    }
  }

  const setAspectRatio = (ratio) => {
    if (!CANVAS_SIZES[ratio] || !fabricCanvas.value) return

    const newSize = CANVAS_SIZES[ratio]
    const oldSize = canvasSize.value

    // Calculate scale factors
    const scaleX = newSize.width / oldSize.width
    const scaleY = newSize.height / oldSize.height

    // Update aspect ratio and save to localStorage
    aspectRatio.value = ratio
    saveAspectRatio(ratio)

    // Resize canvas
    fabricCanvas.value.setDimensions({
      width: newSize.width,
      height: newSize.height,
    })

    // Scale all objects
    fabricCanvas.value.getObjects().forEach((obj) => {
      obj.scaleX *= scaleX
      obj.scaleY *= scaleY
      obj.left *= scaleX
      obj.top *= scaleY
      obj.setCoords()
    })

    fabricCanvas.value.renderAll()
    historyManager?.saveSnapshot()
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  const dispose = () => {
    if (fabricCanvas.value) {
      fabricCanvas.value.dispose()
      fabricCanvas.value = null
    }
  }

  onUnmounted(() => {
    dispose()
  })

  // ============================================================================
  // Return API
  // ============================================================================

  return {
    // State (reactive)
    currentTool,
    strokeColor,
    lineWidth,
    aspectRatio,
    isDrawing,
    zoomLevel,

    // Computed
    canvasSize,

    // Methods
    initCanvas,
    clearCanvas,
    toDataURL,
    getImageData,
    getImageDataWithJson,
    loadFromJson,
    loadImageAsBackground,
    getFabricCanvas,
    setTool,
    setColor,
    setLineWidth,
    setAspectRatio,
    updateDisplaySize,
    setZoom,
    zoomIn,
    zoomOut,
    resetZoom,
    dispose,
  }
}

// Export constants for external use
export const ASPECT_RATIOS = Object.keys(CANVAS_SIZES)
