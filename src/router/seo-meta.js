/**
 * SEO meta tags for each route
 * Used by:
 * - src/router/index.js (Vue Router meta)
 * - scripts/postbuild.js (static HTML generation)
 *
 * ⚠️ When adding a new route, add its meta here first!
 */

export const routeSeoMeta = {
  '/': {
    title: 'Mediator | AI Image & Video Generator - Powered by Gemini & Veo',
    description:
      'Mediator (Media + Creator) - AI Image & Video Generator powered by Gemini & Veo 3.1. Create images, videos, stickers, stories, diagrams, and presentation slides. 100% client-side, no backend.',
  },
  '/character-extractor': {
    title: 'Character Extractor | Mediator - AI Character Trait Extraction',
    description:
      'Extract character traits from images using AI. Save and reuse characters across generation modes for consistent character design. Powered by Google Gemini.',
  },
  '/line-sticker-tool': {
    title: 'LINE Sticker Tool | Mediator - Sticker Compliance & Export',
    description:
      'Prepare stickers for LINE Store submission. Auto-resize, even dimension enforcement, cover image generation (main.png/tab.png), and batch ZIP export.',
  },
  '/slide-to-pptx': {
    title: 'Slide to PPTX Converter | Mediator - OCR & Text Extraction',
    description:
      'Convert NotebookLM slides, PDF presentations, or images to editable PowerPoint files. Client-side OCR with PaddleOCR, text removal with OpenCV.js or Gemini API. All processing in browser.',
  },
}
