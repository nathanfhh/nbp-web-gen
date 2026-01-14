/**
 * Video Prompt Builder Options
 * Based on Google Veo official documentation
 *
 * Categories:
 * - Style: Film styles (sci-fi, horror, noir, cartoon, etc.)
 * - Camera: Camera position and movement
 * - Composition: Shot framing
 * - Lens: Focus and lens effects
 * - Ambiance: Color and lighting atmosphere
 * - Audio (Veo 3): Dialogue, sound effects, ambient sounds
 */

// Film/Visual Styles
export const VIDEO_STYLE_OPTIONS = [
  // Cinematic styles
  { value: 'cinematic', category: 'cinematic' },
  { value: 'documentary', category: 'cinematic' },
  { value: 'noir', category: 'cinematic' },
  { value: 'vintage', category: 'cinematic' },
  { value: 'retro', category: 'cinematic' },
  // Genre styles
  { value: 'scifi', category: 'genre' },
  { value: 'horror', category: 'genre' },
  { value: 'fantasy', category: 'genre' },
  { value: 'romance', category: 'genre' },
  { value: 'action', category: 'genre' },
  { value: 'thriller', category: 'genre' },
  // Animation styles
  { value: 'cartoon', category: 'animation' },
  { value: 'anime', category: 'animation' },
  { value: '3d-animation', category: 'animation' },
  { value: 'stop-motion', category: 'animation' },
  { value: 'pixar-style', category: 'animation' },
]

// Camera Position and Movement
export const VIDEO_CAMERA_OPTIONS = [
  // Position
  { value: 'eye-level', category: 'position' },
  { value: 'birds-eye', category: 'position' },
  { value: 'low-angle', category: 'position' },
  { value: 'high-angle', category: 'position' },
  { value: 'dutch-angle', category: 'position' },
  { value: 'overhead', category: 'position' },
  // Movement
  { value: 'tracking-shot', category: 'movement' },
  { value: 'dolly-shot', category: 'movement' },
  { value: 'pan', category: 'movement' },
  { value: 'tilt', category: 'movement' },
  { value: 'zoom-in', category: 'movement' },
  { value: 'zoom-out', category: 'movement' },
  { value: 'crane-shot', category: 'movement' },
  { value: 'handheld', category: 'movement' },
  { value: 'steadicam', category: 'movement' },
  { value: 'static', category: 'movement' },
]

// Shot Composition/Framing
export const VIDEO_COMPOSITION_OPTIONS = [
  { value: 'extreme-close-up', category: 'shot' },
  { value: 'close-up', category: 'shot' },
  { value: 'medium-close-up', category: 'shot' },
  { value: 'medium-shot', category: 'shot' },
  { value: 'medium-wide', category: 'shot' },
  { value: 'wide-shot', category: 'shot' },
  { value: 'extreme-wide', category: 'shot' },
  { value: 'establishing-shot', category: 'shot' },
  // Subject framing
  { value: 'single-shot', category: 'framing' },
  { value: 'two-shot', category: 'framing' },
  { value: 'group-shot', category: 'framing' },
  { value: 'over-the-shoulder', category: 'framing' },
  { value: 'pov', category: 'framing' },
]

// Focus and Lens Effects
export const VIDEO_LENS_OPTIONS = [
  { value: 'shallow-dof', category: 'focus' },
  { value: 'deep-dof', category: 'focus' },
  { value: 'soft-focus', category: 'focus' },
  { value: 'rack-focus', category: 'focus' },
  // Lens types
  { value: 'wide-angle-lens', category: 'lens' },
  { value: 'telephoto-lens', category: 'lens' },
  { value: 'macro-lens', category: 'lens' },
  { value: 'fisheye-lens', category: 'lens' },
  { value: 'anamorphic-lens', category: 'lens' },
  // Effects
  { value: 'lens-flare', category: 'effect' },
  { value: 'bokeh', category: 'effect' },
  { value: 'motion-blur', category: 'effect' },
]

// Ambiance (Color and Lighting)
export const VIDEO_AMBIANCE_OPTIONS = [
  // Time of day
  { value: 'golden-hour', category: 'time' },
  { value: 'blue-hour', category: 'time' },
  { value: 'midday', category: 'time' },
  { value: 'night', category: 'time' },
  { value: 'dawn', category: 'time' },
  { value: 'dusk', category: 'time' },
  // Color tones
  { value: 'warm-tones', category: 'color' },
  { value: 'cool-tones', category: 'color' },
  { value: 'muted-colors', category: 'color' },
  { value: 'vibrant-colors', category: 'color' },
  { value: 'monochrome', category: 'color' },
  { value: 'sepia', category: 'color' },
  // Lighting
  { value: 'natural-light', category: 'lighting' },
  { value: 'dramatic-lighting', category: 'lighting' },
  { value: 'soft-lighting', category: 'lighting' },
  { value: 'backlit', category: 'lighting' },
  { value: 'silhouette', category: 'lighting' },
  { value: 'neon-lights', category: 'lighting' },
  { value: 'candlelight', category: 'lighting' },
]

// Common Actions (for quick selection)
export const VIDEO_ACTION_OPTIONS = [
  { value: 'walking', category: 'movement' },
  { value: 'running', category: 'movement' },
  { value: 'sitting', category: 'static' },
  { value: 'standing', category: 'static' },
  { value: 'talking', category: 'interaction' },
  { value: 'looking-at-camera', category: 'interaction' },
  { value: 'turning-head', category: 'movement' },
  { value: 'dancing', category: 'movement' },
  { value: 'flying', category: 'movement' },
  { value: 'floating', category: 'movement' },
]

// All categories for the prompt builder UI
export const VIDEO_PROMPT_CATEGORIES = [
  {
    id: 'style',
    options: VIDEO_STYLE_OPTIONS,
    multiSelect: true,
    hasCustomInput: true,
  },
  {
    id: 'camera',
    options: VIDEO_CAMERA_OPTIONS,
    multiSelect: true,
    hasCustomInput: false,
  },
  {
    id: 'composition',
    options: VIDEO_COMPOSITION_OPTIONS,
    multiSelect: false,
    hasCustomInput: false,
  },
  {
    id: 'lens',
    options: VIDEO_LENS_OPTIONS,
    multiSelect: true,
    hasCustomInput: false,
  },
  {
    id: 'ambiance',
    options: VIDEO_AMBIANCE_OPTIONS,
    multiSelect: true,
    hasCustomInput: true,
  },
  {
    id: 'action',
    options: VIDEO_ACTION_OPTIONS,
    multiSelect: true,
    hasCustomInput: true,
  },
]

// Negative Prompt Options (things to avoid)
export const VIDEO_NEGATIVE_OPTIONS = [
  // Quality issues
  { value: 'low-quality', category: 'quality' },
  { value: 'blurry', category: 'quality' },
  { value: 'pixelated', category: 'quality' },
  { value: 'grainy', category: 'quality' },
  { value: 'overexposed', category: 'quality' },
  { value: 'underexposed', category: 'quality' },
  { value: 'noisy', category: 'quality' },
  // Style to avoid
  { value: 'cartoon', category: 'style' },
  { value: 'anime', category: 'style' },
  { value: 'drawing', category: 'style' },
  { value: 'painting', category: 'style' },
  { value: 'sketch', category: 'style' },
  { value: 'cgi', category: 'style' },
  { value: 'unrealistic', category: 'style' },
  // Content issues
  { value: 'text', category: 'content' },
  { value: 'watermark', category: 'content' },
  { value: 'logo', category: 'content' },
  { value: 'border', category: 'content' },
  { value: 'frame', category: 'content' },
  // Motion issues
  { value: 'static', category: 'motion' },
  { value: 'jittery', category: 'motion' },
  { value: 'slow-motion', category: 'motion' },
  { value: 'fast-motion', category: 'motion' },
]

// Default prompt builder options
export const DEFAULT_VIDEO_PROMPT_OPTIONS = {
  // Core description (user types this)
  subject: '',
  // Multi-select categories
  styles: [],
  cameras: [],
  composition: '',
  lenses: [],
  ambiances: [],
  actions: [],
  // Custom text inputs
  customStyle: '',
  customAmbiance: '',
  customAction: '',
  // Audio prompts (Veo 3)
  dialogue: '',
  soundEffects: '',
  ambientSound: '',
  // Negative prompt (separate field for API)
  negatives: [],
  customNegative: '',
}
