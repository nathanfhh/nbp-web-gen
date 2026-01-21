import { createI18n } from 'vue-i18n'
import zhTW from './locales/zh-TW.json'
import en from './locales/en.json'

const STORAGE_KEY = 'nbp-locale'

// Get browser language preference
function getBrowserLocale() {
  const lang = navigator.language || navigator.userLanguage
  // If starts with 'zh', use Traditional Chinese
  if (lang.startsWith('zh')) {
    return 'zh-TW'
  }
  return 'en'
}

// Get saved locale or detect from browser
function getDefaultLocale() {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved && ['zh-TW', 'en'].includes(saved)) {
    return saved
  }
  return getBrowserLocale()
}

// Save locale preference
export function saveLocale(locale) {
  localStorage.setItem(STORAGE_KEY, locale)
}

// Create i18n instance
const i18n = createI18n({
  legacy: false, // Use Composition API
  locale: getDefaultLocale(),
  fallbackLocale: 'en',
  messages: {
    'zh-TW': zhTW,
    en: en,
  },
})

// Helper for non-component contexts (composables, utils)
// Usage: import { t } from '@/i18n'
export const t = (key, params) => i18n.global.t(key, params)

export default i18n
