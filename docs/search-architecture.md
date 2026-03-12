# Search Architecture

本文件說明智慧搜尋系統的技術架構，包含索引、搜尋引擎和同步機制。

## 架構概覽

```
┌─────────────────────────────────────────────────────────┐
│                   SearchModal.vue                       │
│              (UI：搜尋輸入、結果、篩選)                    │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│               useSearchWorker.js                        │
│          (Singleton Composable，管理 Worker 生命週期)     │
│      ┌─ CustomEvent 監聽 ─┐                             │
│      │  nbp-history-added  │                            │
│      │  nbp-history-deleted│                            │
│      │  nbp-history-cleared│                            │
│      │  nbp-history-imported│                           │
│      └─────────────────────┘                            │
└──────────────────────┬──────────────────────────────────┘
                       │ postMessage / onmessage
                       ▼
┌─────────────────────────────────────────────────────────┐
│                 search.worker.js                        │
│              (長駐 Web Worker)                           │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │   Orama DB   │  │Transformers.js│  │  IndexedDB    │ │
│  │ (BM25+Vector)│  │(Embeddings)  │  │  (Snapshot)   │ │
│  └──────────────┘  └──────────────┘  └───────────────┘ │
└─────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│                  search-core.js                         │
│       (純函式：extractText, chunkText, highlight)        │
└─────────────────────────────────────────────────────────┘
```

## 檔案職責

| 檔案 | 職責 | 修改時機 |
|------|------|----------|
| `src/components/SearchModal.vue` | 搜尋 UI、結果顯示、模式篩選 | 修改搜尋介面時 |
| `src/composables/useSearchWorker.js` | Singleton Worker 管理、事件監聽 | 修改 Worker 通訊或事件同步時 |
| `src/workers/search.worker.js` | Orama DB、嵌入模型、索引/搜尋/持久化 | 修改搜尋引擎或索引邏輯時 |
| `src/utils/search-core.js` | 純函式（文字擷取、分塊、去重、高亮） | 修改文字處理演算法時 |
| `src/utils/search-core.test.js` | search-core 測試 (~50+ tests) | 修改 search-core 後同步更新 |
| `src/utils/embedding-material.js` | 多模態 embedding 素材準備（per-mode 策略） | 修改圖片 embedding 邏輯時 |
| `src/utils/embedding-material.test.js` | embedding-material 測試 (~25 tests) | 修改 embedding-material 後同步更新 |

## 核心元件

### 1. Orama 搜尋引擎

**Schema**（維度根據 active provider 動態決定）:
```javascript
{
  parentId: 'string',           // 對應 history record ID
  chunkIndex: 'number',         // 分塊索引
  chunkText: 'string',          // 分塊文字（BM25 搜尋目標）
  chunkType: 'string',          // 'text' | 'image'
  imageIndex: 'number',         // 圖片在 images[] 中的索引（text chunks = -1）
  mode: 'string',               // 生成模式（篩選用）
  timestamp: 'number',          // 生成時間（排序用）
  embedding: 'vector[N]'        // 語意向量（Gemini=768d, Local=384d）
}
```

**自訂 CJK Tokenizer**:

Orama 預設 tokenizer 不支援中日韓文分詞。自訂 tokenizer 使用 unigram + bigram 策略：

| Unicode 範圍 | 內容 |
|-------------|------|
| `U+4E00–U+9FFF` | CJK 統一表意文字 |
| `U+3400–U+4DBF` | CJK Extension A |
| `U+20000–U+2A6DF` | CJK Extension B |
| `U+3040–U+309F` | 平假名 |
| `U+30A0–U+30FF` | 片假名 |
| `U+AC00–U+D7AF` | 韓文音節 |
| `U+FF00–U+FFEF` | 全形字元 |

### 2. Embedding 模型（雙 Provider）

每個 provider 有獨立的 chunk 參數和 embedding 維度：

| Provider | 模型 | 維度 | chunkSize | chunkOverlap | contextWindow | 多模態 |
|----------|------|------|-----------|--------------|---------------|--------|
| Gemini API | `gemini-embedding-2-preview` | 768 | 800 | 200 | 1200 | ✅ 文字+圖片 |
| Local (Transformers.js) | `intfloat/multilingual-e5-small` | 384 | 200 | 50 | 400 | ❌ 純文字 |

Gemini Embedding 2 支援多模態（文字+圖片統一向量空間），8K token 上限允許更大的 chunk（800 chars）。Local 384d 純文字用 200 chars 就足夠。

**E5 前綴規則**（Local provider）：
- 文件嵌入：`"passage: <text>"` — 索引時使用
- 查詢嵌入：`"query: <text>"` — 搜尋時使用

### 3. 分塊策略 (Chunking)

分塊參數由 active provider 決定（見上表），無 provider 時使用 `SEARCH_DEFAULTS`（cs200/co50/cw500）。

分塊時優先在句子邊界（`。？！.?!\n`）斷開，避免在句子中間切割。

### 4. 文字擷取 (extractText)

不同模式的文字來源不同：

| 模式 | 文字來源 |
|------|----------|
| 一般模式 | `prompt` + `thinkingText` |
| 簡報模式 | `prompt` + `pagesContent[]` 各頁文字 |
| Agent 模式 | 使用者訊息（從 OPFS conversation.json 擷取） |

### 5. 多模態圖片 Embedding (Gemini 專屬)

Gemini Embedding 2 支援文字+圖片的統一向量空間，啟用「以文搜圖」和「以圖搜圖」功能。

**架構：**
- `embedding-material.js` — 純函式，依模式決定每筆記錄要 embed 的圖片及搭配文字
- Worker 透過 OPFS 讀取 WebP 圖片 → OffscreenCanvas 轉 PNG → base64 → REST `embedContent` endpoint
- 每張圖片 = 一個 `chunkType='image'` 的 child chunk（搭配文字存於 `chunkText` 供 BM25 搜尋）
- 繞過 SDK 直接用 REST：SDK 內部走 `batchEmbedContents` endpoint 不支援 `inlineData`

**Per-Mode 策略：**

| 模式 | 搭配文字 | 要 embed 的圖片 |
|------|----------|-----------------|
| generate | `prompt` | 全部 `images[]` |
| sticker | `prompt` | 只有 `images[0]`（原始貼圖表） |
| edit | `prompt` | 全部 `images[]` |
| story | `prompt` | 全部 `images[]` |
| diagram | `prompt` | 全部 `images[]` |
| slides | 每頁 `pageContent + narrationScript`（前 1024 chars） | 每頁一張 |
| agent | `prompt` | 全部 `images[]` |
| video | — | 無圖片 |

**Local provider** 不支援多模態，圖片 chunks 在 local provider 下自動跳過。

## 搜尋流程

### 搜尋策略

| 策略 | 方法 | 說明 |
|------|------|------|
| `hybrid` | BM25 + Vector | 混合搜尋，預設策略 |
| `vector` | Vector only | 純語意搜尋（cosine similarity，門檻 0.5） |
| `fulltext` | BM25 only | 純關鍵字比對 |

### 結果處理流程

```
Orama 原始結果（可能有同一紀錄的多個 chunk）
    ↓
deduplicateByParent()  — 每個 parentId 保留最高分的 chunk
    ↓
限制 10 筆結果
    ↓
highlightSnippet()  — HTML escape + <mark> 標記
    ↓
回傳給 SearchModal 顯示
```

### 安全性

`highlightSnippet()` 先做 HTML escape 再加 `<mark>` 標記，防止 XSS 攻擊。在 Vue 中使用 `v-html` 時是安全的。

## 持久化

### IndexedDB 快照（Per-Provider 獨立）

| 項目 | 值 |
|------|-----|
| Database | `nanobanana-search` |
| Object Store | `orama-snapshot` |
| IDB Version | 3 |
| Snapshot Version | 5 |

**Per-Provider 儲存結構**：
```text
orama-snapshot store:
  key: 'snapshot-gemini' → { version: 5, configVersion: 'cs800_co200_cw1200_ev3', docs: [...] }
  key: 'snapshot-local'  → { version: 5, configVersion: 'cs200_co50_cw400_ev3', docs: [...] }
```

每個 doc 包含 `chunkType` 和 `imageIndex` 以區分文字和圖片分塊：
```javascript
{ parentId, chunkIndex, chunkText, chunkType, imageIndex, contextText, mode, timestamp, embedding }
```

**Provider 切換**：save 當前 snapshot → load 目標 snapshot → rebuild Orama。
兩個 provider 的 snapshot 互不影響，切換後不需重新 embed。

**冷啟動流程**：
1. 執行 `migrateV3SnapshotIfExists()`（一次性 legacy 遷移，多數情況為 no-op）
2. 從 IndexedDB 載入 active provider 的 snapshot
3. 僅恢復 `version === 5` 且 `configVersion` 相符的 snapshot；否則丟棄並全量重建
4. 建立 Orama DB + bulk insert（立即可搜尋）
5. 下載/初始化嵌入模型
6. 執行 selfHeal 檢查遺漏

**暖啟動**：快照已載入 → 模型已在記憶體 → sub-100ms 回應

### Embedding 快取

| 項目 | 值 |
|------|-----|
| Key 格式 | `"provider:parentId:chunkIndex"` |
| 最大數量 | 5000 筆 |
| 生命週期 | Session 內有效（不跨頁面載入） |
| 淘汰策略 | FIFO（超過上限時刪除最早寫入的） |

## 索引同步

### CustomEvent 機制

| 事件 | 觸發位置 | 動作 |
|------|----------|------|
| `nbp-history-added` | `generator.js:addToHistory` | 即時索引新紀錄 |
| `nbp-history-deleted` | `generator.js:removeFromHistory` | 依 parentId 移除 |
| `nbp-history-cleared` | `generator.js:clearHistory` | 清空全部索引 + 快照 |
| `nbp-history-imported` | `GenerationHistory.vue:handleImported` | 觸發 selfHeal 補索引 |

### selfHeal 自我修復

開啟 SearchModal 時自動執行：

1. **比對** — 歷史紀錄 IDs vs 索引中的 parentIds
2. **清孤兒** — 索引有但歷史沒有 → 移除
3. **補缺失** — 歷史有但索引沒有 → 回傳 missingIds → 主執行緒讀取紀錄 → 送回 Worker 索引

### 批次處理

| 參數 | 值 |
|------|-----|
| 批次大小 | 50 筆 |
| 進度回報 | 每批次完成後 |
| 未快取 embedding | 同批次一次呼叫模型 |

## 修改指引

### 修改搜尋 UI
→ 只改 `SearchModal.vue`

### 修改文字擷取 / 分塊 / 高亮邏輯
→ 改 `search-core.js` + 更新 `search-core.test.js`

### 修改搜尋引擎 / 索引策略
→ 改 `search.worker.js`

### 修改 Worker 通訊 / 事件同步
→ 改 `useSearchWorker.js`

### 新增生成模式的搜尋支援
1. 在 `search-core.js:extractText()` 加入該模式的文字擷取邏輯
2. 在 `embedding-material.js` 加入該模式的圖片 embedding 策略
3. 在 `SearchModal.vue` 的模式篩選 chips 加入新模式
4. 更新 `search-core.test.js` 和 `embedding-material.test.js` 測試

### 修改圖片 Embedding 策略
→ 改 `embedding-material.js` + 更新 `embedding-material.test.js`

## 設計決策

| 決策 | 原因 |
|------|------|
| Singleton Worker | 避免多個元件重複建立 Worker 和載入模型 |
| 快照持久化 | 冷啟動時不需重新 embed 所有紀錄 |
| Per-Provider 獨立快照 | 每個 provider 有自己的 chunk 參數和 embedding，互不依賴 |
| Gemini cs800 / Local cs200 | Gemini Embedding 2 有 8K token 上限，cs800 減少 API 呼叫次數 |
| Multimodal 聚合 embedding | 每張圖片 + 文字 = 一個 embedding，平衡語意豐富度與 API 效率 |
| Sticker 只 embed 原始表 | 分割後的個別貼圖與原始表重複，避免冗餘 embedding |
| Local 跳過圖片 | e5-small 不支援多模態，graceful degradation |
| REST → SDK 遷移 | 與專案其他 composable 統一使用 `@google/genai` |
| CustomEvent 同步 | 解耦搜尋模組與歷史模組，不修改現有 IndexedDB schema |
| CJK 自訂 tokenizer | Orama 預設不支援中日韓文分詞 |
| E5 multilingual | 同時支援中英文語意搜尋 |
| 結果限制 10 筆 | 避免大量結果影響 UI 效能 |
