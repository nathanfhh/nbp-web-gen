# Z-Index 層級規範

本文檔定義了專案中所有 z-index 的層級關係，確保 UI 元素正確堆疊。

## 設計原則

1. **Modal 類組件**使用最高層級 (10010)，確保在所有 UI 之上
2. **Lightbox 相關元素**使用 9999-10004 的 z-index
3. **OCR 編輯器工具列**低於**區域側邊欄**，這是用戶偏好設定
4. 同一功能區的元素應使用連續的數值，便於維護
5. **需要互動的高層元素必須 Teleport 到 body**，避免被父元素的 stacking context 限制

## 完整層級表

### 搜尋 Modal（Lightbox 之下）

| z-index | 元素 | 檔案 | 說明 |
|---------|------|------|------|
| **9990** | `SearchModal` | `SearchModal.vue` | RAG 搜尋 Modal（低於 Lightbox，點擊結果可開啟 Lightbox 覆蓋其上） |

### Modal 類（最高層級）

| z-index | 元素 | 檔案 | 說明 |
|---------|------|------|------|
| **10010** | `ConfirmModal` | `ConfirmModal.vue` | 確認對話框 |
| **10010** | `ApiKeyModal` | `ApiKeyModal.vue` | API Key 設定 |
| **10010** | `OcrSettingsModal` | `OcrSettingsModal.vue` | OCR 設定 |
| **10010** | `InpaintConfirmModal` | `InpaintConfirmModal.vue` | Inpaint 確認 |
| **10010** | `PreviewLightbox` | `PreviewLightbox.vue` | 預覽 Lightbox |
| **10010** | `Mp4QualityModal` | `Mp4QualityModal.vue` | MP4 品質選擇 |

> **規則**：所有 Modal 統一使用 z-index: 10010，確保在所有其他 UI 之上。SearchModal 例外使用 9990，允許 Lightbox 覆蓋其上。

### Lightbox 相關元素

| z-index | 元素 | 檔案 | Teleport | 說明 |
|---------|------|------|----------|------|
| 9999 | `.lightbox-overlay` | `ImageLightbox.vue` | ✅ body | Lightbox 背景遮罩 |
| 10000 | `.text-dialog-overlay` | `OcrRegionEditor.vue` | ✅ body | 文字編輯對話框遮罩 |
| 10001 | `.text-dialog`, `.keyboard-hint` | `OcrRegionEditor.vue` | ✅ body | 文字編輯對話框、鍵盤提示 |
| **10002** | **`.edit-toolbar`** | `OcrRegionEditor.vue` | **✅ body** | **OCR 編輯工具列** |
| 10002 | `.sticker-lightbox` | `StickerLightbox.vue` | ✅ body | Sticker Lightbox |
| **10003** | **`.region-sidebar`** | `ImageLightbox.vue` | **✅ body** | **區域列表側邊欄** |
| 10003 | `.cropper-lightbox` | `StickerCropper.css` | ✅ body | Cropper Lightbox |
| 10004 | `.region-sidebar-toggle` | `ImageLightbox.vue` | ✅ body | 側邊欄開關按鈕 |

### UserTour 相關

| z-index | 元素 | 說明 |
|---------|------|------|
| 10000 | `.tour-backdrop` | Tour 背景遮罩 |
| 10001 | `.tour-spotlight` | Spotlight 高亮 |
| 10002 | `.tour-highlight-ring` | 高亮環 |
| 10003 | `.tour-tooltip` | 提示框 |

### Lightbox 內部層級（相對於 `.lightbox-overlay`）

這些元素在 lightbox 內部，使用較低的 z-index：

| z-index | 元素 | 說明 |
|---------|------|------|
| 1 | SVG Overlay (inline style) | OCR 區域標記覆蓋層（必須在圖片之上） |
| 10 | `.lightbox-content-wrapper` | 內容包裝器 |
| 20 | `.lightbox-toolbar` | 頂部工具列 |
| 30 | `.download-menu` | 下載選單 |

## 用戶偏好

> **重要**：`region-sidebar` (10003) 必須在 `edit-toolbar` (10002) **之上**。
>
> 當用戶打開側邊欄時，它應該覆蓋部分工具列，而不是被工具列遮擋。

## ⚠️ Stacking Context 陷阱

當元素在不同的 stacking context 時，z-index 無法跨 context 比較。

**錯誤示例**：
```
body
├── .lightbox-overlay (z-index: 9999) ← 建立新的 stacking context
│   └── .region-sidebar (z-index: 10003) ← 只在 overlay 內有效！
└── .edit-toolbar (z-index: 10002) ← 直接在 body，會蓋過 overlay 內的元素
```

**正確做法**：
```
body
├── .lightbox-overlay (z-index: 9999)
├── .edit-toolbar (z-index: 10002) ← Teleport to body
├── .region-sidebar (z-index: 10003) ← Teleport to body
├── .region-sidebar-toggle (z-index: 10004) ← Teleport to body
└── Modal (z-index: 10010) ← 最高層級
```

**結論**：所有需要高 z-index 互動的元素必須 **Teleport 到同一個父層級（body）**。

## 修改指南

### 新增 Modal 類組件

1. 使用 `z-[10010]` 作為 z-index
2. 使用 `<Teleport to="body">` 包裹
3. 更新此文檔

### 新增 Lightbox 內元素

1. 查閱此文檔確定應使用的 z-index 範圍（9999-10004）
2. 使用連續的數值，避免跳躍
3. 如需高於其他元素，考慮使用 Teleport
4. 更新此文檔

### 調整層級

1. 修改相關檔案的 z-index
2. **同步更新此文檔**
3. 測試所有相關功能的互動

## 歷史變更

| 日期 | 變更 | 原因 |
|------|------|------|
| 2026-01-21 | 將 `edit-toolbar` 從 29 提升到 10002 | 修復被 lightbox 遮擋的問題 |
| 2026-01-21 | 將 `region-sidebar` 從 30 提升到 10003 | 確保在 toolbar 之上（用戶偏好） |
| 2026-01-21 | 將 `region-sidebar-toggle` 從 31 提升到 10004 | 配合 sidebar 層級調整 |
| 2026-01-21 | 將 `region-sidebar` 和 `toggle` Teleport 到 body | 解決 stacking context 限制 |
| 2026-01-21 | SVG Overlay 加入 `z-index: 1` | 確保區域標記顯示在圖片之上 |
| 2026-01-21 | 所有 Modal 統一提升到 z-index: 10010 | 確保 Modal 在所有 UI 之上 |
| 2026-01-31 | 新增 `Mp4QualityModal` (z-index: 10010) | MP4 品質選擇功能 |
| 2026-02-14 | 新增 `SearchModal` (z-index: 9990) | RAG 搜尋功能，低於 Lightbox 層以支援從搜尋結果開啟 Lightbox |
