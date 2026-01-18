# OCR Architecture Guide

本文件說明 OCR 模組的架構設計，以及維護時的修改指引。

## 架構概覽

```
┌─────────────────────────────────────────────────────────────────┐
│                        useOcr.js                                │
│                   (Unified Interface)                           │
│         自動選擇 WebGPU 或 WASM，處理設定同步                      │
└─────────────────────┬───────────────────────────────────────────┘
                      │
        ┌─────────────┴─────────────┐
        ▼                           ▼
┌───────────────────┐       ┌───────────────────┐
│ useOcrMainThread  │       │   useOcrWorker    │
│     (WebGPU)      │       │     (WASM)        │
│   Main Thread     │       │   Web Worker      │
└────────┬──────────┘       └────────┬──────────┘
         │                           │
         │    ┌──────────────────────┤
         │    │                      │
         ▼    ▼                      ▼
┌───────────────────┐       ┌───────────────────┐
│   ocr-core.js     │       │  ocr.worker.js    │
│  (Shared Logic)   │◄──────│  (Worker Entry)   │
└───────────────────┘       └───────────────────┘
         ▲
         │
┌───────────────────┐
│  ocrDefaults.js   │
│ (Parameters)      │
└───────────────────┘
```

## 檔案職責

### 共用層 (Single Source of Truth)

| 檔案 | 職責 | 修改時機 |
|------|------|----------|
| `src/utils/ocr-core.js` | OCR 核心演算法 | 修改偵測/辨識/Layout 邏輯時 |
| `src/constants/ocrDefaults.js` | 參數預設值與驗證規則 | 調整預設參數或新增參數時 |
| `src/composables/useOcrSettings.js` | 設定管理 (localStorage) | 修改設定 UI 或儲存邏輯時 |

### 執行層 (Platform-Specific)

| 檔案 | 職責 | 修改時機 |
|------|------|----------|
| `src/composables/useOcrMainThread.js` | WebGPU 執行環境 | 修改 GPU 專屬邏輯時 |
| `src/workers/ocr.worker.js` | WASM Worker 執行環境 | 修改 Worker 專屬邏輯時 |
| `src/composables/useOcrWorker.js` | Worker 通訊封裝 | 修改 Worker 通訊協定時 |
| `src/composables/useOcr.js` | 統一介面 | 修改引擎選擇邏輯時 |

## 修改指引

### 情境 1: 修改 OCR 演算法

**只需修改 `ocr-core.js`**

包含：
- `preprocessForDetection()` - 影像前處理
- `postProcessDetection()` - DBNet 後處理（二值化、膨脹、連通區域、Unclip）
- `preprocessForRecognition()` - 辨識前處理
- `decodeRecognition()` - CTC 解碼
- `mergeTextRegions()` - Layout 分析（XY-Cut）
- `createTesseractFallback()` - Tesseract fallback 工廠函數

```javascript
// 範例：調整 Layout 分析的行距閾值
// 只需修改 ocr-core.js 中的 performRecursiveXYCut()
const horizontalCut = findBestCut(regions, bounds, 'y', medianHeight * 0.3)
//                                                                    ^^^
//                                                              調整這個數值
```

### 情境 2: 修改 OCR 參數預設值

**只需修改 `ocrDefaults.js`**

```javascript
// 範例：調整預設的偵測閾值
export const OCR_DEFAULTS = {
  threshold: 0.3,      // DBNet 二值化閾值
  boxThreshold: 0.7,   // 框篩選閾值
  // ...
}
```

### 情境 3: 修改 ONNX 模型載入或快取

**需要修改兩個檔案**（邏輯相同，但 API 不同）

| 修改項目 | useOcrMainThread.js | ocr.worker.js |
|----------|---------------------|---------------|
| 模型 URL | `MODELS` 常數 | `MODELS` 常數 |
| OPFS 路徑 | `OPFS_DIR` 常數 | `OPFS_DIR` 常數 |
| Session 選項 | `sessionOptions` | `sessionOptions` |

```javascript
// 兩邊都要改的範例：更換模型
const MODELS = {
  detection: {
    filename: 'PP-OCRv5_server_det.onnx',  // 兩邊同步修改
    url: `${HF_BASE}/PP-OCRv5_server_det.onnx`,
    size: 88_000_000,
  },
  // ...
}
```

### 情境 4: 修改引擎選擇邏輯

**只需修改 `useOcr.js`**

包含：
- WebGPU 可用性檢測
- 自動 fallback 邏輯
- 設定同步時機

### 情境 5: 新增 OCR 參數

**需要修改多個檔案**

1. `ocrDefaults.js` - 新增預設值和驗證規則
2. `ocr-core.js` - 在對應函數中使用新參數
3. `useOcrSettings.js` - 確保新參數能被儲存/讀取
4. UI 元件 - 新增設定控制項

## ONNX 呼叫方式

CPU 和 GPU 都使用動態輸入/輸出名稱，確保一致性：

```javascript
// Detection
const detFeeds = { [detSession.inputNames[0]]: detTensor }
const detOutput = await detSession.run(detFeeds)
const outputTensor = detOutput[detSession.outputNames[0]]

// Recognition
const recFeeds = { [recSession.inputNames[0]]: recTensor }
const recOutput = await recSession.run(recFeeds)
const recTensorOutput = recOutput[recSession.outputNames[0]]
```

**注意**：不要硬編碼輸入名稱如 `{ x: tensor }`，這會導致 CPU/GPU 行為不一致。

## 設定同步流程

```
useOcrSettings (localStorage)
         │
         ▼
    useOcr.js
         │
    ┌────┴────┐
    ▼         ▼
  WebGPU    WASM Worker
  (直接呼叫   (postMessage
  getSettings) 'updateSettings')
```

**重要**：Worker 的設定同步必須在 `initialize()` 完成後執行，因為 Worker 在初始化前不存在。

## 測試檢查清單

修改 OCR 相關程式碼後，請確認：

- [ ] CPU 和 GPU 模式產生相同數量的文字框
- [ ] 辨識結果的空格處理一致
- [ ] 設定變更後兩個引擎都能正確套用
- [ ] Tesseract fallback 正常運作

## 相關文件

- [Layout Analysis Algorithm](./layout-analysis-algorithm.md) - XY-Cut 演算法詳細說明
- [OCR Defaults](../src/constants/ocrDefaults.js) - 參數說明與驗證規則
