import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { useIndexedDB } from '@/composables/useIndexedDB'
import { useLocalStorage } from '@/composables/useLocalStorage'
import { useImageStorage } from '@/composables/useImageStorage'
import { useVideoStorage } from '@/composables/useVideoStorage'
import { useCharacterStorage } from '@/composables/useCharacterStorage'
import { DEFAULT_TEMPERATURE, DEFAULT_SEED, getDefaultOptions, DEFAULT_VIDEO_PROMPT_OPTIONS } from '@/constants'
import { useThemeName, toggleTheme as themeToggle, setTheme as themeSet } from '@/theme'

export const useGeneratorStore = defineStore('generator', () => {
  const {
    addHistory,
    getHistory,
    deleteHistory,
    clearAllHistory,
    getHistoryCount,
    migrateAddUUIDs,
    getAllCharacters,
    updateCharacter,
  } = useIndexedDB()
  const { getApiKey, setApiKey, updateQuickSetting, getQuickSetting } = useLocalStorage()
  const imageStorage = useImageStorage()
  const videoStorage = useVideoStorage()
  const characterStorage = useCharacterStorage()

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
  const currentMode = ref('generate') // generate, edit, story, diagram, sticker, video, slides

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
  const videoOptions = ref(getDefaultOptions('video'))
  const videoPromptOptions = ref(JSON.parse(JSON.stringify(DEFAULT_VIDEO_PROMPT_OPTIONS)))
  const slidesOptions = ref(getDefaultOptions('slides'))

  // Reference images (shared across all modes, max 5)
  const referenceImages = ref([])

  // Sketch history (for undo/redo across edit sessions, stored in RAM)
  const sketchHistory = ref([])
  const sketchHistoryIndex = ref(-1)
  const sketchEditingImageIndex = ref(null) // Track which image is being edited
  const MAX_SKETCH_HISTORY = 30

  // Selected character for generation
  const selectedCharacter = ref(null)

  // Generation state
  const isGenerating = ref(false)
  const generationError = ref(null)
  const generatedImages = ref([])
  const generatedVideo = ref(null) // For video mode preview

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
    video: videoOptions,
    slides: slidesOptions,
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
    const modeOptionsToLoad = [
      'generateOptions',
      'storyOptions',
      'diagramOptions',
      'stickerOptions',
      'videoOptions',
      'videoPromptOptions',
      'slidesOptions',
    ]
    modeOptionsToLoad.forEach((optionKey) => {
      const savedOption = getQuickSetting(optionKey)
      if (savedOption) {
        const targetRef = {
          generateOptions,
          storyOptions,
          diagramOptions,
          stickerOptions,
          videoOptions,
          videoPromptOptions,
          slidesOptions,
        }[optionKey]
        if (targetRef) {
          targetRef.value = { ...targetRef.value, ...savedOption }
        }
      }
    })

    // Reset transient page states for slides (status, error, pendingImage are not meant to persist)
    if (slidesOptions.value.pages && slidesOptions.value.pages.length > 0) {
      slidesOptions.value.pages.forEach((page) => {
        if (page.status === 'generating' || page.status === 'comparing') {
          page.status = page.image ? 'done' : 'pending'
        }
        page.pendingImage = null
        page.error = null
      })
    }

    // Load edit options (only resolution, not images)
    const savedEditOptions = getQuickSetting('editOptions')
    if (savedEditOptions) {
      editOptions.value.resolution = savedEditOptions.resolution || '1k'
    }

    // Migrate existing records to add UUID (idempotent)
    await migrateAddUUIDs()

    // Migrate character images from IndexedDB to OPFS (idempotent)
    // This only runs if there are characters with imageData in IndexedDB
    try {
      await characterStorage.migrateAllCharactersToOPFS({
        getAllCharacters,
        updateCharacter,
      })
    } catch (err) {
      console.error('Character image migration failed:', err)
      // Non-fatal - app can still function, migration will retry next load
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

  // ============================================================================
  // Watchers Setup (Simplified with loop)
  // ============================================================================

  /**
   * Sanitize slidesOptions for localStorage persistence
   * Removes large image data that shouldn't be persisted:
   * - globalReferenceImages (user preference: no persistence)
   * - pages[].image (generated slide images)
   * - pages[].referenceImages (per-page reference images)
   * - pages[].pendingImage (temporary comparison images)
   */
  const sanitizeSlidesOptionsForStorage = (options) => {
    const sanitized = { ...options }

    // Remove global reference images entirely
    sanitized.globalReferenceImages = []

    // Sanitize pages array - keep structure but remove image data
    if (sanitized.pages && Array.isArray(sanitized.pages)) {
      sanitized.pages = sanitized.pages.map((page) => ({
        ...page,
        image: null,
        referenceImages: [],
        pendingImage: null,
      }))
    }

    return sanitized
  }

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

    // Deep watchers for options objects (excluding slidesOptions which needs special handling)
    const deepWatchers = [
      ['generateOptions', generateOptions],
      ['storyOptions', storyOptions],
      ['diagramOptions', diagramOptions],
      ['stickerOptions', stickerOptions],
      ['videoOptions', videoOptions],
      ['videoPromptOptions', videoPromptOptions],
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

    // Special watcher for slidesOptions - sanitize before saving
    watch(
      slidesOptions,
      (newVal) => {
        if (isInitialized) {
          updateQuickSetting('slidesOptions', sanitizeSlidesOptionsForStorage(newVal))
        }
      },
      { deep: true },
    )

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

  const setTheme = (themeName) => {
    themeSet(themeName)
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
    // Delete OPFS videos
    try {
      await videoStorage.deleteHistoryVideo(id)
    } catch (err) {
      console.error('Failed to delete OPFS video:', err)
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
    // Delete all OPFS videos
    try {
      await videoStorage.deleteAllVideos()
    } catch (err) {
      console.error('Failed to delete all OPFS videos:', err)
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

  const setGeneratedVideo = (video) => {
    generatedVideo.value = video
  }

  const clearGeneratedVideo = () => {
    generatedVideo.value = null
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
      const imageUsage = await imageStorage.getStorageUsage()
      const videoUsage = await videoStorage.getStorageUsage()
      storageUsage.value = imageUsage + videoUsage
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

  const updateReferenceImage = (index, newImageData) => {
    const image = referenceImages.value[index]
    // Prevent updating character-locked images
    if (image?.isCharacterLocked) return false
    if (index < 0 || index >= referenceImages.value.length) return false
    referenceImages.value.splice(index, 1, newImageData)
    return true
  }

  const clearReferenceImages = () => {
    // Keep character-locked images when clearing
    referenceImages.value = referenceImages.value.filter((img) => img.isCharacterLocked)
  }

  // ============================================================================
  // Sketch History (RAM-based, persists until page refresh)
  // ============================================================================

  const sketchCanUndo = computed(() => sketchHistoryIndex.value > 0)
  const sketchCanRedo = computed(() => sketchHistoryIndex.value < sketchHistory.value.length - 1)
  const hasSketchHistory = computed(() => sketchHistory.value.length > 0)

  /**
   * Start editing an image - reset history if different image
   */
  const startSketchEdit = (imageIndex) => {
    if (sketchEditingImageIndex.value !== imageIndex) {
      // Different image, reset history
      sketchHistory.value = []
      sketchHistoryIndex.value = -1
      sketchEditingImageIndex.value = imageIndex
    }
    // Same image - keep existing history
  }

  /**
   * Save a snapshot to sketch history
   */
  const saveSketchSnapshot = (json) => {
    // Truncate future states if not at the end
    if (sketchHistoryIndex.value < sketchHistory.value.length - 1) {
      sketchHistory.value = sketchHistory.value.slice(0, sketchHistoryIndex.value + 1)
    }

    // Add new snapshot
    sketchHistory.value.push(json)

    // Trim if exceeds max
    if (sketchHistory.value.length > MAX_SKETCH_HISTORY) {
      sketchHistory.value.shift()
      sketchHistoryIndex.value--
    }

    // Update index
    sketchHistoryIndex.value = sketchHistory.value.length - 1
  }

  /**
   * Get snapshot at specific index
   */
  const getSketchSnapshot = (index) => {
    if (index < 0 || index >= sketchHistory.value.length) return null
    return sketchHistory.value[index]
  }

  /**
   * Set current history index (for undo/redo)
   */
  const setSketchHistoryIndex = (index) => {
    if (index >= 0 && index < sketchHistory.value.length) {
      sketchHistoryIndex.value = index
    }
  }

  /**
   * Clear sketch history
   */
  const clearSketchHistory = () => {
    sketchHistory.value = []
    sketchHistoryIndex.value = -1
    sketchEditingImageIndex.value = null
  }

  /**
   * Update the editing image index (after saving a new sketch)
   */
  const setSketchEditingImageIndex = (index) => {
    sketchEditingImageIndex.value = index
  }

  // ============================================================================
  // Character Selection
  // ============================================================================

  const selectCharacter = async (character) => {
    // Deselect current character first if any
    if (selectedCharacter.value) {
      deselectCharacter()
    }

    selectedCharacter.value = character

    // Load imageData from OPFS with fallback to legacy IndexedDB data
    const imageData = await characterStorage.loadCharacterImageWithFallback(character.id, character.imageData)

    // Add character image to reference images (marked as locked)
    addReferenceImage({
      data: imageData,
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
    videoOptions,
    videoPromptOptions,
    slidesOptions,
    referenceImages,
    sketchHistoryIndex,
    sketchCanUndo,
    sketchCanRedo,
    hasSketchHistory,
    selectedCharacter,
    isGenerating,
    generationError,
    generatedImages,
    generatedVideo,
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
    setTheme,
    saveApiKey,
    setMode,
    addToHistory,
    loadHistory,
    removeFromHistory,
    clearHistory,
    setGeneratedImages,
    clearGeneratedImages,
    setGeneratedVideo,
    clearGeneratedVideo,
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
    updateReferenceImage,
    clearReferenceImages,
    startSketchEdit,
    saveSketchSnapshot,
    getSketchSnapshot,
    setSketchHistoryIndex,
    clearSketchHistory,
    setSketchEditingImageIndex,
    selectCharacter,
    deselectCharacter,
    imageStorage,
    videoStorage,
  }
})
