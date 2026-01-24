# Slide to PPTX 設定與編輯行為說明

本文件說明「投影片轉 PPTX」功能中，各項設定調整後的觸發行為與生效時機。

---

## 一、進階設定 (OcrSettingsModal)

當使用者關閉進階設定 Modal 時，會觸發 `remergeAllSlides()`，**僅重新計算文字區塊合併**，不會重新執行 OCR 或 Inpaint。

### 生效時機表

| 分類 | 參數 | 調整後行為 | 生效時機 |
|------|------|------------|----------|
| **前處理** | `maxSideLen` | 影響 OCR 輸入圖片尺寸 | 下次「開始轉換」 |
| **偵測** | `threshold` | 影響 DBNet 二值化閾值 | 下次「開始轉換」 |
| **偵測** | `boxThreshold` | 影響文字框最低信心值 | 下次「開始轉換」 |
| **後處理** | `unclipRatio` | 影響文字框膨脹比例 | 下次「開始轉換」 |
| **後處理** | `dilationH` | 影響水平形態學膨脹 | 下次「開始轉換」 |
| **後處理** | `dilationV` | 影響垂直形態學膨脹 | 下次「開始轉換」 |
| **版面分析** | `verticalCutThreshold` | 影響直欄分割判斷 | **立即** (remerge) |
| **版面分析** | `horizontalCutThreshold` | 影響段落分割判斷 | **立即** (remerge) |
| **版面分析** | `sameLineThreshold` | 影響同一行判斷 | **立即** (remerge) |
| **版面分析** | `fontSizeDiffThreshold` | 影響字體大小差異合併 | **立即** (remerge) |
| **版面分析** | `colorDiffThreshold` | 影響顏色差異合併 | **立即** (remerge) |
| **匯出** | `lineHeightRatio` | 影響字體大小計算 | 下次匯出時 |
| **匯出** | `minFontSize` | 限制最小字體 | 下次匯出時 |
| **匯出** | `maxFontSize` | 限制最大字體 | 下次匯出時 |

### 重點說明

- **立即生效 (remerge)**：關閉設定 Modal 後，已處理完成的投影片會立即重新合併文字區塊，**不需要重新處理**
- **下次「開始轉換」**：這些參數影響 OCR 辨識本身，需要重新上傳或重新執行處理流程才會套用

---

## 二、處理設定 (主畫面)

這些設定位於主畫面，調整後會在**下次按下「開始轉換」時生效**。

| 參數 | 說明 | 生效時機 |
|------|------|----------|
| `inpaintMethod` | 文字移除方法 (OpenCV / Gemini) | 下次「開始轉換」 |
| `opencvAlgorithm` | OpenCV 演算法 (TELEA / NS) | 下次「開始轉換」 |
| `inpaintRadius` | Inpaint 半徑 | 下次「開始轉換」 |
| `maskPadding` | 遮罩邊緣擴展 | 下次「開始轉換」 |
| `slideRatio` | 輸出投影片比例 (auto/16:9/4:3/9:16) | 下次「開始轉換」或匯出時 |
| `geminiModel` | Gemini 模型版本 (2.0/3.0) | 下次「開始轉換」或重新生成時 |
| `imageQuality` | Gemini 3.0 輸出品質 (1k/2k/4k) | 下次「開始轉換」或重新生成時 |
| `modelSize` | OCR 模型尺寸 (server/mobile) | 下次「開始轉換」 |

---

## 三、編輯模式功能

進入編輯模式後，使用者可以對文字區域進行各種操作。

### 操作行為表

> **注意**：編輯模式下用戶看到的是 rawRegions（原始辨識框），merged regions 只在主畫面顯示。
> 因此 `remergeMergedRegions()` 的效果要**退出編輯模式後**才會在主畫面看到。

| 功能 | 觸發行為 | 何時呼叫 remerge |
|------|----------|------------------|
| **刪除單一區域** | 更新 `editedRawRegions` | 退出編輯模式時 |
| **批次刪除區域** | 更新 `editedRawRegions` | 退出編輯模式時 |
| **新增手繪區域** | 更新 `editedRawRegions` | 退出編輯模式時 |
| **調整區域大小** | 更新 `editedRawRegions` | 退出編輯模式時 |
| **新增分隔線** | 更新 `separatorLines` + `remergeMergedRegions()` | 操作時（但效果退出後可見） |
| **刪除分隔線** | 更新 `separatorLines` + `remergeMergedRegions()` | 操作時（但效果退出後可見） |
| **復原 (Undo)** | 還原 snapshot + `remergeMergedRegions()` | 操作時（但效果退出後可見） |
| **重做 (Redo)** | 還原 snapshot + `remergeMergedRegions()` | 操作時（但效果退出後可見） |
| **重設區域** | 清空編輯 + 還原背景圖 + `remergeMergedRegions()` | 操作時（但效果退出後可見） |

**設計考量**：分隔線/Undo/Redo 操作時就呼叫 remerge，雖然用戶在編輯模式下看不到效果，但這樣做更單純 — 純計算沒有副作用，退出後保證結果正確。

### 離開編輯模式時的處理邏輯

當使用者點擊「完成」離開編輯模式時，系統會根據變更類型決定行為：

```
┌─────────────────────────────────────────────────────────────────┐
│                      離開編輯模式判斷流程                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ 有任何變更嗎？   │
                    └─────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │ 無            │               │ 有
              ▼               ▼               ▼
         ┌────────┐    ┌─────────────┐  ┌─────────────┐
         │ 不處理  │    │ 只有分隔線   │  │ 區域有變更   │
         └────────┘    │ 變更？       │  │            │
                       └─────────────┘  └─────────────┘
                              │                │
                              ▼                ▼
                       ┌─────────────┐  ┌─────────────────────┐
                       │ 僅 remerge  │  │ 檢查 inpaintMethod  │
                       │ (無 API)    │  └─────────────────────┘
                       └─────────────┘         │
                                    ┌──────────┴──────────┐
                                    │                     │
                                    ▼                     ▼
                             ┌─────────────┐       ┌─────────────┐
                             │  OpenCV     │       │   Gemini    │
                             └─────────────┘       └─────────────┘
                                    │                     │
                                    ▼                     ▼
                             ┌─────────────┐       ┌─────────────────┐
                             │ 直接重新處理 │       │ 顯示確認 Modal   │
                             │ (本地運算)   │       │ • 重新生成       │
                             └─────────────┘       │ • 使用現有圖片   │
                                                   └─────────────────┘
```

### Gemini 確認 Modal

當使用 Gemini 方法且區域有變更時，會顯示確認 Modal：

| UI 元素 | 說明 |
|---------|------|
| 原始圖片 | 顯示原始投影片圖片 |
| 上次生成結果 | 顯示目前的背景圖（若尚未生成則顯示「尚未生成」） |
| 額外指示輸入框 | 使用者可輸入自訂提示詞，會附加到基本提示詞後 |
| 「使用現有圖片」按鈕 | 跳過 API 呼叫，僅執行 remerge |
| 「重新生成」按鈕 | 呼叫 Gemini API 重新生成背景圖 |

**重要：**
- Modal **沒有**關閉按鈕（X）
- 點擊 Modal 外部**不會**關閉
- 按 ESC 鍵**不會**關閉
- 使用者**必須**選擇其中一個按鈕

### 自訂提示詞持久化

- 每張投影片的自訂提示詞會儲存在 `state.customInpaintPrompt`
- 下次編輯同一張投影片時，會預填上次的自訂提示詞

---

## 四、觸發時機總覽

### 關閉 Modal / 退出編輯模式後生效 (僅重新計算，無 API)

| 操作 | 觸發函式 | 說明 |
|------|----------|------|
| 關閉進階設定 Modal | `remergeAllSlides()` | 所有已處理投影片重新合併 |
| 退出編輯模式 | `remergeMergedRegions()` | 當前投影片重新合併 |

### 下次「開始轉換」生效

| 設定類型 | 說明 |
|----------|------|
| OCR 參數 (前處理、偵測、後處理) | 需要重新執行 OCR |
| 模型尺寸 (modelSize) | 需要重新載入模型並執行 OCR |
| 處理設定 (inpaintMethod 等) | 需要重新執行 Inpaint |

### 離開編輯模式時生效

| 變更類型 | 處理方式 |
|----------|----------|
| 僅分隔線變更 | 僅 remerge |
| 區域變更 + OpenCV | 直接重新 inpaint |
| 區域變更 + Gemini | 顯示確認 Modal 讓使用者決定 |

---

## 五、技術細節

### remerge vs reprocess 的差異

| 操作 | 說明 | 消耗 |
|------|------|------|
| **remerge** | 使用現有的 rawRegions 重新計算合併文字框 | 純本地運算，無 API 費用 |
| **reprocess** | 重新執行 Inpaint 產生新的背景圖 | OpenCV: 本地運算 / Gemini: API 費用 |

### 圖片尺寸一致性

當 Gemini 返回的圖片尺寸與原圖不同時（例如原圖 1K，Gemini 返回 2K），系統會自動將結果縮放回原始尺寸，確保文字框座標對齊。

```javascript
// resizeImageToTarget(dataUrl, targetWidth, targetHeight)
// 確保 cleanImage 與 originalImage 尺寸一致
```

---

## 六、版本歷史功能

### 功能說明

每次重新生成背景圖時，系統會保留歷史版本供使用者選擇。

### 版本管理規則

| 項目 | 說明 |
|------|------|
| **第一個版本** | 永遠保留（`isOriginal: true`），無法刪除 |
| **後續版本** | 最多保留 5 個，超過時自動移除最舊的（FIFO） |
| **手動刪除** | 非原始版本可點擊右上角 X 刪除 |
| **最少數量** | 至少保留 1 個版本（原始版本） |

### 資料結構

```javascript
// slideState 新增欄位
{
  cleanImageHistory: [
    { image: 'data:...', timestamp: 1234567890, prompt: null, isOriginal: true },
    { image: 'data:...', timestamp: 1234567900, prompt: '保留 Logo', isOriginal: false },
  ],
  activeHistoryIndex: 1,  // 當前選中的版本
}
```

### UI 操作

| 元素 | 位置 | 功能 |
|------|------|------|
| **縮圖列** | 背景圖預覽下方 | 點擊切換版本 |
| **刪除按鈕** | 背景圖預覽右上角 | 刪除當前版本（非原始版本才顯示） |
| **選中標記** | 縮圖邊框高亮 | 顯示當前使用的版本 |

### 切換版本的行為

- **只切換 cleanImage**：不影響 regions 或其他編輯狀態
- **更新 cleanImageIsOriginal**：根據選中版本的 `isOriginal` 更新

---

## 七、重新處理確認邏輯（Gemini API 費用保護）

### 核心問題

當使用者按下「開始轉換」時，如果投影片**已經**使用 Gemini API 處理過，重新處理會產生額外費用。系統必須在以下情況**詢問使用者**：

- **Gemini → Gemini**：之前用 Gemini 處理，現在還是用 Gemini → **必須詢問**（會花錢）
- **Gemini → OpenCV**：之前用 Gemini 處理，現在改用 OpenCV → **不用詢問**（免費）
- **OpenCV → Gemini**：之前用 OpenCV 處理，現在改用 Gemini → **不用詢問**（首次用 Gemini，用戶預期要付費）
- **OpenCV → OpenCV**：之前用 OpenCV 處理，現在還是用 OpenCV → **不用詢問**（免費）

### 狀態追蹤

每張投影片使用 `inpaintMethodUsed` 欄位追蹤上次使用的處理方法：

```javascript
// slideState 欄位
{
  inpaintMethodUsed: 'gemini' | 'opencv' | null,  // 上次使用的方法
  cleanImage: 'data:...',                          // 處理後的背景圖
  status: 'done' | 'pending' | 'error',           // 處理狀態
}
```

**設定時機**：

| 位置 | 時機 | 設定值 |
|------|------|--------|
| `processSlide()` | 首次處理完成 | 根據使用的方法設定 |
| `reprocessSlide()` | 編輯模式重新處理完成 | 根據使用的方法設定 |

### 確認流程（processAll）

```
┌──────────────────────────────────────────────────────────────────┐
│                    processAll() 處理流程                          │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ 初始化 slideStates │
                    │ (保留 Gemini 處理  │
                    │  過的投影片資料)    │
                    └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ 迴圈處理每張投影片 │
                    └─────────────────┘
                              │
                              ▼
           ┌──────────────────────────────────────┐
           │ 檢查條件：                             │
           │ • state.inpaintMethodUsed === 'gemini' │
           │ • effectiveSettings.inpaintMethod === 'gemini' │
           │ • state.cleanImage 存在               │
           └──────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │ 不符合                        │ 符合
              ▼                               ▼
       ┌─────────────┐              ┌─────────────────────┐
       │ 直接處理     │              │ 已有「套用至剩餘」決策？│
       │ (不詢問)     │              └─────────────────────┘
       └─────────────┘                        │
                                   ┌──────────┴──────────┐
                                   │ 是                  │ 否
                                   ▼                     ▼
                            ┌─────────────┐       ┌─────────────┐
                            │ 套用該決策   │       │ 顯示確認 Modal │
                            │ (不再詢問)   │       └─────────────┘
                            └─────────────┘              │
                                                         ▼
                                                  ┌─────────────┐
                                                  │ 使用者選擇   │
                                                  └─────────────┘
                                                         │
                                   ┌─────────────────────┼─────────────────────┐
                                   │                     │                     │
                                   ▼                     ▼                     ▼
                            ┌─────────────┐       ┌─────────────┐       ┌─────────────┐
                            │ 使用現有圖片 │       │ 重新生成     │       │ 取消        │
                            │ (skip)      │       │ (regenerate) │       │ (cancel)    │
                            └─────────────┘       └─────────────┘       └─────────────┘
                                   │                     │                     │
                                   ▼                     ▼                     ▼
                            ┌─────────────┐       ┌─────────────┐       ┌─────────────┐
                            │ 保留 cleanImage │     │ 呼叫 Gemini │       │ 中止所有處理 │
                            │ 標記為 done   │       │ 更新 cleanImage │    └─────────────┘
                            └─────────────┘       └─────────────┘
```

### 「套用至剩餘投影片」功能

當使用者勾選「套用至剩餘投影片」時：

1. 系統記錄使用者的決策（`regenerate` 或 `skip`）
2. 後續符合條件的投影片**自動套用該決策**，不再顯示 Modal
3. 節省使用者逐張確認的時間

```javascript
// useSlideToPptx.js - processAll() 中的邏輯
let applyToRemainingAction = null  // 追蹤「套用至剩餘」決策

for (let i = 0; i < images.length; i++) {
  if (shouldAskUser) {
    if (applyToRemainingAction) {
      // 已有決策，直接套用
      decision = { action: applyToRemainingAction }
    } else {
      // 顯示 Modal，取得使用者決策
      decision = await onConfirmGeminiReprocess(i, state)
      if (decision.applyToRemaining) {
        applyToRemainingAction = decision.action  // 記錄決策
      }
    }
  }
}
```

### slideStates 初始化邏輯（關鍵！）

在 `processAll()` 開始時，會重新初始化 `slideStates`，**必須正確保留**已處理投影片的資料：

```javascript
slideStates.value = images.map((_, index) => {
  const existingState = slideStates.value[index]

  // 判斷是否為任何方法處理過（用於保留 originalImage）
  // Note: originalImage 在 processSlide 開始時就設定，所以有值就代表處理過
  const wasProcessed = existingState?.originalImage

  // 判斷是否為 Gemini 處理成功的投影片（用於確認 Modal）
  // Note: inpaintMethodUsed 和 cleanImage 只有在 inpaint 成功後才會設定
  // 所以不需要檢查 status === 'done'（這兩個欄位有值就代表成功）
  const hasGeminiCleanImage =
    existingState?.inpaintMethodUsed === 'gemini' &&
    existingState?.cleanImage

  return {
    status: 'pending',  // 重置狀態

    // ⚠️ 關鍵：Gemini 處理過的投影片必須保留這些資料
    cleanImage: hasGeminiCleanImage ? existingState?.cleanImage : null,
    inpaintMethodUsed: existingState?.inpaintMethodUsed || null,

    // ⚠️ 關鍵：所有處理過的投影片都必須保留 originalImage（用於 thumbnail 顯示）
    originalImage: wasProcessed ? existingState?.originalImage : null,
    width: wasProcessed ? existingState?.width : 0,
    height: wasProcessed ? existingState?.height : 0,

    // ... 其他欄位
  }
})
```

### 常見錯誤與檢查清單

⚠️ **開發此功能時必須檢查以下項目**：

| 檢查項目 | 說明 | 檔案位置 |
|----------|------|----------|
| `inpaintMethodUsed` 是否正確設定 | 每次 inpaint 完成後必須設定 | `useSlideToPptx.js` processSlide/reprocessSlide |
| `cleanImage` 是否正確保留 | Gemini 處理過的投影片在初始化時必須保留 | `useSlideToPptx.js` processAll 初始化 |
| `originalImage` 是否正確保留 | 所有處理過的投影片都必須保留（否則 thumbnail 會消失） | `useSlideToPptx.js` processAll 初始化 |
| 確認 Modal 是否正確顯示 | 條件：`inpaintMethodUsed === 'gemini' && inpaintMethod === 'gemini' && cleanImage` | `useSlideToPptx.js` processAll 迴圈 |
| 編輯模式確認是否獨立 | 編輯模式不使用「套用至剩餘」功能 | `SlideToPptxView.vue` exitEditMode |

### 測試情境

| 情境 | 預期行為 |
|------|----------|
| 10 張圖，8 張 Gemini + 2 張 OpenCV，按第二次「開始轉換」 | 8 張 Gemini 逐張詢問，2 張 OpenCV 不問 |
| 第一張選「重新生成」+ 勾選「套用至剩餘」 | 第 2-8 張自動重新生成，不再詢問 |
| 第一張選「使用現有圖片」+ 勾選「套用至剩餘」 | 第 2-8 張自動跳過，不再詢問 |
| 編輯模式調整區塊後退出 | 如果用 Gemini，顯示確認 Modal（無「套用至剩餘」選項） |
| 編輯模式調整區塊後，再按「開始轉換」 | 該張投影片會再次詢問（因為是 Gemini → Gemini） |
