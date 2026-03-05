/**
 * Model display name utilities
 * Maps internal model code names to human-readable labels
 */
import { IMAGE_MODELS, DEFAULT_MODEL } from '@/constants/imageOptions'
import { TEXT_MODELS } from '@/constants/modelOptions'
import { VEO_MODEL_OPTIONS } from '@/constants/videoPricing'

// Full label map: codeName → full label (for info panel)
const modelMap = new Map()
for (const m of IMAGE_MODELS) modelMap.set(m.value, m.label)
for (const m of TEXT_MODELS) modelMap.set(m.value, m.label)
for (const m of VEO_MODEL_OPTIONS) modelMap.set(m.value, m.label)

// Short label map: codeName → compact tag label (for history list)
const shortMap = new Map([
  ['gemini-3-pro-image-preview', '3 Pro'],
  ['gemini-3.1-flash-image-preview', '3.1 Flash'],
  ['gemini-3-flash-preview', '3 Flash'],
  ['gemini-3.1-pro-preview', '3.1 Pro'],
  ['fast', 'Fast'],
  ['standard', 'High Quality'],
])

// Image generation modes that default to DEFAULT_MODEL when no model specified
const IMAGE_MODES = new Set(['generate', 'sticker', 'edit', 'story', 'diagram', 'slides'])

/**
 * Get full display name for a model code name.
 * @param {string|null|undefined} codeName
 * @returns {string|null} Full label or null
 */
export function getModelDisplayName(codeName) {
  if (!codeName) return null
  return modelMap.get(codeName) || null
}

/**
 * Get short display name for a model code name (for tags/badges).
 * @param {string|null|undefined} codeName
 * @returns {string|null} Short label or null
 */
export function getModelShortName(codeName) {
  if (!codeName) return null
  return shortMap.get(codeName) || null
}

/**
 * Get the model short name from a history item's mode + options.
 * Image modes without options.model default to the default image model.
 * @param {string} mode
 * @param {Object|null|undefined} options
 * @returns {string|null} Short display name or null
 */
export function getHistoryModelName(mode, options) {
  if (mode === 'agent') return '3 Flash'

  // Video mode
  if (mode === 'video') {
    const code = options?.model
    return code ? getModelShortName(code) : null
  }

  // Image modes: default to DEFAULT_MODEL when no model in options
  if (IMAGE_MODES.has(mode)) {
    const code = options?.model || DEFAULT_MODEL
    return getModelShortName(code)
  }

  // Fallback
  if (options?.model) {
    return getModelShortName(options.model)
  }

  return null
}
