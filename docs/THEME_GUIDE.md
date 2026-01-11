# 主題系統指南

本專案採用模組化主題系統，類似 i18n 架構。新增主題只需建立一個定義檔並註冊即可。

## 目錄結構

```
src/theme/
├── index.js          # 主題註冊中心（需在此註冊新主題）
├── tokens.js         # Token 定義 + CSS 變數生成
└── themes/
    ├── dark.js       # 暗色主題
    ├── light.js      # 亮色主題
    └── [your-theme].js  # 你的新主題
```

---

## 新增主題步驟

### Step 1: 建立主題定義檔

複製 `src/theme/themes/dark.js` 作為模板，建立新檔案：

```bash
cp src/theme/themes/dark.js src/theme/themes/midnight.js
```

### Step 2: 修改主題內容

編輯新檔案，修改以下內容：

```javascript
// src/theme/themes/midnight.js
export default {
  name: 'midnight',           // 主題 ID（唯一識別碼）
  displayName: '午夜藍',       // 顯示名稱（用於 UI）

  colors: {
    // 修改所有顏色值...
  },

  shadows: {
    // 修改陰影效果...
  },

  metaThemeColor: '#000000',  // PWA 狀態列顏色
}
```

### Step 3: 註冊主題

在 `src/theme/index.js` 中匯入並註冊：

```javascript
import darkTheme from './themes/dark'
import lightTheme from './themes/light'
import midnightTheme from './themes/midnight'  // 新增

const themes = {
  dark: darkTheme,
  light: lightTheme,
  midnight: midnightTheme,  // 新增
}
```

### Step 4: 完成

主題系統會自動處理：
- CSS 變數注入
- localStorage 持久化
- 系統偏好偵測
- PWA theme-color 更新

---

## Token 完整清單

以下是所有必須定義的顏色 Token：

### 品牌色 (brand)

| Token | 用途 | 範例 |
|-------|------|------|
| `brandPrimary` | 主品牌色 | `#3B82F6` |
| `brandPrimaryLight` | 淺色變體 | `#60A5FA` |
| `brandPrimaryDark` | 深色變體 | `#2563EB` |
| `brandPrimaryHover` | Hover 狀態 | `#2563EB` |
| `brandAccent` | 強調色 (CTA) | `#F97316` |
| `brandAccentLight` | 強調色淺色 | `#FB923C` |

### 背景色 (bg)

| Token | 用途 | 範例 |
|-------|------|------|
| `bgBase` | 頁面底色 | `#0F172A` |
| `bgCard` | 卡片背景 | `rgba(30, 41, 59, 0.8)` |
| `bgElevated` | 浮起元素 | `#334155` |
| `bgMuted` | 淡化背景 | `rgba(255, 255, 255, 0.05)` |
| `bgInteractive` | 互動元素 | `rgba(255, 255, 255, 0.1)` |
| `bgInteractiveHover` | 互動 Hover | `rgba(255, 255, 255, 0.15)` |
| `bgSubtle` | 極淺強調背景 | `rgba(59, 130, 246, 0.1)` |
| `bgOverlay` | 覆蓋層 | `rgba(0, 0, 0, 0.5)` |
| `bgTooltip` | 提示框背景 | `#1E293B` |

### 文字色 (text)

| Token | 用途 | 範例 |
|-------|------|------|
| `textPrimary` | 主要文字 | `#F1F5F9` |
| `textSecondary` | 次要文字 | `#CBD5E1` |
| `textMuted` | 淡化文字 | `#94A3B8` |
| `textInverse` | 反色文字 | `#1a1a2e` |
| `textLink` | 連結文字 | `#60A5FA` |

### 邊框色 (border)

| Token | 用途 | 範例 |
|-------|------|------|
| `borderDefault` | 預設邊框 | `rgba(100, 116, 139, 0.3)` |
| `borderMuted` | 淡化邊框 | `rgba(100, 116, 139, 0.2)` |
| `borderFocus` | Focus 邊框 | `#3B82F6` |
| `borderSubtle` | 極淺邊框 | `rgba(59, 130, 246, 0.3)` |

### 狀態色 (status)

| Token | 用途 | 範例 |
|-------|------|------|
| `statusSuccess` | 成功文字 | `#34D399` |
| `statusSuccessMuted` | 成功背景 | `rgba(16, 185, 129, 0.2)` |
| `statusSuccessSolid` | 成功實心背景 | `#10B981` |
| `statusSuccessHover` | 成功 Hover | `#059669` |
| `statusError` | 錯誤文字 | `#F87171` |
| `statusErrorMuted` | 錯誤背景 | `rgba(239, 68, 68, 0.2)` |
| `statusErrorSolid` | 錯誤實心背景 | `#EF4444` |
| `statusErrorHover` | 錯誤 Hover | `#DC2626` |
| `statusWarning` | 警告文字 | `#FBBF24` |
| `statusWarningMuted` | 警告背景 | `rgba(245, 158, 11, 0.2)` |
| `statusInfo` | 資訊文字 | `#22D3EE` |
| `statusInfoMuted` | 資訊背景 | `rgba(6, 182, 212, 0.2)` |
| `statusInfoSolid` | 資訊實心背景 | `#0891B2` |
| `statusInfoHover` | 資訊 Hover | `#0E7490` |

### 模式色 (mode) - 對應 5 種生成模式

| Token | 用途 | 範例 |
|-------|------|------|
| `modeGenerate` | 生成模式 (藍) | `#60A5FA` |
| `modeGenerateMuted` | 生成背景 | `rgba(59, 130, 246, 0.2)` |
| `modeGenerateHover` | 生成 Hover | `rgba(59, 130, 246, 0.4)` |
| `modeSticker` | 貼圖模式 (粉) | `#F472B6` |
| `modeStickerMuted` | 貼圖背景 | `rgba(236, 72, 153, 0.2)` |
| `modeStickerSolid` | 貼圖實心 | `#EC4899` |
| `modeEdit` | 編輯模式 (紫) | `#A78BFA` |
| `modeEditMuted` | 編輯背景 | `rgba(139, 92, 246, 0.2)` |
| `modeStory` | 故事模式 (橙) | `#FB923C` |
| `modeStoryMuted` | 故事背景 | `rgba(249, 115, 22, 0.2)` |
| `modeDiagram` | 圖表模式 (綠) | `#34D399` |
| `modeDiagramMuted` | 圖表背景 | `rgba(16, 185, 129, 0.2)` |

### 控制元件狀態 (control)

| Token | 用途 | 範例 |
|-------|------|------|
| `controlActive` | Toggle ON | `#10B981` |
| `controlInactive` | Toggle OFF | `#4B5563` |
| `controlDisabled` | Disabled 背景 | `#374151` |
| `controlDisabledText` | Disabled 文字 | `#6B7280` |

### 動畫/裝飾色 (accent)

| Token | 用途 | 範例 |
|-------|------|------|
| `accentPulse` | 脈搏動畫 | `#22D3EE` |
| `accentPulseMuted` | 脈搏淡色 | `rgba(34, 211, 238, 0.3)` |
| `accentStar` | 星星/收藏 | `#FACC15` |

### 玻璃效果 (glass)

| Token | 用途 | 範例 |
|-------|------|------|
| `glassBg` | 玻璃背景 | `rgba(30, 41, 59, 0.25)` |
| `glassBgStrong` | 深玻璃背景 | `rgba(15, 23, 42, 0.65)` |
| `glassBorder` | 玻璃邊框 | `rgba(100, 116, 139, 0.2)` |

### 輸入框 (input)

| Token | 用途 | 範例 |
|-------|------|------|
| `inputBg` | 輸入框背景 | `rgba(30, 41, 59, 0.6)` |

### 漸層色 (gradient)

| Token | 用途 | 範例 |
|-------|------|------|
| `gradientBrandStart` | 品牌漸層起點 | `#60A5FA` |
| `gradientBrandMiddle` | 品牌漸層中點 | `#93C5FD` |
| `gradientBrandEnd` | 品牌漸層終點 | `#60A5FA` |
| `gradientStepActiveStart` | 進行中步驟起點 | `#06B6D4` |
| `gradientStepActiveEnd` | 進行中步驟終點 | `#3B82F6` |
| `gradientStepCompletedStart` | 完成步驟起點 | `#3B82F6` |
| `gradientStepCompletedEnd` | 完成步驟終點 | `#6366F1` |
| `gradientStepSuccessStart` | 成功步驟起點 | `#10B981` |
| `gradientStepSuccessEnd` | 成功步驟終點 | `#14B8A6` |
| `gradientTimelineStart` | 時間軸起點 | `rgba(59, 130, 246, 0.5)` |

### 陰影 (shadows)

| Token | 用途 | 範例 |
|-------|------|------|
| `glowPrimary` | 主色光暈 | `0 4px 20px rgba(59, 130, 246, 0.15)` |
| `glowSuccess` | 成功光暈 | `0 4px 16px rgba(34, 197, 94, 0.25)` |
| `glowGold` | 金色光暈 | `0 4px 20px rgba(234, 179, 8, 0.15)` |
| `stepActive` | 進行中步驟光暈 | `0 0 20px rgba(6, 182, 212, 0.5)` |

---

## 主題檔案範本

```javascript
// src/theme/themes/[your-theme].js
export default {
  name: 'your-theme-id',
  displayName: '你的主題名稱',

  colors: {
    // 品牌色
    brandPrimary: '#...',
    brandPrimaryLight: '#...',
    brandPrimaryDark: '#...',
    brandPrimaryHover: '#...',
    brandAccent: '#...',
    brandAccentLight: '#...',

    // 背景色
    bgBase: '#...',
    bgCard: '#...',
    bgElevated: '#...',
    bgMuted: '#...',
    bgInteractive: '#...',
    bgInteractiveHover: '#...',
    bgSubtle: '#...',
    bgOverlay: '#...',
    bgTooltip: '#...',

    // 文字色
    textPrimary: '#...',
    textSecondary: '#...',
    textMuted: '#...',
    textInverse: '#...',
    textLink: '#...',

    // 邊框色
    borderDefault: '#...',
    borderMuted: '#...',
    borderFocus: '#...',
    borderSubtle: '#...',

    // 狀態色
    statusSuccess: '#...',
    statusSuccessMuted: '#...',
    statusSuccessSolid: '#...',
    statusSuccessHover: '#...',
    statusError: '#...',
    statusErrorMuted: '#...',
    statusErrorSolid: '#...',
    statusErrorHover: '#...',
    statusWarning: '#...',
    statusWarningMuted: '#...',
    statusInfo: '#...',
    statusInfoMuted: '#...',
    statusInfoSolid: '#...',
    statusInfoHover: '#...',

    // 模式色
    modeGenerate: '#...',
    modeGenerateMuted: '#...',
    modeGenerateHover: '#...',
    modeSticker: '#...',
    modeStickerMuted: '#...',
    modeStickerSolid: '#...',
    modeEdit: '#...',
    modeEditMuted: '#...',
    modeStory: '#...',
    modeStoryMuted: '#...',
    modeDiagram: '#...',
    modeDiagramMuted: '#...',

    // 控制元件
    controlActive: '#...',
    controlInactive: '#...',
    controlDisabled: '#...',
    controlDisabledText: '#...',

    // 動畫色
    accentPulse: '#...',
    accentPulseMuted: '#...',
    accentStar: '#...',

    // 玻璃效果
    glassBg: '#...',
    glassBgStrong: '#...',
    glassBorder: '#...',

    // 輸入框
    inputBg: '#...',

    // 漸層色
    gradientBrandStart: '#...',
    gradientBrandMiddle: '#...',
    gradientBrandEnd: '#...',
    gradientStepActiveStart: '#...',
    gradientStepActiveEnd: '#...',
    gradientStepCompletedStart: '#...',
    gradientStepCompletedEnd: '#...',
    gradientStepSuccessStart: '#...',
    gradientStepSuccessEnd: '#...',
    gradientTimelineStart: '#...',
  },

  shadows: {
    glowPrimary: '0 4px 20px rgba(...)',
    glowSuccess: '0 4px 16px rgba(...)',
    glowGold: '0 4px 20px rgba(...)',
    stepActive: '0 0 20px rgba(...)',
  },

  metaThemeColor: '#...',
}
```

---

## 設計建議

### 對比度
- 確保文字與背景的對比度符合 WCAG AA 標準 (4.5:1)
- 使用工具檢查：https://webaim.org/resources/contrastchecker/

### 語義一致性
- `statusSuccess` 應該是讓人聯想到「成功」的顏色（通常是綠色系）
- `statusError` 應該是讓人聯想到「錯誤」的顏色（通常是紅色系）
- 各模式色應保持視覺區分度

### 漸層配色
- 漸層的起點和終點應該是相近色相，避免突兀
- 考慮漸層方向（通常是 `from-[start] to-[end]`）

---

## API 使用

```javascript
import { setTheme, toggleTheme, getAvailableThemes } from '@/theme'

// 切換到特定主題
setTheme('midnight')

// 循環切換所有主題
toggleTheme()

// 取得所有可用主題
const themes = getAvailableThemes()
// [{ name: 'dark', displayName: '暗色模式' }, ...]
```

---

## 測試清單

新增主題後，請測試以下項目：

- [ ] 首頁標題漸層正常顯示
- [ ] 所有 5 種模式的顏色正確
- [ ] Toggle 開關的 ON/OFF 狀態清晰
- [ ] 狀態訊息（成功/錯誤/警告/資訊）辨識度高
- [ ] 玻璃效果在各背景下可見
- [ ] ThinkingProcess 步驟指示器漸層正常
- [ ] 深淺色主題切換後 localStorage 正確保存
- [ ] PWA 狀態列顏色更新
