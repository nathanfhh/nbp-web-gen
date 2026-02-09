import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-tw'
import { MODE_TAG_STYLES } from '@/constants'

dayjs.extend(relativeTime)

/**
 * Composable for History Transfer UI logic
 * Handles tab state, selection operations, drag/drop, and preview state
 *
 * @param {Object} deps - Dependencies
 * @param {Object} deps.indexedDB - IndexedDB composable
 * @param {Object} deps.imageStorage - Image storage composable
 * @param {Object} deps.videoStorage - Video storage composable
 * @returns {Object} UI state and helpers
 */
export function useHistoryTransferUI(deps) {
  const { indexedDB, imageStorage, videoStorage } = deps
  const { locale } = useI18n()

  // Tab state
  const activeTab = ref('history')

  // History list state
  const historyList = ref([])
  const selectedIds = ref(new Set())
  const isLoadingList = ref(false)

  // Character list state
  const characterList = ref([])
  const selectedCharIds = ref(new Set())
  const isLoadingCharacters = ref(false)

  // Preview state for character
  const previewCharacter = ref(null)

  // Preview state for history
  const previewHistoryItem = ref(null)
  const previewHistoryImageUrl = ref(null)
  const previewHistoryVideoUrl = ref(null)
  const isLoadingPreview = ref(false)

  // Drag state
  const isDragOver = ref(false)

  // Mode label colors (from constants - Single Source of Truth)
  const modeColors = MODE_TAG_STYLES

  // Computed for history tab
  const selectedCount = computed(() => selectedIds.value.size)
  const isAllSelected = computed(() =>
    historyList.value.length > 0 && selectedIds.value.size === historyList.value.length
  )
  const hasSelection = computed(() => selectedIds.value.size > 0)

  // Computed for characters tab
  const selectedCharCount = computed(() => selectedCharIds.value.size)
  const isAllCharSelected = computed(() =>
    characterList.value.length > 0 && selectedCharIds.value.size === characterList.value.length
  )
  const hasCharSelection = computed(() => selectedCharIds.value.size > 0)

  // Load history list
  const loadHistoryList = async () => {
    isLoadingList.value = true
    try {
      historyList.value = await indexedDB.getAllHistory()
      historyList.value.sort((a, b) => b.timestamp - a.timestamp)
    } catch (err) {
      console.error('Failed to load history:', err)
    } finally {
      isLoadingList.value = false
    }
  }

  // Load character list
  const loadCharacterList = async () => {
    isLoadingCharacters.value = true
    try {
      characterList.value = await indexedDB.getCharacters(1000)
      characterList.value.sort((a, b) => b.createdAt - a.createdAt)
    } catch (err) {
      console.error('Failed to load characters:', err)
    } finally {
      isLoadingCharacters.value = false
    }
  }

  // Selection operations for history
  const toggleSelect = (id) => {
    const newSet = new Set(selectedIds.value)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    selectedIds.value = newSet
  }

  const selectAll = () => {
    selectedIds.value = new Set(historyList.value.map((h) => h.id))
  }

  const deselectAll = () => {
    selectedIds.value = new Set()
  }

  // Selection operations for characters
  const toggleCharSelect = (id) => {
    const newSet = new Set(selectedCharIds.value)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    selectedCharIds.value = newSet
  }

  const selectAllChars = () => {
    selectedCharIds.value = new Set(characterList.value.map((c) => c.id))
  }

  const deselectAllChars = () => {
    selectedCharIds.value = new Set()
  }

  // Reset selections
  const resetSelections = () => {
    selectedIds.value = new Set()
    selectedCharIds.value = new Set()
  }

  // Preview character image
  const openCharPreview = (char, e) => {
    e?.stopPropagation()
    previewCharacter.value = char
  }

  const closeCharPreview = () => {
    previewCharacter.value = null
  }

  // Preview history image or video - load from OPFS
  const openHistoryPreview = async (item, e) => {
    e?.stopPropagation()

    // Check if item has video, images, or agent thumbnail
    const hasVideo = !!item.video?.opfsPath
    const hasImages = !!item.images?.[0]?.opfsPath
    const hasAgentThumbnail = item.mode === 'agent' && !!item.thumbnail

    if (!hasVideo && !hasImages && !hasAgentThumbnail) return

    previewHistoryItem.value = item
    isLoadingPreview.value = true

    try {
      if (hasVideo) {
        // Load video from OPFS
        const url = await videoStorage.loadVideo(item.video.opfsPath)
        previewHistoryVideoUrl.value = url
      } else if (hasImages) {
        // Load image from OPFS
        const url = await imageStorage.loadImage(item.images[0].opfsPath)
        previewHistoryImageUrl.value = url
      } else if (hasAgentThumbnail) {
        // Agent mode: images stored at /images/{historyId}/{index}.webp
        // Try to load full-size first image from OPFS (same pattern as other modes)
        const imagePath = `/images/${item.id}/0.webp`
        const url = await imageStorage.loadImage(imagePath)
        if (url) {
          previewHistoryImageUrl.value = url
        }
        // If OPFS image not found (e.g. imported record), falls back to thumbnail
        // via getHistoryPreviewSrc() in HistoryTransfer.vue
      }
    } catch (err) {
      console.error('Failed to load preview:', err)
    } finally {
      isLoadingPreview.value = false
    }
  }

  const closeHistoryPreview = () => {
    previewHistoryItem.value = null
    previewHistoryImageUrl.value = null
    previewHistoryVideoUrl.value = null
  }

  // Check if any preview is open
  const hasOpenPreview = computed(() => !!previewCharacter.value || !!previewHistoryItem.value)

  // Close any open preview
  const closeAnyPreview = () => {
    if (previewCharacter.value) {
      closeCharPreview()
      return true
    }
    if (previewHistoryItem.value) {
      closeHistoryPreview()
      return true
    }
    return false
  }

  // Format relative time
  const formatRelativeTime = (timestamp) => {
    return dayjs(timestamp)
      .locale(locale.value === 'zh-TW' ? 'zh-tw' : 'en')
      .fromNow()
  }

  // Drag handlers
  const handleDragOver = (e) => {
    e.preventDefault()
    isDragOver.value = true
  }

  const handleDragLeave = () => {
    isDragOver.value = false
  }

  const handleDropEnd = () => {
    isDragOver.value = false
  }

  return {
    // Tab state
    activeTab,

    // History state
    historyList,
    selectedIds,
    isLoadingList,
    selectedCount,
    isAllSelected,
    hasSelection,

    // Character state
    characterList,
    selectedCharIds,
    isLoadingCharacters,
    selectedCharCount,
    isAllCharSelected,
    hasCharSelection,

    // Preview state
    previewCharacter,
    previewHistoryItem,
    previewHistoryImageUrl,
    previewHistoryVideoUrl,
    isLoadingPreview,
    hasOpenPreview,

    // Drag state
    isDragOver,

    // Constants
    modeColors,

    // Load functions
    loadHistoryList,
    loadCharacterList,

    // Selection operations
    toggleSelect,
    selectAll,
    deselectAll,
    toggleCharSelect,
    selectAllChars,
    deselectAllChars,
    resetSelections,

    // Preview operations
    openCharPreview,
    closeCharPreview,
    openHistoryPreview,
    closeHistoryPreview,
    closeAnyPreview,

    // Helpers
    formatRelativeTime,

    // Drag handlers
    handleDragOver,
    handleDragLeave,
    handleDropEnd,
  }
}
