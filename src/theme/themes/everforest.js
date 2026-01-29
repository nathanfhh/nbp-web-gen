/**
 * Everforest 主題 - 常青森林
 * 柔和的綠色調暗色主題，舒適護眼的自然配色
 */
export default {
  name: 'everforest',
  type: 'dark',

  colors: {
    // ========================================
    // 品牌色 - Everforest Green
    // ========================================
    brandPrimary: '#a7c080', // Green
    brandPrimaryLight: '#b5d188',
    brandPrimaryDark: '#8da060',
    brandPrimaryHover: '#b5d188',
    brandAccent: '#83c092', // Aqua
    brandAccentLight: '#95d4a4',

    // ========================================
    // 背景色 - Everforest Dark
    // ========================================
    bgBase: '#2d353b', // bg0
    bgCard: '#272e33', // bg_dim
    bgElevated: '#343f44', // bg1
    bgMuted: 'rgba(211, 198, 170, 0.05)',
    bgInteractive: 'rgba(211, 198, 170, 0.08)',
    bgInteractiveHover: 'rgba(211, 198, 170, 0.12)',
    bgSubtle: 'rgba(167, 192, 128, 0.08)',
    bgOverlay: 'rgba(39, 46, 51, 0.85)',
    bgTooltip: '#272e33',
    bgGradient1: 'rgba(167, 192, 128, 0.08)',
    bgGradient2: 'rgba(131, 192, 146, 0.06)',
    bgGradient3: 'rgba(127, 187, 179, 0.05)',

    // ========================================
    // 文字色 - Everforest Foreground
    // ========================================
    textPrimary: '#d3c6aa', // fg
    textSecondary: '#c5b89a',
    textMuted: '#9da9a0', // gray1
    textInverse: '#2d353b',
    textLink: '#a7c080',
    textOnBrand: '#2d353b', // 品牌色按鈕上的文字
    textTooltip: '#F8FAFC', // Tooltip 文字（永遠亮色）

    // ========================================
    // 邊框色
    // ========================================
    borderDefault: 'rgba(211, 198, 170, 0.2)',
    borderMuted: 'rgba(211, 198, 170, 0.1)',
    borderFocus: '#a7c080',
    borderSubtle: 'rgba(211, 198, 170, 0.15)',

    // ========================================
    // 狀態色 - Everforest Colors
    // ========================================
    statusSuccess: '#a7c080', // Green
    statusSuccessMuted: 'rgba(167, 192, 128, 0.2)',
    statusSuccessSolid: '#a7c080',
    statusSuccessHover: '#8da060',
    statusError: '#e67e80', // Red
    statusErrorMuted: 'rgba(230, 126, 128, 0.2)',
    statusErrorSolid: '#e67e80',
    statusErrorHover: '#c65f61',
    statusWarning: '#e69875', // Orange
    statusWarningMuted: 'rgba(230, 152, 117, 0.2)',
    statusInfo: '#7fbbb3', // Blue/Cyan
    statusInfoMuted: 'rgba(127, 187, 179, 0.2)',
    statusInfoSolid: '#7fbbb3',
    statusInfoHover: '#5f9b93',

    // ========================================
    // 模式色（統一品牌色）
    // ========================================
    modeGenerate: '#a7c080', // = brandPrimary
    modeGenerateMuted: 'rgba(167, 192, 128, 0.2)',
    modeGenerateSolid: '#a7c080', // = brandPrimary
    modeGenerateHover: 'rgba(167, 192, 128, 0.3)',
    modeVideo: '#d699b6', // 影片模式 - Purple (Everforest)
    modeVideoMuted: 'rgba(214, 153, 182, 0.2)',

    // ========================================
    // 控制元件狀態
    // ========================================
    controlActive: '#a7c080',
    controlInactive: '#4f585e', // bg3
    controlDisabled: '#343f44',
    controlDisabledText: '#4f585e',

    // ========================================
    // 動畫/裝飾色
    // ========================================
    accentPulse: '#dbbc7f', // Yellow
    accentPulseMuted: 'rgba(219, 188, 127, 0.3)',
    accentStar: '#dbbc7f',
    accentCheckerboard: 'rgba(211, 198, 170, 0.06)',

    // ========================================
    // 玻璃效果
    // ========================================
    glassBg: 'rgba(45, 53, 59, 0.85)',
    glassBgStrong: 'rgba(45, 53, 59, 0.95)',
    glassBorder: 'rgba(211, 198, 170, 0.15)',

    // ========================================
    // 輸入框
    // ========================================
    inputBg: '#272e33',

    // ========================================
    // 漸層色
    // ========================================
    gradientBrandStart: '#8da060',
    gradientBrandMiddle: '#a7c080',
    gradientBrandEnd: '#8da060',
    gradientStepActiveStart: '#dbbc7f',
    gradientStepActiveEnd: '#e69875',
    gradientStepCompletedStart: '#a7c080',
    gradientStepCompletedEnd: '#8da060',
    gradientStepSuccessStart: '#a7c080',
    gradientStepSuccessEnd: '#83c092',
    gradientTimelineStart: 'rgba(167, 192, 128, 0.5)',
  },

  shadows: {
    glowPrimary: '0 4px 20px rgba(167, 192, 128, 0.2)',
    glowSuccess: '0 4px 16px rgba(167, 192, 128, 0.25)',
    glowGold: '0 4px 20px rgba(219, 188, 127, 0.2)',
    stepActive: '0 0 20px rgba(219, 188, 127, 0.4)',
    card: '0 4px 24px rgba(0, 0, 0, 0.25)',
  },

  metaThemeColor: '#2d353b',
}
