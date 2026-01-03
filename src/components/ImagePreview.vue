<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { useGeneratorStore } from '@/stores/generator'
import { formatElapsed } from '@/composables/useFormatTime'
import ImageLightbox from './ImageLightbox.vue'

const store = useGeneratorStore()

// Lightbox state
const lightboxOpen = ref(false)
const lightboxIndex = ref(0)

const openLightbox = (index) => {
  lightboxIndex.value = index
  lightboxOpen.value = true
}

// Live timer for loading state
const currentTime = ref(Date.now())
let timerInterval = null

watch(
  () => store.isGenerating,
  (isGenerating) => {
    if (isGenerating) {
      // Start timer
      currentTime.value = Date.now()
      timerInterval = setInterval(() => {
        currentTime.value = Date.now()
      }, 100)
    } else {
      // Stop timer
      if (timerInterval) {
        clearInterval(timerInterval)
        timerInterval = null
      }
    }
  },
  { immediate: true }
)

onUnmounted(() => {
  if (timerInterval) {
    clearInterval(timerInterval)
  }
})

// Elapsed time during generation
const elapsedTime = computed(() => {
  if (!store.generationStartTime) return '0.0s'
  const elapsed = currentTime.value - store.generationStartTime
  return formatElapsed(elapsed)
})

// Total generation time (after completion)
const totalTime = computed(() => {
  if (!store.generationStartTime || !store.generationEndTime) return null
  const elapsed = store.generationEndTime - store.generationStartTime
  return formatElapsed(elapsed)
})

const downloadImage = (image, index) => {
  const link = document.createElement('a')
  link.href = `data:${image.mimeType};base64,${image.data}`
  link.download = `generated-image-${Date.now()}-${index + 1}.${image.mimeType.split('/')[1] || 'png'}`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

const downloadAll = () => {
  store.generatedImages.forEach((image, index) => {
    setTimeout(() => {
      downloadImage(image, index)
    }, index * 500)
  })
}

const clearImages = () => {
  store.clearGeneratedImages()
}
</script>

<template>
  <div v-if="store.generatedImages.length > 0" class="space-y-6 fade-in">
    <div class="flex items-center justify-between">
      <h3 class="font-semibold text-white flex items-center gap-2">
        <svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        生成結果
        <span class="badge">{{ store.generatedImages.length }}</span>
        <!-- Total time badge -->
        <span
          v-if="totalTime"
          class="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono"
        >
          {{ totalTime }}
        </span>
      </h3>
      <div class="flex gap-2">
        <button @click="downloadAll" class="btn-secondary py-2 px-4 text-sm">
          <svg class="w-4 h-4 mr-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          全部下載
        </button>
        <button @click="clearImages" class="text-gray-400 hover:text-gray-300 py-2 px-4 text-sm">
          清除
        </button>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="(image, index) in store.generatedImages"
        :key="index"
        class="image-preview group cursor-pointer"
        @click="openLightbox(index)"
      >
        <img
          :src="`data:${image.mimeType};base64,${image.data}`"
          :alt="`Generated image ${index + 1}`"
          class="w-full"
        />
        <div class="image-preview-overlay">
          <div class="flex gap-2">
            <button
              @click.stop="openLightbox(index)"
              class="btn-secondary py-2 px-3 text-sm"
              title="放大預覽"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
              </svg>
            </button>
            <button
              @click.stop="downloadImage(image, index)"
              class="btn-premium py-2 px-4 text-sm"
            >
              <svg class="w-4 h-4 mr-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              下載
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Lightbox -->
    <ImageLightbox
      v-model="lightboxOpen"
      :images="store.generatedImages"
      :initial-index="lightboxIndex"
    />
  </div>

  <!-- Loading state -->
  <div v-else-if="store.isGenerating" class="flex flex-col items-center justify-center py-16 space-y-6">
    <div class="relative">
      <div class="spinner"></div>
      <div class="absolute inset-0 spinner" style="animation-delay: -0.5s; opacity: 0.5;"></div>
      <!-- Timer in center -->
      <div class="absolute inset-0 flex items-center justify-center">
        <span class="text-2xl font-mono font-bold text-white tabular-nums">
          {{ elapsedTime }}
        </span>
      </div>
    </div>
    <div class="text-center">
      <p class="text-white font-medium">生成中...</p>
      <p class="text-sm text-gray-400 mt-1">請稍候，這可能需要一些時間</p>
    </div>
  </div>

  <!-- Empty state -->
  <div v-else class="flex flex-col items-center justify-center py-16 text-center">
    <div class="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center mb-6">
      <svg class="w-10 h-10 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    </div>
    <p class="text-gray-400">尚未生成圖片</p>
    <p class="text-sm text-gray-500 mt-1">輸入 Prompt 後點擊生成按鈕開始</p>
  </div>
</template>
