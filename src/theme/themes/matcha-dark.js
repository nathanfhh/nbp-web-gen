/**
 * Matcha Dark 主題 - 深抹茶
 * 深色版抹茶主題，濃郁的日式抹茶綠調
 */
export default {
  name: 'matcha-dark',
  type: 'dark',

  colors: {
    // ========================================
    // 品牌色 - Matcha Green
    // ========================================
    brandPrimary: '#7fb069', // Bright Matcha
    brandPrimaryLight: '#95c47d',
    brandPrimaryDark: '#5a8a4a',
    brandPrimaryHover: '#95c47d',
    brandAccent: '#8fbc8f', // Dark Sea Green
    brandAccentLight: '#a8d4a8',

    // ========================================
    // 背景色 - Dark Forest
    // ========================================
    bgBase: '#1a241a', // Deep forest black
    bgCard: '#151d15', // Darker
    bgElevated: '#243024', // Elevated forest
    bgMuted: 'rgba(127, 176, 105, 0.06)',
    bgInteractive: 'rgba(127, 176, 105, 0.1)',
    bgInteractiveHover: 'rgba(127, 176, 105, 0.15)',
    bgSubtle: 'rgba(127, 176, 105, 0.08)',
    bgOverlay: 'rgba(21, 29, 21, 0.85)',
    bgTooltip: '#151d15',
    bgGradient1: 'rgba(127, 176, 105, 0.08)',
    bgGradient2: 'rgba(143, 188, 143, 0.06)',
    bgGradient3: 'rgba(107, 142, 35, 0.05)',

    // ========================================
    // 文字色
    // ========================================
    textPrimary: '#e8f0e4', // Light sage
    textSecondary: '#c8dcc0',
    textMuted: '#9cb893', // Muted green
    textInverse: '#1a241a',
    textLink: '#95c47d',
    textOnBrand: '#1a241a', // 品牌色按鈕上的文字

    // ========================================
    // 邊框色
    // ========================================
    borderDefault: 'rgba(127, 176, 105, 0.25)',
    borderMuted: 'rgba(127, 176, 105, 0.12)',
    borderFocus: '#7fb069',
    borderSubtle: 'rgba(127, 176, 105, 0.18)',

    // ========================================
    // 狀態色
    // ========================================
    statusSuccess: '#7fb069', // Matcha Green
    statusSuccessMuted: 'rgba(127, 176, 105, 0.2)',
    statusSuccessSolid: '#95c47d',
    statusSuccessHover: '#5a8a4a',
    statusError: '#e57373', // Soft Red
    statusErrorMuted: 'rgba(229, 115, 115, 0.2)',
    statusErrorSolid: '#ef5350',
    statusErrorHover: '#c54949',
    statusWarning: '#ffb74d', // Warm Orange
    statusWarningMuted: 'rgba(255, 183, 77, 0.2)',
    statusInfo: '#4fc3f7', // Light Blue
    statusInfoMuted: 'rgba(79, 195, 247, 0.2)',
    statusInfoSolid: '#29b6f6',
    statusInfoHover: '#0288d1',

    // ========================================
    // 模式色（統一品牌色）
    // ========================================
    modeGenerate: '#95c47d', // = brandPrimaryLight
    modeGenerateMuted: 'rgba(127, 176, 105, 0.2)',
    modeGenerateSolid: '#7fb069', // = brandPrimary
    modeGenerateHover: 'rgba(127, 176, 105, 0.3)',

    // ========================================
    // 控制元件狀態
    // ========================================
    controlActive: '#95c47d',
    controlInactive: '#3d503d',
    controlDisabled: '#243024',
    controlDisabledText: '#3d503d',

    // ========================================
    // 動畫/裝飾色
    // ========================================
    accentPulse: '#aed581', // Light Green
    accentPulseMuted: 'rgba(174, 213, 129, 0.3)',
    accentStar: '#c5e1a5', // Lighter Green
    accentCheckerboard: 'rgba(127, 176, 105, 0.08)',

    // ========================================
    // 玻璃效果
    // ========================================
    glassBg: 'rgba(26, 36, 26, 0.88)',
    glassBgStrong: 'rgba(26, 36, 26, 0.95)',
    glassBorder: 'rgba(127, 176, 105, 0.2)',

    // ========================================
    // 輸入框
    // ========================================
    inputBg: '#151d15',

    // ========================================
    // 漸層色
    // ========================================
    gradientBrandStart: '#5a8a4a',
    gradientBrandMiddle: '#7fb069',
    gradientBrandEnd: '#5a8a4a',
    gradientStepActiveStart: '#aed581',
    gradientStepActiveEnd: '#7fb069',
    gradientStepCompletedStart: '#7fb069',
    gradientStepCompletedEnd: '#5a8a4a',
    gradientStepSuccessStart: '#95c47d',
    gradientStepSuccessEnd: '#7fb069',
    gradientTimelineStart: 'rgba(127, 176, 105, 0.5)',
  },

  shadows: {
    glowPrimary: '0 4px 20px rgba(127, 176, 105, 0.2)',
    glowSuccess: '0 4px 16px rgba(127, 176, 105, 0.25)',
    glowGold: '0 4px 20px rgba(174, 213, 129, 0.2)',
    stepActive: '0 0 20px rgba(174, 213, 129, 0.4)',
    card: '0 4px 24px rgba(0, 0, 0, 0.3)',
  },

  metaThemeColor: '#1a241a',
}
