import { describe, it, expect } from 'vitest'
import { OpenAIAPIError, classifyOpenAIError, parseOpenAISSE, getOpenAIBaseUrl } from './openaiClient'

describe('openaiClient', () => {
  describe('getOpenAIBaseUrl', () => {
    it('returns the OpenAI v1 API base URL', () => {
      expect(getOpenAIBaseUrl()).toBe('https://api.openai.com/v1')
    })
  })

  describe('OpenAIAPIError', () => {
    it('carries status/code/type/raw metadata', () => {
      const err = new OpenAIAPIError('bad', { status: 429, code: 'rate_limited', type: 'throttle', raw: { x: 1 } })
      expect(err).toBeInstanceOf(Error)
      expect(err.name).toBe('OpenAIAPIError')
      expect(err.message).toBe('bad')
      expect(err.status).toBe(429)
      expect(err.code).toBe('rate_limited')
      expect(err.type).toBe('throttle')
      expect(err.raw).toEqual({ x: 1 })
    })
  })

  describe('classifyOpenAIError', () => {
    it('classifies 4xx auth/validation as PERMANENT', () => {
      expect(classifyOpenAIError({ status: 400 })).toBe('PERMANENT')
      expect(classifyOpenAIError({ status: 401 })).toBe('PERMANENT')
      expect(classifyOpenAIError({ status: 403 })).toBe('PERMANENT')
      expect(classifyOpenAIError({ status: 404 })).toBe('PERMANENT')
    })

    it('classifies invalid_api_key code as PERMANENT', () => {
      expect(classifyOpenAIError({ code: 'invalid_api_key' })).toBe('PERMANENT')
    })

    it('classifies content policy / moderation as PERMANENT', () => {
      expect(classifyOpenAIError({ code: 'content_policy_violation' })).toBe('PERMANENT')
      expect(classifyOpenAIError({ code: 'moderation_blocked' })).toBe('PERMANENT')
    })

    it('classifies 429/5xx as RETRIABLE', () => {
      expect(classifyOpenAIError({ status: 429 })).toBe('RETRIABLE')
      expect(classifyOpenAIError({ status: 500 })).toBe('RETRIABLE')
      expect(classifyOpenAIError({ status: 502 })).toBe('RETRIABLE')
      expect(classifyOpenAIError({ status: 503 })).toBe('RETRIABLE')
      expect(classifyOpenAIError({ status: 504 })).toBe('RETRIABLE')
    })

    it('classifies network errors as RETRIABLE', () => {
      expect(classifyOpenAIError({ name: 'TypeError' })).toBe('RETRIABLE')
      expect(classifyOpenAIError({ name: 'NetworkError' })).toBe('RETRIABLE')
    })

    it('classifies AbortError as PERMANENT', () => {
      expect(classifyOpenAIError({ name: 'AbortError' })).toBe('PERMANENT')
    })

    it('returns UNKNOWN for unclassified errors', () => {
      expect(classifyOpenAIError({})).toBe('UNKNOWN')
      expect(classifyOpenAIError(null)).toBe('UNKNOWN')
      expect(classifyOpenAIError(undefined)).toBe('UNKNOWN')
    })
  })

  describe('parseOpenAISSE', () => {
    function mockSSEResponse(text) {
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(controller) {
          // Emit bytes in arbitrary chunks to exercise buffering.
          const bytes = encoder.encode(text)
          const chunkSize = 16
          for (let i = 0; i < bytes.length; i += chunkSize) {
            controller.enqueue(bytes.slice(i, i + chunkSize))
          }
          controller.close()
        },
      })
      return { body: stream }
    }

    it('yields each JSON event in order', async () => {
      const sse =
        'data: {"i":1}\n\n' +
        'data: {"i":2}\n\n' +
        'data: [DONE]\n\n'
      const events = []
      for await (const e of parseOpenAISSE(mockSSEResponse(sse))) {
        events.push(e)
      }
      expect(events).toEqual([{ i: 1 }, { i: 2 }])
    })

    it('ignores malformed JSON but continues the stream', async () => {
      const sse =
        'data: {"ok":1}\n\n' +
        'data: {not json\n\n' +
        'data: {"ok":2}\n\n' +
        'data: [DONE]\n\n'
      const events = []
      for await (const e of parseOpenAISSE(mockSSEResponse(sse))) {
        events.push(e)
      }
      expect(events).toEqual([{ ok: 1 }, { ok: 2 }])
    })

    it('parses CRLF event boundaries (SSE spec allows both LF and CRLF)', async () => {
      const sse = 'data: {"i":1}\r\n\r\ndata: {"i":2}\r\n\r\ndata: [DONE]\r\n\r\n'
      const events = []
      for await (const e of parseOpenAISSE(mockSSEResponse(sse))) {
        events.push(e)
      }
      expect(events).toEqual([{ i: 1 }, { i: 2 }])
    })

    it('terminates on [DONE] without yielding later events', async () => {
      const sse =
        'data: {"i":1}\n\n' +
        'data: [DONE]\n\n' +
        'data: {"i":2}\n\n'
      const events = []
      for await (const e of parseOpenAISSE(mockSSEResponse(sse))) {
        events.push(e)
      }
      expect(events).toEqual([{ i: 1 }])
    })

    it('throws when response has no body', async () => {
      await expect(async () => {
        const it = parseOpenAISSE({ body: null })
        await it.next()
      }).rejects.toThrow('No response body')
    })
  })
})
