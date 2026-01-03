<script setup>
import { ref, computed } from 'vue'
import { useGeneratorStore } from '@/stores/generator'

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
      <label class="block text-sm font-medium text-gray-300">
        參考圖片
        <span class="text-gray-500 font-normal ml-1">({{ store.referenceImages.length }}/{{ MAX_IMAGES }})</span>
      </label>
      <button
        v-if="store.referenceImages.length > 0"
        @click="clearAll"
        class="text-xs text-gray-500 hover:text-gray-300 transition-colors"
      >
        清除全部
      </button>
    </div>

    <!-- Image Grid -->
    <div v-if="store.referenceImages.length > 0" class="grid grid-cols-5 gap-2">
      <div
        v-for="(image, index) in store.referenceImages"
        :key="index"
        class="relative aspect-square rounded-lg overflow-hidden group"
      >
        <img
          :src="image.preview"
          :alt="image.name || `Image ${index + 1}`"
          class="w-full h-full object-cover"
        />
        <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <button
            @click="removeImage(index)"
            class="p-1.5 rounded-full bg-red-500/80 hover:bg-red-500 text-white transition-colors"
            title="移除"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Add more button (if slots available) -->
      <div
        v-if="canAddMore"
        @click="triggerFileInput"
        class="aspect-square rounded-lg border-2 border-dashed border-white/10 hover:border-purple-500/50 flex items-center justify-center cursor-pointer transition-colors"
      >
        <svg class="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        <div class="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center flex-shrink-0">
          <svg class="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <div class="text-left">
          <p class="text-gray-300 text-sm font-medium">拖放圖片、點擊選擇或貼上</p>
          <p class="text-xs text-gray-500 mt-0.5">最多 {{ MAX_IMAGES }} 張，支援 JPG、PNG、WebP</p>
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
  border: 2px dashed rgba(255, 255, 255, 0.1);
  cursor: pointer;
  transition: all 0.2s;
}

.upload-zone-compact:hover {
  border-color: rgba(168, 85, 247, 0.5);
  background: rgba(168, 85, 247, 0.05);
}

.upload-zone-compact.dragover {
  border-color: rgb(168, 85, 247);
  background: rgba(168, 85, 247, 0.1);
}
</style>
