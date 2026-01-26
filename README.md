# Mediator - AI Image & Video Generator

### Media + Creator = Mediator | Powered by Gemini & Veo 3.1

[![Vue 3](https://img.shields.io/badge/Vue-3.x-green.svg)](https://vuejs.org/) [![Vite](https://img.shields.io/badge/Vite-7.x-blue.svg)](https://vitejs.dev/) [![Gemini API](https://img.shields.io/badge/Image-Gemini%20API-8E75B2.svg)](https://deepmind.google/technologies/gemini/) [![Veo 3.1](https://img.shields.io/badge/Video-Veo%203.1-FF6F00.svg)](https://deepmind.google/technologies/veo/) [![Built with Claude Code](https://img.shields.io/badge/Built%20with-Claude%20Code-blueviolet.svg)](https://claude.ai/code) [![GitHub Pages](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-blue.svg)](https://nathanfhh.github.io/nbp-web-gen/) [![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/nathanfhh/nbp-web-gen)

**A Local-First, BYOK AI Workspace for Privacy-Sensitive Environments.**
*WebGPU-powered OCR. Direct API calls. WebRTC sync. Your Keys. Your Data.*

### 🔒 Why Local-First?
Designed for environments where data privacy is non-negotiable (hospitals, enterprises, personal use).

* **Local Intelligence:** Uses **WebGPU** (ONNX Runtime) for client-side OCR and Layout Analysis.
* **No Middleman:** Connects directly to Gemini/Veo API using **your own key** (BYOK). No server stores your data.
* **Recursive XY-Cut:** Purpose-built layout algorithm to preserve document structure for accurate text extraction.
* **Decentralized Sync:** Uses **WebRTC** for serverless, P2P synchronization between devices.

---

> **🔒 100% Client-Side | No Backend | Your Data Stays in Your Browser**

**🚀 [Live Demo: https://nathanfhh.github.io/nbp-web-gen/](https://nathanfhh.github.io/nbp-web-gen/)**

**📖 Documentation: [繁體中文](https://nathanfhh.github.io/nbp-web-gen/docs/) | [English](https://nathanfhh.github.io/nbp-web-gen/docs/en/)**

### 📺 Video Introduction | 影片介紹

[![Mediator Demo](https://img.youtube.com/vi/w7yAHJq66Pk/maxresdefault.jpg)](https://youtu.be/w7yAHJq66Pk)

[English](#english) | [Traditional Chinese](#traditional-chinese)

---

<a name="english"></a>
## 🎬 About The Project

**Mediator** (Media + Creator) is a modern web interface designed to unlock the full potential of Google's Gemini image generation models (namely `gemini-3-pro-image-preview`) and **Veo 3.1 video generation API**.

While starting as a web adaptation of existing CLI tools, this project has evolved into a feature-rich PWA with unique capabilities like **Automated Sticker Segmentation**, **Visual Storytelling**, **Technical Diagramming**, and **AI Video Generation**.

### 💡 Origins & Acknowledgements

This project stands on the shoulders of giants. It was inspired by and built upon the concepts established by the following open-source projects:

1.  **Original Concept:** [Google Gemini CLI Extensions - nanobanana](https://github.com/gemini-cli-extensions/nanobanana)
    *   The foundational CLI extension that introduced the structured prompt engineering patterns for Nano Banana.
2.  **Community Enhancement:** [Will Huang (doggy8088)'s Fork](https://github.com/doggy8088/nanobanana)
    *   Significant improvements and refinements to the original extension, serving as a key reference for stable model interaction.

We aim to bring these powerful CLI capabilities to a broader audience through a modern, responsive web UI.

### 🛠️ Built With AI

This project is a testament to the power of AI-assisted development:
*   **80%** of the codebase was authored/structured using **Claude Code**.
*   **20%** was developed and refined using **Gemini CLI**.

---

## ✨ Key Features

*   **Advanced Generation:** Full support for styles (Watercolor, Pixar 3D, Pixel Art, etc.) and variations (Lighting, Angle, Composition).
*   **Sketch Canvas:** Draw your own reference sketches directly in the browser using Fabric.js. Supports drawing on uploaded images, multiple brush colors/sizes, undo/redo history, and zoom controls.
*   **AI Video Generation:** Generate videos using Google's Veo 3.1 API with multiple sub-modes:
    *   **Text-to-Video:** Generate videos from text prompts with camera motion and style controls.
    *   **Frames-to-Video:** Create videos from start/end frame images for precise transitions.
    *   **References-to-Video:** Generate videos while maintaining consistency with reference images.
    *   **Extend Video:** Extend existing videos with new content.
    *   Includes a **Video Prompt Builder** with preset camera motions, visual styles, atmosphere, and negative prompts.
*   **Presentation Slides (NEW!):** Generate multi-page presentation slides with AI-powered design:
    *   **AI Style Analysis:** Gemini analyzes your content and suggests cohesive design styles.
    *   **AI Content Splitter:** Automatically split raw content (articles, notes) into structured slide pages.
    *   **Per-Page Customization:** Add page-specific style guides and reference images.
    *   **Progress Tracking:** Real-time progress bar with ETA during generation.
*   **Visual Storytelling:** Create consistent multi-step storyboards or process visualizations.
*   **Technical Diagrams:** Generate flowcharts, architecture diagrams, and mind maps from text.
*   **AI Thinking Process:** Watch the AI's reasoning in real-time with streaming thought visualization - see how Gemini thinks before generating.
*   **Character Extraction:** AI-powered character trait extraction from images. Save and reuse characters across generation modes for consistent character design.
*   **LINE Sticker Compliance Tool:** Dedicated tool to prepare stickers for LINE Store submission - auto-resize, even dimension enforcement, cover image generation (main.png/tab.png), and batch ZIP export.
*   **Slide to PPTX Converter:** Inspired by [DeckEdit](https://deckedit.com/), convert slide images or PDFs into editable PowerPoint files - all processing happens in your browser. Unlike purely automated tools that often fail on complex layouts, Mediator provides a "Human-in-the-loop" workflow powered by our **Recursive XY-Cut Layout Analysis Engine**, allowing precise manual correction of OCR regions before generation.
    *   **Client-Side OCR:** Uses PaddleOCR v5 models running on ONNX Runtime with WebGPU acceleration (falls back to WebAssembly). Choose between Server (higher accuracy) or Mobile (faster) model sizes.
    *   **Tesseract.js Fallback:** Automatic fallback for failed text regions using Tesseract.js OCR engine.
    *   **Advanced Region Editor:** Manually add, delete, resize, or batch-select OCR regions. Features undo/redo support, separator line tool for splitting merged regions, and rectangle selection for bulk deletion.
    *   **Text Removal:** Remove text from slide backgrounds using OpenCV.js (free) or Gemini API (higher quality, requires API key).
    *   **Dynamic Text Colors:** Automatically extracts and applies original text colors from slides to PPTX output.
    *   **Smart API Key Validation:** Gemini options are automatically disabled when no API key is configured; 3.0 model requires paid key.
    *   **Editable Output:** Generates PPTX files with text boxes overlaid on clean background images.
    *   **PDF Support:** Upload PDFs directly - automatically converted to images page by page.
    *   **Per-Page Settings:** Customize OCR and inpainting settings for individual slides.
*   **Smart History:** Local storage using IndexedDB and OPFS (Origin Private File System) for your generation history.
*   **History Export/Import:** Export your generation history to a JSON file (with embedded images) and import on another browser.
*   **WebRTC Cross-Device Sync:** Real-time sync between devices via WebRTC. Supports Cloudflare TURN relay for NAT traversal. Sync both history records and saved characters.
*   **Batch Download:** Download all generated images as ZIP archive or PDF document.
*   **Privacy First:** API keys are stored only in your browser's local storage; no backend server is involved.
*   **Installable PWA:** Install as a native-like app with offline support and automatic updates.
*   **14 Themes with View Transitions:** Choose from 14 carefully crafted themes including seasonal themes (Spring, Summer, Autumn, Winter), coffee themes (Espresso, Mocha), nature themes (Matcha, Everforest), and classics (Dark, Light, Warm, Nord, Gruvbox). Theme switching features a smooth ripple animation powered by the native [View Transitions API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transitions_API).

### 🧩 Spotlight: Intelligent Sticker Segmentation

One of the unique features of this web version is the **Sticker Mode**, which not only generates sticker sheets but also includes a client-side **Smart Cropper**.

**How it works (High-Level Engineering):**

Unlike simple grid chopping, our segmentation engine uses a projection-based approach optimized for grid-layout sticker sheets:

1.  **Edge-Connected Background Removal:** Using BFS flood fill starting from image edges, the engine removes background pixels while preserving interior content (e.g., black hair that matches background color).
2.  **Projection-Based Region Detection:**
    *   **Horizontal Scan:** Identifies rows containing content by scanning for non-transparent pixels.
    *   **Vertical Scan:** For each content row, scans columns to find individual sticker boundaries.
    *   This approach naturally groups text bubbles with their associated characters, even when not pixel-connected.
3.  **Noise Filtering:** Regions smaller than the threshold (20×20 pixels) are automatically discarded.
4.  **Web Worker Offloading:** All heavy pixel processing runs in a dedicated Web Worker to keep the UI responsive.
5.  **Canvas Extraction:** Each validated region is extracted into a new `Canvas` context and exported as an individual transparent PNG, ready for use in messaging apps like Telegram, WhatsApp, or Line.

### 🧠 Advanced Technology: Recursive XY-Cut Layout Analysis

For the **Slide to PPTX** converter, we developed a **Recursive XY-Cut Layout Analysis Engine** that outperforms standard linear scanning methods used by other tools.

**Why it matters:**
Traditional OCR tools often merge unrelated text (e.g., left/right columns) or split related text (e.g., titles/subtitles). Our engine solves this with a recursive divide-and-conquer approach:

1.  **Recursive XY-Cut Algorithm:**
    *   **Vertical Cuts:** Detects wide vertical gaps (>1.5× median line height) to separate columns.
    *   **Horizontal Cuts:** Detects horizontal gaps (>0.3× median line height) to separate paragraphs/sections.
    *   **Recursive Subdivision:** Continues cutting until no valid gaps remain, producing atomic text blocks.
    *   **Benefit:** Prevents content from physically distant columns from ever being merged, solving the "cross-column merge" issue.
2.  **Smart Text Joining:**
    *   Within each leaf zone, lines are sorted by Y-center (top-to-bottom) then X (left-to-right).
    *   Lines on the same row (Y-center within 0.7× height) are joined with spaces.
    *   Lines on different rows are joined with newlines.
    *   **Benefit:** Preserves natural reading order while maintaining paragraph structure.
3.  **Scale Invariance:**
    *   All thresholds are calculated relative to the **Median Line Height**, ensuring consistent performance on both 720p and 4K images.

---

## 🛠 Project Setup

### Prerequisites

*   Node.js (v22)
*   Gemini API Key (Get it from [Google AI Studio](https://aistudio.google.com/))

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

### Build for Production

```bash
npm run build
```

---

<a name="traditional-chinese"></a>

**為注重隱私的環境打造的 Local-First、BYOK AI 工作空間。**
*WebGPU 驅動的 OCR。直連 API。WebRTC 同步。你的金鑰。你的資料。*

### 🔒 為何選擇 Local-First？
專為資料隱私至上的環境設計（醫療院所、企業、個人使用）。

* **本地智慧：** 使用 **WebGPU**（ONNX Runtime）進行客戶端 OCR 與版面分析。
* **無中間人：** 使用**您自己的金鑰**（BYOK）直連 Gemini/Veo API，無伺服器儲存您的資料。
* **遞迴 XY-Cut：** 專為版面分析設計的演算法，保留文件結構以提升文字擷取準確度。
* **去中心化同步：** 使用 **WebRTC** 實現無伺服器的 P2P 跨裝置同步。

---

> **🔒 100% 純前端 | 無後端伺服器 | 資料完全留在您的瀏覽器**

**🚀 [線上體驗: https://nathanfhh.github.io/nbp-web-gen/](https://nathanfhh.github.io/nbp-web-gen/)**

**📖 文件：[繁體中文](https://nathanfhh.github.io/nbp-web-gen/docs/) | [English](https://nathanfhh.github.io/nbp-web-gen/docs/en/)**

## 🎬 關於本專案

**Mediator**（Media + Creator = Mediator）是一個專為 Google Gemini 圖像生成模型（即 `gemini-3-pro-image-preview`）與 **Veo 3.1 影片生成 API** 打造的現代化網頁介面。

本專案最初是為了將強大的 CLI 工具網頁化，隨後發展成為一個功能豐富的 PWA，並加入了許多獨家功能，如**自動化貼圖分割**、**視覺故事生成**、**技術圖表繪製**以及 **AI 影片生成**。

### 💡 發想源起與致謝

本專案的誕生，歸功於開源社群的啟發。我們特別感謝以下專案奠定的基礎：

1.  **原始概念：** [Google Gemini CLI Extensions - nanobanana](https://github.com/gemini-cli-extensions/nanobanana)
    *   這是 Google 官方推出的 CLI 擴充套件，建立了 Nano Banana 的核心 Prompt 結構與設計模式。
2.  **社群優化：** [Will 保哥 (doggy8088) 的 Fork 版本](https://github.com/doggy8088/nanobanana)
    *   保哥對原始擴充套件進行了重要的改進與修復，為本專案提供了穩定的參考實作。

我們致力於將這些強大的 CLI 功能帶入瀏覽器，讓全世界的開發者與使用者都能更直觀地使用。

### 🛠️ AI 協作開發

本專案是 AI 輔助開發的實踐成果：
*   **80%** 的程式碼由 **Claude Code** 撰寫與建構。
*   **20%** 透過 **Gemini CLI** 進行開發與優化。

---

## ✨ 核心特色

*   **進階圖像生成：** 支援多種藝術風格（水彩、Pixar 3D、像素風等）與變體控制（光影、角度、構圖）。
*   **手繪畫布：** 使用 Fabric.js 直接在瀏覽器中繪製參考草圖。支援在上傳圖片上繪製、多種筆刷顏色與粗細、復原/重做歷程、縮放控制。
*   **AI 影片生成：** 使用 Google Veo 3.1 API 生成影片，支援多種子模式：
    *   **文字轉影片：** 透過文字描述生成影片，可控制鏡頭運動與風格。
    *   **關鍵幀轉影片：** 從起始/結束畫面圖片創建影片，實現精確的畫面過渡。
    *   **參考圖轉影片：** 生成影片時保持與參考圖像的一致性。
    *   **延伸影片：** 延續現有影片生成新內容。
    *   內建 **影片 Prompt 建構器**，提供預設鏡頭運動、視覺風格、氛圍設定與負面提示詞。
*   **簡報投影片生成（新功能！）：** 透過 AI 輔助生成多頁簡報投影片：
    *   **AI 風格分析：** Gemini 分析您的內容並建議統一的設計風格。
    *   **AI 內容拆分：** 自動將原始素材（文章、筆記）拆分為結構化的簡報頁面。
    *   **頁面客製化：** 可為每頁加入專屬的風格指引與參考圖片。
    *   **進度追蹤：** 生成時顯示即時進度條與預估剩餘時間。
*   **視覺故事模式：** 可生成連貫的多步驟故事板或流程圖。
*   **技術圖表生成：** 透過文字描述產生流程圖、系統架構圖與心智圖。
*   **AI 思考過程視覺化：** 即時串流呈現 AI 的推理過程，讓您看見 Gemini 在生成圖像前的思考脈絡。
*   **角色萃取工具：** AI 驅動的角色特徵萃取功能，可從圖片中提取角色資訊並儲存，跨模式重複使用以維持角色設計一致性。
*   **LINE 貼圖合規工具：** 專為 LINE 貼圖上架打造的工具，自動調整尺寸、強制偶數尺寸、生成封面圖 (main.png/tab.png)，並批次匯出 ZIP。
*   **簡報轉 PPTX 工具：** 靈感來自 [DeckEdit](https://deckedit.com/)，將簡報圖片或 PDF 轉換為可編輯的 PowerPoint 檔案，所有處理皆在瀏覽器端完成。不同於容易在複雜排版中失敗的全自動工具，Mediator 提供「人機協作」工作流，讓您在生成前能精確地手動修正 OCR 區域。
    *   **客戶端 OCR：** 使用 PaddleOCR v5 模型搭配 ONNX Runtime，支援 WebGPU 加速（自動降級至 WebAssembly）。可選擇 Server（高精度）或 Mobile（快速）模型。
    *   **Tesseract.js 備援：** 針對辨識失敗的區域，自動使用 Tesseract.js 重新辨識。
    *   **進階區域編輯器：** 手動新增、刪除、調整或批次選取 OCR 區域。支援復原/重做、分隔線工具（拆分誤合併區域）、矩形選取批次刪除。
    *   **文字移除：** 使用 OpenCV.js（免費）或 Gemini API（品質較高，需設定 API 金鑰）從簡報背景中移除文字。
    *   **動態文字顏色：** 自動提取並套用原始簡報中的文字顏色至 PPTX 輸出。
    *   **智慧金鑰驗證：** 未設定 API 金鑰時自動禁用 Gemini 選項；3.0 模型需使用付費金鑰。
    *   **可編輯輸出：** 生成的 PPTX 包含文字框疊加在乾淨的背景圖片上。
    *   **PDF 支援：** 可直接上傳 PDF，自動逐頁轉換為圖片。
    *   **逐頁設定：** 可為個別頁面自訂 OCR 與文字移除設定。
*   **智慧歷史紀錄：** 使用 IndexedDB 與 OPFS (Origin Private File System) 將您的生成紀錄完整保存在本地端。
*   **歷史記錄匯出/匯入：** 將生成歷史匯出為 JSON 檔案（含嵌入圖片），可於其他瀏覽器匯入。
*   **WebRTC 跨裝置同步：** 透過 WebRTC 實現裝置間即時同步，支援 Cloudflare TURN 中繼伺服器穿越 NAT。可同步歷史紀錄與已儲存的角色。
*   **批次下載：** 可將所有生成圖片打包為 ZIP 壓縮檔或 PDF 文件下載。
*   **隱私優先：** API Key 僅儲存於您的瀏覽器 Local Storage，完全不經過任何第三方伺服器。
*   **可安裝 PWA：** 支援安裝為類原生應用程式，具備離線支援與自動更新功能。
*   **14 種主題與原生過渡動畫：** 提供 14 種精心設計的主題，包括季節主題（春、夏、秋、冬）、咖啡主題（Espresso、Mocha）、自然主題（Matcha、Everforest）以及經典主題（Dark、Light、Warm、Nord、Gruvbox）。主題切換採用瀏覽器原生 [View Transitions API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transitions_API)，實現從點擊位置擴散的平滑動畫效果。

### 🧩 技術亮點：智慧貼圖分割 (Sticker Segmentation)

本專案最獨特的功能之一是 **貼圖模式 (Sticker Mode)**，它不僅能生成貼圖拼貼 (Sticker Sheet)，還內建了純前端執行的**智慧裁切引擎**。

**運作原理 (工程概述)：**

不同於傳統的固定網格裁切，我們採用投影法 (Projection-Based) 針對網格佈局貼圖進行優化：

1.  **邊緣連通去背 (Edge-Connected Background Removal)：** 使用 BFS 洪水填充從圖片邊緣開始移除背景像素，同時保護內部內容（如與背景色相同的黑色頭髮）。
2.  **投影式區域偵測 (Projection-Based Region Detection)：**
    *   **水平掃描：** 逐行掃描非透明像素，識別有內容的列。
    *   **垂直掃描：** 對每個內容列，掃描欄位找出個別貼圖邊界。
    *   此方法能自然地將文字氣泡與角色歸為同一區塊，即使它們在像素層級並未連接。
3.  **雜訊過濾：** 自動過濾小於閾值 (20×20 像素) 的區域。
4.  **Web Worker 卸載：** 所有繁重的像素處理都在專用 Web Worker 中執行，確保 UI 流暢。
5.  **畫布提取 (Canvas Extraction)：** 將每個驗證後的區域提取到新的 `Canvas` 上下文中，並匯出為獨立的透明背景 PNG 檔案，可直接用於 Telegram、WhatsApp 或 Line 等通訊軟體。

### 🧠 進階技術：遞迴 XY-Cut 版面分析

針對 **簡報轉 PPTX** 功能，我們開發了一套 **遞迴 XY-Cut 版面分析引擎**，超越了其他工具使用的標準線性掃描方法。

**為何這很重要：**
傳統 OCR 工具常會錯誤合併無關的文字（如左/右欄混雜）或切斷相關的文字（如標題/副標題分離）。我們的引擎透過遞迴分治法解決此問題：

1.  **遞迴 XY-Cut 演算法：**
    *   **垂直切割：** 偵測寬大的垂直間隙（>1.5 倍中位數行高）來分離欄位。
    *   **水平切割：** 偵測水平間隙（>0.3 倍中位數行高）來分離段落/區塊。
    *   **遞迴細分：** 持續切割直到無有效間隙，產生原子級文字區塊。
    *   **優勢：** 強制將物理上分離的欄位切開，徹底解決「跨欄誤判」問題。
2.  **智慧文字連接：**
    *   在每個葉節點區域內，依 Y 中心（由上到下）再依 X（由左到右）排序。
    *   同一行的文字（Y 中心在 0.7 倍高度內）以空格連接。
    *   不同行的文字以換行符連接。
    *   **優勢：** 保留自然閱讀順序，同時維持段落結構。
3.  **尺度不變性：**
    *   所有閾值均相對於 **中位數行高** 計算，確保在 720p 與 4K 圖片上表現一致。

---

## 🛠 專案設定

### 前置需求

*   Node.js (v22)
*   Gemini API Key (請至 [Google AI Studio](https://aistudio.google.com/) 申請)

### 安裝與執行

```bash
# 安裝依賴套件
npm install

# 啟動開發伺服器
npm run dev
```

### 編譯發布版

```bash
npm run build
```
