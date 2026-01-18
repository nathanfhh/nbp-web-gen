/**
 * OCR Unified Interface
 *
 * Automatically selects between:
 * - WebGPU Main Thread (useOcrMainThread.js) - When WebGPU available, 3-5x faster
 * - WASM Worker (useOcrWorker.js) - Fallback for non-GPU or mobile devices
 *
 * @see docs/ocr-optimization-plan.md for architecture details
 */

import { ref, computed, onUnmounted, shallowRef, getCurrentInstance } from 'vue'
import { useOcrWorker } from './useOcrWorker'
import {
  useOcrMainThread,
  isMobile,
  clearModelCache,
  GpuOutOfMemoryError,
} from './useOcrMainThread'
import { getSettings, onSettingsChange } from './useOcrSettings'

/**
 * OCR Engine Types
 */
export const OCR_ENGINE = {
  AUTO: 'auto',
  WEBGPU: 'webgpu',
  WASM: 'wasm',
}

/**
 * Unified OCR Composable
 *
 * Provides a single interface that automatically selects the best OCR implementation
 * based on device capabilities, with manual override option.
 *
 * @returns {Object} OCR composable with unified API
 */
export function useOcr() {
  // ============================================================================
  // Engine Selection State
  // ============================================================================

  // User preference: 'auto' | 'webgpu' | 'wasm'
  const preferredEngine = ref(OCR_ENGINE.AUTO)

  // Detected capabilities
  const canUseWebGPU = ref(false)
  const isMobileDevice = ref(false)
  const isDetecting = ref(true)

  // Active engine info
  const activeEngine = ref(null)

  // GPU fallback tracking
  // Set to true when GPU memory error occurred and we fell back to WASM
  const gpuFallbackOccurred = ref(false)

  // ============================================================================
  // OCR Instance Management
  // ============================================================================

  // Use shallowRef to hold the OCR instance (avoid deep reactivity)
  const ocrInstance = shallowRef(null)
  let instanceType = null // 'webgpu' | 'wasm'

  // Forward state from active instance
  const isLoading = ref(false)
  const isReady = ref(false)
  const progress = ref(0)
  const status = ref('')
  const error = ref(null)
  const executionProvider = ref(null)

  // ============================================================================
  // Capability Detection
  // ============================================================================

  async function detectCapabilities() {
    isDetecting.value = true
    try {
      isMobileDevice.value = isMobile()
      
      if (!navigator.gpu) {
        console.log('[useOcr] WebGPU not supported by browser (navigator.gpu missing)')
        canUseWebGPU.value = false
      } else {
        const adapter = await navigator.gpu.requestAdapter()
        if (adapter) {
          console.log('[useOcr] WebGPU detected:', adapter.info)
          canUseWebGPU.value = true
        } else {
          console.warn('[useOcr] WebGPU supported but no adapter found')
          canUseWebGPU.value = false
        }
      }
    } catch (e) {
      console.warn('[useOcr] Error detecting capabilities:', e)
      canUseWebGPU.value = false
    } finally {
      isDetecting.value = false
    }
  }

  // ============================================================================
  // Engine Selection Logic
  // ============================================================================

  /**
   * Determine which engine to use based on preference and capabilities
   */
  const shouldUseWebGPU = computed(() => {
    // Explicit preference
    if (preferredEngine.value === OCR_ENGINE.WEBGPU) {
      return canUseWebGPU.value // Only use if available
    }
    if (preferredEngine.value === OCR_ENGINE.WASM) {
      return false
    }

    // Auto mode: use WebGPU if available
    return canUseWebGPU.value
  })

  /**
   * Create or switch OCR instance based on current engine selection
   */
  function ensureInstance() {
    const targetType = shouldUseWebGPU.value ? 'webgpu' : 'wasm'

    // Already have correct instance
    if (ocrInstance.value && instanceType === targetType) {
      return ocrInstance.value
    }

    // Terminate previous instance if exists
    if (ocrInstance.value) {
      ocrInstance.value.terminate()
      ocrInstance.value = null
    }

    // Create new instance
    if (targetType === 'webgpu') {
      ocrInstance.value = useOcrMainThread()
      activeEngine.value = 'webgpu'
    } else {
      ocrInstance.value = useOcrWorker()
      activeEngine.value = 'wasm'
      // Note: syncOcrSettings() is called in initialize() after worker is created
    }
    instanceType = targetType

    // Sync state from new instance
    syncState()

    return ocrInstance.value
  }

  /**
   * Sync OCR settings to the active engine
   * WebGPU reads settings directly; WASM Worker needs postMessage
   */
  function syncOcrSettings() {
    if (instanceType === 'wasm' && ocrInstance.value?.syncSettings) {
      const settings = getSettings()
      ocrInstance.value.syncSettings(settings)
    }
    // WebGPU main thread reads settings directly via getSettings() in preprocessing
  }

  /**
   * Sync state refs from active instance
   */
  function syncState() {
    const instance = ocrInstance.value
    if (!instance) return

    // Create watchers to sync state
    // Note: We can't use watch() inside a function, so we manually sync
    isLoading.value = instance.isLoading.value
    isReady.value = instance.isReady.value
    progress.value = instance.progress.value
    status.value = instance.status.value
    error.value = instance.error.value
    executionProvider.value = instance.executionProvider?.value || null
  }

  // ============================================================================
  // Public API (delegates to active instance)
  // ============================================================================

  /**
   * Initialize OCR engine
   * @param {function} onProgress - Optional progress callback
   */
  async function initialize(onProgress) {
    // Ensure capabilities are detected before selecting engine
    await ensureCapabilitiesDetected()

    const instance = ensureInstance()

    // Wrap progress callback to sync state
    const wrappedOnProgress = (value, message) => {
      progress.value = value
      status.value = message
      if (onProgress) onProgress(value, message)
    }

    try {
      isLoading.value = true
      await instance.initialize(wrappedOnProgress)
      // Sync settings AFTER worker is created (for WASM mode)
      // This ensures the worker has the latest settings from localStorage
      syncOcrSettings()
      syncState()
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Recognize text in image
   * @param {string|Blob|File|HTMLImageElement} image
   * @param {function} onProgress - Optional progress callback
   * @returns {Promise<{regions: Array, rawRegions: Array}>}
   */
  async function recognize(image, onProgress) {
    // Ensure capabilities are detected before selecting engine
    await ensureCapabilitiesDetected()

    const instance = ensureInstance()

    // Ensure initialized
    if (!instance.isReady.value) {
      await initialize()
    }

    const wrappedOnProgress = (value, message, stage) => {
      progress.value = value
      status.value = message
      if (onProgress) onProgress(value, message, stage)
    }

    try {
      isLoading.value = true
      const result = await instance.recognize(image, wrappedOnProgress)
      syncState()
      return result
    } catch (err) {
      // Check if this is a GPU memory error - trigger automatic fallback
      if (err instanceof GpuOutOfMemoryError && activeEngine.value === 'webgpu') {
        console.warn('[useOcr] GPU memory error detected, falling back to WASM...')

        // Mark that fallback occurred (UI can use this to show notification)
        gpuFallbackOccurred.value = true

        // Terminate current WebGPU instance
        if (ocrInstance.value) {
          await ocrInstance.value.terminate()
          ocrInstance.value = null
          instanceType = null
        }

        // Force WASM mode
        preferredEngine.value = OCR_ENGINE.WASM
        activeEngine.value = 'wasm'

        // Create new WASM instance and initialize
        const wasmInstance = ensureInstance()
        await wasmInstance.initialize((value, message) => {
          wrappedOnProgress(value, message, 'init')
        })
        // Sync settings after worker is created
        syncOcrSettings()
        syncState()

        // Retry recognition with WASM
        console.log('[useOcr] Retrying recognition with WASM backend...')
        const result = await wasmInstance.recognize(image, wrappedOnProgress)
        syncState()
        return result
      }

      // Re-throw other errors
      throw err
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Recognize multiple images
   * @param {Array} images
   * @param {function} onProgress - Progress callback (currentIndex, total)
   * @returns {Promise<Array>}
   */
  async function recognizeMultiple(images, onProgress) {
    // Ensure capabilities are detected before selecting engine
    await ensureCapabilitiesDetected()

    const instance = ensureInstance()

    // Ensure initialized
    if (!instance.isReady.value) {
      await initialize()
    }

    try {
      isLoading.value = true
      const results = await instance.recognizeMultiple(images, onProgress)
      syncState()
      return results
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Generate mask from OCR results
   * @param {number} width
   * @param {number} height
   * @param {Array} ocrResults
   * @param {number} padding
   * @returns {ImageData}
   */
  function generateMask(width, height, ocrResults, padding = 1) {
    const instance = ensureInstance()
    return instance.generateMask(width, height, ocrResults, padding)
  }

  /**
   * Terminate OCR engine and release resources
   */
  function terminate() {
    if (ocrInstance.value) {
      ocrInstance.value.terminate()
      ocrInstance.value = null
      instanceType = null
    }

    isReady.value = false
    isLoading.value = false
    progress.value = 0
    status.value = ''
    error.value = null
    executionProvider.value = null
    activeEngine.value = null
  }

  /**
   * Switch to specific engine
   * @param {'auto'|'webgpu'|'wasm'} engine
   */
  function setEngine(engine) {
    if (!Object.values(OCR_ENGINE).includes(engine)) {
      console.warn(`[useOcr] Invalid engine: ${engine}`)
      return
    }

    const wasReady = isReady.value
    preferredEngine.value = engine

    // If was ready, re-initialize with new engine
    if (wasReady) {
      terminate()
      // Don't auto-reinitialize - let user call initialize() when needed
    }
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  // Track if capabilities have been detected
  let capabilitiesDetected = false

  /**
   * Ensure capabilities are detected (call before ensureInstance)
   */
  async function ensureCapabilitiesDetected() {
    if (capabilitiesDetected) return
    await detectCapabilities()
    capabilitiesDetected = true
  }

  // Register settings change listener to sync settings when they change
  const unsubscribeSettings = onSettingsChange(() => {
    syncOcrSettings()
  })

  // Safe lifecycle registration - only if in component context
  const instance = getCurrentInstance()
  if (instance) {
    onUnmounted(() => {
      unsubscribeSettings()
      terminate()
    })
  }

  // Eagerly detect capabilities so UI can show correct state immediately
  // This is non-blocking - UI will update reactively when detection completes
  detectCapabilities()

  // ============================================================================
  // Export
  // ============================================================================

  return {
    // State (reactive)
    isLoading,
    isReady,
    progress,
    status,
    error,

    // Engine info (reactive)
    preferredEngine,
    activeEngine,
    executionProvider,
    canUseWebGPU,
    isMobileDevice,
    isDetecting,
    gpuFallbackOccurred,

    // Methods
    initialize,
    recognize,
    recognizeMultiple,
    generateMask,
    terminate,
    setEngine,
    detectCapabilities,
    clearModelCache,
    syncOcrSettings,

    // Constants
    OCR_ENGINE,
  }
}

// Re-export engine constants
export { OCR_ENGINE as default }
