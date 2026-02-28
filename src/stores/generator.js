import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { useIndexedDB } from '@/composables/useIndexedDB'
import { useLocalStorage } from '@/composables/useLocalStorage'
import { useImageStorage } from '@/composables/useImageStorage'
import { useVideoStorage } from '@/composables/useVideoStorage'
import { useAudioStorage } from '@/composables/useAudioStorage'
import { useCharacterStorage } from '@/composables/useCharacterStorage'
import { useConversationStorage } from '@/composables/useConversationStorage'
import { DEFAULT_TEMPERATURE, DEFAULT_SEED, getDefaultOptions, DEFAULT_VIDEO_PROMPT_OPTIONS } from '@/constants'
import { DEFAULT_MODEL as DEFAULT_IMAGE_MODEL } from '@/constants/imageOptions'
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
    updateHistory,
  } = useIndexedDB()
  const { getApiKey, setApiKey, updateQuickSetting, getQuickSetting } = useLocalStorage()
  const imageStorage = useImageStorage()
  const videoStorage = useVideoStorage()
  const audioStorage = useAudioStorage()
  const characterStorage = useCharacterStorage()
  const conversationStorage = useConversationStorage()

  // Flag to prevent saving during initialization (exposed as ref for external watchers)
  const isInitialized = ref(false)

  // ============================================================================
  // State
  // ============================================================================

  // API Key state
  const apiKey = ref('')
  const hasApiKey = computed(() => !!apiKey.value)

  // Theme state - delegated to theme module for backward compatibility
  const theme = useThemeName()

  // Current mode
  const currentMode = ref('generate') // generate, edit, story, diagram, sticker, video, slides, agent

  // Prompt
  const prompt = ref('')

  // Common settings
  const temperature = ref(DEFAULT_TEMPERATURE)
  const seed = ref(DEFAULT_SEED)
  const imageModel = ref(DEFAULT_IMAGE_MODEL)

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
  const agentOptions = ref(getDefaultOptions('agent'))

  // Agent conversation (RAM only, not persisted to localStorage)
  const agentConversation = ref([]) // Array of messages
  const agentSessionId = ref(null) // Current session ID
  const agentStreamingMessage = ref(null) // Message being streamed
  const savedAgentImageCount = ref(0) // Track saved images to avoid re-compression

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
  const generatedAudioUrls = ref([]) // Narration audio Object URLs for live preview
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
    agent: agentOptions,
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

    const savedImageModel = getQuickSetting('imageModel')
    if (savedImageModel) imageModel.value = savedImageModel

    // Load prompt from localStorage
    const savedPrompt = getQuickSetting('prompt')
    if (savedPrompt) prompt.value = savedPrompt

    // Load mode-specific options
    const modeOptionsToLoad = [
      'generateOptions',
      'storyOptions',
      'diagramOptions',
      'stickerOptions',
      'videoOptions',
      'videoPromptOptions',
      'slidesOptions',
      'agentOptions',
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
          agentOptions,
        }[optionKey]
        if (targetRef) {
          targetRef.value = { ...targetRef.value, ...savedOption }
        }
      }
    })

    // Reset transient page states for slides (status, error, pendingImage, pendingAudio are not meant to persist)
    if (slidesOptions.value.pages && slidesOptions.value.pages.length > 0) {
      slidesOptions.value.pages.forEach((page) => {
        if (page.status === 'generating' || page.status === 'comparing') {
          page.status = page.image ? 'done' : 'pending'
        }
        page.pendingImage = null
        // Revoke objectUrl before clearing (defensive - normally already revoked on page reload)
        if (page.pendingAudio?.objectUrl) {
          URL.revokeObjectURL(page.pendingAudio.objectUrl)
        }
        page.pendingAudio = null
        page.error = null
        // Clear dirty flags — images are stripped from localStorage, so dirty state is meaningless
        page.contentDirty = false
        page.styleDirty = false
        page.narrationDirty = false
        delete page.generatedContent
        delete page.generatedPageStyleGuide
        delete page.generatedGlobalStyle
        // Normalize status: pages without images can't be 'done'
        if (!page.image && page.status === 'done') {
          page.status = 'pending'
        }
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
    isInitialized.value = true

    // Setup watchers for auto-save
    setupWatchers()
  }

  // ============================================================================
  // Watchers Setup (Simplified with loop)
  // ============================================================================

  /**
   * Sanitize slidesOptions for localStorage persistence
   * Removes large data that shouldn't be persisted:
   * - globalReferenceImages (user preference: no persistence)
   * - pages[].image (generated slide images)
   * - pages[].referenceImages (per-page reference images)
   * - pages[].pendingImage (temporary comparison images)
   * - pages[].pendingAudio (temporary comparison audio with blob/objectUrl)
   */
  const sanitizeSlidesOptionsForStorage = (options) => {
    const sanitized = { ...options }

    // Remove global reference images entirely
    sanitized.globalReferenceImages = []

    // Sanitize pages array - keep structure but remove image/audio data
    if (sanitized.pages && Array.isArray(sanitized.pages)) {
      sanitized.pages = sanitized.pages.map((page) => ({
        ...page,
        image: null,
        referenceImages: [],
        pendingImage: null,
        pendingAudio: null,
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
      ['imageModel', imageModel],
      ['prompt', prompt],
    ]

    simpleWatchers.forEach(([key, refValue]) => {
      watch(refValue, (newVal) => {
        if (isInitialized.value) {
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
      ['agentOptions', agentOptions],
    ]

    deepWatchers.forEach(([key, refValue]) => {
      watch(
        refValue,
        (newVal) => {
          if (isInitialized.value) {
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
        if (isInitialized.value) {
          updateQuickSetting('slidesOptions', sanitizeSlidesOptionsForStorage(newVal))
        }
      },
      { deep: true },
    )

    // Special watcher for edit options (only resolution)
    watch(
      () => editOptions.value.resolution,
      (newVal) => {
        if (isInitialized.value) {
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
    // Agent mode has its own conversation input, clear prompt to prevent leaking from other modes
    // Note: URL params bypass setMode (direct assignment to currentMode), so this won't affect ?prompt=xxx
    if (mode === 'agent') {
      prompt.value = ''
    }
    currentMode.value = mode
    // Auto-saved by watcher
  }

  // Get current options based on mode
  const getCurrentOptions = computed(() => {
    const base = {
      temperature: temperature.value,
      seed: seed.value,
      model: imageModel.value,
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
    window.dispatchEvent(new CustomEvent('nbp-history-added', { detail: { id, record: { ...record, id, timestamp: Date.now() } } }))
    return id
  }

  const loadHistory = async () => {
    history.value = await getHistory(50)
    historyCount.value = await getHistoryCount()

    // Background migration: backfill imageCount for agent records that don't have it
    const agentRecordsToFix = history.value.filter(
      (r) => r.mode === 'agent' && r.imageCount === undefined,
    )
    if (agentRecordsToFix.length > 0) {
      backfillAgentImageCounts(agentRecordsToFix)
    }
  }

  /**
   * Background migration: compute imageCount for agent records missing it.
   * Loads conversation from OPFS, counts image parts, updates IndexedDB + local state.
   */
  const backfillAgentImageCounts = async (records) => {
    for (const record of records) {
      try {
        const opfsPath = `/conversations/${record.id}/conversation.json`
        const conversation = await conversationStorage.loadConversation(opfsPath)
        if (!conversation) continue

        let imageCount = 0
        for (const msg of conversation) {
          if (msg._isPartial) continue
          for (const part of msg.parts || []) {
            if (part.type === 'image' || part.type === 'generatedImage') {
              imageCount++
            }
          }
        }

        await updateHistory(record.id, { imageCount })
        // Update local state directly to avoid full reload
        record.imageCount = imageCount
      } catch {
        // Non-critical migration, skip on error
      }
    }
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
    // Delete OPFS audio
    try {
      await audioStorage.deleteHistoryAudio(id)
    } catch (err) {
      console.error('Failed to delete OPFS audio:', err)
    }
    // Delete OPFS conversation (for agent mode)
    try {
      await conversationStorage.deleteConversation(id)
    } catch (err) {
      console.error('Failed to delete OPFS conversation:', err)
    }
    // Delete IndexedDB record
    await deleteHistory(id)
    await loadHistory()
    // Update storage usage
    await updateStorageUsage()
    window.dispatchEvent(new CustomEvent('nbp-history-deleted', { detail: { ids: [id] } }))
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
    // Delete all OPFS audio
    try {
      await audioStorage.deleteAllAudio()
    } catch (err) {
      console.error('Failed to delete all OPFS audio:', err)
    }
    // Delete all OPFS conversations (for agent mode)
    try {
      await conversationStorage.deleteAllConversations()
    } catch (err) {
      console.error('Failed to delete all OPFS conversations:', err)
    }
    // Clear IndexedDB history
    await clearAllHistory()
    await loadHistory()
    // Update storage usage
    await updateStorageUsage()
    window.dispatchEvent(new CustomEvent('nbp-history-cleared'))
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

  const setGeneratedAudioUrls = (urls) => {
    generatedAudioUrls.value = urls
  }

  const clearGeneratedAudioUrls = () => {
    for (const url of generatedAudioUrls.value) {
      if (url) URL.revokeObjectURL(url)
    }
    generatedAudioUrls.value = []
  }

  const setCurrentHistoryId = (id) => {
    currentHistoryId.value = id
  }

  const updateStorageUsage = async () => {
    try {
      const imageUsage = await imageStorage.getStorageUsage()
      const videoUsage = await videoStorage.getStorageUsage()
      const audioUsage = await audioStorage.getStorageUsage()
      const conversationUsage = await conversationStorage.getTotalSize()
      storageUsage.value = imageUsage + videoUsage + audioUsage + conversationUsage
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
  // Agent Conversation (RAM-based, not persisted)
  // ============================================================================

  /**
   * Generate a unique message ID
   */
  const generateMessageId = () => {
    return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
  }

  /**
   * Generate a fallback ID for legacy messages without id field
   * Uses a simple hash of message content to create a stable identifier
   * @param {Object} msg - Message object
   * @returns {string} Fallback ID
   */
  const generateFallbackId = (msg) => {
    const content = JSON.stringify({
      role: msg.role,
      timestamp: msg.timestamp || 0,
      firstPartPreview: msg.parts?.[0]?.content?.slice(0, 50) || '',
    })

    let hash = 0
    for (const char of content) {
      hash = (hash << 5) - hash + char.charCodeAt(0)
      hash = hash & hash // Convert to 32-bit integer
    }

    return `legacy-${Math.abs(hash).toString(36)}`
  }

  /**
   * Merge two conversation arrays for multi-tab conflict resolution
   * Strategy:
   * - Use message id as key (or fallback id for legacy messages)
   * - Same id with different timestamps: keep the newer one
   * - Different ids: keep both, sort by timestamp
   * @param {Array} existingMessages - Messages from OPFS (other tabs' saves)
   * @param {Array} localMessages - Messages from current tab
   * @returns {Array} Merged conversation array
   */
  const mergeConversations = (existingMessages, localMessages) => {
    const messageMap = new Map()

    // 1. Add existing messages first
    for (const msg of existingMessages) {
      const key = msg.id || generateFallbackId(msg)
      messageMap.set(key, msg)
    }

    // 2. Merge local messages (same id: keep newer timestamp)
    for (const msg of localMessages) {
      const key = msg.id || generateFallbackId(msg)
      const existing = messageMap.get(key)

      if (!existing || (msg.timestamp || 0) >= (existing.timestamp || 0)) {
        messageMap.set(key, msg)
      }
    }

    // 3. Sort by timestamp
    const merged = Array.from(messageMap.values())
    merged.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))

    return merged
  }

  /**
   * Start a new agent session
   */
  const startNewAgentSession = () => {
    agentSessionId.value = `session-${Date.now()}`
    agentConversation.value = []
    agentStreamingMessage.value = null
    currentAgentHistoryId.value = null // Clear history ID for new session
    savedAgentImageCount.value = 0 // Reset saved image count
  }

  /**
   * Add a message to agent conversation
   * @param {Object} message - { role: 'user' | 'model', parts: Array }
   */
  const addAgentMessage = (message) => {
    const fullMessage = {
      id: generateMessageId(),
      timestamp: Date.now(),
      ...message,
    }
    agentConversation.value.push(fullMessage)
    return fullMessage.id
  }

  /**
   * Update an existing agent message
   * @param {string} messageId - The message ID to update
   * @param {Object} updates - Partial updates to apply
   */
  const updateAgentMessage = (messageId, updates) => {
    const index = agentConversation.value.findIndex((m) => m.id === messageId)
    if (index !== -1) {
      agentConversation.value[index] = {
        ...agentConversation.value[index],
        ...updates,
      }
    }
  }

  /**
   * Set the streaming message (message being received)
   */
  const setAgentStreamingMessage = (message) => {
    agentStreamingMessage.value = message
  }

  /**
   * Clear the streaming message
   */
  const clearAgentStreamingMessage = () => {
    agentStreamingMessage.value = null
  }

  /**
   * Clear agent conversation
   */
  const clearAgentConversation = () => {
    agentConversation.value = []
    agentStreamingMessage.value = null
    agentSessionId.value = null
    savedAgentImageCount.value = 0
  }

  /**
   * Get conversation messages for API (limited by contextDepth)
   */
  const getAgentContextMessages = () => {
    const depth = agentOptions.value.contextDepth || 5
    // Get last N messages (excluding streaming)
    return agentConversation.value.slice(-depth * 2) // *2 because each exchange has user+model
  }

  // ============================================================================
  // Agent Conversation Auto-Save
  // ============================================================================

  // Current agent history ID (for incremental saves)
  const currentAgentHistoryId = ref(null)

  // Debounced loadHistory for agent auto-save (avoid frequent UI updates)
  let loadHistoryDebounceTimer = null
  const debouncedLoadHistory = (delay = 1000) => {
    if (loadHistoryDebounceTimer) {
      clearTimeout(loadHistoryDebounceTimer)
    }
    loadHistoryDebounceTimer = setTimeout(async () => {
      loadHistoryDebounceTimer = null
      await loadHistory()
    }, delay)
  }

  /**
   * Save agent conversation incrementally (auto-save on each AI response)
   * Creates new history record on first save, updates on subsequent saves
   * @param {Object} options - Save options
   * @param {boolean} options.includeStreaming - Include current streaming message in save (for emergency saves)
   */
  const saveAgentConversation = async (options = {}) => {
    const { includeStreaming = false } = options

    if (agentConversation.value.length === 0 && !agentStreamingMessage.value) {
      return null
    }

    try {
      // Deep clone conversation to avoid reactive proxy issues
      let conversationSnapshot = JSON.parse(JSON.stringify(agentConversation.value))

      // Include streaming message if requested (for emergency saves during streaming)
      if (includeStreaming && agentStreamingMessage.value) {
        const streamingCopy = JSON.parse(JSON.stringify(agentStreamingMessage.value))
        // Mark as partial save so it can be identified when loading
        streamingCopy._isPartial = true
        // Ensure message has required fields
        streamingCopy.id = streamingCopy.id || generateMessageId()
        streamingCopy.timestamp = streamingCopy.timestamp || Date.now()
        conversationSnapshot.push(streamingCopy)
      }

      // === Multi-tab merge: read existing and merge with local ===
      const existingHistoryId = currentAgentHistoryId.value
      let mergedFromExisting = false
      let existingMessages = []

      if (existingHistoryId) {
        try {
          const opfsPath = `/conversations/${existingHistoryId}/conversation.json`
          existingMessages = await conversationStorage.loadConversation(opfsPath)

          if (existingMessages && existingMessages.length > 0) {
            // Filter out partial messages (from previous emergency/auto saves during streaming).
            // Partials are transient artifacts — each auto-save generates a new partial with a new ID,
            // so old partials become "ghosts" that accumulate in OPFS, inflate imageIndex, and cause
            // data-bearing images to be re-saved with higher indices on every save cycle.
            existingMessages = existingMessages.filter((msg) => !msg._isPartial)

            conversationSnapshot = mergeConversations(existingMessages, conversationSnapshot)
            mergedFromExisting = true
            console.log(
              `[saveAgentConversation] Merged ${existingMessages.length} existing + ${agentConversation.value.length} local → ${conversationSnapshot.length} total`,
            )
          }
        } catch (err) {
          // Merge failure is not fatal - fallback to overwrite behavior
          console.warn('[saveAgentConversation] Failed to load existing for merge, will overwrite:', err)
        }
      }

      // Skip if nothing to save after processing
      if (conversationSnapshot.length === 0) {
        return null
      }

      // Extract first user text message as prompt (max 200 chars)
      let prompt = ''
      for (const msg of conversationSnapshot) {
        if (msg.role === 'user') {
          const textPart = msg.parts?.find((p) => p.type === 'text')
          if (textPart?.content) {
            prompt = textPart.content.slice(0, 200)
            break
          }
        }
      }

      // Extract all thought content as thinkingText (for search)
      const thinkingTexts = []
      for (const msg of conversationSnapshot) {
        if (msg.role === 'model') {
          for (const part of msg.parts || []) {
            if (part.type === 'thought' && part.content?.trim()) {
              thinkingTexts.push(part.content)
            }
          }
        }
      }

      // Find thumbnail image: user input > generated > default
      let thumbnailData = null
      for (const msg of conversationSnapshot) {
        if (msg.role === 'user') {
          const imagePart = msg.parts?.find((p) => p.type === 'image')
          if (imagePart?.data && imagePart?.mimeType) {
            thumbnailData = { data: imagePart.data, mimeType: imagePart.mimeType }
            break
          }
        }
      }
      if (!thumbnailData) {
        for (const msg of conversationSnapshot) {
          if (msg.role === 'model') {
            const imagePart = msg.parts?.find((p) => p.type === 'generatedImage')
            if (imagePart?.data && imagePart?.mimeType) {
              thumbnailData = { data: imagePart.data, mimeType: imagePart.mimeType }
              break
            }
          }
        }
      }

      // Generate thumbnail base64
      let thumbnail = null
      if (thumbnailData) {
        try {
          const { generateThumbnail } = await import('@/composables/useImageCompression')
          thumbnail = await generateThumbnail(thumbnailData, { maxSize: 64 })
        } catch (err) {
          console.warn('[saveAgentConversation] Failed to generate thumbnail:', err)
        }
      }

      // Collect and compress only NEW images for OPFS storage
      // Index logic must match saveConversation: preserve ext indices, assign new after max
      const newImages = []
      const { compressToWebP, blobToBase64 } = await import('@/composables/useImageCompression')

      // Find the highest existing imageIndex from ext parts IN the merged conversation.
      // This determines where new sequential indices start (to avoid collision with preserved ext indices).
      // Note: only check conversationSnapshot (post-merge), NOT existingMessages,
      // because merge may have replaced ext parts with data-bearing local versions.
      let maxExtIndex = -1
      for (const msg of conversationSnapshot) {
        for (const part of msg.parts || []) {
          if (
            (part.type === 'image' || part.type === 'generatedImage') &&
            part.dataStoredExternally &&
            part.imageIndex !== undefined
          ) {
            maxExtIndex = Math.max(maxExtIndex, part.imageIndex)
          }
        }
      }

      // alreadySavedCount: indices below this are already in OPFS (from this tab's previous saves
      // or from other tabs' saves visible in existingMessages).
      let alreadySavedCount = savedAgentImageCount.value
      if (mergedFromExisting) {
        let maxExistingIndex = -1
        for (const msg of existingMessages) {
          for (const part of msg.parts || []) {
            if (
              (part.type === 'image' || part.type === 'generatedImage') &&
              part.dataStoredExternally &&
              part.imageIndex !== undefined
            ) {
              maxExistingIndex = Math.max(maxExistingIndex, part.imageIndex)
            }
          }
        }
        alreadySavedCount = Math.max(alreadySavedCount, maxExistingIndex + 1)
      }

      // Assign indices matching saveConversation's logic:
      // - ext parts: preserve their existing index (skip in iteration)
      // - data parts: assign next sequential index starting after max ext index in merged conv
      let nextImageIndex = Math.max(0, maxExtIndex + 1)

      for (const msg of conversationSnapshot) {
        for (const part of msg.parts || []) {
          if (part.type === 'image' || part.type === 'generatedImage') {
            // Skip already-stored images (from OPFS merge)
            if (part.dataStoredExternally) {
              continue
            }

            if (part.data) {
              const currentIndex = nextImageIndex++

              // Skip images already saved in previous rounds (optimization)
              if (currentIndex < alreadySavedCount) {
                continue
              }

              // Compress new image to WebP before storing
              try {
                const compressed = await compressToWebP(
                  { data: part.data, mimeType: part.mimeType || 'image/png' },
                  { quality: 0.85 },
                )
                const webpBase64 = await blobToBase64(compressed.blob)

                newImages.push({
                  data: webpBase64,
                  mimeType: 'image/webp',
                  messageId: msg.id,
                  partType: part.type,
                  width: compressed.width,
                  height: compressed.height,
                  index: currentIndex,
                })
              } catch (err) {
                console.warn('[saveAgentConversation] Failed to compress image, using original:', err)
                newImages.push({
                  data: part.data,
                  mimeType: part.mimeType || 'image/png',
                  messageId: msg.id,
                  partType: part.type,
                  index: currentIndex,
                })
              }
            }
          }
        }
      }

      const totalImageCount = nextImageIndex

      // Count actual image parts (for badge display, not index space)
      let imageCount = 0
      for (const msg of conversationSnapshot) {
        if (msg._isPartial) continue
        for (const part of msg.parts || []) {
          if (part.type === 'image' || part.type === 'generatedImage') {
            imageCount++
          }
        }
      }

      const historyData = {
        prompt: prompt || 'Agent conversation',
        mode: 'agent',
        options: {
          contextDepth: agentOptions.value.contextDepth,
          temperature: temperature.value,
          seed: seed.value,
        },
        status: 'success',
        thinkingText: thinkingTexts.join('\n\n').slice(0, 5000),
        messageCount: conversationSnapshot.length,
        userMessageCount: conversationSnapshot.filter((m) => m.role === 'user').length,
        imageCount,
        thumbnail,
      }

      let historyId = currentAgentHistoryId.value
      const isFirstSave = !historyId

      if (isFirstSave) {
        // First save: create new history record
        historyId = await addToHistory(historyData)
        currentAgentHistoryId.value = historyId
        console.log('[saveAgentConversation] Created new history record:', historyId)
      } else {
        // Subsequent save: update existing record
        await updateHistory(historyId, {
          ...historyData,
          timestamp: undefined, // Don't update timestamp on incremental saves
        })
        console.log('[saveAgentConversation] Updated history record:', historyId)
      }

      // Save conversation to OPFS (always overwrite with latest)
      await conversationStorage.saveConversation(historyId, conversationSnapshot)

      // Save only NEW images to OPFS (with correct indices)
      if (newImages.length > 0) {
        const { base64ToBlob } = await import('@/composables/useImageCompression')
        const { useOPFS } = await import('@/composables/useOPFS')
        const opfs = useOPFS()
        await opfs.initOPFS()

        // Ensure directory exists
        const dirPath = `images/${historyId}`
        await opfs.getOrCreateDirectory(dirPath)

        // Save each new image with its correct index
        for (const img of newImages) {
          const blob = await base64ToBlob(img.data, img.mimeType)
          const opfsPath = `/${dirPath}/${img.index}.webp`
          await opfs.writeFile(opfsPath, blob)
        }

        // Update image count after successful save
        savedAgentImageCount.value = totalImageCount
        console.log(`[saveAgentConversation] Saved ${newImages.length} new images (total: ${totalImageCount})`)
      }

      // Update storage usage
      updateStorageUsage()

      // Reload history to reflect changes
      if (isFirstSave) {
        // First save: immediate update so user sees it appear
        await loadHistory()
      } else {
        // Subsequent saves: debounce to avoid frequent UI updates
        debouncedLoadHistory()
      }

      return historyId
    } catch (err) {
      console.error('[saveAgentConversation] Failed:', err)
      throw err
    }
  }

  /**
   * Load agent conversation from history record
   * Used when user clicks on an agent history item to continue the conversation
   * @param {number} historyId - History record ID
   * @returns {Promise<boolean>} True if loaded successfully
   */
  const loadAgentFromHistory = async (historyId) => {
    try {
      // Load conversation from OPFS
      const opfsPath = `/conversations/${historyId}/conversation.json`
      const conversation = await conversationStorage.loadConversation(opfsPath)

      if (!conversation || conversation.length === 0) {
        console.warn('[loadAgentFromHistory] No conversation found for history:', historyId)
        return false
      }

      // Load image data from OPFS and restore to conversation
      // Images are stored at /images/{historyId}/{index}.webp
      let loadedImageCount = 0
      let maxImageIndex = -1
      for (const msg of conversation) {
        if (!msg.parts) continue
        for (const part of msg.parts) {
          if (part.dataStoredExternally && part.imageIndex !== undefined) {
            maxImageIndex = Math.max(maxImageIndex, part.imageIndex)
            try {
              const imagePath = `/images/${historyId}/${part.imageIndex}.webp`
              const base64 = await imageStorage.getImageBase64(imagePath)
              if (base64) {
                part.data = base64
                part.mimeType = 'image/webp'
                loadedImageCount++
                delete part.dataStoredExternally
                delete part.imageIndex
              }
            } catch (err) {
              console.warn('[loadAgentFromHistory] Failed to load image:', part.imageIndex, err)
            }
          }
        }
      }

      // Remove partial messages (from emergency saves during streaming)
      // These are incomplete AI responses that were saved when user left mid-stream
      const cleanedConversation = conversation.filter((msg) => !msg._isPartial)

      // Set conversation and history ID (to continue updating the same record)
      agentConversation.value = cleanedConversation
      currentAgentHistoryId.value = historyId
      agentSessionId.value = `session-${Date.now()}`
      agentStreamingMessage.value = null
      // Use max imageIndex + 1 to match saveConversation's index space
      savedAgentImageCount.value = maxImageIndex + 1

      const removedPartialCount = conversation.length - cleanedConversation.length
      if (removedPartialCount > 0) {
        console.log(`[loadAgentFromHistory] Removed ${removedPartialCount} partial message(s)`)
      }
      console.log(`[loadAgentFromHistory] Loaded conversation with ${cleanedConversation.length} messages, ${loadedImageCount}/${maxImageIndex + 1} images restored`)
      return true
    } catch (err) {
      console.error('[loadAgentFromHistory] Failed:', err)
      return false
    }
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
    isInitialized,
    apiKey,
    hasApiKey,
    theme,
    currentMode,
    prompt,
    temperature,
    seed,
    imageModel,
    generateOptions,
    editOptions,
    storyOptions,
    diagramOptions,
    stickerOptions,
    videoOptions,
    videoPromptOptions,
    slidesOptions,
    agentOptions,
    agentConversation,
    agentSessionId,
    agentStreamingMessage,
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
    generatedAudioUrls,
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
    setGeneratedAudioUrls,
    clearGeneratedAudioUrls,
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
    // Agent actions
    startNewAgentSession,
    addAgentMessage,
    updateAgentMessage,
    setAgentStreamingMessage,
    clearAgentStreamingMessage,
    clearAgentConversation,
    saveAgentConversation,
    loadAgentFromHistory,
    currentAgentHistoryId,
    getAgentContextMessages,
  }
})
