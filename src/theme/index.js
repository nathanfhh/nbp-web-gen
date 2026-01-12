/**
 * 主題系統註冊中心
 * 管理所有主題，自動偵測 themes 資料夾下的所有主題檔案
 */
import { ref, computed } from 'vue'
import { generateCSSVariables } from './tokens'

const STORAGE_KEY = 'nbp-theme'

// ============================================================================
// 主題註冊表 (自動載入)
// ============================================================================

// 使用 Vite 的 glob import 功能讀取 themes 資料夾下所有 .js 檔案
const themeFiles = import.meta.glob('./themes/*.js', { eager: true })

const themes = {}

// 解析載入的主題
Object.values(themeFiles).forEach((module) => {
  const theme = module.default
  if (theme && theme.name) {
    themes[theme.name] = theme
  }
})

// ============================================================================
// 響應式狀態
// ============================================================================

const currentThemeName = ref('dark')

// 當前主題物件（計算屬性）
const currentTheme = computed(() => themes[currentThemeName.value] || themes['dark'])

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
  if (typeof document === 'undefined' || !theme) return

  const root = document.documentElement

  // 設定 data-theme 屬性（保持向後相容）
  root.setAttribute('data-theme', theme.name)
  // 設定通用主題類型 (light/dark)，讓 CSS 可以針對類型做統一處理，無需列舉每個主題名稱
  root.setAttribute('data-theme-type', theme.type || 'dark')

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
  const savedTheme = getSavedTheme()
  // 確保主題存在，否則回退到 dark
  currentThemeName.value = themes[savedTheme] ? savedTheme : 'dark'
  
  applyThemeToDOM(themes[currentThemeName.value])

  // 監聽系統主題變化（只在未手動設定時響應）
  if (typeof window !== 'undefined') {
    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      // 只在沒有手動儲存主題時跟隨系統
      if (!localStorage.getItem(STORAGE_KEY)) {
        const newTheme = e.matches ? 'dark' : 'light'
        // 只有當該主題存在時才切換（避免只有單一主題的情況）
        if (themes[newTheme]) {
          setTheme(newTheme)
        }
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
  
  // 如果支援 View Transitions API 且不是初始載入，這部分邏輯交由 UI 層處理動畫
  // 這裡只負責純數據更新和基本的 DOM 變更（作為 fallback）
  if (!document.startViewTransition) {
      applyThemeToDOM(themes[themeName])
  } else {
      // 在 View Transition 環境下，UI 元件會呼叫 setTheme
      // 我們這裡直接 apply，因為 startViewTransition 會包裹這個狀態變更
      applyThemeToDOM(themes[themeName])
  }
}

/**
 * 切換主題（用於雙主題快速切換，循環）
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
 * 取得所有可用主題的 ID 列表
 * @returns {Array<string>}
 */
export function getAvailableThemes() {
  return Object.keys(themes)
}

/**
 * 檢查主題是否存在
 * @param {string} themeName
 * @returns {boolean}
 */
export function hasTheme(themeName) {
  return !!themes[themeName]
}

/**
 * 取得主題類型 (light/dark)
 * @param {string} themeName
 * @returns {'light' | 'dark' | null}
 */
export function getThemeType(themeName) {
  return themes[themeName]?.type || null
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
  getThemeType,
}