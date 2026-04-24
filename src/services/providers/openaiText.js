/**
 * OpenAI text LLM adapter (chat/completions).
 *
 * Supports:
 * - text + image_url multimodal input
 * - structured outputs via json_schema (strict mode)
 * - reasoning_effort for the gpt-5.4 family
 * - streaming via SSE
 *
 * Returns the aggregated text content of the assistant message, identical to
 * what the existing Gemini callers parse out of their streams.
 */

import { openaiFetch, parseOpenAISSE } from './openaiClient'

/**
 * Normalize a Gemini-style JSON schema for OpenAI strict structured outputs.
 *
 * Rules applied recursively:
 * - Every `type: 'object'` gets `additionalProperties: false`
 * - Every `type: 'object'` gets `required: [...all property keys]` (strict mode)
 * - Descends into `properties`, `items`, `anyOf`, `allOf`, `oneOf`
 *
 * Pure & idempotent — exported for testing.
 */
export function normalizeSchemaForOpenAI(schema) {
  if (!schema || typeof schema !== 'object') return schema

  if (Array.isArray(schema)) {
    return schema.map(normalizeSchemaForOpenAI)
  }

  const next = { ...schema }

  if (next.type === 'object' && next.properties) {
    const propertyKeys = Object.keys(next.properties)
    const nextProperties = {}
    for (const key of propertyKeys) {
      nextProperties[key] = normalizeSchemaForOpenAI(next.properties[key])
    }
    next.properties = nextProperties
    next.additionalProperties = false
    next.required = propertyKeys
  }

  if (next.type === 'array' && next.items) {
    next.items = normalizeSchemaForOpenAI(next.items)
  }

  for (const compositeKey of ['anyOf', 'allOf', 'oneOf']) {
    if (Array.isArray(next[compositeKey])) {
      next[compositeKey] = next[compositeKey].map(normalizeSchemaForOpenAI)
    }
  }

  return next
}

/**
 * Build the OpenAI messages payload from a single-prompt + images shape that
 * mirrors the Gemini callers.
 */
export function buildOpenAIMessages({ prompt, systemPrompt, images = [] }) {
  const messages = []
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt })
  }

  if (images.length === 0) {
    messages.push({ role: 'user', content: prompt })
  } else {
    const parts = [{ type: 'text', text: prompt }]
    for (const img of images) {
      const mimeType = img.mimeType || 'image/png'
      parts.push({
        type: 'image_url',
        image_url: { url: `data:${mimeType};base64,${img.data}` },
      })
    }
    messages.push({ role: 'user', content: parts })
  }

  return messages
}

function isGpt5Family(model) {
  return typeof model === 'string' && model.startsWith('gpt-5.4')
}

/**
 * Build the request body for /chat/completions.
 */
export function buildChatCompletionBody({
  model,
  messages,
  responseSchema,
  temperature,
  reasoningEffort,
  stream = false,
}) {
  const body = { model, messages }

  if (temperature !== undefined && temperature !== null) {
    body.temperature = temperature
  }

  if (responseSchema) {
    body.response_format = {
      type: 'json_schema',
      json_schema: {
        name: 'response',
        schema: normalizeSchemaForOpenAI(responseSchema),
        strict: true,
      },
    }
  }

  if (reasoningEffort && isGpt5Family(model)) {
    body.reasoning_effort = reasoningEffort
  }

  if (stream) body.stream = true

  return body
}

/**
 * Extract content from a non-streaming /chat/completions response JSON.
 */
function extractContentFromChoice(json) {
  const choice = json?.choices?.[0]
  if (!choice) return ''
  const content = choice.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map((c) => (typeof c === 'string' ? c : c?.text || '')).join('')
  }
  return ''
}

/**
 * Fire an optional one-shot "no thinking process" marker at stream start so
 * the UI can swap to its placeholder animation.
 */
function announceNoThinking(onThinkingChunk, noThinkingMessage) {
  if (!onThinkingChunk) return
  onThinkingChunk(noThinkingMessage || '[no thinking process]\n')
}

/**
 * Top-level entry point. Returns the aggregated assistant text.
 *
 * @param {object} params
 * @param {string} params.apiKey
 * @param {string} params.model
 * @param {string} params.prompt
 * @param {string} [params.systemPrompt]
 * @param {Array<{data:string, mimeType?:string}>} [params.images]
 * @param {object} [params.responseSchema]
 * @param {number} [params.temperature]
 * @param {'low'|'medium'|'high'} [params.reasoningEffort='high']
 * @param {boolean} [params.stream=false]
 * @param {AbortSignal} [params.signal]
 * @param {(chunk: string) => void} [params.onThinkingChunk]
 * @param {string} [params.noThinkingMessage] - one-shot marker for UI
 */
export async function generateTextOpenAI({
  apiKey,
  model,
  prompt,
  systemPrompt,
  images = [],
  responseSchema,
  temperature,
  reasoningEffort = 'high',
  stream = false,
  signal,
  onThinkingChunk,
  noThinkingMessage,
}) {
  const messages = buildOpenAIMessages({ prompt, systemPrompt, images })
  const body = buildChatCompletionBody({
    model,
    messages,
    responseSchema,
    temperature,
    reasoningEffort,
    stream,
  })

  const response = await openaiFetch('/chat/completions', {
    apiKey,
    method: 'POST',
    body,
    signal,
  })

  announceNoThinking(onThinkingChunk, noThinkingMessage)

  if (!stream) {
    const json = await response.json()
    return extractContentFromChoice(json)
  }

  let text = ''
  for await (const event of parseOpenAISSE(response, { signal })) {
    const delta = event?.choices?.[0]?.delta
    if (delta && typeof delta.content === 'string') {
      text += delta.content
    }
  }
  return text
}
