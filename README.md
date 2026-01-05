# Nano Banana Pro Web Generator (NBP Web Gen)

[![Vue 3](https://img.shields.io/badge/Vue-3.x-green.svg)](https://vuejs.org/) [![Vite](https://img.shields.io/badge/Vite-6.x-blue.svg)](https://vitejs.dev/) [![Gemini API](https://img.shields.io/badge/Powered%20by-Gemini-8E75B2.svg)](https://deepmind.google/technologies/gemini/) [![Built with Claude Code](https://img.shields.io/badge/Built%20with-Claude%20Code-blueviolet.svg)](https://claude.ai/code) [![GitHub Pages](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-blue.svg)](https://nathanfhh.github.io/nbp-web-gen/)

> **🔒 100% Client-Side | No Backend | Your Data Stays in Your Browser**

**🚀 [Live Demo: https://nathanfhh.github.io/nbp-web-gen/](https://nathanfhh.github.io/nbp-web-gen/)**

[English](#english) | [Traditional Chinese](#traditional-chinese)

---

<a name="english"></a>
## 🍌 About The Project

**Nano Banana Pro Web Gen** is a cutting-edge web interface designed to unlock the full potential of Google's Gemini image generation models (specifically `gemini-3-pro-image-preview`). 

While starting as a web adaptation of existing CLI tools, this project has evolved into a feature-rich PWA (Progressive Web App) with unique capabilities like **Automated Sticker Segmentation**, **Visual Storytelling**, and **Technical Diagramming**.

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

*   **Advanced Generation:** Full support for styles (Watercolor, Pixar 3D, Cyberpunk) and variations (Lighting, Angle, Composition).
*   **Visual Storytelling:** Create consistent multi-step storyboards or process visualizations.
*   **Technical Diagrams:** Generate flowcharts, architecture diagrams, and mind maps from text.
*   **AI Thinking Process:** Watch the AI's reasoning in real-time with streaming thought visualization - see how Gemini thinks before generating.
*   **Smart History:** Local IndexedDB storage for your generation history.
*   **Privacy First:** API keys are stored only in your browser's local storage; no backend server is involved.

### 🧩 Spotlight: Intelligent Sticker Segmentation

One of the unique features of this web version is the **Sticker Mode**, which not only generates sticker sheets but also includes a client-side **Smart Cropper**.

**How it works (High-Level Engineering):**

Unlike simple grid chopping, our segmentation engine uses a computer vision approach to isolate stickers:

1.  **Thresholding & Masking:** The engine analyzes the pixel data of the generated "sticker sheet" to identify the background color (usually uniform) versus the subject content. It creates a binary mask of "content" vs. "empty space."
2.  **Connected-Component Labeling (CCL):** We employ a single-pass algorithm to detect distinct "blobs" of non-background pixels. This groups adjacent pixels into coherent objects (individual stickers).
3.  **Bounding Box Optimization:**
    *   The algorithm calculates the minimal bounding box ($[x_{min}, y_{min}, x_{max}, y_{max}]$) for each detected object.
    *   **Noise Filtering:** Tiny artifacts or stray pixels are discarded based on a calculated area threshold.
    *   **Margin Injection:** A calculated padding is added to each bounding box to ensure the white die-cut border (characteristic of stickers) is preserved and not clipped.
4.  **Canvas Extraction:** Finally, each validated region is extracted into a new `Canvas` context and exported as an individual transparent PNG, ready for use in messaging apps like Telegram, WhatsApp, or Line.

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

> **🔒 100% 純前端 | 無後端伺服器 | 資料完全留在您的瀏覽器**

**🚀 [線上體驗: https://nathanfhh.github.io/nbp-web-gen/](https://nathanfhh.github.io/nbp-web-gen/)**

## 🍌 關於本專案

**Nano Banana Pro Web Gen** 是一個專為 Google Gemini 圖像生成模型（特別是 `gemini-3-pro-image-preview`）打造的現代化網頁介面。

本專案最初是為了將強大的 CLI 工具網頁化，隨後發展成為一個功能豐富的 PWA 應用，並加入了許多獨家功能，如**自動化貼圖分割**、**視覺故事生成**以及**技術圖表繪製**。

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

*   **進階圖像生成：** 支援多種藝術風格（水彩、Pixar 3D、Cyberpunk）與變體控制（光影、角度、構圖）。
*   **視覺故事模式：** 可生成連貫的多步驟故事板或流程圖。
*   **技術圖表生成：** 透過文字描述產生流程圖、系統架構圖與心智圖。
*   **AI 思考過程視覺化：** 即時串流呈現 AI 的推理過程，讓您看見 Gemini 在生成圖像前的思考脈絡。
*   **智慧歷史紀錄：** 使用 IndexedDB 將您的生成紀錄完整保存在本地端。
*   **隱私優先：** API Key 僅儲存於您的瀏覽器 Local Storage，完全不經過任何第三方伺服器。

### 🧩 技術亮點：智慧貼圖分割 (Sticker Segmentation)

本專案最獨特的功能之一是 **貼圖模式 (Sticker Mode)**，它不僅能生成貼圖拼貼 (Sticker Sheet)，還內建了純前端執行的**智慧裁切引擎**。

**運作原理 (高階工程視角)：**

不同於傳統的固定網格裁切，我們採用電腦視覺 (Computer Vision) 的方法來精確分離每一張貼圖：

1.  **閾值處理與遮罩 (Thresholding & Masking)：** 引擎會分析生成圖片的像素數據，自動識別背景色（通常為純色）與主體內容，建立出「內容」與「空區域」的二值化遮罩 (Binary Mask)。
2.  **連通分量標記 (Connected-Component Labeling, CCL)：** 我們使用演算法掃描遮罩，偵測所有相連的非背景像素區域，將相鄰的像素分組為獨立的物件（即每一張獨立的貼圖）。
3.  **邊界框優化 (Bounding Box Optimization)：**
    *   針對每個偵測到的物件計算最小邊界框 ($[x_{min}, y_{min}, x_{max}, y_{max}]$)。
    *   **雜訊過濾：** 自動過濾掉面積過小的噪點或生成瑕疵。
    *   **邊距注入 (Margin Injection)：** 在裁切框周圍動態加入安全邊距，確保貼圖特有的白邊 (Die-cut border) 能夠完整保留，不會被切斷。
4.  **畫布提取 (Canvas Extraction)：** 最後，將每個驗證後的區域提取到新的 `Canvas` 上下文中，並匯出為獨立的透明背景 PNG 檔案，可直接用於 Telegram、WhatsApp 或 Line 等通訊軟體。

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

### 建置生產版本

```bash
npm run build
```
