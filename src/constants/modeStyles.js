/**
 * Mode Tag 樣式定義 - Single Source of Truth
 * 用於 GenerationHistory, HistoryTransfer 等處的模式標籤
 */

/**
 * 模式標籤的 CSS 類別映射
 * 包含背景色和文字色的 Tailwind 類別
 */
export const MODE_TAG_STYLES = {
  generate: 'bg-mode-generate-muted text-mode-generate',
  sticker: 'bg-mode-sticker-muted text-mode-sticker',
  edit: 'bg-status-info-muted text-status-info',
  story: 'bg-status-warning-muted text-status-warning',
  diagram: 'bg-status-success-muted text-status-success',
}

/**
 * 獲取模式標籤的樣式類別
 * @param {string} mode - 模式名稱
 * @param {string} fallback - 預設樣式（找不到時使用）
 * @returns {string} Tailwind 類別字串
 */
export function getModeTagStyle(mode, fallback = 'bg-control-disabled text-text-secondary') {
  return MODE_TAG_STYLES[mode] || fallback
}
