/**
 * 暗色主題 - Slate Blue Pro
 * 專業深色主題，藍色為主調
 */
export default {
  name: 'dark',
  type: 'dark',

  colors: {
    // ========================================
    // 品牌色 - Trust Blue
    // ========================================
    brandPrimary: '#3B82F6',
    brandPrimaryLight: '#60A5FA',
    brandPrimaryDark: '#2563EB',
    brandPrimaryHover: '#2563EB',
    brandAccent: '#F97316', // Warm Orange for CTA
    brandAccentLight: '#FB923C',

    // ========================================
    // 背景色 - Slate layers (not pure black)
    // ========================================
    bgBase: '#0F172A',
    bgCard: 'rgba(30, 41, 59, 0.8)',
    bgElevated: '#334155',
    bgMuted: 'rgba(255, 255, 255, 0.05)',
    bgInteractive: 'rgba(255, 255, 255, 0.1)',
    bgInteractiveHover: 'rgba(255, 255, 255, 0.15)',
    bgSubtle: 'rgba(59, 130, 246, 0.1)', // 極淺色 accent 背景
    bgOverlay: 'rgba(0, 0, 0, 0.5)', // 覆蓋層
    bgTooltip: '#1E293B', // 提示框背景
    bgGradient1: 'rgba(59, 130, 246, 0.12)',
    bgGradient2: 'rgba(96, 165, 250, 0.08)',
    bgGradient3: 'rgba(37, 99, 235, 0.05)',

    // ========================================
    // 文字色 - WCAG AA compliant hierarchy
    // ========================================
    textPrimary: '#F1F5F9',
    textSecondary: '#CBD5E1',
    textMuted: '#94A3B8',
    textInverse: '#1a1a2e',
    textLink: '#60A5FA',
    textOnBrand: '#FFFFFF', // 品牌色按鈕上的文字（藍色底配白字）

    // ========================================
    // 邊框色
    // ========================================
    borderDefault: 'rgba(100, 116, 139, 0.3)',
    borderMuted: 'rgba(100, 116, 139, 0.2)',
    borderFocus: '#3B82F6',
    borderSubtle: 'rgba(59, 130, 246, 0.3)', // 淺色 accent 邊框

    // ========================================
    // 狀態色
    // ========================================
    statusSuccess: '#34D399',
    statusSuccessMuted: 'rgba(16, 185, 129, 0.2)',
    statusSuccessSolid: '#10B981', // 實心背景（需白字）
    statusSuccessHover: '#059669',
    statusError: '#F87171',
    statusErrorMuted: 'rgba(239, 68, 68, 0.2)',
    statusErrorSolid: '#EF4444', // 實心背景（需白字）
    statusErrorHover: '#DC2626',
    statusWarning: '#FBBF24',
    statusWarningMuted: 'rgba(245, 158, 11, 0.2)',
    statusInfo: '#22D3EE',
    statusInfoMuted: 'rgba(6, 182, 212, 0.2)',
    statusInfoSolid: '#0891B2', // 實心背景（需白字）
    statusInfoHover: '#0E7490',

    // ========================================
    // 模式色（統一品牌色）
    // ========================================
    modeGenerate: '#60A5FA', // = brandPrimaryLight
    modeGenerateMuted: 'rgba(59, 130, 246, 0.2)',
    modeGenerateSolid: '#3B82F6', // = brandPrimary
    modeGenerateHover: 'rgba(59, 130, 246, 0.4)',
    modeVideo: '#A78BFA', // 影片模式 - violet
    modeVideoMuted: 'rgba(167, 139, 250, 0.2)',

    // ========================================
    // 控制元件狀態
    // ========================================
    controlActive: '#10B981', // Toggle ON
    controlInactive: '#4B5563', // Toggle OFF
    controlDisabled: '#374151', // Disabled 背景
    controlDisabledText: '#6B7280', // Disabled 文字

    // ========================================
    // 動畫/裝飾色
    // ========================================
    accentPulse: '#22D3EE', // 脈搏動畫
    accentPulseMuted: 'rgba(34, 211, 238, 0.3)',
    accentStar: '#FACC15', // 星星/收藏
    accentCheckerboard: 'rgba(255, 255, 255, 0.15)', // 棋盤格（暗色背景用淺色方塊）

    // ========================================
    // 玻璃效果
    // ========================================
    glassBg: 'rgba(30, 41, 59, 0.25)',
    glassBgStrong: 'rgba(15, 23, 42, 0.65)',
    glassBorder: 'rgba(100, 116, 139, 0.2)',

    // ========================================
    // 輸入框
    // ========================================
    inputBg: 'rgba(30, 41, 59, 0.6)',

    // ========================================
    // 漸層色
    // ========================================
    gradientBrandStart: '#60A5FA', // 品牌漸層
    gradientBrandMiddle: '#93C5FD',
    gradientBrandEnd: '#60A5FA',
    gradientStepActiveStart: '#06B6D4', // 進行中步驟 (cyan → blue)
    gradientStepActiveEnd: '#3B82F6',
    gradientStepCompletedStart: '#3B82F6', // 已完成步驟 (blue → indigo)
    gradientStepCompletedEnd: '#6366F1',
    gradientStepSuccessStart: '#10B981', // 成功步驟 (emerald → teal)
    gradientStepSuccessEnd: '#14B8A6',
    gradientTimelineStart: 'rgba(59, 130, 246, 0.5)', // 時間軸
  },

  shadows: {
    glowPrimary: '0 4px 20px rgba(59, 130, 246, 0.15)',
    glowSuccess: '0 4px 16px rgba(34, 197, 94, 0.25)',
    glowGold: '0 4px 20px rgba(234, 179, 8, 0.15)',
    stepActive: '0 0 20px rgba(6, 182, 212, 0.5)', // 進行中步驟光暈
    card: 'none', // Dark mode 不需要卡片陰影
  },

  // PWA theme-color
  metaThemeColor: '#111827',
}
