/**
 * Matcha Latte 主題 - 抹茶拿鐵
 * 日式抹茶綠搭配溫潤奶白色，清新自然的視覺體驗
 */
export default {
  name: 'matcha',
  type: 'light',

  colors: {
    // ========================================
    // 品牌色 - Matcha Green
    // ========================================
    brandPrimary: '#4A7C59', // Matcha Green (主抹茶色)
    brandPrimaryLight: '#5C9A6E', // Lighter matcha
    brandPrimaryDark: '#3D6B4A', // Darker matcha
    brandPrimaryHover: '#3D6B4A',
    brandAccent: '#6B8E23', // Olive Drab (茶葉調)
    brandAccentLight: '#8FBC8F', // Dark Sea Green

    // ========================================
    // 背景色 - Cream / Latte White
    // ========================================
    bgBase: '#FDFCF7', // Warm cream white (奶泡色)
    bgCard: '#FFFFFF', // Pure white cards
    bgElevated: '#F5F3E8', // Light beige elevated
    bgMuted: 'rgba(74, 124, 89, 0.05)', // Matcha mute
    bgInteractive: 'rgba(74, 124, 89, 0.08)', // Matcha tint
    bgInteractiveHover: 'rgba(74, 124, 89, 0.12)',
    bgSubtle: 'rgba(74, 124, 89, 0.06)', // Very light matcha background
    bgOverlay: 'rgba(45, 60, 48, 0.5)', // Dark green overlay
    bgTooltip: '#2D3C30', // Dark forest green for tooltips
    bgGradient1: 'rgba(74, 124, 89, 0.06)',
    bgGradient2: 'rgba(107, 142, 35, 0.05)',
    bgGradient3: 'rgba(143, 188, 143, 0.04)',

    // ========================================
    // 文字色 - Forest Tones (Enhanced contrast)
    // ========================================
    textPrimary: '#2D3C30', // Dark forest green
    textSecondary: '#3D5041', // Medium forest
    textMuted: '#5A7A5E', // Muted green (readable)
    textInverse: '#F5F3E8', // Cream white
    textLink: '#4A7C59', // Brand Primary
    textOnBrand: '#FDFCF7', // 品牌色按鈕上的文字（抹茶綠底配奶白字）
    textTooltip: '#F8FAFC', // Tooltip 文字（永遠亮色）

    // ========================================
    // 邊框色
    // ========================================
    borderDefault: 'rgba(74, 124, 89, 0.2)', // Matcha low opacity
    borderMuted: 'rgba(74, 124, 89, 0.1)',
    borderFocus: '#4A7C59',
    borderSubtle: 'rgba(74, 124, 89, 0.15)',

    // ========================================
    // 狀態色 - Natural Traffic Lights
    // ========================================
    statusSuccess: '#2E7D32', // Green-800
    statusSuccessMuted: 'rgba(16, 185, 129, 0.12)', // emerald-500
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
    modeGenerate: '#4A7C59', // = brandPrimary
    modeGenerateMuted: 'rgba(74, 124, 89, 0.12)',
    modeGenerateSolid: '#4A7C59', // = brandPrimary
    modeGenerateHover: 'rgba(74, 124, 89, 0.2)',
    modeVideo: '#7C3AED', // 影片模式 - violet-600
    modeVideoMuted: 'rgba(124, 58, 237, 0.12)',

    // ========================================
    // 控制元件狀態
    // ========================================
    controlActive: '#43A047', // Green-600
    controlInactive: '#9CAF88', // Sage green
    controlDisabled: '#E8F0E4', // Light sage
    controlDisabledText: '#9CAF88', // Sage green

    // ========================================
    // 動畫/裝飾色
    // ========================================
    accentPulse: '#8BC34A', // Light Green-500
    accentPulseMuted: 'rgba(139, 195, 74, 0.3)',
    accentStar: '#7CB342', // Light Green-600
    accentCheckerboard: 'rgba(74, 124, 89, 0.08)', // 棋盤格（抹茶色調）

    // ========================================
    // 玻璃效果
    // ========================================
    glassBg: 'rgba(253, 252, 247, 0.88)', // Cream glass
    glassBgStrong: 'rgba(253, 252, 247, 0.95)',
    glassBorder: 'rgba(74, 124, 89, 0.15)',

    // ========================================
    // 輸入框
    // ========================================
    inputBg: '#FFFFFF',

    // ========================================
    // 漸層色
    // ========================================
    gradientBrandStart: '#3D6B4A', // Dark matcha
    gradientBrandMiddle: '#4A7C59', // Matcha
    gradientBrandEnd: '#3D6B4A',
    gradientStepActiveStart: '#8BC34A', // Light Green-500
    gradientStepActiveEnd: '#4A7C59', // Matcha
    gradientStepCompletedStart: '#4A7C59',
    gradientStepCompletedEnd: '#3D6B4A',
    gradientStepSuccessStart: '#43A047', // Green-600
    gradientStepSuccessEnd: '#2E7D32', // Green-800
    gradientTimelineStart: 'rgba(74, 124, 89, 0.5)',
  },

  shadows: {
    glowPrimary: '0 4px 20px rgba(74, 124, 89, 0.15)', // Matcha glow
    glowSuccess: '0 4px 16px rgba(16, 185, 129, 0.2)', // emerald-500
    glowGold: '0 4px 20px rgba(124, 179, 66, 0.15)', // Light green glow
    stepActive: '0 0 20px rgba(139, 195, 74, 0.4)', // Light green glow
    card: '0 4px 24px rgba(45, 60, 48, 0.08)', // Forest shadow
  },

  // PWA theme-color
  metaThemeColor: '#FDFCF7',
}
