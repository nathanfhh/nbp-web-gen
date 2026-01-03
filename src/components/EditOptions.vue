<script setup>
import { ref, computed } from 'vue'
import { useGeneratorStore } from '@/stores/generator'

const store = useGeneratorStore()
const isDragging = ref(false)
const fileInput = ref(null)

const resolutions = [
  { value: '1k', label: '1K (1024px)' },
  { value: '2k', label: '2K (2048px)' },
  { value: '4k', label: '4K (4096px)' },
]

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
  const file = e.dataTransfer.files[0]
  if (file && file.type.startsWith('image/')) {
    processFile(file)
  }
}

const handleFileSelect = (e) => {
  const file = e.target.files[0]
  if (file) {
    processFile(file)
  }
}

const processFile = (file) => {
  const reader = new FileReader()
  reader.onload = (e) => {
    store.editOptions.inputImagePreview = e.target.result
    // Extract base64 without the data URL prefix
    const base64 = e.target.result.split(',')[1]
    store.editOptions.inputImage = base64
  }
  reader.readAsDataURL(file)
}

const handlePaste = (e) => {
  const items = e.clipboardData.items
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      processFile(file)
      break
    }
  }
}

const clearImage = () => {
  store.editOptions.inputImage = null
  store.editOptions.inputImagePreview = null
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

const triggerFileInput = () => {
  fileInput.value?.click()
}
</script>

<template>
  <div class="space-y-6" @paste="handlePaste">
    <!-- Image Upload -->
    <div class="space-y-3">
      <label class="block text-sm font-medium text-gray-300">輸入圖片</label>

      <!-- Drop zone or preview -->
      <div
        v-if="!store.editOptions.inputImagePreview"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
        @click="triggerFileInput"
        class="upload-zone"
        :class="{ dragover: isDragging }"
      >
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          class="hidden"
          @change="handleFileSelect"
        />
        <div class="flex flex-col items-center gap-4">
          <div class="w-16 h-16 rounded-2xl bg-purple-500/20 flex items-center justify-center">
            <svg class="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div class="text-center">
            <p class="text-gray-300 font-medium">拖放圖片、點擊選擇或直接貼上</p>
            <p class="text-sm text-gray-500 mt-1">支援 JPG、PNG 格式</p>
          </div>
        </div>
      </div>

      <!-- Image preview -->
      <div v-else class="image-preview relative">
        <img :src="store.editOptions.inputImagePreview" alt="Input image" class="w-full rounded-xl" />
        <div class="image-preview-overlay">
          <button @click="clearImage" class="btn-secondary text-sm py-2 px-4">
            <svg class="w-4 h-4 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            移除圖片
          </button>
        </div>
      </div>
    </div>

    <!-- Resolution -->
    <div class="space-y-3">
      <label class="block text-sm font-medium text-gray-300">輸出解析度</label>
      <div class="grid grid-cols-3 gap-3">
        <button
          v-for="res in resolutions"
          :key="res.value"
          @click="store.editOptions.resolution = res.value"
          class="py-3 px-4 rounded-xl text-sm font-medium transition-all"
          :class="store.editOptions.resolution === res.value
            ? 'bg-purple-500/30 border border-purple-500 text-purple-300'
            : 'bg-white/5 border border-transparent text-gray-400 hover:bg-white/10'"
        >
          {{ res.label }}
        </button>
      </div>
    </div>
  </div>
</template>
