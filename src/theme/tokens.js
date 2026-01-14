/**
 * 語義化 Token 定義
 * 定義所有可用的主題變數及其分類
 */

// Token 分類結構（用於文件和驗證）
export const TOKEN_SCHEMA = {
  // 品牌色
  brand: ['primary', 'primaryLight', 'primaryDark', 'primaryHover', 'accent', 'accentLight'],

  // 背景色
  bg: [
    'base',
    'card',
    'elevated',
    'muted',
    'interactive',
    'interactiveHover',
    'subtle', // 極淺色 accent 背景
    'overlay', // 覆蓋層（如 modal 背景）
    'tooltip', // 提示框背景
    'gradient1', // 背景漸層球 1
    'gradient2', // 背景漸層球 2
    'gradient3', // 背景漸層球 3
  ],

  // 文字色
  text: ['primary', 'secondary', 'muted', 'inverse', 'link', 'onBrand'],

  // 邊框色
  border: ['default', 'muted', 'focus', 'subtle'],

  // 狀態色（含 hover 變體和實心背景）
  status: [
    'success',
    'successMuted',
    'successSolid', // 實心背景（需要白字）
    'successHover',
    'error',
    'errorMuted',
    'errorSolid',
    'errorHover',
    'warning',
    'warningMuted',
    'info',
    'infoMuted',
    'infoSolid',
    'infoHover',
  ],

  // 模式色（對應 6 種生成模式，含 hover 變體）
  mode: [
    'generate',
    'generateMuted',
    'generateHover',
    'sticker',
    'stickerMuted',
    'stickerSolid', // toggle on 狀態
    'edit',
    'editMuted',
    'story',
    'storyMuted',
    'diagram',
    'diagramMuted',
    'video',
    'videoMuted',
  ],

  // 控制元件狀態（toggle、按鈕等）
  control: [
    'active', // toggle ON
    'inactive', // toggle OFF
    'disabled', // disabled 背景
    'disabledText', // disabled 文字
  ],

  // 動畫/裝飾色
  accent: [
    'pulse', // 脈搏動畫
    'pulseMuted', // 脈搏動畫淡色
    'star', // 星星/收藏
    'checkerboard', // 棋盤格背景（透明預覽）
  ],

  // 玻璃效果
  glass: ['bg', 'bgStrong', 'border'],

  // 陰影/光暈
  shadow: ['glowPrimary', 'glowSuccess', 'glowGold', 'stepActive', 'card'],

  // 漸層色（用於步驟指示器、品牌等）
  gradient: [
    'brandStart', // 品牌漸層起點
    'brandMiddle', // 品牌漸層中點
    'brandEnd', // 品牌漸層終點
    'stepActiveStart', // 進行中步驟起點
    'stepActiveEnd', // 進行中步驟終點
    'stepCompletedStart', // 已完成步驟起點
    'stepCompletedEnd', // 已完成步驟終點
    'stepSuccessStart', // 成功步驟起點
    'stepSuccessEnd', // 成功步驟終點
    'timelineStart', // 時間軸起點
  ],
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
  'text-gray-200': 'text-text-secondary',
  'text-gray-300': 'text-text-secondary',
  'text-gray-400': 'text-text-muted',
  'text-gray-500': 'text-text-muted',
  'text-gray-600': 'text-text-muted',
  'text-gray-700': 'text-text-muted',

  // 品牌/連結色
  'text-blue-300': 'text-mode-generate',
  'text-blue-400': 'text-mode-generate',
  'text-blue-500': 'text-brand-primary',
  'text-blue-600': 'text-brand-primary',

  // 狀態色
  'text-emerald-300': 'text-status-success',
  'text-emerald-400': 'text-status-success',
  'text-red-300': 'text-status-error',
  'text-red-400': 'text-status-error',
  'text-red-500': 'text-status-error',
  'text-amber-200/80': 'text-status-warning',
  'text-amber-300': 'text-status-warning',
  'text-amber-400': 'text-status-warning',
  'text-amber-400/80': 'text-status-warning',
  'text-cyan-300': 'text-status-info',
  'text-cyan-400': 'text-status-info',
  'text-yellow-400': 'text-accent-star',

  // 模式色 (統一使用 mode-generate)
  'text-pink-300': 'text-mode-generate',
  'text-pink-400': 'text-mode-generate',
  'text-violet-300': 'text-mode-generate',
  'text-violet-400': 'text-mode-generate',
  'text-rose-300': 'text-mode-generate',
  'text-rose-400': 'text-mode-generate',

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
  'bg-black/50': 'bg-bg-overlay',

  // 灰階背景
  'bg-gray-100': 'bg-bg-subtle',
  'bg-gray-500': 'bg-control-inactive',
  'bg-gray-500/10': 'bg-control-disabled',
  'bg-gray-500/20': 'bg-control-disabled',
  'bg-gray-600': 'bg-control-inactive',
  'bg-gray-700': 'bg-control-disabled',
  'bg-gray-800': 'bg-bg-tooltip',
  'bg-gray-900': 'bg-bg-elevated',

  // 品牌/模式背景
  'bg-blue-50': 'bg-bg-subtle',
  'bg-blue-100': 'bg-bg-subtle',
  'bg-blue-500': 'bg-brand-primary',
  'bg-blue-500/10': 'bg-mode-generate-muted',
  'bg-blue-500/20': 'bg-mode-generate-muted',
  'bg-blue-500/30': 'bg-mode-generate-muted',
  'bg-blue-500/40': 'bg-mode-generate-muted',
  'bg-blue-500/80': 'bg-brand-primary',
  'bg-blue-600': 'bg-brand-primary-hover',

  // 狀態實心背景（需白字）
  'bg-emerald-500': 'bg-status-success-solid',
  'bg-emerald-500/10': 'bg-status-success-muted',
  'bg-emerald-500/20': 'bg-status-success-muted',
  'bg-emerald-500/30': 'bg-status-success-muted',
  'bg-emerald-500/40': 'bg-status-success-muted',
  'bg-emerald-600': 'bg-status-success-hover',
  'bg-red-500': 'bg-status-error-solid',
  'bg-red-500/10': 'bg-status-error-muted',
  'bg-red-500/20': 'bg-status-error-muted',
  'bg-red-500/30': 'bg-status-error-muted',
  'bg-red-500/80': 'bg-status-error-solid',
  'bg-amber-500/20': 'bg-status-warning-muted',
  'bg-amber-500/30': 'bg-status-warning-muted',

  // Info 狀態
  'bg-cyan-400': 'bg-accent-pulse',
  'bg-cyan-400/30': 'bg-accent-pulse-muted',
  'bg-cyan-500': 'bg-status-info-solid',
  'bg-cyan-500/20': 'bg-status-info-muted',
  'bg-cyan-500/30': 'bg-status-info-muted',
  'bg-cyan-500/40': 'bg-status-info-muted',
  'bg-cyan-600': 'bg-status-info-solid',
  'bg-cyan-700': 'bg-status-info-hover',

  // 模式背景 (統一使用 mode-generate)
  'bg-pink-500': 'bg-mode-generate-solid',
  'bg-pink-500/20': 'bg-mode-generate-muted',
  'bg-pink-500/30': 'bg-mode-generate-muted',
  'bg-violet-500/20': 'bg-mode-generate-muted',
  'bg-violet-500/30': 'bg-mode-generate-muted',
  'bg-rose-500/20': 'bg-mode-generate-muted',
  'bg-rose-500/30': 'bg-mode-generate-muted',

  // ========================================
  // border-* 類別遷移
  // ========================================

  // 基礎邊框
  'border-white/10': 'border-border-muted',
  'border-white/20': 'border-border-default',
  'border-white/30': 'border-border-default',
  'border-transparent': 'border-transparent',
  'border-gray-500': 'border-border-muted',
  'border-gray-500/30': 'border-border-muted',
  'border-gray-700': 'border-border-muted',

  // 品牌/模式邊框
  'border-blue-200': 'border-border-subtle',
  'border-blue-400': 'border-mode-generate',
  'border-blue-500': 'border-mode-generate',
  'border-blue-500/40': 'border-mode-generate',
  'border-blue-500/50': 'border-mode-generate',

  // 狀態邊框
  'border-emerald-500': 'border-status-success',
  'border-emerald-500/30': 'border-status-success',
  'border-emerald-500/50': 'border-status-success',
  'border-red-500': 'border-status-error',
  'border-red-500/30': 'border-status-error',
  'border-red-500/50': 'border-status-error',
  'border-amber-500': 'border-status-warning',
  'border-amber-500/50': 'border-status-warning',
  'border-cyan-500': 'border-status-info',
  'border-cyan-500/40': 'border-status-info',
  'border-cyan-400/50': 'border-status-info',

  // 模式邊框 (統一使用 mode-generate)
  'border-pink-500': 'border-mode-generate',
  'border-pink-500/30': 'border-mode-generate',
  'border-violet-500': 'border-mode-generate',
  'border-rose-500': 'border-mode-generate',

  // ========================================
  // hover:text-* 類別遷移
  // ========================================
  'hover:text-white': 'hover:text-text-primary',
  'hover:text-gray-200': 'hover:text-text-secondary',
  'hover:text-gray-300': 'hover:text-text-secondary',
  'hover:text-gray-400': 'hover:text-text-muted',
  'hover:text-gray-700': 'hover:text-text-muted',
  'hover:text-blue-300': 'hover:text-mode-generate',
  'hover:text-blue-400': 'hover:text-mode-generate',
  'hover:text-red-300': 'hover:text-status-error',
  'hover:text-red-400': 'hover:text-status-error',
  'hover:text-red-500': 'hover:text-status-error',
  'hover:text-emerald-400': 'hover:text-status-success',

  // ========================================
  // hover:bg-* 類別遷移
  // ========================================
  'hover:bg-white/5': 'hover:bg-bg-muted',
  'hover:bg-white/10': 'hover:bg-bg-interactive',
  'hover:bg-white/20': 'hover:bg-bg-interactive-hover',
  'hover:bg-gray-100': 'hover:bg-bg-subtle',
  'hover:bg-blue-100': 'hover:bg-bg-subtle',
  'hover:bg-blue-500/30': 'hover:bg-mode-generate-muted',
  'hover:bg-blue-500/40': 'hover:bg-mode-generate-muted',
  'hover:bg-blue-600': 'hover:bg-brand-primary-hover',
  'hover:bg-red-500': 'hover:bg-status-error-solid',
  'hover:bg-red-500/20': 'hover:bg-status-error-muted',
  'hover:bg-red-500/30': 'hover:bg-status-error-muted',
  'hover:bg-emerald-500/20': 'hover:bg-status-success-muted',
  'hover:bg-emerald-500/40': 'hover:bg-status-success-muted',
  'hover:bg-emerald-600': 'hover:bg-status-success-hover',
  'hover:bg-cyan-500/30': 'hover:bg-status-info-muted',
  'hover:bg-cyan-500/40': 'hover:bg-status-info-muted',
  'hover:bg-cyan-700': 'hover:bg-status-info-hover',

  // ========================================
  // hover:border-* 類別遷移
  // ========================================
  'hover:border-blue-500/50': 'hover:border-mode-generate',
  'hover:border-emerald-500/50': 'hover:border-status-success',

  // ========================================
  // focus:* 類別遷移
  // ========================================
  'focus:ring-blue-500': 'focus:ring-brand-primary',
  'focus:border-blue-500': 'focus:border-brand-primary',

  // ========================================
  // ring-* 類別遷移
  // ========================================
  'ring-blue-400': 'ring-brand-primary-light',
  'ring-blue-500': 'ring-brand-primary',
  'ring-blue-500/50': 'ring-brand-primary',
  'ring-cyan-500': 'ring-status-info',
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
