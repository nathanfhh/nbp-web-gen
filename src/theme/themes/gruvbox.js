/**
 * Gruvbox 主題 - 復古暖調
 * 經典 Gruvbox Dark 配色，溫暖的復古色調，適合長時間使用
 */
export default {
  name: 'gruvbox',
  type: 'dark',

  colors: {
    // ========================================
    // 品牌色 - Gruvbox Orange/Yellow
    // ========================================
    brandPrimary: '#d79921', // Gruvbox Yellow
    brandPrimaryLight: '#fabd2f', // Bright Yellow
    brandPrimaryDark: '#b57614', // Dark Yellow
    brandPrimaryHover: '#fabd2f',
    brandAccent: '#d65d0e', // Gruvbox Orange
    brandAccentLight: '#fe8019', // Bright Orange

    // ========================================
    // 背景色 - Gruvbox Dark
    // ========================================
    bgBase: '#282828', // bg0
    bgCard: '#1d2021', // bg0_h (hard)
    bgElevated: '#3c3836', // bg1
    bgMuted: 'rgba(235, 219, 178, 0.05)', // fg muted
    bgInteractive: 'rgba(235, 219, 178, 0.08)',
    bgInteractiveHover: 'rgba(235, 219, 178, 0.12)',
    bgSubtle: 'rgba(215, 153, 33, 0.08)', // Yellow subtle
    bgOverlay: 'rgba(29, 32, 33, 0.85)',
    bgTooltip: '#1d2021',
    bgGradient1: 'rgba(215, 153, 33, 0.08)',
    bgGradient2: 'rgba(214, 93, 14, 0.06)',
    bgGradient3: 'rgba(152, 151, 26, 0.05)',

    // ========================================
    // 文字色 - Gruvbox Foreground
    // ========================================
    textPrimary: '#ebdbb2', // fg
    textSecondary: '#d5c4a1', // fg2
    textMuted: '#a89984', // fg4/gray
    textInverse: '#282828',
    textLink: '#fabd2f', // Bright Yellow
    textOnBrand: '#282828', // 品牌色按鈕上的文字
    textTooltip: '#F8FAFC', // Tooltip 文字（永遠亮色）

    // ========================================
    // 邊框色
    // ========================================
    borderDefault: 'rgba(235, 219, 178, 0.2)',
    borderMuted: 'rgba(235, 219, 178, 0.1)',
    borderFocus: '#d79921',
    borderSubtle: 'rgba(235, 219, 178, 0.15)',

    // ========================================
    // 狀態色 - Gruvbox Colors
    // ========================================
    statusSuccess: '#98971a', // Green
    statusSuccessMuted: 'rgba(152, 151, 26, 0.2)',
    statusSuccessSolid: '#b8bb26', // Bright Green
    statusSuccessHover: '#79740e',
    statusError: '#cc241d', // Red
    statusErrorMuted: 'rgba(204, 36, 29, 0.2)',
    statusErrorSolid: '#fb4934', // Bright Red
    statusErrorHover: '#9d0006',
    statusWarning: '#d65d0e', // Orange
    statusWarningMuted: 'rgba(214, 93, 14, 0.2)',
    statusInfo: '#458588', // Blue
    statusInfoMuted: 'rgba(69, 133, 136, 0.2)',
    statusInfoSolid: '#83a598', // Bright Blue
    statusInfoHover: '#076678',

    // ========================================
    // 模式色（統一品牌色）
    // ========================================
    modeGenerate: '#fabd2f', // = brandPrimaryLight
    modeGenerateMuted: 'rgba(215, 153, 33, 0.2)',
    modeGenerateSolid: '#d79921', // = brandPrimary
    modeGenerateHover: 'rgba(215, 153, 33, 0.3)',
    modeVideo: '#d3869b', // 影片模式 - Gruvbox Purple
    modeVideoMuted: 'rgba(211, 134, 155, 0.2)',

    // ========================================
    // 控制元件狀態
    // ========================================
    controlActive: '#b8bb26', // Bright Green
    controlInactive: '#665c54', // bg3
    controlDisabled: '#3c3836', // bg1
    controlDisabledText: '#665c54',

    // ========================================
    // 動畫/裝飾色
    // ========================================
    accentPulse: '#fe8019', // Bright Orange
    accentPulseMuted: 'rgba(254, 128, 25, 0.3)',
    accentStar: '#fabd2f', // Bright Yellow
    accentCheckerboard: 'rgba(235, 219, 178, 0.06)',

    // ========================================
    // 玻璃效果
    // ========================================
    glassBg: 'rgba(40, 40, 40, 0.85)',
    glassBgStrong: 'rgba(40, 40, 40, 0.95)',
    glassBorder: 'rgba(235, 219, 178, 0.15)',

    // ========================================
    // 輸入框
    // ========================================
    inputBg: '#1d2021',

    // ========================================
    // 漸層色
    // ========================================
    gradientBrandStart: '#b57614',
    gradientBrandMiddle: '#d79921',
    gradientBrandEnd: '#b57614',
    gradientStepActiveStart: '#fe8019',
    gradientStepActiveEnd: '#d65d0e',
    gradientStepCompletedStart: '#d79921',
    gradientStepCompletedEnd: '#b57614',
    gradientStepSuccessStart: '#b8bb26',
    gradientStepSuccessEnd: '#98971a',
    gradientTimelineStart: 'rgba(215, 153, 33, 0.5)',
  },

  shadows: {
    glowPrimary: '0 4px 20px rgba(215, 153, 33, 0.25)',
    glowSuccess: '0 4px 16px rgba(152, 151, 26, 0.3)',
    glowGold: '0 4px 20px rgba(250, 189, 47, 0.25)',
    stepActive: '0 0 20px rgba(254, 128, 25, 0.4)',
    card: '0 4px 24px rgba(0, 0, 0, 0.3)',
  },

  metaThemeColor: '#282828',
}
