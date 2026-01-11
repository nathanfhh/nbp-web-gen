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
    brandPrimaryHover: '#0A4C8C',
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
    bgSubtle: 'rgba(13, 94, 175, 0.06)', // 極淺色 accent 背景
    bgOverlay: 'rgba(0, 0, 0, 0.3)', // 覆蓋層
    bgTooltip: '#1E293B', // 提示框背景（亮色模式下保持深色）

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
    borderSubtle: 'rgba(13, 94, 175, 0.15)', // 淺色 accent 邊框

    // ========================================
    // 狀態色（調整對比度以符合亮色背景）
    // ========================================
    statusSuccess: '#047857',
    statusSuccessMuted: 'rgba(4, 120, 87, 0.12)',
    statusSuccessSolid: '#10B981', // 實心背景（需白字）
    statusSuccessHover: '#059669',
    statusError: '#DC2626',
    statusErrorMuted: 'rgba(220, 38, 38, 0.12)',
    statusErrorSolid: '#EF4444', // 實心背景（需白字）
    statusErrorHover: '#DC2626',
    statusWarning: '#B45309',
    statusWarningMuted: 'rgba(180, 83, 9, 0.12)',
    statusInfo: '#0288D1',
    statusInfoMuted: 'rgba(2, 136, 209, 0.12)',
    statusInfoSolid: '#0891B2', // 實心背景（需白字）
    statusInfoHover: '#0E7490',

    // ========================================
    // 模式色（調整對比度）
    // ========================================
    modeGenerate: '#2563EB', // Blue
    modeGenerateMuted: 'rgba(37, 99, 235, 0.12)',
    modeGenerateHover: 'rgba(37, 99, 235, 0.2)',
    modeSticker: '#BE185D', // Pink
    modeStickerMuted: 'rgba(190, 24, 93, 0.12)',
    modeStickerSolid: '#EC4899', // Toggle ON 狀態
    modeEdit: '#6D28D9', // Violet
    modeEditMuted: 'rgba(109, 40, 217, 0.12)',
    modeStory: '#C2410C', // Orange
    modeStoryMuted: 'rgba(194, 65, 12, 0.12)',
    modeDiagram: '#047857', // Emerald
    modeDiagramMuted: 'rgba(4, 120, 87, 0.12)',

    // ========================================
    // 控制元件狀態
    // ========================================
    controlActive: '#10B981', // Toggle ON
    controlInactive: '#9CA3AF', // Toggle OFF（亮色背景需較淺）
    controlDisabled: '#E5E7EB', // Disabled 背景
    controlDisabledText: '#9CA3AF', // Disabled 文字

    // ========================================
    // 動畫/裝飾色
    // ========================================
    accentPulse: '#06B6D4', // 脈搏動畫
    accentPulseMuted: 'rgba(6, 182, 212, 0.3)',
    accentStar: '#EAB308', // 星星/收藏

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

    // ========================================
    // 漸層色（亮色模式用較深的顏色）
    // ========================================
    gradientBrandStart: '#1D4ED8', // 品牌漸層
    gradientBrandMiddle: '#2563EB',
    gradientBrandEnd: '#1D4ED8',
    gradientStepActiveStart: '#0891B2', // 進行中步驟 (cyan → blue)
    gradientStepActiveEnd: '#2563EB',
    gradientStepCompletedStart: '#2563EB', // 已完成步驟 (blue → indigo)
    gradientStepCompletedEnd: '#4F46E5',
    gradientStepSuccessStart: '#059669', // 成功步驟 (emerald → teal)
    gradientStepSuccessEnd: '#0D9488',
    gradientTimelineStart: 'rgba(37, 99, 235, 0.5)', // 時間軸
  },

  shadows: {
    glowPrimary: '0 4px 20px rgba(13, 94, 175, 0.12)',
    glowSuccess: '0 4px 16px rgba(4, 120, 87, 0.2)',
    glowGold: '0 4px 20px rgba(184, 134, 11, 0.12)',
    stepActive: '0 0 20px rgba(8, 145, 178, 0.4)', // 進行中步驟光暈
  },

  // PWA theme-color
  metaThemeColor: '#ffffff',
}
