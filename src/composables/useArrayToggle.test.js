import { describe, it, expect } from 'vitest'
import { useArrayToggle, useMultiArrayToggle } from './useArrayToggle'

// ============================================================================
// useArrayToggle
// ============================================================================

describe('useArrayToggle', () => {
  it('toggle adds item when not present', () => {
    const arr = []
    const { toggle } = useArrayToggle(() => arr)
    toggle('a')
    expect(arr).toEqual(['a'])
  })

  it('toggle removes item when already present', () => {
    const arr = ['a', 'b']
    const { toggle } = useArrayToggle(() => arr)
    toggle('a')
    expect(arr).toEqual(['b'])
  })

  it('add returns true when item is new', () => {
    const arr = []
    const { add } = useArrayToggle(() => arr)
    expect(add('x')).toBe(true)
    expect(arr).toEqual(['x'])
  })

  it('add returns false when item already exists', () => {
    const arr = ['x']
    const { add } = useArrayToggle(() => arr)
    expect(add('x')).toBe(false)
    expect(arr).toEqual(['x'])
  })

  it('remove returns true when item exists', () => {
    const arr = ['a', 'b']
    const { remove } = useArrayToggle(() => arr)
    expect(remove('a')).toBe(true)
    expect(arr).toEqual(['b'])
  })

  it('remove returns false when item not found', () => {
    const arr = ['a']
    const { remove } = useArrayToggle(() => arr)
    expect(remove('z')).toBe(false)
    expect(arr).toEqual(['a'])
  })

  it('has returns true when item exists', () => {
    const arr = ['a']
    const { has } = useArrayToggle(() => arr)
    expect(has('a')).toBe(true)
  })

  it('has returns false when item does not exist', () => {
    const arr = []
    const { has } = useArrayToggle(() => arr)
    expect(has('a')).toBe(false)
  })

  it('addFromInput parses comma-separated values', () => {
    const arr = []
    const { addFromInput } = useArrayToggle(() => arr)
    const count = addFromInput('a, b, c')
    expect(count).toBe(3)
    expect(arr).toEqual(['a', 'b', 'c'])
  })

  it('addFromInput skips duplicates', () => {
    const arr = ['a']
    const { addFromInput } = useArrayToggle(() => arr)
    const count = addFromInput('a, b')
    expect(count).toBe(1)
    expect(arr).toEqual(['a', 'b'])
  })

  it('addFromInput skips empty values', () => {
    const arr = []
    const { addFromInput } = useArrayToggle(() => arr)
    const count = addFromInput(' , , x, ')
    expect(count).toBe(1)
    expect(arr).toEqual(['x'])
  })
})

// ============================================================================
// useMultiArrayToggle
// ============================================================================

describe('useMultiArrayToggle', () => {
  it('creates independent togglers for each array', () => {
    const styles = []
    const variations = []
    const togglers = useMultiArrayToggle({
      styles: () => styles,
      variations: () => variations,
    })

    togglers.styles.toggle('anime')
    togglers.variations.toggle('lighting')

    expect(styles).toEqual(['anime'])
    expect(variations).toEqual(['lighting'])
  })
})
