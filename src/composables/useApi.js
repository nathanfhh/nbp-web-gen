import { ref, computed } from 'vue'
import { GoogleGenAI, Modality } from '@google/genai'
import { useLocalStorage } from './useLocalStorage'
import { isQuotaError } from './useApiKeyManager'
import { buildPrompt } from './promptBuilders'
import {
  clampInt,
  createMinIntervalLimiter,
  mapConcurrent,
  sleep,
  withTimeout,
  TimeoutError,
} from './requestScheduler'
import {
  DEFAULT_MODEL,
  RATIO_API_MAP,
  RESOLUTION_API_MAP,
  IMAGE_MIN_START_INTERVAL_MS,
  DEFAULT_RETRY_CONFIG,
  RETRY_LIMITS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  ERROR_CATEGORY,
  PERMANENT_ERROR_CODES,
  RETRIABLE_ERROR_CODES,
  PERMANENT_ERROR_PATTERNS,
  RETRIABLE_ERROR_PATTERNS,
} from '@/constants'
import { t } from '@/i18n'

// Re-export buildPrompt for backward compatibility
export { buildPrompt } from './promptBuilders'

// ============================================================================
// API Composable
// ============================================================================

// Rate limiter: enforces minimum interval between image generation starts
const imageStartLimiter = createMinIntervalLimiter({ minIntervalMs: IMAGE_MIN_START_INTERVAL_MS })

export function useApi() {
  const loadingCount = ref(0)
  const isLoading = computed(() => loadingCount.value > 0)
  const error = ref(null)
  const { getApiKey } = useLocalStorage()

  const withLoading = async (fn) => {
    loadingCount.value += 1
    try {
      return await fn()
    } finally {
      loadingCount.value = Math.max(0, loadingCount.value - 1)
    }
  }

  /**
   * Extract HTTP status code from various error formats
   */
  const getErrorStatus = (err) =>
    err?.status ??
    err?.code ??
    err?.response?.status ??
    err?.error?.status ??
    err?.error?.code ??
    null

  /**
   * Extract error message from various error formats
   */
  const getErrorMessage = (err) => {
    const message =
      err?.message || err?.error?.message || err?.response?.data?.message || String(err || '')
    return message.toLowerCase()
  }

  /**
   * Classify an error into categories: PERMANENT, RETRIABLE, or UNKNOWN
   * This helps determine whether to retry and what to tell the user
   *
   * @param {Error} err - The error to classify
   * @returns {{ category: string, reason: string, isRetriable: boolean }}
   */
  const classifyError = (err) => {
    const status = getErrorStatus(err)
    const message = getErrorMessage(err)

    // Check permanent status codes first
    if (PERMANENT_ERROR_CODES.includes(status)) {
      return {
        category: ERROR_CATEGORY.PERMANENT,
        reason: `HTTP ${status}`,
        isRetriable: false,
      }
    }

    // Check retriable status codes
    if (RETRIABLE_ERROR_CODES.includes(status)) {
      return {
        category: ERROR_CATEGORY.RETRIABLE,
        reason: `HTTP ${status}`,
        isRetriable: true,
      }
    }

    // Check permanent error patterns
    for (const pattern of PERMANENT_ERROR_PATTERNS) {
      if (message.includes(pattern)) {
        return {
          category: ERROR_CATEGORY.PERMANENT,
          reason: pattern,
          isRetriable: false,
        }
      }
    }

    // Check retriable error patterns
    for (const pattern of RETRIABLE_ERROR_PATTERNS) {
      if (message.includes(pattern)) {
        return {
          category: ERROR_CATEGORY.RETRIABLE,
          reason: pattern,
          isRetriable: true,
        }
      }
    }

    // Quota errors are retriable (may succeed with different key or after waiting)
    if (isQuotaError(err)) {
      return {
        category: ERROR_CATEGORY.RETRIABLE,
        reason: 'quota',
        isRetriable: true,
      }
    }

    // Unknown errors - default to retriable for safety (might be transient)
    return {
      category: ERROR_CATEGORY.UNKNOWN,
      reason: 'unknown',
      isRetriable: true,
    }
  }

  const computeBackoffMs = (attempt, { baseMs, maxMs, jitterMs }) => {
    const exp = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1))
    const jitter = Math.floor(Math.random() * (jitterMs + 1))
    return exp + jitter
  }

  /**
   * Build content parts for SDK request
   */
  const buildContentParts = (prompt, referenceImages = []) => {
    const parts = []

    // Add text prompt
    parts.push({ text: prompt })

    // Add reference images (supports multiple images for all modes)
    if (referenceImages && referenceImages.length > 0) {
      for (const image of referenceImages) {
        parts.push({
          inlineData: {
            mimeType: image.mimeType || 'image/jpeg',
            data: image.data,
          },
        })
      }
    }

    return parts
  }

  /**
   * Build SDK generation config
   */
  const buildSdkConfig = (options = {}) => {
    const config = {
      responseModalities: [Modality.IMAGE, Modality.TEXT],
    }

    // Add temperature if specified
    if (options.temperature !== undefined && options.temperature !== null) {
      config.temperature = parseFloat(options.temperature)
    }

    // Add seed if specified
    if (options.seed !== undefined && options.seed !== null && options.seed !== '') {
      config.seed = parseInt(options.seed, 10)
    }

    // Build image config
    const imageConfig = {}

    // Add aspect ratio
    if (options.ratio && RATIO_API_MAP[options.ratio]) {
      imageConfig.aspectRatio = RATIO_API_MAP[options.ratio]
    }

    // Add resolution/image size (camelCase for SDK)
    if (options.resolution && RESOLUTION_API_MAP[options.resolution]) {
      imageConfig.imageSize = RESOLUTION_API_MAP[options.resolution]
    }

    if (Object.keys(imageConfig).length > 0) {
      config.imageConfig = imageConfig
    }

    // Enable thinking mode
    config.thinkingConfig = {
      includeThoughts: true,
    }

    // Enable Google Search for real-time data (weather, stocks, etc.)
    config.tools = [{ googleSearch: {} }]

    return config
  }

  /**
   * Stream API call using @google/genai SDK
   */
  const generateImageStream = async (
    prompt,
    options = {},
    mode = 'generate',
    referenceImages = [],
    onThinkingChunk = null,
    request = {},
  ) => {
    return await withLoading(async () => {
      const apiKey = getApiKey()
      if (!apiKey) {
        throw new Error(t('errors.apiKeyNotSet'))
      }

      error.value = null

      // Retry configuration with validation (can be overridden via request param)
      const maxAttempts = clampInt(
        request?.maxAttempts,
        RETRY_LIMITS.maxAttempts.min,
        RETRY_LIMITS.maxAttempts.max,
        DEFAULT_RETRY_CONFIG.maxAttempts,
      )
      const backoffBaseMs = clampInt(
        request?.backoffBaseMs,
        RETRY_LIMITS.backoffBaseMs.min,
        RETRY_LIMITS.backoffBaseMs.max,
        DEFAULT_RETRY_CONFIG.backoffBaseMs,
      )
      const backoffMaxMs = clampInt(
        request?.backoffMaxMs,
        RETRY_LIMITS.backoffMaxMs.min,
        RETRY_LIMITS.backoffMaxMs.max,
        DEFAULT_RETRY_CONFIG.backoffMaxMs,
      )
      const backoffJitterMs = clampInt(
        request?.backoffJitterMs,
        RETRY_LIMITS.backoffJitterMs.min,
        RETRY_LIMITS.backoffJitterMs.max,
        DEFAULT_RETRY_CONFIG.backoffJitterMs,
      )

      const jobId = request?.jobId || null

      // Per-request timeout (can be overridden, 0 = no timeout)
      const timeoutMs = clampInt(request?.timeoutMs, 0, 300_000, DEFAULT_REQUEST_TIMEOUT_MS)

      // Build the enhanced prompt once (reused across retries)
      const enhancedPrompt = buildPrompt(prompt, options, mode)

      // Build content parts and config once (reused across retries)
      const parts = buildContentParts(enhancedPrompt, referenceImages)
      const config = buildSdkConfig(options)

      // Get model
      const model = options.model || DEFAULT_MODEL

      // Guard to prevent stale attempts from emitting chunks after timeout/retry
      // When a timeout occurs, the old stream continues in background but its chunks should be ignored
      let currentAttemptId = 0

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        // Intentional sleeping to respect RPM limits (start-rate)
        await imageStartLimiter.acquire()

        // Capture this attempt's ID - stale attempts will have a different ID
        const thisAttemptId = ++currentAttemptId

        // Guarded callback that only emits if this attempt is still current
        const guardedThinkingChunk = onThinkingChunk
          ? (chunk) => {
              if (thisAttemptId === currentAttemptId) {
                onThinkingChunk(chunk)
              }
            }
          : null

        try {
          // Wrap the entire streaming operation with timeout
          // NOTE: withTimeout does NOT cancel the underlying stream request when timeout occurs.
          // The Google GenAI SDK currently doesn't expose an AbortController mechanism.
          // This means on timeout, the old stream may continue in the background while retry starts.
          // The rate limiter and exponential backoff help mitigate duplicate request costs.
          const streamOperation = async () => {
            // Initialize SDK client (fresh per attempt)
            const ai = new GoogleGenAI({ apiKey })

            // Make streaming API request using SDK
            const response = await ai.models.generateContentStream({
              model,
              contents: [{ role: 'user', parts }],
              config,
            })

            // Process stream
            const images = []
            let textResponse = ''
            let thinkingText = ''
            let metadata = {}

            for await (const chunk of response) {
              // Process candidates
              if (chunk.candidates && chunk.candidates.length > 0) {
                const candidate = chunk.candidates[0]

                if (candidate.content && candidate.content.parts) {
                  for (const part of candidate.content.parts) {
                    if (part.inlineData) {
                      const imageData = {
                        data: part.inlineData.data,
                        mimeType: part.inlineData.mimeType || 'image/png',
                        isThought: !!part.thought,
                      }
                      images.push(imageData)

                      // If this is a thought image, send it to the thinking callback
                      if (part.thought && guardedThinkingChunk) {
                        guardedThinkingChunk({
                          type: 'image',
                          data: part.inlineData.data,
                          mimeType: part.inlineData.mimeType || 'image/png',
                        })
                      }
                    } else if (part.text) {
                      // Check if this is thinking content (thought: true flag)
                      if (part.thought) {
                        // This is thinking/reasoning text
                        if (guardedThinkingChunk) {
                          guardedThinkingChunk(part.text)
                        }
                        thinkingText += part.text
                      } else {
                        // Regular text response
                        textResponse += part.text
                      }
                    }
                  }
                }

                // Capture metadata
                if (candidate.finishReason) {
                  metadata.finishReason = candidate.finishReason
                }
                if (candidate.safetyRatings) {
                  metadata.safetyRatings = candidate.safetyRatings
                }
              }

              // Model version
              if (chunk.modelVersion) {
                metadata.modelVersion = chunk.modelVersion
              }
            }

            return {
              images,
              textResponse,
              thinkingText,
              metadata,
            }
          } // End of streamOperation

          // Execute with timeout
          const { images, textResponse, thinkingText, metadata } = await withTimeout(
            streamOperation(),
            timeoutMs,
            `Image generation (attempt ${attempt})`,
          )

          // Filter: prefer non-thought images, but use thought images as fallback
          let finalImages = images.filter((img) => !img.isThought)

          if (finalImages.length === 0) {
            // Fallback: use all images if no non-thought images
            finalImages = images
          }

          // Remove isThought flag before returning
          finalImages = finalImages.map(({ data, mimeType }) => ({ data, mimeType }))

          if (finalImages.length === 0) {
            throw new Error(t('errors.noImageData'))
          }

          error.value = null
          return {
            success: true,
            jobId,
            images: finalImages,
            textResponse,
            thinkingText,
            prompt: enhancedPrompt,
            originalPrompt: prompt,
            options,
            mode,
            metadata,
          }
        } catch (err) {
          error.value = err.message

          // Classify the error to determine if retry is worthwhile
          const isTimeout = err instanceof TimeoutError
          const errorClass = isTimeout
            ? { category: ERROR_CATEGORY.RETRIABLE, reason: 'timeout', isRetriable: true }
            : classifyError(err)

          // Attach classification to error for upstream handling
          err.errorCategory = errorClass.category
          err.errorReason = errorClass.reason
          err.isRetriable = errorClass.isRetriable

          const canRetry = attempt < maxAttempts && errorClass.isRetriable
          if (!canRetry) {
            // For permanent errors, provide a clearer message
            if (errorClass.category === ERROR_CATEGORY.PERMANENT) {
              err.message = `${err.message} (${errorClass.reason} - will not retry)`
            }
            throw err
          }

          const delayMs = computeBackoffMs(attempt, {
            baseMs: backoffBaseMs,
            maxMs: backoffMaxMs,
            jitterMs: backoffJitterMs,
          })

          if (guardedThinkingChunk) {
            guardedThinkingChunk(
              `\n[Retry ${attempt}/${maxAttempts - 1} due to ${errorClass.reason}, waiting ${Math.ceil(delayMs / 1000)}s]\n`,
            )
          }
          await sleep(delayMs)
        }
      }

      // Defensive (loop always returns or throws)
      throw new Error('Unreachable: generateImageStream attempts exhausted')
    })
  }

  const generateStory = async (prompt, options = {}, referenceImages = [], onThinkingChunk = null) => {
    const steps = options.steps || 4
    const results = []
    let previousStepImage = null // Store the previous step's generated image

    for (let i = 1; i <= steps; i++) {
      let stepPrompt = prompt
      if (steps > 1) {
        stepPrompt = `${prompt}. This is step ${i} of ${steps} in the sequence.`
        if (i > 1) {
          stepPrompt += ' Continue from the previous step with smooth transition.'
        }
      }

      if (onThinkingChunk) {
        onThinkingChunk(`\n--- ${t('storyProgress.generating', { current: i, total: steps })} ---\n`)
      }

      try {
        // Build step reference images:
        // Step 1: original reference images only
        // Step 2+: original reference images + previous step's result (for continuity)
        let stepReferenceImages = [...referenceImages]
        if (i > 1 && previousStepImage) {
          stepReferenceImages = [...referenceImages, previousStepImage]
        }

        const result = await generateImageStream(
          stepPrompt,
          { ...options, step: i },
          'story',
          stepReferenceImages,
          onThinkingChunk,
        )

        // Store the first generated image for the next step's reference
        if (result.images && result.images.length > 0) {
          previousStepImage = result.images[0]
        }

        results.push({
          step: i,
          success: true,
          ...result,
        })
      } catch (stepErr) {
        // Step failed - record error but continue to next step
        // Note: previousStepImage remains unchanged, so next step will use last successful image
        console.warn(`Story step ${i} failed:`, stepErr.message)
        results.push({
          step: i,
          success: false,
          error: stepErr.message,
        })
      }
    }

    // Calculate success/failure counts
    const successCount = results.filter((r) => r.success).length
    const failedCount = results.length - successCount

    return {
      success: successCount === steps,
      results,
      totalSteps: steps,
      successCount,
      failedCount,
    }
  }

  const editImage = async (prompt, referenceImages = [], options = {}, onThinkingChunk = null) => {
    return generateImageStream(prompt, options, 'edit', referenceImages, onThinkingChunk)
  }

  const generateDiagram = async (
    prompt,
    options = {},
    referenceImages = [],
    onThinkingChunk = null,
  ) => {
    return generateImageStream(prompt, options, 'diagram', referenceImages, onThinkingChunk)
  }

  /**
   * Generate multiple images concurrently (1-10), returning results keyed by job ID.
   * Result order is NOT guaranteed; callers should map by `id`.
   *
   * @param {Array<{id: string, prompt: string, options?: Object, mode?: string, referenceImages?: Array, request?: Object, onThinkingChunk?: Function}>} jobs
   * @param {Object} batchOptions
   * @param {number} batchOptions.concurrency - 1..10 (default 3)
   * @param {(evt: JobUpdateEvent) => void} batchOptions.onJobUpdate - Callback for job status updates
   *
   * @typedef {Object} JobUpdateEvent
   * @property {string} id - Job ID
   * @property {'started'|'succeeded'|'failed'} status - Current status
   * @property {number} [startedAt] - Timestamp when job started
   * @property {number} [finishedAt] - Timestamp when job completed
   * @property {Object} [result] - Success result (for 'succeeded')
   * @property {Error} [error] - Error object (for 'failed')
   * @property {string} [errorCategory] - Error category: 'permanent', 'retriable', 'unknown' (for 'failed')
   * @property {string} [errorReason] - Human-readable error reason (for 'failed')
   * @property {boolean} [isRetriable] - Whether the error might succeed on retry (for 'failed')
   */
  const generateImagesBatch = async (jobs = [], batchOptions = {}) => {
    const concurrency = clampInt(batchOptions?.concurrency, 1, 10, 3)
    const onJobUpdate = batchOptions?.onJobUpdate || null

    const resultsById = new Map()

    await mapConcurrent(jobs, concurrency, async (job) => {
      const startedAt = Date.now()
      onJobUpdate?.({ id: job.id, status: 'started', startedAt })

      try {
        const result = await generateImageStream(
          job.prompt,
          job.options || {},
          job.mode || 'generate',
          job.referenceImages || [],
          job.onThinkingChunk || null,
          { ...(job.request || {}), jobId: job.id },
        )
        const finishedAt = Date.now()
        resultsById.set(job.id, { ok: true, id: job.id, startedAt, finishedAt, result })
        onJobUpdate?.({ id: job.id, status: 'succeeded', startedAt, finishedAt, result })
      } catch (err) {
        const finishedAt = Date.now()
        // Error classification: always compute fallback to avoid null access when err.isRetriable is undefined
        const fallbackClass = classifyError(err)
        const errorInfo = {
          id: job.id,
          status: 'failed',
          startedAt,
          finishedAt,
          error: err,
          errorCategory: err.errorCategory || fallbackClass.category,
          errorReason: err.errorReason || fallbackClass.reason,
          isRetriable: err.isRetriable ?? fallbackClass.isRetriable,
        }
        resultsById.set(job.id, { ok: false, ...errorInfo })
        onJobUpdate?.(errorInfo)
      }
    })

    return { resultsById }
  }

  return {
    isLoading,
    error,
    generateImageStream,
    generateStory,
    editImage,
    generateDiagram,
    generateImagesBatch,
    // Exported for consumers that need to classify errors (e.g., for UI display)
    classifyError,
  }
}
