/**
 * 暗色主題 - Slate Blue Pro
 * 專業深色主題，藍色為主調
 */
export default {
  name: 'dark',
  displayName: '暗色模式',

  colors: {
    // ========================================
    // 品牌色 - Trust Blue
    // ========================================
    brandPrimary: '#3B82F6',
    brandPrimaryLight: '#60A5FA',
    brandPrimaryDark: '#2563EB',
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

    // ========================================
    // 文字色 - WCAG AA compliant hierarchy
    // ========================================
    textPrimary: '#F1F5F9',
    textSecondary: '#CBD5E1',
    textMuted: '#94A3B8',
    textInverse: '#1a1a2e',
    textLink: '#60A5FA',

    // ========================================
    // 邊框色
    // ========================================
    borderDefault: 'rgba(100, 116, 139, 0.3)',
    borderMuted: 'rgba(100, 116, 139, 0.2)',
    borderFocus: '#3B82F6',

    // ========================================
    // 狀態色
    // ========================================
    statusSuccess: '#34D399',
    statusSuccessMuted: 'rgba(16, 185, 129, 0.2)',
    statusError: '#F87171',
    statusErrorMuted: 'rgba(239, 68, 68, 0.2)',
    statusWarning: '#FBBF24',
    statusWarningMuted: 'rgba(245, 158, 11, 0.2)',
    statusInfo: '#22D3EE',
    statusInfoMuted: 'rgba(6, 182, 212, 0.2)',

    // ========================================
    // 模式色（對應 5 種生成模式）
    // ========================================
    modeGenerate: '#60A5FA', // Blue
    modeGenerateMuted: 'rgba(59, 130, 246, 0.2)',
    modeSticker: '#F472B6', // Pink
    modeStickerMuted: 'rgba(236, 72, 153, 0.2)',
    modeEdit: '#A78BFA', // Violet
    modeEditMuted: 'rgba(139, 92, 246, 0.2)',
    modeStory: '#FB923C', // Orange
    modeStoryMuted: 'rgba(249, 115, 22, 0.2)',
    modeDiagram: '#34D399', // Emerald
    modeDiagramMuted: 'rgba(16, 185, 129, 0.2)',

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
  },

  shadows: {
    glowPrimary: '0 4px 20px rgba(59, 130, 246, 0.15)',
    glowSuccess: '0 4px 16px rgba(34, 197, 94, 0.25)',
    glowGold: '0 4px 20px rgba(234, 179, 8, 0.15)',
  },

  // PWA theme-color
  metaThemeColor: '#111827',
}
