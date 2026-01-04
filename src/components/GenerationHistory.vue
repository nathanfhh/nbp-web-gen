<script setup>
import { ref, computed } from 'vue'
import { useGeneratorStore } from '@/stores/generator'
import { useImageStorage } from '@/composables/useImageStorage'
import { formatFileSize } from '@/composables/useImageCompression'
import ConfirmModal from '@/components/ConfirmModal.vue'
import ImageLightbox from '@/components/ImageLightbox.vue'

const store = useGeneratorStore()
const imageStorage = useImageStorage()
const confirmModal = ref(null)

// Lightbox state
const showLightbox = ref(false)
const lightboxImages = ref([])
const lightboxMetadata = ref([])
const lightboxInitialIndex = ref(0)
const isLoadingImages = ref(false)

// Format storage usage
const formattedStorageUsage = computed(() => formatFileSize(store.storageUsage))

const modeLabels = {
  generate: '生成',
  edit: '編輯',
  story: '故事',
  diagram: '圖表',
}

const formatTime = (timestamp) => {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now - date

  if (diff < 60000) return '剛剛'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分鐘前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小時前`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`

  return date.toLocaleDateString('zh-TW', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const truncatePrompt = (prompt, maxLength = 60) => {
  if (prompt.length <= maxLength) return prompt
  return prompt.slice(0, maxLength) + '...'
}

const loadHistoryItem = async (item) => {
  const confirmed = await confirmModal.value?.show({
    title: '載入紀錄',
    message: '載入此紀錄將會覆蓋目前的輸入和設定，確定要繼續嗎？',
    confirmText: '載入',
    cancelText: '取消',
  })

  if (!confirmed) return

  store.prompt = item.prompt
  store.setMode(item.mode)
  store.temperature = item.options?.temperature ?? 1.0
  store.seed = item.options?.seed ?? ''

  if (item.mode === 'generate' && item.options) {
    store.generateOptions.resolution = item.options.resolution || '1k'
    store.generateOptions.ratio = item.options.ratio || '1:1'
    // Use splice to maintain reactivity instead of direct assignment
    store.generateOptions.styles.splice(0, store.generateOptions.styles.length, ...(item.options.styles || []))
    store.generateOptions.variations.splice(0, store.generateOptions.variations.length, ...(item.options.variations || []))
  } else if (item.mode === 'story' && item.options) {
    Object.assign(store.storyOptions, item.options)
  } else if (item.mode === 'diagram' && item.options) {
    Object.assign(store.diagramOptions, item.options)
  }
}

const deleteItem = async (id, event) => {
  event.stopPropagation()

  const confirmed = await confirmModal.value?.show({
    title: '刪除紀錄',
    message: '確定要刪除此紀錄嗎？',
    confirmText: '刪除',
    cancelText: '取消',
  })

  if (!confirmed) return
  await store.removeFromHistory(id)
}

const clearAll = async () => {
  const confirmed = await confirmModal.value?.show({
    title: '清除全部',
    message: '確定要清除所有歷史紀錄嗎？此操作無法復原。',
    confirmText: '清除全部',
    cancelText: '取消',
  })

  if (confirmed) {
    await store.clearHistory()
  }
}

// Open lightbox for history images
const openHistoryLightbox = async (item, event) => {
  event.stopPropagation()

  if (!item.images || item.images.length === 0) return

  isLoadingImages.value = true

  try {
    // Load images from OPFS
    const loadedImages = await imageStorage.loadHistoryImages(item)
    lightboxImages.value = loadedImages
    lightboxMetadata.value = item.images
    lightboxInitialIndex.value = 0
    showLightbox.value = true
  } catch (err) {
    console.error('Failed to load history images:', err)
  } finally {
    isLoadingImages.value = false
  }
}

const closeLightbox = () => {
  showLightbox.value = false
  lightboxImages.value = []
  lightboxMetadata.value = []
}
</script>

<template>
  <div class="glass p-6">
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-semibold text-white flex items-center gap-2">
        <svg class="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        歷史紀錄
        <span v-if="store.historyCount > 0" class="badge">{{ store.historyCount }}</span>
      </h3>
      <button
        v-if="store.history.length > 0"
        @click="clearAll"
        class="text-xs text-gray-500 hover:text-red-400 transition-colors"
      >
        清除全部
      </button>
    </div>

    <!-- Storage Usage -->
    <div v-if="store.storageUsage > 0" class="mb-4 flex items-center gap-2 text-xs text-gray-500">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
      </svg>
      <span>儲存空間：{{ formattedStorageUsage }}</span>
    </div>

    <div v-if="store.history.length > 0" class="space-y-3 max-h-[400px] overflow-y-auto -mr-3 pr-3 history-scroll">
      <div
        v-for="item in store.history"
        :key="item.id"
        @click="loadHistoryItem(item)"
        class="history-item group"
      >
        <div class="flex items-start gap-3">
          <!-- Thumbnail (if images exist) -->
          <div
            v-if="item.images && item.images.length > 0"
            @click="openHistoryLightbox(item, $event)"
            class="relative flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-purple-400 transition-all"
          >
            <img
              :src="`data:image/webp;base64,${item.images[0].thumbnail}`"
              :alt="`History image ${item.id}`"
              class="w-full h-full object-cover"
            />
            <div
              v-if="item.images.length > 1"
              class="absolute bottom-0 right-0 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded-tl-md font-medium"
            >
              +{{ item.images.length - 1 }}
            </div>
          </div>

          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-2">
              <span
                class="text-xs px-2 py-0.5 rounded-md font-medium"
                :class="{
                  'bg-purple-500/20 text-purple-300': item.mode === 'generate',
                  'bg-cyan-500/20 text-cyan-300': item.mode === 'edit',
                  'bg-amber-500/20 text-amber-300': item.mode === 'story',
                  'bg-emerald-500/20 text-emerald-300': item.mode === 'diagram',
                }"
              >
                {{ modeLabels[item.mode] || item.mode }}
              </span>
              <span class="text-xs text-gray-500">
                {{ formatTime(item.timestamp) }}
              </span>
            </div>
            <p class="text-sm text-gray-300 truncate">
              {{ truncatePrompt(item.prompt) }}
            </p>
            <div v-if="item.status" class="mt-2">
              <span
                class="text-xs px-2 py-0.5 rounded-md"
                :class="item.status === 'success' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'"
              >
                {{ item.status === 'success' ? '成功' : '失敗' }}
              </span>
            </div>
          </div>
          <button
            @click="deleteItem(item.id, $event)"
            class="opacity-0 group-hover:opacity-100 p-2 rounded-lg hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-all flex-shrink-0"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <div v-else class="text-center py-8">
      <div class="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mx-auto mb-4">
        <svg class="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <p class="text-sm text-gray-500">尚無歷史紀錄</p>
    </div>

    <!-- Confirm Modal -->
    <ConfirmModal ref="confirmModal" />

    <!-- Loading Overlay -->
    <div v-if="isLoadingImages" class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
      <div class="flex flex-col items-center gap-3">
        <svg class="w-8 h-8 animate-spin text-purple-400" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
        </svg>
        <span class="text-white text-sm">載入圖片中...</span>
      </div>
    </div>

    <!-- Image Lightbox -->
    <ImageLightbox
      v-model="showLightbox"
      :images="lightboxImages"
      :image-metadata="lightboxMetadata"
      :initial-index="lightboxInitialIndex"
      :is-historical="true"
      @close="closeLightbox"
    />
  </div>
</template>

<style scoped>
.history-scroll::-webkit-scrollbar {
  width: 6px;
}

.history-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.history-scroll::-webkit-scrollbar-thumb {
  background: rgba(139, 92, 246, 0.3);
  border-radius: 3px;
}

.history-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(139, 92, 246, 0.5);
}

/* Firefox */
.history-scroll {
  scrollbar-width: thin;
  scrollbar-color: rgba(139, 92, 246, 0.3) transparent;
}
</style>
