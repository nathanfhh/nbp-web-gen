<script setup>
import { ref, computed, defineAsyncComponent } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGeneratorStore } from '@/stores/generator'
import ConfirmModal from '@/components/ConfirmModal.vue'
import ThumbnailActionMenu from '@/components/ThumbnailActionMenu.vue'

// Lazy load SketchCanvas (includes heavy deps: fabric ~300KB, vue3-color ~100KB)
const SketchCanvas = defineAsyncComponent(() => import('@/components/SketchCanvas.vue'))

const { t } = useI18n()
const store = useGeneratorStore()

// Refs
const confirmModalRef = ref(null)

// Sketch canvas state
const showSketchCanvas = ref(false)

// Edit mode state
const editMode = ref(null) // 'fabric' | 'background' | null
const editingImageIndex = ref(null)
const editImageData = ref(null)

// Action menu state
const actionMenuOpen = ref(false)
const actionMenuTriggerRect = ref(null)
const actionMenuImageIndex = ref(null)

const openSketchCanvas = () => {
  // Reset edit state for new sketch
  editMode.value = null
  editingImageIndex.value = null
  editImageData.value = null
  // Use -1 to indicate new sketch (will reset history)
  store.startSketchEdit(-1)
  showSketchCanvas.value = true
}

const handleSketchSave = (imageData) => {
  if (editingImageIndex.value !== null) {
    // Replace existing image
    store.updateReferenceImage(editingImageIndex.value, imageData)
  } else {
    // Add new image
    store.addReferenceImage(imageData)
    // Update sketch editing index so history is preserved for this new image
    const newIndex = store.referenceImages.length - 1
    store.setSketchEditingImageIndex(newIndex)
    editingImageIndex.value = newIndex
  }
}

const closeSketchCanvas = () => {
  showSketchCanvas.value = false
  editMode.value = null
  editingImageIndex.value = null
  editImageData.value = null
}

// Edit image - determine mode based on source
const editImage = (index) => {
  const image = store.referenceImages[index]
  if (!image) return

  editingImageIndex.value = index
  editImageData.value = image

  // Determine edit mode
  if (image.fabricJson) {
    // Has Fabric JSON - can continue editing strokes
    editMode.value = 'fabric'
  } else {
    // Uploaded image - use as background
    editMode.value = 'background'
  }

  // Initialize or reuse history for this image
  store.startSketchEdit(index)
  showSketchCanvas.value = true
}

// Open action menu for a thumbnail
const openActionMenu = (index, event) => {
  const target = event.currentTarget
  const rect = target.getBoundingClientRect()
  actionMenuTriggerRect.value = rect
  actionMenuImageIndex.value = index
  actionMenuOpen.value = true
}

const closeActionMenu = () => {
  actionMenuOpen.value = false
  actionMenuTriggerRect.value = null
  actionMenuImageIndex.value = null
}

// Action menu handlers
const handleMenuEdit = () => {
  if (actionMenuImageIndex.value !== null) {
    editImage(actionMenuImageIndex.value)
  }
}

const handleMenuDownload = () => {
  if (actionMenuImageIndex.value !== null) {
    downloadImage(store.referenceImages[actionMenuImageIndex.value])
  }
}

const handleMenuDelete = () => {
  if (actionMenuImageIndex.value !== null) {
    removeImage(actionMenuImageIndex.value)
  }
}
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

const removeImage = async (index) => {
  const confirmed = await confirmModalRef.value.show({
    title: t('imageUploader.removeConfirmTitle'),
    message: t('imageUploader.removeConfirmMessage'),
    confirmText: t('common.remove'),
    cancelText: t('common.cancel'),
  })

  if (confirmed) {
    store.removeReferenceImage(index)
  }
}

const downloadImage = (image) => {
  const link = document.createElement('a')
  link.href = image.preview
  link.download = image.name || `image-${Date.now()}.png`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
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
        class="relative aspect-square rounded-lg overflow-hidden group cursor-pointer"
        :class="{ 'ring-2 ring-brand-primary': image.isCharacterLocked }"
        @click="!image.isCharacterLocked && openActionMenu(index, $event)"
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
        <!-- Fabric source indicator (pencil icon) - for sketch images -->
        <div
          v-else-if="image.fabricJson"
          class="absolute top-1 left-1 p-1 rounded bg-mode-generate text-text-on-brand"
          :title="$t('imageUploader.sketchSource')"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </div>
        <!-- Tap hint overlay (for non-locked images) -->
        <div v-if="!image.isCharacterLocked" class="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
          </svg>
        </div>
        <!-- Hover overlay for locked images (show character name) -->
        <div v-if="image.isCharacterLocked" class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <span class="text-text-primary text-xs font-medium text-center px-2">{{ image.name }}</span>
        </div>
      </div>

      <!-- Add more buttons (if slots available) -->
      <div v-if="canAddMore" class="flex gap-1">
        <!-- Upload button -->
        <div
          @click="triggerFileInput"
          class="aspect-square rounded-lg border-2 border-dashed border-border-muted hover:border-mode-generate flex items-center justify-center cursor-pointer transition-colors flex-1"
          :title="$t('imageUploader.upload')"
        >
          <svg class="w-6 h-6 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
        </div>
        <!-- Sketch button -->
        <div
          @click="openSketchCanvas"
          class="aspect-square rounded-lg border-2 border-dashed border-border-muted hover:border-mode-generate flex items-center justify-center cursor-pointer transition-colors flex-1"
          :title="$t('imageUploader.sketch')"
        >
          <svg class="w-6 h-6 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else class="empty-state-container">
      <!-- Drop zone -->
      <div
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
      <!-- Sketch button (square, same height as upload zone) -->
      <div
        @click="openSketchCanvas"
        class="sketch-button-square upload-zone-compact flex items-center justify-center"
        :title="$t('imageUploader.sketch')"
      >
        <svg class="w-6 h-6 text-mode-generate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
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

    <!-- Sketch Canvas Modal -->
    <SketchCanvas
      v-if="showSketchCanvas"
      :edit-mode="editMode"
      :edit-image-data="editImageData"
      @save="handleSketchSave"
      @close="closeSketchCanvas"
    />

    <!-- Action Menu -->
    <ThumbnailActionMenu
      v-if="actionMenuOpen && actionMenuTriggerRect"
      :trigger-rect="actionMenuTriggerRect"
      :is-fabric-source="store.referenceImages[actionMenuImageIndex]?.fabricJson != null"
      @edit="handleMenuEdit"
      @download="handleMenuDownload"
      @delete="handleMenuDelete"
      @close="closeActionMenu"
    />

    <!-- Confirm Modal -->
    <ConfirmModal ref="confirmModalRef" />
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

/* Empty state container using CSS Grid */
.empty-state-container {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.5rem;
}

/* Sketch button: fixed width, stretch height to match upload zone */
.sketch-button-square {
  width: 56px;
}
</style>
