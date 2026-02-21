/**
 * Default options for each generation mode
 * Single source of truth for initial and reset values
 */
import { DEFAULT_NARRATION_SETTINGS } from './voiceOptions'
import { DEFAULT_TEXT_MODEL } from './modelOptions'

/**
 * Maximum number of images that can be uploaded at once
 * Used by ImageUploader (reference images) and AgentChat (pending images)
 */
export const MAX_UPLOAD_IMAGES = 5

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

export const DEFAULT_AGENT_OPTIONS = {
  contextDepth: 5, // 上下文深度 (1-10)
  includeImagesInContext: true, // 是否在上下文中包含圖片（Vision 模式預設開啟）
}

export const DEFAULT_SLIDES_OPTIONS = {
  // Image settings
  resolution: '2k', // 1k | 2k | 4k
  ratio: '16:9', // 16:9 | 4:3 | 1:1

  // Concurrent generation (1-10)
  concurrency: 3,

  // Audio concurrent generation (1-5, TTS API limit is 10 RPM)
  audioConcurrency: 2,

  // Analysis model selection
  analysisModel: DEFAULT_TEXT_MODEL,

  // User input (separated by ---)
  pagesRaw: '',

  // Parsed pages array
  // Each page: { id, pageNumber, content, status, image, error, referenceImages, styleGuide }
  pages: [],

  // Global reference images (applied to all pages)
  // Each: { data, preview, mimeType, name }
  globalReferenceImages: [],

  // User guidance for style analysis (free typing)
  styleGuidance: '',

  // AI analyzed style (editable by user)
  analyzedStyle: '',
  styleConfirmed: false,

  // Generation progress
  currentPageIndex: -1, // -1 means not started
  totalPages: 0,

  // Progress timing (for ETA calculation)
  progressStartTime: null, // Timestamp when generation started
  pageGenerationTimes: [], // Array of ms taken for each completed page

  // Style analysis state
  isAnalyzing: false,
  analysisError: null,

  // Narration settings
  narration: { ...DEFAULT_NARRATION_SETTINGS },

  // Runtime narration state (not persisted to localStorage)
  narrationScripts: [], // Generated scripts per page: [{ pageId, styleDirective, script }]
  narrationGlobalStyle: '', // Global style directive from script generation
  narrationStatus: 'idle', // 'idle' | 'generating-scripts' | 'generating-audio' | 'done' | 'error'
  narrationError: null,
  audioCompletedCount: 0, // Number of audio files completed (for progress tracking)
  audioTotalCount: 0, // Total number of audio files to generate
}

// Common settings defaults
export const DEFAULT_TEMPERATURE = 1.0
export const DEFAULT_SEED = ''

/**
 * Get a fresh copy of default options for a mode
 * @param {string} mode - 'generate' | 'edit' | 'story' | 'diagram' | 'sticker' | 'video' | 'slides'
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
    slides: DEFAULT_SLIDES_OPTIONS,
    agent: DEFAULT_AGENT_OPTIONS,
  }

  const defaultOption = defaults[mode]
  if (!defaultOption) return {}

  // Deep clone to avoid mutation
  return JSON.parse(JSON.stringify(defaultOption))
}
