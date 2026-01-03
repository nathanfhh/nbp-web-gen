<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  images: {
    type: Array,
    default: () => [],
  },
  modelValue: {
    type: Boolean,
    default: false,
  },
  initialIndex: {
    type: Number,
    default: 0,
  },
})

const emit = defineEmits(['update:modelValue'])

const currentIndex = ref(props.initialIndex)
const isAnimating = ref(false)
const slideDirection = ref('') // 'left' or 'right'
const isVisible = ref(false)
const isClosing = ref(false)

// Watch for external open
watch(() => props.modelValue, (newVal) => {
  if (newVal) {
    currentIndex.value = props.initialIndex
    isVisible.value = true
    isClosing.value = false
    document.body.style.overflow = 'hidden'
  } else {
    isClosing.value = true
    setTimeout(() => {
      isVisible.value = false
      isClosing.value = false
      document.body.style.overflow = ''
    }, 300)
  }
})

// Watch initial index changes
watch(() => props.initialIndex, (newVal) => {
  currentIndex.value = newVal
})

const currentImage = computed(() => {
  return props.images[currentIndex.value] || null
})

const hasPrev = computed(() => currentIndex.value > 0)
const hasNext = computed(() => currentIndex.value < props.images.length - 1)

const close = () => {
  emit('update:modelValue', false)
}

const goToPrev = () => {
  if (!hasPrev.value || isAnimating.value) return
  slideDirection.value = 'right'
  isAnimating.value = true
  setTimeout(() => {
    currentIndex.value--
    setTimeout(() => {
      isAnimating.value = false
      slideDirection.value = ''
    }, 300)
  }, 150)
}

const goToNext = () => {
  if (!hasNext.value || isAnimating.value) return
  slideDirection.value = 'left'
  isAnimating.value = true
  setTimeout(() => {
    currentIndex.value++
    setTimeout(() => {
      isAnimating.value = false
      slideDirection.value = ''
    }, 300)
  }, 150)
}

const goToIndex = (index) => {
  if (index === currentIndex.value || isAnimating.value) return
  slideDirection.value = index > currentIndex.value ? 'left' : 'right'
  isAnimating.value = true
  setTimeout(() => {
    currentIndex.value = index
    setTimeout(() => {
      isAnimating.value = false
      slideDirection.value = ''
    }, 300)
  }, 150)
}

// Keyboard navigation
const handleKeydown = (e) => {
  if (!props.modelValue) return

  switch (e.key) {
    case 'ArrowLeft':
      e.preventDefault()
      goToPrev()
      break
    case 'ArrowRight':
      e.preventDefault()
      goToNext()
      break
    case 'Escape':
      e.preventDefault()
      close()
      break
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  document.body.style.overflow = ''
})

const getImageSrc = (image) => {
  return `data:${image.mimeType};base64,${image.data}`
}

const downloadCurrentImage = () => {
  if (!currentImage.value) return
  const link = document.createElement('a')
  link.href = getImageSrc(currentImage.value)
  link.download = `generated-image-${Date.now()}-${currentIndex.value + 1}.${currentImage.value.mimeType.split('/')[1] || 'png'}`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="lightbox">
      <div
        v-if="isVisible"
        class="lightbox-overlay"
        :class="{ 'is-closing': isClosing }"
        @click.self="close"
      >
        <!-- Top toolbar -->
        <div class="lightbox-toolbar">
          <!-- Download button -->
          <button
            @click="downloadCurrentImage"
            class="lightbox-btn"
            title="下載圖片"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
          <!-- Close button -->
          <button
            @click="close"
            class="lightbox-btn"
            title="關閉"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Navigation: Previous -->
        <button
          v-if="images.length > 1"
          @click="goToPrev"
          :disabled="!hasPrev"
          class="lightbox-nav lightbox-nav-prev"
          :class="{ 'opacity-30 cursor-not-allowed': !hasPrev }"
        >
          <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <!-- Image container -->
        <div class="lightbox-content">
          <div
            class="lightbox-image-wrapper"
            :class="{
              'slide-out-left': isAnimating && slideDirection === 'left',
              'slide-out-right': isAnimating && slideDirection === 'right',
              'slide-in-left': !isAnimating && slideDirection === 'left',
              'slide-in-right': !isAnimating && slideDirection === 'right',
            }"
          >
            <img
              v-if="currentImage"
              :src="getImageSrc(currentImage)"
              :alt="`Image ${currentIndex + 1}`"
              class="lightbox-image"
            />
          </div>
        </div>

        <!-- Navigation: Next -->
        <button
          v-if="images.length > 1"
          @click="goToNext"
          :disabled="!hasNext"
          class="lightbox-nav lightbox-nav-next"
          :class="{ 'opacity-30 cursor-not-allowed': !hasNext }"
        >
          <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <!-- Thumbnails / Dots -->
        <div v-if="images.length > 1" class="lightbox-dots">
          <button
            v-for="(image, index) in images"
            :key="index"
            @click="goToIndex(index)"
            class="lightbox-dot"
            :class="{ 'active': index === currentIndex }"
          >
            <span class="sr-only">Image {{ index + 1 }}</span>
          </button>
        </div>

        <!-- Counter -->
        <div class="lightbox-counter">
          {{ currentIndex + 1 }} / {{ images.length }}
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.lightbox-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.95);
  backdrop-filter: blur(8px);
  animation: lightbox-fade-in 0.3s ease-out;
}

.lightbox-overlay.is-closing {
  animation: lightbox-fade-out 0.3s ease-out forwards;
}

@keyframes lightbox-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes lightbox-fade-out {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

.lightbox-toolbar {
  position: absolute;
  top: 1rem;
  right: 1rem;
  z-index: 10;
  display: flex;
  gap: 0.5rem;
}

.lightbox-btn {
  padding: 0.75rem;
  color: white;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 9999px;
  transition: all 0.2s;
}

.lightbox-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(1.1);
}

.lightbox-nav {
  position: absolute;
  top: 50%;
  z-index: 10;
  transform: translateY(-50%);
  padding: 1rem;
  color: white;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 9999px;
  transition: all 0.2s;
}

.lightbox-nav:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.2);
  transform: translateY(-50%) scale(1.1);
}

.lightbox-nav-prev {
  left: 1rem;
}

.lightbox-nav-next {
  right: 1rem;
}

.lightbox-content {
  max-width: 90vw;
  max-height: 85vh;
  overflow: hidden;
}

.lightbox-image-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  animation: lightbox-zoom-in 0.3s ease-out;
}

@keyframes lightbox-zoom-in {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.lightbox-overlay.is-closing .lightbox-image-wrapper {
  animation: lightbox-zoom-out 0.3s ease-out forwards;
}

@keyframes lightbox-zoom-out {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.9);
  }
}

/* Slide animations */
.slide-out-left {
  animation: slide-out-left 0.15s ease-in forwards;
}

.slide-out-right {
  animation: slide-out-right 0.15s ease-in forwards;
}

.slide-in-left {
  animation: slide-in-left 0.15s ease-out;
}

.slide-in-right {
  animation: slide-in-right 0.15s ease-out;
}

@keyframes slide-out-left {
  to {
    opacity: 0;
    transform: translateX(-50px);
  }
}

@keyframes slide-out-right {
  to {
    opacity: 0;
    transform: translateX(50px);
  }
}

@keyframes slide-in-left {
  from {
    opacity: 0;
    transform: translateX(50px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes slide-in-right {
  from {
    opacity: 0;
    transform: translateX(-50px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.lightbox-image {
  max-width: 90vw;
  max-height: 85vh;
  object-fit: contain;
  border-radius: 0.5rem;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}

.lightbox-dots {
  position: absolute;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 0.5rem;
}

.lightbox-dot {
  width: 0.625rem;
  height: 0.625rem;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.3);
  transition: all 0.2s;
}

.lightbox-dot:hover {
  background: rgba(255, 255, 255, 0.5);
}

.lightbox-dot.active {
  background: white;
  transform: scale(1.2);
}

.lightbox-counter {
  position: absolute;
  bottom: 1.5rem;
  right: 1.5rem;
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.875rem;
  font-variant-numeric: tabular-nums;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

/* Vue transition */
.lightbox-enter-active,
.lightbox-leave-active {
  transition: opacity 0.3s ease;
}

.lightbox-enter-from,
.lightbox-leave-to {
  opacity: 0;
}
</style>
