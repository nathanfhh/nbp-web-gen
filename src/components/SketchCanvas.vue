<script setup>
import { ref, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSketchCanvas, SKETCH_COLORS, ASPECT_RATIOS } from '@/composables/useSketchCanvas'
import { useSketchHistory } from '@/composables/useSketchHistory'
import { useToolbarDrag } from '@/composables/useToolbarDrag'
import ConfirmModal from '@/components/ConfirmModal.vue'

const { t } = useI18n()

const emit = defineEmits(['save', 'close'])

// Refs
const canvasRef = ref(null)
const toolbarRef = ref(null)
const confirmModalRef = ref(null)
const canvasContainerRef = ref(null)

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

// Preset line widths
const LINE_WIDTHS = [2, 5, 10, 15, 20, 30, 40, 50]

// Track if canvas has been modified
const hasDrawn = computed(() => historyManager.canUndo.value)

// Computed display size for canvas (fit within viewport)
const displaySize = computed(() => {
  const { width, height } = sketchCanvas.canvasSize.value
  const maxWidth = window.innerWidth - 32 // 16px padding on each side
  const maxHeight = window.innerHeight - 100 // Space for toolbar + mt-16

  const scaleX = maxWidth / width
  const scaleY = maxHeight / height
  const scale = Math.min(scaleX, scaleY, 1) // Don't scale up

  return {
    width: Math.floor(width * scale),
    height: Math.floor(height * scale),
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
  const imageData = sketchCanvas.getImageData()
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
  sketchCanvas.setColor(color)
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
  }
}

// Lifecycle
onMounted(async () => {
  await nextTick()
  sketchCanvas.initCanvas()
  initToolbarPosition()
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
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

        <!-- Brush/Eraser -->
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

        <div class="w-px h-6 bg-border-muted mx-1"></div>

        <!-- Color Palette (inline) -->
        <div class="flex items-center gap-0.5">
          <button
            v-for="color in SKETCH_COLORS"
            :key="color"
            @click="handleColorSelect(color)"
            class="w-6 h-6 rounded transition-transform hover:scale-110 border"
            :class="sketchCanvas.strokeColor.value === color ? 'ring-2 ring-mode-generate ring-offset-1 ring-offset-bg-elevated' : 'border-border-muted'"
            :style="{ backgroundColor: color }"
            :title="t('sketch.color')"
          ></button>
          <!-- Custom color picker -->
          <label
            class="w-6 h-6 rounded border border-border-muted cursor-pointer transition-transform hover:scale-110 flex items-center justify-center overflow-hidden relative"
            :title="t('sketch.customColor')"
          >
            <svg class="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
            </svg>
            <input
              type="color"
              :value="sketchCanvas.strokeColor.value"
              @input="handleColorSelect($event.target.value)"
              class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </label>
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
            class="absolute top-full left-0 mt-2 py-1 rounded-lg glass-strong shadow-lg min-w-[60px]"
          >
            <button
              v-for="size in LINE_WIDTHS"
              :key="size"
              @click="handleSizeSelect(size)"
              class="w-full px-3 py-1.5 text-center text-sm transition-colors"
              :class="sketchCanvas.lineWidth.value === size ? 'bg-mode-generate-muted text-mode-generate' : 'text-text-secondary hover:bg-bg-interactive'"
            >
              {{ size }}
            </button>
          </div>
        </div>

        <!-- Aspect Ratio Picker -->
        <div class="relative">
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

      <!-- Canvas Container -->
      <div
        ref="canvasContainerRef"
        class="relative rounded-lg overflow-hidden shadow-2xl bg-white mt-16"
        :style="{ width: `${displaySize.width}px`, height: `${displaySize.height}px` }"
      >
        <canvas
          ref="canvasRef"
          class="w-full h-full"
          :style="{ touchAction: 'none' }"
        ></canvas>
      </div>

      <!-- Confirm Modal -->
      <ConfirmModal ref="confirmModalRef" />
    </div>
  </Teleport>
</template>
