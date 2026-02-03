/**
 * API Configuration Constants
 *
 * Centralized configuration for API rate limiting, retry behavior, and timeouts.
 * These values are tuned for the Gemini API's rate limits and typical response times.
 */

// =============================================================================
// Rate Limiting
// =============================================================================

/**
 * Gemini API rate limit for image generation (requests per minute)
 * @see https://ai.google.dev/pricing
 */
export const IMAGE_RPM = 20

/**
 * Minimum interval between image generation request starts (milliseconds)
 * Calculated as: 60000ms / IMAGE_RPM = 3000ms
 */
export const IMAGE_MIN_START_INTERVAL_MS = Math.ceil(60_000 / IMAGE_RPM)

// =============================================================================
// Retry Configuration
// =============================================================================

/**
 * Default retry configuration for image generation requests
 * Uses exponential backoff with jitter to handle transient failures
 */
export const DEFAULT_RETRY_CONFIG = {
  /**
   * Maximum number of retry attempts (including the initial attempt)
   * Range: 1-10, Default: 5
   */
  maxAttempts: 5,

  /**
   * Base delay for exponential backoff (milliseconds)
   * Actual delay = baseMs * 2^(attempt-1) + jitter
   * Range: 100-30000, Default: 750
   */
  backoffBaseMs: 750,

  /**
   * Maximum backoff delay (milliseconds)
   * Caps the exponential growth to prevent excessive waits
   * Range: 500-60000, Default: 15000
   */
  backoffMaxMs: 15_000,

  /**
   * Random jitter added to backoff (milliseconds)
   * Helps prevent thundering herd when multiple requests retry simultaneously
   * Range: 0-2000, Default: 250
   */
  backoffJitterMs: 250,
}

// =============================================================================
// Timeout Configuration
// =============================================================================

/**
 * Default timeout for a single image generation request (milliseconds)
 * This is a per-attempt timeout, not total timeout across all retries
 *
 * Gemini image generation typically takes 10-30 seconds, so 90 seconds
 * provides headroom for slower generations while catching truly stuck requests
 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 90_000

/**
 * Timeout for style analysis requests (milliseconds)
 * Text-only operations are faster, so shorter timeout is appropriate
 */
export const DEFAULT_ANALYSIS_TIMEOUT_MS = 60_000

// =============================================================================
// Validation Ranges (for UI and runtime validation)
// =============================================================================

export const RETRY_LIMITS = {
  maxAttempts: { min: 1, max: 10 },
  backoffBaseMs: { min: 100, max: 30_000 },
  backoffMaxMs: { min: 500, max: 60_000 },
  backoffJitterMs: { min: 0, max: 2_000 },
}

export const CONCURRENCY_LIMITS = {
  min: 1,
  max: 10,
  default: 3,
}

// =============================================================================
// TTS Rate Limiting
// =============================================================================

/**
 * TTS API rate limit (requests per minute)
 * @see https://ai.google.dev/pricing
 */
export const TTS_RPM = 10

/**
 * Minimum interval between TTS request starts (milliseconds)
 * Calculated as: 60000ms / TTS_RPM = 6000ms
 */
export const TTS_MIN_START_INTERVAL_MS = Math.ceil(60_000 / TTS_RPM)

/**
 * Concurrency limits for TTS audio generation
 */
export const TTS_CONCURRENCY_LIMITS = {
  min: 1,
  max: 5,
  default: 2,
}

// =============================================================================
// Error Classification
// =============================================================================

/**
 * Error categories for API responses
 * Used to determine if an error is worth retrying
 */
export const ERROR_CATEGORY = {
  /** Transient errors that may succeed on retry (429, 5xx, network issues) */
  RETRIABLE: 'retriable',
  /** Permanent errors that will never succeed (invalid key, content policy) */
  PERMANENT: 'permanent',
  /** Unknown errors - default to retriable for safety */
  UNKNOWN: 'unknown',
}

/**
 * HTTP status codes that indicate permanent failure (not worth retrying)
 */
export const PERMANENT_ERROR_CODES = [
  400, // Bad Request - malformed request, won't succeed on retry
  401, // Unauthorized - invalid API key
  403, // Forbidden - access denied, content policy violation
  404, // Not Found - resource doesn't exist
]

/**
 * HTTP status codes that indicate transient failure (worth retrying)
 */
export const RETRIABLE_ERROR_CODES = [
  429, // Too Many Requests - rate limited
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
]

/**
 * Error message patterns that indicate permanent failure
 * These are case-insensitive substring matches
 */
export const PERMANENT_ERROR_PATTERNS = [
  'invalid api key',
  'api key not valid',
  'api_key_invalid',
  'content policy',
  'safety settings',
  'content blocked',      // More specific than just 'blocked'
  'request blocked',      // More specific
  'prohibited',
  'harmful content',
  'sexually explicit',
  'violence',
  'hate speech',
  'dangerous content',
  'recitation',
  'copyrighted',
  'model not found',
  'model is not available',
  'permission denied',
  'access denied',
]

/**
 * Error message patterns that indicate transient failure
 * These are case-insensitive substring matches
 */
export const RETRIABLE_ERROR_PATTERNS = [
  'timeout',
  'timed out',
  'network',
  'temporarily',
  'unavailable',
  'overloaded',
  'capacity',
  'try again',
  'retry',
  'connection',
  'econnreset',
  'socket',
]
