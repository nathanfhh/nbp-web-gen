/**
 * OpenAI image generation adapter.
 *
 * Mirrors the shape of the Gemini streaming flow inside useApi.generateImageStream:
 * returns { images, textResponse, thinkingText, metadata } so the surrounding
 * retry / abort / timeout logic can stay provider-agnostic.
 *
 * Endpoints used:
 * - POST /images/generations (text-only prompts)
 * - POST /images/edits       (multipart/form-data with reference images)
 *
 * Reference: https://developers.openai.com/api/docs/guides/image-generation
 */

import { openaiFetch, parseOpenAISSE, OpenAIAPIError } from './openaiClient'

/**
 * Map our UI aspect ratio + resolution bucket into an OpenAI-compliant `size`.
 *
 * OpenAI constraints (gpt-image-2):
 * - both edges multiples of 16
 * - max edge 3840
 * - aspect ratio max 3:1
 * - total pixels in [655_360, 8_294_400]
 *
 * The table uses popular sizes that stay inside those constraints.
 */
const ASPECT_SIZE_TABLE = {
  '1:1': { '1k': '1024x1024', '2k': '2048x2048', '4k': '2880x2880' },
  '3:4': { '1k': '768x1024', '2k': '1536x2048', '4k': '2304x3072' },
  '4:3': { '1k': '1024x768', '2k': '2048x1536', '4k': '3072x2304' },
  '9:16': { '1k': '720x1280', '2k': '1152x2048', '4k': '2160x3840' },
  '16:9': { '1k': '1280x720', '2k': '2048x1152', '4k': '3840x2160' },
  '21:9': { '1k': '1344x576', '2k': '2352x1008', '4k': '3696x1584' },
}

export function mapAspectToSize(aspectRatio = '1:1', resolution = '1k') {
  const row = ASPECT_SIZE_TABLE[aspectRatio] || ASPECT_SIZE_TABLE['1:1']
  return row[resolution] || row['1k']
}

const QUALITY_MAP = {
  '1k': 'medium',
  '2k': 'high',
  '4k': 'high',
}

export function mapResolutionToQuality(resolution) {
  return QUALITY_MAP[resolution] || 'auto'
}

/**
 * Build the JSON body for /images/generations.
 */
export function buildGenerationBody({ model, prompt, options = {}, stream = true }) {
  const body = {
    model,
    prompt,
    size: mapAspectToSize(options.ratio, options.resolution),
    quality: options.quality || mapResolutionToQuality(options.resolution),
    output_format: options.outputFormat || 'png',
    moderation: options.moderation || 'auto',
    n: options.n || 1,
  }
  if (stream) {
    body.stream = true
    body.partial_images = Math.min(Math.max(options.partialImages ?? 2, 0), 3)
  }
  return body
}

/**
 * Convert a base64 string + mimeType into a Blob suitable for multipart upload.
 */
function base64ToBlob(base64, mimeType = 'image/png') {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mimeType })
}

function buildEditFormData({ model, prompt, referenceImages, options }) {
  const form = new FormData()
  form.append('model', model)
  form.append('prompt', prompt)
  form.append('size', mapAspectToSize(options.ratio, options.resolution))
  form.append('quality', options.quality || mapResolutionToQuality(options.resolution))
  form.append('output_format', options.outputFormat || 'png')
  form.append('n', String(options.n || 1))
  form.append('stream', 'true')
  form.append('partial_images', String(Math.min(Math.max(options.partialImages ?? 2, 0), 3)))
  for (let i = 0; i < referenceImages.length; i++) {
    const ref = referenceImages[i]
    const blob = base64ToBlob(ref.data, ref.mimeType || 'image/png')
    form.append('image[]', blob, `reference-${i}.${(ref.mimeType || 'image/png').split('/')[1] || 'png'}`)
  }
  return form
}

/**
 * Extract a finished image payload from an SSE event.
 * Shape:
 *   { type: 'image_generation.partial_image', b64_json, ... }
 *   { type: 'image_generation.completed',     b64_json, ... }
 */
function extractImagePayload(event) {
  if (!event) return null
  const kind = event.type || ''
  if (!kind.startsWith('image_generation.')) return null
  const b64 = event.b64_json || event.image || event.data
  if (!b64) return null
  return {
    data: b64,
    mimeType: event.output_format ? `image/${event.output_format}` : 'image/png',
    isPartial: kind.endsWith('partial_image'),
    finishReason: event.finish_reason,
  }
}

/**
 * Generate images via OpenAI. Streaming yields partial images via onPartialImage;
 * the final completed image(s) are returned in the resolved value.
 *
 * @param {object} params
 * @param {string} params.apiKey
 * @param {string} params.model
 * @param {string} params.prompt - already-built enhanced prompt
 * @param {Array<{data:string, mimeType?:string}>} [params.referenceImages]
 * @param {object} [params.options]
 * @param {AbortSignal} [params.signal]
 * @param {(chunk: {type:'image', data:string, mimeType:string}) => void} [params.onPartialImage]
 */
export async function generateImageOpenAI({
  apiKey,
  model,
  prompt,
  referenceImages = [],
  options = {},
  signal,
  onPartialImage,
}) {
  const hasReferences = referenceImages && referenceImages.length > 0
  const path = hasReferences ? '/images/edits' : '/images/generations'

  const fetchOpts = { apiKey, signal, method: 'POST' }
  if (hasReferences) {
    fetchOpts.body = buildEditFormData({ model, prompt, referenceImages, options })
  } else {
    fetchOpts.body = buildGenerationBody({ model, prompt, options, stream: true })
  }

  const response = await openaiFetch(path, fetchOpts)

  const images = []
  const metadata = { provider: 'openai', model }
  const contentType = response.headers.get('content-type') || ''
  const isStreaming = contentType.includes('text/event-stream')

  if (isStreaming) {
    for await (const event of parseOpenAISSE(response, { signal })) {
      const payload = extractImagePayload(event)
      if (!payload) continue
      if (payload.isPartial) {
        if (onPartialImage) {
          onPartialImage({
            type: 'image',
            data: payload.data,
            mimeType: payload.mimeType,
          })
        }
      } else {
        images.push({ data: payload.data, mimeType: payload.mimeType })
        if (payload.finishReason) metadata.finishReason = payload.finishReason
      }
    }
  } else {
    // Non-stream fallback (edits endpoint sometimes returns JSON with data array)
    const json = await response.json()
    const items = Array.isArray(json?.data) ? json.data : []
    for (const item of items) {
      if (item?.b64_json) {
        images.push({
          data: item.b64_json,
          mimeType: json.output_format ? `image/${json.output_format}` : 'image/png',
        })
      }
    }
    if (json?.usage) metadata.usage = json.usage
  }

  if (images.length === 0) {
    throw new OpenAIAPIError('OpenAI returned no image data', { status: 0, code: 'no_image_data' })
  }

  return {
    images,
    textResponse: '',
    thinkingText: '',
    metadata,
  }
}
