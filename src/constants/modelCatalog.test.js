import { describe, it, expect } from 'vitest'
import {
  IMAGE_MODEL_CATALOG,
  TEXT_MODEL_CATALOG,
  EMBEDDING_MODEL_CATALOG,
  TTS_MODEL_CATALOG,
  getCatalog,
  findModel,
  getProviderForModel,
  getDefaultModelId,
  groupByProvider,
  filterCatalog,
} from './modelCatalog'

describe('modelCatalog', () => {
  describe('catalog shape', () => {
    it('every catalog entry has required fields', () => {
      const catalogs = [IMAGE_MODEL_CATALOG, TEXT_MODEL_CATALOG, EMBEDDING_MODEL_CATALOG, TTS_MODEL_CATALOG]
      for (const catalog of catalogs) {
        for (const entry of catalog) {
          expect(entry.id).toBeTruthy()
          expect(entry.provider).toBeTruthy()
          expect(entry.group).toBeTruthy()
          expect(entry.label).toBeTruthy()
        }
      }
    })

    it('each catalog has exactly one default', () => {
      const catalogs = [IMAGE_MODEL_CATALOG, TEXT_MODEL_CATALOG, EMBEDDING_MODEL_CATALOG, TTS_MODEL_CATALOG]
      for (const catalog of catalogs) {
        const defaults = catalog.filter((m) => m.isDefault)
        expect(defaults).toHaveLength(1)
      }
    })

    it('model IDs are unique within each capability', () => {
      const catalogs = {
        image: IMAGE_MODEL_CATALOG,
        text: TEXT_MODEL_CATALOG,
        embedding: EMBEDDING_MODEL_CATALOG,
        tts: TTS_MODEL_CATALOG,
      }
      for (const [cap, catalog] of Object.entries(catalogs)) {
        const ids = catalog.map((m) => m.id)
        const unique = new Set(ids)
        expect(unique.size, `capability=${cap}`).toBe(ids.length)
      }
    })

    it('embedding truncated variants declare baseModel + dimensions', () => {
      for (const entry of EMBEDDING_MODEL_CATALOG) {
        if (entry.id.includes('@')) {
          expect(entry.baseModel).toBeTruthy()
          expect(entry.dimensions).toBeTypeOf('number')
          expect(entry.dimensions).toBeLessThanOrEqual(entry.nativeDims)
        }
      }
    })

    it('does NOT include deprecated text-embedding-ada-002', () => {
      const ada = EMBEDDING_MODEL_CATALOG.find((m) => m.id === 'text-embedding-ada-002')
      expect(ada).toBeUndefined()
    })
  })

  describe('getCatalog', () => {
    it('returns catalog for known capabilities', () => {
      expect(getCatalog('image')).toBe(IMAGE_MODEL_CATALOG)
      expect(getCatalog('text')).toBe(TEXT_MODEL_CATALOG)
      expect(getCatalog('embedding')).toBe(EMBEDDING_MODEL_CATALOG)
      expect(getCatalog('tts')).toBe(TTS_MODEL_CATALOG)
    })

    it('returns [] for unknown capability (matches groupByProvider/filterCatalog)', () => {
      expect(getCatalog('bogus')).toEqual([])
    })
  })

  describe('findModel', () => {
    it('returns the entry when id matches', () => {
      const entry = findModel('image', 'gpt-image-2')
      expect(entry).toBeTruthy()
      expect(entry.provider).toBe('openai')
    })

    it('returns null for unknown id', () => {
      expect(findModel('image', 'nope')).toBeNull()
      expect(findModel('nope', 'gpt-image-2')).toBeNull()
    })
  })

  describe('getProviderForModel', () => {
    it('resolves Gemini provider', () => {
      expect(getProviderForModel('image', 'gemini-3-pro-image-preview')).toBe('gemini')
    })

    it('resolves OpenAI provider', () => {
      expect(getProviderForModel('text', 'gpt-5.4-mini')).toBe('openai')
    })

    it('resolves local provider', () => {
      expect(getProviderForModel('embedding', 'local:e5-small')).toBe('local')
    })

    it('returns null for unknown model', () => {
      expect(getProviderForModel('image', 'nope')).toBeNull()
    })
  })

  describe('getDefaultModelId', () => {
    it('returns the isDefault entry', () => {
      expect(getDefaultModelId('image')).toBe('gemini-3-pro-image-preview')
      expect(getDefaultModelId('text')).toBe('gemini-3-flash-preview')
      expect(getDefaultModelId('embedding')).toBe('gemini-embedding-2-preview')
      expect(getDefaultModelId('tts')).toBe('gemini-2.5-flash-preview-tts')
    })

    it('returns null for unknown capability', () => {
      expect(getDefaultModelId('nope')).toBeNull()
    })
  })

  describe('groupByProvider', () => {
    it('groups entries and preserves insertion order', () => {
      const groups = groupByProvider('image')
      expect(groups.map((g) => g.group)).toEqual(['Gemini', 'OpenAI'])
      expect(groups[0].items.every((m) => m.provider === 'gemini')).toBe(true)
      expect(groups[1].items.every((m) => m.provider === 'openai')).toBe(true)
    })

    it('returns empty array for unknown capability', () => {
      expect(groupByProvider('nope')).toEqual([])
    })
  })

  describe('filterCatalog', () => {
    it('filters by predicate', () => {
      const openaiOnly = filterCatalog('image', (m) => m.provider === 'openai')
      expect(openaiOnly.length).toBeGreaterThan(0)
      expect(openaiOnly.every((m) => m.provider === 'openai')).toBe(true)
    })

    it('returns empty array for unknown capability', () => {
      expect(filterCatalog('nope', () => true)).toEqual([])
    })
  })
})
