import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { useIndexedDB } from '@/composables/useIndexedDB'
import { useLocalStorage } from '@/composables/useLocalStorage'
import { useImageStorage } from '@/composables/useImageStorage'
import { DEFAULT_TEMPERATURE, DEFAULT_SEED, getDefaultOptions } from '@/constants'
import { useThemeName, toggleTheme as themeToggle } from '@/theme'

export const useGeneratorStore = defineStore('generator', () => {
  const { addHistory, getHistory, deleteHistory, clearAllHistory, getHistoryCount, migrateAddUUIDs } = useIndexedDB()
  const { getApiKey, setApiKey, updateQuickSetting, getQuickSetting } = useLocalStorage()
  const imageStorage = useImageStorage()

  // Flag to prevent saving during initialization
  let isInitialized = false

  // ============================================================================
  // State
  // ============================================================================

  // API Key state
  const apiKey = ref('')
  const hasApiKey = computed(() => !!apiKey.value)

  // Theme state - delegated to theme module for backward compatibility
  const theme = useThemeName()

  // Current mode
  const currentMode = ref('generate') // generate, edit, story, diagram, sticker

  // Prompt
  const prompt = ref('')

  // Common settings
  const temperature = ref(DEFAULT_TEMPERATURE)
  const seed = ref(DEFAULT_SEED)

  // Mode-specific options (using defaults from constants)
  // Use getDefaultOptions to deep clone arrays and avoid shared references
  const generateOptions = ref(getDefaultOptions('generate'))
  const editOptions = ref(getDefaultOptions('edit'))
  const storyOptions = ref(getDefaultOptions('story'))
  const diagramOptions = ref(getDefaultOptions('diagram'))
  const stickerOptions = ref(getDefaultOptions('sticker'))

  // Reference images (shared across all modes, max 5)
  const referenceImages = ref([])

  // Selected character for generation
  const selectedCharacter = ref(null)

  // Generation state
  const isGenerating = ref(false)
  const generationError = ref(null)
  const generatedImages = ref([])

  // Generation timing
  const generationStartTime = ref(null)
  const generationEndTime = ref(null)

  // Thinking process (SSE streaming)
  const thinkingProcess = ref([])
  const isStreaming = ref(false)

  // History
  const history = ref([])
  const historyCount = ref(0)

  // Image metadata (for current generation)
  const generatedImagesMetadata = ref([])
  const currentHistoryId = ref(null)
  const storageUsage = ref(0)

  // ============================================================================
  // Options Map (for easier access)
  // ============================================================================

  const optionsMap = {
    generate: generateOptions,
    edit: editOptions,
    story: storyOptions,
    diagram: diagramOptions,
    sticker: stickerOptions,
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  const initialize = async () => {
    // Load API key from localStorage
    apiKey.value = getApiKey()

    // Theme is now initialized by theme module in main.js

    // Load settings from localStorage (for quick access)
    const savedMode = getQuickSetting('currentMode')
    if (savedMode) currentMode.value = savedMode

    const savedTemperature = getQuickSetting('temperature')
    if (savedTemperature !== null) temperature.value = savedTemperature

    const savedSeed = getQuickSetting('seed')
    if (savedSeed !== null) seed.value = savedSeed

    // Load mode-specific options
    const modeOptionsToLoad = ['generateOptions', 'storyOptions', 'diagramOptions', 'stickerOptions']
    modeOptionsToLoad.forEach((optionKey) => {
      const savedOption = getQuickSetting(optionKey)
      if (savedOption) {
        const targetRef = {
          generateOptions,
          storyOptions,
          diagramOptions,
          stickerOptions,
        }[optionKey]
        if (targetRef) {
          targetRef.value = { ...targetRef.value, ...savedOption }
        }
      }
    })

    // Load edit options (only resolution, not images)
    const savedEditOptions = getQuickSetting('editOptions')
    if (savedEditOptions) {
      editOptions.value.resolution = savedEditOptions.resolution || '1k'
    }

    // Migrate existing records to add UUID (idempotent)
    await migrateAddUUIDs()

    // Load history from IndexedDB
    await loadHistory()

    // Load storage usage
    await updateStorageUsage()

    // Mark as initialized - now watchers can save
    isInitialized = true

    // Setup watchers for auto-save
    setupWatchers()
  }

  // ============================================================================
  // Watchers Setup (Simplified with loop)
  // ============================================================================

  const setupWatchers = () => {
    // Simple value watchers
    const simpleWatchers = [
      ['currentMode', currentMode],
      ['temperature', temperature],
      ['seed', seed],
    ]

    simpleWatchers.forEach(([key, refValue]) => {
      watch(refValue, (newVal) => {
        if (isInitialized) {
          updateQuickSetting(key, newVal)
        }
      })
    })

    // Deep watchers for options objects
    const deepWatchers = [
      ['generateOptions', generateOptions],
      ['storyOptions', storyOptions],
      ['diagramOptions', diagramOptions],
      ['stickerOptions', stickerOptions],
    ]

    deepWatchers.forEach(([key, refValue]) => {
      watch(
        refValue,
        (newVal) => {
          if (isInitialized) {
            updateQuickSetting(key, { ...newVal })
          }
        },
        { deep: true },
      )
    })

    // Special watcher for edit options (only resolution)
    watch(
      () => editOptions.value.resolution,
      (newVal) => {
        if (isInitialized) {
          updateQuickSetting('editOptions', { resolution: newVal })
        }
      },
    )
  }

  // ============================================================================
  // Theme (delegated to theme module)
  // ============================================================================

  const toggleTheme = () => {
    themeToggle()
  }

  // ============================================================================
  // API Key
  // ============================================================================

  const saveApiKey = (key) => {
    apiKey.value = key
    setApiKey(key)
  }

  // ============================================================================
  // Settings
  // ============================================================================

  const setMode = (mode) => {
    currentMode.value = mode
    // Auto-saved by watcher
  }

  // Get current options based on mode
  const getCurrentOptions = computed(() => {
    const base = {
      temperature: temperature.value,
      seed: seed.value,
    }

    const modeOptions = optionsMap[currentMode.value]
    if (modeOptions) {
      return { ...base, ...modeOptions.value }
    }
    return base
  })

  // ============================================================================
  // History
  // ============================================================================

  const addToHistory = async (record) => {
    const id = await addHistory(record)
    await loadHistory()
    return id
  }

  const loadHistory = async () => {
    history.value = await getHistory(50)
    historyCount.value = await getHistoryCount()
  }

  const removeFromHistory = async (id) => {
    // Delete OPFS images first
    try {
      await imageStorage.deleteHistoryImages(id)
    } catch (err) {
      console.error('Failed to delete OPFS images:', err)
    }
    // Delete IndexedDB record
    await deleteHistory(id)
    await loadHistory()
    // Update storage usage
    await updateStorageUsage()
  }

  const clearHistory = async () => {
    // Delete all OPFS images first
    try {
      await imageStorage.deleteAllImages()
    } catch (err) {
      console.error('Failed to delete all OPFS images:', err)
    }
    // Clear IndexedDB history
    await clearAllHistory()
    await loadHistory()
    // Update storage usage
    await updateStorageUsage()
  }

  // ============================================================================
  // Generated Images
  // ============================================================================

  const setGeneratedImages = (images) => {
    generatedImages.value = images
  }

  const clearGeneratedImages = () => {
    generatedImages.value = []
  }

  const setGeneratedImagesMetadata = (metadata) => {
    generatedImagesMetadata.value = metadata
  }

  const clearGeneratedImagesMetadata = () => {
    generatedImagesMetadata.value = []
  }

  const setCurrentHistoryId = (id) => {
    currentHistoryId.value = id
  }

  const updateStorageUsage = async () => {
    try {
      storageUsage.value = await imageStorage.getStorageUsage()
    } catch (err) {
      console.error('Failed to update storage usage:', err)
    }
  }

  // ============================================================================
  // Generation State
  // ============================================================================

  const setGenerating = (value) => {
    isGenerating.value = value
    if (value) {
      // Starting generation
      generationStartTime.value = Date.now()
      generationEndTime.value = null
    } else {
      // Finished generation
      generationEndTime.value = Date.now()
    }
  }

  const setGenerationError = (error) => {
    generationError.value = error
  }

  const clearGenerationError = () => {
    generationError.value = null
  }

  // ============================================================================
  // Thinking Process
  // ============================================================================

  // chunk can be string (text) or object { type: 'text'|'image', content, mimeType? }
  const addThinkingChunk = (chunk) => {
    if (typeof chunk === 'string') {
      // Legacy: text-only chunk
      thinkingProcess.value.push({
        type: 'text',
        content: chunk,
        timestamp: Date.now(),
      })
    } else {
      // New: object with type
      thinkingProcess.value.push({
        ...chunk,
        timestamp: Date.now(),
      })
    }
  }

  const clearThinkingProcess = () => {
    thinkingProcess.value = []
  }

  const setStreaming = (value) => {
    isStreaming.value = value
  }

  // ============================================================================
  // Reference Images
  // ============================================================================

  const addReferenceImage = (image) => {
    if (referenceImages.value.length >= 5) return false
    referenceImages.value.push(image)
    return true
  }

  const removeReferenceImage = (index) => {
    const image = referenceImages.value[index]
    // Prevent removing character-locked images directly
    if (image?.isCharacterLocked) return false
    referenceImages.value.splice(index, 1)
    return true
  }

  const clearReferenceImages = () => {
    // Keep character-locked images when clearing
    referenceImages.value = referenceImages.value.filter((img) => img.isCharacterLocked)
  }

  // ============================================================================
  // Character Selection
  // ============================================================================

  const selectCharacter = (character) => {
    // Deselect current character first if any
    if (selectedCharacter.value) {
      deselectCharacter()
    }

    selectedCharacter.value = character

    // Add character image to reference images (marked as locked)
    addReferenceImage({
      data: character.imageData,
      preview: `data:image/webp;base64,${character.thumbnail}`,
      mimeType: 'image/png',
      name: character.name,
      isCharacterLocked: true,
    })
  }

  const deselectCharacter = () => {
    // Remove character-locked images from reference images
    referenceImages.value = referenceImages.value.filter((img) => !img.isCharacterLocked)
    selectedCharacter.value = null
  }

  // ============================================================================
  // Reset Options
  // ============================================================================

  const resetCurrentOptions = () => {
    const defaults = getDefaultOptions(currentMode.value)
    const targetRef = optionsMap[currentMode.value]

    if (targetRef && defaults) {
      targetRef.value = defaults
    }
  }

  // ============================================================================
  // Exports
  // ============================================================================

  return {
    // State
    apiKey,
    hasApiKey,
    theme,
    currentMode,
    prompt,
    temperature,
    seed,
    generateOptions,
    editOptions,
    storyOptions,
    diagramOptions,
    stickerOptions,
    referenceImages,
    selectedCharacter,
    isGenerating,
    generationError,
    generatedImages,
    generationStartTime,
    generationEndTime,
    thinkingProcess,
    isStreaming,
    history,
    historyCount,
    generatedImagesMetadata,
    currentHistoryId,
    storageUsage,

    // Computed
    getCurrentOptions,

    // Actions
    initialize,
    toggleTheme,
    saveApiKey,
    setMode,
    addToHistory,
    loadHistory,
    removeFromHistory,
    clearHistory,
    setGeneratedImages,
    clearGeneratedImages,
    setGeneratedImagesMetadata,
    clearGeneratedImagesMetadata,
    setCurrentHistoryId,
    updateStorageUsage,
    setGenerating,
    setGenerationError,
    clearGenerationError,
    addThinkingChunk,
    clearThinkingProcess,
    setStreaming,
    resetCurrentOptions,
    addReferenceImage,
    removeReferenceImage,
    clearReferenceImages,
    selectCharacter,
    deselectCharacter,
    imageStorage,
  }
})
