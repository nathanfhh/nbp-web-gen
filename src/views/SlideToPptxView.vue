<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useToast } from '@/composables/useToast'
import { useApiKeyManager } from '@/composables/useApiKeyManager'
import { useSlideToPptx } from '@/composables/useSlideToPptx'
import { useIndexedDB } from '@/composables/useIndexedDB'
import { useImageStorage } from '@/composables/useImageStorage'
import { useOcrSettings } from '@/composables/useOcrSettings'
import ImageLightbox from '@/components/ImageLightbox.vue'
import SlideFileUploader from '@/components/SlideFileUploader.vue'
import OcrRegionEditor from '@/components/OcrRegionEditor.vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import OcrSettingsModal from '@/components/OcrSettingsModal.vue'
import ApiKeyModal from '@/components/ApiKeyModal.vue'
import InpaintConfirmModal from '@/components/InpaintConfirmModal.vue'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()
const toast = useToast()

// Use composables
const slideToPptx = useSlideToPptx()
const indexedDB = useIndexedDB()
const imageStorage = useImageStorage()
const apiKeyManager = useApiKeyManager()
const { settings: ocrSettings, updateSetting: updateOcrSetting, modelSizeOptions } = useOcrSettings()

// API Key availability for Gemini options
// Use a version trigger to force re-evaluation when API keys change
const apiKeyVersion = ref(0)
const refreshApiKeyStatus = () => {
  apiKeyVersion.value++
}
const canUseGemini = computed(() => {
  apiKeyVersion.value // dependency trigger
  return apiKeyManager.hasPaidApiKey() || apiKeyManager.hasFreeTierApiKey()
})
const canUseGemini30 = computed(() => {
  apiKeyVersion.value // dependency trigger
  return apiKeyManager.hasPaidApiKey()
})

// View mode: 'loading' | 'upload' | 'processing' | 'error'
const viewMode = ref('loading')
const historyError = ref(false)

// Image state
const images = ref([])
const currentIndex = ref(0)
const isLoading = ref(true)
const historyRecord = ref(null)

// Uploaded images (for upload mode)
const uploadedImages = ref([])

// Log container ref for auto-scroll
const logContainer = ref(null)
const confirmModalRef = ref(null)
const ocrSettingsModalRef = ref(null)
const ocrRegionEditorRef = ref(null)
const apiKeyModalRef = ref(null)
const inpaintConfirmModalRef = ref(null)

// Thumbnail refs for auto-scroll
const thumbnailContainer = ref(null)
const thumbnailRefs = ref({})

// Select slide and scroll to center
const selectSlide = (idx) => {
  currentIndex.value = idx
  nextTick(() => {
    const thumbnail = thumbnailRefs.value[idx]
    if (thumbnail && thumbnailContainer.value) {
      thumbnail.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      })
    }
  })
}

// Handle mouse wheel on thumbnail strip - scroll horizontally
const onThumbnailWheel = (event) => {
  if (thumbnailContainer.value) {
    thumbnailContainer.value.scrollLeft += event.deltaY
  }
}

// OCR overlay toggle
const showOcrOverlay = ref(true)
// Separate toggles for merged and raw regions
const showMergedRegions = ref(true)
const showRawRegions = ref(true)
const showFailedRegions = ref(true) // Show regions where recognition failed

// Download button dropdown state
const showDownloadDropdown = ref(false)

// OCR JSON overlay (shows raw OCR result data)
const showOcrJsonOverlay = ref(false)

// Lightbox state
const lightboxOpen = ref(false)
const lightboxImages = ref([])
const lightboxIndex = ref(0)

// Region editing mode
const isRegionEditMode = ref(false)
const isReprocessing = ref(false)

const openLightbox = (imageUrl, index = 0) => {
  // ImageLightbox expects objects with url or data+mimeType
  lightboxImages.value = [{ url: imageUrl }]
  lightboxIndex.value = index
  lightboxOpen.value = true
}

// Snapshots when entering edit mode (for change detection)
// Separate snapshots: regions (affects inpaint) vs separators (only affects merge)
const editModeRegionsSnapshotRef = ref(null)
const editModeSeparatorsSnapshotRef = ref(null)

const enterEditMode = () => {
  isRegionEditMode.value = true
}

// Open lightbox in edit mode
const openLightboxForEdit = () => {
  const state = slideStates.value[currentIndex.value]
  if (!state?.originalImage) return

  // Record separate snapshots for regions and separators
  const regionsToUse = state.editedRawRegions || state.rawRegions || []
  const separatorLines = state.separatorLines || []

  // Regions snapshot - changes here require inpaint
  editModeRegionsSnapshotRef.value = JSON.stringify(
    regionsToUse.map(r => ({ bounds: r.bounds, text: r.text, polygon: r.polygon }))
  )

  // Separators snapshot - changes here only require remerge
  editModeSeparatorsSnapshotRef.value = JSON.stringify(
    separatorLines.map(s => ({ start: s.start, end: s.end }))
  )

  // Use original image for editing
  lightboxImages.value = [{ url: state.originalImage }]
  lightboxIndex.value = 0
  lightboxOpen.value = true

  // Enter edit mode after lightbox opens
  nextTick(() => {
    enterEditMode()
  })
}

const exitEditMode = async () => {
  isRegionEditMode.value = false
  lightboxOpen.value = false // Close lightbox when finishing edits

  const state = slideStates.value[currentIndex.value]
  if (!state) return

  // Create current snapshots for comparison
  const regionsToUse = state.editedRawRegions || state.rawRegions || []
  const separatorLines = state.separatorLines || []

  const currentRegionsSnapshot = JSON.stringify(
    regionsToUse.map(r => ({ bounds: r.bounds, text: r.text, polygon: r.polygon }))
  )
  const currentSeparatorsSnapshot = JSON.stringify(
    separatorLines.map(s => ({ start: s.start, end: s.end }))
  )

  // Check what changed during this edit session
  const regionsChanged = editModeRegionsSnapshotRef.value !== currentRegionsSnapshot
  const separatorsChanged = editModeSeparatorsSnapshotRef.value !== currentSeparatorsSnapshot

  // Clear snapshots
  editModeRegionsSnapshotRef.value = null
  editModeSeparatorsSnapshotRef.value = null

  // If nothing changed, nothing to do
  if (!regionsChanged && !separatorsChanged) {
    return
  }

  // Case 1: Only separators changed → just remerge, no inpaint needed
  if (!regionsChanged && separatorsChanged) {
    // Separators already trigger remerge in addSeparatorLine/deleteSeparatorLine
    // But we call it here to ensure consistency
    slideToPptx.remergeMergedRegions(currentIndex.value)
    return
  }

  // Case 2: Regions changed (with or without separator changes)
  // This requires inpaint (background regeneration)

  // Special case: If regions are back to original state (no edits, no separators)
  const isBackToOriginal = state.editedRawRegions === null &&
                           (state.separatorLines?.length || 0) === 0

  if (isBackToOriginal) {
    if (state.cleanImageIsOriginal) {
      // Already at original state with original cleanImage - nothing to do
      // This happens when user resets regions (which sets cleanImageIsOriginal = true)
      slideToPptx.remergeMergedRegions(currentIndex.value)
      return
    } else if (state.originalCleanImage) {
      // Restore original cleanImage (no API call needed)
      state.cleanImage = state.originalCleanImage
      state.cleanImageIsOriginal = true
      state.regionsSnapshotAtCleanImage = null
      slideToPptx.remergeMergedRegions(currentIndex.value)
      toast.success(t('slideToPptx.regionEditor.reprocessSuccess'))
      return
    }
  }

  // Regions have changed - need to reprocess (inpaint)
  const effectiveSettings = slideToPptx.getEffectiveSettings(currentIndex.value)

  if (effectiveSettings.inpaintMethod === 'gemini') {
    // Show confirmation modal for Gemini method
    const result = await inpaintConfirmModalRef.value?.show({
      originalImage: state.originalImage,
      cleanImage: state.cleanImage,
      existingPrompt: state.customInpaintPrompt || '',
      slideIndex: currentIndex.value,
    })

    // User closed modal without choosing
    if (!result) return

    // Save custom prompt (even if empty, to clear previous)
    state.customInpaintPrompt = result.customPrompt || null

    if (result.action === 'skip') {
      // Skip API call, only do remerge
      slideToPptx.remergeMergedRegions(currentIndex.value)
      toast.success(t('slideToPptx.inpaintConfirm.skipped'))
      return
    }
  }

  // Execute reprocessing (Gemini with user confirmation, or OpenCV)
  try {
    isReprocessing.value = true
    await slideToPptx.reprocessSlide(currentIndex.value)
    toast.success(t('slideToPptx.regionEditor.reprocessSuccess'))
  } catch (error) {
    toast.error(t('slideToPptx.regionEditor.reprocessFailed', { error: error.message }))
  } finally {
    isReprocessing.value = false
  }
}

// Region editing event handlers
const handleDeleteRegion = (index) => {
  slideToPptx.deleteRegion(currentIndex.value, index)
}

const handleDeleteRegionsBatch = (indices) => {
  slideToPptx.deleteRegionsBatch(currentIndex.value, indices)
}

/**
 * Handle region selection from sidebar click
 * Maps the filtered type/index to the actual rawRegions index
 */
const handleSelectRegion = ({ type, index }) => {
  if (!ocrRegionEditorRef.value) return

  // Get the raw regions for current slide
  const state = slideToPptx.slideStates.value[currentIndex.value]
  if (!state) return

  const rawRegions = state.editedRawRegions || state.rawRegions || []

  // Map filtered index back to rawRegions index
  // raw = regions without recognitionFailed, failed = regions with recognitionFailed
  let rawIndex = -1
  let count = 0

  for (let i = 0; i < rawRegions.length; i++) {
    const isFailed = rawRegions[i].recognitionFailed
    if ((type === 'raw' && !isFailed) || (type === 'failed' && isFailed)) {
      if (count === index) {
        rawIndex = i
        break
      }
      count++
    }
  }

  if (rawIndex >= 0) {
    ocrRegionEditorRef.value.selectRegion(rawIndex)
  }
}

const handleAddRegion = ({ bounds, text }) => {
  slideToPptx.addManualRegion(currentIndex.value, bounds, text)
}

const handleResizeRegion = ({ index, bounds, polygon }) => {
  slideToPptx.resizeRegion(currentIndex.value, index, bounds, polygon)
}

const handleTogglePolygonMode = (index) => {
  slideToPptx.togglePolygonMode(currentIndex.value, index)
}

const handleMoveVertex = ({ index, polygon }) => {
  slideToPptx.moveVertex(currentIndex.value, index, polygon)
}

const handleResetRegions = () => {
  slideToPptx.resetRegions(currentIndex.value)
}

// Separator line event handlers
const handleAddSeparator = (separator) => {
  slideToPptx.addSeparatorLine(currentIndex.value, separator)
}

const handleDeleteSeparator = (separatorId) => {
  slideToPptx.deleteSeparatorLine(currentIndex.value, separatorId)
}

// Get current separator lines
const currentSeparatorLines = computed(() => {
  return slideToPptx.getSeparatorLines(currentIndex.value)
})

// Get image URL for a slide (Single Source of Truth)
// Priority: slideStates[].originalImage (after processing) > images[].preview (before processing)
const getImageUrl = (idx) => {
  const state = slideStates.value[idx]
  if (state?.originalImage) return state.originalImage
  return images.value[idx]?.preview || ''
}

// Get current image URL for magnifier and main display
const currentImageUrl = computed(() => getImageUrl(currentIndex.value))

// Undo/Redo handlers
const handleUndo = () => {
  slideToPptx.undo(currentIndex.value)
}

const handleRedo = () => {
  slideToPptx.redo(currentIndex.value)
}

// Undo/Redo availability
const currentCanUndo = computed(() => {
  return slideToPptx.canUndo(currentIndex.value)
})

const currentCanRedo = computed(() => {
  return slideToPptx.canRedo(currentIndex.value)
})

// Get current editable regions (edited or original)
const currentEditableRegions = computed(() => {
  return slideToPptx.getEditableRegions(currentIndex.value)
})

// Check if current slide has been edited (derived from state)
const currentSlideIsEdited = computed(() => {
  const state = slideStates.value[currentIndex.value]
  if (!state) return false
  return state.editedRawRegions !== null || (state.separatorLines?.length > 0)
})

// Sync settings with composable
const settings = slideToPptx.settings

// Current slide state
const currentSlideState = computed(() => slideStates.value[currentIndex.value])

// Clean image version history for current slide
const currentCleanImageHistory = computed(() => {
  return slideToPptx.getCleanImageHistory(currentIndex.value)
})
const currentActiveHistoryIndex = computed(() => {
  const state = slideStates.value[currentIndex.value]
  return state?.activeHistoryIndex ?? 0
})

// Handle version selection from history thumbnails
const handleSelectVersion = (versionIndex) => {
  slideToPptx.selectCleanImageVersion(currentIndex.value, versionIndex)
}

// Handle delete current version (with confirmation)
const handleDeleteCurrentVersion = async () => {
  const confirmed = await confirmModalRef.value?.show({
    title: t('slideToPptx.versionHistory.deleteConfirmTitle'),
    message: t('slideToPptx.versionHistory.deleteConfirmMessage'),
    confirmText: t('common.delete'),
    cancelText: t('common.cancel'),
    type: 'danger',
  })
  if (confirmed) {
    const deleted = slideToPptx.deleteCleanImageVersion(currentIndex.value, currentActiveHistoryIndex.value)
    if (deleted) {
      toast.success(t('slideToPptx.versionHistory.deleted'))
    }
  }
}

// Current slide's OCR results based on mode
const currentOcrRegions = computed(() => {
  if (!slideStates.value[currentIndex.value]) return { merged: [], raw: [], failed: [] }
  // Use editedRawRegions when available (contains isPolygonMode and edited polygon data)
  const rawRegions = slideStates.value[currentIndex.value].editedRawRegions || slideStates.value[currentIndex.value].rawRegions || []
  return {
    merged: slideStates.value[currentIndex.value].regions || [],
    raw: rawRegions.filter(r => !r.recognitionFailed),
    failed: rawRegions.filter(r => r.recognitionFailed)
  }
})

// OCR source statistics (PaddleOCR vs Tesseract)
const ocrSourceStats = computed(() => {
  const raw = currentOcrRegions.value.raw
  const tesseract = raw.filter(r => r.recognitionSource === 'tesseract').length
  const paddleocr = raw.length - tesseract
  return { tesseract, paddleocr }
})

// Navigation
const hasPrev = computed(() => currentIndex.value > 0)
const hasNext = computed(() => currentIndex.value < images.value.length - 1)

const goToPrev = () => {
  if (hasPrev.value) currentIndex.value--
}

const goToNext = () => {
  if (hasNext.value) currentIndex.value++
}

/**
 * Load images from history record via IndexedDB + OPFS
 * @param {number} historyId - History record ID
 */
const loadFromHistory = async (historyId) => {
  try {
    // Get history record from IndexedDB
    const record = await indexedDB.getHistoryById(historyId)
    if (!record) {
      toast.error(t('slideToPptx.historyNotFound'))
      return false
    }

    if (!record.images || record.images.length === 0) {
      toast.error(t('slideToPptx.noImagesInHistory'))
      return false
    }

    historyRecord.value = record

    // Load actual images from OPFS
    const loadedImages = await imageStorage.loadHistoryImages(record)

    // Convert to format needed by the view
    images.value = loadedImages.map((img, idx) => ({
      id: idx,
      data: null, // Will be loaded on demand for processing
      mimeType: img.mimeType || 'image/webp',
      preview: img.url || img.thumbnail,
      opfsPath: img.opfsPath,
    }))

    return true
  } catch (e) {
    console.error('Failed to load from history:', e)
    toast.error(t('slideToPptx.loadFailed'))
    return false
  }
}

// Load images on mount
onMounted(async () => {
  try {
    const historyId = route.query['history-id']

    if (historyId) {
      // Load from IndexedDB by history_id
      const success = await loadFromHistory(Number(historyId))
      if (!success) {
        // History not found - show error with option to use file upload
        historyError.value = true
        viewMode.value = 'error'
      } else {
        viewMode.value = 'processing'
      }
    } else {
      // No history-id provided - show upload interface
      viewMode.value = 'upload'
    }
  } catch (e) {
    console.error('Failed to load images:', e)
    toast.error(t('slideToPptx.loadFailed'))
    historyError.value = true
    viewMode.value = 'error'
  } finally {
    isLoading.value = false
  }
})

/**
 * Handle uploaded images from SlideFileUploader
 */
const handleUploadedImages = (newImages) => {
  uploadedImages.value = newImages
}

/**
 * Start processing uploaded images
 */
const startProcessingUploaded = () => {
  if (uploadedImages.value.length === 0) return

  // Convert uploaded images to the format needed by the view
  images.value = uploadedImages.value.map((img, idx) => ({
    id: idx,
    data: img.data,
    mimeType: img.mimeType,
    preview: img.preview,
    opfsPath: null,
  }))

  viewMode.value = 'processing'
}

/**
 * Switch to file upload mode (from error state)
 */
const useFileUpload = () => {
  historyError.value = false
  // Remove history-id from URL
  router.replace({ query: {} })
  viewMode.value = 'upload'
}

// Prevent accidental page close during processing
const handleBeforeUnload = (e) => {
  if (slideToPptx.isProcessing.value) {
    e.preventDefault()
    e.returnValue = t('slideToPptx.confirmLeave')
    return e.returnValue
  }
}

// Subscribe to OCR settings changes for WYSIWYG
onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload)
  // Close dropdown when clicking outside
  document.addEventListener('click', closeDropdownOnOutsideClick)
})

onUnmounted(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
  document.removeEventListener('click', closeDropdownOnOutsideClick)
})

// Handle settings modal close - re-merge regions with new settings (WYSIWYG)
const handleSettingsModalClose = () => {
  if (slideStates.value.some(s => s.status === 'done' && s.rawRegions?.length > 0)) {
    slideToPptx.remergeAllSlides()
  }
}

const goBack = () => {
  router.push('/')
}

// Computed properties from composable
const isProcessing = computed(() => slideToPptx.isProcessing.value)
const currentStep = computed(() => slideToPptx.currentStep.value)
const progress = computed(() => slideToPptx.progress.value)
const logs = computed(() => slideToPptx.logs.value)
const slideStates = slideToPptx.slideStates

// Setting mode and preview mode from composable
const settingMode = computed({
  get: () => slideToPptx.settingMode.value,
  set: (v) => { slideToPptx.settingMode.value = v },
})

// Check if a slide has custom settings
const hasCustomSettings = (index) => {
  return slideStates.value[index]?.overrideSettings !== null
}

// Check if current page has custom settings
const currentPageHasCustomSettings = computed(() => {
  return hasCustomSettings(currentIndex.value)
})

// Update a setting - handles both global and per-page modes
const updateSetting = (key, value) => {
  if (settingMode.value === 'global') {
    // Update global settings
    settings[key] = value
  } else {
    // Per-page mode: create/update override for current page
    const currentOverride = slideStates.value[currentIndex.value]?.overrideSettings || {}
    slideToPptx.setSlideSettings(currentIndex.value, {
      ...currentOverride,
      [key]: value,
    })
  }
}

// Reset current page to use global settings
const resetToGlobalSettings = () => {
  slideToPptx.setSlideSettings(currentIndex.value, null)
}

// Clear OCR model cache from OPFS
const clearModelCache = async () => {
  const confirmed = await confirmModalRef.value?.show({
    title: t('slideToPptx.ocrEngine.clearCache'),
    message: t('slideToPptx.ocrEngine.clearCacheConfirm'),
  })
  if (!confirmed) return

  const success = await slideToPptx.clearOcrModelCache()
  if (success) {
    toast.success(t('slideToPptx.ocrEngine.cacheCleared'))
  }
}

// Get the display value for a setting (respects per-page mode)
const getSettingValue = (key) => {
  if (settingMode.value === 'per-page') {
    const override = slideStates.value[currentIndex.value]?.overrideSettings
    if (override && key in override) {
      return override[key]
    }
  }
  return settings[key]
}

// Get successful slides for download
const successfulSlides = computed(() => {
  return slideStates.value
    .map((state, idx) => ({ ...state, originalIndex: idx }))
    .filter(s => s.status === 'done')
})

// Download PPTX
const downloadPptx = async () => {
  showDownloadDropdown.value = false
  const success = await slideToPptx.downloadPptx()
  if (success) {
    toast.success(t('slideToPptx.downloadSuccess'))
  }
}

// Open conversion settings modal
const openConversionSettings = () => {
  showDownloadDropdown.value = false
  ocrSettingsModalRef.value?.open()
}

// Toggle download dropdown
const toggleDownloadDropdown = () => {
  showDownloadDropdown.value = !showDownloadDropdown.value
}

// Close dropdown when clicking outside
const closeDropdownOnOutsideClick = (event) => {
  const dropdown = event.target.closest('.download-dropdown-container')
  if (!dropdown) {
    showDownloadDropdown.value = false
  }
}

// Current slide's OCR results (for PPTX export - merged only)
// eslint-disable-next-line no-unused-vars
const _currentOcrResults = computed(() => {
  if (slideStates.value[currentIndex.value]) {
    return slideStates.value[currentIndex.value].ocrResults || []
  }
  return []
})

// Full OCR data for JSON overlay (includes raw, failed, polygon, etc.)
const currentOcrFullData = computed(() => {
  const state = slideStates.value[currentIndex.value]
  if (!state) return null

  const rawRegions = state.rawRegions || []
  const recognized = rawRegions.filter(r => !r.recognitionFailed)
  const failed = rawRegions.filter(r => r.recognitionFailed)
  const merged = state.regions || []

  return {
    summary: {
      totalDetections: rawRegions.length,
      recognized: recognized.length,
      failed: failed.length,
      mergedBlocks: merged.length,
    },
    merged: merged.map(r => ({
      text: r.text,
      confidence: Math.round(r.confidence),
      bounds: r.bounds,
    })),
    raw: {
      recognized: recognized.map(r => ({
        text: r.text,
        confidence: Math.round(r.confidence),
        detectionScore: r.detectionScore ? Math.round(r.detectionScore * 100) / 100 : null,
        bounds: r.bounds,
        polygon: r.polygon,
      })),
      failed: failed.map(r => ({
        failureReason: r.failureReason,
        detectionScore: r.detectionScore ? Math.round(r.detectionScore * 100) / 100 : null,
        bounds: r.bounds,
        polygon: r.polygon,
      })),
    },
  }
})

// Auto-scroll log to bottom when new logs are added
watch(logs, () => {
  nextTick(() => {
    if (logContainer.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight
    }
  })
}, { deep: true })

// Initialize slideStates when images are loaded (for per-page settings)
watch(
  () => images.value.length,
  (count) => {
    if (count > 0) {
      slideToPptx.initSlideStates(count)
    }
  },
  { immediate: true }
)

// Exit edit mode when lightbox is closed
watch(lightboxOpen, (isOpen) => {
  if (!isOpen && isRegionEditMode.value) {
    exitEditMode()
  }
})

// Show toast when OCR model size fallback occurs
watch(slideToPptx.ocrModelSizeFallbackOccurred, (occurred) => {
  if (occurred) {
    toast.warning(t('ocrSettings.modelSizeFallback'))
  }
})

// Prepare images for processing (load from various sources)
// Priority: img.data > img.opfsPath > img.preview > slideStates[].originalImage
const prepareImagesForProcessing = async () => {
  const preparedImages = []

  for (let idx = 0; idx < images.value.length; idx++) {
    const img = images.value[idx]
    const state = slideStates.value[idx]

    if (img.data) {
      // Already has base64 data (from sessionStorage or upload)
      preparedImages.push({
        data: img.data,
        mimeType: img.mimeType,
      })
    } else if (img.opfsPath) {
      // Load from OPFS (getImageBase64 already returns raw base64 without prefix)
      const base64 = await imageStorage.getImageBase64(img.opfsPath)
      if (base64) {
        preparedImages.push({
          data: base64,
          mimeType: img.mimeType,
        })
      }
    } else if (img.preview) {
      // Use preview URL (data URL or blob URL) - convert to base64
      const response = await fetch(img.preview)
      const blob = await response.blob()
      const base64 = await new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.readAsDataURL(blob)
      })
      preparedImages.push({
        data: base64.split(',')[1],
        mimeType: img.mimeType || 'image/png',
      })
    } else if (state?.originalImage) {
      // Fallback: use slideStates[].originalImage (Single Source of Truth after first processing)
      // This handles re-processing after images array has been cleared
      const dataUrl = state.originalImage
      preparedImages.push({
        data: dataUrl.split(',')[1],
        mimeType: dataUrl.split(';')[0].split(':')[1] || 'image/png',
      })
    }
  }

  return preparedImages
}

// Start processing
const startProcessing = async () => {
  if (images.value.length === 0) {
    toast.error(t('slideToPptx.noImages'))
    return
  }

  // Prepare images (load from OPFS if needed)
  const preparedImages = await prepareImagesForProcessing()

  if (preparedImages.length === 0) {
    toast.error(t('slideToPptx.loadFailed'))
    return
  }

  // Callback to confirm reprocessing Gemini slides (only when Gemini → Gemini)
  const onConfirmGeminiReprocess = async (slideIndex, state) => {
    return await inpaintConfirmModalRef.value?.show({
      originalImage: state.originalImage,
      cleanImage: state.cleanImage,
      existingPrompt: state.customInpaintPrompt || '',
      slideIndex,
      showApplyToRemaining: true, // Enable "apply to remaining" option in batch mode
    })
  }

  await slideToPptx.processAll(preparedImages, {
    onComplete: (successCount, failCount) => {
      if (failCount === 0) {
        toast.success(t('slideToPptx.success.complete'))
      } else {
        toast.warning(t('slideToPptx.partialSuccess', { success: successCount, failed: failCount }))
      }

      // Check for failed OCR regions and warn user
      const failedRegionsSummary = slideStates.value
        .map((state, idx) => {
          const failedCount = (state.rawRegions || []).filter(r => r.recognitionFailed).length
          return failedCount > 0 ? { page: idx + 1, count: failedCount } : null
        })
        .filter(Boolean)

      if (failedRegionsSummary.length > 0) {
        const warningMessage = failedRegionsSummary
          .map(s => t('slideToPptx.ocrWarning.pageFailedCount', { page: s.page, count: s.count }))
          .join('\n')
        toast.warning(t('slideToPptx.ocrWarning.title') + '\n' + warningMessage, { duration: 8000 })
      }

      // Release all image data to free memory (~30MB per slide: data + preview)
      // After processing, slideStates[].originalImage is the Single Source of Truth
      // UI uses getImageUrl() which reads from slideStates first
      // Keep images array structure (id only) for v-for iteration
      uploadedImages.value = []
      images.value = images.value.map(img => ({ id: img.id }))
    },
    onError: () => {
      toast.error(t('slideToPptx.errors.pptxFailed'))
    },
  }, {
    onConfirmGeminiReprocess,
  })
}

// Cancel processing
const cancelProcessing = () => {
  slideToPptx.cancel()
}

// Clean up on unmount
onUnmounted(() => {
  slideToPptx.cleanup()
  imageStorage.cleanupCache()
})

// Detect slide ratio from first image
const detectedRatio = computed(() => {
  // Check uploadedImages first (upload mode), then images (processing mode)
  const sourceImages = uploadedImages.value.length > 0 ? uploadedImages.value : images.value
  if (sourceImages.length === 0) return null

  const firstImage = sourceImages[0]
  if (!firstImage.width || !firstImage.height) return null

  const ratio = firstImage.width / firstImage.height

  // Match to standard ratios with tolerance
  if (ratio >= 1.7 && ratio <= 1.85) {
    return '16:9' // 1.777...
  } else if (ratio >= 1.25 && ratio <= 1.4) {
    return '4:3' // 1.333...
  } else if (ratio >= 0.5 && ratio <= 0.6) {
    return '9:16' // 0.5625
  } else {
    // Return actual ratio for non-standard sizes
    return `${firstImage.width}:${firstImage.height}`
  }
})

// Get slide status badge
const getSlideStatus = (index) => {
  if (!slideStates.value[index]) return 'pending'
  return slideStates.value[index].status
}

// Check if selected ratio differs from detected ratio
const ratioMismatch = computed(() => {
  if (!detectedRatio.value) return null
  if (settings.slideRatio === 'auto') return null

  // Standard ratios that can be compared
  const standardRatios = ['16:9', '4:3', '9:16']
  const selectedRatio = settings.slideRatio
  const detected = detectedRatio.value

  // If detected is a standard ratio and doesn't match selected
  if (standardRatios.includes(detected) && detected !== selectedRatio) {
    return { imageRatio: detected, slideRatio: selectedRatio }
  }

  // If detected is non-standard (e.g., "1920:1080"), always show warning
  if (!standardRatios.includes(detected)) {
    return { imageRatio: detected, slideRatio: selectedRatio }
  }

  return null
})
</script>

<template>
  <div class="relative z-10 min-h-screen">
    <!-- Header -->
    <header class="sticky top-0 z-50 backdrop-blur-xl bg-glass-bg-strong border-b border-border-subtle shadow-card">
      <div class="container mx-auto px-4 py-4 flex items-center justify-between relative">
        <button
          @click="goBack"
          class="flex items-center gap-2 text-text-muted hover:text-text-primary transition-colors z-10"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
          <span class="hidden sm:inline">{{ $t('common.back') }}</span>
        </button>
        <!-- Title centered absolutely -->
        <h1 class="absolute left-1/2 -translate-x-1/2 text-xl font-semibold text-text-primary truncate max-w-[60%] sm:max-w-none">
          {{ $t('slideToPptx.title') }}
        </h1>
        <!-- Spacer for layout balance -->
        <div class="w-8 sm:w-24"></div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="container mx-auto px-4 py-8">
      <!-- Loading State -->
      <div v-if="isLoading" class="flex items-center justify-center h-64">
        <div class="animate-spin w-8 h-8 border-2 border-mode-generate border-t-transparent rounded-full"></div>
      </div>

      <!-- Upload Mode -->
      <div v-else-if="viewMode === 'upload'" class="max-w-4xl mx-auto">
        <SlideFileUploader
          :images="uploadedImages"
          :max-items="30"
          @update:images="handleUploadedImages"
          @start-processing="startProcessingUploaded"
        />
      </div>

      <!-- Error State (invalid history-id) -->
      <div v-else-if="viewMode === 'error'" class="text-center py-16">
        <div class="w-20 h-20 mx-auto mb-6 rounded-full bg-status-warning-muted flex items-center justify-center">
          <svg class="w-10 h-10 text-status-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <p class="text-text-primary text-lg font-medium mb-2">{{ $t('slideToPptx.historyNotFound') }}</p>
        <p class="text-text-muted mb-6">{{ $t('slideToPptx.historyNotFoundDesc') }}</p>
        <div class="flex items-center justify-center gap-4">
          <button
            @click="goBack"
            class="px-6 py-3 rounded-xl font-medium transition-all border border-border-default text-text-secondary hover:border-mode-generate hover:text-mode-generate"
          >
            {{ $t('slideToPptx.backToHome') }}
          </button>
          <button
            @click="useFileUpload"
            class="px-6 py-3 rounded-xl font-medium transition-all bg-mode-generate hover:bg-mode-generate-hover text-text-on-brand"
          >
            {{ $t('slideToPptx.useFileUpload') }}
          </button>
        </div>
      </div>

      <!-- No Images State (legacy) -->
      <div v-else-if="images.length === 0" class="text-center py-16">
        <div class="w-20 h-20 mx-auto mb-6 rounded-full bg-bg-muted flex items-center justify-center">
          <svg class="w-10 h-10 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <p class="text-text-muted text-lg mb-4">{{ $t('slideToPptx.noImagesFound') }}</p>
        <button
          @click="goBack"
          class="px-6 py-3 rounded-xl font-medium transition-all bg-mode-generate hover:bg-mode-generate-hover text-text-on-brand"
        >
          {{ $t('common.back') }}
        </button>
      </div>

      <!-- Main Grid -->
      <div v-else class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Left: Image Preview -->
        <div class="lg:col-span-2 space-y-4">
          <!-- Preview Card -->
          <div class="glass p-6">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-lg font-semibold text-text-primary flex items-center gap-2">
                <svg class="w-5 h-5 text-mode-generate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {{ $t('slideToPptx.preview') }}
              </h2>
              <span class="text-sm text-text-muted">
                {{ currentIndex + 1 }} / {{ images.length }}
              </span>
            </div>

            <!-- Image Container - Unified Animated Layout -->
            <div class="relative">
              <div class="flex flex-col sm:flex-row transition-all duration-500 ease-in-out">
                <!-- Left: Original Image -->
                <div class="flex-1 min-w-0 transition-all duration-500">
                  <!-- Label (Animate height/opacity) -->
                  <div 
                    class="transition-all duration-500 overflow-hidden"
                    :class="currentSlideState?.cleanImage ? 'h-6 mb-2 opacity-100' : 'h-0 mb-0 opacity-0'"
                  >
                    <h4 class="text-xs font-medium text-text-muted text-center">{{ $t('slideToPptx.original') }}</h4>
                  </div>

                  <div
                    class="relative aspect-video rounded-xl overflow-hidden bg-bg-muted border border-border-muted cursor-pointer hover:border-mode-generate transition-colors"
                    @click="currentImageUrl && openLightbox(currentImageUrl)"
                  >
                    <img
                      v-if="currentImageUrl"
                      :src="currentImageUrl"
                      alt="Original"
                      class="absolute inset-0 w-full h-full object-contain"
                    />
                    
                    <!-- OCR Overlay -->
                    <div v-if="showOcrOverlay && (currentOcrRegions.merged.length > 0 || currentOcrRegions.raw.length > 0 || currentOcrRegions.failed.length > 0)" class="absolute inset-0 pointer-events-none">
                      <svg class="w-full h-full" :viewBox="`0 0 ${slideStates[currentIndex]?.width || 1920} ${slideStates[currentIndex]?.height || 1080}`" preserveAspectRatio="xMidYMid meet">
                        <!-- Merged Regions (Blue) -->
                        <template v-if="showMergedRegions">
                          <template v-for="(result, idx) in currentOcrRegions.merged" :key="`merged-${idx}`">
                            <polygon
                              v-if="result.isPolygonMode && result.polygon"
                              :points="result.polygon.map(p => p.join(',')).join(' ')"
                              fill="rgba(59, 130, 246, 0.2)"
                              stroke="rgba(59, 130, 246, 0.8)"
                              stroke-width="2"
                            />
                            <rect
                              v-else
                              :x="result.bounds.x"
                              :y="result.bounds.y"
                              :width="result.bounds.width"
                              :height="result.bounds.height"
                              fill="rgba(59, 130, 246, 0.2)"
                              stroke="rgba(59, 130, 246, 0.8)"
                              stroke-width="2"
                            />
                          </template>
                        </template>
                        <!-- Raw Regions (Green Dashed) -->
                        <template v-if="showRawRegions">
                          <template v-for="(result, idx) in currentOcrRegions.raw" :key="`raw-${idx}`">
                            <polygon
                              v-if="result.isPolygonMode && result.polygon"
                              :points="result.polygon.map(p => p.join(',')).join(' ')"
                              fill="rgba(16, 185, 129, 0.1)"
                              stroke="rgba(16, 185, 129, 0.8)"
                              stroke-width="1"
                              stroke-dasharray="4"
                            />
                            <rect
                              v-else
                              :x="result.bounds.x"
                              :y="result.bounds.y"
                              :width="result.bounds.width"
                              :height="result.bounds.height"
                              fill="rgba(16, 185, 129, 0.1)"
                              stroke="rgba(16, 185, 129, 0.8)"
                              stroke-width="1"
                              stroke-dasharray="4"
                            />
                          </template>
                        </template>
                        <!-- Failed Regions (Red Dashed) -->
                        <template v-if="showFailedRegions">
                          <template v-for="(result, idx) in currentOcrRegions.failed" :key="`failed-${idx}`">
                            <polygon
                              v-if="result.isPolygonMode && result.polygon"
                              :points="result.polygon.map(p => p.join(',')).join(' ')"
                              fill="rgba(239, 68, 68, 0.15)"
                              stroke="rgba(239, 68, 68, 0.9)"
                              stroke-width="2"
                              stroke-dasharray="6 3"
                            />
                            <rect
                              v-else
                              :x="result.bounds.x"
                              :y="result.bounds.y"
                              :width="result.bounds.width"
                              :height="result.bounds.height"
                              fill="rgba(239, 68, 68, 0.15)"
                              stroke="rgba(239, 68, 68, 0.9)"
                              stroke-width="2"
                              stroke-dasharray="6 3"
                            />
                          </template>
                        </template>
                      </svg>
                    </div>

                    <!-- Navigation Arrows (Only when NOT split) -->
                    <template v-if="!currentSlideState?.cleanImage">
                      <button
                        v-if="hasPrev"
                        @click.stop="goToPrev"
                        class="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition-colors z-10"
                      >
                        <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      <button
                        v-if="hasNext"
                        @click.stop="goToNext"
                        class="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition-colors z-10"
                      >
                        <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </template>
                  </div>
                </div>

                <!-- Right: Processed Image (Transition Entry) -->
                <div
                  class="transition-all duration-500 ease-in-out flex flex-col"
                  :class="currentSlideState?.cleanImage ? 'flex-1 mt-4 sm:mt-0 sm:ml-4 opacity-100' : 'w-0 mt-0 ml-0 opacity-0 overflow-hidden'"
                >
                  <div class="h-6 mb-2 flex-shrink-0">
                    <h4 class="text-xs font-medium text-text-muted text-center whitespace-nowrap">{{ $t('slideToPptx.processed') }}</h4>
                  </div>
                  
                  <div
                    class="relative aspect-video rounded-xl overflow-hidden bg-bg-muted border border-border-muted cursor-pointer hover:border-mode-generate transition-colors"
                    @click="openLightbox(currentSlideState.cleanImage)"
                  >
                    <img
                      v-if="currentSlideState.cleanImage && !isReprocessing"
                      :src="currentSlideState.cleanImage"
                      alt="Processed"
                      class="absolute inset-0 w-full h-full object-contain"
                    />
                    
                    <!-- Loading / Settlement Overlay -->
                    <div v-if="isReprocessing" class="absolute inset-0 z-10 flex flex-col items-center justify-center bg-bg-elevated/80 backdrop-blur-sm">
                      <div class="animate-spin w-8 h-8 border-2 border-mode-generate border-t-transparent rounded-full mb-3"></div>
                      <span class="text-sm font-medium text-text-primary animate-pulse">{{ $t('slideToPptx.settling') }}</span>
                    </div>

                  </div>

                  <!-- Version History Thumbnails -->
                  <div
                    v-if="currentCleanImageHistory.length > 1"
                    class="mt-0.5 -mx-1.5 px-1.5 flex gap-2 overflow-x-auto py-1.5"
                  >
                    <div
                      v-for="(version, idx) in currentCleanImageHistory"
                      :key="idx"
                      class="relative flex-shrink-0"
                    >
                      <button
                        @click="handleSelectVersion(idx)"
                        class="relative w-16 h-9 rounded-lg overflow-hidden border-2 transition-all duration-200"
                        :class="currentActiveHistoryIndex === idx
                          ? 'border-mode-generate ring-2 ring-mode-generate ring-offset-1 ring-offset-bg-elevated'
                          : 'border-border-muted hover:border-text-muted hover:opacity-90'"
                        :title="version.isOriginal
                          ? $t('slideToPptx.versionHistory.original')
                          : $t('slideToPptx.versionHistory.version', { n: idx })"
                      >
                        <img
                          :src="version.image"
                          :alt="version.isOriginal ? 'Original' : `Version ${idx}`"
                          class="w-full h-full object-contain bg-bg-muted"
                        />
                        <!-- Selected overlay with checkmark -->
                        <div
                          v-if="currentActiveHistoryIndex === idx"
                          class="absolute inset-0 bg-black/40 flex items-center justify-center"
                        >
                          <svg class="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      </button>
                      <!-- Delete button on non-original versions -->
                      <button
                        v-if="!version.isOriginal && currentActiveHistoryIndex === idx"
                        @click.stop="handleDeleteCurrentVersion"
                        class="absolute -top-1 -right-1 z-10 w-4 h-4 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-colors shadow-sm"
                        :title="$t('slideToPptx.versionHistory.delete')"
                      >
                        <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- OCR JSON Overlay (Unified) -->
              <div
                v-if="showOcrJsonOverlay && currentOcrFullData"
                class="absolute inset-0 bg-black/80 backdrop-blur-sm rounded-xl overflow-auto p-4 z-20"
                @click.stop
              >
                <pre class="text-xs text-green-400 font-mono whitespace-pre-wrap break-all">{{ JSON.stringify(currentOcrFullData, null, 2) }}</pre>
              </div>

              <!-- OCR JSON Toggle Button (Unified) -->
              <button
                v-if="currentOcrFullData"
                @click.stop="showOcrJsonOverlay = !showOcrJsonOverlay"
                class="absolute top-0 right-0 z-30 p-2 rounded-lg transition-colors"
                :class="showOcrJsonOverlay ? 'bg-mode-generate text-white' : 'bg-black/50 hover:bg-black/70 text-white'"
                :title="$t('slideToPptx.toggleOcrJson')"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </button>
            </div>

            <!-- OCR Region Toggle Buttons -->
            <div class="mt-4 flex flex-wrap items-center justify-end gap-2">
              <!-- Merged Regions Toggle -->
              <button
                @click="showMergedRegions = !showMergedRegions"
                class="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200 flex items-center gap-1.5"
                :class="showMergedRegions
                  ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                  : 'border-border-muted bg-transparent text-text-muted hover:border-text-muted'"
              >
                <span class="w-2 h-2 rounded-full" :class="showMergedRegions ? 'bg-blue-500' : 'bg-transparent border border-current'"></span>
                {{ $t('slideToPptx.overlayMode.merged') }}
              </button>

              <!-- Raw Regions Toggle -->
              <button
                @click="showRawRegions = !showRawRegions"
                class="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200 flex items-center gap-1.5"
                :class="showRawRegions
                  ? 'border-green-500 bg-green-500/10 text-green-400'
                  : 'border-border-muted bg-transparent text-text-muted hover:border-text-muted'"
              >
                <span class="w-2 h-2 rounded-full" :class="showRawRegions ? 'bg-green-500' : 'bg-transparent border border-current'"></span>
                {{ $t('slideToPptx.overlayMode.raw') }}
              </button>

              <!-- Failed Regions Toggle (Debug) -->
              <button
                v-if="currentOcrRegions.failed.length > 0"
                @click="showFailedRegions = !showFailedRegions"
                class="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200 flex items-center gap-1.5"
                :class="showFailedRegions
                  ? 'border-red-500 bg-red-500/10 text-red-400'
                  : 'border-border-muted bg-transparent text-text-muted hover:border-text-muted'"
              >
                <span class="w-2 h-2 rounded-full" :class="showFailedRegions ? 'bg-red-500' : 'bg-transparent border border-current'"></span>
                {{ $t('slideToPptx.overlayMode.failed') }} ({{ currentOcrRegions.failed.length }})
              </button>

              <!-- Edit Regions Button -->
              <button
                v-if="currentOcrRegions.raw.length > 0 || currentOcrRegions.failed.length > 0"
                @click="openLightboxForEdit"
                class="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200 flex items-center gap-1.5 border-amber-500 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                :class="{ 'ring-2 ring-amber-500/50': currentSlideIsEdited }"
              >
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                {{ $t('slideToPptx.regionEditor.editButton') }}
                <span v-if="currentSlideIsEdited" class="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
              </button>
            </div>

            <!-- Thumbnail Strip - Full Width Below -->
            <div class="mt-4 -mx-2">
              <!-- Processing indicator (shows during processing) -->
              <div v-if="isProcessing" class="px-2 mb-2 flex items-center gap-2">
                <div class="w-2 h-2 rounded-full bg-mode-generate animate-pulse"></div>
                <span class="text-sm text-text-secondary">
                  {{ $t('slideToPptx.processingPage', { current: slideToPptx.currentSlide.value, total: images.length }) }}
                </span>
                <span class="text-sm text-text-muted ml-auto font-mono">
                  {{ slideToPptx.formatElapsedTime(slideToPptx.elapsedTime.value) }}
                </span>
              </div>

              <!-- Thumbnails with hidden scrollbar -->
              <div
                ref="thumbnailContainer"
                class="flex gap-3 overflow-x-auto px-2 py-2 thumbnail-scroll-hidden"
                @wheel.prevent="onThumbnailWheel"
              >
                <button
                  v-for="(img, idx) in images"
                  :key="img.id"
                  :ref="el => { if (el) thumbnailRefs[idx] = el }"
                  @click="selectSlide(idx)"
                  class="relative flex-shrink-0 group"
                >
                  <!-- Thumbnail with page number -->
                  <div
                    class="relative w-20 h-12 rounded-lg overflow-hidden transition-all duration-200"
                    :class="idx === currentIndex
                      ? 'ring-2 ring-mode-generate ring-offset-2 ring-offset-bg-elevated scale-105 shadow-lg'
                      : 'opacity-70 hover:opacity-100 hover:scale-102'"
                  >
                    <img :src="getImageUrl(idx)" alt="" class="w-full h-full object-cover" />

                    <!-- Page number badge -->
                    <div class="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[10px] font-bold"
                      :class="idx === currentIndex
                        ? 'bg-mode-generate text-white'
                        : 'bg-black/50 text-white'">
                      {{ idx + 1 }}
                    </div>

                    <!-- Status indicator (larger, more visible) -->
                    <div
                      v-if="getSlideStatus(idx) !== 'pending'"
                      class="absolute bottom-1 right-1 w-4 h-4 rounded-full flex items-center justify-center"
                      :class="{
                        'bg-status-success': getSlideStatus(idx) === 'done',
                        'bg-status-error': getSlideStatus(idx) === 'error',
                        'bg-mode-generate': ['ocr', 'mask', 'inpaint'].includes(getSlideStatus(idx)),
                      }"
                    >
                      <!-- Check icon for done -->
                      <svg v-if="getSlideStatus(idx) === 'done'" class="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                      </svg>
                      <!-- X icon for error -->
                      <svg v-else-if="getSlideStatus(idx) === 'error'" class="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                      </svg>
                      <!-- Spinner for processing -->
                      <svg v-else class="w-2.5 h-2.5 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    </div>
                  </div>

                  <!-- Custom settings indicator (only in per-page mode) -->
                  <div
                    v-if="settingMode === 'per-page' && hasCustomSettings(idx)"
                    class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-status-warning flex items-center justify-center shadow"
                    :title="$t('slideToPptx.hasCustomSettings')"
                  >
                    <svg class="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd" />
                    </svg>
                  </div>
                </button>
              </div>
            </div>
          </div>

          <!-- Progress & Log -->
          <div v-if="isProcessing || logs.length > 0" class="glass p-6">
            <h2 class="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
              <svg class="w-5 h-5 text-mode-generate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              {{ $t('slideToPptx.progress') }}
            </h2>

            <!-- Progress Bar -->
            <div class="mb-4">
              <div class="flex justify-between text-sm text-text-muted mb-2">
                <span>{{ currentStep ? $t(`slideToPptx.steps.${currentStep}`) : $t('slideToPptx.ready') }}</span>
                <div class="flex items-center gap-3">
                  <!-- Elapsed time (during or after processing) -->
                  <span v-if="slideToPptx.elapsedTime.value > 0" class="font-mono text-text-muted">
                    {{ slideToPptx.formatElapsedTime(slideToPptx.elapsedTime.value) }}
                  </span>
                  <span>{{ progress }}%</span>
                </div>
              </div>
              <div class="h-2 bg-bg-muted rounded-full overflow-hidden">
                <div
                  class="h-full bg-mode-generate transition-all duration-300"
                  :style="{ width: `${progress}%` }"
                ></div>
              </div>
            </div>

            <!-- Log -->
            <div ref="logContainer" class="max-h-40 overflow-y-auto space-y-1 font-mono text-xs">
              <div
                v-for="(log, idx) in logs"
                :key="idx"
                class="flex gap-2"
                :class="{
                  'text-text-muted': log.type === 'info',
                  'text-status-success': log.type === 'success',
                  'text-status-error': log.type === 'error',
                }"
              >
                <span class="text-text-muted">{{ log.timestamp }}</span>
                <span>{{ log.message }}</span>
              </div>
            </div>
          </div>

          <!-- OCR Debug Panel -->
          <div v-if="currentOcrRegions.raw.length > 0 || currentOcrRegions.failed.length > 0" class="glass p-6">
            <h2 class="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
              <svg class="w-5 h-5 text-mode-generate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
              {{ $t('slideToPptx.ocrDebug.title') }}
            </h2>

            <!-- Summary -->
            <div class="mb-4 flex flex-wrap gap-4 text-sm">
              <span class="text-green-400">
                ✓ {{ $t('slideToPptx.ocrDebug.recognized') }}: {{ currentOcrRegions.raw.length }}
              </span>
              <span v-if="currentOcrRegions.failed.length > 0" class="text-red-400">
                ✗ {{ $t('slideToPptx.ocrDebug.failed') }}: {{ currentOcrRegions.failed.length }}
              </span>
              <!-- Recognition source breakdown -->
              <span v-if="ocrSourceStats.tesseract > 0" class="text-yellow-400">
                🔄 Tesseract: {{ ocrSourceStats.tesseract }}
              </span>
              <span v-if="ocrSourceStats.paddleocr > 0" class="text-blue-400">
                ⚡ PaddleOCR: {{ ocrSourceStats.paddleocr }}
              </span>
            </div>

            <!-- Regions List -->
            <div class="max-h-60 overflow-y-auto space-y-2">
              <!-- Successful Regions -->
              <div
                v-for="(result, idx) in currentOcrRegions.raw"
                :key="`debug-raw-${idx}`"
                class="p-2 rounded-lg text-xs"
                :class="result.recognitionSource === 'tesseract'
                  ? 'bg-yellow-500/10 border border-yellow-500/30'
                  : 'bg-green-500/10 border border-green-500/30'"
              >
                <div class="flex items-start justify-between gap-2">
                  <span class="font-mono flex-shrink-0" :class="result.recognitionSource === 'tesseract' ? 'text-yellow-400' : 'text-green-400'">#{{ idx + 1 }}</span>
                  <span class="text-text-primary flex-1 break-all">{{ result.text }}</span>
                  <span
                    class="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium"
                    :class="result.recognitionSource === 'tesseract'
                      ? 'bg-yellow-500/20 text-yellow-400'
                      : 'bg-blue-500/20 text-blue-400'"
                  >
                    {{ result.recognitionSource === 'tesseract' ? 'Tesseract' : 'PaddleOCR' }}
                  </span>
                  <span class="text-text-muted flex-shrink-0">{{ Math.round(result.confidence) }}%</span>
                </div>
                <div class="mt-1 text-text-muted text-[10px]">
                  {{ result.bounds.width }}×{{ result.bounds.height }} @ ({{ Math.round(result.bounds.x) }}, {{ Math.round(result.bounds.y) }})
                  <span v-if="result.detectionScore" class="ml-2">det: {{ (result.detectionScore * 100).toFixed(1) }}%</span>
                </div>
              </div>

              <!-- Failed Regions -->
              <div
                v-for="(result, idx) in currentOcrRegions.failed"
                :key="`debug-failed-${idx}`"
                class="p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs"
              >
                <div class="flex items-start justify-between gap-2">
                  <span class="text-red-400 font-mono flex-shrink-0">#{{ currentOcrRegions.raw.length + idx + 1 }}</span>
                  <span class="text-red-300 flex-1 italic">{{ $t('slideToPptx.ocrDebug.noText') }}</span>
                  <span class="text-red-400 flex-shrink-0">{{ result.failureReason }}</span>
                </div>
                <div class="mt-1 text-text-muted text-[10px]">
                  {{ result.bounds.width }}×{{ result.bounds.height }} @ ({{ Math.round(result.bounds.x) }}, {{ Math.round(result.bounds.y) }})
                  <span v-if="result.detectionScore" class="ml-2">det: {{ (result.detectionScore * 100).toFixed(1) }}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Right: Settings -->
        <div class="space-y-4">
          <div class="glass p-6">
            <!-- Settings Header - changes based on mode -->
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-lg font-semibold text-text-primary flex items-center gap-2">
                <svg class="w-5 h-5 text-mode-generate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span v-if="settingMode === 'global'">{{ $t('slideToPptx.settings') }}</span>
                <span v-else>{{ $t('slideToPptx.slideSettings', { index: currentIndex + 1 }) }}</span>
              </h2>
              <!-- Reset to global button (only in per-page mode when has custom settings) -->
              <button
                v-if="settingMode === 'per-page' && currentPageHasCustomSettings"
                @click="resetToGlobalSettings"
                class="text-xs px-2 py-1 rounded-lg text-status-warning hover:bg-status-warning-muted transition-colors"
              >
                {{ $t('slideToPptx.resetToGlobal') }}
              </button>
            </div>

            <!-- OCR Model Size Selection -->
            <div class="mb-6">
              <label class="text-sm text-text-muted mb-2 block">{{ $t('ocrSettings.categories.model') }}</label>
              <div class="flex rounded-xl bg-bg-muted p-1">
                <button
                  v-for="size in [modelSizeOptions.SERVER, modelSizeOptions.MOBILE]"
                  :key="size"
                  @click="updateOcrSetting('modelSize', size)"
                  :disabled="isProcessing"
                  class="flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                  :class="[
                    ocrSettings.modelSize === size
                      ? 'bg-brand-primary text-text-on-brand'
                      : 'text-text-muted hover:text-text-primary',
                    isProcessing && 'opacity-50 cursor-not-allowed'
                  ]"
                >
                  <div class="text-center">
                    <div>{{ $t(`ocrSettings.modelSize.${size}.label`) }}</div>
                    <div class="text-xs opacity-75 mt-0.5">{{ $t(`ocrSettings.modelSize.${size}.description`) }}</div>
                  </div>
                </button>
              </div>
            </div>

            <!-- OCR Engine Selection (Global setting, independent of settingMode) -->
            <div class="mb-6">
              <div class="flex items-center justify-between mb-2">
                <label class="text-sm text-text-muted">{{ $t('slideToPptx.ocrEngine.label') }}</label>
                <div class="flex items-center gap-2">
                  <!-- OCR Settings Button -->
                  <button
                    @click="ocrSettingsModalRef?.open()"
                    class="text-xs px-2 py-1 rounded-lg text-text-muted hover:text-brand-primary hover:bg-brand-primary/10 transition-colors flex items-center gap-1"
                    :title="$t('ocrSettings.title')"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {{ $t('ocrSettings.advancedSettings') }}
                  </button>
                  <!-- Clear Cache Button -->
                  <button
                    @click="clearModelCache"
                    class="text-xs px-2 py-1 rounded-lg text-text-muted hover:text-status-error hover:bg-status-error-muted transition-colors flex items-center gap-1"
                    :title="$t('slideToPptx.ocrEngine.clearCache')"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    {{ $t('slideToPptx.ocrEngine.clearCache') }}
                  </button>
                </div>
              </div>
              <!-- Loading state while detecting -->
              <div v-if="slideToPptx.ocrIsDetecting.value" class="flex items-center gap-2 text-sm text-text-muted py-2">
                <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {{ $t('slideToPptx.ocrEngine.detecting') }}
              </div>
              <!-- Engine toggle buttons -->
              <div v-else class="flex rounded-xl bg-bg-muted p-1">
                <button
                  @click="slideToPptx.setOcrEngine('webgpu')"
                  :disabled="!slideToPptx.ocrCanUseWebGPU.value || isProcessing"
                  class="flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  :class="[
                    (slideToPptx.ocrPreferredEngine.value === 'webgpu' ||
                     (slideToPptx.ocrPreferredEngine.value === 'auto' && slideToPptx.ocrCanUseWebGPU.value))
                      ? 'bg-brand-primary text-text-on-brand'
                      : 'text-text-muted hover:text-text-primary',
                    (!slideToPptx.ocrCanUseWebGPU.value || isProcessing) && 'opacity-50 cursor-not-allowed'
                  ]"
                  :title="!slideToPptx.ocrCanUseWebGPU.value ? $t('slideToPptx.ocrEngine.webgpuNotSupported') : ''"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  WebGPU
                </button>
                <button
                  @click="slideToPptx.setOcrEngine('wasm')"
                  :disabled="isProcessing"
                  class="flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  :class="[
                    (slideToPptx.ocrPreferredEngine.value === 'wasm' ||
                     (slideToPptx.ocrPreferredEngine.value === 'auto' && !slideToPptx.ocrCanUseWebGPU.value))
                      ? 'bg-brand-primary text-text-on-brand'
                      : 'text-text-muted hover:text-text-primary',
                    isProcessing && 'opacity-50 cursor-not-allowed'
                  ]"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Worker
                </button>
              </div>
              <p class="text-xs text-text-muted mt-2">
                <template v-if="slideToPptx.ocrActiveEngine.value">
                  {{ $t('slideToPptx.ocrEngine.currentEngine', {
                    engine: slideToPptx.ocrActiveEngine.value === 'webgpu' ? 'WebGPU (GPU)' : 'Worker (CPU)'
                  }) }}
                </template>
                <template v-else>
                  {{ $t('slideToPptx.ocrEngine.description') }}
                </template>
              </p>
            </div>

            <!-- Setting Mode Toggle -->
            <div class="mb-6">
              <label class="block text-sm text-text-muted mb-2">{{ $t('slideToPptx.settingMode') }}</label>
              <div class="flex rounded-xl bg-bg-muted p-1">
                <button
                  @click="settingMode = 'global'"
                  class="flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                  :class="settingMode === 'global'
                    ? 'bg-brand-primary text-text-on-brand'
                    : 'text-text-muted hover:text-text-primary'"
                >
                  {{ $t('slideToPptx.globalMode') }}
                </button>
                <button
                  @click="settingMode = 'per-page'"
                  class="flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                  :class="settingMode === 'per-page'
                    ? 'bg-brand-primary text-text-on-brand'
                    : 'text-text-muted hover:text-text-primary'"
                >
                  {{ $t('slideToPptx.perPageMode') }}
                </button>
              </div>
              <p class="text-xs text-text-muted mt-2">
                {{ settingMode === 'global'
                  ? $t('slideToPptx.globalModeDesc')
                  : $t('slideToPptx.perPageModeDesc') }}
              </p>
            </div>

            <!-- Per-page mode: current page indicator -->
            <div v-if="settingMode === 'per-page'" class="mb-6 p-3 rounded-lg border border-mode-generate/30"
              :class="currentPageHasCustomSettings ? 'bg-status-warning-muted/30' : 'bg-mode-generate-muted/30'">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium text-text-primary">
                  {{ $t('slideToPptx.editingPage', { index: currentIndex + 1, total: images.length }) }}
                </span>
                <span v-if="currentPageHasCustomSettings" class="px-2 py-0.5 text-xs rounded-full bg-status-warning-muted text-status-warning font-medium">
                  {{ $t('slideToPptx.customized') }}
                </span>
                <span v-else class="px-2 py-0.5 text-xs rounded-full bg-bg-muted text-text-muted">
                  {{ $t('slideToPptx.usingGlobal') }}
                </span>
              </div>
            </div>

            <!-- Inpaint Method -->
            <div class="space-y-3 mb-6">
              <div class="flex items-center justify-between">
                <label class="block text-sm text-text-muted">{{ $t('slideToPptx.inpaintMethod') }}</label>
                <button
                  @click="apiKeyModalRef?.open()"
                  class="flex items-center gap-1.5 px-2 py-1 text-xs text-text-muted hover:text-mode-generate transition-colors rounded-lg hover:bg-mode-generate-muted/30"
                >
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  {{ $t('slideToPptx.manageApiKeys') }}
                </button>
              </div>

              <label class="flex items-start gap-3 cursor-pointer group p-3 rounded-lg border border-border-muted hover:border-mode-generate transition-colors"
                :class="{ 'border-mode-generate bg-mode-generate-muted/30': getSettingValue('inpaintMethod') === 'opencv' }">
                <input
                  type="radio"
                  name="inpaintMethod"
                  value="opencv"
                  :checked="getSettingValue('inpaintMethod') === 'opencv'"
                  @change="updateSetting('inpaintMethod', 'opencv')"
                  class="mt-0.5 w-4 h-4 accent-mode-generate border-border-muted focus:ring-mode-generate"
                />
                <div>
                  <span class="text-text-primary font-medium">OpenCV.js</span>
                  <span class="ml-2 px-2 py-0.5 text-xs rounded-full bg-status-success-muted text-status-success">{{ $t('slideToPptx.free') }}</span>
                  <p class="text-xs text-text-muted mt-1">{{ $t('slideToPptx.opencvDesc') }}</p>
                </div>
              </label>

              <!-- Gemini API option with tooltip for disabled state -->
              <div class="relative gemini-option-wrapper">
                <label class="flex items-start gap-3 p-3 rounded-lg border border-border-muted transition-colors"
                  :class="[
                    canUseGemini ? 'cursor-pointer group hover:border-mode-generate' : 'opacity-50 cursor-not-allowed',
                    { 'border-mode-generate bg-mode-generate-muted/30': getSettingValue('inpaintMethod') === 'gemini' }
                  ]">
                  <input
                    type="radio"
                    name="inpaintMethod"
                    value="gemini"
                    :checked="getSettingValue('inpaintMethod') === 'gemini'"
                    :disabled="!canUseGemini"
                    @change="updateSetting('inpaintMethod', 'gemini')"
                    class="mt-0.5 w-4 h-4 accent-mode-generate border-border-muted focus:ring-mode-generate"
                  />
                  <div>
                    <span class="text-text-primary font-medium">Gemini API</span>
                    <span class="ml-2 px-2 py-0.5 text-xs rounded-full bg-status-warning-muted text-status-warning">{{ $t('slideToPptx.paid') }}</span>
                    <p class="text-xs text-text-muted mt-1">
                      {{ canUseGemini ? $t('slideToPptx.geminiDesc') : $t('slideToPptx.geminiNoApiKey') }}
                    </p>
                  </div>
                </label>
                <!-- Tooltip for disabled Gemini option -->
                <div
                  v-if="!canUseGemini"
                  class="gemini-tooltip absolute left-0 right-0 bottom-full mb-2 p-3 rounded-xl glass-strong shadow-lg z-10 opacity-0 invisible transition-all duration-200"
                >
                  <p class="text-sm text-text-primary mb-2">{{ $t('slideToPptx.geminiTooltip.noKey') }}</p>
                  <button
                    @click="apiKeyModalRef?.open()"
                    class="w-full py-2 px-3 text-sm font-medium rounded-lg bg-mode-generate text-text-on-brand hover:opacity-90 transition-opacity"
                  >
                    {{ $t('slideToPptx.geminiTooltip.setupKey') }}
                  </button>
                </div>
              </div>
            </div>

            <!-- OpenCV Algorithm (only when opencv selected) -->
            <div v-if="getSettingValue('inpaintMethod') === 'opencv'" class="space-y-3 mb-6">
              <label class="block text-sm text-text-muted">{{ $t('slideToPptx.algorithm') }}</label>

              <div class="grid grid-cols-2 gap-2">
                <label class="flex items-center gap-2 cursor-pointer p-2 rounded-lg border border-border-muted hover:border-mode-generate transition-colors"
                  :class="{ 'border-mode-generate bg-mode-generate-muted/30': getSettingValue('opencvAlgorithm') === 'NS' }">
                  <input
                    type="radio"
                    name="opencvAlgorithm"
                    value="NS"
                    :checked="getSettingValue('opencvAlgorithm') === 'NS'"
                    @change="updateSetting('opencvAlgorithm', 'NS')"
                    class="w-4 h-4 accent-mode-generate border-border-muted focus:ring-mode-generate"
                  />
                  <span class="text-sm text-text-primary">NS</span>
                </label>

                <label class="flex items-center gap-2 cursor-pointer p-2 rounded-lg border border-border-muted hover:border-mode-generate transition-colors"
                  :class="{ 'border-mode-generate bg-mode-generate-muted/30': getSettingValue('opencvAlgorithm') === 'TELEA' }">
                  <input
                    type="radio"
                    name="opencvAlgorithm"
                    value="TELEA"
                    :checked="getSettingValue('opencvAlgorithm') === 'TELEA'"
                    @change="updateSetting('opencvAlgorithm', 'TELEA')"
                    class="w-4 h-4 accent-mode-generate border-border-muted focus:ring-mode-generate"
                  />
                  <span class="text-sm text-text-primary">TELEA</span>
                </label>
              </div>
              <p class="text-xs text-text-muted">
                {{ getSettingValue('opencvAlgorithm') === 'NS' ? $t('slideToPptx.nsHint') : $t('slideToPptx.teleaHint') }}
              </p>
            </div>

            <!-- Gemini Model (only when gemini selected) -->
            <div v-if="getSettingValue('inpaintMethod') === 'gemini'" class="space-y-3 mb-6">
              <label class="block text-sm text-text-muted">{{ $t('slideToPptx.geminiModel') }}</label>

              <label class="flex items-start gap-3 cursor-pointer group p-3 rounded-lg border border-border-muted hover:border-mode-generate transition-colors"
                :class="{ 'border-mode-generate bg-mode-generate-muted/30': getSettingValue('geminiModel') === '2.0' }">
                <input
                  type="radio"
                  name="geminiModel"
                  value="2.0"
                  :checked="getSettingValue('geminiModel') === '2.0'"
                  @change="updateSetting('geminiModel', '2.0')"
                  class="mt-0.5 w-4 h-4 accent-mode-generate border-border-muted focus:ring-mode-generate"
                />
                <div>
                  <span class="text-text-primary font-medium">Nano Banana (2.0)</span>
                  <span class="ml-2 px-2 py-0.5 text-xs rounded-full bg-status-success-muted text-status-success">{{ $t('slideToPptx.freeTierAvailable') }}</span>
                  <p class="text-xs text-text-muted mt-1">{{ $t('slideToPptx.gemini20Desc') }}</p>
                </div>
              </label>

              <!-- Gemini 3.0 option with tooltip for disabled state -->
              <div class="relative gemini-option-wrapper">
                <label class="flex items-start gap-3 p-3 rounded-lg border border-border-muted transition-colors"
                  :class="[
                    canUseGemini30 ? 'cursor-pointer group hover:border-mode-generate' : 'opacity-50 cursor-not-allowed',
                    { 'border-mode-generate bg-mode-generate-muted/30': getSettingValue('geminiModel') === '3.0' }
                  ]">
                  <input
                    type="radio"
                    name="geminiModel"
                    value="3.0"
                    :checked="getSettingValue('geminiModel') === '3.0'"
                    :disabled="!canUseGemini30"
                    @change="updateSetting('geminiModel', '3.0')"
                    class="mt-0.5 w-4 h-4 accent-mode-generate border-border-muted focus:ring-mode-generate"
                  />
                  <div>
                    <span class="text-text-primary font-medium">Nano Banana Pro (3.0)</span>
                    <span class="ml-2 px-2 py-0.5 text-xs rounded-full bg-status-warning-muted text-status-warning">{{ $t('slideToPptx.paid') }}</span>
                    <p class="text-xs text-text-muted mt-1">
                      {{ canUseGemini30 ? $t('slideToPptx.gemini30Desc') : $t('slideToPptx.gemini30NoPaidKey') }}
                    </p>
                  </div>
                </label>
                <!-- Tooltip for disabled Gemini 3.0 option -->
                <div
                  v-if="!canUseGemini30"
                  class="gemini-tooltip absolute left-0 right-0 bottom-full mb-2 p-3 rounded-xl glass-strong shadow-lg z-10 opacity-0 invisible transition-all duration-200"
                >
                  <p class="text-sm text-text-primary mb-2">{{ $t('slideToPptx.geminiTooltip.noPaidKey') }}</p>
                  <button
                    @click="apiKeyModalRef?.open()"
                    class="w-full py-2 px-3 text-sm font-medium rounded-lg bg-mode-generate text-text-on-brand hover:opacity-90 transition-opacity"
                  >
                    {{ $t('slideToPptx.geminiTooltip.setupKey') }}
                  </button>
                </div>
              </div>

              <!-- Image Quality (only for 3.0 model) -->
              <div v-if="getSettingValue('geminiModel') === '3.0'" class="mt-4">
                <label class="block text-sm text-text-muted mb-2">{{ $t('slideToPptx.imageQuality') }}</label>
                <div class="flex gap-2">
                  <button
                    v-for="quality in ['1k', '2k', '4k']"
                    :key="quality"
                    @click="updateSetting('imageQuality', quality)"
                    class="flex-1 py-2 text-sm rounded-lg border transition-colors"
                    :class="getSettingValue('imageQuality') === quality
                      ? 'border-mode-generate bg-mode-generate-muted/30 text-text-primary'
                      : 'border-border-muted text-text-muted hover:border-mode-generate'"
                  >
                    {{ quality.toUpperCase() }}
                  </button>
                </div>
                <p class="text-xs text-text-muted mt-2">{{ $t('slideToPptx.imageQualityDesc') }}</p>
              </div>
            </div>

            <!-- Advanced Settings (only in global mode, for simplicity) -->
            <details v-if="settingMode === 'global' && settings.inpaintMethod === 'opencv'" class="mb-6">
              <summary class="text-sm text-text-muted cursor-pointer hover:text-text-primary">
                {{ $t('slideToPptx.advancedSettings') }}
              </summary>
              <div class="mt-3 space-y-4 pl-2">
                <!-- Inpaint Radius -->
                <div>
                  <label class="flex justify-between text-xs text-text-muted mb-1">
                    <span>{{ $t('slideToPptx.inpaintRadius') }}</span>
                    <span>{{ settings.inpaintRadius }}px</span>
                  </label>
                  <input
                    type="range"
                    v-model.number="settings.inpaintRadius"
                    min="1"
                    max="10"
                    class="w-full accent-mode-generate"
                  />
                </div>

                <!-- Mask Padding -->
                <div>
                  <label class="flex justify-between text-xs text-text-muted mb-1">
                    <span>{{ $t('slideToPptx.maskPadding') }}</span>
                    <span>{{ settings.maskPadding }}px</span>
                  </label>
                  <input
                    type="range"
                    v-model.number="settings.maskPadding"
                    min="0"
                    max="20"
                    class="w-full accent-mode-generate"
                  />
                </div>
              </div>
            </details>

            <!-- Slide Ratio -->
            <div class="mb-6">
              <label class="block text-sm text-text-muted mb-2">{{ $t('slideToPptx.slideRatio') }}</label>
              <select
                v-model="settings.slideRatio"
                class="w-full px-4 py-3 rounded-xl bg-bg-muted border border-border-muted text-text-primary focus:outline-none focus:border-mode-generate transition-colors"
              >
                <option value="auto" class="bg-bg-elevated">
                  {{ $t('slideToPptx.autoDetect') }} {{ detectedRatio ? `(${detectedRatio})` : '' }}
                </option>
                <option value="16:9" class="bg-bg-elevated">16:9</option>
                <option value="4:3" class="bg-bg-elevated">4:3</option>
                <option value="9:16" class="bg-bg-elevated">9:16</option>
              </select>
              <!-- Ratio mismatch warning -->
              <div
                v-if="ratioMismatch"
                class="mt-2 p-3 rounded-lg bg-status-warning-muted border border-status-warning text-sm text-status-warning"
              >
                <div class="flex items-start gap-2">
                  <svg class="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>{{ $t('slideToPptx.ratioMismatchWarning', ratioMismatch) }}</span>
                </div>
              </div>
            </div>

            <!-- Start/Cancel Button -->
            <div class="space-y-2">
              <button
                v-if="!isProcessing"
                @click="startProcessing"
                :disabled="images.length === 0"
                class="w-full py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
                :class="images.length > 0
                  ? 'bg-brand-primary hover:bg-brand-primary-hover text-text-on-brand'
                  : 'bg-bg-interactive text-text-muted cursor-not-allowed'"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {{ $t('slideToPptx.actions.start') }}
              </button>

              <button
                v-else
                @click="cancelProcessing"
                class="w-full py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 bg-status-error hover:bg-status-error/80 text-white"
              >
                <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {{ $t('slideToPptx.actions.cancel') }}
              </button>

              <!-- Download PPTX Split Button (shows after processing complete) -->
              <div
                v-if="!isProcessing && successfulSlides.length > 0"
                class="relative download-dropdown-container w-full"
              >
                <div class="flex w-full">
                  <!-- Main Download Button -->
                  <button
                    @click="downloadPptx"
                    class="flex-1 py-3 rounded-l-xl font-semibold transition-all flex items-center justify-center gap-2 bg-status-success hover:bg-status-success/80 text-white"
                  >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    {{ $t('slideToPptx.downloadPptx') }} ({{ successfulSlides.length }} {{ $t('slideToPptx.pagesUnit') }})
                  </button>
                  <!-- Dropdown Toggle Button -->
                  <button
                    @click="toggleDownloadDropdown"
                    class="px-3 py-3 rounded-r-xl border-l border-white/20 font-semibold transition-all bg-status-success hover:bg-status-success/80 text-white"
                  >
                    <svg
                      class="w-4 h-4 transition-transform"
                      :class="{ 'rotate-180': showDownloadDropdown }"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>

                <!-- Dropdown Menu -->
                <Transition
                  enter-active-class="transition ease-out duration-100"
                  enter-from-class="transform opacity-0 scale-95"
                  enter-to-class="transform opacity-100 scale-100"
                  leave-active-class="transition ease-in duration-75"
                  leave-from-class="transform opacity-100 scale-100"
                  leave-to-class="transform opacity-0 scale-95"
                >
                  <div
                    v-if="showDownloadDropdown"
                    class="absolute bottom-full left-0 right-0 mb-1 rounded-xl overflow-hidden shadow-lg glass-strong border border-border-muted z-20"
                  >
                    <!-- Download Option -->
                    <button
                      @click="downloadPptx"
                      class="w-full px-4 py-3 text-left text-sm font-medium text-text-primary hover:bg-bg-interactive transition-colors flex items-center gap-3"
                    >
                      <svg class="w-4 h-4 text-status-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      {{ $t('slideToPptx.downloadPptx') }}
                    </button>
                    <!-- Settings Option -->
                    <button
                      @click="openConversionSettings"
                      class="w-full px-4 py-3 text-left text-sm font-medium text-text-primary hover:bg-bg-interactive transition-colors flex items-center gap-3 border-t border-border-muted"
                    >
                      <svg class="w-4 h-4 text-mode-generate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      {{ $t('slideToPptx.conversionSettings') }}
                    </button>
                  </div>
                </Transition>
              </div>
            </div>
          </div>

          <!-- Tip: Clean backgrounds -->
          <div class="glass p-4 border-l-4 border-status-success">
            <div class="flex items-start gap-3">
              <svg class="w-5 h-5 text-status-success flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <p class="text-xs text-text-secondary">
                {{ $t('slideToPptx.cleanBackgroundTip') }}
              </p>
            </div>
          </div>

          <!-- Info -->
          <div class="glass p-4">
            <div class="flex items-start gap-3">
              <svg class="w-5 h-5 text-mode-generate flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p class="text-xs text-text-muted">
                {{ $t('slideToPptx.infoText') }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- Lightbox for image preview -->
    <ImageLightbox
      v-model="lightboxOpen"
      :images="lightboxImages"
      :initial-index="lightboxIndex"
      :show-ocr-overlay="showOcrOverlay && !isRegionEditMode"
      :show-merged-regions="showMergedRegions"
      :show-raw-regions="showRawRegions"
      :show-failed-regions="showFailedRegions"
      :ocr-regions="currentOcrRegions"
      :is-edit-mode="isRegionEditMode"
      :hide-file-size="true"
      :show-edit-regions-button="currentOcrRegions.raw.length > 0 || currentOcrRegions.failed.length > 0"
      @edit-regions="enterEditMode"
      @select-region="handleSelectRegion"
    >
      <!-- OCR Region Editor Overlay -->
      <template #edit-overlay="{ imageDimensions }">
        <OcrRegionEditor
          ref="ocrRegionEditorRef"
          v-if="isRegionEditMode && imageDimensions.width > 0"
          :regions="currentEditableRegions"
          :separator-lines="currentSeparatorLines"
          :image-dimensions="imageDimensions"
          :is-edited="currentSlideIsEdited"
          :is-reprocessing="isReprocessing"
          :image-url="currentImageUrl"
          :can-undo="currentCanUndo"
          :can-redo="currentCanRedo"
          @delete-region="handleDeleteRegion"
          @delete-regions-batch="handleDeleteRegionsBatch"
          @add-region="handleAddRegion"
          @resize-region="handleResizeRegion"
          @toggle-polygon-mode="handleTogglePolygonMode"
          @move-vertex="handleMoveVertex"
          @reset="handleResetRegions"
          @done="exitEditMode"
          @add-separator="handleAddSeparator"
          @delete-separator="handleDeleteSeparator"
          @undo="handleUndo"
          @redo="handleRedo"
        />
      </template>
    </ImageLightbox>

    <!-- Confirm Modal -->
    <ConfirmModal ref="confirmModalRef" />

    <!-- OCR Settings Modal -->
    <OcrSettingsModal ref="ocrSettingsModalRef" @close="handleSettingsModalClose" />

    <!-- API Key Modal -->
    <ApiKeyModal ref="apiKeyModalRef" @close="refreshApiKeyStatus" />

    <!-- Inpaint Confirm Modal -->
    <InpaintConfirmModal ref="inpaintConfirmModalRef" />
  </div>
</template>

<style scoped>
/* Hide scrollbar while maintaining scroll functionality */
.thumbnail-scroll-hidden {
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE 10+ */
  -webkit-overflow-scrolling: touch; /* Smooth scrolling on iOS */
  scroll-snap-type: x proximity; /* Snap to thumbnails */
}

.thumbnail-scroll-hidden::-webkit-scrollbar {
  display: none; /* Chrome, Safari, Edge */
}

/* Each thumbnail snaps to start */
.thumbnail-scroll-hidden > * {
  scroll-snap-align: center;
}

/* Gemini option tooltip - show on hover/focus/touch */
.gemini-option-wrapper:hover .gemini-tooltip,
.gemini-option-wrapper:focus-within .gemini-tooltip {
  opacity: 1;
  visibility: visible;
}

/* Touch device support - show tooltip on tap */
@media (hover: none) {
  .gemini-option-wrapper:active .gemini-tooltip {
    opacity: 1;
    visibility: visible;
  }
}

/* Tooltip arrow */
.gemini-tooltip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 8px solid transparent;
  border-top-color: var(--color-bg-elevated);
}
</style>
