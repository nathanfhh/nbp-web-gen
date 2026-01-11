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
Five modes with mode-specific option components and prompt builders:
- **generate** - Basic image generation with styles/variations
- **sticker** - Sticker sheet generation with auto-segmentation
- **edit** - Image editing with reference images
- **story** - Multi-step visual storytelling (sequential API calls)
- **diagram** - Technical diagram generation

### Prompt Building
`useApi.js` contains `buildPrompt()` function that constructs enhanced prompts based on mode. Each mode has a dedicated builder function (`buildGeneratePrompt`, `buildStickerPrompt`, etc.) that adds mode-specific suffixes and options.

### Storage Layers
- **localStorage** - API key, quick settings (mode, temperature, seed)
- **IndexedDB** (`useIndexedDB.js`) - Generation history records
- **OPFS** (`useOPFS.js`, `useImageStorage.js`) - Generated image blobs for history

### Web Workers
- `workers/stickerSegmentation.worker.js` - Client-side sticker sheet segmentation using BFS flood fill and projection-based region detection
- `workers/pdfGenerator.worker.js` - PDF batch download generation

### Internationalization
- `i18n/index.js` with locale files in `i18n/locales/`
- Supports `zh-TW` and `en`, auto-detects from browser

### Theme System (Modular)
Similar to i18n architecture - add a file to add a theme:
```
src/theme/
├── index.js              # Theme registry (initTheme, setTheme, toggleTheme)
├── tokens.js             # Semantic token definitions + migration map
└── themes/
    ├── dark.js           # Dark theme (Slate Blue Pro)
    └── light.js          # Light theme (Greek Blue)
```

**Key concepts:**
- Themes are JavaScript objects with `colors` and `shadows` properties
- CSS variables are injected at runtime via `initTheme()` in `main.js`
- Tailwind v4 `@theme` syntax in `style.css` references these CSS variables
- Semantic class names: `text-text-primary`, `bg-bg-muted`, `border-mode-generate`, etc.
- To add a new theme: create `themes/newtheme.js` and register in `index.js`

### Key Composables
- `useApi.js` - API requests, prompt building, SSE streaming
- `useGeneration.js` - High-level generation flow with callbacks
- `useImageStorage.js` - OPFS image persistence
- `useToast.js` - Toast notifications
- `useStyleOptions.js` - Style/variation option definitions

### Constants
- `constants/defaults.js` - Default options per mode (`getDefaultOptions()`)
- `constants/imageOptions.js` - Available styles, ratios, resolutions

### Vite Configuration
- `@` alias resolves to `./src`
- Injects `__APP_VERSION__` and `__BUILD_HASH__` globals
- PWA configured with workbox for offline support
- Base path changes to `/nbp-web-gen/` in GitHub Actions builds

## Code Patterns

- Vue 3 Composition API with `<script setup>`
- Pinia for state management (single store pattern)
- Tailwind CSS v4 for styling
- All API calls use SSE streaming when possible
- Generation results saved to history in background (non-blocking)
- **UI/Styling**: Always consider both light and dark mode when designing components
- **Theme Handling**: Use semantic color classes (`text-text-primary`, `bg-bg-muted`, `border-mode-generate`) instead of hardcoded Tailwind colors. See `src/theme/tokens.js` for the full mapping. Legacy `[data-theme="light"]` overrides in `style.css` are being phased out.
- **Mobile UX**: Design for touch - consider tap targets, gestures, screen sizes, and provide alternatives for hover-only interactions

## User Preferences

- **Version bumps**: Always create git tags (do NOT use `--no-git-tag-version`)
- **Pushing**: Always sync tags with `git push --follow-tags` or `git push && git push --tags`
- **Self-review**: After big/complex changes, auto-run `/review-current-changes` to self-review
