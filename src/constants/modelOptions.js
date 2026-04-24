/**
 * Text LLM model options - Single Source of Truth
 * Used by: slides analysis, content splitter, narration scripts, character extraction, agent chat
 *
 * NOT for: TTS models (voiceOptions.js), video models (videoPricing.js), image models (imageOptions.js)
 *
 * Derived from modelCatalog.TEXT_MODEL_CATALOG so adding a provider in one place
 * propagates to every text-model selector in the UI.
 */

import { TEXT_MODEL_CATALOG } from './modelCatalog'

export const TEXT_MODELS = TEXT_MODEL_CATALOG.map((m) => ({
  value: m.id,
  label: m.label,
  provider: m.provider,
  group: m.group,
}))

export const DEFAULT_TEXT_MODEL = TEXT_MODEL_CATALOG.find((m) => m.isDefault)?.id
  || TEXT_MODEL_CATALOG[0].id
