/**
 * Sketch Canvas composable using Fabric.js
 *
 * Provides free drawing functionality with brush and eraser tools.
 * Uses Fabric.js for better drawing experience and future extensibility.
 */

import { ref, computed, shallowRef, onUnmounted } from 'vue'
import { Canvas, PencilBrush } from 'fabric'

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
  const currentTool = ref('brush') // 'brush' | 'eraser'
  const strokeColor = ref('#000000')
  const lineWidth = ref(5)
  const aspectRatio = ref(getSavedAspectRatio())
  const isDrawing = ref(false)

  // Fabric.js canvas instance (use shallowRef to avoid deep reactivity)
  const fabricCanvas = shallowRef(null)

  // Store original brush color when switching to eraser
  let savedBrushColor = '#000000'

  // ============================================================================
  // Computed
  // ============================================================================
  const canvasSize = computed(() => CANVAS_SIZES[aspectRatio.value] || CANVAS_SIZES['1:1'])

  // ============================================================================
  // Canvas Setup
  // ============================================================================

  /**
   * Initialize Fabric.js canvas with white background
   */
  const initCanvas = () => {
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

    // Save initial state
    historyManager?.saveSnapshot()
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
   * Get Fabric.js canvas instance (for history management)
   */
  const getFabricCanvas = () => fabricCanvas.value

  // ============================================================================
  // Tool Settings
  // ============================================================================

  const setTool = (tool) => {
    if (!fabricCanvas.value) return

    if (tool === 'brush') {
      currentTool.value = 'brush'
      // Restore saved color
      fabricCanvas.value.freeDrawingBrush.color = savedBrushColor
      strokeColor.value = savedBrushColor
    } else if (tool === 'eraser') {
      currentTool.value = 'eraser'
      // Save current color and switch to white (simulated eraser)
      savedBrushColor = strokeColor.value
      fabricCanvas.value.freeDrawingBrush.color = '#FFFFFF'
      strokeColor.value = '#FFFFFF'
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

    // Computed
    canvasSize,

    // Methods
    initCanvas,
    clearCanvas,
    toDataURL,
    getImageData,
    getFabricCanvas,
    setTool,
    setColor,
    setLineWidth,
    setAspectRatio,
    dispose,
  }
}

// Export constants for external use
export const ASPECT_RATIOS = Object.keys(CANVAS_SIZES)
