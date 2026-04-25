/**
 * Shared OpenAI API client utilities.
 *
 * Worker-safe — uses only fetch / TextDecoder, no Vue, no window.
 * Consumers: image / text / embedding / tts adapters.
 */

const DEFAULT_BASE_URL = 'https://api.openai.com/v1'

export class OpenAIAPIError extends Error {
  constructor(message, { status, code, type, raw } = {}) {
    super(message)
    this.name = 'OpenAIAPIError'
    this.status = status
    this.code = code
    this.type = type
    this.raw = raw
  }
}

export function getOpenAIBaseUrl() {
  return DEFAULT_BASE_URL
}

async function safeReadJson(response) {
  try {
    return await response.clone().json()
  } catch {
    return null
  }
}

/**
 * Perform an authenticated fetch against OpenAI. Throws OpenAIAPIError on !ok.
 *
 * @param {string} path - path starting with '/', e.g. '/images/generations'
 * @param {object} opts
 * @param {string} opts.apiKey
 * @param {'GET'|'POST'|'PUT'|'DELETE'} [opts.method='POST']
 * @param {object|FormData} [opts.body]
 * @param {Record<string,string>} [opts.headers]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<Response>}
 */
export async function openaiFetch(path, opts = {}) {
  const { apiKey, method = 'POST', body, headers = {}, signal } = opts
  if (!apiKey) {
    throw new OpenAIAPIError('OpenAI API key missing', { status: 0, code: 'no_key' })
  }

  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData
  const reqHeaders = {
    Authorization: `Bearer ${apiKey}`,
    ...headers,
  }
  if (!isFormData && body !== undefined) {
    reqHeaders['Content-Type'] = reqHeaders['Content-Type'] || 'application/json'
  }

  const response = await fetch(`${DEFAULT_BASE_URL}${path}`, {
    method,
    headers: reqHeaders,
    body: isFormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  })

  if (!response.ok) {
    const raw = await safeReadJson(response)
    const err = raw?.error || {}
    throw new OpenAIAPIError(err.message || `OpenAI HTTP ${response.status}`, {
      status: response.status,
      code: err.code,
      type: err.type,
      raw,
    })
  }

  return response
}

/**
 * Parse an SSE stream from an OpenAI endpoint, yielding each JSON event.
 * Terminates on `[DONE]` or stream close. Respects an optional AbortSignal.
 */
export async function* parseOpenAISSE(response, { signal } = {}) {
  if (!response.body) throw new OpenAIAPIError('No response body', { status: 0 })

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  try {
    while (true) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // Split on SSE event boundary. The spec allows both LF and CRLF line
      // endings, so accept "\n\n" or "\r\n\r\n". Keep the last partial event
      // in the buffer for the next chunk.
      const parts = buffer.split(/\r?\n\r?\n/)
      buffer = parts.pop() || ''

      for (const part of parts) {
        const dataLines = part
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trim())
        if (dataLines.length === 0) continue
        const data = dataLines.join('\n')
        if (data === '[DONE]') return
        try {
          yield JSON.parse(data)
        } catch {
          // Skip malformed SSE frames rather than aborting the entire stream.
        }
      }
    }
  } finally {
    try {
      reader.releaseLock()
    } catch {
      // reader may already be released on abort
    }
  }
}

/**
 * Classify an OpenAI error for retry decisions.
 * Mirrors the Gemini classifier's vocabulary (PERMANENT / RETRIABLE / UNKNOWN).
 */
export function classifyOpenAIError(error) {
  if (!error) return 'UNKNOWN'
  if (error.name === 'AbortError') return 'PERMANENT' // intentional cancellation

  const status = error.status ?? error?.response?.status
  // OpenAI error envelopes use { error: { type, code } } where `type` is the
  // high-level category (invalid_request_error, authentication_error) and
  // `code` is the specific reason (invalid_api_key, content_policy_violation).
  // The previous implementation only inspected `code`, so the
  // `invalid_request_error` branch was dead — it lives on `type`.
  const code = error.code ?? error?.error?.code
  const type = error.type ?? error?.error?.type

  if (status === 400 || status === 401 || status === 403 || status === 404) return 'PERMANENT'
  if (type === 'invalid_request_error' || type === 'authentication_error') return 'PERMANENT'
  if (code === 'invalid_api_key') return 'PERMANENT'
  if (code === 'content_policy_violation' || code === 'moderation_blocked') return 'PERMANENT'

  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) return 'RETRIABLE'
  if (error.name === 'TypeError' || error.name === 'NetworkError') return 'RETRIABLE'

  return 'UNKNOWN'
}
