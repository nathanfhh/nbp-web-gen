# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Nano Banana Pro Web Gen is a Vue 3 PWA for AI image generation using Google Gemini API. It runs 100% client-side with no backend - API calls go directly to Gemini from the browser.

## Commands

```bash
npm run dev      # Start dev server (binds to 0.0.0.0)
npm run build    # Production build
npm run lint     # ESLint with auto-fix
npm run format   # Prettier formatting for src/
```

## Architecture

### Core Flow
- `App.vue` - Main UI layout, coordinates all components
- `stores/generator.js` - Pinia store managing all app state (API key, mode, options, history, generation state)
- `composables/useGeneration.js` - Generation orchestration, calls API and saves results
- `composables/useApi.js` - Gemini API interaction with SSE streaming, prompt building per mode

### Generation Modes
Seven modes with mode-specific option components and prompt builders:
- **generate** - Basic image generation with styles/variations
- **sticker** - Sticker sheet generation with auto-segmentation
- **edit** - Image editing with reference images
- **story** - Multi-step visual storytelling (sequential API calls)
- **diagram** - Technical diagram generation
- **video** - AI video generation using Google Veo 3.1 API (REST, not SDK)
- **slides** - Presentation slide generation with AI style analysis (sequential per-page)

### Video Generation - API Limitations

**⚠️ IMPORTANT: `generateAudio` is NOT supported by Gemini API (browser)**

The `@google/genai` SDK includes `generateAudio` in its TypeScript definitions, but **Gemini API does not support this parameter** - it returns error: `"generateAudio parameter is not supported in Gemini API"`.

This is a **Vertex AI only** feature. Vertex AI requires:
- Service Account / ADC authentication
- Node.js runtime (not browser)

Since this project runs 100% client-side in browser, we cannot use Vertex AI.

**Current behavior:**
- Audio is **always generated** by Veo 3.1 API (no way to disable via Gemini API)
- Price calculation always uses `audio` pricing (not `noAudio`)
- UI toggle is hidden (commented out in `VideoOptions.vue`)

**Preserved code for future Vertex AI support:**
| File | What | Why preserved |
|------|------|---------------|
| `videoPricing.js` | `generateAudio` param in price functions | Ready for Vertex AI pricing |
| `VideoOptions.vue:591-621` | Commented Audio Toggle UI | Ready to uncomment |
| `i18n/locales/*.json` | `video.audio.*` translations | UI strings ready |

**DO NOT:**
- Re-add `generateAudio` to API payload in `useVideoApi.js`
- Uncomment the Audio Toggle UI (unless switching to Vertex AI)
- Use `noAudio` pricing (Gemini API always generates audio)

### OCR Implementation (PaddleOCR + ONNX Runtime)

**⚠️ CRITICAL: DBNet + CTC 後處理的三大陷阱**

使用 ONNX Runtime Web 搭配 PaddleOCR 模型時，以下三個錯誤會導致「框不準」和「字全錯」：

#### 1. 字典解析 - 不可使用 trim() 或 filter()
```javascript
// ❌ 錯誤 - 會刪除空白字元，導致索引位移
dictionary = text.split('\n').filter(line => line.trim())

// ✅ 正確 - 只移除檔案末尾的空行
dictionary = text.split(/\r?\n/)
if (dictionary[dictionary.length - 1] === '') dictionary.pop()
dictionary.unshift('blank') // CTC blank token
```
**原因**: PaddleOCR 字典靠行號對應字元，字典中包含有效的空白字元（如 U+3000 全形空白）。使用 trim/filter 會刪除這些行，導致後續所有索引向前位移，識別結果全錯。

#### 2. DBNet Unclip - 必須膨脹預測框
```javascript
// DBNet 輸出的是「縮小的核心區域」，不是完整文字框
// 需要使用 Vatti Clipping 公式膨脹回原始大小
const area = component.length
const perimeter = 2 * (boxWidth + boxHeight)
const unclipRatio = 1.5 // 標準 DBNet 膨脹比例
const offset = (area * unclipRatio) / perimeter

expandedMinX = minX - offset
expandedMinY = minY - offset
expandedMaxX = maxX + offset
expandedMaxY = maxY + offset
```
**原因**: DBNet 設計上會預測比實際文字更小的區域（約小 40%），用於區分相鄰文字行。直接使用會切掉文字頭尾。

#### 3. 座標縮放 - 使用縮放後尺寸，非補白後尺寸
```javascript
// 預處理時：原圖 → 縮放 → 補白到 32 倍數
// ❌ 錯誤 - 使用補白後的尺寸
scaleX = originalWidth / paddedWidth  // paddedWidth 包含白邊

// ✅ 正確 - 使用縮放後、補白前的尺寸
scaleX = originalWidth / scaledWidth  // scaledWidth 是實際內容寬度
```
**原因**: 補白區域（padding）不包含內容，但錯誤的縮放比例會假設內容填滿整個 canvas，導致座標偏移（越靠右下角偏移越大）。

#### 4. OCR Architecture - CPU/GPU Unified Implementation

OCR 有兩種執行模式（WebGPU 主執行緒 / WASM Worker），核心邏輯已統一：

| 共用檔案 | 內容 |
|----------|------|
| `utils/ocr-core.js` | 所有 OCR 演算法（前處理、後處理、Layout 分析、Tesseract fallback） |
| `constants/ocrDefaults.js` | 參數預設值與驗證規則 |
| `composables/useOcrSettings.js` | 設定管理 (localStorage) |

**修改原則：**
- 修改 OCR 演算法 → 只改 `ocr-core.js`
- 修改參數預設值 → 只改 `ocrDefaults.js`
- 修改 ONNX/快取邏輯 → 兩邊都要改（`useOcrMainThread.js` + `ocr.worker.js`）

> **Architecture Details**: See [`docs/ocr-architecture.md`](docs/ocr-architecture.md)
>
> **⚠️ 維護提醒**：修改 OCR 相關邏輯時，請同步更新 `docs/ocr-architecture.md`

#### 4.1 ONNX Tensor 記憶體管理 - 必須手動 dispose

**⚠️ CRITICAL: ONNX Runtime Web Tensor 不會被 GC 自動回收！**

```javascript
// ❌ 錯誤 - Tensor 會累積，每次 OCR 增加 ~50MB
const { tensor: detTensor } = preprocessForDetection(bitmap, settings, ort.Tensor)
const detOutput = await detSession.run({ input: detTensor })
// tensor 永遠不會被釋放...

// ✅ 正確 - 使用完立即 dispose
let detTensor = null
let detOutput = null
try {
  const result = preprocessForDetection(bitmap, settings, ort.Tensor)
  detTensor = result.tensor
  const detResults = await detSession.run({ input: detTensor })
  detOutput = detResults[detSession.outputNames[0]]
  // ... 處理結果 ...

  // 儘早釋放（postProcess 後就不需要了）
  detTensor.dispose()
  detTensor = null
  detOutput.dispose()
  detOutput = null
} finally {
  // 確保錯誤時也能清理
  if (detTensor) detTensor.dispose()
  if (detOutput) detOutput.dispose()
}
```

**記憶體影響（Server 模型，9 張 1920x1080 slides）：**
| Tensor 類型 | 大小/個 | 數量 | 未 dispose 累積 |
|-------------|---------|------|-----------------|
| Detection Input | ~18 MB | 9 | ~160 MB |
| Detection Output | ~6 MB | 9 | ~54 MB |
| Recognition Input | ~0.7 MB | ~180 | ~130 MB |
| Recognition Output | ~2 MB | ~180 | ~360 MB |
| **總計** | - | - | **~700 MB** |

**修改位置：**
- `src/workers/ocr.worker.js` - WASM Worker 模式
- `src/composables/useOcrMainThread.js` - WebGPU 主執行緒模式

#### 5. Layout Analysis - Text Block Merging

Raw OCR detections (single lines) must be merged into logical paragraphs. This is done using a Recursive XY-Cut algorithm combined with heuristic line grouping.

> **Algorithm Details**: See [`docs/layout-analysis-algorithm.md`](docs/layout-analysis-algorithm.md)

#### 6. PPTX Text Box Font Sizing

Font size calculation uses **aspect-ratio adaptive** approach to handle both horizontal and vertical text:

| File | Description |
|------|-------------|
| `composables/usePptxExport.js` | PPTX generation with font size calculation |

**Algorithm:**
1. **Collect dimensions** - Get both width and height of each line from OCR detection
2. **Aspect ratio check** - Determine text orientation based on width/height ratio:
   - `aspectRatio < 0.5` → Vertical text (tall & narrow) → use **width** as font reference
   - `aspectRatio > 2` → Horizontal text (wide & short) → use **height** as font reference
   - `0.5 ≤ aspectRatio ≤ 2` → Uncertain → use **min(width, height)** for safety
3. **Line height ratio** (`lineHeightRatio`) - Convert reference dimension to font size (default: 1.2)
4. **Clamp to range** - Apply `minFontSize` and `maxFontSize` limits

**Why this approach?**
- Horizontal text: line height ≈ font height (use height)
- Vertical text: line height = entire text string height, line width ≈ font width (use width)
- Using only height would cause vertical text to have abnormally large font sizes

**Key Parameters** (configurable in OCR Settings → Export):
| Parameter | Default | Description |
|-----------|---------|-------------|
| `lineHeightRatio` | 1.2 | Ratio for converting reference dimension to font size |
| `minFontSize` | 8 | Minimum font size (points) |
| `maxFontSize` | 120 | Maximum font size (points) |

**Note:** Text box width uses OCR detection bounds directly. If text overflows, users can manually adjust in PowerPoint (wrap is disabled by default).

#### 7. Slide to PPTX Settings & Edit Mode Behavior

The Slide to PPTX feature has complex interactions between settings changes and edit mode operations.

> **Behavior Details**: See [`docs/slide-to-pptx-settings-behavior.md`](docs/slide-to-pptx-settings-behavior.md)

Key points:
- **OCR Settings (版面分析/匯出)**: Changes trigger `remergeAllSlides()` on modal close - no re-OCR needed
- **OCR Settings (前處理/偵測/後處理)**: Changes require re-processing (next "Start")
- **Edit Mode**: Region changes require inpaint; separator-only changes only need remerge
- **Gemini Confirmation Modal**: Shows when regions changed + Gemini method; user must choose action (no X button, no ESC close)

### Prompt Building
`useApi.js` contains `buildPrompt()` function that constructs enhanced prompts based on mode. Each mode has a dedicated builder function (`buildGeneratePrompt`, `buildStickerPrompt`, etc.) that adds mode-specific suffixes and options.

> **Slides Mode**: For detailed prompt structure documentation, see [`docs/prompt-structure-slide.md`](docs/prompt-structure-slide.md)

### Storage Layers
- **localStorage** - API key, quick settings (mode, temperature, seed)
- **IndexedDB** (`useIndexedDB.js`) - Generation history records, character metadata
- **OPFS** (`useOPFS.js`, `useImageStorage.js`, `useCharacterStorage.js`) - Image blobs for history and characters

> **詳細文件**: 完整的儲存架構說明請參閱 [`docs/storage.md`](docs/storage.md)

### Web Workers
- `workers/stickerSegmentation.worker.js` - Client-side sticker sheet segmentation using BFS flood fill and projection-based region detection
- `workers/pdfGenerator.worker.js` - PDF batch download generation
- `workers/pdfToImages.worker.js` - PDF to PNG conversion using PDF.js
- `workers/ocr.worker.js` - OCR text detection using ONNX Runtime and PaddleOCR
- `workers/inpainting.worker.js` - Text removal using OpenCV.js inpainting

**⚠️ PDF.js Version Matching Rule**

When using `pdfjs-dist`, the CDN worker URL version **MUST exactly match** the installed package version. Use jsdelivr (mirrors npm) instead of cdnjs (may lag behind):
```javascript
// In pdfToImages.worker.js - version must match package.json
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.530/build/pdf.worker.min.mjs'
```
If you update `pdfjs-dist` in package.json, you **MUST** also update the CDN URL in the worker file.

**⚠️ PDF.js Worker DOM Mock**

Web Worker 環境沒有 `document` 物件，但 PDF.js 內部會呼叫 DOM API（字體載入、annotation 等）。解決方案是提供 `mockDocument`：

```javascript
// pdfToImages.worker.js
const pdf = await pdfjsLib.getDocument({
  data: pdfData,
  ownerDocument: mockDocument,  // 注入假的 document
}).promise
```

**為何不用現成的 DOM 模擬庫？**
| 方案 | 結果 | 原因 |
|------|------|------|
| `linkedom/worker` | ❌ 失敗 | 不支援 canvas（回傳 null） |
| `jsdom` | ❌ 不適用 | 太重（~1GB heap），且不支援 Worker |
| 自己的 mock | ✅ 可用 | 特別處理 `OffscreenCanvas` |

**Mock 實作重點：**
- `createElement('canvas')` → 回傳 `OffscreenCanvas`（Worker 可用）
- 其他元素 → 回傳空操作的假物件
- 只實作 PDF.js 需要的最小 API

### Internationalization
- `i18n/index.js` with locale files in `i18n/locales/`
- Supports `zh-TW` and `en`, auto-detects from browser

### Theme System (Modular)
Similar to i18n architecture - add a file to add a theme:
```
src/theme/
├── index.js              # Theme registry (initTheme, setTheme, toggleTheme)
├── tokens.js             # Semantic token definitions + migration map
└── themes/               # 14 themes available
    ├── dark.js           # Slate Blue Pro - type: dark
    ├── light.js          # Greek Blue - type: light
    ├── warm.js           # Warm Latte - type: light, orange brand
    ├── espresso.js       # Coffee & Cream - type: light, coffee brand
    ├── mocha.js          # Dark Coffee - type: dark, coffee brand
    ├── nord.js           # Arctic Ice Blue - type: dark, nord palette
    ├── matcha.js         # Matcha Latte - type: light, green brand
    ├── matcha-dark.js    # Matcha Dark - type: dark, green brand
    ├── gruvbox.js        # Gruvbox - type: dark, retro palette
    ├── everforest.js     # Everforest - type: dark, forest palette
    ├── spring.js         # Spring Blossom - type: light, seasonal
    ├── summer.js         # Summer Ocean - type: light, seasonal
    ├── autumn.js         # Autumn Harvest - type: light, seasonal
    └── winter.js         # Winter Frost - type: dark, seasonal
```

**Key concepts:**
- Themes are JavaScript objects with `colors` and `shadows` properties
- CSS variables are injected at runtime via `initTheme()` in `main.js`
- Tailwind v4 `@theme` syntax in `style.css` references these CSS variables
- Semantic class names: `text-text-primary`, `bg-bg-muted`, `border-mode-generate`, etc.
- Themes auto-register via Vite's `import.meta.glob` - no manual registration needed in `index.js`
- `data-theme-type` attribute (`light`/`dark`) allows CSS to target theme types without listing each theme name

**Adding a New Theme - Checklist:**
1. **Create theme file**: `src/theme/themes/{name}.js` - copy from existing theme of same type (light/dark)
2. **Set required properties**: `name`, `type` ('light' or 'dark'), `colors`, `shadows`, `metaThemeColor`
3. **Add i18n translations**: Add `"{name}": "Display Name"` to `theme.names` in both:
   - `src/i18n/locales/zh-TW.json`
   - `src/i18n/locales/en.json`
4. **Test contrast**: Especially for light themes, ensure `textMuted` and `textSecondary` are dark enough against the background (WCAG AA: 4.5:1 ratio minimum)
5. **Verify all UI states**: Check mode tags, buttons, inputs, tooltips, glass effects

**⚠️ CRITICAL - No Hardcoded Colors in Components:**
- **NEVER** write hex codes (`#FFFFFF`), RGB values (`rgb(255,255,255)`), or Tailwind color classes (`text-white`, `bg-blue-500`) directly in component CSS
- **ALWAYS** use CSS variables from the theme system: `var(--color-text-primary)`, `var(--color-brand-primary)`, etc.
- If a needed color token doesn't exist, **add it to the theme files** (`tokens.js` + all `themes/*.js`) first
- Example tokens: `textOnBrand` (text color for brand-colored buttons - white on blue, black on orange)

**⚠️ CRITICAL - Use Unified Brand Colors (Video Is the Only Exception):**
- **ALL non-video generation modes (generate, sticker, edit, story, diagram) MUST use `mode-generate` as the accent color**
- Video mode uses its own accent tokens: **`mode-video`** and **`mode-video-muted`** for video-specific UI (mode chips, video badges in history).
- **Do NOT create any additional mode-specific colors** like `mode-sticker`, `mode-story`, etc. The only allowed mode-specific tokens are `mode-video` and `mode-video-muted`.
- Selected states, buttons, icons, focus rings → use `mode-generate`, `mode-generate-muted`, `brand-primary` (or `mode-video` for video-only interactions).
- This ensures a consistent look across all themes (warm=orange, espresso=coffee, dark=blue, etc.) while allowing video mode to be visually distinct where needed.

### UI Z-Index Layers

Lightbox 及 OCR 編輯器相關元素使用高 z-index 值（9999+）以確保正確堆疊。

> **層級規範**: 詳見 [`docs/z-index-layers.md`](docs/z-index-layers.md)

**⚠️ 用戶偏好**:
- `region-sidebar` (10003) **必須在** `edit-toolbar` (10002) **之上**
- 當用戶打開側邊欄時，它應該覆蓋部分工具列

### User Tour (Onboarding)
First-time user guidance system:
- `composables/useTour.js` - Tour state management (Singleton pattern)
- `components/UserTour.vue` - Tour UI with spotlight effect and confetti celebration

**How it works:**
- Auto-starts for new users (checks `localStorage['nbp-tour-completed']`)
- 5 steps: API Key → Mode Selector → Prompt Input → Generate Button → History
- Keyboard navigation: `←` `→` to navigate, `ESC` to skip
- Version-controlled: bump `TOUR_VERSION` in `useTour.js` to force re-show after major updates
- Info button (ⓘ) in hero section to replay tour

### Reusable UI Components

- `SearchableSelect.vue` — Filterable dropdown (flat or grouped options, keyboard nav, click-outside close). See [`docs/searchable-select.md`](docs/searchable-select.md)

### Key Composables
- `useApi.js` - API requests, prompt building, SSE streaming
- `useGeneration.js` - High-level generation flow with callbacks
- `useImageStorage.js` - OPFS image persistence
- `useToast.js` - Toast notifications
- `useStyleOptions.js` - Style/variation option definitions
- `useTour.js` - User tour/onboarding state (Singleton pattern, localStorage persistence)
- `useApiKeyManager.js` - Dual API key management with automatic fallback
- `useSketchCanvas.js` - Fabric.js canvas for hand-drawing (see Sketch Canvas section)
- `useSketchHistory.js` - Undo/redo using Pinia store (see Sketch Canvas section)

### Sketch Canvas (Hand-Drawing Feature)

**⚠️ CRITICAL: 修改 Sketch Canvas 相關邏輯前，必須先閱讀 [`docs/sketch-history.md`](docs/sketch-history.md)**

手繪功能的 undo/redo 歷程管理有多個容易出錯的邊界條件：
- 歷程保留（同一張圖片再次編輯）
- 初始快照跳過（避免 undo 回到空白）
- 背景圖片序列化（`toJSON(['backgroundImage'])`）
- Pinia computed 響應式（必須用 `storeToRefs`）

| 檔案 | 職責 |
|------|------|
| `stores/generator.js` | `sketchHistory`, `sketchHistoryIndex`, `sketchEditingImageIndex` 狀態 |
| `composables/useSketchHistory.js` | undo/redo 邏輯，使用 store 狀態 |
| `composables/useSketchCanvas.js` | Fabric.js canvas 操作，`skipSnapshot` 參數 |
| `components/SketchCanvas.vue` | UI，決定何時跳過快照 |
| `components/ImageUploader.vue` | 呼叫 `startSketchEdit`，保存時更新 index |

### API Key 分流機制

本專案使用雙 API Key 架構來優化 API 使用成本：

**儲存位置：**
| Key Type | localStorage Key | 用途 |
|----------|------------------|------|
| 付費金鑰 (Primary) | `nanobanana-api-key` | 圖片/影片生成（強制使用） |
| Free Tier 金鑰 (Secondary) | `nanobanana-free-tier-api-key` | 文字處理（優先使用） |

**使用情境分類：**
| 功能 | Usage Type | 優先金鑰 | Fallback |
|------|------------|----------|----------|
| 圖片生成 | `image` | 付費 | ❌ 無 |
| 影片生成 | `image` | 付費 | ❌ 無 |
| 角色萃取 | `text` | Free Tier | ✅ 付費 |
| 簡報風格分析 | `text` | Free Tier | ✅ 付費 |
| 其他文字處理 | `text` | Free Tier | ✅ 付費 |

**使用方式：**
```javascript
import { useApiKeyManager } from '@/composables/useApiKeyManager'

const { getApiKey, callWithFallback, hasApiKeyFor } = useApiKeyManager()

// 圖片生成：強制付費金鑰
const imageKey = getApiKey('image')

// 文字處理：自動 fallback (Free Tier → 付費)
const result = await callWithFallback(async (apiKey) => {
  const ai = new GoogleGenAI({ apiKey })
  return await ai.models.generateContent(...)
}, 'text')

// 檢查是否有可用金鑰
if (hasApiKeyFor('text')) { ... }
```

**注意事項：**
- 圖片/影片生成必須使用 `usage='image'`
- 文字處理使用 `usage='text'` 或 `callWithFallback`
- Free Tier 免費額度用罄時（429 錯誤）會自動切換到付費金鑰
- 免費額度狀態會在 1 小時後自動重置

### Constants
- `constants/defaults.js` - Default options per mode (`getDefaultOptions()`)
- `constants/imageOptions.js` - Available styles, ratios, resolutions
- `constants/modeStyles.js` - Mode tag CSS classes (Single Source of Truth for mode labels in History, Transfer, etc.)

### Vite Configuration
- `@` alias resolves to `./src`
- Injects `__APP_VERSION__` and `__BUILD_HASH__` globals
- PWA configured with workbox for offline support
- Base path changes to `/nbp-web-gen/` in GitHub Actions builds

### SEO & Static Route Generation

**⚠️ CRITICAL: When adding a new route, update these files:**

This project uses a postbuild script to generate static HTML files for each route, enabling:
- HTTP 200 responses for SPA routes on GitHub Pages (instead of 404)
- Unique meta tags (title, description, canonical, OG/Twitter) per page
- Better SEO indexing by search engines

| File | Purpose |
|------|---------|
| `src/router/seo-meta.js` | **SEO meta tags (Single Source of Truth)** |
| `src/router/index.js` | Vue Router route definitions (imports from seo-meta.js) |
| `scripts/postbuild.js` | Static HTML generation (imports from seo-meta.js) |

**Example: Adding a new `/my-feature` route**
1. Add meta to `src/router/seo-meta.js`:
```javascript
'/my-feature': {
  title: 'My Feature | Mediator - Feature Description',
  description: 'Detailed description for SEO...',
},
```
2. Add route to `src/router/index.js`:
```javascript
{
  path: '/my-feature',
  name: 'my-feature',
  component: () => import('@/views/MyFeatureView.vue'),
  meta: routeSeoMeta['/my-feature'],
},
```

## Code Patterns

- Vue 3 Composition API with `<script setup>`
- Pinia for state management (single store pattern)
- Tailwind CSS v4 for styling
- All API calls use SSE streaming when possible
- Generation results saved to history in background (non-blocking)
- **UI/Styling**: Always consider all themes (dark, light, warm, espresso, mocha, nord) when designing components
- **Theme Handling**: Use semantic color classes (`text-text-primary`, `bg-bg-muted`, `border-mode-generate`) or CSS variables (`var(--color-brand-primary)`) instead of hardcoded colors. **Never use hex/RGB values or Tailwind color utilities in component CSS.** If a token is missing, add it to the theme system first. See `src/theme/tokens.js` for the full mapping.
- **Mobile UX**: Design for touch - consider tap targets, gestures, screen sizes, and provide alternatives for hover-only interactions

## User Preferences

- **Version bumps**: Always create git tags (do NOT use `--no-git-tag-version`)
- **Pushing**: Always sync tags with `git push --follow-tags` or `git push && git push --tags`
- **Self-review**: After big/complex changes, auto-run `/review-current-changes` to self-review
- **Changelog & Version Bump Workflow**:
  1. **Before version bump**: Update changelog files with the target version number
     - `website/changelog.md` (zh-TW)
     - `website/en/changelog.md` (English)
     - Use `git log <last-tag>..HEAD --oneline --no-merges` to review commits since last release
     - Categorize: 新功能/New Features, 修復/Fixes, 文件/Documentation, 效能/Performance, 重構/Refactor
     - Include release date `_YYYY-MM-DD_` (use today's date)
  2. **Commit changelog**: Stage and commit the changelog updates
  3. **Version bump**: Run `npm version <patch|minor|major>` (creates tag automatically)
  4. **Verify**: Confirm the new tag matches the version written in changelog
  - **Structure**: Current minor version (e.g., v0.25.x) has detailed per-patch entries; "Earlier Versions" section contains summarized entries for previous minor versions grouped with theme descriptions
