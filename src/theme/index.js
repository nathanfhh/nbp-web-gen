/**
 * 主題系統註冊中心
 * 類似 i18n/index.js 的架構，管理所有主題
 */
import { ref, computed } from 'vue'
import { generateCSSVariables } from './tokens'
import darkTheme from './themes/dark'
import lightTheme from './themes/light'

const STORAGE_KEY = 'nbp-theme'

// ============================================================================
// 主題註冊表
// ============================================================================

/**
 * 所有可用主題
 * 新增主題只需：
 * 1. 建立 themes/[name].js
 * 2. 在這裡 import 並加入 themes 物件
 */
const themes = {
  dark: darkTheme,
  light: lightTheme,
  // 未來可擴充：
  // midnight: midnightTheme,
  // ocean: oceanTheme,
  // sepia: sepiaTheme,
}

// ============================================================================
// 響應式狀態
// ============================================================================

const currentThemeName = ref('dark')

// 當前主題物件（計算屬性）
const currentTheme = computed(() => themes[currentThemeName.value])

// ============================================================================
// 工具函數
// ============================================================================

/**
 * 偵測系統偏好的主題
 * @returns {'dark' | 'light'}
 */
function getSystemPreference() {
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) {
    return 'light'
  }
  return 'dark'
}

/**
 * 取得已儲存的主題或系統偏好
 * @returns {string}
 */
function getSavedTheme() {
  if (typeof window === 'undefined') return 'dark'

  // 優先檢查新的儲存位置
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved && themes[saved]) {
    return saved
  }

  // 向後相容：從舊的 settings 中讀取（遷移用戶資料）
  try {
    const oldSettings = localStorage.getItem('nanobanana-settings')
    if (oldSettings) {
      const parsed = JSON.parse(oldSettings)
      if (parsed.theme && themes[parsed.theme]) {
        // 遷移到新位置
        localStorage.setItem(STORAGE_KEY, parsed.theme)
        return parsed.theme
      }
    }
  } catch {
    // 忽略解析錯誤
  }

  return getSystemPreference()
}

/**
 * 將主題應用到 DOM
 * @param {Object} theme - 主題物件
 */
function applyThemeToDOM(theme) {
  if (typeof document === 'undefined') return

  const root = document.documentElement

  // 設定 data-theme 屬性（保持向後相容）
  root.setAttribute('data-theme', theme.name)

  // 注入 CSS 變數
  const variables = generateCSSVariables(theme)
  Object.entries(variables).forEach(([name, value]) => {
    root.style.setProperty(name, value)
  })

  // 更新 PWA theme-color meta 標籤
  const metaThemeColor = document.querySelector('meta[name="theme-color"]')
  if (metaThemeColor && theme.metaThemeColor) {
    metaThemeColor.setAttribute('content', theme.metaThemeColor)
  }
}

// ============================================================================
// 公開 API
// ============================================================================

/**
 * 初始化主題系統
 * 應在 main.js 中呼叫
 */
export function initTheme() {
  currentThemeName.value = getSavedTheme()
  applyThemeToDOM(themes[currentThemeName.value])

  // 監聽系統主題變化（只在未手動設定時響應）
  if (typeof window !== 'undefined') {
    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      // 只在沒有手動儲存主題時跟隨系統
      if (!localStorage.getItem(STORAGE_KEY)) {
        setTheme(e.matches ? 'dark' : 'light')
      }
    })
  }
}

/**
 * 設定主題
 * @param {string} themeName - 主題名稱
 */
export function setTheme(themeName) {
  if (!themes[themeName]) {
    console.warn(`[Theme] Theme "${themeName}" not found. Available themes: ${Object.keys(themes).join(', ')}`)
    return
  }

  currentThemeName.value = themeName
  localStorage.setItem(STORAGE_KEY, themeName)
  applyThemeToDOM(themes[themeName])
}

/**
 * 切換主題（用於雙主題快速切換）
 */
export function toggleTheme() {
  const themeNames = Object.keys(themes)
  const currentIndex = themeNames.indexOf(currentThemeName.value)
  const nextIndex = (currentIndex + 1) % themeNames.length
  setTheme(themeNames[nextIndex])
}

/**
 * 取得當前主題名稱
 * @returns {import('vue').Ref<string>}
 */
export function useThemeName() {
  return currentThemeName
}

/**
 * 取得當前主題物件
 * @returns {import('vue').ComputedRef<Object>}
 */
export function useTheme() {
  return currentTheme
}

/**
 * 取得所有可用主題
 * @returns {Array<{name: string, displayName: string}>}
 */
export function getAvailableThemes() {
  return Object.values(themes).map((t) => ({
    name: t.name,
    displayName: t.displayName,
  }))
}

/**
 * 檢查主題是否存在
 * @param {string} themeName
 * @returns {boolean}
 */
export function hasTheme(themeName) {
  return !!themes[themeName]
}

// 預設匯出
export default {
  initTheme,
  setTheme,
  toggleTheme,
  useThemeName,
  useTheme,
  getAvailableThemes,
  hasTheme,
}
