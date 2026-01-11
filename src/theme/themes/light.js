/**
 * 亮色主題 - Greek Blue & White
 * 希臘藍配色，清爽明亮
 */
export default {
  name: 'light',
  displayName: '亮色模式',

  colors: {
    // ========================================
    // 品牌色 - Greek Blue
    // ========================================
    brandPrimary: '#0D5EAF',
    brandPrimaryLight: '#1976D2',
    brandPrimaryDark: '#0A4C8C',
    brandAccent: '#0D5EAF',
    brandAccentLight: '#1976D2',

    // ========================================
    // 背景色 - Clean whites
    // ========================================
    bgBase: '#FFFFFF',
    bgCard: '#FFFFFF',
    bgElevated: '#F8FAFC',
    bgMuted: 'rgba(13, 94, 175, 0.05)',
    bgInteractive: 'rgba(13, 94, 175, 0.08)',
    bgInteractiveHover: 'rgba(13, 94, 175, 0.12)',

    // ========================================
    // 文字色 - High contrast for readability
    // ========================================
    textPrimary: '#1a1a2e',
    textSecondary: '#374151',
    textMuted: '#6b7280',
    textInverse: '#FFFFFF',
    textLink: '#0D5EAF',

    // ========================================
    // 邊框色
    // ========================================
    borderDefault: 'rgba(13, 94, 175, 0.2)',
    borderMuted: 'rgba(13, 94, 175, 0.1)',
    borderFocus: '#0D5EAF',

    // ========================================
    // 狀態色（調整對比度以符合亮色背景）
    // ========================================
    statusSuccess: '#047857',
    statusSuccessMuted: 'rgba(4, 120, 87, 0.12)',
    statusError: '#DC2626',
    statusErrorMuted: 'rgba(220, 38, 38, 0.12)',
    statusWarning: '#B45309',
    statusWarningMuted: 'rgba(180, 83, 9, 0.12)',
    statusInfo: '#0288D1',
    statusInfoMuted: 'rgba(2, 136, 209, 0.12)',

    // ========================================
    // 模式色（調整對比度）
    // ========================================
    modeGenerate: '#2563EB', // Blue
    modeGenerateMuted: 'rgba(37, 99, 235, 0.12)',
    modeSticker: '#BE185D', // Pink
    modeStickerMuted: 'rgba(190, 24, 93, 0.12)',
    modeEdit: '#6D28D9', // Violet
    modeEditMuted: 'rgba(109, 40, 217, 0.12)',
    modeStory: '#C2410C', // Orange
    modeStoryMuted: 'rgba(194, 65, 12, 0.12)',
    modeDiagram: '#047857', // Emerald
    modeDiagramMuted: 'rgba(4, 120, 87, 0.12)',

    // ========================================
    // 玻璃效果
    // ========================================
    glassBg: 'rgba(255, 255, 255, 0.92)',
    glassBgStrong: 'rgba(255, 255, 255, 0.95)',
    glassBorder: 'rgba(13, 94, 175, 0.15)',

    // ========================================
    // 輸入框
    // ========================================
    inputBg: '#FFFFFF',
  },

  shadows: {
    glowPrimary: '0 4px 20px rgba(13, 94, 175, 0.12)',
    glowSuccess: '0 4px 16px rgba(4, 120, 87, 0.2)',
    glowGold: '0 4px 20px rgba(184, 134, 11, 0.12)',
  },

  // PWA theme-color
  metaThemeColor: '#ffffff',
}
