/**
 * Video generation options and pricing constants
 * Veo 3.1 API configuration
 */

// Veo 3.1 Model IDs
export const VEO_MODELS = {
  FAST: 'veo-3.1-fast-generate-preview',
  STANDARD: 'veo-3.1-generate-preview',
}

// Model options for UI
export const VEO_MODEL_OPTIONS = [
  { value: 'fast', label: 'Fast', modelId: VEO_MODELS.FAST },
  { value: 'standard', label: 'High Quality', modelId: VEO_MODELS.STANDARD },
]

// Video resolutions
export const VIDEO_RESOLUTION_OPTIONS = [
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
  { value: '4k', label: '4K' },
]

// Video aspect ratios (Veo only supports 16:9 and 9:16)
export const VIDEO_RATIO_OPTIONS = [
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
]

// Video sub-modes
export const VIDEO_SUB_MODES = {
  TEXT_TO_VIDEO: 'text-to-video',
  FRAMES_TO_VIDEO: 'frames-to-video',
  REFERENCES_TO_VIDEO: 'references-to-video',
  EXTEND_VIDEO: 'extend-video',
}

// Sub-mode options for UI
export const VIDEO_SUB_MODE_OPTIONS = [
  { value: VIDEO_SUB_MODES.TEXT_TO_VIDEO, icon: 'type' },
  { value: VIDEO_SUB_MODES.FRAMES_TO_VIDEO, icon: 'image' },
  { value: VIDEO_SUB_MODES.REFERENCES_TO_VIDEO, icon: 'images' },
  { value: VIDEO_SUB_MODES.EXTEND_VIDEO, icon: 'plus-circle' },
]

// Video duration options
export const VIDEO_DURATION_OPTIONS = [
  { value: 4, label: '4s' },
  { value: 6, label: '6s' },
  { value: 8, label: '8s' },
]

// Default video duration
export const VIDEO_DEFAULT_DURATION = 8

// Pricing per second (USD)
// Source: Google Cloud Veo pricing page (2025)
// Prices vary by model, resolution, and audio setting
export const VEO_PRICING = {
  standard: {
    '720p': { audio: 0.4, noAudio: 0.2 },
    '1080p': { audio: 0.4, noAudio: 0.2 },
    '4k': { audio: 0.6, noAudio: 0.4 },
  },
  fast: {
    '720p': { audio: 0.15, noAudio: 0.1 },
    '1080p': { audio: 0.15, noAudio: 0.1 },
    '4k': { audio: 0.35, noAudio: 0.3 },
  },
}

/**
 * Get price per second for video generation
 * @param {string} model - 'fast' | 'standard'
 * @param {string} resolution - '720p' | '1080p' | '4k'
 * @param {boolean} generateAudio - Whether audio is enabled (default: true)
 * @returns {number} Price per second in USD
 */
export const getVideoPricePerSecond = (model, resolution, generateAudio = true) => {
  const modelPricing = VEO_PRICING[model] || VEO_PRICING.fast
  const resPricing = modelPricing[resolution] || modelPricing['720p']
  return generateAudio ? resPricing.audio : resPricing.noAudio
}

/**
 * Calculate video generation cost
 * @param {string} model - 'fast' | 'standard'
 * @param {string} resolution - '720p' | '1080p' | '4k'
 * @param {number} duration - Duration in seconds (4, 6, or 8)
 * @param {boolean} generateAudio - Whether audio is enabled (default: true)
 * @returns {number} Cost in USD
 */
export const calculateVideoCost = (model, resolution, duration, generateAudio = true) => {
  const pricePerSecond = getVideoPricePerSecond(model, resolution, generateAudio)
  return pricePerSecond * duration
}

// Resolution-specific constraints
// 1080p and 4k only support 8 seconds duration
export const VIDEO_RESOLUTION_CONSTRAINTS = {
  '720p': {
    allowedDurations: [4, 6, 8],
  },
  '1080p': {
    allowedDurations: [8],
    lockedDuration: 8,
  },
  '4k': {
    allowedDurations: [8],
    lockedDuration: 8,
  },
}

// Mode-specific constraints
export const VIDEO_MODE_CONSTRAINTS = {
  [VIDEO_SUB_MODES.TEXT_TO_VIDEO]: {
    // No special constraints
  },
  [VIDEO_SUB_MODES.FRAMES_TO_VIDEO]: {
    requiresStartFrame: true,
  },
  [VIDEO_SUB_MODES.REFERENCES_TO_VIDEO]: {
    // Locked settings (per Google Cloud docs - 2026/01 update)
    // - Model: Veo 3.1 only (Fast not supported)
    // - Duration: 8 seconds only
    // - Resolution & Ratio: Now unlocked (supports 720p/1080p/4k, 16:9/9:16)
    lockedModel: 'standard',
    lockedDuration: 8,
    maxReferenceImages: 3,
    requiresPrompt: true,
  },
  [VIDEO_SUB_MODES.EXTEND_VIDEO]: {
    // Locked to 720p and 8s (per Google Cloud docs)
    lockedResolution: '720p',
    lockedDuration: 8,
    requiresInputVideo: true,
  },
}

// Polling configuration
export const VIDEO_POLLING_INTERVAL_MS = 10000 // 10 seconds
export const VIDEO_POLLING_MAX_ATTEMPTS = 60 // 10 minutes max
