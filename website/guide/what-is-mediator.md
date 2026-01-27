# 什麼是 Mediator？

Mediator 是一個 AI 圖片與影片生成工具，名稱來自 **Media** + **Creator** = **Mediator**。

::: info 關於本專案
這是一個個人 Side Project，旨在探索 AI 生成技術的應用可能性，同時深入研究瀏覽器的進階功能（如 WebGPU、OPFS、Web Workers、ONNX Runtime Web 等）。
:::

<HeroVideo />

## 核心特色

### 🔒 完全本地運行

Mediator 是一個純前端應用程式（PWA），所有操作都在你的瀏覽器中完成：

- **無後端伺服器**：API 呼叫直接從瀏覽器發送到 Google Gemini
- **資料不外洩**：你的圖片和生成結果只儲存在本地
- **離線可用**：支援 PWA，可安裝到桌面

### 🎨 多種創作模式

| 模式 | 英文名稱 | 說明 |
|------|----------|------|
| 生成 | Generate | 基本的文字轉圖片功能，支援多種風格 |
| 貼圖 | Sticker | 生成貼圖表，自動分割成獨立貼圖 |
| 編輯 | Edit | 上傳參考圖片進行編輯或風格轉換 |
| 故事 | Story | 多步驟視覺敘事，維持角色一致性 |
| 圖表 | Diagram | 生成技術圖表、流程圖 |
| 影片 | Video | 使用 Veo 3.1 API 生成 AI 影片 |
| 簡報 | Slides | AI 簡報生成、PDF 轉 PPTX、OCR 文字辨識 |

## 運作原理

### Prompt 組裝器

所有圖片生成功能的核心，其實都是在幫助你組裝更完整的 Prompt。

每個模式都提供了針對特定情境設計的選項與預設值。當你選擇風格、比例、構圖等參數時，Mediator 會將這些選擇轉換成 AI 能理解的描述，與你輸入的提示詞組合成一個完整的 Prompt。

::: tip 越完整的 Prompt，效果越好
AI 模型需要足夠的資訊才能準確理解你的意圖。透過模式提供的結構化選項，即使你只輸入簡短的描述，最終送出的 Prompt 也會包含豐富的細節，讓生成結果更符合預期。
:::

### 🔍 即時網路搜尋

Mediator 整合了 Google Search 功能，AI 可以在生成過程中搜尋網路上的即時資訊。例如，你可以要求 AI 根據當前的天氣狀況、最新的新聞事件或即時數據來生成內容。

### 迴圈生成

部分模式需要一次產出多張圖片，例如：

- **故事模式**：依序生成每一步的場景圖片
- **簡報模式**：逐頁生成每張投影片

這些模式會使用迴圈（Looping）機制，將你的內容拆分後逐一送給 AI 處理。完成後，你可以直接匯出成 PDF 或其他格式一次使用。

### 🌍 多語言支援

- 繁體中文
- English

介面會根據瀏覽器語言自動切換。

### 🎭 主題系統

內建 14 種主題，包含深色與淺色模式：

- Slate Blue Pro（預設深色）
- Greek Blue（預設淺色）
- Warm Latte、Espresso、Mocha（咖啡系列）
- Nord、Gruvbox、Everforest（程式設計師最愛）
- Spring、Summer、Autumn、Winter（四季系列）
- Matcha、Matcha Dark（抹茶系列）

## 技術架構

- **前端框架**：Vue 3 + Composition API
- **狀態管理**：Pinia
- **樣式**：Tailwind CSS v4
- **AI API**：Google Gemini API + Veo 3.1 API
- **儲存**：localStorage + IndexedDB + OPFS
- **OCR**：PaddleOCR (ONNX Runtime Web) + Tesseract.js
- **圖像處理**：OpenCV.js（文字去除 Inpainting）

## 下一步

準備好開始了嗎？前往 [快速開始](./getting-started) 設置你的 API Key。
