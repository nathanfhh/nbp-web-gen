/**
 * Espresso 主題 - 濃縮咖啡
 * 深咖啡色品牌搭配淺黃奶油色背景，復古溫潤的閱讀體驗
 */
export default {
  name: 'espresso',
  type: 'light',

  colors: {
    // ========================================
    // 品牌色 - Deep Coffee Brown
    // ========================================
    brandPrimary: '#5D4037', // Brown-700 (Deep Espresso)
    brandPrimaryLight: '#795548', // Brown-500
    brandPrimaryDark: '#4E342E', // Brown-800
    brandPrimaryHover: '#4E342E',
    brandAccent: '#6D4C41', // Brown-600
    brandAccentLight: '#8D6E63', // Brown-400

    // ========================================
    // 背景色 - Cream / Parchment Yellow
    // ========================================
    bgBase: '#FFFDF5', // Warm cream white
    bgCard: '#FFFFFF', // Pure white cards
    bgElevated: '#FFF8E7', // Light yellow elevated
    bgMuted: 'rgba(93, 64, 55, 0.05)', // Coffee mute
    bgInteractive: 'rgba(93, 64, 55, 0.08)', // Coffee tint
    bgInteractiveHover: 'rgba(93, 64, 55, 0.12)',
    bgSubtle: 'rgba(93, 64, 55, 0.06)', // Very light coffee background
    bgOverlay: 'rgba(62, 39, 35, 0.5)', // Coffee dark overlay
    bgTooltip: '#3E2723', // Brown-900 for tooltips
    bgGradient1: 'rgba(93, 64, 55, 0.06)',
    bgGradient2: 'rgba(109, 76, 65, 0.05)',
    bgGradient3: 'rgba(161, 136, 127, 0.04)',

    // ========================================
    // 文字色 - Coffee Tones (Enhanced contrast)
    // ========================================
    textPrimary: '#3E2723', // Brown-900 (Deep Coffee)
    textSecondary: '#4E342E', // Brown-800 (Darker for better contrast)
    textMuted: '#6D4C41', // Brown-600 (Darker for readability)
    textInverse: '#FFF8E1', // Cream white
    textLink: '#5D4037', // Brand Primary
    textOnBrand: '#FFFDF5', // 品牌色按鈕上的文字（咖啡色底配奶油白字）

    // ========================================
    // 邊框色
    // ========================================
    borderDefault: 'rgba(93, 64, 55, 0.2)', // Coffee low opacity
    borderMuted: 'rgba(93, 64, 55, 0.1)',
    borderFocus: '#5D4037',
    borderSubtle: 'rgba(93, 64, 55, 0.15)',

    // ========================================
    // 狀態色 - Warm Traffic Lights
    // ========================================
    statusSuccess: '#2E7D32', // Green-800
    statusSuccessMuted: 'rgba(46, 125, 50, 0.12)',
    statusSuccessSolid: '#43A047', // Green-600
    statusSuccessHover: '#1B5E20',
    statusError: '#C62828', // Red-800
    statusErrorMuted: 'rgba(198, 40, 40, 0.12)',
    statusErrorSolid: '#E53935', // Red-600
    statusErrorHover: '#B71C1C',
    statusWarning: '#E65100', // Orange-900
    statusWarningMuted: 'rgba(230, 81, 0, 0.12)',
    statusInfo: '#0277BD', // Light Blue-800
    statusInfoMuted: 'rgba(2, 119, 189, 0.12)',
    statusInfoSolid: '#039BE5', // Light Blue-600
    statusInfoHover: '#01579B',

    // ========================================
    // 模式色（統一品牌色）
    // ========================================
    modeGenerate: '#5D4037', // = brandPrimary
    modeGenerateMuted: 'rgba(93, 64, 55, 0.12)',
    modeGenerateSolid: '#5D4037', // = brandPrimary
    modeGenerateHover: 'rgba(93, 64, 55, 0.2)',

    // ========================================
    // 控制元件狀態
    // ========================================
    controlActive: '#43A047', // Green-600
    controlInactive: '#A1887F', // Brown-300
    controlDisabled: '#EFEBE9', // Brown-50
    controlDisabledText: '#A1887F', // Brown-300

    // ========================================
    // 動畫/裝飾色
    // ========================================
    accentPulse: '#FFA000', // Amber-700
    accentPulseMuted: 'rgba(255, 160, 0, 0.3)',
    accentStar: '#FF8F00', // Amber-800
    accentCheckerboard: 'rgba(93, 64, 55, 0.08)', // 棋盤格（咖啡色調）

    // ========================================
    // 玻璃效果
    // ========================================
    glassBg: 'rgba(255, 253, 245, 0.88)', // Cream glass
    glassBgStrong: 'rgba(255, 253, 245, 0.95)',
    glassBorder: 'rgba(93, 64, 55, 0.15)',

    // ========================================
    // 輸入框
    // ========================================
    inputBg: '#FFFFFF',

    // ========================================
    // 漸層色
    // ========================================
    gradientBrandStart: '#4E342E', // Brown-800
    gradientBrandMiddle: '#5D4037', // Brown-700
    gradientBrandEnd: '#4E342E',
    gradientStepActiveStart: '#FFA000', // Amber-700
    gradientStepActiveEnd: '#5D4037', // Brown-700
    gradientStepCompletedStart: '#5D4037',
    gradientStepCompletedEnd: '#4E342E',
    gradientStepSuccessStart: '#43A047', // Green-600
    gradientStepSuccessEnd: '#2E7D32', // Green-800
    gradientTimelineStart: 'rgba(93, 64, 55, 0.5)',
  },

  shadows: {
    glowPrimary: '0 4px 20px rgba(93, 64, 55, 0.15)', // Coffee glow
    glowSuccess: '0 4px 16px rgba(46, 125, 50, 0.2)', // Green glow
    glowGold: '0 4px 20px rgba(255, 143, 0, 0.15)', // Amber glow
    stepActive: '0 0 20px rgba(255, 160, 0, 0.4)', // Amber glow
    card: '0 4px 24px rgba(62, 39, 35, 0.08)', // Coffee shadow
  },

  // PWA theme-color
  metaThemeColor: '#FFFDF5',
}
