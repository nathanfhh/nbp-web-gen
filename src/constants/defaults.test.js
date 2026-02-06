import { describe, it, expect } from 'vitest'
import { getDefaultOptions } from './defaults'

describe('getDefaultOptions', () => {
  const modes = ['generate', 'edit', 'story', 'diagram', 'sticker', 'video', 'slides', 'agent']

  it.each(modes)('returns an object for "%s" mode', (mode) => {
    const opts = getDefaultOptions(mode)
    expect(opts).toBeDefined()
    expect(typeof opts).toBe('object')
    expect(Object.keys(opts).length).toBeGreaterThan(0)
  })

  it('returns empty object for unknown mode', () => {
    expect(getDefaultOptions('nonexistent')).toEqual({})
  })

  it('returns a deep clone (mutations do not affect defaults)', () => {
    const a = getDefaultOptions('generate')
    const b = getDefaultOptions('generate')
    a.resolution = '4k'
    expect(b.resolution).not.toBe('4k')
  })

  it('generate mode has expected keys', () => {
    const opts = getDefaultOptions('generate')
    expect(opts).toHaveProperty('resolution')
    expect(opts).toHaveProperty('ratio')
    expect(opts).toHaveProperty('styles')
    expect(opts).toHaveProperty('variations')
  })

  it('video mode has sub-mode properties', () => {
    const opts = getDefaultOptions('video')
    expect(opts).toHaveProperty('subMode')
    expect(opts).toHaveProperty('model')
    expect(opts).toHaveProperty('resolution')
    expect(opts).toHaveProperty('duration')
  })

  it('slides mode has narration settings', () => {
    const opts = getDefaultOptions('slides')
    expect(opts).toHaveProperty('narration')
    expect(typeof opts.narration).toBe('object')
  })

  it('sticker mode has layout properties', () => {
    const opts = getDefaultOptions('sticker')
    expect(opts).toHaveProperty('layoutRows')
    expect(opts).toHaveProperty('layoutCols')
    expect(opts.layoutRows).toBe(3)
    expect(opts.layoutCols).toBe(3)
  })

  it('deep clones nested arrays', () => {
    const a = getDefaultOptions('sticker')
    const b = getDefaultOptions('sticker')
    a.styles.push('anime')
    expect(b.styles).toEqual([])
  })

  it('deep clones nested objects', () => {
    const a = getDefaultOptions('slides')
    const b = getDefaultOptions('slides')
    a.narration.someKey = 'modified'
    expect(b.narration.someKey).toBeUndefined()
  })
})
