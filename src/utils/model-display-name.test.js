import { describe, it, expect } from 'vitest'
import { getModelDisplayName, getModelShortName, getHistoryModelName } from './model-display-name'

describe('getModelDisplayName', () => {
  it('returns full label for known image model', () => {
    expect(getModelDisplayName('gemini-3-pro-image-preview')).toBe('Gemini 3 Pro Image')
    expect(getModelDisplayName('gemini-3.1-flash-image-preview')).toBe('Gemini 3.1 Flash Image')
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
