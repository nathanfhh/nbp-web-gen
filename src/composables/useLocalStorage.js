const API_KEY_STORAGE_KEY = 'nanobanana-api-key'
const FREE_TIER_API_KEY_STORAGE_KEY = 'nanobanana-free-tier-api-key'
const OPENAI_API_KEY_STORAGE_KEY = 'nanobanana-openai-api-key'
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

  // Free Tier API Key management
  const getFreeTierApiKey = () => {
    try {
      return localStorage.getItem(FREE_TIER_API_KEY_STORAGE_KEY) || ''
    } catch {
      return ''
    }
  }

  const setFreeTierApiKey = (key) => {
    try {
      if (key) {
        localStorage.setItem(FREE_TIER_API_KEY_STORAGE_KEY, key)
      } else {
        localStorage.removeItem(FREE_TIER_API_KEY_STORAGE_KEY)
      }
      return true
    } catch {
      return false
    }
  }

  const hasFreeTierApiKey = () => {
    return !!getFreeTierApiKey()
  }

  // OpenAI API Key management (single key — no free tier concept)
  const getOpenAIApiKey = () => {
    try {
      return localStorage.getItem(OPENAI_API_KEY_STORAGE_KEY) || ''
    } catch {
      return ''
    }
  }

  const setOpenAIApiKey = (key) => {
    try {
      if (key) {
        localStorage.setItem(OPENAI_API_KEY_STORAGE_KEY, key)
      } else {
        localStorage.removeItem(OPENAI_API_KEY_STORAGE_KEY)
      }
      return true
    } catch {
      return false
    }
  }

  const hasOpenAIApiKey = () => {
    return !!getOpenAIApiKey()
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

  return {
    // Primary API Key (paid)
    getApiKey,
    setApiKey,
    hasApiKey,
    // Free Tier API Key
    getFreeTierApiKey,
    setFreeTierApiKey,
    hasFreeTierApiKey,
    // OpenAI API Key
    getOpenAIApiKey,
    setOpenAIApiKey,
    hasOpenAIApiKey,
    // Quick settings
    getQuickSettings,
    setQuickSettings,
    updateQuickSetting,
    getQuickSetting,
  }
}
