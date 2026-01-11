<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGeneratorStore } from '@/stores/generator'

useI18n() // Enable $t in template
const store = useGeneratorStore()
const isDragging = ref(false)
const fileInput = ref(null)

const MAX_IMAGES = 5

const canAddMore = computed(() => store.referenceImages.length < MAX_IMAGES)
const remainingSlots = computed(() => MAX_IMAGES - store.referenceImages.length)

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
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
  processFiles(files)
}

const handleFileSelect = (e) => {
  const files = Array.from(e.target.files)
  processFiles(files)
  // Reset input so same file can be selected again
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

const processFiles = (files) => {
  const filesToProcess = files.slice(0, remainingSlots.value)

  filesToProcess.forEach(file => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target.result
      const base64 = dataUrl.split(',')[1]
      const mimeType = file.type || 'image/jpeg'

      store.addReferenceImage({
        data: base64,
        preview: dataUrl,
        mimeType,
        name: file.name,
      })
    }
    reader.readAsDataURL(file)
  })
}

const handlePaste = (e) => {
  if (!canAddMore.value) return

  const items = e.clipboardData.items
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      processFiles([file])
      break
    }
  }
}

const removeImage = (index) => {
  store.removeReferenceImage(index)
}

const clearAll = () => {
  store.clearReferenceImages()
}

const triggerFileInput = () => {
  fileInput.value?.click()
}
</script>

<template>
  <div class="space-y-3" @paste="handlePaste">
    <div class="flex items-center justify-between">
      <label class="block text-sm font-medium text-text-secondary">
        {{ $t('imageUploader.title') }}
        <span class="text-text-muted font-normal ml-1">({{ store.referenceImages.length }}/{{ MAX_IMAGES }})</span>
      </label>
      <button
        v-if="store.referenceImages.length > 0"
        @click="clearAll"
        class="text-xs text-text-muted hover:text-text-secondary transition-colors"
      >
        {{ $t('common.clearAll') }}
      </button>
    </div>

    <!-- Image Grid -->
    <div v-if="store.referenceImages.length > 0" class="grid grid-cols-5 gap-2">
      <div
        v-for="(image, index) in store.referenceImages"
        :key="index"
        class="relative aspect-square rounded-lg overflow-hidden group"
        :class="{ 'ring-2 ring-brand-primary': image.isCharacterLocked }"
      >
        <img
          :src="image.preview"
          :alt="image.name || `Image ${index + 1}`"
          class="w-full h-full object-cover"
        />
        <!-- Locked character indicator -->
        <div v-if="image.isCharacterLocked" class="absolute top-1 left-1 p-1 rounded bg-brand-primary text-text-primary">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <!-- Delete button (only for non-locked images) -->
        <div v-if="!image.isCharacterLocked" class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <button
            @click="removeImage(index)"
            class="p-1.5 rounded-full bg-status-error-solid hover:bg-status-error-solid text-text-primary transition-colors"
            :title="$t('common.remove')"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <!-- Hover overlay for locked images (show character name) -->
        <div v-else class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <span class="text-text-primary text-xs font-medium text-center px-2">{{ image.name }}</span>
        </div>
      </div>

      <!-- Add more button (if slots available) -->
      <div
        v-if="canAddMore"
        @click="triggerFileInput"
        class="aspect-square rounded-lg border-2 border-dashed border-border-muted hover:border-mode-generate flex items-center justify-center cursor-pointer transition-colors"
      >
        <svg class="w-6 h-6 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
      </div>
    </div>

    <!-- Empty state drop zone -->
    <div
      v-else
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
      @click="triggerFileInput"
      class="upload-zone-compact"
      :class="{ dragover: isDragging }"
    >
      <div class="flex items-center gap-4">
        <div class="w-12 h-12 rounded-xl bg-mode-generate-muted flex items-center justify-center flex-shrink-0">
          <svg class="w-6 h-6 text-mode-generate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <div class="text-left">
          <p class="text-text-secondary text-sm font-medium">{{ $t('imageUploader.dragDrop') }}</p>
          <p class="text-xs text-text-muted mt-0.5">{{ $t('imageUploader.maxImages', { count: MAX_IMAGES }) }}</p>
        </div>
      </div>
    </div>

    <!-- Hidden file input -->
    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      multiple
      class="hidden"
      @change="handleFileSelect"
    />
  </div>
</template>

<style scoped>
.upload-zone-compact {
  padding: 1rem;
  border-radius: 0.75rem;
  border: 2px dashed var(--color-border-default);
  cursor: pointer;
  transition: all 0.2s;
}

.upload-zone-compact:hover {
  border-color: color-mix(in srgb, var(--color-brand-primary), transparent 50%);
  background: color-mix(in srgb, var(--color-brand-primary), transparent 95%);
}

.upload-zone-compact.dragover {
  border-color: var(--color-brand-primary);
  background: color-mix(in srgb, var(--color-brand-primary), transparent 90%);
}
</style>
