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
Seven modes with mode-specific option components and prompt builders:
- **generate** - Basic image generation with styles/variations
- **sticker** - Sticker sheet generation with auto-segmentation
- **edit** - Image editing with reference images
- **story** - Multi-step visual storytelling (sequential API calls)
- **diagram** - Technical diagram generation
- **video** - AI video generation using Google Veo 3.1 API (REST, not SDK)
- **slides** - Presentation slide generation with AI style analysis (sequential per-page)

### Video Generation - API Limitations

**⚠️ IMPORTANT: `generateAudio` is NOT supported by Gemini API (browser)**

The `@google/genai` SDK includes `generateAudio` in its TypeScript definitions, but **Gemini API does not support this parameter** - it returns error: `"generateAudio parameter is not supported in Gemini API"`.

This is a **Vertex AI only** feature. Vertex AI requires:
- Service Account / ADC authentication
- Node.js runtime (not browser)

Since this project runs 100% client-side in browser, we cannot use Vertex AI.

**Current behavior:**
- Audio is **always generated** by Veo 3.1 API (no way to disable via Gemini API)
- Price calculation always uses `audio` pricing (not `noAudio`)
- UI toggle is hidden (commented out in `VideoOptions.vue`)

**Preserved code for future Vertex AI support:**
| File | What | Why preserved |
|------|------|---------------|
| `videoPricing.js` | `generateAudio` param in price functions | Ready for Vertex AI pricing |
| `VideoOptions.vue:591-621` | Commented Audio Toggle UI | Ready to uncomment |
| `i18n/locales/*.json` | `video.audio.*` translations | UI strings ready |

**DO NOT:**
- Re-add `generateAudio` to API payload in `useVideoApi.js`
- Uncomment the Audio Toggle UI (unless switching to Vertex AI)
- Use `noAudio` pricing (Gemini API always generates audio)

### Prompt Building
`useApi.js` contains `buildPrompt()` function that constructs enhanced prompts based on mode. Each mode has a dedicated builder function (`buildGeneratePrompt`, `buildStickerPrompt`, etc.) that adds mode-specific suffixes and options.

> **Slides Mode**: For detailed prompt structure documentation, see [`docs/prompt-structure-slide.md`](docs/prompt-structure-slide.md)

### Storage Layers
- **localStorage** - API key, quick settings (mode, temperature, seed)
- **IndexedDB** (`useIndexedDB.js`) - Generation history records, character metadata
- **OPFS** (`useOPFS.js`, `useImageStorage.js`, `useCharacterStorage.js`) - Image blobs for history and characters

> **詳細文件**: 完整的儲存架構說明請參閱 [`docs/storage.md`](docs/storage.md)

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
└── themes/               # 14 themes available
    ├── dark.js           # Slate Blue Pro - type: dark
    ├── light.js          # Greek Blue - type: light
    ├── warm.js           # Warm Latte - type: light, orange brand
    ├── espresso.js       # Coffee & Cream - type: light, coffee brand
    ├── mocha.js          # Dark Coffee - type: dark, coffee brand
    ├── nord.js           # Arctic Ice Blue - type: dark, nord palette
    ├── matcha.js         # Matcha Latte - type: light, green brand
    ├── matcha-dark.js    # Matcha Dark - type: dark, green brand
    ├── gruvbox.js        # Gruvbox - type: dark, retro palette
    ├── everforest.js     # Everforest - type: dark, forest palette
    ├── spring.js         # Spring Blossom - type: light, seasonal
    ├── summer.js         # Summer Ocean - type: light, seasonal
    ├── autumn.js         # Autumn Harvest - type: light, seasonal
    └── winter.js         # Winter Frost - type: dark, seasonal
```

**Key concepts:**
- Themes are JavaScript objects with `colors` and `shadows` properties
- CSS variables are injected at runtime via `initTheme()` in `main.js`
- Tailwind v4 `@theme` syntax in `style.css` references these CSS variables
- Semantic class names: `text-text-primary`, `bg-bg-muted`, `border-mode-generate`, etc.
- Themes auto-register via Vite's `import.meta.glob` - no manual registration needed in `index.js`
- `data-theme-type` attribute (`light`/`dark`) allows CSS to target theme types without listing each theme name

**Adding a New Theme - Checklist:**
1. **Create theme file**: `src/theme/themes/{name}.js` - copy from existing theme of same type (light/dark)
2. **Set required properties**: `name`, `type` ('light' or 'dark'), `colors`, `shadows`, `metaThemeColor`
3. **Add i18n translations**: Add `"{name}": "Display Name"` to `theme.names` in both:
   - `src/i18n/locales/zh-TW.json`
   - `src/i18n/locales/en.json`
4. **Test contrast**: Especially for light themes, ensure `textMuted` and `textSecondary` are dark enough against the background (WCAG AA: 4.5:1 ratio minimum)
5. **Verify all UI states**: Check mode tags, buttons, inputs, tooltips, glass effects

**⚠️ CRITICAL - No Hardcoded Colors in Components:**
- **NEVER** write hex codes (`#FFFFFF`), RGB values (`rgb(255,255,255)`), or Tailwind color classes (`text-white`, `bg-blue-500`) directly in component CSS
- **ALWAYS** use CSS variables from the theme system: `var(--color-text-primary)`, `var(--color-brand-primary)`, etc.
- If a needed color token doesn't exist, **add it to the theme files** (`tokens.js` + all `themes/*.js`) first
- Example tokens: `textOnBrand` (text color for brand-colored buttons - white on blue, black on orange)

**⚠️ CRITICAL - Use Unified Brand Colors (Video Is the Only Exception):**
- **ALL non-video generation modes (generate, sticker, edit, story, diagram) MUST use `mode-generate` as the accent color**
- Video mode uses its own accent tokens: **`mode-video`** and **`mode-video-muted`** for video-specific UI (mode chips, video badges in history).
- **Do NOT create any additional mode-specific colors** like `mode-sticker`, `mode-story`, etc. The only allowed mode-specific tokens are `mode-video` and `mode-video-muted`.
- Selected states, buttons, icons, focus rings → use `mode-generate`, `mode-generate-muted`, `brand-primary` (or `mode-video` for video-only interactions).
- This ensures a consistent look across all themes (warm=orange, espresso=coffee, dark=blue, etc.) while allowing video mode to be visually distinct where needed.

### User Tour (Onboarding)
First-time user guidance system:
- `composables/useTour.js` - Tour state management (Singleton pattern)
- `components/UserTour.vue` - Tour UI with spotlight effect and confetti celebration

**How it works:**
- Auto-starts for new users (checks `localStorage['nbp-tour-completed']`)
- 5 steps: API Key → Mode Selector → Prompt Input → Generate Button → History
- Keyboard navigation: `←` `→` to navigate, `ESC` to skip
- Version-controlled: bump `TOUR_VERSION` in `useTour.js` to force re-show after major updates
- Info button (ⓘ) in hero section to replay tour

### Key Composables
- `useApi.js` - API requests, prompt building, SSE streaming
- `useGeneration.js` - High-level generation flow with callbacks
- `useImageStorage.js` - OPFS image persistence
- `useToast.js` - Toast notifications
- `useStyleOptions.js` - Style/variation option definitions
- `useTour.js` - User tour/onboarding state (Singleton pattern, localStorage persistence)

### Constants
- `constants/defaults.js` - Default options per mode (`getDefaultOptions()`)
- `constants/imageOptions.js` - Available styles, ratios, resolutions
- `constants/modeStyles.js` - Mode tag CSS classes (Single Source of Truth for mode labels in History, Transfer, etc.)

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
- **UI/Styling**: Always consider all themes (dark, light, warm, espresso, mocha, nord) when designing components
- **Theme Handling**: Use semantic color classes (`text-text-primary`, `bg-bg-muted`, `border-mode-generate`) or CSS variables (`var(--color-brand-primary)`) instead of hardcoded colors. **Never use hex/RGB values or Tailwind color utilities in component CSS.** If a token is missing, add it to the theme system first. See `src/theme/tokens.js` for the full mapping.
- **Mobile UX**: Design for touch - consider tap targets, gestures, screen sizes, and provide alternatives for hover-only interactions

## User Preferences

- **Version bumps**: Always create git tags (do NOT use `--no-git-tag-version`)
- **Pushing**: Always sync tags with `git push --follow-tags` or `git push && git push --tags`
- **Self-review**: After big/complex changes, auto-run `/review-current-changes` to self-review
