/**
 * Text LLM model options - Single Source of Truth
 * Used by: slides analysis, content splitter, narration scripts, character extraction, agent chat
 *
 * NOT for: TTS models (voiceOptions.js), video models (videoPricing.js), image models (imageOptions.js)
 */

export const TEXT_MODELS = [
  { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash' },
  { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro' },
]

export const DEFAULT_TEXT_MODEL = TEXT_MODELS[0].value
