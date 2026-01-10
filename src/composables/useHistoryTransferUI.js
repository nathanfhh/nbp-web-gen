import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-tw'

dayjs.extend(relativeTime)

/**
 * Composable for History Transfer UI logic
 * Handles tab state, selection operations, drag/drop, and preview state
 *
 * @param {Object} deps - Dependencies
 * @param {Object} deps.indexedDB - IndexedDB composable
 * @param {Object} deps.imageStorage - Image storage composable
 * @returns {Object} UI state and helpers
 */
export function useHistoryTransferUI(deps) {
  const { indexedDB, imageStorage } = deps
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
  const isLoadingPreview = ref(false)

  // Drag state
  const isDragOver = ref(false)

  // Mode label colors
  const modeColors = {
    generate: 'bg-blue-500/20 text-blue-300',
    sticker: 'bg-pink-500/20 text-pink-300',
    edit: 'bg-cyan-500/20 text-cyan-300',
    story: 'bg-amber-500/20 text-amber-300',
    diagram: 'bg-emerald-500/20 text-emerald-300',
  }

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

  // Preview history image - load full image from OPFS
  const openHistoryPreview = async (item, e) => {
    e?.stopPropagation()
    if (!item.images?.[0]) return

    previewHistoryItem.value = item
    isLoadingPreview.value = true

    try {
      const opfsPath = item.images[0].opfsPath
      if (opfsPath) {
        const url = await imageStorage.loadImage(opfsPath)
        previewHistoryImageUrl.value = url
      }
    } catch (err) {
      console.error('Failed to load preview image:', err)
    } finally {
      isLoadingPreview.value = false
    }
  }

  const closeHistoryPreview = () => {
    previewHistoryItem.value = null
    previewHistoryImageUrl.value = null
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
