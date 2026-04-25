/**
 * Model Catalog — Single Source of Truth for all AI provider models.
 *
 * Capabilities: image | text | embedding | tts
 * Providers:    gemini | openai | local
 *
 * Entry shape:
 * - id:                 exact model ID used in API calls; unique *within each
 *                       capability* (findModel / getProviderForModel scope to
 *                       a single capability, so cross-capability collisions
 *                       are technically allowed but discouraged for clarity)
 * - provider:           'gemini' | 'openai' | 'local'
 * - group:              display group name (used by grouped UI)
 * - label:              display name in dropdown
 * - isDefault?:         pre-selected when user has no saved preference
 * - deprecated?:        flagged in UI but still callable
 *
 * Capability-specific fields:
 * - supportsThinking?:    (text) model exposes streamed reasoning traces
 * - supportsImage?:       (embedding) model accepts image input
 * - nativeDims?:          (embedding) full vector dimensionality
 * - dimensions?:          (embedding) truncated output dimensions (matryoshka)
 * - baseModel?:           (embedding) the underlying model id if this entry is a truncated variant
 * - supportsMultiSpeaker?:(tts) native multi-speaker support
 * - supportsInstructions?:(tts) supports natural-language steerability
 */

export const IMAGE_MODEL_CATALOG = [
  {
    id: 'gemini-3-pro-image-preview',
    provider: 'gemini',
    group: 'Gemini',
    label: 'Nano Banana Pro',
    isDefault: true,
  },
  {
    id: 'gemini-3.1-flash-image-preview',
    provider: 'gemini',
    group: 'Gemini',
    label: 'Nano Banana 2',
  },
  {
    id: 'gpt-image-2',
    provider: 'openai',
    group: 'OpenAI',
    label: 'GPT Image 2',
  },
  {
    id: 'gpt-image-1-mini',
    provider: 'openai',
    group: 'OpenAI',
    label: 'GPT Image 1 mini',
  },
]

export const TEXT_MODEL_CATALOG = [
  {
    id: 'gemini-3-flash-preview',
    provider: 'gemini',
    group: 'Gemini',
    label: 'Gemini 3 Flash',
    supportsThinking: true,
    isDefault: true,
  },
  {
    id: 'gemini-3.1-pro-preview',
    provider: 'gemini',
    group: 'Gemini',
    label: 'Gemini 3.1 Pro',
    supportsThinking: true,
  },
  {
    id: 'gpt-5.4-mini',
    provider: 'openai',
    group: 'OpenAI',
    label: 'GPT-5.4 mini',
    supportsThinking: false,
  },
  {
    id: 'gpt-5.4',
    provider: 'openai',
    group: 'OpenAI',
    label: 'GPT-5.4',
    supportsThinking: false,
  },
]

// Embedding catalog — each truncated variant is exposed as a first-class entry
// so UI and storage can treat them as distinct selectable models.
export const EMBEDDING_MODEL_CATALOG = [
  {
    id: 'gemini-embedding-2-preview',
    provider: 'gemini',
    group: 'Gemini',
    label: 'Gemini Embedding 2',
    nativeDims: 768,
    supportsImage: true,
    isDefault: true,
  },
  {
    id: 'text-embedding-3-small',
    provider: 'openai',
    group: 'OpenAI',
    label: 'OpenAI Embedding 3 small',
    nativeDims: 1536,
    supportsImage: false,
    baseModel: 'text-embedding-3-small',
  },
  {
    id: 'text-embedding-3-small@768',
    provider: 'openai',
    group: 'OpenAI',
    label: 'OpenAI Embedding 3 small (768d)',
    nativeDims: 1536,
    dimensions: 768,
    supportsImage: false,
    baseModel: 'text-embedding-3-small',
  },
  {
    id: 'text-embedding-3-large',
    provider: 'openai',
    group: 'OpenAI',
    label: 'OpenAI Embedding 3 large',
    nativeDims: 3072,
    supportsImage: false,
    baseModel: 'text-embedding-3-large',
  },
  {
    id: 'text-embedding-3-large@1536',
    provider: 'openai',
    group: 'OpenAI',
    label: 'OpenAI Embedding 3 large (1536d)',
    nativeDims: 3072,
    dimensions: 1536,
    supportsImage: false,
    baseModel: 'text-embedding-3-large',
  },
  {
    id: 'text-embedding-3-large@768',
    provider: 'openai',
    group: 'OpenAI',
    label: 'OpenAI Embedding 3 large (768d)',
    nativeDims: 3072,
    dimensions: 768,
    supportsImage: false,
    baseModel: 'text-embedding-3-large',
  },
  {
    id: 'local:e5-small',
    provider: 'local',
    group: 'Local',
    label: 'Multilingual E5 small (on-device)',
    nativeDims: 384,
    supportsImage: false,
  },
]

export const TTS_MODEL_CATALOG = [
  {
    id: 'gemini-2.5-flash-preview-tts',
    provider: 'gemini',
    group: 'Gemini',
    label: 'Gemini Flash TTS',
    supportsMultiSpeaker: true,
    isDefault: true,
  },
  {
    id: 'gemini-2.5-pro-preview-tts',
    provider: 'gemini',
    group: 'Gemini',
    label: 'Gemini Pro TTS',
    supportsMultiSpeaker: true,
  },
  {
    id: 'gpt-4o-mini-tts-2025-12-15',
    provider: 'openai',
    group: 'OpenAI',
    label: 'GPT-4o mini TTS (2025-12-15)',
    supportsMultiSpeaker: false,
    supportsInstructions: true,
    deprecated: true,
  },
  {
    id: 'tts-1',
    provider: 'openai',
    group: 'OpenAI',
    label: 'TTS-1',
    supportsMultiSpeaker: false,
    supportsInstructions: false,
  },
  {
    id: 'tts-1-hd',
    provider: 'openai',
    group: 'OpenAI',
    label: 'TTS-1 HD',
    supportsMultiSpeaker: false,
    supportsInstructions: false,
  },
]

const CATALOGS = {
  image: IMAGE_MODEL_CATALOG,
  text: TEXT_MODEL_CATALOG,
  embedding: EMBEDDING_MODEL_CATALOG,
  tts: TTS_MODEL_CATALOG,
}

export function getCatalog(capability) {
  return CATALOGS[capability] || null
}

export function findModel(capability, id) {
  const catalog = CATALOGS[capability]
  if (!catalog) return null
  return catalog.find((m) => m.id === id) || null
}

export function getProviderForModel(capability, id) {
  return findModel(capability, id)?.provider || null
}

export function getDefaultModelId(capability) {
  const catalog = CATALOGS[capability]
  if (!catalog) return null
  return (catalog.find((m) => m.isDefault) || catalog[0])?.id || null
}

/**
 * Group catalog entries by provider display group.
 * Preserves insertion order of groups as encountered in the catalog.
 */
export function groupByProvider(capability) {
  const catalog = CATALOGS[capability]
  if (!catalog) return []
  const groups = new Map()
  for (const entry of catalog) {
    if (!groups.has(entry.group)) groups.set(entry.group, [])
    groups.get(entry.group).push(entry)
  }
  return Array.from(groups.entries()).map(([group, items]) => ({ group, items }))
}

/**
 * Filter the catalog by predicate (e.g., only entries whose provider key is configured).
 */
export function filterCatalog(capability, predicate) {
  const catalog = CATALOGS[capability]
  if (!catalog) return []
  return catalog.filter(predicate)
}
