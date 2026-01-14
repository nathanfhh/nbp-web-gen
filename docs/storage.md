# Storage Architecture

本文件說明 Nano Banana Pro Web Gen 的資料儲存架構，包含三個儲存層：localStorage、IndexedDB 和 OPFS。

## 概述

| 儲存層 | 用途 | 容量限制 | 資料類型 |
|--------|------|----------|----------|
| localStorage | 輕量設定、API Key | ~5-10MB | JSON/String |
| IndexedDB | 歷史紀錄、角色元資料 | 50MB+ | 結構化資料 |
| OPFS | 圖片二進位檔案 | 1GB+ | Binary/Blob |

---

## 1. localStorage

**檔案**: `src/composables/useLocalStorage.js`

### 儲存項目

| Key | 類型 | 說明 | 範例值 |
|-----|------|------|--------|
| `nanobanana-api-key` | String | Gemini API Key | `AIza...` |
| `nanobanana-settings` | JSON | 快速設定容器 | 見下方 |
| `nbp-theme` | String | 主題名稱 | `dark`, `light`, `warm`... |
| `nbp-locale` | String | 語系 | `zh-TW`, `en` |
| `nbp-tour-completed` | JSON | 導覽完成狀態 | `{ version: 1, completedAt: ... }` |

### `nanobanana-settings` 內容

```javascript
{
  currentMode: 'generate',        // 目前模式
  temperature: 1.0,               // API 溫度參數
  seed: 0,                        // 隨機種子
  generateOptions: { ... },       // Generate 模式選項
  editOptions: { resolution: '1k' },
  storyOptions: { ... },
  diagramOptions: { ... },
  stickerOptions: { ... }
}
```

### 存取方式

```javascript
const { getApiKey, setApiKey, getQuickSetting, updateQuickSetting } = useLocalStorage()

// API Key
const apiKey = getApiKey()
setApiKey('AIza...')

// 設定
const mode = getQuickSetting('currentMode', 'generate')
updateQuickSetting('temperature', 0.8)
```

---

## 2. IndexedDB

**檔案**: `src/composables/useIndexedDB.js`

### 資料庫設定

- **名稱**: `nanobanana-generator`
- **版本**: 4
- **Object Stores**: `history`, `characters`

### Object Store: `history`

儲存所有生成歷史紀錄。

**Schema**:
- Key Path: `id` (auto-increment)
- Indexes: `timestamp`, `mode`, `uuid`

**欄位**:

| 欄位 | 類型 | 說明 |
|------|------|------|
| `id` | Number | 主鍵 (自動產生) |
| `uuid` | String | 跨裝置同步識別碼 |
| `timestamp` | Number | 建立時間戳 |
| `mode` | String | 生成模式 |
| `prompt` | String | 使用的 Prompt |
| `temperature` | Number | 溫度設定 |
| `seed` | Number | 種子值 |
| `options` | Object | 模式特定選項 |
| `generationTime` | Number | 生成耗時 (ms) |
| `images` | Array | 圖片元資料陣列 |

**`images` 陣列項目**:

| 欄位 | 類型 | 說明 |
|------|------|------|
| `index` | Number | 圖片索引 |
| `opfsPath` | String | OPFS 路徑 |
| `thumbnail` | String | Base64 縮圖 |
| `width` | Number | 寬度 (px) |
| `height` | Number | 高度 (px) |
| `originalSize` | Number | 原始大小 (bytes) |
| `compressedSize` | Number | 壓縮後大小 (bytes) |

### Object Store: `characters`

儲存角色定義。

**Schema**:
- Key Path: `id` (auto-increment)
- Indexes: `name`, `createdAt`

**欄位**:

| 欄位 | 類型 | 說明 |
|------|------|------|
| `id` | Number | 主鍵 (自動產生) |
| `uuid` | String | 跨裝置同步識別碼 |
| `name` | String | 角色名稱 |
| `description` | String | 角色描述 |
| `physicalTraits` | Object | 身體特徵 |
| `clothing` | String | 服裝描述 |
| `accessories` | Array | 配件列表 |
| `distinctiveFeatures` | Array | 特殊特徵 |
| `thumbnail` | String | Base64 縮圖 (用於 Carousel 快速顯示) |
| `createdAt` | Number | 建立時間戳 |
| `updatedAt` | Number | 更新時間戳 |

> **注意**: `imageData` 欄位已棄用，完整圖片現存於 OPFS。

### 存取方式

```javascript
const { addHistory, getHistory, deleteHistory, addCharacter, getCharacterById } = useIndexedDB()

// 歷史
const history = await getHistory(50) // 取得最近 50 筆
await addHistory({ mode, prompt, images, ... })

// 角色
const character = await getCharacterById(123)
const newId = await addCharacter({ name, description, thumbnail, ... })
```

---

## 3. OPFS (Origin Private File System)

**檔案**:
- `src/composables/useOPFS.js` - 底層 OPFS 操作
- `src/composables/useImageStorage.js` - 歷史圖片儲存
- `src/composables/useCharacterStorage.js` - 角色圖片儲存

### 目錄結構

```
/ (OPFS root)
├── images/
│   └── {historyId}/
│       ├── 0.webp
│       ├── 1.webp
│       └── ...
└── characters/
    └── {characterId}/
        └── image.webp
```

### 檔案格式

- **格式**: WebP
- **壓縮品質**: 0.85
- **大小**: 通常 100KB - 2MB/張

### 存取方式

```javascript
// 歷史圖片
const { saveGeneratedImages, loadImage, deleteHistoryImages } = useImageStorage()
await saveGeneratedImages(historyId, base64Images)
const imageUrl = await loadImage(opfsPath)

// 角色圖片
const { saveCharacterImage, loadCharacterImageWithFallback, deleteCharacterImage } = useCharacterStorage()
await saveCharacterImage(characterId, base64Data)
const imageData = await loadCharacterImageWithFallback(characterId, legacyData)
```

---

## 4. 資料流程圖

### 生成流程

```
User Input → API Call → Base64 Images
                            ↓
                    Compress to WebP
                            ↓
              ┌─────────────┴─────────────┐
              ↓                           ↓
         OPFS                        IndexedDB
    /images/{id}/*.webp         history record with
                                 image metadata[]
```

### 角色儲存流程

```
Character Extraction → Base64 Image
                            ↓
              ┌─────────────┴─────────────┐
              ↓                           ↓
         OPFS                        IndexedDB
  /characters/{id}/image.webp    character metadata
                                   + thumbnail
```

### 讀取流程

```
History Carousel              Character Carousel
      ↓                              ↓
  IndexedDB                     IndexedDB
(thumbnail base64)           (thumbnail base64)
      ↓                              ↓
   Quick Preview              Quick Preview
      ↓                              ↓
 User clicks image            User selects char
      ↓                              ↓
    OPFS                          OPFS
 Load full image             Load full image
```

---

## 5. 遷移機制

### 角色圖片遷移 (v0.16.0+)

舊版本將 `imageData` 存在 IndexedDB，新版本存在 OPFS。

**遷移時機**: App 初始化時自動執行

**遷移邏輯**:
```javascript
// generator.js initialize()
await characterStorage.migrateAllCharactersToOPFS({
  getAllCharacters,
  updateCharacter,
})
```

**向後相容**:
```javascript
// 讀取時自動 fallback
const imageData = await loadCharacterImageWithFallback(id, character.imageData)
```

---

## 6. 容量管理

### 查詢使用量

```javascript
const { storageUsage } = useGeneratorStore()
// storageUsage 包含 OPFS 總使用量
```

### 清理資料

```javascript
// 刪除單筆歷史 (含 OPFS 圖片)
await deleteHistory(historyId)

// 清除所有歷史
await clearAllHistory()

// 刪除角色 (含 OPFS 圖片)
await deleteCharacterImage(characterId)
await dbDeleteCharacter(characterId)
```

---

## 7. 瀏覽器支援

| 功能 | Chrome | Firefox | Safari | Edge |
|------|--------|---------|--------|------|
| localStorage | 4+ | 3.5+ | 4+ | 12+ |
| IndexedDB | 24+ | 16+ | 10+ | 12+ |
| OPFS | 86+ | 111+ | 15.2+ | 86+ |

---

## 8. 儲存冗餘分析

### 現況評估

| 項目 | 儲存位置 | 是否冗餘 | 說明 |
|------|----------|----------|------|
| API Key | localStorage | ❌ 否 | 單一儲存點 |
| 設定 (mode, temp, seed) | localStorage + Pinia | ❌ 否 | localStorage 持久化，Pinia 響應式運行時狀態 |
| 歷史紀錄元資料 | IndexedDB | ❌ 否 | 單一儲存點 |
| 歷史圖片 (完整) | OPFS | ❌ 否 | 單一儲存點 |
| 歷史圖片縮圖 | IndexedDB | ❌ 否 | 刻意設計，避免每次都讀 OPFS |
| 角色元資料 | IndexedDB | ❌ 否 | 單一儲存點 |
| 角色圖片 (完整) | OPFS | ❌ 否 | 單一儲存點 (遷移後) |
| 角色縮圖 | IndexedDB | ❌ 否 | 刻意設計，Carousel 快速顯示 |
| 角色 imageData (遺留) | IndexedDB | ⚠️ 遷移中 | 舊版資料，會自動遷移至 OPFS |

### 遷移期間的暫時性冗餘

在 v0.16.0 之前建立的角色，`imageData` 欄位可能同時存在於：
- IndexedDB (舊位置)
- OPFS (新位置)

**自動清理機制**:
- App 初始化時執行 `migrateAllCharactersToOPFS()`
- 遷移完成後，IndexedDB 的 `imageData` 欄位會被設為 `undefined`（透過 `JSON.stringify` 自動移除）

### 設計決策說明

#### 為什麼縮圖存在 IndexedDB 而不是 OPFS？

**目的**: 減少 Carousel 批次載入時的 I/O 次數

```
方案 A: 縮圖在 OPFS
  History Carousel → 讀 IndexedDB (meta) → N 次讀 OPFS (thumbnails) → 顯示
  = 1 + N 次 async I/O

方案 B: 縮圖在 IndexedDB (目前設計)
  History Carousel → 讀 IndexedDB (meta + thumbnails) → 顯示
  = 1 次 async I/O (批次查詢)
```

**注意**: 這不是因為「OPFS 讀取成本高」（OPFS 其實很快），而是減少 I/O 次數的優化。縮圖約 5-10KB，內嵌在 IndexedDB 記錄中可一次查詢取得。

#### 為什麼設定同時存在 localStorage 和 Pinia？

```
localStorage: 持久化儲存 (跨 session)
     ↓
   App 啟動
     ↓
Pinia Store: 響應式運行時狀態 (Vue reactivity)
     ↓
   使用者操作
     ↓
   Watcher 同步回 localStorage
```

這是 Vue 應用的標準模式，不是冗餘。

---

## 9. 潛在改進方向

### 已規劃

- [x] 角色圖片遷移至 OPFS (v0.16.0)

### 可考慮的未來優化

| 優化項目 | 影響 | 優先級 |
|----------|------|--------|
| IndexedDB 壓縮 (縮圖用 AVIF) | 縮小 30-50% | 低 |
| 批次讀取 OPFS 圖片 | 減少 I/O 次數 | 中 |
| Service Worker 快取層 | 離線體驗 | 低 |

---

## 相關檔案

- `src/composables/useLocalStorage.js` - localStorage 操作
- `src/composables/useIndexedDB.js` - IndexedDB 操作
- `src/composables/useOPFS.js` - OPFS 底層操作
- `src/composables/useImageStorage.js` - 歷史圖片儲存
- `src/composables/useCharacterStorage.js` - 角色圖片儲存
- `src/stores/generator.js` - Pinia Store (整合各儲存層)
