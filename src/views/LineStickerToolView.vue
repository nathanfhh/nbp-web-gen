<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useLineStickerProcessor } from '@/composables/useLineStickerProcessor'

const router = useRouter()
const { t } = useI18n()

const {
  images,
  options,
  isProcessing,
  processProgress,
  specChecks,
  allPassed,
  needsProcessing,
  canDownload,
  LINE_SPECS,
  addImages,
  removeImage,
  clearAll,
  processImages,
  downloadAsZip,
  formatFileSize,
} = useLineStickerProcessor()

// Drag state
const isDragging = ref(false)
const fileInput = ref(null)

// Image element refs for scroll into view
const imageRefs = ref({})
const setImageRef = (id, el) => {
  if (el) {
    imageRefs.value[id] = el
  } else {
    delete imageRefs.value[id]
  }
}

// Watch for processing status and scroll to current processing image
watch(
  () => images.value.find((img) => img.status === 'processing'),
  (processingImg) => {
    if (processingImg && imageRefs.value[processingImg.id]) {
      imageRefs.value[processingImg.id].scrollIntoView({
        behavior: 'instant',
        block: 'center',
      })
    }
  },
)

// Handle drag events
const handleDragOver = (e) => {
  e.preventDefault()
  isDragging.value = true
}

const handleDragLeave = () => {
  isDragging.value = false
}

const handleDrop = (e) => {
  e.preventDefault()
  isDragging.value = false
  const files = e.dataTransfer.files
  if (files.length) {
    addImages(files)
  }
}

// Handle file selection
const handleFileSelect = (e) => {
  const files = e.target.files
  if (files.length) {
    addImages(files)
  }
  // Reset input
  e.target.value = ''
}

// Open file picker
const openFilePicker = () => {
  fileInput.value?.click()
}

// Navigate back
const goBack = () => {
  router.push('/')
}

// Get status icon class
const getStatusClass = (img) => {
  const isCompliant =
    img.width <= LINE_SPECS.maxWidth &&
    img.height <= LINE_SPECS.maxHeight &&
    img.size <= LINE_SPECS.maxFileSize &&
    img.file.type === 'image/png'

  if (img.status === 'processing') return 'border-blue-500 animate-pulse'
  if (img.status === 'processed') return 'border-emerald-500'
  if (img.status === 'error') return 'border-red-500'
  if (!isCompliant) return 'border-amber-500'
  return 'border-white/20'
}

// Get display dimensions
const getDisplayDimensions = (img) => {
  if (img.processedBlob) {
    return `${img.processedWidth} × ${img.processedHeight}`
  }
  return `${img.width} × ${img.height}`
}

// Check if image needs warning
const needsWarning = (img) => {
  return (
    img.width > LINE_SPECS.maxWidth ||
    img.height > LINE_SPECS.maxHeight ||
    img.size > LINE_SPECS.maxFileSize ||
    img.file.type !== 'image/png'
  )
}

// Format failed items for display
const formatFailedItems = (items) => {
  if (items.length === 0) return ''
  const indices = items.map((item) => {
    const idx = images.value.findIndex((img) => img.id === item.id)
    return `#${idx + 1}`
  })
  return indices.join(', ')
}

// Get stats for dimensions (original vs processed)
const dimensionStats = computed(() => {
  const oversized = images.value.filter(
    (img) => img.width > LINE_SPECS.maxWidth || img.height > LINE_SPECS.maxHeight,
  )
  const processed = oversized.filter((img) => img.processedBlob)
  const stillOversized = images.value.filter((img) => {
    const w = img.processedBlob ? img.processedWidth : img.width
    const h = img.processedBlob ? img.processedHeight : img.height
    return w > LINE_SPECS.maxWidth || h > LINE_SPECS.maxHeight
  })
  return {
    originalOversized: oversized.length,
    processedCount: processed.length,
    stillOversized: stillOversized.length,
    hasProcessed: processed.length > 0,
  }
})

// Get stats for file size (original vs processed)
const fileSizeStats = computed(() => {
  const oversized = images.value.filter((img) => img.size > LINE_SPECS.maxFileSize)
  const processed = oversized.filter((img) => img.processedBlob)
  const stillOversized = images.value.filter((img) => {
    const size = img.processedBlob ? img.processedSize : img.size
    return size > LINE_SPECS.maxFileSize
  })
  return {
    originalOversized: oversized.length,
    processedCount: processed.length,
    stillOversized: stillOversized.length,
    hasProcessed: processed.length > 0,
  }
})

// Suggested count hint
const suggestedCount = computed(() => {
  const current = images.value.length
  if (LINE_SPECS.validCounts.includes(current)) return null
  // Find closest valid count
  const closest = LINE_SPECS.validCounts.reduce((prev, curr) =>
    Math.abs(curr - current) < Math.abs(prev - current) ? curr : prev,
  )
  return closest
})
</script>

<template>
  <div class="min-h-screen bg-[var(--bg-dark)] text-[var(--text-primary)]">
    <!-- Header -->
    <header class="sticky top-0 z-50 backdrop-blur-xl line-tool-header border-b border-white/10">
      <div class="max-w-6xl mx-auto px-4 py-4 flex items-center gap-4">
        <button
          @click="goBack"
          class="p-2 rounded-lg hover:bg-white/10 transition-colors"
          :title="t('common.back')"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 class="text-xl font-bold">{{ t('lineStickerTool.title') }}</h1>
      </div>
    </header>

    <!-- Main Content -->
    <main class="max-w-6xl mx-auto px-4 py-8 space-y-8">
      <!-- Upload Area -->
      <section class="glass p-6">
        <h2 class="text-lg font-semibold mb-4">{{ t('lineStickerTool.upload.title') }}</h2>
        <div
          @dragover="handleDragOver"
          @dragleave="handleDragLeave"
          @drop="handleDrop"
          @click="openFilePicker"
          class="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all"
          :class="isDragging
            ? 'border-[var(--primary)] bg-[var(--primary)]/10'
            : 'border-white/20 hover:border-white/40 hover:bg-white/5'"
        >
          <input
            ref="fileInput"
            type="file"
            accept="image/png,image/*"
            multiple
            class="hidden"
            @change="handleFileSelect"
          />
          <svg class="w-12 h-12 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p class="text-gray-300 mb-2">{{ t('lineStickerTool.upload.dragDrop') }}</p>
          <p class="text-sm text-gray-500">{{ t('lineStickerTool.upload.hint') }}</p>
        </div>
      </section>

      <!-- Spec Checks -->
      <section v-if="images.length > 0" class="glass p-6">
        <h2 class="text-lg font-semibold mb-4">{{ t('lineStickerTool.specs.title') }}</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <!-- File Size Check -->
          <div class="flex items-start gap-3 p-3 rounded-lg bg-white/5 spec-card">
            <span class="mt-0.5 shrink-0">
              <svg v-if="specChecks.fileSize.passed" class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              <svg v-else class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </span>
            <div class="flex-1 min-w-0">
              <p class="font-medium" :class="specChecks.fileSize.passed ? 'text-emerald-400' : 'text-red-400'">
                {{ t('lineStickerTool.specs.fileSize') }}
              </p>
              <p class="text-xs text-gray-500">{{ t('lineStickerTool.specs.fileSizeHint') }}</p>
              <!-- Before/after stats -->
              <p v-if="fileSizeStats.originalOversized > 0" class="text-xs mt-1">
                <span class="text-amber-400">{{ fileSizeStats.originalOversized }}</span>
                <span v-if="fileSizeStats.hasProcessed" class="text-gray-500"> → </span>
                <span v-if="fileSizeStats.hasProcessed" :class="fileSizeStats.stillOversized === 0 ? 'text-emerald-400' : 'text-amber-400'">
                  {{ fileSizeStats.stillOversized }}
                </span>
                <span class="text-gray-500 ml-1">{{ t('lineStickerTool.specs.itemsOversized') }}</span>
              </p>
            </div>
          </div>

          <!-- Dimensions Check -->
          <div class="flex items-start gap-3 p-3 rounded-lg bg-white/5 spec-card">
            <span class="mt-0.5 shrink-0">
              <svg v-if="specChecks.dimensions.passed" class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              <svg v-else class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </span>
            <div class="flex-1 min-w-0">
              <p class="font-medium" :class="specChecks.dimensions.passed ? 'text-emerald-400' : 'text-red-400'">
                {{ t('lineStickerTool.specs.dimensions') }}
              </p>
              <p class="text-xs text-gray-500">{{ t('lineStickerTool.specs.dimensionsHint') }}</p>
              <!-- Before/after stats -->
              <p v-if="dimensionStats.originalOversized > 0" class="text-xs mt-1">
                <span class="text-amber-400">{{ dimensionStats.originalOversized }}</span>
                <span v-if="dimensionStats.hasProcessed" class="text-gray-500"> → </span>
                <span v-if="dimensionStats.hasProcessed" :class="dimensionStats.stillOversized === 0 ? 'text-emerald-400' : 'text-amber-400'">
                  {{ dimensionStats.stillOversized }}
                </span>
                <span class="text-gray-500 ml-1">{{ t('lineStickerTool.specs.itemsOversized') }}</span>
              </p>
            </div>
          </div>

          <!-- Count Check -->
          <div class="flex items-start gap-3 p-3 rounded-lg bg-white/5 spec-card">
            <span class="mt-0.5 shrink-0">
              <svg v-if="specChecks.count.passed" class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              <svg v-else class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </span>
            <div class="flex-1 min-w-0">
              <p class="font-medium" :class="specChecks.count.passed ? 'text-emerald-400' : 'text-red-400'">
                {{ t('lineStickerTool.specs.count') }}
                <span class="text-gray-400 font-normal text-sm ml-1">({{ specChecks.count.current }})</span>
              </p>
              <p class="text-xs text-gray-500">{{ t('lineStickerTool.specs.countHint') }}</p>
              <p v-if="!specChecks.count.passed && suggestedCount" class="text-xs text-amber-400 mt-1">
                → {{ suggestedCount }}
              </p>
            </div>
          </div>

          <!-- Format Check -->
          <div class="flex items-start gap-3 p-3 rounded-lg bg-white/5 spec-card">
            <span class="mt-0.5 shrink-0">
              <svg v-if="specChecks.format.passed" class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              <svg v-else class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </span>
            <div class="flex-1 min-w-0">
              <p class="font-medium" :class="specChecks.format.passed ? 'text-emerald-400' : 'text-red-400'">
                {{ t('lineStickerTool.specs.format') }}
              </p>
              <p class="text-xs text-gray-500">{{ t('lineStickerTool.specs.formatHint') }}</p>
              <p v-if="specChecks.format.failedItems.length > 0" class="text-xs text-amber-400 mt-1">
                {{ formatFailedItems(specChecks.format.failedItems) }}
              </p>
            </div>
          </div>
        </div>

        <!-- All passed indicator -->
        <div v-if="allPassed" class="mt-4 p-3 rounded-lg bg-emerald-500/20 border border-emerald-500/30">
          <p class="text-emerald-400 text-center font-medium">
            <svg class="w-5 h-5 inline-block mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {{ t('lineStickerTool.specs.allPassed') }}
          </p>
        </div>
      </section>

      <!-- Image Preview Grid -->
      <section v-if="images.length > 0" class="glass p-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold">{{ t('lineStickerTool.preview.title') }}</h2>
          <button
            @click="clearAll"
            class="text-sm text-red-400 hover:text-red-300 transition-colors"
          >
            {{ t('lineStickerTool.actions.clear') }}
          </button>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          <div
            v-for="(img, index) in images"
            :key="img.id"
            :ref="el => setImageRef(img.id, el)"
            class="relative group"
          >
            <!-- Image card -->
            <div
              class="aspect-square rounded-lg overflow-hidden border-2 transition-all"
              :class="getStatusClass(img)"
            >
              <!-- Checkerboard background for transparency -->
              <div class="absolute inset-0 checkerboard rounded-lg"></div>
              <!-- Image -->
              <img
                :src="img.preview"
                :alt="img.name"
                class="relative w-full h-full object-contain"
              />
              <!-- Status overlay -->
              <div
                v-if="img.status === 'processing'"
                class="absolute inset-0 bg-black/50 flex items-center justify-center"
              >
                <svg class="w-8 h-8 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
              <!-- Warning badge -->
              <div
                v-if="needsWarning(img) && img.status === 'pending'"
                class="absolute top-2 right-2"
              >
                <svg class="w-5 h-5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                </svg>
              </div>
              <!-- Processed badge -->
              <div
                v-if="img.status === 'processed'"
                class="absolute top-2 right-2"
              >
                <svg class="w-5 h-5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                </svg>
              </div>
              <!-- Remove button -->
              <button
                @click.stop="removeImage(img.id)"
                class="absolute top-2 left-2 p-1 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <!-- Info -->
            <div class="mt-2 text-xs p-2 rounded-lg bg-black/60 backdrop-blur-sm image-info">
              <p class="text-gray-300 truncate" :title="img.name">#{{ index + 1 }} {{ img.name }}</p>

              <!-- Dimensions: before → after -->
              <p v-if="img.status === 'processed' && img.wasScaled" class="text-gray-400">
                <span class="text-gray-500 line-through">{{ img.width }} × {{ img.height }}</span>
                <span class="mx-1">→</span>
                <span class="text-emerald-400">{{ img.processedWidth }} × {{ img.processedHeight }}</span>
              </p>
              <p v-else class="text-gray-400">{{ getDisplayDimensions(img) }}</p>

              <!-- File size: before → after -->
              <p v-if="img.status === 'processed'" class="font-mono">
                <span class="text-gray-500 line-through">{{ formatFileSize(img.size) }}</span>
                <span class="mx-1">→</span>
                <span :class="img.processedSize > LINE_SPECS.maxFileSize ? 'text-red-400' : 'text-emerald-400'">
                  {{ formatFileSize(img.processedSize) }}
                </span>
              </p>
              <p
                v-else
                class="font-mono"
                :class="img.size > LINE_SPECS.maxFileSize ? 'text-red-400' : 'text-gray-400'"
              >
                {{ formatFileSize(img.size) }}
              </p>

              <!-- Processing info badges -->
              <div v-if="img.status === 'processed'" class="flex flex-wrap gap-1 mt-1">
                <span v-if="img.wasScaled" class="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/20 text-blue-300">
                  {{ t('lineStickerTool.badge.scaled') }}
                </span>
                <span v-if="img.wasQuantized" class="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300">
                  {{ t('lineStickerTool.badge.quantized') }}
                </span>
                <span v-if="!img.wasScaled && !img.wasQuantized" class="px-1.5 py-0.5 rounded text-[10px] bg-gray-500/20 text-gray-300">
                  {{ t('lineStickerTool.badge.reencoded') }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Options & Actions -->
      <section v-if="images.length > 0" class="glass p-6">
        <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <!-- Filename format options -->
          <div class="space-y-3">
            <h3 class="text-sm font-medium text-gray-300">{{ t('lineStickerTool.options.title') }}</h3>
            <div class="flex gap-4">
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  v-model="options.filenameFormat"
                  value="original"
                  class="w-4 h-4 text-[var(--primary)] bg-white/10 border-white/30 focus:ring-[var(--primary)]"
                />
                <span class="text-sm text-gray-400">{{ t('lineStickerTool.options.original') }}</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  v-model="options.filenameFormat"
                  value="sequential"
                  class="w-4 h-4 text-[var(--primary)] bg-white/10 border-white/30 focus:ring-[var(--primary)]"
                />
                <span class="text-sm text-gray-400">{{ t('lineStickerTool.options.sequential') }}</span>
              </label>
            </div>
          </div>

          <!-- Action buttons -->
          <div class="flex gap-3">
            <button
              v-if="needsProcessing"
              @click="processImages"
              :disabled="isProcessing"
              class="btn-premium px-6 py-2.5"
            >
              <template v-if="isProcessing">
                <svg class="w-4 h-4 mr-2 animate-spin inline-block" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {{ t('lineStickerTool.actions.processing', { current: processProgress.current, total: processProgress.total }) }}
              </template>
              <template v-else>
                {{ t('lineStickerTool.actions.process') }}
              </template>
            </button>
            <button
              @click="downloadAsZip"
              :disabled="!canDownload || isProcessing"
              class="btn-secondary px-6 py-2.5"
              :class="{ 'opacity-50 cursor-not-allowed': !canDownload || isProcessing }"
            >
              <svg class="w-4 h-4 mr-2 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {{ t('lineStickerTool.actions.download') }}
            </button>
          </div>
        </div>
      </section>

      <!-- Empty state hint -->
      <section v-if="images.length === 0" class="text-center py-12">
        <svg class="w-16 h-16 mx-auto text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p class="text-gray-500">{{ t('lineStickerTool.empty.hint') }}</p>
        <p class="text-sm text-gray-600 mt-2">{{ t('lineStickerTool.empty.specs') }}</p>
      </section>
    </main>
  </div>
</template>

<style scoped>
/* Default header for dark mode */
.line-tool-header {
  background: rgba(var(--bg-dark-rgb, 15, 23, 42), 0.8);
}

/* Light theme header */
[data-theme="light"] .line-tool-header {
  background: rgba(255, 255, 255, 0.95) !important;
  border-color: rgba(13, 94, 175, 0.15) !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.checkerboard {
  background-image:
    linear-gradient(45deg, #333 25%, transparent 25%),
    linear-gradient(-45deg, #333 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #333 75%),
    linear-gradient(-45deg, transparent 75%, #333 75%);
  background-size: 12px 12px;
  background-position: 0 0, 0 6px, 6px -6px, -6px 0px;
}

[data-theme="light"] .checkerboard {
  background-image:
    linear-gradient(45deg, #ddd 25%, transparent 25%),
    linear-gradient(-45deg, #ddd 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #ddd 75%),
    linear-gradient(-45deg, transparent 75%, #ddd 75%);
}

/* Image info styling for light mode */
[data-theme="light"] .image-info {
  background: rgba(255, 255, 255, 0.9) !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

[data-theme="light"] .image-info p {
  color: #374151 !important;
}

[data-theme="light"] .image-info .text-red-400 {
  color: #dc2626 !important;
}

/* Spec card styling for light mode */
[data-theme="light"] .spec-card {
  background: rgba(13, 94, 175, 0.05) !important;
}
</style>
