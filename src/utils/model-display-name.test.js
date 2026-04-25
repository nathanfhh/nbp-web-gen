import { describe, it, expect } from 'vitest'
import {
  getModelDisplayName,
  getModelShortName,
  getHistoryModelName,
  getRecordProvider,
} from './model-display-name'

describe('getModelDisplayName', () => {
  it('returns full label for known image model', () => {
    expect(getModelDisplayName('gemini-3-pro-image-preview')).toBe('Nano Banana Pro')
    expect(getModelDisplayName('gemini-3.1-flash-image-preview')).toBe('Nano Banana 2')
  })

  it('returns full label for OpenAI image models from catalog', () => {
    expect(getModelDisplayName('gpt-image-2')).toBe('GPT Image 2')
    expect(getModelDisplayName('gpt-image-1-mini')).toBe('GPT Image 1 mini')
  })

  it('returns full label for OpenAI text models from catalog', () => {
    expect(getModelDisplayName('gpt-5.4')).toBe('GPT-5.4')
    expect(getModelDisplayName('gpt-5.4-mini')).toBe('GPT-5.4 mini')
  })

  it('returns full label for known text model', () => {
    expect(getModelDisplayName('gemini-3-flash-preview')).toBe('Gemini 3 Flash')
  })

  it('returns null for null/undefined/empty/unknown', () => {
    expect(getModelDisplayName(null)).toBeNull()
    expect(getModelDisplayName(undefined)).toBeNull()
    expect(getModelDisplayName('')).toBeNull()
    expect(getModelDisplayName('unknown')).toBeNull()
  })
})

describe('getModelShortName', () => {
  it('returns short label for image models', () => {
    expect(getModelShortName('gemini-3-pro-image-preview')).toBe('3 Pro')
    expect(getModelShortName('gemini-3.1-flash-image-preview')).toBe('3.1 Flash')
    expect(getModelShortName('gpt-image-2')).toBe('GPT Image 2')
  })

  it('returns short label for text models', () => {
    expect(getModelShortName('gemini-3-flash-preview')).toBe('3 Flash')
    expect(getModelShortName('gemini-3.1-pro-preview')).toBe('3.1 Pro')
  })

  it('returns short label for video models', () => {
    expect(getModelShortName('fast')).toBe('Fast')
    expect(getModelShortName('standard')).toBe('High Quality')
  })

  it('returns null for null/undefined/empty/unknown', () => {
    expect(getModelShortName(null)).toBeNull()
    expect(getModelShortName(undefined)).toBeNull()
    expect(getModelShortName('')).toBeNull()
    expect(getModelShortName('unknown')).toBeNull()
  })
})

describe('getHistoryModelName', () => {
  it('returns short name for generate mode with model', () => {
    expect(getHistoryModelName('generate', { model: 'gemini-3-pro-image-preview' }))
      .toBe('3 Pro')
  })

  it('defaults to 3 Pro for image modes without model', () => {
    expect(getHistoryModelName('generate', {})).toBe('3 Pro')
    expect(getHistoryModelName('generate', null)).toBe('3 Pro')
    expect(getHistoryModelName('sticker', {})).toBe('3 Pro')
    expect(getHistoryModelName('edit', {})).toBe('3 Pro')
    expect(getHistoryModelName('story', {})).toBe('3 Pro')
    expect(getHistoryModelName('diagram', {})).toBe('3 Pro')
    expect(getHistoryModelName('slides', {})).toBe('3 Pro')
  })

  it('returns correct short name for non-default image model', () => {
    expect(getHistoryModelName('generate', { model: 'gemini-3.1-flash-image-preview' }))
      .toBe('3.1 Flash')
  })

  it('returns short name for video mode', () => {
    expect(getHistoryModelName('video', { model: 'fast' })).toBe('Fast')
    expect(getHistoryModelName('video', { model: 'standard' })).toBe('High Quality')
  })

  it('returns null for video mode without model', () => {
    expect(getHistoryModelName('video', {})).toBeNull()
  })

  it('returns 3 Flash for agent mode', () => {
    expect(getHistoryModelName('agent', {})).toBe('3 Flash')
    expect(getHistoryModelName('agent', null)).toBe('3 Flash')
  })

  it('returns image model for slides mode', () => {
    expect(getHistoryModelName('slides', { model: 'gemini-3-pro-image-preview' }))
      .toBe('3 Pro')
  })
})

describe('getRecordProvider', () => {
  it('returns null for missing record', () => {
    expect(getRecordProvider(null)).toBeNull()
    expect(getRecordProvider(undefined)).toBeNull()
  })

  it('resolves Gemini image models', () => {
    expect(getRecordProvider({
      mode: 'generate',
      options: { model: 'gemini-3-pro-image-preview' },
    })).toBe('gemini')
  })

  it('resolves OpenAI image models', () => {
    expect(getRecordProvider({
      mode: 'generate',
      options: { model: 'gpt-image-2' },
    })).toBe('openai')
  })

  it('resolves OpenAI text models', () => {
    expect(getRecordProvider({
      mode: 'slides',
      options: { model: 'gpt-5.4-mini' },
    })).toBe('openai')
  })

  it('falls back to gemini for image modes without model (legacy records)', () => {
    expect(getRecordProvider({ mode: 'generate', options: {} })).toBe('gemini')
    expect(getRecordProvider({ mode: 'sticker' })).toBe('gemini')
  })

  it('returns gemini for agent mode records', () => {
    expect(getRecordProvider({ mode: 'agent' })).toBe('gemini')
  })

  it('treats video records as Gemini regardless of model id', () => {
    // Video uses Veo model ids ('fast' / 'standard') that aren't in any
    // capability catalog; the previous catalog-loop fallback returned null
    // for them, but video is Gemini-only by design.
    expect(getRecordProvider({ mode: 'video', options: { model: 'fast' } })).toBe('gemini')
    expect(getRecordProvider({ mode: 'video', options: { model: 'standard' } })).toBe('gemini')
    expect(getRecordProvider({ mode: 'video' })).toBe('gemini')
  })

  it('returns null for an unrecognized mode + unknown model id', () => {
    expect(getRecordProvider({
      mode: 'something-unknown',
      options: { model: 'something-unknown' },
    })).toBeNull()
  })
})
