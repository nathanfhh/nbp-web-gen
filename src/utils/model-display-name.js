/**
 * Model display name utilities
 * Maps internal model code names to human-readable labels
 */
import { DEFAULT_MODEL } from '@/constants/imageOptions'
import { VEO_MODEL_OPTIONS } from '@/constants/videoPricing'
import {
  IMAGE_MODEL_CATALOG,
  TEXT_MODEL_CATALOG,
  TTS_MODEL_CATALOG,
  EMBEDDING_MODEL_CATALOG,
  getProviderForModel,
} from '@/constants/modelCatalog'

// Full label map: codeName → full label (for info panel).
// IMAGE_MODELS / TEXT_MODELS now derive from the catalog, so iterating those
// would re-add the same entries; pull straight from the catalogs instead.
// TTS / embedding catalogs are included so future per-record TTS / embedding
// model fields render correctly.
const modelMap = new Map()
for (const m of IMAGE_MODEL_CATALOG) modelMap.set(m.id, m.label)
for (const m of TEXT_MODEL_CATALOG) modelMap.set(m.id, m.label)
for (const m of TTS_MODEL_CATALOG) modelMap.set(m.id, m.label)
for (const m of EMBEDDING_MODEL_CATALOG) modelMap.set(m.id, m.label)
for (const m of VEO_MODEL_OPTIONS) modelMap.set(m.value, m.label)

// Short label map: codeName → compact tag label (for history list)
const shortMap = new Map([
  ['gemini-3-pro-image-preview', '3 Pro'],
  ['gemini-3.1-flash-image-preview', '3.1 Flash'],
  ['gemini-3-flash-preview', '3 Flash'],
  ['gemini-3.1-pro-preview', '3.1 Pro'],
  ['gpt-image-2', 'GPT Image 2'],
  ['gpt-image-1-mini', 'GPT Image 1m'],
  ['gpt-5.4', 'GPT-5.4'],
  ['gpt-5.4-mini', 'GPT-5.4m'],
  ['fast', 'Fast'],
  ['standard', 'High Quality'],
])

// Image generation modes that default to DEFAULT_MODEL when no model specified
const IMAGE_MODES = new Set(['generate', 'sticker', 'edit', 'story', 'diagram', 'slides'])

/**
 * Resolve the provider for a history record without requiring a separate
 * persisted field. Older records (pre-OpenAI) and JSON backups only carry
 * `options.model`; this helper infers the provider by scanning every catalog.
 *
 * @param {Object|null|undefined} record
 * @returns {'gemini'|'openai'|'local'|null}
 */
export function getRecordProvider(record) {
  if (!record) return null
  // Video and Agent are Gemini-only by design. Their option.model values
  // ('fast' / 'standard' for Veo, none for agent) aren't registered in any
  // capability catalog, so the catalog-loop fallback below would return null
  // for an obviously-Gemini record. Resolve them up front.
  if (record.mode === 'video' || record.mode === 'agent') return 'gemini'

  const modelId = record?.options?.model
  if (!modelId) {
    // Image modes implicitly default to the Gemini default image model.
    if (IMAGE_MODES.has(record.mode)) return 'gemini'
    return null
  }
  for (const capability of ['image', 'text', 'tts', 'embedding']) {
    const provider = getProviderForModel(capability, modelId)
    if (provider) return provider
  }
  return null
}

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
