/**
 * Default options for each generation mode
 * Single source of truth for initial and reset values
 */

export const DEFAULT_GENERATE_OPTIONS = {
  resolution: '1k',
  ratio: '1:1',
  styles: [],
  variations: [],
}

export const DEFAULT_EDIT_OPTIONS = {
  resolution: '1k',
  inputImage: null,
  inputImagePreview: null,
}

export const DEFAULT_STORY_OPTIONS = {
  resolution: '1k',
  steps: 4,
  type: 'unspecified',
  style: 'unspecified',
  transition: 'unspecified',
  format: 'unspecified',
}

export const DEFAULT_DIAGRAM_OPTIONS = {
  resolution: '1k',
  type: 'unspecified',
  style: 'unspecified',
  layout: 'unspecified',
  complexity: 'unspecified',
  annotations: 'unspecified',
}

export const DEFAULT_STICKER_OPTIONS = {
  resolution: '1k',
  ratio: '1:1',
  styles: [],
  // Layout
  layoutRows: 3,
  layoutCols: 3,
  // Context/Usage
  context: 'chat',
  customContext: '',
  // Text related
  hasText: true,
  tones: [],
  customTone: '',
  languages: ['zh-TW'],
  customLanguage: '',
  // Composition
  cameraAngles: ['headshot'],
  expressions: ['natural'],
}

export const DEFAULT_VIDEO_OPTIONS = {
  // Sub-mode
  subMode: 'text-to-video', // text-to-video | frames-to-video | references-to-video | extend-video
  // Generation settings
  model: 'fast', // fast | standard
  resolution: '720p', // 720p | 1080p | 4k
  ratio: '16:9', // 16:9 | 9:16
  duration: 8, // 4 | 6 | 8 seconds
  negativePrompt: '', // Things to avoid in the video
  // Frames-to-video
  startFrame: null, // { data: base64, mimeType, preview, name }
  endFrame: null,
  isLooping: false,
  // References-to-video
  referenceImages: [], // [{ data: base64, mimeType, preview, name, type: 'asset' | 'style' }]
  // Extend-video
  inputVideo: null, // { historyId, uri, thumbnail }
}

// Common settings defaults
export const DEFAULT_TEMPERATURE = 1.0
export const DEFAULT_SEED = ''

/**
 * Get a fresh copy of default options for a mode
 * @param {string} mode - 'generate' | 'edit' | 'story' | 'diagram' | 'sticker' | 'video'
 * @returns {Object} Deep copy of default options
 */
export const getDefaultOptions = (mode) => {
  const defaults = {
    generate: DEFAULT_GENERATE_OPTIONS,
    edit: DEFAULT_EDIT_OPTIONS,
    story: DEFAULT_STORY_OPTIONS,
    diagram: DEFAULT_DIAGRAM_OPTIONS,
    sticker: DEFAULT_STICKER_OPTIONS,
    video: DEFAULT_VIDEO_OPTIONS,
  }

  const defaultOption = defaults[mode]
  if (!defaultOption) return {}

  // Deep clone to avoid mutation
  return JSON.parse(JSON.stringify(defaultOption))
}
