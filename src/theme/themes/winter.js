/**
 * 冬天主題 - Polar Night (極夜星空)
 * 冷靜深邃的冰晶藍調，營造冬日寧靜的氛圍
 */
export default {
  name: 'winter',
  type: 'dark',

  colors: {
    // ========================================
    // 品牌色 - Ice Crystal Blue
    // ========================================
    brandPrimary: '#7DD3FC', // Sky-300 (Ice blue)
    brandPrimaryLight: '#BAE6FD', // Sky-200
    brandPrimaryDark: '#38BDF8', // Sky-400
    brandPrimaryHover: '#38BDF8',
    brandAccent: '#A78BFA', // Violet-400 (Aurora purple)
    brandAccentLight: '#C4B5FD', // Violet-300

    // ========================================
    // 背景色 - Deep Polar Night
    // ========================================
    bgBase: '#0B1120', // Very dark blue-black (night sky)
    bgCard: 'rgba(30, 41, 59, 0.6)', // Slate-800 translucent
    bgElevated: '#1E293B', // Slate-800
    bgMuted: 'rgba(125, 211, 252, 0.05)', // Ice mute
    bgInteractive: 'rgba(125, 211, 252, 0.08)', // Ice tint
    bgInteractiveHover: 'rgba(125, 211, 252, 0.12)',
    bgSubtle: 'rgba(125, 211, 252, 0.06)', // Subtle ice background
    bgOverlay: 'rgba(0, 0, 0, 0.6)', // Dark overlay
    bgTooltip: '#1E293B', // Slate-800 for tooltips
    bgGradient1: 'rgba(125, 211, 252, 0.08)',
    bgGradient2: 'rgba(167, 139, 250, 0.06)',
    bgGradient3: 'rgba(56, 189, 248, 0.04)',

    // ========================================
    // 文字色 - Frost White
    // ========================================
    textPrimary: '#F1F5F9', // Slate-100 (Pure frost)
    textSecondary: '#E2E8F0', // Slate-200
    textMuted: '#94A3B8', // Slate-400
    textInverse: '#0B1120', // Dark base
    textLink: '#BAE6FD', // Light ice
    textOnBrand: '#0B1120', // 品牌色按鈕上的文字（冰藍底配深字）

    // ========================================
    // 邊框色
    // ========================================
    borderDefault: 'rgba(148, 163, 184, 0.25)', // Slate-400 low opacity
    borderMuted: 'rgba(148, 163, 184, 0.15)',
    borderFocus: '#7DD3FC',
    borderSubtle: 'rgba(125, 211, 252, 0.3)',

    // ========================================
    // 狀態色 - Cool-tinted
    // ========================================
    statusSuccess: '#86EFAC', // Green-300
    statusSuccessMuted: 'rgba(134, 239, 172, 0.2)',
    statusSuccessSolid: '#4ADE80', // Green-400
    statusSuccessHover: '#22C55E',
    statusError: '#FCA5A5', // Red-300
    statusErrorMuted: 'rgba(252, 165, 165, 0.2)',
    statusErrorSolid: '#F87171', // Red-400
    statusErrorHover: '#EF4444',
    statusWarning: '#FDE68A', // Amber-200
    statusWarningMuted: 'rgba(253, 230, 138, 0.2)',
    statusInfo: '#7DD3FC', // Sky-300
    statusInfoMuted: 'rgba(125, 211, 252, 0.2)',
    statusInfoSolid: '#38BDF8', // Sky-400
    statusInfoHover: '#0EA5E9',

    // ========================================
    // 模式色（統一品牌色）
    // ========================================
    modeGenerate: '#BAE6FD', // = brandPrimaryLight
    modeGenerateMuted: 'rgba(125, 211, 252, 0.2)',
    modeGenerateSolid: '#7DD3FC', // = brandPrimary
    modeGenerateHover: 'rgba(125, 211, 252, 0.35)',

    // ========================================
    // 控制元件狀態
    // ========================================
    controlActive: '#4ADE80', // Green-400
    controlInactive: '#475569', // Slate-600
    controlDisabled: '#334155', // Slate-700
    controlDisabledText: '#64748B', // Slate-500

    // ========================================
    // 動畫/裝飾色
    // ========================================
    accentPulse: '#A78BFA', // Aurora purple
    accentPulseMuted: 'rgba(167, 139, 250, 0.3)',
    accentStar: '#E0E7FF', // Indigo-100 (Starlight)
    accentCheckerboard: 'rgba(241, 245, 249, 0.1)', // 棋盤格（深色背景用淺色）

    // ========================================
    // 玻璃效果
    // ========================================
    glassBg: 'rgba(30, 41, 59, 0.4)', // Slate glass
    glassBgStrong: 'rgba(11, 17, 32, 0.75)',
    glassBorder: 'rgba(148, 163, 184, 0.15)',

    // ========================================
    // 輸入框
    // ========================================
    inputBg: 'rgba(30, 41, 59, 0.6)',

    // ========================================
    // 漸層色
    // ========================================
    gradientBrandStart: '#38BDF8', // Sky-400
    gradientBrandMiddle: '#7DD3FC', // Sky-300
    gradientBrandEnd: '#38BDF8',
    gradientStepActiveStart: '#A78BFA', // Aurora
    gradientStepActiveEnd: '#7DD3FC', // Ice
    gradientStepCompletedStart: '#7DD3FC',
    gradientStepCompletedEnd: '#38BDF8',
    gradientStepSuccessStart: '#86EFAC', // Green-300
    gradientStepSuccessEnd: '#4ADE80', // Green-400
    gradientTimelineStart: 'rgba(125, 211, 252, 0.5)',
  },

  shadows: {
    glowPrimary: '0 4px 20px rgba(125, 211, 252, 0.2)', // Ice glow
    glowSuccess: '0 4px 16px rgba(74, 222, 128, 0.25)', // Green glow
    glowGold: '0 4px 20px rgba(167, 139, 250, 0.2)', // Aurora glow
    stepActive: '0 0 20px rgba(167, 139, 250, 0.4)', // Aurora glow
    card: 'none', // Dark mode 不需要卡片陰影
  },

  // PWA theme-color
  metaThemeColor: '#0B1120',
}
