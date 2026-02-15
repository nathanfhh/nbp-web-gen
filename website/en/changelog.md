# Changelog

This page documents version updates for Mediator.

## v0.28.0

_2026-02-15_

### New Features
- **Smart Search**: Add dual embedding engines — Gemini Embedding API (768-dim, cloud, higher quality) and local Transformers.js multilingual-e5-small (384-dim, free/offline), switchable anytime
- **Smart Search**: Add Embedding 3D Explorer with UMAP dimensionality reduction and Plotly.js interactive 3D scatter plot visualization
- **API Key**: Add privacy warning for Free Tier API keys — Google may use free tier data for model training

### Improvements
- **Smart Search**: Reduce chunk size (500→200) and overlap (100→50) for finer-grained retrieval
- **Smart Search**: Add multi-chunk aggregated scoring for better search relevance
- **Smart Search**: Embedding 3D Explorer uses lazy loading (Plotly.js ~4.8MB loaded only when opened)

### Fixes
- **Smart Search**: Fix zero-vector documents being inserted into snapshots, degrading search quality
- **Smart Search**: Fix snapshot deduplication logic and per-provider independent storage
- **Smart Search**: Fix Plotly modebar position obscuring chart and modal height clipping

### Documentation
- Update search docs with dual engine details, privacy warning, and 3D Explorer guide
- Update API Key management docs with Free Tier privacy notice
- Update README to reflect dual engines and 3D Explorer features

## v0.27.0

_2026-02-14_

### New Features
- **Smart Search**: Add RAG hybrid search system for history, combining BM25 keyword matching with semantic vector search (multilingual-e5-small)
- **Smart Search**: Support three search strategies (hybrid/semantic/fulltext), mode filtering, and multiple sort options
- **Smart Search**: Auto-save search preferences to localStorage, restored on next open
- **Smart Search**: Real-time index sync — automatically updates when records are added, deleted, or imported

### Fixes
- **Smart Search**: Fix null embeddings on snapshot restore causing search failures
- **Smart Search**: Fix search events not registered eagerly, preventing real-time indexing on generation complete
- **i18n**: Add missing common.close translation key
- **Slide Conversion**: Fix TypeError from null entries in mergeTextRegions

### Documentation
- Add Smart Search user guide (zh-TW & English)
- Add search system technical architecture doc

### Testing
- Add search-core pure function tests (50+ test cases)

### Maintenance
- Upgrade project dependencies

---

## Earlier Versions

### v0.26.x - Smart Search, Slide Narration & Agentic Vision

_2026-01-28 ~ 2026-02-12_

- **v0.26.22** _(02-12)_: Lightbox navigation overlap fix, View Transition animation improvements
- **v0.26.21** _(02-09)_: Agentic Vision ghost message and imageIndex alignment fixes, export/import thumbnail support
- **v0.26.20** _(02-09)_: Fix ghost API requests via AbortController cancellation
- **v0.26.19** _(02-09)_: Prevent duplicate generation from rapid clicks
- **v0.26.18** _(02-06)_: Vitest unit testing framework with 319 tests, ESLint cleanup
- **v0.26.17** _(02-06)_: Audio preview comparison, MP4 resolution selection (1080p/1440p/2160p), transition fixes
- **v0.26.16** _(02-04)_: Settings reset confirmation, auto-hiding audio player, narration settings persistence
- **v0.26.15** _(02-04)_: Playback speed control, auto-play, space bar shortcut, global audio exclusion
- **v0.26.14** _(02-03)_: Parallel image+audio generation, dropdown auto-scroll, useApi.js refactor
- **v0.26.13** _(02-03)_: Inline voice preview, WebM/Opus audio encoding
- **v0.26.12** _(02-03)_: Agentic Vision UX improvements, expandable slide content preview
- **v0.26.11** _(02-01)_: Fix font-size merge threshold, missing i18n keys
- **v0.26.10** _(02-01)_: Fix sticker cropper scroll in lightbox
- **v0.26.9** _(01-31)_: MP4 quality selection, agent auto-save during streaming
- **v0.26.8** _(01-30)_: Agent clear conversation, camera upload, lightbox viewing for user images
- **v0.26.7** _(01-30)_: Sticker cropper undo/redo, agent history thumbnail lightbox
- **v0.26.6** _(01-29)_: Manual split mode for sticker cropper, transparent padding trimming
- **v0.26.5** _(01-29)_: Agentic Vision mode with Think→Act→Observe loop and code execution
- **v0.26.4** _(01-29)_: Opus codec fallback for MP4, fix Schedar voice model ID
- **v0.26.3** _(01-29)_: Per-page regeneration, crossfade transitions, audio lightbox viewing
- **v0.26.2** _(01-28)_: Narration audio export/import and WebRTC transfer support (v3 format)
- **v0.26.1** _(01-28)_: Sticker edge erosion, 8-connected flood fill background removal
- **v0.26.0** _(01-28)_: Slide narration TTS (single/dual speaker), SearchableSelect component

### v0.25.x - Documentation Site, Slide Conversion & Privacy-First

_2026-01-23 ~ 2026-01-28_

- **v0.25.23** _(01-28)_: Standalone sticker grid cutter tool, docs hero looping video
- **v0.25.21** _(01-27)_: 3D banana model drag-to-rotate with physics
- **v0.25.20** _(01-26)_: Remove GA4 tracking, aspect-ratio adaptive font sizing fix
- **v0.25.19** _(01-25)_: Add changelog pages
- **v0.25.18** _(01-25)_: Slide conversion leave confirmation
- **v0.25.16** _(01-25)_: Region editor keyboard shortcuts
- **v0.25.15** _(01-25)_: Trapezoid mode for slanted text regions
- **v0.25.12** _(01-24)_: 3D banana model in hero section
- **v0.25.8** _(01-24)_: Gemini reprocess confirmation dialog
- **v0.25.7** _(01-24)_: Deep linking, "Try It" buttons, API Key video tutorials
- **v0.25.6** _(01-24)_: Lazy load SketchCanvas component
- **v0.25.0** _(01-23)_: VitePress documentation site, story mode character continuity, sitemap index

### v0.24.x - Sketch Canvas & Slide Conversion Enhancements

_2026-01-20 ~ 2026-01-23_

- **v0.24.11** _(01-23)_: Fix mock document for PDF.js in Web Worker, PPTX image aspect ratio
- **v0.24.10** _(01-22)_: Sketch UX improvements: navigation guards and color picker repositioning
- **v0.24.9** _(01-22)_: Add pan tool for canvas navigation
- **v0.24.8** _(01-22)_: Fix mobile layout overlap between reference images and characters
- **v0.24.0** _(01-20)_: Slide conversion settings behavior docs, Gemini confirmation modal, WYSIWYG settings, story mode partial success handling

### v0.23.x - SEO & OCR Model Selection

_2026-01-19_

- **v0.23.7**: Fix sticker crop button SVG, accessibility labels, LCP optimization
- **v0.23.6**: Add static HTML generation with per-route SEO meta tags
- **v0.23.5**: PWA fixes, canonical URL for duplicate content prevention
- **v0.23.4**: Add JSON-LD structured data, SPA routing fixes
- **v0.23.3**: Toast swipe-to-dismiss, region selection tool, beforeunload protection
- **v0.23.2**: Lightbox edit regions button, OCR model size selection (Server/Mobile) with auto-fallback
- **v0.23.1**: Smart scroll (stop auto-scroll when user scrolls up), Free Tier API key routing
- **v0.23.0**: Extract and apply dynamic text colors in PPTX

### v0.22.x - Region Editor & Unified OCR Architecture

_2026-01-18 ~ 2026-01-19_

- **v0.22.3** _(01-19)_: Region editor undo/redo functionality
- **v0.22.2** _(01-19)_: Separator line tool, resize magnifier
- **v0.22.1** _(01-18)_: Height-based font sizing
- **v0.22.0** _(01-18)_: Canvas-measured font sizing, unified CPU/GPU OCR architecture

### v0.21.x - WebGPU OCR & Region Editing

_2026-01-17 ~ 2026-01-18_

- **v0.21.5** _(01-18)_: Auto fallback to CPU when GPU memory insufficient
- **v0.21.4** _(01-18)_: Pure XY-Cut layout analysis, fix BGR order
- **v0.21.3** _(01-17)_: Improved WebGPU detection
- **v0.21.2** _(01-17)_: Clear model cache, mobile WebGPU support
- **v0.21.1** _(01-17)_: Draggable region editor toolbar, auto-generate PPTX filenames
- **v0.21.0** _(01-17)_: Manual OCR region editing, Tesseract.js fallback, unified OCR interface

### v0.20.x - Slide to PPTX Converter

_2026-01-16_

- **v0.20.3**: Exclude image data from localStorage persistence
- **v0.20.2**: Add PPTX converter banner in slides mode
- **v0.20.1**: File upload mode, processing timer, OCR JSON overlay
- **v0.20.0**: Slide to PPTX converter, dual API key manager, image comparison modal

### v0.19.x - AI Content Splitter

_2026-01-15_

- **v0.19.0**: AI content splitter modal, per-page style guides, generation progress bar with ETA

### v0.18.x - Slides Mode

_2026-01-15_

- **v0.18.0**: Slides presentation mode with reference images support

### v0.17.x - Video Generation & Rebranding

_2026-01-14 ~ 2026-01-15_

- **v0.17.3** _(01-15)_: Refactor video metadata
- **v0.17.2** _(01-15)_: Migrate image generation to @google/genai SDK
- **v0.17.1** _(01-15)_: Remove generateAudio (not supported by Gemini API)
- **v0.17.0** _(01-14)_: Video generation mode (Veo 3.1 API), rebrand to Mediator

### v0.16.x - Character Storage Migration

_2026-01-14_

- **v0.16.0**: Migrate character images to OPFS

### v0.15.x - User Tour

_2026-01-12 ~ 2026-01-13_

- **v0.15.5** _(01-13)_: Prevent accidental data loss during sticker cropping
- **v0.15.4** _(01-13)_: Fix tour tooltip overlapping with generate button
- **v0.15.3** _(01-13)_: History filter by generation mode
- **v0.15.2** _(01-13)_: Allow download without full compliance
- **v0.15.1** _(01-12)_: Mobile responsive layout for tour and character info
- **v0.15.0** _(01-12)_: User tour for first-time visitors, theme type icons, auto-scroll theme dropdown

### v0.14.x - Seasonal Themes

_2026-01-12_

- **v0.14.0**: Add seasonal themes (spring, summer, autumn, winter)

### v0.13.x - More Themes

_2026-01-11 ~ 2026-01-12_

- **v0.13.3** _(01-12)_: Unify mode colors to brand color
- **v0.13.2** _(01-12)_: Use white text on dark overlay badges for light themes
- **v0.13.1** _(01-12)_: Add Matcha, Gruvbox, and Everforest themes
- **v0.13.0** _(01-11)_: Add Espresso, Mocha, and Nord themes

### v0.12.x - Theme System Polish

_2026-01-11_

- **v0.12.1**: Eliminate flash at end of theme transition animation
- **v0.12.0**: Add warm theme and semantic color tokens

### v0.11.x - Semantic Color Tokens

_2026-01-11_

- **v0.11.1**: Sticker tool light mode text visibility, theme system enhancements
- **v0.11.0**: Modularize theme system with semantic color tokens

### v0.10.x - LINE Sticker Covers & Code Refactoring

_2026-01-10 ~ 2026-01-11_

- **v0.10.4** _(01-11)_: Extract HistoryTransfer into modular components
- **v0.10.3** _(01-11)_: Extract LineStickerToolView into modular components
- **v0.10.2** _(01-11)_: Extract ImageLightbox into modular composables
- **v0.10.1** _(01-11)_: Extract usePeerSync, StickerCropper into modular composables
- **v0.10.0** _(01-10)_: LINE sticker cover images, even dimension support

### v0.9.x - Character Extraction & LINE Sticker Tool

_2026-01-09_

- **v0.9.2**: Preserve edit mode settings when switching stickers
- **v0.9.1**: WebRTC sync support for character data
- **v0.9.0**: Character extraction feature, LINE sticker compliance tool

### v0.8.x - Dark Theme Redesign

_2026-01-09_

- **v0.8.0**: Slate Blue Pro dark theme

### v0.7.x - WebRTC Sync & Batch Downloads

_2026-01-07 ~ 2026-01-09_

- **v0.7.13** _(01-09)_: Bundle size optimization with code splitting and lazy loading
- **v0.7.12** _(01-09)_: Sticker cropper secondary background removal enhancement
- **v0.7.11** _(01-08)_: Toast light mode high contrast design
- **v0.7.10** _(01-08)_: Unify checkbox colors in light mode, selective export/sync
- **v0.7.9** _(01-08)_: TURN toggle, auto-disconnect, theme fixes
- **v0.7.8** _(01-08)_: Fix transfer stats accuracy, per-record ACK, backpressure control
- **v0.7.7** _(01-07)_: Migrate TURN settings to Cloudflare API
- **v0.7.6** _(01-07)_: P2P cross-device sync with TURN support
- **v0.7.5** _(01-07)_: Unify lightbox download menu, theme fixes
- **v0.7.4** _(01-07)_: Remove IndexedDB settings store dead code
- **v0.7.3** _(01-07)_: History ZIP/PDF batch download, export/import functionality
- **v0.7.2** _(01-07)_: Full datetime tooltip on history timestamps
- **v0.7.1** _(01-07)_: Add CLAUDE.md, dayjs relative time
- **v0.7.0** _(01-07)_: PDF batch download (Web Worker), unique sticker filenames

### v0.6.x - GA4 Tracking & PWA

_2026-01-05 ~ 2026-01-06_

- **v0.6.7** _(01-06)_: Back gesture support for sticker cropper
- **v0.6.6** _(01-06)_: Version number in update notification
- **v0.6.5** _(01-06)_: Revert to projection-based sticker segmentation (YAGNI)
- **v0.6.4** _(01-06)_: Dynamic PWA theme color, CCL filter optimization
- **v0.6.3** _(01-06)_: Sticker segmentation Web Worker + CCL algorithm optimization
- **v0.6.2** _(01-06)_: PWA support
- **v0.6.1** _(01-05)_: Google Analytics 4 tracking
- **v0.6.0** _(01-05)_: Major code refactoring and DRY improvements

### v0.5.x - Sticker Mode & Internationalization

_2026-01-04 ~ 2026-01-05_

- **v0.5.5** _(01-05)_: SEO meta tags, GitHub Pages deployment
- **v0.5.4** _(01-05)_: Extract GitHubLink component
- **v0.5.3** _(01-04)_: Sticker processing overlay animation, BFS flood fill optimization
- **v0.5.2** _(01-04)_: Sticker cropper layout and scrolling improvements
- **v0.5.1** _(01-04)_: Sticker cropper mobile layout
- **v0.5.0** _(01-04)_: Sticker mode with cropping and advanced options

### v0.4.x - OPFS Image Storage

_2026-01-04_

- **v0.4.2**: Ignore .gemini-clipboard directory
- **v0.4.1**: Generation history alignment and scrollbar spacing
- **v0.4.0**: OPFS image storage, WebP compression

### v0.3.x - Touch Gestures

_2026-01-03_

- **v0.3.0**: Lightbox touch gesture support

### v0.2.x - Hero Section

_2026-01-03_

- **v0.2.0**: Hero section animations and scroll snap

### v0.1.x - Initial Release

_2026-01-03_

- **v0.1.0**: Initial release
  - AI image generation (Gemini API)
  - Multi-image upload, lightbox zoom/pan
  - Thinking process display, toast notifications
  - History storage
