<script setup>
import { reactive } from 'vue'
import { useToast } from '@/composables/useToast'

const { toasts, remove } = useToast()

const typeClasses = {
  success: 'bg-status-success-muted border-status-success text-status-success',
  error: 'bg-status-error-muted border-status-error text-status-error',
  info: 'bg-mode-generate-muted border-mode-generate text-mode-generate',
  warning: 'bg-status-warning-muted border-status-warning text-status-warning',
}

const getTypeClass = (type) => {
  return typeClasses[type] || typeClasses.info
}

const typeIcons = {
  success: 'M5 13l4 4L19 7',
  error: 'M6 18L18 6M6 6l12 12',
  info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  warning: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
}

// Swipe-to-dismiss state per toast
const swipeState = reactive({})

const SWIPE_THRESHOLD = 100 // px to trigger dismiss
const OPACITY_THRESHOLD = 150 // px for full fade

const getSwipeState = (id) => {
  if (!swipeState[id]) {
    swipeState[id] = { offsetX: 0, isDragging: false, startX: 0 }
  }
  return swipeState[id]
}

const getSwipeStyle = (id) => {
  const state = swipeState[id]
  if (!state || state.offsetX === 0) return {}

  const opacity = Math.max(0.3, 1 - Math.abs(state.offsetX) / OPACITY_THRESHOLD)
  return {
    transform: `translateX(${state.offsetX}px)`,
    opacity,
    transition: state.isDragging ? 'none' : 'all 0.2s ease-out',
  }
}

// Mouse events
const onMouseDown = (e, id) => {
  const state = getSwipeState(id)
  state.isDragging = true
  state.startX = e.clientX - state.offsetX
}

const onMouseMove = (e, id) => {
  const state = swipeState[id]
  if (!state?.isDragging) return

  state.offsetX = e.clientX - state.startX
}

const onMouseUp = (id) => {
  const state = swipeState[id]
  if (!state?.isDragging) return

  state.isDragging = false

  if (Math.abs(state.offsetX) >= SWIPE_THRESHOLD) {
    // Animate out in swipe direction then remove
    state.offsetX = state.offsetX > 0 ? 300 : -300
    setTimeout(() => {
      remove(id)
      delete swipeState[id]
    }, 200)
  } else {
    // Snap back
    state.offsetX = 0
  }
}

const onMouseLeave = (id) => {
  const state = swipeState[id]
  if (state?.isDragging) {
    onMouseUp(id)
  }
}

// Touch events
const onTouchStart = (e, id) => {
  const state = getSwipeState(id)
  state.isDragging = true
  state.startX = e.touches[0].clientX - state.offsetX
}

const onTouchMove = (e, id) => {
  const state = swipeState[id]
  if (!state?.isDragging) return

  state.offsetX = e.touches[0].clientX - state.startX
}

const onTouchEnd = (id) => {
  onMouseUp(id) // Same logic as mouse
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed top-4 right-4 z-[99999] space-y-2 pointer-events-none">
      <TransitionGroup name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="toast-item pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-xl shadow-lg min-w-[200px] max-w-[400px] cursor-grab select-none active:cursor-grabbing"
          :class="getTypeClass(toast.type)"
          :style="getSwipeStyle(toast.id)"
          @mousedown="onMouseDown($event, toast.id)"
          @mousemove="onMouseMove($event, toast.id)"
          @mouseup="onMouseUp(toast.id)"
          @mouseleave="onMouseLeave(toast.id)"
          @touchstart="onTouchStart($event, toast.id)"
          @touchmove="onTouchMove($event, toast.id)"
          @touchend="onTouchEnd(toast.id)"
        >
          <svg
            class="w-5 h-5 flex-shrink-0 pointer-events-none"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              :d="typeIcons[toast.type]"
            />
          </svg>
          <span class="text-sm font-medium pointer-events-none">{{ toast.message }}</span>
          <button
            @click="remove(toast.id)"
            class="ml-auto p-1 rounded-lg hover:bg-black/10 transition-colors"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style>
/* Toast animations (unscoped for Teleport) */
.toast-enter-active {
  transition: all 0.3s ease-out;
}

.toast-leave-active {
  transition: all 0.2s ease-in;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(100px);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(100px);
}

.toast-move {
  transition: transform 0.3s ease;
}
</style>
