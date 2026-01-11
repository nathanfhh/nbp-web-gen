/**
 * 語義化 Token 定義
 * 定義所有可用的主題變數及其分類
 */

// Token 分類結構（用於文件和驗證）
export const TOKEN_SCHEMA = {
  // 品牌色
  brand: ['primary', 'primaryLight', 'primaryDark', 'accent', 'accentLight'],

  // 背景色
  bg: ['base', 'card', 'elevated', 'muted', 'interactive', 'interactiveHover'],

  // 文字色
  text: ['primary', 'secondary', 'muted', 'inverse', 'link'],

  // 邊框色
  border: ['default', 'muted', 'focus'],

  // 狀態色
  status: [
    'success',
    'successMuted',
    'error',
    'errorMuted',
    'warning',
    'warningMuted',
    'info',
    'infoMuted',
  ],

  // 模式色（對應 5 種生成模式）
  mode: [
    'generate',
    'generateMuted',
    'sticker',
    'stickerMuted',
    'edit',
    'editMuted',
    'story',
    'storyMuted',
    'diagram',
    'diagramMuted',
  ],

  // 玻璃效果
  glass: ['bg', 'bgStrong', 'border'],

  // 陰影/光暈
  shadow: ['glowPrimary', 'glowSuccess', 'glowGold'],
}

/**
 * 硬編碼 Tailwind 顏色到語義化 Token 的映射表
 * 用於自動遷移腳本
 */
export const COLOR_MIGRATION_MAP = {
  // ========================================
  // text-* 類別遷移
  // ========================================

  // 灰階文字
  'text-white': 'text-text-primary',
  'text-gray-300': 'text-text-secondary',
  'text-gray-400': 'text-text-muted',
  'text-gray-500': 'text-text-muted',
  'text-gray-600': 'text-text-muted',
  'text-gray-700': 'text-text-muted',

  // 品牌/連結色
  'text-blue-300': 'text-mode-generate',
  'text-blue-400': 'text-mode-generate',

  // 狀態色
  'text-emerald-300': 'text-status-success',
  'text-emerald-400': 'text-status-success',
  'text-red-300': 'text-status-error',
  'text-red-400': 'text-status-error',
  'text-amber-300': 'text-status-warning',
  'text-amber-400': 'text-status-warning',
  'text-cyan-300': 'text-status-info',
  'text-cyan-400': 'text-status-info',

  // 模式色
  'text-pink-300': 'text-mode-sticker',
  'text-pink-400': 'text-mode-sticker',
  'text-violet-300': 'text-mode-diagram',
  'text-violet-400': 'text-mode-diagram',
  'text-rose-300': 'text-mode-edit',
  'text-rose-400': 'text-mode-edit',

  // ========================================
  // bg-* 類別遷移
  // ========================================

  // 基礎背景
  'bg-white/5': 'bg-bg-muted',
  'bg-white/10': 'bg-bg-interactive',
  'bg-white/20': 'bg-bg-interactive-hover',
  'bg-black/20': 'bg-bg-muted',
  'bg-black/30': 'bg-bg-muted',
  'bg-black/40': 'bg-bg-interactive',

  // 品牌/模式背景
  'bg-blue-500/20': 'bg-mode-generate-muted',
  'bg-blue-500/30': 'bg-mode-generate-muted',
  'bg-blue-500': 'bg-brand-primary',

  // 狀態背景
  'bg-emerald-500/20': 'bg-status-success-muted',
  'bg-emerald-500/30': 'bg-status-success-muted',
  'bg-red-500/20': 'bg-status-error-muted',
  'bg-red-500/30': 'bg-status-error-muted',
  'bg-amber-500/20': 'bg-status-warning-muted',
  'bg-amber-500/30': 'bg-status-warning-muted',
  'bg-cyan-500/20': 'bg-status-info-muted',
  'bg-cyan-500/30': 'bg-status-info-muted',

  // 模式背景
  'bg-pink-500/20': 'bg-mode-sticker-muted',
  'bg-pink-500/30': 'bg-mode-sticker-muted',
  'bg-violet-500/20': 'bg-mode-diagram-muted',
  'bg-violet-500/30': 'bg-mode-diagram-muted',
  'bg-rose-500/20': 'bg-mode-edit-muted',
  'bg-rose-500/30': 'bg-mode-edit-muted',

  // ========================================
  // border-* 類別遷移
  // ========================================

  // 基礎邊框
  'border-white/10': 'border-border-muted',
  'border-white/20': 'border-border-default',
  'border-transparent': 'border-transparent',
  'border-gray-500': 'border-border-muted',
  'border-gray-700': 'border-border-muted',

  // 品牌/模式邊框
  'border-blue-500': 'border-mode-generate',
  'border-blue-500/50': 'border-mode-generate',

  // 狀態邊框
  'border-emerald-500': 'border-status-success',
  'border-red-500': 'border-status-error',
  'border-amber-500': 'border-status-warning',
  'border-cyan-500': 'border-status-info',
  'border-cyan-400/50': 'border-status-info',

  // 模式邊框
  'border-pink-500': 'border-mode-sticker',
  'border-violet-500': 'border-mode-diagram',
  'border-rose-500': 'border-mode-edit',

  // ========================================
  // hover:* 類別遷移
  // ========================================
  'hover:bg-white/5': 'hover:bg-bg-muted',
  'hover:bg-white/10': 'hover:bg-bg-interactive',
  'hover:bg-white/20': 'hover:bg-bg-interactive-hover',
  'hover:text-white': 'hover:text-text-primary',

  // ========================================
  // focus:* 類別遷移
  // ========================================
  'focus:ring-blue-500': 'focus:ring-brand-primary',
  'focus:border-blue-500': 'focus:border-brand-primary',

  // ========================================
  // 其他常用類別
  // ========================================
  'ring-blue-400': 'ring-brand-primary-light',
  'ring-blue-500': 'ring-brand-primary',
}

/**
 * 將 camelCase 轉換為 kebab-case
 * @param {string} str
 * @returns {string}
 */
export function camelToKebab(str) {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
}

/**
 * 從主題物件生成 CSS 變數
 * @param {Object} theme - 主題物件
 * @returns {Object} CSS 變數名稱到值的映射
 */
export function generateCSSVariables(theme) {
  const variables = {}

  // 處理顏色
  if (theme.colors) {
    Object.entries(theme.colors).forEach(([key, value]) => {
      variables[`--color-${camelToKebab(key)}`] = value
    })
  }

  // 處理陰影
  if (theme.shadows) {
    Object.entries(theme.shadows).forEach(([key, value]) => {
      variables[`--shadow-${camelToKebab(key)}`] = value
    })
  }

  return variables
}
