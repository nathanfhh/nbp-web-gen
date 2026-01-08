<script setup>
import { useToast } from '@/composables/useToast'

const { toasts, remove } = useToast()

const typeClasses = {
  success: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300',
  error: 'bg-red-500/20 border-red-500/50 text-red-300',
  info: 'bg-blue-500/20 border-blue-500/50 text-blue-300',
  warning: 'bg-amber-500/20 border-amber-500/50 text-amber-300',
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
</script>

<template>
  <Teleport to="body">
    <div class="fixed top-4 right-4 z-[99999] space-y-2 pointer-events-none">
      <TransitionGroup name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="toast-item pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-xl shadow-lg min-w-[200px] max-w-[400px]"
          :class="getTypeClass(toast.type)"
        >
          <svg
            class="w-5 h-5 flex-shrink-0"
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
          <span class="text-sm font-medium">{{ toast.message }}</span>
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
