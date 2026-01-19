/**
 * OCR Settings Management Composable
 *
 * Singleton pattern for managing OCR parameters across the application.
 * Settings are persisted to localStorage and synchronized to both
 * WebGPU (main thread) and WASM (worker) OCR engines.
 */

import { reactive, readonly } from 'vue'
import {
  OCR_DEFAULTS,
  OCR_PARAM_RULES,
  OCR_PARAM_ORDER,
  OCR_CATEGORIES,
  OCR_MODEL_SIZE,
  validateOcrParam,
  validateOcrSettings,
  validateModelSize,
} from '@/constants/ocrDefaults'

// localStorage key for OCR settings
const STORAGE_KEY = 'nbp-ocr-settings'

// Singleton state
let settingsState = null
let listeners = []

/**
 * Load settings from localStorage
 * @returns {Object} Settings object with defaults for missing values
 */
function loadFromStorage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return validateOcrSettings(parsed)
    }
  } catch (e) {
    console.warn('[useOcrSettings] Failed to load settings from localStorage:', e)
  }
  return { ...OCR_DEFAULTS }
}

/**
 * Save settings to localStorage
 * @param {Object} settings - Settings to save
 */
function saveToStorage(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch (e) {
    console.warn('[useOcrSettings] Failed to save settings to localStorage:', e)
  }
}

/**
 * Initialize singleton state
 */
function initState() {
  if (settingsState) return settingsState

  const initialSettings = loadFromStorage()
  settingsState = reactive({
    ...initialSettings,
    // Track if settings have been modified from defaults
    isModified: JSON.stringify(initialSettings) !== JSON.stringify(OCR_DEFAULTS),
  })

  return settingsState
}

/**
 * Notify all registered listeners of settings change
 */
function notifyListeners() {
  const settings = getSettings()
  listeners.forEach((callback) => {
    try {
      callback(settings)
    } catch (e) {
      console.error('[useOcrSettings] Listener error:', e)
    }
  })
}

/**
 * Get current OCR settings (reactive)
 * @returns {Object} Reactive settings object
 */
export function getOcrSettings() {
  return initState()
}

/**
 * Get current settings as plain object (non-reactive)
 * @returns {Object} Plain settings object
 */
export function getSettings() {
  const state = initState()
  const settings = {}
  for (const key of Object.keys(OCR_DEFAULTS)) {
    settings[key] = state[key]
  }
  return settings
}

/**
 * Update a single setting
 * @param {string} key - Parameter name
 * @param {number|string} value - New value
 */
export function updateSetting(key, value) {
  const state = initState()

  if (!(key in OCR_DEFAULTS)) {
    console.warn(`[useOcrSettings] Unknown setting: ${key}`)
    return
  }

  // modelSize is string enum, not numeric
  const validated = key === 'modelSize' ? validateModelSize(value) : validateOcrParam(key, value)
  state[key] = validated
  state.isModified = JSON.stringify(getSettings()) !== JSON.stringify(OCR_DEFAULTS)

  saveToStorage(getSettings())
  notifyListeners()
}

/**
 * Update multiple settings at once
 * @param {Object} updates - Object with key-value pairs to update
 */
export function updateSettings(updates) {
  const state = initState()

  for (const [key, value] of Object.entries(updates)) {
    if (key in OCR_DEFAULTS) {
      // modelSize is string enum, not numeric
      state[key] = key === 'modelSize' ? validateModelSize(value) : validateOcrParam(key, value)
    }
  }

  state.isModified = JSON.stringify(getSettings()) !== JSON.stringify(OCR_DEFAULTS)
  saveToStorage(getSettings())
  notifyListeners()
}

/**
 * Reset all settings to defaults
 */
export function resetToDefaults() {
  const state = initState()

  for (const [key, value] of Object.entries(OCR_DEFAULTS)) {
    state[key] = value
  }
  state.isModified = false

  saveToStorage(getSettings())
  notifyListeners()
}

/**
 * Register a listener for settings changes
 * @param {Function} callback - Function to call when settings change
 * @returns {Function} Unsubscribe function
 */
export function onSettingsChange(callback) {
  listeners.push(callback)
  return () => {
    listeners = listeners.filter((cb) => cb !== callback)
  }
}

/**
 * Main composable function
 * Provides reactive settings and update methods
 */
export function useOcrSettings() {
  const settings = initState()

  return {
    // Reactive settings state
    settings: readonly(settings),

    // Individual getters (for v-model binding)
    getSettings,

    // Update methods
    updateSetting,
    updateSettings,
    resetToDefaults,

    // Subscription
    onSettingsChange,

    // Constants for UI
    defaults: OCR_DEFAULTS,
    rules: OCR_PARAM_RULES,
    paramOrder: OCR_PARAM_ORDER,
    categories: OCR_CATEGORIES,
    modelSizeOptions: OCR_MODEL_SIZE,
  }
}
