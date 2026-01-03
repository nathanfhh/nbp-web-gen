import { ref, watch } from 'vue'

const API_KEY_STORAGE_KEY = 'nanobanana-api-key'
const SETTINGS_STORAGE_KEY = 'nanobanana-settings'

export function useLocalStorage() {
  // API Key management (stored in localStorage for quick access)
  const getApiKey = () => {
    try {
      return localStorage.getItem(API_KEY_STORAGE_KEY) || ''
    } catch {
      return ''
    }
  }

  const setApiKey = (key) => {
    try {
      if (key) {
        localStorage.setItem(API_KEY_STORAGE_KEY, key)
      } else {
        localStorage.removeItem(API_KEY_STORAGE_KEY)
      }
      return true
    } catch {
      return false
    }
  }

  const hasApiKey = () => {
    return !!getApiKey()
  }

  // Quick settings (for UI state that doesn't need IndexedDB)
  const getQuickSettings = () => {
    try {
      const data = localStorage.getItem(SETTINGS_STORAGE_KEY)
      return data ? JSON.parse(data) : {}
    } catch {
      return {}
    }
  }

  const setQuickSettings = (settings) => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
      return true
    } catch {
      return false
    }
  }

  const updateQuickSetting = (key, value) => {
    const settings = getQuickSettings()
    settings[key] = value
    return setQuickSettings(settings)
  }

  const getQuickSetting = (key, defaultValue = null) => {
    const settings = getQuickSettings()
    return settings[key] ?? defaultValue
  }

  // Reactive ref with localStorage persistence
  const createPersistedRef = (key, defaultValue) => {
    const storedValue = getQuickSetting(key, defaultValue)
    const refValue = ref(storedValue)

    watch(
      refValue,
      (newValue) => {
        updateQuickSetting(key, newValue)
      },
      { deep: true }
    )

    return refValue
  }

  return {
    getApiKey,
    setApiKey,
    hasApiKey,
    getQuickSettings,
    setQuickSettings,
    updateQuickSetting,
    getQuickSetting,
    createPersistedRef,
  }
}
