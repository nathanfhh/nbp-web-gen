import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { useIndexedDB } from '@/composables/useIndexedDB'
import { useLocalStorage } from '@/composables/useLocalStorage'
import { useImageStorage } from '@/composables/useImageStorage'

export const useGeneratorStore = defineStore('generator', () => {
  const { saveSetting, addHistory, getHistory, deleteHistory, clearAllHistory, getHistoryCount } =
    useIndexedDB()
  const { getApiKey, setApiKey, updateQuickSetting, getQuickSetting } = useLocalStorage()
  const imageStorage = useImageStorage()

  // Flag to prevent saving during initialization
  let isInitialized = false

  // API Key state
  const apiKey = ref('')
  const hasApiKey = computed(() => !!apiKey.value)

  // Theme state (dark or light)
  const theme = ref('dark')

  // Current mode
  const currentMode = ref('generate') // generate, edit, story, diagram, sticker

  // Prompt
  const prompt = ref('')

  // Common settings
  const temperature = ref(1.0)
  const seed = ref('')

  // Generate mode options
  const generateOptions = ref({
    resolution: '1k',
    ratio: '1:1',
    styles: [],
    variations: [],
  })

  // Edit mode options
  const editOptions = ref({
    resolution: '1k',
    inputImage: null,
    inputImagePreview: null,
  })

  // Reference images (shared across all modes, max 5)
  const referenceImages = ref([])

  // Story mode options
  const storyOptions = ref({
    resolution: '1k',
    steps: 4,
    type: 'unspecified',
    style: 'unspecified',
    transition: 'unspecified',
    format: 'unspecified',
  })

  // Diagram mode options
  const diagramOptions = ref({
    resolution: '1k',
    type: 'unspecified',
    style: 'unspecified',
    layout: 'unspecified',
    complexity: 'unspecified',
    annotations: 'unspecified',
  })

  // Sticker mode options
  const stickerOptions = ref({
    resolution: '1k',
    ratio: '1:1',
    styles: [],
    // Context/Usage
    context: 'chat', // chat, group, boss, couple, custom
    customContext: '',
    // Text related
    hasText: true,
    tones: [], // formal, polite, friendly, sarcastic, custom
    customTone: '',
    languages: ['zh-TW'], // zh-TW, en, ja, custom
    customLanguage: '',
    // Composition
    cameraAngles: ['headshot'], // headshot, halfbody, fullbody
    expressions: ['natural'], // natural, exaggerated, crazy
  })

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
  const storageUsage = ref(0)

  // Initialize from storage
  const initialize = async () => {
    // Load API key from localStorage
    apiKey.value = getApiKey()

    // Load theme from localStorage
    const savedTheme = getQuickSetting('theme')
    if (savedTheme) {
      theme.value = savedTheme
      applyTheme(savedTheme)
    }

    // Load settings from localStorage (for quick access)
    const savedMode = getQuickSetting('currentMode')
    if (savedMode) currentMode.value = savedMode

    const savedTemperature = getQuickSetting('temperature')
    if (savedTemperature !== null) temperature.value = savedTemperature

    const savedSeed = getQuickSetting('seed')
    if (savedSeed !== null) seed.value = savedSeed

    const savedGenerateOptions = getQuickSetting('generateOptions')
    if (savedGenerateOptions) generateOptions.value = { ...generateOptions.value, ...savedGenerateOptions }

    const savedStoryOptions = getQuickSetting('storyOptions')
    if (savedStoryOptions) storyOptions.value = { ...storyOptions.value, ...savedStoryOptions }

    const savedDiagramOptions = getQuickSetting('diagramOptions')
    if (savedDiagramOptions) diagramOptions.value = { ...diagramOptions.value, ...savedDiagramOptions }

    const savedStickerOptions = getQuickSetting('stickerOptions')
    if (savedStickerOptions) stickerOptions.value = { ...stickerOptions.value, ...savedStickerOptions }

    const savedEditOptions = getQuickSetting('editOptions')
    if (savedEditOptions) {
      // Don't restore image data, only resolution
      editOptions.value.resolution = savedEditOptions.resolution || '1k'
    }

    // Load history from IndexedDB
    await loadHistory()

    // Load storage usage
    await updateStorageUsage()

    // Mark as initialized - now watchers can save
    isInitialized = true

    // Setup watchers for auto-save
    setupWatchers()
  }

  // Setup watchers for auto-saving settings
  const setupWatchers = () => {
    // Watch current mode
    watch(currentMode, (newVal) => {
      if (isInitialized) {
        updateQuickSetting('currentMode', newVal)
      }
    })

    // Watch temperature
    watch(temperature, (newVal) => {
      if (isInitialized) {
        updateQuickSetting('temperature', newVal)
      }
    })

    // Watch seed
    watch(seed, (newVal) => {
      if (isInitialized) {
        updateQuickSetting('seed', newVal)
      }
    })

    // Watch generate options
    watch(generateOptions, (newVal) => {
      if (isInitialized) {
        updateQuickSetting('generateOptions', { ...newVal })
      }
    }, { deep: true })

    // Watch edit options (only resolution)
    watch(() => editOptions.value.resolution, (newVal) => {
      if (isInitialized) {
        updateQuickSetting('editOptions', { resolution: newVal })
      }
    })

    // Watch story options
    watch(storyOptions, (newVal) => {
      if (isInitialized) {
        updateQuickSetting('storyOptions', { ...newVal })
      }
    }, { deep: true })

    // Watch diagram options
    watch(diagramOptions, (newVal) => {
      if (isInitialized) {
        updateQuickSetting('diagramOptions', { ...newVal })
      }
    }, { deep: true })

    // Watch sticker options
    watch(stickerOptions, (newVal) => {
      if (isInitialized) {
        updateQuickSetting('stickerOptions', { ...newVal })
      }
    }, { deep: true })
  }

  // Apply theme to document
  const applyTheme = (themeName) => {
    document.documentElement.setAttribute('data-theme', themeName)
  }

  // Toggle theme
  const toggleTheme = () => {
    const newTheme = theme.value === 'dark' ? 'light' : 'dark'
    theme.value = newTheme
    applyTheme(newTheme)
    updateQuickSetting('theme', newTheme)
  }

  // Save API key
  const saveApiKey = (key) => {
    apiKey.value = key
    setApiKey(key)
  }

  // Save settings to IndexedDB
  const saveSettings = async () => {
    await saveSetting('currentMode', currentMode.value)
    await saveSetting('temperature', temperature.value)
    await saveSetting('seed', seed.value)
    await saveSetting('generateOptions', generateOptions.value)
    await saveSetting('storyOptions', storyOptions.value)
    await saveSetting('diagramOptions', diagramOptions.value)
  }

  // Set mode
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

    switch (currentMode.value) {
      case 'generate':
        return { ...base, ...generateOptions.value }
      case 'edit':
        return { ...base, ...editOptions.value }
      case 'story':
        return { ...base, ...storyOptions.value }
      case 'diagram':
        return { ...base, ...diagramOptions.value }
      case 'sticker':
        return { ...base, ...stickerOptions.value }
      default:
        return base
    }
  })

  // Add to history
  const addToHistory = async (record) => {
    const id = await addHistory(record)
    await loadHistory()
    return id
  }

  // Load history
  const loadHistory = async () => {
    history.value = await getHistory(50)
    historyCount.value = await getHistoryCount()
  }

  // Delete from history (also deletes OPFS images)
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

  // Clear history (also deletes all OPFS images)
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

  // Set generated images
  const setGeneratedImages = (images) => {
    generatedImages.value = images
  }

  // Clear generated images
  const clearGeneratedImages = () => {
    generatedImages.value = []
  }

  // Set generated images metadata
  const setGeneratedImagesMetadata = (metadata) => {
    generatedImagesMetadata.value = metadata
  }

  // Clear generated images metadata
  const clearGeneratedImagesMetadata = () => {
    generatedImagesMetadata.value = []
  }

  // Update storage usage
  const updateStorageUsage = async () => {
    try {
      storageUsage.value = await imageStorage.getStorageUsage()
    } catch (err) {
      console.error('Failed to update storage usage:', err)
    }
  }

  // Set generation state
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

  // Set generation error
  const setGenerationError = (error) => {
    generationError.value = error
  }

  // Clear generation error
  const clearGenerationError = () => {
    generationError.value = null
  }

  // Thinking process methods
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

  // Reference images methods
  const addReferenceImage = (image) => {
    if (referenceImages.value.length >= 5) return false
    referenceImages.value.push(image)
    return true
  }

  const removeReferenceImage = (index) => {
    referenceImages.value.splice(index, 1)
  }

  const clearReferenceImages = () => {
    referenceImages.value = []
  }

  // Reset all options for current mode
  const resetCurrentOptions = () => {
    switch (currentMode.value) {
      case 'generate':
        generateOptions.value = {
          resolution: '1k',
          ratio: '1:1',
          styles: [],
          variations: [],
        }
        break
      case 'edit':
        editOptions.value = {
          resolution: '1k',
          inputImage: null,
          inputImagePreview: null,
        }
        break
      case 'story':
        storyOptions.value = {
          resolution: '1k',
          steps: 4,
          type: 'unspecified',
          style: 'unspecified',
          transition: 'unspecified',
          format: 'unspecified',
        }
        break
      case 'diagram':
        diagramOptions.value = {
          resolution: '1k',
          type: 'unspecified',
          style: 'unspecified',
          layout: 'unspecified',
          complexity: 'unspecified',
          annotations: 'unspecified',
        }
        break
      case 'sticker':
        stickerOptions.value = {
          resolution: '1k',
          ratio: '1:1',
          styles: [],
          context: 'chat',
          customContext: '',
          hasText: true,
          tones: [],
          customTone: '',
          languages: ['zh-TW'],
          customLanguage: '',
          cameraAngles: ['headshot'],
          expressions: ['natural'],
        }
        break
    }
  }

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
    storageUsage,

    // Computed
    getCurrentOptions,

    // Actions
    initialize,
    toggleTheme,
    saveApiKey,
    saveSettings,
    setMode,
    addToHistory,
    loadHistory,
    removeFromHistory,
    clearHistory,
    setGeneratedImages,
    clearGeneratedImages,
    setGeneratedImagesMetadata,
    clearGeneratedImagesMetadata,
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
    imageStorage,
  }
})
