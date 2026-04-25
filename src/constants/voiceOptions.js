/**
 * Voice options for TTS (Text-to-Speech) generation
 * Gemini TTS supports 30 voices with different characteristics
 *
 * Reference: https://ai.google.dev/gemini-api/docs/text-to-speech
 */
import { DEFAULT_TEXT_MODEL } from './modelOptions'
import { TTS_MODEL_CATALOG } from './modelCatalog'

export const VOICES = [
  { name: 'Zephyr', characteristic: 'Bright', gender: 'female' },
  { name: 'Puck', characteristic: 'Upbeat', gender: 'male' },
  { name: 'Charon', characteristic: 'Informative', gender: 'male' },
  { name: 'Kore', characteristic: 'Firm', gender: 'female' },
  { name: 'Fenrir', characteristic: 'Excitable', gender: 'male' },
  { name: 'Leda', characteristic: 'Youthful', gender: 'female' },
  { name: 'Orus', characteristic: 'Firm', gender: 'male' },
  { name: 'Aoede', characteristic: 'Breezy', gender: 'female' },
  { name: 'Callirrhoe', characteristic: 'Easy-going', gender: 'female' },
  { name: 'Autonoe', characteristic: 'Bright', gender: 'female' },
  { name: 'Enceladus', characteristic: 'Breathy', gender: 'male' },
  { name: 'Iapetus', characteristic: 'Clear', gender: 'male' },
  { name: 'Umbriel', characteristic: 'Easy-going', gender: 'male' },
  { name: 'Algieba', characteristic: 'Smooth', gender: 'male' },
  { name: 'Despina', characteristic: 'Smooth', gender: 'female' },
  { name: 'Erinome', characteristic: 'Clear', gender: 'female' },
  { name: 'Algenib', characteristic: 'Gravelly', gender: 'male' },
  { name: 'Rasalgethi', characteristic: 'Informative', gender: 'male' },
  { name: 'Laomedeia', characteristic: 'Upbeat', gender: 'female' },
  { name: 'Achernar', characteristic: 'Soft', gender: 'female' },
  { name: 'Alnilam', characteristic: 'Firm', gender: 'male' },
  { name: 'Schedar', characteristic: 'Even', gender: 'male' },
  { name: 'Gacrux', characteristic: 'Mature', gender: 'female' },
  { name: 'Pulcherrima', characteristic: 'Forward', gender: 'female' },
  { name: 'Achird', characteristic: 'Friendly', gender: 'male' },
  { name: 'Zubenelgenubi', characteristic: 'Casual', gender: 'male' },
  { name: 'Vindemiatrix', characteristic: 'Gentle', gender: 'female' },
  { name: 'Sadachbia', characteristic: 'Lively', gender: 'male' },
  { name: 'Sadaltager', characteristic: 'Knowledgeable', gender: 'male' },
  { name: 'Sulafat', characteristic: 'Warm', gender: 'female' },
]

export const DEFAULT_LANGUAGES = [
  {
    code: 'en-US',
    label: 'English (US)',
    scriptInstruction: 'Write all narration scripts in American English.',
    accentDirective: 'Speak in American English with a natural US accent.',
  },
  {
    code: 'en-GB',
    label: 'English (UK)',
    scriptInstruction: 'Write all narration scripts in British English. Use British spelling and vocabulary (e.g., "colour", "organisation", "whilst").',
    accentDirective: 'Speak in British English with a natural UK accent.',
  },
  {
    code: 'cmn-TW',
    label: '中文（台灣）',
    scriptInstruction: 'Write all narration scripts in Traditional Chinese (繁體中文), using vocabulary and phrasing natural to Taiwan (台灣用語). Do NOT use Simplified Chinese or Mainland Chinese expressions.',
    accentDirective: 'Speak in Taiwanese Mandarin (台灣中文). Use vocabulary, phrasing, and pronunciation natural to Taiwan rather than Mainland China.',
  },
]

/**
 * Find language config by code. Falls back to a generic config for custom languages.
 * @param {string} code - Language code (e.g., 'en-US', 'cmn-TW')
 * @param {Array} [customLanguages] - User-added custom languages with { code, label }
 * @returns {{ scriptInstruction: string, accentDirective: string }}
 */
export function getLanguageDirectives(code, customLanguages) {
  const found = DEFAULT_LANGUAGES.find((l) => l.code === code)
  if (found) return found

  // Look up label from custom languages
  const custom = customLanguages?.find((l) => l.code === code)
  const displayName = custom?.label || code
  return {
    scriptInstruction: `Write all narration scripts in ${displayName}.`,
    accentDirective: `Speak in ${displayName}.`,
  }
}

export const NARRATION_STYLES = ['discussion', 'critical', 'debate']

export { TEXT_MODELS as SCRIPT_MODELS } from './modelOptions'

// Derived from TTS_MODEL_CATALOG so any provider added to the catalog
// shows up in every TTS selector in the UI.
export const TTS_MODELS = TTS_MODEL_CATALOG.map((m) => ({
  value: m.id,
  label: m.label,
  provider: m.provider,
  group: m.group,
}))

// OpenAI TTS voices. Per OpenAI's /audio/speech docs, model support diverges:
//   - tts-1 / tts-1-hd:        9 voices (the legacy set)
//   - gpt-4o-mini-tts:         13 voices (legacy set + ballad / verse / marin / cedar)
// `models` lists the OpenAI TTS model id PREFIXES that accept the voice. The
// caller filters by selected ttsModel before showing options.
export const OPENAI_VOICES = [
  { name: 'alloy', characteristic: 'Neutral', models: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts'] },
  { name: 'ash', characteristic: 'Crisp', models: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts'] },
  { name: 'coral', characteristic: 'Soft', models: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts'] },
  { name: 'echo', characteristic: 'Expressive', models: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts'] },
  { name: 'fable', characteristic: 'Narrative', models: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts'] },
  { name: 'nova', characteristic: 'Bright', models: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts'] },
  { name: 'onyx', characteristic: 'Deep', models: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts'] },
  { name: 'sage', characteristic: 'Measured', models: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts'] },
  { name: 'shimmer', characteristic: 'Warm', models: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts'] },
  { name: 'ballad', characteristic: 'Melodic', models: ['gpt-4o-mini-tts'] },
  { name: 'verse', characteristic: 'Lyrical', models: ['gpt-4o-mini-tts'] },
  { name: 'marin', characteristic: 'Natural', models: ['gpt-4o-mini-tts'] },
  { name: 'cedar', characteristic: 'Grounded', models: ['gpt-4o-mini-tts'] },
]

/**
 * Return the subset of OpenAI voices supported by the given OpenAI TTS model.
 * Matches by prefix so versioned models (e.g. `gpt-4o-mini-tts-2025-12-15`)
 * resolve to the `gpt-4o-mini-tts` family.
 */
export function getOpenAIVoicesForModel(modelId) {
  if (!modelId) return OPENAI_VOICES
  return OPENAI_VOICES.filter((v) =>
    v.models.some((prefix) => modelId === prefix || modelId.startsWith(`${prefix}-`)),
  )
}

/**
 * Get default narration language based on current i18n locale
 */
function getDefaultNarrationLanguage() {
  try {
    const saved = localStorage.getItem('nbp-locale')
    const locale = saved || navigator.language || ''
    return locale.startsWith('zh') ? 'cmn-TW' : 'en-US'
  } catch {
    return 'en-US'
  }
}

export const DEFAULT_NARRATION_SETTINGS = {
  enabled: false,
  speakerMode: 'single', // 'single' | 'dual'
  speakers: [
    { name: 'Speaker 1', voiceName: 'Zephyr' },
    { name: 'Speaker 2', voiceName: 'Puck' },
  ],
  style: 'discussion', // 'discussion' | 'critical' | 'debate'
  language: getDefaultNarrationLanguage(),
  customLanguages: [], // User-added custom languages, stored in localStorage
  customPrompt: '', // User free-form additional guidance
  scriptModel: DEFAULT_TEXT_MODEL,
  ttsModel: 'gemini-2.5-flash-preview-tts',
}
