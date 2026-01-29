/**
 * 春天主題 - Cherry Blossom (櫻花)
 * 清新溫柔的櫻花粉調，營造春日新生的氛圍
 */
export default {
  name: 'spring',
  type: 'light',

  colors: {
    // ========================================
    // 品牌色 - Cherry Blossom Pink
    // ========================================
    brandPrimary: '#EC8CA8', // Sakura Pink
    brandPrimaryLight: '#F4A8BC', // Lighter sakura
    brandPrimaryDark: '#D66A8A', // Deeper rose
    brandPrimaryHover: '#D66A8A',
    brandAccent: '#A8D5BA', // Fresh mint green (spring leaves)
    brandAccentLight: '#C4E5CF',

    // ========================================
    // 背景色 - Soft Petal White
    // ========================================
    bgBase: '#FDF8F9', // Very soft pink-tinted white
    bgCard: '#FFFFFF', // Pure white cards
    bgElevated: '#FFF0F3', // Light pink elevated
    bgMuted: 'rgba(236, 140, 168, 0.05)', // Pink mute
    bgInteractive: 'rgba(236, 140, 168, 0.08)', // Pink tint
    bgInteractiveHover: 'rgba(236, 140, 168, 0.12)',
    bgSubtle: 'rgba(236, 140, 168, 0.06)', // Very light pink background
    bgOverlay: 'rgba(45, 35, 38, 0.4)', // Warm dark overlay
    bgTooltip: '#3D2F32', // Dark warm brown for tooltips
    bgGradient1: 'rgba(236, 140, 168, 0.06)',
    bgGradient2: 'rgba(168, 213, 186, 0.05)',
    bgGradient3: 'rgba(244, 168, 188, 0.03)',

    // ========================================
    // 文字色 - Warm Browns
    // ========================================
    textPrimary: '#2D2326', // Warm dark brown
    textSecondary: '#4A3F42', // Medium warm brown
    textMuted: '#7A6D70', // Muted warm
    textInverse: '#FDF8F9', // Light pink white
    textLink: '#D66A8A', // Brand dark
    textOnBrand: '#FFFFFF', // 品牌色按鈕上的文字（粉色底配白字）
    textTooltip: '#F8FAFC', // Tooltip 文字（永遠亮色）

    // ========================================
    // 邊框色
    // ========================================
    borderDefault: 'rgba(122, 109, 112, 0.2)', // Warm gray low opacity
    borderMuted: 'rgba(122, 109, 112, 0.1)',
    borderFocus: '#EC8CA8',
    borderSubtle: 'rgba(236, 140, 168, 0.2)',

    // ========================================
    // 狀態色
    // ========================================
    statusSuccess: '#2E7D4A', // Green-700
    statusSuccessMuted: 'rgba(16, 185, 129, 0.12)', // emerald-500
    statusSuccessSolid: '#3D9A5C', // Green-600
    statusSuccessHover: '#1F5C35',
    statusError: '#C53030', // Red-700
    statusErrorMuted: 'rgba(197, 48, 48, 0.12)',
    statusErrorSolid: '#E53E3E', // Red-600
    statusErrorHover: '#9B2C2C',
    statusWarning: '#B7791F', // Yellow-700
    statusWarningMuted: 'rgba(183, 121, 31, 0.12)',
    statusInfo: '#2B6CB0', // Blue-700
    statusInfoMuted: 'rgba(43, 108, 176, 0.12)',
    statusInfoSolid: '#3182CE', // Blue-600
    statusInfoHover: '#2C5282',

    // ========================================
    // 模式色（統一品牌色）
    // ========================================
    modeGenerate: '#EC8CA8', // = brandPrimary
    modeGenerateMuted: 'rgba(236, 140, 168, 0.12)',
    modeGenerateSolid: '#EC8CA8', // = brandPrimary
    modeGenerateHover: 'rgba(236, 140, 168, 0.2)',
    modeVideo: '#7C3AED', // 影片模式 - violet-600
    modeVideoMuted: 'rgba(124, 58, 237, 0.12)',

    // ========================================
    // 控制元件狀態
    // ========================================
    controlActive: '#2E7D4A', // Green-700
    controlInactive: '#A89A9D', // Warm gray
    controlDisabled: '#EDE7E8', // Light warm gray
    controlDisabledText: '#A89A9D',

    // ========================================
    // 動畫/裝飾色
    // ========================================
    accentPulse: '#A8D5BA', // Mint green
    accentPulseMuted: 'rgba(168, 213, 186, 0.3)',
    accentStar: '#F4A8BC', // Light sakura
    accentCheckerboard: 'rgba(0, 0, 0, 0.05)', // 棋盤格

    // ========================================
    // 玻璃效果
    // ========================================
    glassBg: 'rgba(255, 255, 255, 0.85)',
    glassBgStrong: 'rgba(255, 255, 255, 0.95)',
    glassBorder: 'rgba(122, 109, 112, 0.15)',

    // ========================================
    // 輸入框
    // ========================================
    inputBg: '#FFFFFF',

    // ========================================
    // 漸層色
    // ========================================
    gradientBrandStart: '#D66A8A', // Deeper rose
    gradientBrandMiddle: '#EC8CA8', // Sakura
    gradientBrandEnd: '#D66A8A',
    gradientStepActiveStart: '#A8D5BA', // Mint
    gradientStepActiveEnd: '#EC8CA8', // Sakura
    gradientStepCompletedStart: '#EC8CA8',
    gradientStepCompletedEnd: '#D66A8A',
    gradientStepSuccessStart: '#3D9A5C', // Green-600
    gradientStepSuccessEnd: '#2E7D4A', // Green-700
    gradientTimelineStart: 'rgba(236, 140, 168, 0.5)',
  },

  shadows: {
    glowPrimary: '0 4px 20px rgba(236, 140, 168, 0.2)', // Sakura glow
    glowSuccess: '0 4px 16px rgba(16, 185, 129, 0.2)', // emerald-500
    glowGold: '0 4px 20px rgba(168, 213, 186, 0.2)', // Mint glow
    stepActive: '0 0 20px rgba(168, 213, 186, 0.4)', // Mint glow
    card: '0 4px 24px rgba(0, 0, 0, 0.06)', // Light mode 卡片陰影
  },

  // PWA theme-color
  metaThemeColor: '#FDF8F9',
}
