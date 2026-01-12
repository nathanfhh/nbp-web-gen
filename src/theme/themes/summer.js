/**
 * 夏天主題 - Ocean Breeze (海洋微風)
 * 明亮清爽的海洋藍調，營造夏日活力的氛圍
 */
export default {
  name: 'summer',
  type: 'light',

  colors: {
    // ========================================
    // 品牌色 - Ocean Blue
    // ========================================
    brandPrimary: '#0EA5E9', // Sky-500 (Bright ocean blue)
    brandPrimaryLight: '#38BDF8', // Sky-400
    brandPrimaryDark: '#0284C7', // Sky-600
    brandPrimaryHover: '#0284C7',
    brandAccent: '#FBBF24', // Amber-400 (Sunshine yellow)
    brandAccentLight: '#FCD34D', // Amber-300

    // ========================================
    // 背景色 - Sky White
    // ========================================
    bgBase: '#F8FCFF', // Very light blue-tinted white
    bgCard: '#FFFFFF', // Pure white cards
    bgElevated: '#E0F2FE', // Sky-100
    bgMuted: 'rgba(14, 165, 233, 0.05)', // Blue mute
    bgInteractive: 'rgba(14, 165, 233, 0.08)', // Blue tint
    bgInteractiveHover: 'rgba(14, 165, 233, 0.12)',
    bgSubtle: 'rgba(14, 165, 233, 0.06)', // Very light blue background
    bgOverlay: 'rgba(12, 45, 72, 0.4)', // Deep ocean overlay
    bgTooltip: '#0C2D48', // Dark ocean for tooltips
    bgGradient1: 'rgba(14, 165, 233, 0.06)',
    bgGradient2: 'rgba(251, 191, 36, 0.05)',
    bgGradient3: 'rgba(56, 189, 248, 0.03)',

    // ========================================
    // 文字色 - Ocean Depths
    // ========================================
    textPrimary: '#0C2D48', // Deep ocean blue
    textSecondary: '#1E5177', // Medium ocean
    textMuted: '#4A7C9B', // Muted ocean
    textInverse: '#F8FCFF', // Light sky white
    textLink: '#0284C7', // Brand dark
    textOnBrand: '#FFFFFF', // 品牌色按鈕上的文字（藍色底配白字）

    // ========================================
    // 邊框色
    // ========================================
    borderDefault: 'rgba(74, 124, 155, 0.2)', // Ocean gray low opacity
    borderMuted: 'rgba(74, 124, 155, 0.1)',
    borderFocus: '#0EA5E9',
    borderSubtle: 'rgba(14, 165, 233, 0.2)',

    // ========================================
    // 狀態色
    // ========================================
    statusSuccess: '#15803D', // Green-700
    statusSuccessMuted: 'rgba(21, 128, 61, 0.12)',
    statusSuccessSolid: '#16A34A', // Green-600
    statusSuccessHover: '#14532D',
    statusError: '#B91C1C', // Red-700
    statusErrorMuted: 'rgba(185, 28, 28, 0.12)',
    statusErrorSolid: '#DC2626', // Red-600
    statusErrorHover: '#991B1B',
    statusWarning: '#B45309', // Amber-700
    statusWarningMuted: 'rgba(180, 83, 9, 0.12)',
    statusInfo: '#0369A1', // Sky-700
    statusInfoMuted: 'rgba(3, 105, 161, 0.12)',
    statusInfoSolid: '#0284C7', // Sky-600
    statusInfoHover: '#075985',

    // ========================================
    // 模式色（統一品牌色）
    // ========================================
    modeGenerate: '#0EA5E9', // = brandPrimary
    modeGenerateMuted: 'rgba(14, 165, 233, 0.12)',
    modeGenerateSolid: '#0EA5E9', // = brandPrimary
    modeGenerateHover: 'rgba(14, 165, 233, 0.2)',

    // ========================================
    // 控制元件狀態
    // ========================================
    controlActive: '#15803D', // Green-700
    controlInactive: '#94A3B8', // Slate-400
    controlDisabled: '#E2E8F0', // Slate-200
    controlDisabledText: '#94A3B8', // Slate-400

    // ========================================
    // 動畫/裝飾色
    // ========================================
    accentPulse: '#FBBF24', // Sunshine yellow
    accentPulseMuted: 'rgba(251, 191, 36, 0.3)',
    accentStar: '#FCD34D', // Light yellow
    accentCheckerboard: 'rgba(0, 0, 0, 0.05)', // 棋盤格

    // ========================================
    // 玻璃效果
    // ========================================
    glassBg: 'rgba(255, 255, 255, 0.85)',
    glassBgStrong: 'rgba(255, 255, 255, 0.95)',
    glassBorder: 'rgba(74, 124, 155, 0.15)',

    // ========================================
    // 輸入框
    // ========================================
    inputBg: '#FFFFFF',

    // ========================================
    // 漸層色
    // ========================================
    gradientBrandStart: '#0284C7', // Sky-600
    gradientBrandMiddle: '#0EA5E9', // Sky-500
    gradientBrandEnd: '#0284C7',
    gradientStepActiveStart: '#FBBF24', // Amber
    gradientStepActiveEnd: '#0EA5E9', // Sky
    gradientStepCompletedStart: '#0EA5E9',
    gradientStepCompletedEnd: '#0284C7',
    gradientStepSuccessStart: '#16A34A', // Green-600
    gradientStepSuccessEnd: '#15803D', // Green-700
    gradientTimelineStart: 'rgba(14, 165, 233, 0.5)',
  },

  shadows: {
    glowPrimary: '0 4px 20px rgba(14, 165, 233, 0.2)', // Ocean glow
    glowSuccess: '0 4px 16px rgba(21, 128, 61, 0.2)', // Green glow
    glowGold: '0 4px 20px rgba(251, 191, 36, 0.2)', // Sunshine glow
    stepActive: '0 0 20px rgba(251, 191, 36, 0.4)', // Yellow glow
    card: '0 4px 24px rgba(0, 0, 0, 0.06)', // Light mode 卡片陰影
  },

  // PWA theme-color
  metaThemeColor: '#F8FCFF',
}
