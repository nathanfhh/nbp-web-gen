/**
 * Mocha 主題 - 摩卡深焙
 * Espresso 的深色版本，深咖啡色背景搭配奶油色文字
 */
export default {
  name: 'mocha',
  type: 'dark',

  colors: {
    // ========================================
    // 品牌色 - Warm Coffee Brown (brightened for dark bg)
    // ========================================
    brandPrimary: '#A1887F', // Brown-300 (Lighter for visibility)
    brandPrimaryLight: '#BCAAA4', // Brown-200
    brandPrimaryDark: '#8D6E63', // Brown-400
    brandPrimaryHover: '#8D6E63',
    brandAccent: '#FFAB91', // Deep Orange-200 (warm accent)
    brandAccentLight: '#FFCCBC', // Deep Orange-100

    // ========================================
    // 背景色 - Deep Coffee layers
    // ========================================
    bgBase: '#1C1210', // Very dark brown (almost black)
    bgCard: 'rgba(62, 39, 35, 0.6)', // Brown-900 translucent
    bgElevated: '#3E2723', // Brown-900
    bgMuted: 'rgba(255, 248, 225, 0.05)', // Cream mute
    bgInteractive: 'rgba(255, 248, 225, 0.08)', // Cream tint
    bgInteractiveHover: 'rgba(255, 248, 225, 0.12)',
    bgSubtle: 'rgba(161, 136, 127, 0.15)', // Coffee subtle
    bgOverlay: 'rgba(0, 0, 0, 0.6)', // Dark overlay
    bgTooltip: '#4E342E', // Brown-800
    bgGradient1: 'rgba(141, 110, 99, 0.12)',
    bgGradient2: 'rgba(161, 136, 127, 0.08)',
    bgGradient3: 'rgba(121, 85, 72, 0.06)',

    // ========================================
    // 文字色 - Cream / Warm whites
    // ========================================
    textPrimary: '#FFF8E1', // Amber-50 (Warm cream)
    textSecondary: '#EFEBE9', // Brown-50
    textMuted: '#BCAAA4', // Brown-200
    textInverse: '#3E2723', // Brown-900
    textLink: '#FFAB91', // Deep Orange-200
    textOnBrand: '#3E2723', // 品牌色按鈕上的文字（淺咖啡底配深字）

    // ========================================
    // 邊框色
    // ========================================
    borderDefault: 'rgba(188, 170, 164, 0.25)', // Brown-200 low opacity
    borderMuted: 'rgba(188, 170, 164, 0.15)',
    borderFocus: '#A1887F',
    borderSubtle: 'rgba(161, 136, 127, 0.3)',

    // ========================================
    // 狀態色 - Warm-tinted status colors
    // ========================================
    statusSuccess: '#81C784', // Green-300
    statusSuccessMuted: 'rgba(129, 199, 132, 0.2)',
    statusSuccessSolid: '#66BB6A', // Green-400
    statusSuccessHover: '#4CAF50',
    statusError: '#EF9A9A', // Red-200
    statusErrorMuted: 'rgba(239, 154, 154, 0.2)',
    statusErrorSolid: '#EF5350', // Red-400
    statusErrorHover: '#E53935',
    statusWarning: '#FFE082', // Amber-200
    statusWarningMuted: 'rgba(255, 224, 130, 0.2)',
    statusInfo: '#80DEEA', // Cyan-200
    statusInfoMuted: 'rgba(128, 222, 234, 0.2)',
    statusInfoSolid: '#26C6DA', // Cyan-400
    statusInfoHover: '#00BCD4',

    // ========================================
    // 模式色 (Warm-tinted for dark bg)
    // ========================================
    modeGenerate: '#BCAAA4', // Brown-200 (Brand)
    modeGenerateMuted: 'rgba(188, 170, 164, 0.2)',
    modeGenerateHover: 'rgba(188, 170, 164, 0.35)',
    modeSticker: '#F48FB1', // Pink-200
    modeStickerMuted: 'rgba(244, 143, 177, 0.2)',
    modeStickerSolid: '#EC407A', // Pink-400
    modeEdit: '#CE93D8', // Purple-200
    modeEditMuted: 'rgba(206, 147, 216, 0.2)',
    modeStory: '#FFCC80', // Orange-200
    modeStoryMuted: 'rgba(255, 204, 128, 0.2)',
    modeDiagram: '#80CBC4', // Teal-200
    modeDiagramMuted: 'rgba(128, 203, 196, 0.2)',

    // ========================================
    // 控制元件狀態
    // ========================================
    controlActive: '#66BB6A', // Green-400
    controlInactive: '#5D4037', // Brown-700
    controlDisabled: '#4E342E', // Brown-800
    controlDisabledText: '#8D6E63', // Brown-400

    // ========================================
    // 動畫/裝飾色
    // ========================================
    accentPulse: '#FFAB91', // Deep Orange-200
    accentPulseMuted: 'rgba(255, 171, 145, 0.3)',
    accentStar: '#FFD54F', // Amber-300
    accentCheckerboard: 'rgba(255, 248, 225, 0.1)', // 棋盤格（深色背景用淺色方塊）

    // ========================================
    // 玻璃效果
    // ========================================
    glassBg: 'rgba(62, 39, 35, 0.4)', // Coffee glass
    glassBgStrong: 'rgba(28, 18, 16, 0.75)',
    glassBorder: 'rgba(188, 170, 164, 0.15)',

    // ========================================
    // 輸入框
    // ========================================
    inputBg: 'rgba(62, 39, 35, 0.6)',

    // ========================================
    // 漸層色
    // ========================================
    gradientBrandStart: '#8D6E63', // Brown-400
    gradientBrandMiddle: '#A1887F', // Brown-300
    gradientBrandEnd: '#8D6E63',
    gradientStepActiveStart: '#FFAB91', // Deep Orange-200
    gradientStepActiveEnd: '#A1887F', // Brown-300
    gradientStepCompletedStart: '#A1887F',
    gradientStepCompletedEnd: '#8D6E63',
    gradientStepSuccessStart: '#81C784', // Green-300
    gradientStepSuccessEnd: '#66BB6A', // Green-400
    gradientTimelineStart: 'rgba(161, 136, 127, 0.5)',
  },

  shadows: {
    glowPrimary: '0 4px 20px rgba(161, 136, 127, 0.2)', // Coffee glow
    glowSuccess: '0 4px 16px rgba(102, 187, 106, 0.25)', // Green glow
    glowGold: '0 4px 20px rgba(255, 213, 79, 0.2)', // Amber glow
    stepActive: '0 0 20px rgba(255, 171, 145, 0.4)', // Orange glow
    card: 'none', // Dark mode 不需要卡片陰影
  },

  // PWA theme-color
  metaThemeColor: '#1C1210',
}
