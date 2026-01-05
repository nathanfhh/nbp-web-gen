import { DEFAULT_GENERATE_OPTIONS } from '@/constants'

/**
 * Google Analytics 4 event tracking composable
 */
export function useAnalytics() {
  /**
   * Send event to GA4
   * @param {string} eventName - Event name
   * @param {Object} params - Event parameters
   */
  const trackEvent = (eventName, params = {}) => {
    if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
      window.gtag('event', eventName, params)
    }
  }

  /**
   * Track successful image generation
   */
  const trackGenerateSuccess = ({ mode, imageCount, hasReferenceImages, options = {} }) => {
    trackEvent('generate_image', {
      mode,
      image_count: imageCount,
      has_reference_images: hasReferenceImages,
      resolution: options.resolution || DEFAULT_GENERATE_OPTIONS.resolution,
      style: Array.isArray(options.styles) ? options.styles.join(',') : null,
    })
  }

  /**
   * Track failed image generation
   */
  const trackGenerateFailed = ({ mode, error }) => {
    trackEvent('generate_image_failed', {
      mode,
      error_message: error?.substring?.(0, 100) || 'unknown',
    })
  }

  return {
    trackEvent,
    trackGenerateSuccess,
    trackGenerateFailed,
  }
}
