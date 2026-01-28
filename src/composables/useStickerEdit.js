import { ref, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from '@/composables/useToast'

/**
 * Composable for sticker edit mode functionality
 * Handles flood-fill background removal, undo/redo, and magnifier
 */
export function useStickerEdit() {
  const { t } = useI18n()
  const toast = useToast()

  // Edit mode state
  const editingSticker = ref(null)
  const editCanvasRef = ref(null)
  const editTolerance = ref(30)
  const originalEditImageData = ref(null)
  const editHistory = ref([])
  const maxHistorySize = 20
  const editPreviewBgWhite = ref(false)
  const hasEditedBefore = ref(false)

  // Magnifier state
  const magnifierRef = ref(null)
  const showMagnifier = ref(false)
  const magnifierPos = ref({ x: 0, y: 0 })
  const magnifierCanvasPos = ref({ x: 0, y: 0 })

  /**
   * Open edit mode for a sticker
   * @param {Object} sticker - The sticker to edit
   * @param {Object} options - Options from parent (tolerance, previewBgWhite)
   */
  const openEditMode = (sticker, options = {}) => {
    editingSticker.value = { ...sticker }
    editHistory.value = []
    showMagnifier.value = false

    // First time entering edit mode: inherit settings from main panel
    // Subsequent times: preserve user's previous settings
    if (!hasEditedBefore.value) {
      editTolerance.value = options.tolerance ?? 30
      editPreviewBgWhite.value = options.previewBgWhite ?? false
      hasEditedBefore.value = true
    }

    nextTick(() => {
      const canvas = editCanvasRef.value
      if (!canvas) return
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      canvas.width = sticker.width
      canvas.height = sticker.height
      ctx.drawImage(sticker.canvas, 0, 0)
      // Store original for reset
      originalEditImageData.value = ctx.getImageData(0, 0, sticker.width, sticker.height)
    })
  }

  /**
   * Close edit mode without saving
   */
  const closeEditMode = () => {
    editingSticker.value = null
    originalEditImageData.value = null
    editHistory.value = []
    showMagnifier.value = false
    // Keep editTolerance and editPreviewBgWhite for next edit session
  }

  /**
   * Reset canvas to original state
   */
  const resetEdit = () => {
    if (!editCanvasRef.value || !originalEditImageData.value) return
    const ctx = editCanvasRef.value.getContext('2d')
    ctx.putImageData(originalEditImageData.value, 0, 0)
    editHistory.value = []
  }

  /**
   * Undo last edit action
   */
  const undoEdit = () => {
    if (editHistory.value.length === 0 || !editCanvasRef.value) return
    const lastState = editHistory.value.pop()
    const ctx = editCanvasRef.value.getContext('2d')
    ctx.putImageData(lastState, 0, 0)
    // Force reactivity
    editHistory.value = [...editHistory.value]
  }

  /**
   * Save current state to history for undo
   */
  const saveEditState = () => {
    if (!editCanvasRef.value || !editingSticker.value) return
    const ctx = editCanvasRef.value.getContext('2d', { willReadFrequently: true })
    const imageData = ctx.getImageData(0, 0, editingSticker.value.width, editingSticker.value.height)
    editHistory.value.push(imageData)
    // Limit history size
    if (editHistory.value.length > maxHistorySize) {
      editHistory.value.shift()
    }
  }

  /**
   * Flood fill to remove background from clicked point
   */
  const floodFillRemove = (data, width, height, startX, startY, targetColor, tolerance = 30) => {
    const tol = tolerance * 3
    const visited = new Uint8Array(width * height)
    const queue = []

    const matchesTarget = (idx) => {
      // Skip already transparent pixels
      if (data[idx + 3] === 0) return false
      const diff = Math.abs(data[idx] - targetColor.r) +
                   Math.abs(data[idx + 1] - targetColor.g) +
                   Math.abs(data[idx + 2] - targetColor.b)
      return diff <= tol
    }

    const startPos = startY * width + startX
    const startIdx = startPos * 4

    // Check if starting point is valid
    if (!matchesTarget(startIdx)) return 0

    queue.push(startPos)
    visited[startPos] = 1
    let removedCount = 0

    while (queue.length > 0) {
      const pos = queue.shift()
      const x = pos % width
      const y = Math.floor(pos / width)

      // Set to transparent
      data[pos * 4 + 3] = 0
      removedCount++

      // 8-connected neighbors (cardinal + diagonal)
      const neighbors = [
        { nx: x - 1, ny: y },
        { nx: x + 1, ny: y },
        { nx: x, ny: y - 1 },
        { nx: x, ny: y + 1 },
        { nx: x - 1, ny: y - 1 },
        { nx: x + 1, ny: y - 1 },
        { nx: x - 1, ny: y + 1 },
        { nx: x + 1, ny: y + 1 },
      ]

      for (const { nx, ny } of neighbors) {
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
        const nPos = ny * width + nx
        if (visited[nPos]) continue
        if (!matchesTarget(nPos * 4)) continue

        visited[nPos] = 1
        queue.push(nPos)
      }
    }

    return removedCount
  }

  /**
   * Calculate canvas position from event
   */
  const getCanvasPosition = (e, canvas) => {
    if (!editingSticker.value) return null

    const rect = canvas.getBoundingClientRect()
    const scaleX = editingSticker.value.width / rect.width
    const scaleY = editingSticker.value.height / rect.height

    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY

    const x = Math.floor((clientX - rect.left) * scaleX)
    const y = Math.floor((clientY - rect.top) * scaleY)

    return {
      x: Math.max(0, Math.min(editingSticker.value.width - 1, x)),
      y: Math.max(0, Math.min(editingSticker.value.height - 1, y)),
      clientX,
      clientY,
      rect,
    }
  }

  /**
   * Handle pointer down on edit canvas (start magnifier)
   */
  const handleEditPointerDown = (e) => {
    if (!editCanvasRef.value || !editingSticker.value) return

    const pos = getCanvasPosition(e, editCanvasRef.value)
    if (!pos) return

    magnifierCanvasPos.value = { x: pos.x, y: pos.y }

    // Position magnifier above cursor/finger
    magnifierPos.value = {
      x: pos.clientX,
      y: pos.clientY - 80,
    }
    showMagnifier.value = true

    // Update magnifier after it's visible
    nextTick(() => {
      updateMagnifier()
    })

    // Prevent default to avoid text selection
    e.preventDefault()
  }

  /**
   * Handle pointer move on edit canvas (update magnifier)
   */
  const handleEditPointerMove = (e) => {
    if (!showMagnifier.value || !editCanvasRef.value || !editingSticker.value) return

    const pos = getCanvasPosition(e, editCanvasRef.value)
    if (!pos) return

    magnifierCanvasPos.value = { x: pos.x, y: pos.y }
    magnifierPos.value = {
      x: pos.clientX,
      y: pos.clientY - 80,
    }

    // Update magnifier canvas
    updateMagnifier()

    e.preventDefault()
  }

  /**
   * Handle pointer up on edit canvas (perform flood fill)
   */
  const handleEditPointerUp = (e) => {
    if (!showMagnifier.value) return
    if (!editCanvasRef.value || !editingSticker.value) return

    showMagnifier.value = false

    // Get position from touch or mouse event
    const eventObj = e.changedTouches ? e.changedTouches[0] : e
    const pos = getCanvasPosition(eventObj, editCanvasRef.value)
    if (!pos) return

    performFloodFill(pos.x, pos.y)
  }

  /**
   * Update magnifier canvas content
   */
  const updateMagnifier = () => {
    if (!magnifierRef.value || !editCanvasRef.value || !editingSticker.value) return

    const magCanvas = magnifierRef.value
    const magCtx = magCanvas.getContext('2d')
    const srcCanvas = editCanvasRef.value

    const size = 100
    const zoom = 4
    const srcSize = size / zoom

    magCanvas.width = size
    magCanvas.height = size

    // Clear with checkerboard
    magCtx.fillStyle = '#1a1a1f'
    magCtx.fillRect(0, 0, size, size)
    for (let i = 0; i < size; i += 10) {
      for (let j = 0; j < size; j += 10) {
        if ((i + j) % 20 === 0) {
          magCtx.fillStyle = '#252530'
          magCtx.fillRect(i, j, 10, 10)
        }
      }
    }

    // Draw zoomed portion
    const srcX = magnifierCanvasPos.value.x - srcSize / 2
    const srcY = magnifierCanvasPos.value.y - srcSize / 2

    magCtx.imageSmoothingEnabled = false
    magCtx.drawImage(
      srcCanvas,
      srcX, srcY, srcSize, srcSize,
      0, 0, size, size
    )

    // Draw crosshair
    magCtx.strokeStyle = 'rgba(139, 92, 246, 0.8)'
    magCtx.lineWidth = 1
    magCtx.beginPath()
    magCtx.moveTo(size / 2, 0)
    magCtx.lineTo(size / 2, size)
    magCtx.moveTo(0, size / 2)
    magCtx.lineTo(size, size / 2)
    magCtx.stroke()
  }

  /**
   * Perform flood fill at given position
   */
  const performFloodFill = (x, y) => {
    if (!editCanvasRef.value || !editingSticker.value) return

    const canvas = editCanvasRef.value
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const imageData = ctx.getImageData(0, 0, editingSticker.value.width, editingSticker.value.height)

    // Get clicked pixel color
    const clickedIdx = (y * editingSticker.value.width + x) * 4
    const targetColor = {
      r: imageData.data[clickedIdx],
      g: imageData.data[clickedIdx + 1],
      b: imageData.data[clickedIdx + 2],
    }

    // Check if already transparent
    if (imageData.data[clickedIdx + 3] === 0) {
      toast.info(t('stickerCropper.edit.alreadyTransparent'))
      return
    }

    // Save state before modification for undo
    saveEditState()

    // Perform flood fill
    const removedCount = floodFillRemove(
      imageData.data,
      editingSticker.value.width,
      editingSticker.value.height,
      x,
      y,
      targetColor,
      editTolerance.value
    )

    if (removedCount > 0) {
      ctx.putImageData(imageData, 0, 0)
      toast.success(t('stickerCropper.edit.removed', { count: removedCount }))
    }
  }

  /**
   * Apply edits and update sticker
   * @param {Array} croppedStickers - The stickers array to update
   * @param {boolean} previewBgWhite - Whether to use white background for preview
   * @returns {boolean} Success
   */
  const applyEdit = (croppedStickers, previewBgWhite) => {
    if (!editCanvasRef.value || !editingSticker.value) return false

    const sticker = croppedStickers.find(s => s.id === editingSticker.value.id)
    if (!sticker) return false

    const editCanvas = editCanvasRef.value

    // Update transparent background dataUrl
    sticker.dataUrl = editCanvas.toDataURL('image/png')

    // Create new canvas for sticker.canvas
    const newCanvas = document.createElement('canvas')
    newCanvas.width = sticker.width
    newCanvas.height = sticker.height
    const newCtx = newCanvas.getContext('2d')
    newCtx.drawImage(editCanvas, 0, 0)
    sticker.canvas = newCanvas

    // Update previewDataUrl based on current preview background setting
    const previewCanvas = document.createElement('canvas')
    previewCanvas.width = sticker.width
    previewCanvas.height = sticker.height
    const previewCtx = previewCanvas.getContext('2d')

    if (previewBgWhite) {
      previewCtx.fillStyle = '#ffffff'
      previewCtx.fillRect(0, 0, sticker.width, sticker.height)
    }
    previewCtx.drawImage(editCanvas, 0, 0)
    sticker.previewDataUrl = previewCanvas.toDataURL('image/png')

    toast.success(t('stickerCropper.edit.applied'))
    closeEditMode()
    return true
  }

  /**
   * Reset edit state (called when parent closes)
   */
  const resetEditState = () => {
    editingSticker.value = null
    originalEditImageData.value = null
    editHistory.value = []
    editPreviewBgWhite.value = false
    hasEditedBefore.value = false
    showMagnifier.value = false
  }

  return {
    // State
    editingSticker,
    editCanvasRef,
    editTolerance,
    editHistory,
    editPreviewBgWhite,

    // Magnifier state
    magnifierRef,
    showMagnifier,
    magnifierPos,

    // Methods
    openEditMode,
    closeEditMode,
    resetEdit,
    undoEdit,
    applyEdit,
    resetEditState,

    // Event handlers
    handleEditPointerDown,
    handleEditPointerMove,
    handleEditPointerUp,
  }
}
