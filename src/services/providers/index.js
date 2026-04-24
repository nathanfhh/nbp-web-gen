/**
 * Provider registry — thin re-export surface for the model catalog + helpers.
 *
 * Capability-specific adapters (openaiImage, openaiText, etc.) live alongside
 * this file and import `resolveModel` / `resolveProvider` from here.
 */

import {
  IMAGE_MODEL_CATALOG,
  TEXT_MODEL_CATALOG,
  EMBEDDING_MODEL_CATALOG,
  TTS_MODEL_CATALOG,
  findModel,
  getProviderForModel,
  getDefaultModelId,
  groupByProvider,
  filterCatalog,
} from '@/constants/modelCatalog'

export function resolveProvider(capability, modelId) {
  return getProviderForModel(capability, modelId)
}

export function resolveModel(capability, modelId) {
  return findModel(capability, modelId)
}

export {
  IMAGE_MODEL_CATALOG,
  TEXT_MODEL_CATALOG,
  EMBEDDING_MODEL_CATALOG,
  TTS_MODEL_CATALOG,
  getDefaultModelId,
  groupByProvider,
  filterCatalog,
}
