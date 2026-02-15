<script setup>
import { ref, computed, watchEffect, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-tw'
import 'dayjs/locale/en'
import { useGeneratorStore } from '@/stores/generator'
import { useImageStorage } from '@/composables/useImageStorage'
import { useVideoStorage } from '@/composables/useVideoStorage'
import { useAudioStorage } from '@/composables/useAudioStorage'
import { useConversationStorage } from '@/composables/useConversationStorage'
import { formatFileSize } from '@/composables/useImageCompression'
import { getModeTagStyle } from '@/constants'
import ConfirmModal from '@/components/ConfirmModal.vue'
import ImageLightbox from '@/components/ImageLightbox.vue'
import VideoLightbox from '@/components/VideoLightbox.vue'
import HistoryTransfer from '@/components/HistoryTransfer.vue'
import SearchModal from '@/components/SearchModal.vue'

dayjs.extend(relativeTime)

const { t, locale } = useI18n()

// Sync dayjs locale with i18n locale
watchEffect(() => {
  const dayjsLocale = locale.value === 'zh-TW' ? 'zh-tw' : 'en'
  dayjs.locale(dayjsLocale)
})
const store = useGeneratorStore()
const imageStorage = useImageStorage()
const videoStorage = useVideoStorage()
const audioStorage = useAudioStorage()
const conversationStorage = useConversationStorage()
const confirmModal = ref(null)

// Filter state
const selectedFilter = ref('all')
const filterOptions = ['all', 'generate', 'sticker', 'edit', 'story', 'diagram', 'video', 'slides', 'agent']

const filteredHistory = computed(() => {
  if (selectedFilter.value === 'all') {
    return store.history
  }
  return store.history.filter((item) => item.mode === selectedFilter.value)
})

// Lightbox state
const showLightbox = ref(false)
const lightboxImages = ref([])
const lightboxMetadata = ref([])
const lightboxHistoryId = ref(null)
const lightboxInitialIndex = ref(0)
const lightboxAudioUrls = ref([])
const isLoadingImages = ref(false)

// Video Lightbox state
const showVideoLightbox = ref(false)
const videoUrl = ref(null)
const videoMetadata = ref(null)
const isLoadingVideo = ref(false)

// Format storage usage
const formattedStorageUsage = computed(() => formatFileSize(store.storageUsage))

const modeLabels = computed(() => ({
  generate: t('modes.generate.name'),
  edit: t('modes.edit.name'),
  story: t('modes.story.name'),
  diagram: t('modes.diagram.name'),
  sticker: t('modes.sticker.name'),
  video: t('modes.video.name'),
  slides: t('modes.slides.name'),
  agent: t('modes.agent.name'),
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

/**
 * Calculate total size of a history item (images + video)
 * @param {Object} item - History item
 * @returns {string} Formatted size string (KB or MB)
 */
const getItemSize = (item) => {
  let totalBytes = 0

  // Sum image sizes (compressedSize)
  if (item.images?.length > 0) {
    totalBytes += item.images.reduce((sum, img) => sum + (img.compressedSize || 0), 0)
  }

  // Add video size
  if (item.video?.size) {
    totalBytes += item.video.size
  }

  if (totalBytes === 0) return null

  const kb = totalBytes / 1024
  if (kb >= 1000) {
    const mb = kb / 1024
    return `${mb.toFixed(2)} MB`
  }
  return `${Math.round(kb)} KB`
}

const getStatusClass = (status) => {
  switch (status) {
    case 'success':
      return 'bg-status-success-muted text-status-success'
    case 'partial':
      return 'bg-status-warning-muted text-status-warning'
    case 'failed':
      return 'bg-status-error-muted text-status-error'
    default:
      console.warn('Unknown history status:', status)
      return 'bg-bg-muted text-text-muted'
  }
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

  // Agent mode doesn't use store.prompt - setMode will clear it, but don't set it first to avoid race conditions
  if (item.mode !== 'agent') {
    store.prompt = item.prompt
  }
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
  } else if (item.mode === 'video' && item.options) {
    // Restore video options (resolution, ratio, duration, model, subMode, etc.)
    store.videoOptions.resolution = item.options.resolution || '720p'
    store.videoOptions.ratio = item.options.ratio || '16:9'
    store.videoOptions.duration = item.options.duration || 8
    store.videoOptions.model = item.options.model || 'fast'
    store.videoOptions.subMode = item.options.subMode || 'text-to-video'
    store.videoOptions.negativePrompt = item.options.negativePrompt || ''

    // Restore video prompt builder options if available
    if (item.options.videoPromptOptions) {
      const vpo = item.options.videoPromptOptions
      // Reset arrays using splice to maintain reactivity
      store.videoPromptOptions.styles.splice(0, store.videoPromptOptions.styles.length, ...(vpo.styles || []))
      store.videoPromptOptions.cameras.splice(0, store.videoPromptOptions.cameras.length, ...(vpo.cameras || []))
      store.videoPromptOptions.lenses.splice(0, store.videoPromptOptions.lenses.length, ...(vpo.lenses || []))
      store.videoPromptOptions.ambiances.splice(0, store.videoPromptOptions.ambiances.length, ...(vpo.ambiances || []))
      store.videoPromptOptions.actions.splice(0, store.videoPromptOptions.actions.length, ...(vpo.actions || []))
      store.videoPromptOptions.negatives.splice(0, store.videoPromptOptions.negatives.length, ...(vpo.negatives || []))
      // Restore string fields
      store.videoPromptOptions.customStyle = vpo.customStyle || ''
      store.videoPromptOptions.customAmbiance = vpo.customAmbiance || ''
      store.videoPromptOptions.customAction = vpo.customAction || ''
      store.videoPromptOptions.customNegative = vpo.customNegative || ''
      store.videoPromptOptions.composition = vpo.composition || ''
      store.videoPromptOptions.dialogue = vpo.dialogue || ''
      store.videoPromptOptions.soundEffects = vpo.soundEffects || ''
      store.videoPromptOptions.ambientSound = vpo.ambientSound || ''
    }
  } else if (item.mode === 'slides' && item.options) {
    // Restore slides options
    store.slidesOptions.resolution = item.options.resolution || '1k'
    store.slidesOptions.ratio = item.options.ratio || '16:9'
    store.slidesOptions.analysisModel = item.options.analysisModel || 'gemini-3-flash-preview'
    store.slidesOptions.analyzedStyle = item.options.analyzedStyle || ''
    store.slidesOptions.styleConfirmed = item.options.styleConfirmed || false
    store.slidesOptions.styleGuidance = item.options.styleGuidance || ''
    // Note: temperature and seed are already restored at store level (line 134-135)

    // Restore pagesRaw (this will trigger parsePages via watch)
    if (item.options.pagesRaw) {
      store.slidesOptions.pagesRaw = item.options.pagesRaw

      // Restore per-page styleGuides after pages are parsed
      // Use nextTick to ensure parsePages has completed via watch
      if (item.options.pageStyleGuides?.length > 0) {
        nextTick(() => {
          for (const psg of item.options.pageStyleGuides) {
            const pageIndex = store.slidesOptions.pages.findIndex(
              (p) => p.pageNumber === psg.pageNumber,
            )
            if (pageIndex !== -1) {
              store.slidesOptions.pages[pageIndex].styleGuide = psg.styleGuide
            }
          }
        })
      }
    }

    // Restore narration settings from record.narration
    if (item.narration?.settings) {
      const ns = item.narration.settings
      store.slidesOptions.narration.speakerMode = ns.speakerMode || 'single'
      store.slidesOptions.narration.speakers = ns.speakers || [
        { name: 'Speaker 1', voiceName: 'Zephyr' },
        { name: 'Speaker 2', voiceName: 'Puck' },
      ]
      store.slidesOptions.narration.style = ns.style || 'discussion'
      store.slidesOptions.narration.language = ns.language || 'en-US'
      store.slidesOptions.narration.scriptModel = ns.scriptModel || 'gemini-3-flash-preview'
      store.slidesOptions.narration.ttsModel = ns.ttsModel || 'gemini-2.5-flash-preview-tts'
      store.slidesOptions.narration.customLanguages = ns.customLanguages || []
      store.slidesOptions.narration.customPrompt = ns.customPrompt || ''
      // Enable narration if we have settings (user had configured it before)
      store.slidesOptions.narration.enabled = true
    }

    // Restore narration scripts and global style directive
    if (item.narration?.scripts?.length > 0) {
      store.slidesOptions.narrationScripts = item.narration.scripts
    }
    if (item.narration?.globalStyleDirective) {
      store.slidesOptions.narrationGlobalStyle = item.narration.globalStyleDirective
    }
  } else if (item.mode === 'agent') {
    // Load agent conversation from OPFS and continue
    const loaded = await store.loadAgentFromHistory(item.id)
    if (!loaded) {
      // Fallback: just restore options if conversation not found
      store.agentOptions.contextDepth = item.options?.contextDepth || 5
    }
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
  event?.stopPropagation()

  // Allow opening if has images OR has narration audio (slides mode)
  const hasImages = item.images && item.images.length > 0
  const hasAudioOnly = item.mode === 'slides' && item.narration?.audio?.length > 0

  if (!hasImages && !hasAudioOnly) return

  isLoadingImages.value = true

  try {
    // Load images from OPFS (may be empty array for audio-only case)
    const loadedImages = hasImages ? await imageStorage.loadHistoryImages(item) : []
    lightboxImages.value = loadedImages
    lightboxMetadata.value = item.images || []
    lightboxHistoryId.value = item.id
    lightboxInitialIndex.value = 0
    lightboxItemMode.value = item.mode || ''

    // Load narration audio URLs if available
    lightboxAudioUrls.value = []
    if (item.narration?.audio?.length > 0) {
      const audioUrls = []
      for (const audioMeta of item.narration.audio) {
        try {
          const url = await audioStorage.loadAudio(audioMeta.opfsPath)
          audioUrls[audioMeta.pageIndex] = url
        } catch {
          // Skip failed audio loads
        }
      }
      lightboxAudioUrls.value = audioUrls
    }

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
  lightboxAudioUrls.value = []
}

// Open video lightbox
const openVideoLightbox = async (item, event) => {
  event?.stopPropagation()

  if (!item.video) return

  isLoadingVideo.value = true

  try {
    // Load video from OPFS
    const loadedVideo = await videoStorage.loadHistoryVideo(item)
    if (loadedVideo?.url) {
      videoUrl.value = loadedVideo.url
      videoMetadata.value = {
        ...item.video,
        historyId: item.id,
        prompt: item.prompt,
      }
      showVideoLightbox.value = true
    }
  } catch (err) {
    console.error('Failed to load video:', err)
  } finally {
    isLoadingVideo.value = false
  }
}

const closeVideoLightbox = () => {
  showVideoLightbox.value = false
  videoUrl.value = null
  videoMetadata.value = null
}

// Open lightbox for agent mode images
const openAgentLightbox = async (item, event) => {
  if (item.mode !== 'agent') return

  // Only open lightbox if there's a thumbnail (indicates images exist)
  // If no thumbnail, let the click bubble up to loadHistoryItem
  if (!item.thumbnail) return

  event?.stopPropagation()

  isLoadingImages.value = true

  try {
    // Load conversation from OPFS
    const opfsPath = `/conversations/${item.id}/conversation.json`
    const conversation = await conversationStorage.loadConversation(opfsPath)

    if (!conversation || conversation.length === 0) {
      console.warn('[openAgentLightbox] No conversation found')
      return
    }

    // Collect all image parts from conversation
    const images = []
    for (const msg of conversation) {
      if (!msg.parts) continue
      for (const part of msg.parts) {
        if (part.dataStoredExternally && part.imageIndex !== undefined) {
          try {
            // Load image from OPFS
            const imagePath = `/images/${item.id}/${part.imageIndex}.webp`
            const base64 = await imageStorage.getImageBase64(imagePath)
            if (base64) {
              images.push({
                data: base64,
                mimeType: 'image/webp',
              })
            }
          } catch (err) {
            console.warn('[openAgentLightbox] Failed to load image:', part.imageIndex, err)
          }
        }
      }
    }

    if (images.length === 0) {
      console.warn('[openAgentLightbox] No images found in conversation')
      return
    }

    // Convert to format expected by lightbox (object with data/mimeType or url)
    lightboxImages.value = images.map((img) => ({
      data: img.data,
      mimeType: img.mimeType,
    }))
    lightboxMetadata.value = images.map(() => ({})) // Empty metadata for agent images
    lightboxHistoryId.value = item.id
    lightboxInitialIndex.value = 0
    lightboxItemMode.value = 'agent'
    lightboxAudioUrls.value = []

    showLightbox.value = true
  } catch (err) {
    console.error('[openAgentLightbox] Failed:', err)
  } finally {
    isLoadingImages.value = false
  }
}

// Search modal
const showSearchModal = ref(false)

const handleSearchOpenLightbox = async (item) => {
  if (item.mode === 'video') {
    await openVideoLightbox(item)
  } else if (item.mode === 'agent') {
    await openAgentLightbox(item)
  } else {
    await openHistoryLightbox(item)
  }
}

// History transfer (export/import)
const showTransfer = ref(false)

const handleImported = async () => {
  // Reload history after import
  await store.loadHistory()
  await store.updateStorageUsage()
  window.dispatchEvent(new CustomEvent('nbp-history-imported'))
}
</script>

<template>
  <div class="glass p-6">
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-semibold text-text-primary flex items-center gap-2">
        <svg class="w-5 h-5 text-mode-generate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {{ $t('history.title') }}
        <span v-if="store.historyCount > 0" class="badge">{{ store.historyCount }}</span>
      </h3>
      <div class="flex items-center gap-2">
        <!-- Search button -->
        <button
          @click="showSearchModal = true"
          class="p-1.5 rounded-lg hover:bg-bg-interactive text-text-muted hover:text-mode-generate transition-all"
          :title="$t('search.title')"
          :aria-label="$t('search.title')"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
        <!-- Transfer (Export/Import) button -->
        <button
          @click="showTransfer = true"
          class="p-1.5 rounded-lg hover:bg-bg-interactive text-text-muted hover:text-mode-generate transition-all"
          :title="$t('historyTransfer.title')"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
        </button>
        <!-- Clear all button -->
        <button
          v-if="store.history.length > 0"
          @click="clearAll"
          class="text-xs text-text-muted hover:text-status-error transition-colors"
        >
          {{ $t('common.clearAll') }}
        </button>
      </div>
    </div>

    <!-- Storage Usage -->
    <div v-if="store.storageUsage > 0" class="mb-4 flex items-center gap-2 text-xs text-text-muted">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
      </svg>
      <span>{{ $t('history.storage', { size: formattedStorageUsage }) }}</span>
    </div>

    <!-- Filter Buttons -->
    <div v-if="store.history.length > 0" class="mb-4 flex flex-wrap gap-2">
      <button
        v-for="filter in filterOptions"
        :key="filter"
        @click="selectedFilter = filter"
        class="text-xs px-2.5 py-1 rounded-md font-medium transition-all"
        :class="
          selectedFilter === filter
            ? 'bg-brand-primary text-text-on-brand'
            : 'bg-bg-muted text-text-secondary hover:bg-bg-interactive'
        "
      >
        {{ filter === 'all' ? $t('history.filter.all') : modeLabels[filter] }}
      </button>
    </div>

    <div v-if="filteredHistory.length > 0" class="space-y-3 max-h-[400px] overflow-y-auto -mr-4 pr-[5px] history-scroll">
      <div
        v-for="item in filteredHistory"
        :key="item.id"
        @click="loadHistoryItem(item)"
        class="history-item group"
      >
        <div class="flex items-start gap-3">
          <!-- Video Thumbnail -->
          <div
            v-if="item.video && item.video.thumbnail"
            class="flex-shrink-0 flex flex-col items-center gap-1"
          >
            <div
              @click="openVideoLightbox(item, $event)"
              class="relative w-14 h-14 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-brand-primary-light transition-all"
            >
              <img
                :src="item.video.thumbnail"
                :alt="`History video ${item.id}`"
                class="w-full h-full object-cover"
              />
              <!-- Video indicator icon -->
              <div class="absolute inset-0 flex items-center justify-center bg-black/30">
                <svg class="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
            <span class="text-xs text-text-muted font-mono">#{{ item.id }}</span>
          </div>

          <!-- Image Thumbnail (if images exist) -->
          <div
            v-else-if="item.images && item.images.length > 0"
            class="flex-shrink-0 flex flex-col items-center gap-1"
          >
            <div
              @click="openHistoryLightbox(item, $event)"
              class="relative w-14 h-14 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-brand-primary-light transition-all"
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
              <!-- Audio indicator -->
              <div
                v-if="item.narration?.audio?.length > 0"
                class="absolute top-0 right-0 bg-black/70 text-white p-0.5 rounded-bl-md"
              >
                <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                </svg>
              </div>
            </div>
            <span class="text-xs text-text-muted font-mono">#{{ item.id }}</span>
          </div>

          <!-- Agent Mode (thumbnail or chat icon with message count) -->
          <div
            v-else-if="item.mode === 'agent'"
            class="flex-shrink-0 flex flex-col items-center gap-1"
          >
            <div
              @click="openAgentLightbox(item, $event)"
              class="relative w-14 h-14 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-brand-primary-light transition-all"
              :class="item.thumbnail ? '' : 'bg-mode-generate-muted flex items-center justify-center'"
            >
              <!-- Thumbnail if available -->
              <img
                v-if="item.thumbnail"
                :src="'data:image/webp;base64,' + item.thumbnail"
                :alt="item.prompt"
                class="w-full h-full object-cover"
              />
              <!-- Fallback chat bubble icon -->
              <svg v-else class="w-6 h-6 text-mode-generate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <!-- Image count badge -->
              <div
                v-if="item.imageCount"
                class="absolute bottom-0 right-0 bg-mode-generate text-text-on-brand text-xs px-1.5 py-0.5 rounded-tl-md font-medium"
              >
                {{ item.imageCount }}
              </div>
            </div>
            <span class="text-xs text-text-muted font-mono">#{{ item.id }}</span>
          </div>

          <!-- Audio-only Placeholder (slides mode: no images but has audio) -->
          <div
            v-else-if="item.mode === 'slides' && item.narration?.audio?.length > 0"
            class="flex-shrink-0 flex flex-col items-center gap-1"
          >
            <div
              @click="openHistoryLightbox(item, $event)"
              class="relative w-14 h-14 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-brand-primary-light transition-all bg-bg-muted flex items-center justify-center"
            >
              <!-- Microphone icon as placeholder -->
              <svg class="w-6 h-6 text-text-muted" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z"/>
              </svg>
              <!-- Audio count badge -->
              <div class="absolute bottom-0 right-0 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded-tl-md font-medium">
                {{ item.narration.audio.length }}
              </div>
            </div>
            <span class="text-xs text-text-muted font-mono">#{{ item.id }}</span>
          </div>

          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-2">
              <span
                class="text-xs px-2 py-0.5 rounded-md font-medium"
                :class="getModeTagStyle(item.mode)"
              >
                {{ modeLabels[item.mode] || item.mode }}
              </span>
              <span class="relative group/time">
                <span
                  class="text-xs text-text-muted cursor-pointer select-none"
                  @click="toggleTooltip(item.id, $event)"
                >
                  {{ formatTime(item.timestamp) }}
                </span>
                <span
                  class="absolute left-0 top-full mt-1 px-2 py-1 text-xs text-text-tooltip bg-bg-tooltip border border-border-muted backdrop-blur-sm rounded-md whitespace-nowrap transition-all duration-200 pointer-events-none z-50 shadow-lg"
                  :class="activeTooltipId === item.id ? 'opacity-100 visible' : 'opacity-0 invisible md:group-hover/time:opacity-100 md:group-hover/time:visible'"
                >
                  {{ formatFullTime(item.timestamp) }}
                </span>
              </span>
            </div>
            <p class="text-sm text-text-secondary truncate">
              {{ truncatePrompt(item.prompt) }}
            </p>
            <div v-if="item.status" class="mt-2 flex items-center justify-between">
              <span
                class="text-xs px-2 py-0.5 rounded-md"
                :class="getStatusClass(item.status)"
              >
                {{ $t(`history.status.${item.status}`) }}
              </span>
              <span v-if="getItemSize(item)" class="text-xs text-text-muted font-mono">
                {{ getItemSize(item) }}
              </span>
            </div>
          </div>
          <button
            @click="deleteItem(item.id, $event)"
            class="opacity-50 md:opacity-0 group-hover:opacity-100 p-2 rounded-lg hover:bg-status-error-muted text-text-muted hover:text-status-error transition-all flex-shrink-0"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Empty state for filtered results -->
    <div v-else-if="store.history.length > 0 && filteredHistory.length === 0" class="text-center py-8">
      <div class="w-12 h-12 rounded-xl bg-bg-muted flex items-center justify-center mx-auto mb-4">
        <svg class="w-6 h-6 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
      <p class="text-sm text-text-muted">{{ $t('history.filter.noResults') }}</p>
    </div>

    <!-- Empty state for no history -->
    <div v-else-if="store.history.length === 0" class="text-center py-8">
      <div class="w-12 h-12 rounded-xl bg-bg-muted flex items-center justify-center mx-auto mb-4">
        <svg class="w-6 h-6 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <p class="text-sm text-text-muted">{{ $t('history.empty') }}</p>
    </div>

    <!-- Confirm Modal -->
    <ConfirmModal ref="confirmModal" />

    <!-- Loading Overlay (Images) -->
    <div v-if="isLoadingImages" class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
      <div class="flex flex-col items-center gap-3">
        <svg class="w-8 h-8 animate-spin text-mode-generate" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
        </svg>
        <span class="text-text-primary text-sm">{{ $t('history.loadingImages') }}</span>
      </div>
    </div>

    <!-- Loading Overlay (Video) -->
    <div v-if="isLoadingVideo" class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
      <div class="flex flex-col items-center gap-3">
        <svg class="w-8 h-8 animate-spin text-mode-generate" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
        </svg>
        <span class="text-text-primary text-sm">{{ $t('history.loadingVideo') }}</span>
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
      :is-slides-mode="lightboxItemMode === 'slides'"
      :narration-audio-urls="lightboxAudioUrls"
      @close="closeLightbox"
    />

    <!-- Video Lightbox -->
    <VideoLightbox
      v-model="showVideoLightbox"
      :video-url="videoUrl"
      :metadata="videoMetadata"
      @close="closeVideoLightbox"
    />

    <!-- History Transfer (Export/Import) -->
    <HistoryTransfer
      v-model="showTransfer"
      @imported="handleImported"
    />

    <!-- Search Modal -->
    <SearchModal
      v-model="showSearchModal"
      @openLightbox="handleSearchOpenLightbox"
      @loadItem="loadHistoryItem"
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
  background: var(--color-border-default);
  border-radius: 3px;
}

.history-scroll::-webkit-scrollbar-thumb:hover {
  background: var(--color-border-focus);
}

/* Firefox */
.history-scroll {
  scrollbar-width: thin;
  scrollbar-color: var(--color-border-default) transparent;
}
</style>
