<script setup>
import { ref, onMounted, onUnmounted, nextTick, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGeneratorStore } from '@/stores/generator'
import { useSketchCanvas, ASPECT_RATIOS } from '@/composables/useSketchCanvas'
import { useSketchHistory } from '@/composables/useSketchHistory'
import { useToolbarDrag } from '@/composables/useToolbarDrag'
import ConfirmModal from '@/components/ConfirmModal.vue'
import { Swatches } from '@lk77/vue3-color'

const { t } = useI18n()
const store = useGeneratorStore()

const props = defineProps({
  // Edit mode: 'fabric' = continue editing strokes, 'background' = image as background
  editMode: {
    type: String,
    default: null,
    validator: (value) => [null, 'fabric', 'background'].includes(value),
  },
  // Image data for editing (used with editMode)
  editImageData: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(['save', 'close'])

// Refs
const canvasRef = ref(null)
const toolbarRef = ref(null)
const confirmModalRef = ref(null)
const canvasContainerRef = ref(null)
const scrollContainerRef = ref(null)

// Initialize history manager first (needs getFabricCanvas function)
const historyManager = useSketchHistory({
  getFabricCanvas: () => sketchCanvas.getFabricCanvas(),
})

// Initialize sketch canvas with history manager
const sketchCanvas = useSketchCanvas({
  canvasRef,
  historyManager,
})

// Toolbar drag functionality
const { toolbarPos, onToolbarMouseDown, onToolbarTouchStart } = useToolbarDrag({
  toolbarRef,
})

// Override toolbar initial position (centered between top and canvas)
const initToolbarPosition = () => {
  if (toolbarRef.value) {
    const rect = toolbarRef.value.getBoundingClientRect()
    const canvasMarginTop = 64 // mt-16 = 4rem = 64px
    // Center toolbar between top (0) and canvas top (64px)
    const toolbarY = (canvasMarginTop - rect.height) / 2
    toolbarPos.value = {
      x: (window.innerWidth - rect.width) / 2,
      y: Math.max(8, toolbarY), // At least 8px from top
    }
  }
}

// UI State
const showSizePicker = ref(false)
const showRatioPicker = ref(false)
const showColorPicker = ref(false)

// Pan state
const isPanning = ref(false)
const panStartPos = ref({ x: 0, y: 0 })
const panStartScroll = ref({ left: 0, top: 0 })

// Pan event handlers
const onPanStart = (clientX, clientY) => {
  if (sketchCanvas.currentTool.value !== 'pan') return
  if (!scrollContainerRef.value) return

  isPanning.value = true
  panStartPos.value = { x: clientX, y: clientY }
  panStartScroll.value = {
    left: scrollContainerRef.value.scrollLeft,
    top: scrollContainerRef.value.scrollTop,
  }
}

const onPanMove = (clientX, clientY) => {
  if (!isPanning.value || !scrollContainerRef.value) return

  const deltaX = panStartPos.value.x - clientX
  const deltaY = panStartPos.value.y - clientY

  scrollContainerRef.value.scrollLeft = panStartScroll.value.left + deltaX
  scrollContainerRef.value.scrollTop = panStartScroll.value.top + deltaY
}

const onPanEnd = () => {
  isPanning.value = false
}

// Mouse handlers for pan
const onCanvasMouseDown = (e) => {
  onPanStart(e.clientX, e.clientY)
}

const onCanvasMouseMove = (e) => {
  onPanMove(e.clientX, e.clientY)
}

const onCanvasMouseUp = () => {
  onPanEnd()
}

// Touch handlers for pan
const onCanvasTouchStart = (e) => {
  if (e.touches.length === 1) {
    const touch = e.touches[0]
    onPanStart(touch.clientX, touch.clientY)
  }
}

const onCanvasTouchMove = (e) => {
  if (e.touches.length === 1 && isPanning.value) {
    e.preventDefault() // Prevent page scroll
    const touch = e.touches[0]
    onPanMove(touch.clientX, touch.clientY)
  }
}

const onCanvasTouchEnd = () => {
  onPanEnd()
}

// Preset line widths
const LINE_WIDTHS = [2, 5, 10, 15, 20, 30, 40, 50]

// Color swatches configuration - organized rows for mobile-friendly display
const colorSwatches = [
  // Row 1: Basics
  ['#000000', '#434343', '#666666', '#999999', '#CCCCCC', '#FFFFFF'],
  // Row 2: Warm colors
  ['#FF0000', '#FF6B6B', '#FF9500', '#FFB84D', '#FFCC00', '#FFE066'],
  // Row 3: Cool colors
  ['#00C853', '#69F0AE', '#00BCD4', '#80DEEA', '#2196F3', '#90CAF9'],
  // Row 4: Purple & Pink
  ['#9C27B0', '#CE93D8', '#E91E63', '#F48FB1', '#795548', '#BCAAA4'],
]

// Track if canvas has been modified
const hasDrawn = computed(() => historyManager.canUndo.value)

// Computed base scale to fit canvas within viewport
const baseScale = computed(() => {
  const { width, height } = sketchCanvas.canvasSize.value
  const maxWidth = window.innerWidth - 32 // 16px padding on each side
  const maxHeight = window.innerHeight - 100 // Space for toolbar + mt-16

  const scaleX = maxWidth / width
  const scaleY = maxHeight / height
  return Math.min(scaleX, scaleY, 1) // Don't scale up beyond 1
})

// Computed display size for canvas (considers zoom)
const displaySize = computed(() => {
  const { width, height } = sketchCanvas.canvasSize.value
  const zoom = sketchCanvas.zoomLevel.value
  const scale = baseScale.value * zoom

  return {
    width: Math.floor(width * scale),
    height: Math.floor(height * scale),
  }
})

// Computed viewport max size (for scroll container)
const viewportMaxSize = computed(() => {
  return {
    width: window.innerWidth - 32, // 16px padding on each side
    height: window.innerHeight - 100, // Space for toolbar + mt-16
  }
})

// Keyboard shortcuts
const handleKeyDown = (e) => {
  // Don't handle if modal is open
  if (confirmModalRef.value?.isOpen) return

  // Ctrl/Cmd + Z = Undo
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault()
    historyManager.undo()
  }
  // Ctrl/Cmd + Shift + Z = Redo
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
    e.preventDefault()
    historyManager.redo()
  }
  // B = Brush
  if (e.key === 'b' || e.key === 'B') {
    sketchCanvas.setTool('brush')
  }
  // E = Eraser
  if (e.key === 'e' || e.key === 'E') {
    sketchCanvas.setTool('eraser')
  }
  // Escape = Cancel (with confirmation)
  if (e.key === 'Escape') {
    handleCancel()
  }
  // Enter = Save
  if (e.key === 'Enter') {
    handleSave()
  }
}

// Actions
const handleSave = () => {
  // Use getImageDataWithJson to preserve Fabric JSON for later editing
  const imageData = sketchCanvas.getImageDataWithJson()
  if (imageData) {
    emit('save', imageData)
  }
  emit('close')
}

const handleCancel = async () => {
  // If user has drawn something, confirm before closing
  if (hasDrawn.value) {
    const confirmed = await confirmModalRef.value.show({
      title: t('sketch.cancelConfirmTitle'),
      message: t('sketch.cancelConfirmMessage'),
      confirmText: t('sketch.discard'),
      cancelText: t('sketch.keepEditing'),
    })

    if (!confirmed) return
  }

  emit('close')
}

const handleClear = async () => {
  const confirmed = await confirmModalRef.value.show({
    title: t('sketch.clearConfirmTitle'),
    message: t('sketch.clearConfirmMessage'),
    confirmText: t('common.clear'),
    cancelText: t('common.cancel'),
  })

  if (confirmed) {
    sketchCanvas.clearCanvas()
  }
}

const handleColorSelect = (color) => {
  // Handle color from Swatches picker (object with hex property)
  const colorValue = typeof color === 'object' && color.hex ? color.hex : color
  sketchCanvas.setColor(colorValue)
  showColorPicker.value = false
}

const handleSizeSelect = (size) => {
  sketchCanvas.setLineWidth(size)
  showSizePicker.value = false
}

const handleRatioSelect = (ratio) => {
  sketchCanvas.setAspectRatio(ratio)
  showRatioPicker.value = false
}

// Close dropdowns when clicking outside
const handleOverlayClick = (e) => {
  if (e.target === e.currentTarget) {
    showSizePicker.value = false
    showRatioPicker.value = false
    showColorPicker.value = false
  }
}

// Lifecycle
onMounted(async () => {
  await nextTick()

  // Skip initial snapshot if we're going to load content (edit mode)
  const isEditMode = props.editMode && props.editImageData
  sketchCanvas.initCanvas({ skipInitialSnapshot: isEditMode })

  // Apply CSS display size for correct coordinate transformation
  sketchCanvas.updateDisplaySize(displaySize.value.width, displaySize.value.height)

  // Load edit data if in edit mode
  if (isEditMode) {
    // Skip snapshot if history already exists (resuming previous edit session)
    const skipSnapshot = store.hasSketchHistory

    if (props.editMode === 'fabric' && props.editImageData.fabricJson) {
      // Continue editing strokes from Fabric JSON
      await sketchCanvas.loadFromJson(
        props.editImageData.fabricJson,
        props.editImageData.aspectRatio,
        {
          canvasWidth: props.editImageData.canvasWidth,
          canvasHeight: props.editImageData.canvasHeight,
          skipSnapshot,
        },
      )
      // Re-apply display size after loading
      await nextTick()
      sketchCanvas.updateDisplaySize(displaySize.value.width, displaySize.value.height)
    } else if (props.editMode === 'background' && props.editImageData.preview) {
      // Load image as background for drawing on top
      await sketchCanvas.loadImageAsBackground(props.editImageData.preview, { skipSnapshot })
      // Re-apply display size after loading
      await nextTick()
      sketchCanvas.updateDisplaySize(displaySize.value.width, displaySize.value.height)
    }
  }

  initToolbarPosition()
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('resize', handleResize)
})

// Watch for display size changes (window resize, aspect ratio change)
watch(
  displaySize,
  (newSize) => {
    sketchCanvas.updateDisplaySize(newSize.width, newSize.height)
  },
  { deep: true },
)

// Handle window resize
const handleResize = () => {
  // displaySize is a computed property that will automatically recalculate
  // The watch above will call updateDisplaySize
}

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('resize', handleResize)
})
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[10001] flex items-center justify-center bg-bg-overlay backdrop-blur-sm"
      @click="handleOverlayClick"
    >
      <!-- Floating Toolbar -->
      <div
        ref="toolbarRef"
        class="fixed z-[10002] flex flex-wrap items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 rounded-xl glass-strong shadow-lg cursor-move select-none max-w-[95vw]"
        :style="{ left: `${toolbarPos.x}px`, top: `${toolbarPos.y}px` }"
        @mousedown="onToolbarMouseDown"
        @touchstart="onToolbarTouchStart"
      >
        <!-- Save Button -->
        <button
          @click="handleSave"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-mode-generate text-text-on-brand text-sm font-medium hover:opacity-90 transition-opacity"
          :title="t('sketch.save')"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
          <span class="hidden sm:inline">{{ t('sketch.save') }}</span>
        </button>

        <div class="w-px h-6 bg-border-muted mx-1"></div>

        <!-- Undo/Redo -->
        <button
          @click="historyManager.undo()"
          :disabled="!historyManager.canUndo.value"
          class="p-1.5 rounded-lg transition-colors"
          :class="historyManager.canUndo.value ? 'hover:bg-bg-interactive text-text-secondary' : 'text-text-muted opacity-50 cursor-not-allowed'"
          :title="t('sketch.undo')"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
        </button>
        <button
          @click="historyManager.redo()"
          :disabled="!historyManager.canRedo.value"
          class="p-1.5 rounded-lg transition-colors"
          :class="historyManager.canRedo.value ? 'hover:bg-bg-interactive text-text-secondary' : 'text-text-muted opacity-50 cursor-not-allowed'"
          :title="t('sketch.redo')"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
          </svg>
        </button>

        <div class="w-px h-6 bg-border-muted mx-1"></div>

        <!-- Brush/Eraser/Pan -->
        <button
          @click="sketchCanvas.setTool('brush')"
          class="p-1.5 rounded-lg transition-colors"
          :class="sketchCanvas.currentTool.value === 'brush' ? 'bg-mode-generate-muted text-mode-generate' : 'hover:bg-bg-interactive text-text-secondary'"
          :title="t('sketch.brush')"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>
        <button
          @click="sketchCanvas.setTool('eraser')"
          class="p-1.5 rounded-lg transition-colors"
          :class="sketchCanvas.currentTool.value === 'eraser' ? 'bg-mode-generate-muted text-mode-generate' : 'hover:bg-bg-interactive text-text-secondary'"
          :title="t('sketch.eraser')"
        >
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M16.24 3.56l4.95 4.94c.78.79.78 2.05 0 2.84L12 20.53a4.008 4.008 0 01-5.66 0L2.81 17c-.78-.79-.78-2.05 0-2.84l10.6-10.6c.79-.78 2.05-.78 2.83 0M4.22 15.58l3.54 3.53c.78.79 2.04.79 2.83 0l3.53-3.53-4.95-4.95-4.95 4.95z" />
          </svg>
        </button>
        <button
          @click="sketchCanvas.setTool('pan')"
          class="p-1.5 rounded-lg transition-colors"
          :class="sketchCanvas.currentTool.value === 'pan' ? 'bg-mode-generate-muted text-mode-generate' : 'hover:bg-bg-interactive text-text-secondary'"
          :title="t('sketch.pan')"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
          </svg>
        </button>

        <div class="w-px h-6 bg-border-muted mx-1"></div>

        <!-- Color Picker Button -->
        <div class="relative">
          <button
            @click.stop="showColorPicker = !showColorPicker; showSizePicker = false; showRatioPicker = false"
            class="w-8 h-8 rounded-lg border-2 transition-transform hover:scale-105"
            :class="showColorPicker ? 'ring-2 ring-mode-generate ring-offset-1 ring-offset-bg-elevated' : 'border-border-muted'"
            :style="{ backgroundColor: sketchCanvas.strokeColor.value }"
            :title="t('sketch.color')"
          ></button>
          <!-- Color picker dropdown -->
          <div
            v-if="showColorPicker"
            class="absolute top-full left-1/2 -translate-x-1/2 mt-2 p-3 rounded-xl glass-strong shadow-lg z-10"
            @click.stop
            @touchstart.stop
            @touchmove.stop
          >
            <Swatches
              :model-value="{ hex: sketchCanvas.strokeColor.value }"
              @update:model-value="handleColorSelect"
              :swatches="colorSwatches"
            />
            <!-- Custom color input fallback -->
            <div class="mt-2 pt-2 border-t border-border-muted">
              <label class="flex items-center gap-2 text-xs text-text-muted">
                <span>{{ t('sketch.customColor') }}:</span>
                <input
                  type="color"
                  :value="sketchCanvas.strokeColor.value"
                  @input="handleColorSelect($event.target.value)"
                  class="w-6 h-6 rounded cursor-pointer"
                />
              </label>
            </div>
          </div>
        </div>

        <div class="w-px h-6 bg-border-muted mx-1"></div>

        <!-- Line Width Dropdown -->
        <div class="relative">
          <button
            @click.stop="showSizePicker = !showSizePicker; showRatioPicker = false"
            class="flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-bg-interactive text-sm text-text-secondary transition-colors"
            :title="t('sketch.lineWidth')"
          >
            <span class="w-6 text-center">{{ sketchCanvas.lineWidth.value }}</span>
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <!-- Size dropdown -->
          <div
            v-if="showSizePicker"
            class="absolute top-full left-0 mt-2 py-1 rounded-lg glass-strong shadow-lg min-w-[80px]"
            @touchstart.stop
            @touchmove.stop
          >
            <!-- Header -->
            <div class="px-3 py-1.5 text-xs text-text-muted border-b border-border-muted mb-1">
              {{ t('sketch.lineWidth') }}
            </div>
            <button
              v-for="size in LINE_WIDTHS"
              :key="size"
              @click="handleSizeSelect(size)"
              class="w-full px-3 py-1.5 text-center text-sm transition-colors"
              :class="sketchCanvas.lineWidth.value === size ? 'bg-mode-generate-muted text-mode-generate' : 'text-text-secondary hover:bg-bg-interactive'"
            >
              {{ size }} px
            </button>
          </div>
        </div>

        <!-- Aspect Ratio Picker (hidden when custom) -->
        <div v-if="sketchCanvas.aspectRatio.value !== 'custom'" class="relative">
          <button
            @click.stop="showRatioPicker = !showRatioPicker; showSizePicker = false"
            class="flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-bg-interactive text-sm text-text-secondary transition-colors"
            :title="t('sketch.aspectRatio')"
          >
            <span>{{ sketchCanvas.aspectRatio.value }}</span>
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <!-- Ratio dropdown -->
          <div
            v-if="showRatioPicker"
            class="absolute top-full left-0 mt-2 py-1 rounded-lg glass-strong shadow-lg min-w-[80px]"
            @touchstart.stop
            @touchmove.stop
          >
            <button
              v-for="ratio in ASPECT_RATIOS"
              :key="ratio"
              @click="handleRatioSelect(ratio)"
              class="w-full px-3 py-1.5 text-left text-sm transition-colors"
              :class="sketchCanvas.aspectRatio.value === ratio ? 'bg-mode-generate-muted text-mode-generate' : 'text-text-secondary hover:bg-bg-interactive'"
            >
              {{ ratio }}
            </button>
          </div>
        </div>

        <div class="w-px h-6 bg-border-muted mx-1"></div>

        <!-- Zoom Controls -->
        <div class="flex items-center gap-1">
          <button
            @click="sketchCanvas.zoomOut()"
            class="p-1.5 rounded-lg hover:bg-bg-interactive text-text-secondary transition-colors"
            :title="t('sketch.zoomOut')"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
            </svg>
          </button>
          <button
            @click="sketchCanvas.resetZoom()"
            class="px-1.5 py-0.5 rounded text-xs text-text-secondary hover:bg-bg-interactive transition-colors min-w-[40px] text-center"
            :title="t('sketch.resetZoom')"
          >
            {{ Math.round(sketchCanvas.zoomLevel.value * 100) }}%
          </button>
          <button
            @click="sketchCanvas.zoomIn()"
            class="p-1.5 rounded-lg hover:bg-bg-interactive text-text-secondary transition-colors"
            :title="t('sketch.zoomIn')"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
            </svg>
          </button>
        </div>

        <!-- Clear -->
        <button
          @click="handleClear"
          class="p-1.5 rounded-lg hover:bg-bg-interactive text-text-secondary transition-colors"
          :title="t('sketch.clear')"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>

        <!-- Cancel -->
        <button
          @click="handleCancel"
          class="p-1.5 rounded-lg hover:bg-bg-interactive text-text-secondary transition-colors"
          :title="t('common.cancel')"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Canvas Scroll Container (enables panning when zoomed in) -->
      <div
        ref="scrollContainerRef"
        class="canvas-scroll-container relative rounded-lg shadow-2xl mt-16"
        :class="{ 'cursor-grab': sketchCanvas.currentTool.value === 'pan', 'cursor-grabbing': isPanning }"
        :style="{
          maxWidth: `${viewportMaxSize.width}px`,
          maxHeight: `${viewportMaxSize.height}px`,
        }"
        @mousedown="onCanvasMouseDown"
        @mousemove="onCanvasMouseMove"
        @mouseup="onCanvasMouseUp"
        @mouseleave="onCanvasMouseUp"
        @touchstart="onCanvasTouchStart"
        @touchmove="onCanvasTouchMove"
        @touchend="onCanvasTouchEnd"
      >
        <div
          ref="canvasContainerRef"
          class="bg-white"
          :style="{ width: `${displaySize.width}px`, height: `${displaySize.height}px` }"
        >
          <canvas
            ref="canvasRef"
            :style="{ touchAction: 'none' }"
          ></canvas>
        </div>
      </div>

      <!-- Confirm Modal -->
      <ConfirmModal ref="confirmModalRef" />
    </div>
  </Teleport>
</template>

<style scoped>
/* Canvas scroll container - enables panning when zoomed in */
.canvas-scroll-container {
  overflow: auto;
  /* Use touch-pan for smooth scrolling on mobile */
  overscroll-behavior: contain;
  /* Hide scrollbar but keep functionality (optional, can be removed if you want visible scrollbar) */
  scrollbar-width: thin;
  scrollbar-color: rgba(128, 128, 128, 0.3) transparent;
}

.canvas-scroll-container::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.canvas-scroll-container::-webkit-scrollbar-track {
  background: transparent;
}

.canvas-scroll-container::-webkit-scrollbar-thumb {
  background: rgba(128, 128, 128, 0.3);
  border-radius: 3px;
}

.canvas-scroll-container::-webkit-scrollbar-thumb:hover {
  background: rgba(128, 128, 128, 0.5);
}
</style>
