/**
 * Nord 主題 - 極地冰藍
 * 基於 Nord 官方色板 (nordtheme.com)
 * 北歐極簡風格，低對比護眼設計
 *
 * Polar Night: #2E3440, #3B4252, #434C5E, #4C566A
 * Snow Storm: #D8DEE9, #E5E9F0, #ECEFF4
 * Frost: #8FBCBB, #88C0D0, #81A1C1, #5E81AC
 * Aurora: #BF616A, #D08770, #EBCB8B, #A3BE8C, #B48EAD
 */
export default {
  name: 'nord',
  type: 'dark',

  colors: {
    // ========================================
    // 品牌色 - Frost (Nord8 Ice Blue)
    // ========================================
    brandPrimary: '#88C0D0', // nord8 - 經典冰藍
    brandPrimaryLight: '#8FBCBB', // nord7
    brandPrimaryDark: '#81A1C1', // nord9
    brandPrimaryHover: '#81A1C1',
    brandAccent: '#5E81AC', // nord10 - 深藍強調
    brandAccentLight: '#81A1C1',

    // ========================================
    // 背景色 - Polar Night
    // ========================================
    bgBase: '#2E3440', // nord0
    bgCard: 'rgba(59, 66, 82, 0.7)', // nord1 translucent
    bgElevated: '#3B4252', // nord1
    bgMuted: 'rgba(216, 222, 233, 0.05)', // nord4 very subtle
    bgInteractive: 'rgba(216, 222, 233, 0.08)',
    bgInteractiveHover: 'rgba(216, 222, 233, 0.12)',
    bgSubtle: 'rgba(136, 192, 208, 0.1)', // nord8 subtle
    bgOverlay: 'rgba(46, 52, 64, 0.8)', // nord0 overlay
    bgTooltip: '#434C5E', // nord2
    bgGradient1: 'rgba(136, 192, 208, 0.1)', // nord8
    bgGradient2: 'rgba(129, 161, 193, 0.08)', // nord9
    bgGradient3: 'rgba(94, 129, 172, 0.06)', // nord10

    // ========================================
    // 文字色 - Snow Storm
    // ========================================
    textPrimary: '#ECEFF4', // nord6
    textSecondary: '#E5E9F0', // nord5
    textMuted: '#D8DEE9', // nord4
    textInverse: '#2E3440', // nord0
    textLink: '#88C0D0', // nord8
    textOnBrand: '#2E3440', // nord0 - 冰藍底配深字

    // ========================================
    // 邊框色
    // ========================================
    borderDefault: 'rgba(76, 86, 106, 0.6)', // nord3
    borderMuted: 'rgba(76, 86, 106, 0.4)',
    borderFocus: '#88C0D0', // nord8
    borderSubtle: 'rgba(136, 192, 208, 0.3)',

    // ========================================
    // 狀態色 - Aurora
    // ========================================
    statusSuccess: '#A3BE8C', // nord14 綠
    statusSuccessMuted: 'rgba(163, 190, 140, 0.2)',
    statusSuccessSolid: '#A3BE8C',
    statusSuccessHover: '#8FAA7A',
    statusError: '#BF616A', // nord11 紅
    statusErrorMuted: 'rgba(191, 97, 106, 0.2)',
    statusErrorSolid: '#BF616A',
    statusErrorHover: '#A9545C',
    statusWarning: '#D08770', // nord12 橘
    statusWarningMuted: 'rgba(208, 135, 112, 0.2)',
    statusInfo: '#B48EAD', // nord15 紫（Nord 用紫色作 info）
    statusInfoMuted: 'rgba(180, 142, 173, 0.2)',
    statusInfoSolid: '#B48EAD',
    statusInfoHover: '#A07A99',

    // ========================================
    // 模式色 - Frost + Aurora mix
    // ========================================
    modeGenerate: '#88C0D0', // nord8 冰藍
    modeGenerateMuted: 'rgba(136, 192, 208, 0.2)',
    modeGenerateHover: 'rgba(136, 192, 208, 0.35)',
    modeSticker: '#B48EAD', // nord15 紫
    modeStickerMuted: 'rgba(180, 142, 173, 0.2)',
    modeStickerSolid: '#B48EAD',
    modeEdit: '#81A1C1', // nord9 藍灰
    modeEditMuted: 'rgba(129, 161, 193, 0.2)',
    modeStory: '#D08770', // nord12 橘
    modeStoryMuted: 'rgba(208, 135, 112, 0.2)',
    modeDiagram: '#A3BE8C', // nord14 綠
    modeDiagramMuted: 'rgba(163, 190, 140, 0.2)',

    // ========================================
    // 控制元件狀態
    // ========================================
    controlActive: '#A3BE8C', // nord14 綠
    controlInactive: '#4C566A', // nord3
    controlDisabled: '#434C5E', // nord2
    controlDisabledText: '#4C566A', // nord3

    // ========================================
    // 動畫/裝飾色
    // ========================================
    accentPulse: '#88C0D0', // nord8
    accentPulseMuted: 'rgba(136, 192, 208, 0.3)',
    accentStar: '#EBCB8B', // nord13 黃
    accentCheckerboard: 'rgba(216, 222, 233, 0.1)', // nord4

    // ========================================
    // 玻璃效果
    // ========================================
    glassBg: 'rgba(59, 66, 82, 0.4)', // nord1
    glassBgStrong: 'rgba(46, 52, 64, 0.75)', // nord0
    glassBorder: 'rgba(76, 86, 106, 0.3)', // nord3

    // ========================================
    // 輸入框
    // ========================================
    inputBg: 'rgba(59, 66, 82, 0.6)', // nord1

    // ========================================
    // 漸層色
    // ========================================
    gradientBrandStart: '#81A1C1', // nord9
    gradientBrandMiddle: '#88C0D0', // nord8
    gradientBrandEnd: '#8FBCBB', // nord7
    gradientStepActiveStart: '#88C0D0', // nord8
    gradientStepActiveEnd: '#5E81AC', // nord10
    gradientStepCompletedStart: '#5E81AC', // nord10
    gradientStepCompletedEnd: '#81A1C1', // nord9
    gradientStepSuccessStart: '#A3BE8C', // nord14
    gradientStepSuccessEnd: '#8FBCBB', // nord7
    gradientTimelineStart: 'rgba(136, 192, 208, 0.5)', // nord8
  },

  shadows: {
    glowPrimary: '0 4px 20px rgba(136, 192, 208, 0.15)', // nord8 glow
    glowSuccess: '0 4px 16px rgba(163, 190, 140, 0.2)', // nord14
    glowGold: '0 4px 20px rgba(235, 203, 139, 0.15)', // nord13
    stepActive: '0 0 20px rgba(136, 192, 208, 0.4)', // nord8
    card: 'none',
  },

  // PWA theme-color
  metaThemeColor: '#2E3440',
}
