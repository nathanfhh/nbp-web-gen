<script setup>
import { ref, computed, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-tw'
import 'dayjs/locale/en'
import { useGeneratorStore } from '@/stores/generator'
import { useImageStorage } from '@/composables/useImageStorage'
import { formatFileSize } from '@/composables/useImageCompression'
import ConfirmModal from '@/components/ConfirmModal.vue'
import ImageLightbox from '@/components/ImageLightbox.vue'

dayjs.extend(relativeTime)

const { t, locale } = useI18n()

// Sync dayjs locale with i18n locale
watchEffect(() => {
  const dayjsLocale = locale.value === 'zh-TW' ? 'zh-tw' : 'en'
  dayjs.locale(dayjsLocale)
})
const store = useGeneratorStore()
const imageStorage = useImageStorage()
const confirmModal = ref(null)

// Lightbox state
const showLightbox = ref(false)
const lightboxImages = ref([])
const lightboxMetadata = ref([])
const lightboxHistoryId = ref(null)
const lightboxInitialIndex = ref(0)
const isLoadingImages = ref(false)

// Format storage usage
const formattedStorageUsage = computed(() => formatFileSize(store.storageUsage))

const modeLabels = computed(() => ({
  generate: t('modes.generate.name'),
  edit: t('modes.edit.name'),
  story: t('modes.story.name'),
  diagram: t('modes.diagram.name'),
  sticker: t('modes.sticker.name'),
}))

// Track the current lightbox item's mode
const lightboxItemMode = ref('')

// Tooltip state for mobile tap support
const activeTooltipId = ref(null)

const toggleTooltip = (id, event) => {
  event.stopPropagation()
  activeTooltipId.value = activeTooltipId.value === id ? null : id
}

const formatTime = (timestamp) => {
  return dayjs(timestamp).fromNow()
}

const formatFullTime = (timestamp) => {
  return dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss')
}

const truncatePrompt = (prompt, maxLength = 60) => {
  if (prompt.length <= maxLength) return prompt
  return prompt.slice(0, maxLength) + '...'
}

const loadHistoryItem = async (item) => {
  const confirmed = await confirmModal.value?.show({
    title: t('history.loadConfirmTitle'),
    message: t('history.loadConfirmMessage'),
    confirmText: t('history.loadConfirmButton'),
    cancelText: t('common.cancel'),
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
  } else if (item.mode === 'sticker' && item.options) {
    store.stickerOptions.resolution = item.options.resolution || '1k'
    store.stickerOptions.ratio = item.options.ratio || '1:1'
    store.stickerOptions.styles.splice(0, store.stickerOptions.styles.length, ...(item.options.styles || []))
    // Layout
    store.stickerOptions.layoutRows = item.options.layoutRows || 3
    store.stickerOptions.layoutCols = item.options.layoutCols || 3
    // Context
    store.stickerOptions.context = item.options.context || 'chat'
    store.stickerOptions.customContext = item.options.customContext || ''
    // Text related
    store.stickerOptions.hasText = item.options.hasText ?? true
    store.stickerOptions.tones.splice(0, store.stickerOptions.tones.length, ...(item.options.tones || []))
    store.stickerOptions.customTone = item.options.customTone || ''
    store.stickerOptions.languages.splice(0, store.stickerOptions.languages.length, ...(item.options.languages || ['zh-TW']))
    store.stickerOptions.customLanguage = item.options.customLanguage || ''
    // Composition
    store.stickerOptions.cameraAngles.splice(0, store.stickerOptions.cameraAngles.length, ...(item.options.cameraAngles || ['headshot']))
    store.stickerOptions.expressions.splice(0, store.stickerOptions.expressions.length, ...(item.options.expressions || ['natural']))
  } else if (item.mode === 'story' && item.options) {
    Object.assign(store.storyOptions, item.options)
  } else if (item.mode === 'diagram' && item.options) {
    Object.assign(store.diagramOptions, item.options)
  }
}

const deleteItem = async (id, event) => {
  event.stopPropagation()

  const confirmed = await confirmModal.value?.show({
    title: t('history.deleteConfirmTitle'),
    message: t('history.deleteConfirmMessage'),
    confirmText: t('common.delete'),
    cancelText: t('common.cancel'),
  })

  if (!confirmed) return
  await store.removeFromHistory(id)
}

const clearAll = async () => {
  const confirmed = await confirmModal.value?.show({
    title: t('history.clearConfirmTitle'),
    message: t('history.clearConfirmMessage'),
    confirmText: t('history.clearConfirmButton'),
    cancelText: t('common.cancel'),
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
    lightboxHistoryId.value = item.id
    lightboxInitialIndex.value = 0
    lightboxItemMode.value = item.mode || ''
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
  lightboxHistoryId.value = null
  lightboxItemMode.value = ''
}
</script>

<template>
  <div class="glass p-6">
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-semibold text-white flex items-center gap-2">
        <svg class="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {{ $t('history.title') }}
        <span v-if="store.historyCount > 0" class="badge">{{ store.historyCount }}</span>
      </h3>
      <button
        v-if="store.history.length > 0"
        @click="clearAll"
        class="text-xs text-gray-500 hover:text-red-400 transition-colors"
      >
        {{ $t('common.clearAll') }}
      </button>
    </div>

    <!-- Storage Usage -->
    <div v-if="store.storageUsage > 0" class="mb-4 flex items-center gap-2 text-xs text-gray-500">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
      </svg>
      <span>{{ $t('history.storage', { size: formattedStorageUsage }) }}</span>
    </div>

    <div v-if="store.history.length > 0" class="space-y-3 max-h-[400px] overflow-y-auto -mr-4 pr-[5px] history-scroll">
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
            class="flex-shrink-0 flex flex-col items-center gap-1"
          >
            <div
              @click="openHistoryLightbox(item, $event)"
              class="relative w-14 h-14 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-purple-400 transition-all"
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
            <span class="text-xs text-gray-600">#{{ item.id }}</span>
          </div>

          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-2">
              <span
                class="text-xs px-2 py-0.5 rounded-md font-medium"
                :class="{
                  'bg-purple-500/20 text-purple-300': item.mode === 'generate',
                  'bg-pink-500/20 text-pink-300': item.mode === 'sticker',
                  'bg-cyan-500/20 text-cyan-300': item.mode === 'edit',
                  'bg-amber-500/20 text-amber-300': item.mode === 'story',
                  'bg-emerald-500/20 text-emerald-300': item.mode === 'diagram',
                }"
              >
                {{ modeLabels[item.mode] || item.mode }}
              </span>
              <span class="relative group/time">
                <span
                  class="text-xs text-gray-500 cursor-pointer select-none"
                  @click="toggleTooltip(item.id, $event)"
                >
                  {{ formatTime(item.timestamp) }}
                </span>
                <span
                  class="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 text-xs text-gray-800 dark:text-white bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 backdrop-blur-sm rounded-md whitespace-nowrap transition-all duration-200 pointer-events-none z-50 shadow-lg"
                  :class="activeTooltipId === item.id ? 'opacity-100 visible' : 'opacity-0 invisible md:group-hover/time:opacity-100 md:group-hover/time:visible'"
                >
                  {{ formatFullTime(item.timestamp) }}
                </span>
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
                {{ item.status === 'success' ? $t('history.status.success') : $t('history.status.failed') }}
              </span>
            </div>
          </div>
          <button
            @click="deleteItem(item.id, $event)"
            class="opacity-50 md:opacity-0 group-hover:opacity-100 p-2 rounded-lg hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-all flex-shrink-0"
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
      <p class="text-sm text-gray-500">{{ $t('history.empty') }}</p>
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
        <span class="text-white text-sm">{{ $t('history.loadingImages') }}</span>
      </div>
    </div>

    <!-- Image Lightbox -->
    <ImageLightbox
      v-model="showLightbox"
      :images="lightboxImages"
      :image-metadata="lightboxMetadata"
      :initial-index="lightboxInitialIndex"
      :history-id="lightboxHistoryId"
      :is-historical="true"
      :is-sticker-mode="lightboxItemMode === 'sticker'"
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
