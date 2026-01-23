# What is Mediator?

Mediator is an AI image and video generation tool. The name comes from **Media** + **Creator** = **Mediator**.

::: info About This Project
This is a personal side project, exploring the possibilities of AI generation technology while diving deep into advanced browser capabilities (such as WebGPU, OPFS, Web Workers, ONNX Runtime Web, etc.).
:::

![Mediator App Overview](/images/app-overview.webp)

## Core Features

### 🔒 Fully Client-Side

Mediator is a pure frontend application (PWA), all operations happen in your browser:

- **No backend server**: API calls go directly from browser to Google Gemini
- **Data stays local**: Your images and generated results are only stored locally
- **Offline capable**: Supports PWA, can be installed to desktop

### 🎨 Multiple Creation Modes

| Mode | Description |
|------|-------------|
| Generate | Basic text-to-image, supports multiple styles |
| Sticker | Generate sticker sheets, auto-split into individual stickers |
| Edit | Upload reference images for editing or style transfer |
| Story | Multi-step visual storytelling, maintains character consistency |
| Diagram | Generate technical diagrams, flowcharts |
| Video | Generate AI videos using Veo 3.1 API |
| Slides | AI slide generation, PDF to PPTX, OCR text recognition |

## How It Works

### Prompt Builder

At its core, all image generation features are designed to help you build better prompts.

Each mode provides options and presets tailored to specific use cases. When you select styles, aspect ratios, compositions, and other parameters, Mediator converts these choices into AI-understandable descriptions and combines them with your input to create a complete prompt.

::: tip Better Prompts = Better Results
AI models need sufficient information to accurately understand your intent. Through the structured options provided by each mode, even a brief description becomes a rich, detailed prompt, leading to results that better match your expectations.
:::

### Google Search Integration

When generating images that involve real-world subjects (people, places, events, etc.), Mediator can use Google Search to retrieve accurate information:

- **How to enable**: Toggle "Use Google Search" in the generation options
- **When to use**: When your prompt involves real people, locations, historical events, or anything that benefits from accurate real-world data
- **How it works**: The AI queries Google Search for relevant information and incorporates it into the generation process

::: info Note
This feature uses Gemini's built-in Google Search tool, enabling "grounded" generation that references real-world facts.
:::

### Loop Generation

Some modes need to generate multiple images at once, such as:

- **Story Mode**: Generates scene images for each step in sequence
- **Slides Mode**: Generates each slide page one by one

These modes use a looping mechanism that splits your content and processes each part through the AI sequentially. Once complete, you can export everything as a PDF or other format for immediate use.

### 🌍 Multi-language Support

- 繁體中文 (Traditional Chinese)
- English

Interface automatically switches based on browser language.

### 🎭 Theme System

14 built-in themes including dark and light modes:

- Slate Blue Pro (default dark)
- Greek Blue (default light)
- Warm Latte, Espresso, Mocha (coffee series)
- Nord, Gruvbox, Everforest (programmer favorites)
- Spring, Summer, Autumn, Winter (seasonal series)
- Matcha, Matcha Dark (matcha series)

## Technical Architecture

- **Frontend Framework**: Vue 3 + Composition API
- **State Management**: Pinia
- **Styling**: Tailwind CSS v4
- **AI API**: Google Gemini API + Veo 3.1 API
- **Storage**: localStorage + IndexedDB + OPFS
- **OCR**: PaddleOCR (ONNX Runtime Web) + Tesseract.js
- **Image Processing**: OpenCV.js (text removal inpainting)

## Next Steps

Ready to get started? Go to [Getting Started](./getting-started) to set up your API Key.
