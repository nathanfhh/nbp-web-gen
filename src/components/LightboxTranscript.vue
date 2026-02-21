<script setup>
import { computed, watch, ref, nextTick, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { parseTranscript } from '@/utils/transcript-parser'

const { t } = useI18n()

const props = defineProps({
  script: {
    type: String,
    default: '',
  },
  speakers: {
    type: Array,
    default: () => [],
  },
  speakerMode: {
    type: String,
    default: 'single',
  },
  visible: {
    type: Boolean,
    default: false,
  },
})

const contentRef = ref(null)
const panelRef = ref(null)

const segments = computed(() => {
  return parseTranscript(props.script, props.speakers, props.speakerMode)
})

// Speaker color mapping (fixed palette for lightbox dark bg)
const speakerColors = {
  0: 'rgba(96, 165, 250, 0.85)',  // blue
  1: 'rgba(251, 146, 60, 0.85)',  // orange
}

const getSpeakerColor = (speakerName) => {
  if (!speakerName || !props.speakers?.length) return null
  const idx = props.speakers.findIndex((s) => s.name === speakerName)
  return speakerColors[idx] || speakerColors[0]
}

// Scroll to top when script changes (page navigation)
watch(() => props.script, () => {
  if (contentRef.value) {
    contentRef.value.scrollTop = 0
  }
})

// --- Resize functionality ---
const customWidth = ref(null)
const customMaxHeight = ref(null)
const isResizing = ref(false)
let resizeStart = { x: 0, y: 0, width: 0, height: 0 }

// Load persisted size
const savedW = localStorage.getItem('nbp-transcript-width')
const savedH = localStorage.getItem('nbp-transcript-max-height')
if (savedW) customWidth.value = parseInt(savedW)
if (savedH) customMaxHeight.value = parseInt(savedH)

const clampSize = (w, h) => ({
  width: Math.max(280, Math.min(window.innerWidth * 0.9, w)),
  height: Math.max(120, Math.min(window.innerHeight * 0.7, h)),
})

const persistSize = () => {
  if (customWidth.value) localStorage.setItem('nbp-transcript-width', String(customWidth.value))
  if (customMaxHeight.value) localStorage.setItem('nbp-transcript-max-height', String(customMaxHeight.value))
}

const startResize = (clientX, clientY) => {
  if (!panelRef.value) return
  isResizing.value = true
  const rect = panelRef.value.getBoundingClientRect()
  resizeStart = { x: clientX, y: clientY, width: rect.width, height: rect.height }
}

const updateResize = (clientX, clientY) => {
  if (!isResizing.value) return
  const dx = clientX - resizeStart.x
  const dy = clientY - resizeStart.y
  const { width, height } = clampSize(resizeStart.width + dx, resizeStart.height - dy)
  customWidth.value = Math.round(width)
  customMaxHeight.value = Math.round(height)
}

const endResize = () => {
  if (!isResizing.value) return
  isResizing.value = false
  persistSize()
}

// Mouse resize
const onResizeMouseMove = (e) => updateResize(e.clientX, e.clientY)
const onResizeMouseUp = () => {
  endResize()
  window.removeEventListener('mousemove', onResizeMouseMove)
  window.removeEventListener('mouseup', onResizeMouseUp)
}
const onResizeMouseDown = (e) => {
  e.preventDefault()
  startResize(e.clientX, e.clientY)
  window.addEventListener('mousemove', onResizeMouseMove)
  window.addEventListener('mouseup', onResizeMouseUp)
}

// Touch resize
const onResizeTouchStart = (e) => {
  if (e.touches.length !== 1) return
  startResize(e.touches[0].clientX, e.touches[0].clientY)
}
const onResizeTouchMove = (e) => {
  if (!isResizing.value || e.touches.length !== 1) return
  updateResize(e.touches[0].clientX, e.touches[0].clientY)
}
const onResizeTouchEnd = () => endResize()

// Double-click resize handle to reset ALL customizations (size + position)
const onResizeDblClick = () => {
  customWidth.value = null
  customMaxHeight.value = null
  dragOffset.value = { x: 0, y: 0 }
  localStorage.removeItem('nbp-transcript-width')
  localStorage.removeItem('nbp-transcript-max-height')
  localStorage.removeItem('nbp-transcript-offset-x')
  localStorage.removeItem('nbp-transcript-offset-y')
}

// --- Drag functionality ---
const savedX = localStorage.getItem('nbp-transcript-offset-x')
const savedY = localStorage.getItem('nbp-transcript-offset-y')
const dragOffset = ref({
  x: savedX ? parseInt(savedX) : 0,
  y: savedY ? parseInt(savedY) : 0,
})
const isDragging = ref(false)
let dragStart = { x: 0, y: 0 }
let offsetStart = { x: 0, y: 0 }

// --- Viewport bounds check ---
// Reset position if any part of panel is outside viewport (e.g. switched from large monitor to small screen)
const checkBoundsAndReset = async () => {
  await nextTick()
  if (!panelRef.value) return
  const rect = panelRef.value.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (rect.left < 0 || rect.right > vw || rect.top < 0 || rect.bottom > vh) {
    dragOffset.value = { x: 0, y: 0 }
    localStorage.removeItem('nbp-transcript-offset-x')
    localStorage.removeItem('nbp-transcript-offset-y')
  }
}
// Component remounts on each lightbox open (inside v-if), so onMounted covers that case
onMounted(() => checkBoundsAndReset())
// Also check when transcript is toggled visible within an open lightbox
watch(() => props.visible, (v) => { if (v) checkBoundsAndReset() })

const panelStyle = computed(() => {
  const style = {}
  if (dragOffset.value.x !== 0 || dragOffset.value.y !== 0) {
    style.transform = `translateX(calc(-50% + ${dragOffset.value.x}px)) translateY(${dragOffset.value.y}px)`
  }
  if (customWidth.value) {
    style.width = `${customWidth.value}px`
    style.maxWidth = 'none'
  }
  if (customMaxHeight.value) {
    style.maxHeight = `${customMaxHeight.value}px`
  }
  return style
})

const constrainOffset = (newX, newY) => {
  if (!panelRef.value) return { x: newX, y: newY }

  const rect = panelRef.value.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight
  const margin = 48

  // Horizontal: keep panel mostly on screen
  const centerX = vw / 2 + newX
  const halfW = rect.width / 2
  if (centerX - halfW < -halfW + margin) newX = -vw / 2 + margin
  if (centerX + halfW > vw + halfW - margin) newX = vw / 2 - margin

  // Vertical: don't go above toolbar (4rem~64px) or below viewport bottom
  // Default position: bottom: 10rem (160px), so default top = vh - 160 - height
  const defaultTop = vh - 160 - rect.height
  const newTop = defaultTop + newY
  if (newTop < 64) newY = 64 - defaultTop
  if (newTop + rect.height > vh - 16) newY = vh - 16 - rect.height - defaultTop

  return { x: newX, y: newY }
}

const updateDragPosition = (clientX, clientY) => {
  const dx = clientX - dragStart.x
  const dy = clientY - dragStart.y
  const { x, y } = constrainOffset(offsetStart.x + dx, offsetStart.y + dy)
  dragOffset.value = { x, y }
}

// Mouse drag
const onMouseMove = (e) => {
  if (!isDragging.value) return
  updateDragPosition(e.clientX, e.clientY)
}

const persistOffset = () => {
  localStorage.setItem('nbp-transcript-offset-x', String(dragOffset.value.x))
  localStorage.setItem('nbp-transcript-offset-y', String(dragOffset.value.y))
}

const onMouseUp = () => {
  isDragging.value = false
  persistOffset()
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
}

const onDragMouseDown = (e) => {
  e.preventDefault()
  isDragging.value = true
  dragStart = { x: e.clientX, y: e.clientY }
  offsetStart = { ...dragOffset.value }
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

// Touch drag (header only — content scrolls independently)
const onDragTouchStart = (e) => {
  if (e.touches.length !== 1) return
  isDragging.value = true
  const touch = e.touches[0]
  dragStart = { x: touch.clientX, y: touch.clientY }
  offsetStart = { ...dragOffset.value }
}

const onDragTouchMove = (e) => {
  if (!isDragging.value || e.touches.length !== 1) return
  e.preventDefault()
  const touch = e.touches[0]
  updateDragPosition(touch.clientX, touch.clientY)
}

const onDragTouchEnd = () => {
  isDragging.value = false
  persistOffset()
}

// Cleanup global listeners
onUnmounted(() => {
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
  window.removeEventListener('mousemove', onResizeMouseMove)
  window.removeEventListener('mouseup', onResizeMouseUp)
})
</script>

<template>
  <Transition name="transcript-slide">
    <div
      v-if="visible && segments.length > 0"
      ref="panelRef"
      class="transcript-panel"
      :style="panelStyle"
      @wheel.stop
      @click.stop
    >
      <!-- Drag handle header -->
      <div
        class="transcript-header"
        :class="{ 'cursor-grabbing': isDragging }"
        @mousedown="onDragMouseDown"
        @touchstart="onDragTouchStart"
        @touchmove="onDragTouchMove"
        @touchend="onDragTouchEnd"
      >
        <!-- Grip indicator -->
        <div class="transcript-grip" aria-hidden="true">
          <span /><span /><span />
        </div>
        <svg class="w-4 h-4 opacity-70 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span class="flex-1">{{ t('lightbox.transcript.title') }}</span>
      </div>

      <!-- Scrollable content (touchstart.stop prevents lightbox swipe) -->
      <div
        ref="contentRef"
        class="transcript-content"
        @touchstart.stop
        @touchmove.stop
      >
        <template v-if="speakerMode === 'dual'">
          <div
            v-for="(seg, idx) in segments"
            :key="idx"
            class="transcript-segment"
          >
            <span
              v-if="seg.speaker"
              class="transcript-speaker-tag"
              :style="{ backgroundColor: getSpeakerColor(seg.speaker) }"
            >
              {{ seg.speaker }}
            </span>
            <p class="transcript-text" v-text="seg.text" />
          </div>
        </template>
        <template v-else>
          <p
            v-for="(seg, idx) in segments"
            :key="idx"
            class="transcript-text"
            v-text="seg.text"
          />
        </template>
      </div>

      <!-- Resize handle (top-right corner — panel grows upward since bottom is anchored) -->
      <div
        class="transcript-resize-handle"
        @mousedown.stop="onResizeMouseDown"
        @touchstart.stop="onResizeTouchStart"
        @touchmove.prevent="onResizeTouchMove"
        @touchend="onResizeTouchEnd"
        @dblclick="onResizeDblClick"
      />
    </div>
  </Transition>
</template>

<style scoped>
.transcript-panel {
  position: absolute;
  bottom: 10rem;
  left: 50%;
  transform: translateX(-50%);
  width: max(300px, 45vw);
  max-width: 700px;
  max-height: 35vh;
  display: flex;
  flex-direction: column;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.75rem;
  z-index: 2;
  overflow: hidden;
}

.transcript-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.8125rem;
  font-weight: 500;
  flex-shrink: 0;
  cursor: grab;
  user-select: none;
  touch-action: none;
}

.transcript-header.cursor-grabbing {
  cursor: grabbing;
}

/* Grip indicator (3 horizontal lines) */
.transcript-grip {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 2px 0;
  flex-shrink: 0;
}

.transcript-grip span {
  display: block;
  width: 14px;
  height: 2px;
  border-radius: 1px;
  background: rgba(255, 255, 255, 0.35);
}

.transcript-content {
  flex: 1;
  overflow-y: auto;
  padding: 0.75rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.transcript-content::-webkit-scrollbar {
  width: 4px;
}

.transcript-content::-webkit-scrollbar-track {
  background: transparent;
}

.transcript-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
}

.transcript-segment {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.transcript-speaker-tag {
  display: inline-block;
  align-self: flex-start;
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  color: white;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.transcript-text {
  color: rgba(255, 255, 255, 0.9);
  font-size: 0.875rem;
  line-height: 1.6;
  white-space: pre-wrap;
  margin: 0;
}

/* Portrait orientation (mobile / rotated) */
@media (orientation: portrait) {
  .transcript-panel {
    width: max(280px, 85vw);
    max-height: 28vh;
    bottom: 10.5rem;
  }
}

/* Resize handle (top-right corner — panel is bottom-anchored, top edge moves) */
.transcript-resize-handle {
  position: absolute;
  top: 0;
  right: 0;
  width: 24px;
  height: 24px;
  cursor: ne-resize;
  touch-action: none;
  z-index: 1;
  border-radius: 0 0.75rem 0 0;
  /* Expand touch target */
  padding: 4px;
  box-sizing: content-box;
}

/* Diagonal stripe visual indicator */
.transcript-resize-handle::before,
.transcript-resize-handle::after {
  content: '';
  position: absolute;
  background: rgba(255, 255, 255, 0.3);
  height: 1px;
  transform: rotate(-45deg);
  transform-origin: center;
}
.transcript-resize-handle::before {
  width: 10px;
  top: 8px;
  right: 4px;
}
.transcript-resize-handle::after {
  width: 6px;
  top: 11px;
  right: 4px;
}

/* Slide transition */
.transcript-slide-enter-active,
.transcript-slide-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}

.transcript-slide-enter-from,
.transcript-slide-leave-to {
  transform: translateX(-50%) translateY(1rem);
  opacity: 0;
}
</style>
