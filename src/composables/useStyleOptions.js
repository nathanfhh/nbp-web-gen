import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * Shared composable for style and variation options with i18n support
 * Used by GenerateOptions.vue and StickerOptions.vue
 */
export function useStyleOptions() {
  const { t } = useI18n()

  const PREDEFINED_STYLES = computed(() => [
    { value: 'photorealistic', label: t('styles.photorealistic') },
    { value: 'watercolor', label: t('styles.watercolor') },
    { value: 'oil-painting', label: t('styles.oilPainting') },
    { value: 'sketch', label: t('styles.sketch') },
    { value: 'pixel-art', label: t('styles.pixelArt') },
    { value: 'anime', label: t('styles.anime') },
    { value: 'pixar', label: t('styles.pixar') },
    { value: 'vintage', label: t('styles.vintage') },
    { value: 'modern', label: t('styles.modern') },
    { value: 'abstract', label: t('styles.abstract') },
    { value: 'minimalist', label: t('styles.minimalist') },
  ])

  const PREDEFINED_VARIATIONS = computed(() => [
    { value: 'lighting', label: t('variations.lighting') },
    { value: 'angle', label: t('variations.angle') },
    { value: 'color-palette', label: t('variations.colorPalette') },
    { value: 'composition', label: t('variations.composition') },
    { value: 'mood', label: t('variations.mood') },
    { value: 'season', label: t('variations.season') },
    { value: 'time-of-day', label: t('variations.timeOfDay') },
  ])

  return {
    PREDEFINED_STYLES,
    PREDEFINED_VARIATIONS,
  }
}
