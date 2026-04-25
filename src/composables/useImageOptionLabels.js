import { computed } from 'vue'
import { useGeneratorStore } from '@/stores/generator'
import { getProviderForModel } from '@/constants/modelCatalog'
import { RESOLUTION_OPTIONS } from '@/constants/imageOptions'
import { OPENAI_RESOLUTION_LABELS, mapAspectToSize } from '@/services/providers/openaiImage'

/**
 * Provider-aware labels for image-mode option pickers.
 *
 * The internal option value ('1k' / '2k' / '4k') stays stable so user
 * preferences round-trip across providers; only the visible label changes:
 * - Gemini: "1K" / "2K" / "4K"
 * - OpenAI: "Low" / "Medium" / "High" (matches the underlying quality arg)
 *
 * sizeHint(ratio, resolution) returns the exact pixel size the OpenAI
 * endpoint will receive (e.g. "2048x1152"), or null for Gemini where the
 * resolution is implicit.
 */
export function useImageOptionLabels() {
  const store = useGeneratorStore()

  const imageProvider = computed(() => getProviderForModel('image', store.imageModel) || 'gemini')

  const resolutionOptions = computed(() => {
    if (imageProvider.value === 'openai') {
      return RESOLUTION_OPTIONS.map((r) => ({
        value: r.value,
        label: OPENAI_RESOLUTION_LABELS[r.value] || r.label,
      }))
    }
    return RESOLUTION_OPTIONS
  })

  function sizeHint(ratio, resolution) {
    if (imageProvider.value !== 'openai') return null
    return mapAspectToSize(ratio, resolution)
  }

  return { imageProvider, resolutionOptions, sizeHint }
}
