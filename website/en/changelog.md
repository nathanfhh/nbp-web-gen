# Changelog

This page documents version updates for Mediator.

## v0.26.12

_2026-02-03_

### New Features
- **Agentic Vision**: Enable "Include images in context" by default for better conversation continuity
- **Agentic Vision**: Smart scroll behavior - preserves scroll position when user scrolls up to read history instead of forcing scroll to bottom
- **Agentic Vision**: Platform-aware keyboard hints (shows ⌘+Enter on Mac, Ctrl+Enter on Windows/Linux)
- **Slides**: Add expandable content preview in page list for viewing longer or multi-line page content

### Fixes
- **Agentic Vision**: Fix clear button not vertically centered in multi-line textarea
- **Agentic Vision**: Fix multi-tab editing of the same conversation causing data loss where later saves would overwrite earlier saves

## v0.26.11

_2026-02-01_

### Fixes
- **Slide to PPTX**: Fix text with significantly different font sizes being incorrectly merged into the same text box (`fontSizeDiffThreshold` parameter now takes effect)
- **i18n**: Add missing `common.undo` and `common.redo` translation keys

## v0.26.10

_2026-02-01_

### Fixes
- **Sticker Cropper**: Fix mouse wheel scroll not working in crop result panel when opened from lightbox

## v0.26.9

_2026-01-31_

### New Features
- **MP4 Export**: Add quality selection dialog with Low (4 Mbps), Medium (8 Mbps), and High (12 Mbps) options; preference is automatically saved
- **Agentic Vision**: Add auto-save during streaming to prevent conversation loss on unexpected interruptions

## v0.26.8

_2026-01-30_

### New Features
- **Agentic Vision**: Add clear conversation button and improve send icon design

### Fixes
- **Agentic Vision**: Fix prompt leaking from other modes into agent input
- **Agentic Vision**: Enable camera option in Android file picker
- **Agentic Vision**: User uploaded images now support lightbox viewing

### Refactor
- Remove dead code and consolidate isQuotaError utility function

## v0.26.7

_2026-01-30_

### New Features
- **Sticker Cropper**: Add Undo/Redo for separator lines with toolbar buttons and keyboard shortcuts (Ctrl+Z / Ctrl+Shift+Z)
- **History**: Agent mode conversations now support clicking thumbnails to open image lightbox

### Fixes
- **Sticker Cropper**: Improve separator line precision and selection UX (visible dashed lines now clickable for selection)
- **Sticker Cropper**: Improve manual crop UX (drag to adjust endpoints, larger tap targets)
- **Agentic Vision**: Improve mobile chat UX (hide avatars, full-width message bubbles)

## v0.26.6

_2026-01-29_

### New Features
- **Sticker Cropper**: Add "Manual Split" mode allowing users to draw separator lines for precise crop region control when auto detection fails
- **Sticker Cropper**: Automatically trim transparent padding from cropped stickers for tighter results

### Documentation
- Add manual crop mode usage guide with screenshots
- Update README sticker grid cutter feature description

## v0.26.5

_2026-01-29_

### New Features
- **Agentic Vision Mode**: Add intelligent chat powered by Gemini 3 Flash Agentic Vision, featuring Think → Act → Observe loop, code execution, and image annotation

### Fixes
- **Agentic Vision**: Fix prompt not auto-filling in chat input when entering via URL query params

### Documentation
- Add Agentic Vision mode documentation (zh-TW and English) covering features, settings, and use cases
- Update README with Agentic Vision feature description
- Add chat interface and analysis result screenshots

## v0.26.4

_2026-01-29_

### Fixes
- **MP4 Export**: Add Opus codec fallback when AAC is not supported, fixing MP4 generation failure on Linux platforms
- **Narration**: Fix incorrect script Pro model ID (gemini-2.5-pro-preview-06-05 → gemini-3-pro-preview)

## v0.26.3

_2026-01-29_

### New Features
- **Slide Regeneration**: Add per-page image/audio regeneration options for retrying failed pages individually
- **Slide Narration**: Allow viewing and downloading audio via Lightbox when all images fail but audio succeeds
- **MP4 Export**: Add crossfade transition effect between slides

### Fixes
- **Slide Regeneration**: Fix regenerated images not updating in preview area and history records
- **Slide Regeneration**: Fix status tag not updating from failed/partial to success after regeneration
- **Slide Regeneration**: Fix audio cache issue where regenerated audio still played old content
- **MP4 Export**: Improve error handling and diagnostics for WebCodecs encoders

### Documentation
- Update README to cover narration TTS, MP4 export, and sticker grid cutter features
- Clarify that narration section appears only after style confirmation
- Document changelog retention policy for two most recent minor versions

## v0.26.2

_2026-01-28_

### New Features
- **Backup & Transfer**: JSON export/import and WebRTC P2P transfer now fully support narration audio (scripts + audio files); export format upgraded to v3 (backward compatible with v2)
- **History**: Slide presentations with narration audio now display an audio indicator icon on thumbnails

### Fixes
- **Narration**: Fix TTS prompts missing explicit language and accent directives
- **MP4 Export**: Fix audio decoding failure in Worker by moving to main thread; cap AVC encoding resolution
- **i18n**: Clarify temperature setting hint wording

### Documentation
- Add sticker edge erosion and grid cutter tool documentation
- Add MP4 export and audio indicator to slide and history guides
- Add backup compatibility guidance for new artifact types

## v0.26.1

_2026-01-28_

### New Features
- **Sticker**: Add Edge Erosion control (0/1/2/3px) to remove boundary artifacts after background removal
- **Sticker**: Upgrade background removal from 4-connected to 8-connected flood fill for more thorough removal through diagonal gaps

### Fixes
- **Sticker**: Use 8-connected flood fill in edit mode to match automatic background removal behavior

## v0.26.0

_2026-01-28_

### New Features
- **Slide Narration**: Add TTS narration audio generation with single speaker monologue and dual speaker conversation (discussion, critical, debate styles)
- **Slide Narration**: AI auto-generates narration scripts with review/edit support; narrative structure includes intro on first page and closing on last page
- **Slide Narration**: Image and TTS generation run in parallel (Promise.allSettled); partial page failures don't affect other pages
- **Slide Narration**: Mini audio player below each image card for live preview in generation results
- **Slide Narration**: Lightbox audio player at bottom; download menu adds "Narration Audio" section (current page / all as ZIP)
- **Slide Narration**: ZIP download automatically includes narration audio files (narration-1.mp3, etc.)
- **Slide Narration**: Historical records automatically restore narration audio from OPFS
- **Components**: Add SearchableSelect filterable dropdown component (grouped options, keyboard navigation)

### Fixes
- **Audio Encoding**: Automatic WAV fallback when MP3 encoding fails, ensuring no audio loss
- **Audio Encoding**: Wrap lamejs with `?raw` import + `new Function()` to resolve Vite CJS bundling compatibility
- **Lightbox**: Reposition audio player as absolute overlay to prevent image squeezing; use fixed light colors for dark background visibility

### Documentation
- Update slide generation and history docs to cover narration audio features

## v0.25.23

_2026-01-28_

### New Features
- **Sticker**: Add standalone "Sticker Grid Cutter" tool page for uploading and cropping externally generated grid sticker sheets
- **Sticker**: Add grid cutter tool entry card in sticker mode

### Documentation
- **Docs Site**: Replace static hero image with looping video and fade transition

## v0.25.22

_2026-01-27_

### Fixes
- **Docs Site**: Fix double-click reset not working on touch devices (add double-tap detection)

## v0.25.21

_2026-01-27_

### New Features
- **Docs Site**: Add drag-to-rotate with physics (inertia + friction) to 3D banana model, supports mouse and touch, double-click to smoothly reset; hover follow effect preserved

## v0.25.20

_2026-01-26_

### Documentation
- Add Local-First / BYOK value proposition section to README

### Fixes
- **Slide Conversion**: Use aspect-ratio adaptive font sizing to fix oversized fonts for vertical text

### Removed
- Remove Google Analytics 4 tracking to align with "No Middleman" privacy-first philosophy

## v0.25.19

_2026-01-25_

### Documentation
- Add changelog pages with full version history (v0.1.0 ~ v0.25.18)
- Add changelog maintenance workflow to CLAUDE.md

## v0.25.18

_2026-01-25_

### New Features
- **Slide Conversion**: Add leave confirmation to prevent accidental loss of undownloaded results
- **Docs**: Add "Try It" button to standalone tool pages

## v0.25.17

_2026-01-25_

### Documentation
- Add inpaint before/after comparison images to slide conversion page

### Fixes
- **OCR**: Add rotation-aware line break detection for trapezoid regions

## v0.25.16

_2026-01-25_

### New Features
- **Region Editor**: Add keyboard shortcuts (Delete to remove, Escape to deselect)

### Fixes
- **Region Editor**: Fix resize handle click priority issue
- **OCR**: Improve polygon region merging to prevent self-intersection

### Documentation
- Add keyboard shortcuts section

## v0.25.15

_2026-01-25_

### New Features
- **Slide Conversion**: Add trapezoid mode for slanted text regions

### Documentation
- Add trapezoid mode documentation with screenshots

## v0.25.14

_2026-01-24_

### New Features
- **Docs**: Add touch support and adjust lighting for 3D banana model

## v0.25.13

_2026-01-24_

### Fixes
- **Docs**: Fix banana.glb path for GitHub Pages

## v0.25.12

_2026-01-24_

### New Features
- **Docs**: Add 3D banana model to hero section

### Fixes
- **Docs**: Fix "Back to App" link and add tagline line break

## v0.25.11

_2026-01-24_

### Fixes
- **Sketch**: Prevent selection box appearing in pan mode

### Documentation
- Add medium-zoom lightbox effect
- Add DeepWiki technical documentation link
- Correct misleading documentation across multiple pages

## v0.25.10

_2026-01-24_

### Fixes
- **Docs**: Fix newline character handling in TryItButton

## v0.25.9

_2026-01-24_

### Fixes
- **Docs**: Convert multiline TryItButton prompts to single line

## v0.25.8

_2026-01-24_

### New Features
- **Slide Conversion**: Add Gemini reprocess confirmation dialog to prevent unexpected API charges

## v0.25.7

_2026-01-24_

### New Features
- **Deep Linking**: Support URL query params for docs integration

### Documentation
- Add "Try It" button to feature guide pages
- Add API Key video tutorials
- Add NotebookLM and other use cases to slide conversion page

## v0.25.6

_2026-01-24_

### Performance
- Lazy load SketchCanvas to reduce HomeView bundle size

### Fixes
- **Docs**: Correct sitemap alternate links and add GA4 tracking

## v0.25.5

_2026-01-24_

### Fixes
- **PWA**: Exclude /docs/ from service worker navigation fallback

## v0.25.4

_2026-01-24_

### Fixes
- **Docs**: Correct sitemap URLs with base path

## v0.25.3

_2026-01-23_

### Fixes
- **Deploy**: Correct VitePress outDir path

## v0.25.2

_2026-01-23_

### Refactor
- Simplify VitePress base path detection

## v0.25.1

_2026-01-23_

### New Features
- Add documentation link and tour step

## v0.25.0

_2026-01-23_

### Major Updates
- **Documentation Site**: Add VitePress documentation site
- **Story Mode**: Use previous step image as reference for character continuity
- **SEO**: Add sitemap index for app and docs

### Fixes
- **i18n**: Add missing video error message keys

---

## Earlier Versions

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
