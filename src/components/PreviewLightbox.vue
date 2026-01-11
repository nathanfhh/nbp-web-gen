<script setup>
defineProps({
  visible: {
    type: Boolean,
    required: true,
  },
  imageSrc: {
    type: String,
    default: null,
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['close'])
</script>

<template>
  <Teleport to="body">
    <Transition name="lightbox">
      <div
        v-if="visible"
        class="fixed inset-0 z-[10000] flex items-center justify-center bg-bg-overlay backdrop-blur-sm"
        @click="emit('close')"
      >
        <button
          @click="emit('close')"
          class="absolute top-4 right-4 p-3 rounded-full bg-bg-interactive hover:bg-bg-interactive-hover text-text-primary transition-all"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div class="max-w-[90vw] max-h-[85vh] flex flex-col items-center gap-4" @click.stop>
          <!-- Loading spinner -->
          <div v-if="isLoading" class="flex items-center justify-center py-12">
            <svg class="w-10 h-10 text-mode-generate animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
          <!-- Image -->
          <img
            v-else-if="imageSrc"
            :src="imageSrc"
            alt=""
            class="max-w-full max-h-[70vh] object-contain rounded-lg shadow-2xl"
          />
          <!-- Caption slot -->
          <div class="text-center">
            <slot name="caption"></slot>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.lightbox-enter-active,
.lightbox-leave-active {
  transition: opacity 0.2s ease;
}

.lightbox-enter-from,
.lightbox-leave-to {
  opacity: 0;
}
</style>
