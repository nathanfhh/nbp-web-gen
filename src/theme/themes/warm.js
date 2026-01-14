/**
 * 暖色主題 - Warm Latte (暖陽白)
 * 溫暖的米白色調，搭配大地色系，營造舒適閱讀體驗
 */
export default {
  name: 'warm',
  type: 'light',

  colors: {
    // ========================================
    // 品牌色 - Vibrant Warm Orange
    // ========================================
    brandPrimary: '#F97316', // Orange-500 (Brighter)
    brandPrimaryLight: '#FB923C', // Orange-400
    brandPrimaryDark: '#EA580C', // Orange-600 (Deep but not muddy)
    brandPrimaryHover: '#EA580C',
    brandAccent: '#F59E0B', // Amber-500
    brandAccentLight: '#FBBF24', // Amber-400

    // ========================================
    // 背景色 - Warm Paper / Cream
    // ========================================
    bgBase: '#FDFBF7', // Very warm off-white (Stone-50/Yellow-50 mix)
    bgCard: '#FFFFFF', // Pure white cards stand out on cream bg
    bgElevated: '#FFFBEB', // Amber-50 (Warm elevated)
    bgMuted: 'rgba(120, 113, 108, 0.05)', // Stone gray mute
    bgInteractive: 'rgba(194, 65, 12, 0.08)', // Orange tint
    bgInteractiveHover: 'rgba(194, 65, 12, 0.12)',
    bgSubtle: 'rgba(194, 65, 12, 0.06)', // Very light orange background
    bgOverlay: 'rgba(28, 25, 23, 0.4)', // Warm dark overlay (Stone-900)
    bgTooltip: '#292524', // Stone-800 for tooltips
    bgGradient1: 'rgba(194, 65, 12, 0.06)',
    bgGradient2: 'rgba(217, 119, 6, 0.05)',
    bgGradient3: 'rgba(245, 158, 11, 0.03)',

    // ========================================
    // 文字色 - Warm Grays (Stone)
    // ========================================
    textPrimary: '#1C1917', // Stone-900 (Warm Black)
    textSecondary: '#44403C', // Stone-700 (Warm Dark Gray)
    textMuted: '#78716C', // Stone-500
    textInverse: '#FAFAF9', // Stone-50
    textLink: '#C2410C', // Brand Primary
    textOnBrand: '#1C1917', // 品牌色按鈕上的文字（橘色底配黑字）

    // ========================================
    // 邊框色
    // ========================================
    borderDefault: 'rgba(120, 113, 108, 0.2)', // Stone-500 low opacity
    borderMuted: 'rgba(120, 113, 108, 0.1)',
    borderFocus: '#C2410C',
    borderSubtle: 'rgba(194, 65, 12, 0.15)',

    // ========================================
    // 狀態色 - Warm Traffic Lights
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
    modeGenerate: '#F97316', // = brandPrimary
    modeGenerateMuted: 'rgba(249, 115, 22, 0.12)',
    modeGenerateSolid: '#F97316', // = brandPrimary
    modeGenerateHover: 'rgba(249, 115, 22, 0.2)',
    modeVideo: '#7C3AED', // 影片模式 - violet-600
    modeVideoMuted: 'rgba(124, 58, 237, 0.12)',

    // ========================================
    // 控制元件狀態
    // ========================================
    controlActive: '#15803D', // Green-700
    controlInactive: '#A8A29E', // Stone-400
    controlDisabled: '#E7E5E4', // Stone-200
    controlDisabledText: '#A8A29E', // Stone-400

    // ========================================
    // 動畫/裝飾色
    // ========================================
    accentPulse: '#F59E0B', // Amber
    accentPulseMuted: 'rgba(245, 158, 11, 0.3)',
    accentStar: '#D97706', // Amber-600
    accentCheckerboard: 'rgba(0, 0, 0, 0.05)', // 棋盤格（亮色背景用深色方塊）

    // ========================================
    // 玻璃效果
    // ========================================
    glassBg: 'rgba(255, 255, 255, 0.85)', // Warmer, less transparent
    glassBgStrong: 'rgba(255, 255, 255, 0.95)',
    glassBorder: 'rgba(120, 113, 108, 0.15)',

    // ========================================
    // 輸入框
    // ========================================
    inputBg: '#FFFFFF',

    // ========================================
    // 漸層色
    // ========================================
    gradientBrandStart: '#C2410C', // Orange-700
    gradientBrandMiddle: '#EA580C', // Orange-600
    gradientBrandEnd: '#C2410C',
    gradientStepActiveStart: '#D97706', // Amber-600
    gradientStepActiveEnd: '#EA580C', // Orange-600
    gradientStepCompletedStart: '#EA580C',
    gradientStepCompletedEnd: '#C2410C',
    gradientStepSuccessStart: '#16A34A', // Green-600
    gradientStepSuccessEnd: '#15803D', // Green-700
    gradientTimelineStart: 'rgba(194, 65, 12, 0.5)',
  },

  shadows: {
    glowPrimary: '0 4px 20px rgba(194, 65, 12, 0.15)', // Orange glow
    glowSuccess: '0 4px 16px rgba(21, 128, 61, 0.2)', // Green glow
    glowGold: '0 4px 20px rgba(217, 119, 6, 0.15)', // Amber glow
    stepActive: '0 0 20px rgba(217, 119, 6, 0.4)', // Amber glow
    card: '0 4px 24px rgba(0, 0, 0, 0.06)', // Warm light mode 卡片陰影
  },

  // PWA theme-color
  metaThemeColor: '#FDFBF7',
}
