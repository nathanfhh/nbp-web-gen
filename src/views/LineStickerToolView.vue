<script setup>
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useLineStickerProcessor } from '@/composables/useLineStickerProcessor'
import { useLineStickerToolUI } from '@/composables/useLineStickerToolUI'
import SpecCheckCard from '@/components/SpecCheckCard.vue'
import CoverImageCard from '@/components/CoverImageCard.vue'

const router = useRouter()
const { t } = useI18n()

const {
  images,
  options,
  isProcessing,
  processProgress,
  mainImage,
  tabImage,
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
  setCoverImageFromSticker,
  setCoverImageFromFile,
  removeCoverImage,
} = useLineStickerProcessor()

const {
  isDragging,
  fileInput,
  showStickerPicker,
  pickerTarget,
  mainFileInput,
  tabFileInput,
  setImageRef,
  setupProcessingScroll,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  handleFileSelect,
  openFilePicker,
  openStickerPicker,
  selectStickerForCover,
  handleCoverFileSelect,
  getStatusClass,
  getDisplayDimensions,
  needsWarning,
  formatFailedItems,
  dimensionStats,
  fileSizeStats,
  evenDimensionStats,
  suggestedCount,
} = useLineStickerToolUI({
  images,
  LINE_SPECS,
  setCoverImageFromSticker,
  setCoverImageFromFile,
  addImages,
})

// Setup scroll watcher
setupProcessingScroll()

// Navigate back
const goBack = () => {
  router.push('/')
}

// Handle cover upload button click
const handleCoverUploadClick = (type) => {
  if (type === 'main') {
    mainFileInput.value?.click()
  } else {
    tabFileInput.value?.click()
  }
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
            : 'border-border-default hover:border-white/40 hover:bg-bg-muted'"
        >
          <input
            ref="fileInput"
            type="file"
            accept="image/png,image/*"
            multiple
            class="hidden"
            @change="handleFileSelect"
          />
          <svg class="w-12 h-12 mx-auto mb-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p class="text-text-secondary mb-2">{{ t('lineStickerTool.upload.dragDrop') }}</p>
          <p class="text-sm text-text-muted">{{ t('lineStickerTool.upload.hint') }}</p>
        </div>
      </section>

      <!-- Spec Checks -->
      <section v-if="images.length > 0" class="glass p-6">
        <h2 class="text-lg font-semibold mb-4">{{ t('lineStickerTool.specs.title') }}</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SpecCheckCard
            :passed="specChecks.fileSize.passed"
            :title="t('lineStickerTool.specs.fileSize')"
            :hint="t('lineStickerTool.specs.fileSizeHint')"
            :stats="{ original: fileSizeStats.originalOversized, remaining: fileSizeStats.stillOversized, hasProcessed: fileSizeStats.hasProcessed }"
            :stats-label="t('lineStickerTool.specs.itemsOversized')"
          />

          <SpecCheckCard
            :passed="specChecks.dimensions.passed"
            :title="t('lineStickerTool.specs.dimensions')"
            :hint="t('lineStickerTool.specs.dimensionsHint')"
            :stats="{ original: dimensionStats.originalOversized, remaining: dimensionStats.stillOversized, hasProcessed: dimensionStats.hasProcessed }"
            :stats-label="t('lineStickerTool.specs.itemsOversized')"
          />

          <SpecCheckCard
            :passed="specChecks.evenDimensions.passed"
            :title="t('lineStickerTool.specs.evenDimensions')"
            :hint="t('lineStickerTool.specs.evenDimensionsHint')"
            :stats="{ original: evenDimensionStats.originalOdd, remaining: evenDimensionStats.stillOdd, hasProcessed: evenDimensionStats.hasProcessed }"
            :stats-label="t('lineStickerTool.specs.itemsOddDimension')"
          />

          <SpecCheckCard
            :passed="specChecks.count.passed"
            :title="t('lineStickerTool.specs.count')"
            :hint="t('lineStickerTool.specs.countHint')"
            :extra-info="String(specChecks.count.current)"
            :warning-text="!specChecks.count.passed && suggestedCount ? `→ ${suggestedCount}` : ''"
          />

          <SpecCheckCard
            :passed="specChecks.format.passed"
            :title="t('lineStickerTool.specs.format')"
            :hint="t('lineStickerTool.specs.formatHint')"
            :warning-text="specChecks.format.failedItems.length > 0 ? formatFailedItems(specChecks.format.failedItems) : ''"
          />

          <SpecCheckCard
            :passed="specChecks.coverImages.passed"
            :title="t('lineStickerTool.specs.coverImages')"
            :hint="t('lineStickerTool.specs.coverImagesHint')"
            :warning-text="!specChecks.coverImages.passed
              ? [
                  !specChecks.coverImages.hasMain ? 'main.png' : '',
                  !specChecks.coverImages.hasTab ? 'tab.png' : ''
                ].filter(Boolean).join(', ') + ' ' + t('lineStickerTool.specs.notSet')
              : ''"
          />
        </div>

        <!-- All passed indicator -->
        <div v-if="allPassed" class="mt-4 p-3 rounded-lg bg-status-success-muted border border-status-success">
          <p class="text-status-success text-center font-medium">
            <svg class="w-5 h-5 inline-block mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {{ t('lineStickerTool.specs.allPassed') }}
          </p>
        </div>
      </section>

      <!-- Cover Image Settings -->
      <section v-if="images.length > 0" class="glass p-6">
        <h2 class="text-lg font-semibold mb-2">{{ t('lineStickerTool.cover.title') }}</h2>
        <p class="text-sm text-text-muted mb-4">{{ t('lineStickerTool.cover.description') }}</p>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <CoverImageCard
            type="main"
            :image="mainImage"
            :specs="LINE_SPECS.main"
            @open-picker="openStickerPicker"
            @upload-click="handleCoverUploadClick"
            @remove="removeCoverImage"
          />
          <input
            ref="mainFileInput"
            type="file"
            accept="image/*"
            class="hidden"
            @change="handleCoverFileSelect('main', $event)"
          />

          <CoverImageCard
            type="tab"
            :image="tabImage"
            :specs="LINE_SPECS.tab"
            @open-picker="openStickerPicker"
            @upload-click="handleCoverUploadClick"
            @remove="removeCoverImage"
          />
          <input
            ref="tabFileInput"
            type="file"
            accept="image/*"
            class="hidden"
            @change="handleCoverFileSelect('tab', $event)"
          />
        </div>
      </section>

      <!-- Image Preview Grid -->
      <section v-if="images.length > 0" class="glass p-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold">{{ t('lineStickerTool.preview.title') }}</h2>
          <button
            @click="clearAll"
            class="text-sm text-status-error hover:text-status-error transition-colors"
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
              <div class="absolute inset-0 checkerboard rounded-lg"></div>
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
                <svg class="w-8 h-8 text-mode-generate animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
              <!-- Warning badge -->
              <div v-if="needsWarning(img) && img.status === 'pending'" class="absolute top-2 right-2">
                <svg class="w-5 h-5 text-status-warning" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                </svg>
              </div>
              <!-- Processed badge -->
              <div v-if="img.status === 'processed'" class="absolute top-2 right-2">
                <svg class="w-5 h-5 text-status-success" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                </svg>
              </div>
              <!-- Remove button -->
              <button
                @click.stop="removeImage(img.id)"
                class="absolute top-2 left-2 p-1 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-status-error-solid"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <!-- Info -->
            <div class="mt-2 text-xs p-2 rounded-lg bg-glass-bg-strong backdrop-blur-sm shadow-card">
              <p class="text-text-secondary truncate" :title="img.name">#{{ index + 1 }} {{ img.name }}</p>
              <p v-if="img.status === 'processed' && img.wasScaled" class="text-text-muted">
                <span class="text-text-muted line-through">{{ img.width }} × {{ img.height }}</span>
                <span class="mx-1">→</span>
                <span class="text-status-success">{{ img.processedWidth }} × {{ img.processedHeight }}</span>
              </p>
              <p v-else class="text-text-muted">{{ getDisplayDimensions(img) }}</p>
              <p v-if="img.status === 'processed'" class="font-mono">
                <span class="text-text-muted line-through">{{ formatFileSize(img.size) }}</span>
                <span class="mx-1">→</span>
                <span :class="img.processedSize > LINE_SPECS.maxFileSize ? 'text-status-error' : 'text-status-success'">
                  {{ formatFileSize(img.processedSize) }}
                </span>
              </p>
              <p v-else class="font-mono" :class="img.size > LINE_SPECS.maxFileSize ? 'text-status-error' : 'text-text-muted'">
                {{ formatFileSize(img.size) }}
              </p>
              <div v-if="img.status === 'processed'" class="flex flex-wrap gap-1 mt-1">
                <span v-if="img.wasScaled" class="px-1.5 py-0.5 rounded text-[10px] bg-mode-generate-muted text-mode-generate">
                  {{ t('lineStickerTool.badge.scaled') }}
                </span>
                <span v-if="img.wasQuantized" class="px-1.5 py-0.5 rounded text-[10px] bg-status-warning-muted text-status-warning">
                  {{ t('lineStickerTool.badge.quantized') }}
                </span>
                <span v-if="!img.wasScaled && !img.wasQuantized" class="px-1.5 py-0.5 rounded text-[10px] bg-control-disabled text-text-secondary">
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
          <div class="space-y-3">
            <h3 class="text-sm font-medium text-text-secondary">{{ t('lineStickerTool.options.title') }}</h3>
            <div class="flex gap-4">
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  v-model="options.filenameFormat"
                  value="original"
                  class="w-4 h-4 text-[var(--primary)] bg-bg-interactive border-white/30 focus:ring-[var(--primary)]"
                />
                <span class="text-sm text-text-muted">{{ t('lineStickerTool.options.original') }}</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  v-model="options.filenameFormat"
                  value="sequential"
                  class="w-4 h-4 text-[var(--primary)] bg-bg-interactive border-white/30 focus:ring-[var(--primary)]"
                />
                <span class="text-sm text-text-muted">{{ t('lineStickerTool.options.sequential') }}</span>
              </label>
            </div>
          </div>

          <div class="flex gap-3">
            <button
              v-if="needsProcessing"
              @click="processImages"
              :disabled="isProcessing"
              class="btn-premium px-6 py-2.5 text-text-primary"
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
        <svg class="w-16 h-16 mx-auto text-text-muted mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p class="text-text-muted">{{ t('lineStickerTool.empty.hint') }}</p>
        <p class="text-sm text-text-muted mt-2">{{ t('lineStickerTool.empty.specs') }}</p>
      </section>
    </main>

    <!-- Sticker Picker Modal -->
    <Teleport to="body">
      <div
        v-if="showStickerPicker"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        @click.self="showStickerPicker = false"
      >
        <div class="absolute inset-0 bg-black/70 backdrop-blur-sm"></div>
        <div class="relative w-full max-w-2xl max-h-[80vh] bg-bg-card rounded-2xl shadow-2xl overflow-hidden border border-border-subtle">
          <div class="flex items-center justify-between p-4 border-b border-border-muted">
            <h3 class="text-lg font-semibold">
              {{ t('lineStickerTool.cover.selectSticker') }}
              <span class="text-sm font-normal text-text-muted ml-2">
                ({{ pickerTarget === 'main' ? 'main.png' : 'tab.png' }})
              </span>
            </h3>
            <button
              @click="showStickerPicker = false"
              class="p-2 rounded-lg hover:bg-bg-interactive transition-colors"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="p-4 overflow-y-auto max-h-[calc(80vh-80px)]">
            <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
              <button
                v-for="img in images"
                :key="img.id"
                @click="selectStickerForCover(img.id)"
                class="aspect-square rounded-lg overflow-hidden border-2 border-transparent hover:border-[var(--primary)] transition-all group"
              >
                <div class="w-full h-full checkerboard relative">
                  <img
                    :src="img.preview"
                    :alt="img.name"
                    class="w-full h-full object-contain group-hover:scale-105 transition-transform"
                  />
                </div>
              </button>
            </div>
            <p v-if="images.length === 0" class="text-center text-text-muted py-8">
              {{ t('lineStickerTool.cover.noStickers') }}
            </p>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.checkerboard {
  background-image:
    linear-gradient(45deg, var(--color-accent-checkerboard) 25%, transparent 25%),
    linear-gradient(-45deg, var(--color-accent-checkerboard) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--color-accent-checkerboard) 75%),
    linear-gradient(-45deg, transparent 75%, var(--color-accent-checkerboard) 75%);
  background-size: 12px 12px;
  background-position: 0 0, 0 6px, 6px -6px, -6px 0px;
}
</style>
