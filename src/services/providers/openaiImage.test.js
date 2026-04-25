import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  mapAspectToSize,
  mapResolutionToQuality,
  buildGenerationBody,
  generateImageOpenAI,
} from './openaiImage'

describe('openaiImage', () => {
  describe('mapAspectToSize', () => {
    it('maps 1:1 across resolution buckets', () => {
      expect(mapAspectToSize('1:1', '1k')).toBe('1024x1024')
      expect(mapAspectToSize('1:1', '2k')).toBe('2048x2048')
      expect(mapAspectToSize('1:1', '4k')).toBe('2880x2880')
    })

    it('maps 9:16 portrait correctly', () => {
      expect(mapAspectToSize('9:16', '1k')).toBe('720x1280')
      expect(mapAspectToSize('9:16', '2k')).toBe('1152x2048')
      expect(mapAspectToSize('9:16', '4k')).toBe('2160x3840')
    })

    it('maps 16:9 landscape correctly', () => {
      expect(mapAspectToSize('16:9', '4k')).toBe('3840x2160')
    })

    it('maps 21:9 respecting 3:1 cap', () => {
      const sizes = ['1k', '2k', '4k'].map((r) => mapAspectToSize('21:9', r))
      for (const size of sizes) {
        const [w, h] = size.split('x').map(Number)
        expect(w / h).toBeLessThanOrEqual(3)
      }
    })

    it('falls back to 1:1 for unknown aspect', () => {
      expect(mapAspectToSize('bogus', '1k')).toBe('1024x1024')
    })

    it('falls back to 1k for unknown resolution', () => {
      expect(mapAspectToSize('1:1', 'bogus')).toBe('1024x1024')
    })

    it('produces sizes that satisfy gpt-image-2 constraints', () => {
      const aspects = ['1:1', '3:4', '4:3', '9:16', '16:9', '21:9']
      const resolutions = ['1k', '2k', '4k']
      for (const aspect of aspects) {
        for (const resolution of resolutions) {
          const size = mapAspectToSize(aspect, resolution)
          const [w, h] = size.split('x').map(Number)
          expect(w % 16, `${aspect}@${resolution}=${size} width`).toBe(0)
          expect(h % 16, `${aspect}@${resolution}=${size} height`).toBe(0)
          expect(Math.max(w, h)).toBeLessThanOrEqual(3840)
          expect(w * h).toBeGreaterThanOrEqual(655_360)
          expect(w * h).toBeLessThanOrEqual(8_294_400)
        }
      }
    })
  })

  describe('mapResolutionToQuality', () => {
    it('maps 1k/2k/4k to OpenAI low/medium/high', () => {
      expect(mapResolutionToQuality('1k')).toBe('low')
      expect(mapResolutionToQuality('2k')).toBe('medium')
      expect(mapResolutionToQuality('4k')).toBe('high')
    })

    it('maps unknown to auto', () => {
      expect(mapResolutionToQuality('bogus')).toBe('auto')
      expect(mapResolutionToQuality()).toBe('auto')
    })
  })

  describe('buildGenerationBody', () => {
    it('assembles a complete streaming body with defaults', () => {
      const body = buildGenerationBody({
        model: 'gpt-image-2',
        prompt: 'a cat',
        options: { ratio: '16:9', resolution: '2k' },
      })
      expect(body).toMatchObject({
        model: 'gpt-image-2',
        prompt: 'a cat',
        size: '2048x1152',
        quality: 'medium',
        output_format: 'png',
        moderation: 'auto',
        n: 1,
        stream: true,
        partial_images: 2,
      })
    })

    it('respects stream=false', () => {
      const body = buildGenerationBody({
        model: 'gpt-image-2',
        prompt: 'a cat',
        options: {},
        stream: false,
      })
      expect(body.stream).toBeUndefined()
      expect(body.partial_images).toBeUndefined()
    })

    it('clamps partial_images into [0,3]', () => {
      expect(buildGenerationBody({ model: 'm', prompt: 'p', options: { partialImages: 99 } }).partial_images).toBe(3)
      expect(buildGenerationBody({ model: 'm', prompt: 'p', options: { partialImages: -5 } }).partial_images).toBe(0)
    })

    it('lets caller override quality / moderation / output_format / n', () => {
      const body = buildGenerationBody({
        model: 'gpt-image-2',
        prompt: 'p',
        options: { quality: 'low', moderation: 'low', outputFormat: 'jpeg', n: 3 },
      })
      expect(body.quality).toBe('low')
      expect(body.moderation).toBe('low')
      expect(body.output_format).toBe('jpeg')
      expect(body.n).toBe(3)
    })
  })

  describe('SSE event prefix handling', () => {
    function makeStreamingResponse(text) {
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(text))
          controller.close()
        },
      })
      return {
        ok: true,
        status: 200,
        body: stream,
        headers: { get: () => 'text/event-stream' },
        clone() {
          return this
        },
        async json() {
          return {}
        },
      }
    }

    let originalFetch
    beforeEach(() => {
      originalFetch = globalThis.fetch
    })
    afterEach(() => {
      globalThis.fetch = originalFetch
    })

    it('parses image_generation.completed events from /images/generations', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        makeStreamingResponse(
          'data: {"type":"image_generation.completed","b64_json":"AAAA","output_format":"png"}\n\n'
            + 'data: [DONE]\n\n',
        ),
      )
      const out = await generateImageOpenAI({
        apiKey: 'sk-test',
        model: 'gpt-image-2',
        prompt: 'cat',
      })
      expect(out.images).toEqual([{ data: 'AAAA', mimeType: 'image/png' }])
    })

    it('parses image_edit.completed events from /images/edits (regression: prev. dropped)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        makeStreamingResponse(
          'data: {"type":"image_edit.partial_image","b64_json":"AAAA","output_format":"png"}\n\n'
            + 'data: {"type":"image_edit.completed","b64_json":"BBBB","output_format":"png"}\n\n'
            + 'data: [DONE]\n\n',
        ),
      )
      const partials = []
      const out = await generateImageOpenAI({
        apiKey: 'sk-test',
        model: 'gpt-image-2',
        prompt: 'add hat',
        referenceImages: [{ data: 'CCCC', mimeType: 'image/png' }],
        onPartialImage: (chunk) => partials.push(chunk),
      })
      expect(out.images).toEqual([{ data: 'BBBB', mimeType: 'image/png' }])
      expect(partials).toEqual([{ type: 'image', data: 'AAAA', mimeType: 'image/png' }])
    })
  })
})
