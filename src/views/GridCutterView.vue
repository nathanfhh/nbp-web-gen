<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import StickerCropper from '@/components/StickerCropper.vue'

const router = useRouter()
const { t } = useI18n()

// State
const isDragging = ref(false)
const imageDataUrl = ref('')
const showCropper = ref(false)
const fileInput = ref(null)

// Navigation
const goBack = () => {
  router.push('/')
}

// File handling
const readFileAsDataUrl = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

const handleFile = async (file) => {
  if (!file || !file.type.startsWith('image/')) return
  imageDataUrl.value = await readFileAsDataUrl(file)
}

const handleDragOver = (e) => {
  e.preventDefault()
  isDragging.value = true
}

const handleDragLeave = () => {
  isDragging.value = false
}

const handleDrop = async (e) => {
  e.preventDefault()
  isDragging.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) await handleFile(file)
}

const handleFileSelect = async (e) => {
  const file = e.target.files?.[0]
  if (file) await handleFile(file)
  // Reset input so same file can be re-selected
  if (fileInput.value) fileInput.value.value = ''
}

const openFilePicker = () => {
  fileInput.value?.click()
}

const changeImage = () => {
  imageDataUrl.value = ''
}

const startCrop = () => {
  showCropper.value = true
}

const closeCropper = () => {
  showCropper.value = false
}
</script>

<template>
  <div class="min-h-screen bg-[var(--bg-dark)] text-[var(--text-primary)]">
    <!-- Header -->
    <header class="sticky top-0 z-50 backdrop-blur-xl bg-glass-bg-strong border-b border-border-subtle shadow-card">
      <div class="max-w-6xl mx-auto px-4 py-4 flex items-center gap-4">
        <button
          @click="goBack"
          class="p-2 rounded-lg hover:bg-bg-interactive transition-colors"
          :title="t('common.back')"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 class="text-xl font-bold">{{ t('gridCutter.title') }}</h1>
      </div>
    </header>

    <!-- Main Content -->
    <main class="max-w-6xl mx-auto px-4 py-8 space-y-8">
      <!-- Warning -->
      <section class="rounded-xl p-4 bg-status-warning-muted border border-status-warning">
        <div class="flex gap-3">
          <svg class="w-5 h-5 mt-0.5 shrink-0 text-status-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <div>
            <p class="font-medium text-text-primary">{{ t('gridCutter.warning') }}</p>
            <p class="text-sm mt-1 text-text-secondary">{{ t('gridCutter.warningDetail') }}</p>
          </div>
        </div>
      </section>

      <!-- Upload Area (shown when no image) -->
      <section v-if="!imageDataUrl" class="glass p-6">
        <h2 class="text-lg font-semibold mb-4">{{ t('gridCutter.upload.title') }}</h2>
        <div
          @dragover="handleDragOver"
          @dragleave="handleDragLeave"
          @drop="handleDrop"
          @click="openFilePicker"
          class="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all"
          :class="isDragging
            ? 'border-[var(--primary)] bg-[var(--primary)]/10'
            : 'border-border-default hover:border-white/40 hover:bg-bg-muted'"
        >
          <input
            ref="fileInput"
            type="file"
            accept="image/*"
            class="hidden"
            @change="handleFileSelect"
          />
          <svg class="w-12 h-12 mx-auto mb-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p class="text-text-secondary mb-2">{{ t('gridCutter.upload.dragDrop') }}</p>
          <p class="text-sm text-text-muted">{{ t('gridCutter.upload.hint') }}</p>
        </div>
      </section>

      <!-- Image Preview (shown when image uploaded) -->
      <section v-else class="glass p-6">
        <h2 class="text-lg font-semibold mb-4">{{ t('gridCutter.preview.title') }}</h2>
        <div class="flex flex-col items-center gap-6">
          <div class="w-full max-w-2xl rounded-lg overflow-hidden border border-border-default bg-bg-muted">
            <img
              :src="imageDataUrl"
              alt="Uploaded sticker grid"
              class="w-full h-auto object-contain max-h-[60vh]"
            />
          </div>
          <div class="flex gap-3">
            <button
              @click="changeImage"
              class="px-4 py-2 rounded-lg border border-border-default hover:bg-bg-interactive transition-colors text-text-secondary"
            >
              {{ t('gridCutter.preview.changeImage') }}
            </button>
            <button
              @click="startCrop"
              class="px-6 py-2 rounded-lg bg-brand-primary text-text-on-brand font-medium hover:opacity-90 transition-opacity"
            >
              {{ t('gridCutter.preview.startCrop') }}
            </button>
          </div>
        </div>
      </section>
    </main>

    <!-- Sticker Cropper Modal -->
    <StickerCropper
      v-model="showCropper"
      :image-src="imageDataUrl"
      @close="closeCropper"
    />
  </div>
</template>
