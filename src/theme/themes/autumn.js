/**
 * 秋天主題 - Maple Harvest (楓葉收穫)
 * 溫暖沉穩的楓葉橘紅調，營造秋日豐收的氛圍
 */
export default {
  name: 'autumn',
  type: 'dark',

  colors: {
    // ========================================
    // 品牌色 - Maple Orange-Red
    // ========================================
    brandPrimary: '#E27D60', // Maple leaf coral
    brandPrimaryLight: '#EDA08A', // Lighter maple
    brandPrimaryDark: '#C9644A', // Deeper rust
    brandPrimaryHover: '#C9644A',
    brandAccent: '#D4A574', // Golden wheat
    brandAccentLight: '#E5C9A8', // Light wheat

    // ========================================
    // 背景色 - Deep Forest Brown
    // ========================================
    bgBase: '#1A1412', // Very dark warm brown
    bgCard: 'rgba(58, 42, 35, 0.6)', // Brown translucent
    bgElevated: '#2D221C', // Dark brown elevated
    bgMuted: 'rgba(226, 125, 96, 0.05)', // Maple mute
    bgInteractive: 'rgba(226, 125, 96, 0.1)', // Maple tint
    bgInteractiveHover: 'rgba(226, 125, 96, 0.15)',
    bgSubtle: 'rgba(226, 125, 96, 0.08)', // Subtle maple background
    bgOverlay: 'rgba(0, 0, 0, 0.6)', // Dark overlay
    bgTooltip: '#3A2A23', // Warm brown for tooltips
    bgGradient1: 'rgba(226, 125, 96, 0.1)',
    bgGradient2: 'rgba(212, 165, 116, 0.08)',
    bgGradient3: 'rgba(201, 100, 74, 0.06)',

    // ========================================
    // 文字色 - Warm Cream
    // ========================================
    textPrimary: '#FAF0E6', // Warm linen white
    textSecondary: '#E8DDD2', // Cream
    textMuted: '#BDA99A', // Muted brown
    textInverse: '#1A1412', // Dark base
    textLink: '#EDA08A', // Light maple
    textOnBrand: '#1A1412', // 品牌色按鈕上的文字（橘色底配深字）
    textTooltip: '#F8FAFC', // Tooltip 文字（永遠亮色）

    // ========================================
    // 邊框色
    // ========================================
    borderDefault: 'rgba(189, 169, 154, 0.25)', // Warm border
    borderMuted: 'rgba(189, 169, 154, 0.15)',
    borderFocus: '#E27D60',
    borderSubtle: 'rgba(226, 125, 96, 0.3)',

    // ========================================
    // 狀態色 - Autumn-tinted
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
    statusInfo: '#81D4FA', // Light Blue-200
    statusInfoMuted: 'rgba(129, 212, 250, 0.2)',
    statusInfoSolid: '#4FC3F7', // Light Blue-300
    statusInfoHover: '#29B6F6',

    // ========================================
    // 模式色（統一品牌色）
    // ========================================
    modeGenerate: '#EDA08A', // = brandPrimaryLight
    modeGenerateMuted: 'rgba(226, 125, 96, 0.2)',
    modeGenerateSolid: '#E27D60', // = brandPrimary
    modeGenerateHover: 'rgba(226, 125, 96, 0.35)',
    modeVideo: '#C4B5FD', // 影片模式 - violet-300
    modeVideoMuted: 'rgba(196, 181, 253, 0.2)',

    // ========================================
    // 控制元件狀態
    // ========================================
    controlActive: '#66BB6A', // Green-400
    controlInactive: '#5D4B42', // Dark brown
    controlDisabled: '#3A2A23', // Darker brown
    controlDisabledText: '#8D7A6E', // Muted brown

    // ========================================
    // 動畫/裝飾色
    // ========================================
    accentPulse: '#D4A574', // Golden wheat
    accentPulseMuted: 'rgba(212, 165, 116, 0.3)',
    accentStar: '#FFD54F', // Amber-300
    accentCheckerboard: 'rgba(250, 240, 230, 0.1)', // 棋盤格（深色背景用淺色）

    // ========================================
    // 玻璃效果
    // ========================================
    glassBg: 'rgba(58, 42, 35, 0.4)', // Brown glass
    glassBgStrong: 'rgba(26, 20, 18, 0.75)',
    glassBorder: 'rgba(189, 169, 154, 0.15)',

    // ========================================
    // 輸入框
    // ========================================
    inputBg: 'rgba(58, 42, 35, 0.6)',

    // ========================================
    // 漸層色
    // ========================================
    gradientBrandStart: '#C9644A', // Rust
    gradientBrandMiddle: '#E27D60', // Maple
    gradientBrandEnd: '#C9644A',
    gradientStepActiveStart: '#D4A574', // Wheat
    gradientStepActiveEnd: '#E27D60', // Maple
    gradientStepCompletedStart: '#E27D60',
    gradientStepCompletedEnd: '#C9644A',
    gradientStepSuccessStart: '#81C784', // Green-300
    gradientStepSuccessEnd: '#66BB6A', // Green-400
    gradientTimelineStart: 'rgba(226, 125, 96, 0.5)',
  },

  shadows: {
    glowPrimary: '0 4px 20px rgba(226, 125, 96, 0.25)', // Maple glow
    glowSuccess: '0 4px 16px rgba(102, 187, 106, 0.25)', // Green glow
    glowGold: '0 4px 20px rgba(212, 165, 116, 0.25)', // Wheat glow
    stepActive: '0 0 20px rgba(212, 165, 116, 0.4)', // Wheat glow
    card: 'none', // Dark mode 不需要卡片陰影
  },

  // PWA theme-color
  metaThemeColor: '#1A1412',
}
