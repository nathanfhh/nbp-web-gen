import { describe, it, expect } from 'vitest'
import {
  normalizeSchemaForOpenAI,
  buildOpenAIMessages,
  buildChatCompletionBody,
  modelSupportsTemperature,
  isGpt5Family,
} from './openaiText'

describe('openaiText', () => {
  describe('normalizeSchemaForOpenAI', () => {
    it('adds additionalProperties:false and full required list to objects', () => {
      const input = {
        type: 'object',
        properties: {
          a: { type: 'string' },
          b: { type: 'integer' },
        },
        required: ['a'],
      }
      const out = normalizeSchemaForOpenAI(input)
      expect(out.additionalProperties).toBe(false)
      expect(out.required).toEqual(['a', 'b'])
    })

    it('recurses into nested object properties', () => {
      const input = {
        type: 'object',
        properties: {
          inner: {
            type: 'object',
            properties: { x: { type: 'string' } },
          },
        },
      }
      const out = normalizeSchemaForOpenAI(input)
      expect(out.properties.inner.additionalProperties).toBe(false)
      expect(out.properties.inner.required).toEqual(['x'])
    })

    it('recurses into array items', () => {
      const input = {
        type: 'array',
        items: {
          type: 'object',
          properties: { name: { type: 'string' } },
        },
      }
      const out = normalizeSchemaForOpenAI(input)
      expect(out.items.additionalProperties).toBe(false)
      expect(out.items.required).toEqual(['name'])
    })

    it('recurses into anyOf/allOf/oneOf unions', () => {
      const input = {
        anyOf: [
          { type: 'object', properties: { a: { type: 'string' } } },
          { type: 'object', properties: { b: { type: 'string' } } },
        ],
      }
      const out = normalizeSchemaForOpenAI(input)
      expect(out.anyOf[0].additionalProperties).toBe(false)
      expect(out.anyOf[1].additionalProperties).toBe(false)
    })

    it('leaves primitives untouched', () => {
      expect(normalizeSchemaForOpenAI({ type: 'string' })).toEqual({ type: 'string' })
      expect(normalizeSchemaForOpenAI(null)).toBeNull()
      expect(normalizeSchemaForOpenAI('hi')).toBe('hi')
    })

    it('is idempotent', () => {
      const input = {
        type: 'object',
        properties: { a: { type: 'string' } },
      }
      const once = normalizeSchemaForOpenAI(input)
      const twice = normalizeSchemaForOpenAI(once)
      expect(twice).toEqual(once)
    })
  })

  describe('buildOpenAIMessages', () => {
    it('returns plain user string when no images', () => {
      expect(buildOpenAIMessages({ prompt: 'hello' })).toEqual([
        { role: 'user', content: 'hello' },
      ])
    })

    it('prepends a system message', () => {
      const msgs = buildOpenAIMessages({ prompt: 'user text', systemPrompt: 'you are helpful' })
      expect(msgs[0]).toEqual({ role: 'system', content: 'you are helpful' })
      expect(msgs[1]).toEqual({ role: 'user', content: 'user text' })
    })

    it('converts images into data URLs in a multimodal user message', () => {
      const msgs = buildOpenAIMessages({
        prompt: 'describe',
        images: [
          { data: 'AAAA', mimeType: 'image/png' },
          { data: 'BBBB', mimeType: 'image/jpeg' },
        ],
      })
      expect(msgs).toHaveLength(1)
      expect(msgs[0].role).toBe('user')
      expect(msgs[0].content).toEqual([
        { type: 'text', text: 'describe' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,BBBB' } },
      ])
    })

    it('defaults mimeType to image/png when missing', () => {
      const msgs = buildOpenAIMessages({
        prompt: 'p',
        images: [{ data: 'X' }],
      })
      expect(msgs[0].content[1].image_url.url).toBe('data:image/png;base64,X')
    })
  })

  describe('isGpt5Family / modelSupportsTemperature', () => {
    it('isGpt5Family detects gpt-5.4 prefix', () => {
      expect(isGpt5Family('gpt-5.4')).toBe(true)
      expect(isGpt5Family('gpt-5.4-mini')).toBe(true)
      expect(isGpt5Family('gpt-5.4-nano')).toBe(true)
      expect(isGpt5Family('gpt-4o')).toBe(false)
      expect(isGpt5Family('')).toBe(false)
      expect(isGpt5Family(null)).toBe(false)
    })

    it('modelSupportsTemperature excludes the gpt-5.4 family', () => {
      expect(modelSupportsTemperature('gpt-5.4')).toBe(false)
      expect(modelSupportsTemperature('gpt-5.4-mini')).toBe(false)
      expect(modelSupportsTemperature('gpt-4o')).toBe(true)
      expect(modelSupportsTemperature('gemini-3-flash-preview')).toBe(true)
    })
  })

  describe('buildChatCompletionBody', () => {
    it('assembles a minimal body', () => {
      const body = buildChatCompletionBody({
        model: 'gpt-5.4-mini',
        messages: [{ role: 'user', content: 'hi' }],
      })
      expect(body.model).toBe('gpt-5.4-mini')
      expect(body.messages).toHaveLength(1)
      expect(body.response_format).toBeUndefined()
      expect(body.stream).toBeUndefined()
      expect(body.reasoning_effort).toBeUndefined()
    })

    it('wires json_schema strict when responseSchema is provided', () => {
      const schema = {
        type: 'object',
        properties: { a: { type: 'string' } },
      }
      const body = buildChatCompletionBody({
        model: 'gpt-5.4-mini',
        messages: [],
        responseSchema: schema,
      })
      expect(body.response_format.type).toBe('json_schema')
      expect(body.response_format.json_schema.strict).toBe(true)
      expect(body.response_format.json_schema.schema.additionalProperties).toBe(false)
      expect(body.response_format.json_schema.schema.required).toEqual(['a'])
    })

    it('sets reasoning_effort only for gpt-5.4 family', () => {
      expect(
        buildChatCompletionBody({
          model: 'gpt-5.4',
          messages: [],
          reasoningEffort: 'high',
        }).reasoning_effort,
      ).toBe('high')
      expect(
        buildChatCompletionBody({
          model: 'gpt-4o',
          messages: [],
          reasoningEffort: 'high',
        }).reasoning_effort,
      ).toBeUndefined()
    })

    it('omits temperature for gpt-5.4 reasoning family (rejected by API)', () => {
      const body = buildChatCompletionBody({ model: 'gpt-5.4', messages: [], temperature: 0.2 })
      expect(body.temperature).toBeUndefined()
      const miniBody = buildChatCompletionBody({ model: 'gpt-5.4-mini', messages: [], temperature: 0.7 })
      expect(miniBody.temperature).toBeUndefined()
    })

    it('passes through temperature for non-reasoning OpenAI models', () => {
      const body = buildChatCompletionBody({ model: 'gpt-4o', messages: [], temperature: 0.2 })
      expect(body.temperature).toBe(0.2)
    })

    it('stream:true sets the stream field', () => {
      const body = buildChatCompletionBody({ model: 'gpt-5.4', messages: [], stream: true })
      expect(body.stream).toBe(true)
    })
  })
})
