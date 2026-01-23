<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePdfToImages } from '@/composables/usePdfToImages'

const { t } = useI18n()

const emit = defineEmits(['update:images', 'start-processing'])

const props = defineProps({
  images: {
    type: Array,
    default: () => [],
  },
  maxItems: {
    type: Number,
    default: 30,
  },
})

// PDF converter
const pdfConverter = usePdfToImages()

// Local state
const isDragging = ref(false)
const fileInput = ref(null)
const isConverting = ref(false)
const conversionError = ref(null)

// Computed
const totalCount = computed(() => props.images.length)
const canAddMore = computed(() => totalCount.value < props.maxItems)

// Conversion status message based on stage
const conversionStatusMessage = computed(() => {
  const stage = pdfConverter.stage.value
  const current = pdfConverter.currentPage.value
  const total = pdfConverter.totalPages.value

  switch (stage) {
    case 'loading':
      return t('slideToPptx.upload.loadingPdf')
    case 'converting':
      return t('slideToPptx.upload.convertingPage', { current, total })
    default:
      return ''
  }
})

// Supported file types
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
const ACCEPTED_TYPES = [...ACCEPTED_IMAGE_TYPES, 'application/pdf']

/**
 * Generate unique ID
 */
const generateId = () => `slide-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

/**
 * Handle drag over
 */
const handleDragOver = (e) => {
  e.preventDefault()
  isDragging.value = true
}

/**
 * Handle drag leave
 */
const handleDragLeave = () => {
  isDragging.value = false
}

/**
 * Handle drop
 */
const handleDrop = (e) => {
  e.preventDefault()
  isDragging.value = false
  const files = Array.from(e.dataTransfer.files).filter(
    (f) => ACCEPTED_TYPES.includes(f.type)
  )
  processFiles(files)
}

/**
 * Handle file select
 */
const handleFileSelect = (e) => {
  const files = Array.from(e.target.files)
  processFiles(files)
  // Reset input
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

/**
 * Process uploaded files
 */
const processFiles = async (files) => {
  if (!canAddMore.value) return

  conversionError.value = null
  const newImages = []

  for (const file of files) {
    if (newImages.length + totalCount.value >= props.maxItems) break

    if (file.type === 'application/pdf') {
      // Handle PDF
      await processPdf(file, newImages)
    } else if (ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      // Handle image
      await processImage(file, newImages)
    }
  }

  if (newImages.length > 0) {
    emit('update:images', [...props.images, ...newImages])
  }
}

/**
 * Process single image file
 */
const processImage = (file, newImages) => {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target.result
      const base64 = dataUrl.split(',')[1]

      // Load image to get dimensions
      const img = new Image()
      img.onload = () => {
        newImages.push({
          id: generateId(),
          data: base64,
          mimeType: file.type,
          preview: dataUrl,
          source: 'image',
          fileName: file.name,
          width: img.naturalWidth,
          height: img.naturalHeight,
        })
        resolve()
      }
      img.onerror = () => {
        // Fallback: add without dimensions
        newImages.push({
          id: generateId(),
          data: base64,
          mimeType: file.type,
          preview: dataUrl,
          source: 'image',
          fileName: file.name,
        })
        resolve()
      }
      img.src = dataUrl
    }
    reader.onerror = () => resolve() // Skip on error
    reader.readAsDataURL(file)
  })
}

/**
 * Process PDF file
 */
const processPdf = async (file, newImages) => {
  isConverting.value = true
  conversionError.value = null

  try {
    const arrayBuffer = await file.arrayBuffer()
    const slotsAvailable = props.maxItems - totalCount.value - newImages.length

    const result = await pdfConverter.convert(
      arrayBuffer,
      {
        scale: 2.0,
        maxPages: slotsAvailable,
      },
      {
        onPage: (page) => {
          // Add each page as it's converted
          const dataUrl = `data:image/png;base64,${page.data}`
          newImages.push({
            id: generateId(),
            data: page.data,
            mimeType: 'image/png',
            preview: dataUrl,
            source: 'pdf',
            pdfPage: page.index + 1,
            fileName: `${file.name} - Page ${page.index + 1}`,
            width: page.width,
            height: page.height,
          })
        },
      }
    )

    // Show warning if pages were skipped
    if (result.skippedPages > 0) {
      conversionError.value = t('slideToPptx.upload.pdfTooLarge', {
        count: result.pageCount,
      })
    }
  } catch (error) {
    conversionError.value = t('slideToPptx.upload.conversionFailed', {
      error: error.message,
    })
  } finally {
    isConverting.value = false
  }
}

/**
 * Remove image at index
 */
const removeImage = (index) => {
  const newImages = [...props.images]
  newImages.splice(index, 1)
  emit('update:images', newImages)
}

/**
 * Clear all images
 */
const clearAll = () => {
  emit('update:images', [])
  conversionError.value = null
}

/**
 * Trigger file input
 */
const triggerFileInput = () => {
  fileInput.value?.click()
}

/**
 * Start processing
 */
const startProcessing = () => {
  if (totalCount.value > 0) {
    emit('start-processing')
  }
}
</script>

<template>
  <div class="slide-file-uploader space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold text-text-primary">
        {{ $t('slideToPptx.upload.title') }}
      </h2>
      <span class="text-sm text-text-muted">
        {{ totalCount }}/{{ maxItems }}
      </span>
    </div>

    <!-- Drop Zone -->
    <div
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
      @click="triggerFileInput"
      class="upload-zone"
      :class="{
        dragover: isDragging,
        disabled: !canAddMore || isConverting,
      }"
    >
      <div class="flex flex-col items-center gap-3 py-4">
        <!-- Icon -->
        <div
          class="w-14 h-14 rounded-2xl flex items-center justify-center"
          :class="canAddMore ? 'bg-mode-generate-muted' : 'bg-bg-muted'"
        >
          <svg
            class="w-7 h-7"
            :class="canAddMore ? 'text-mode-generate' : 'text-text-muted'"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
        </div>

        <!-- Text -->
        <div class="text-center">
          <p class="text-text-secondary font-medium">
            {{ $t('slideToPptx.upload.dragDrop') }}
          </p>
          <p class="text-sm text-text-muted mt-1">
            {{ $t('slideToPptx.upload.orClick') }}
          </p>
        </div>

        <!-- Supported formats -->
        <p class="text-xs text-text-muted">
          {{ $t('slideToPptx.upload.supportedFormats') }} |
          {{ $t('slideToPptx.upload.maxItems', { count: maxItems }) }}
        </p>
      </div>
    </div>

    <!-- Hidden file input -->
    <input
      ref="fileInput"
      type="file"
      accept=".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf"
      multiple
      class="hidden"
      @change="handleFileSelect"
      :disabled="!canAddMore || isConverting"
    />

    <!-- Converting Progress -->
    <div
      v-if="isConverting"
      class="p-4 rounded-lg bg-bg-muted border border-border-default"
    >
      <div class="flex items-center gap-3">
        <div class="animate-spin w-5 h-5 border-2 border-mode-generate border-t-transparent rounded-full"></div>
        <div class="flex-1">
          <p class="text-sm text-text-primary font-medium">
            {{ $t('slideToPptx.upload.converting') }}
          </p>
          <p class="text-xs text-text-muted mt-0.5">
            {{ conversionStatusMessage }}
          </p>
        </div>
        <span class="text-sm text-text-muted">
          {{ pdfConverter.currentPage.value }}/{{ pdfConverter.totalPages.value }}
        </span>
      </div>
      <!-- Progress bar -->
      <div class="mt-2 h-1.5 bg-bg-subtle rounded-full overflow-hidden">
        <div
          class="h-full bg-mode-generate transition-all duration-300"
          :style="{ width: `${pdfConverter.progress.value}%` }"
        ></div>
      </div>
    </div>

    <!-- Error Message -->
    <div
      v-if="conversionError"
      class="p-3 rounded-lg bg-status-warning-muted border border-status-warning text-sm text-status-warning"
    >
      {{ conversionError }}
    </div>

    <!-- Image Grid -->
    <div v-if="images.length > 0" class="space-y-3">
      <div class="flex items-center justify-between">
        <span class="text-sm text-text-muted">
          {{ $t('slideToPptx.upload.uploaded') }} ({{ totalCount }})
        </span>
        <button
          @click="clearAll"
          class="text-xs text-text-muted hover:text-status-error transition-colors"
        >
          {{ $t('slideToPptx.upload.clearAll') }}
        </button>
      </div>

      <div class="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-2">
        <div
          v-for="(image, index) in images"
          :key="image.id"
          class="relative aspect-[4/3] rounded-lg overflow-hidden group bg-bg-muted"
        >
          <img
            :src="image.preview"
            :alt="image.fileName || `Slide ${index + 1}`"
            class="w-full h-full object-cover"
          />

          <!-- PDF badge -->
          <div
            v-if="image.source === 'pdf'"
            class="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-brand-primary text-text-on-brand"
          >
            PDF
          </div>

          <!-- Page number -->
          <div
            class="absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-black/60 text-white"
          >
            {{ index + 1 }}
          </div>

          <!-- Delete overlay -->
          <div
            class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
          >
            <button
              @click.stop="removeImage(index)"
              class="p-1.5 rounded-full bg-status-error-solid hover:bg-red-600 text-white transition-colors"
              :title="$t('common.remove')"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Add more button -->
        <div
          v-if="canAddMore && !isConverting"
          @click="triggerFileInput"
          class="aspect-[4/3] rounded-lg border-2 border-dashed border-border-muted hover:border-mode-generate flex items-center justify-center cursor-pointer transition-colors"
        >
          <svg class="w-6 h-6 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
        </div>
      </div>
    </div>

    <!-- Start Processing Button -->
    <div v-if="images.length > 0" class="pt-2">
      <button
        @click="startProcessing"
        :disabled="isConverting"
        class="w-full py-3 px-4 rounded-xl font-medium transition-all bg-mode-generate hover:bg-mode-generate-hover text-text-on-brand disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {{ $t('slideToPptx.upload.startProcessing') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.upload-zone {
  padding: 1.5rem;
  border-radius: 1rem;
  border: 2px dashed var(--color-border-default);
  cursor: pointer;
  transition: all 0.2s;
}

.upload-zone:hover:not(.disabled) {
  border-color: color-mix(in srgb, var(--color-mode-generate), transparent 50%);
  background: color-mix(in srgb, var(--color-mode-generate), transparent 95%);
}

.upload-zone.dragover {
  border-color: var(--color-mode-generate);
  background: color-mix(in srgb, var(--color-mode-generate), transparent 90%);
}

.upload-zone.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
