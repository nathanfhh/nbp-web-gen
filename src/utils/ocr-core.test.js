import { describe, it, expect } from 'vitest'
import {
  getStandardDeviation,
  inferAlignment,
  getMinTesseractConfidence,
  decodeRecognition,
  mergeTextRegions,
  DETECTION_MEAN,
  DETECTION_STD,
} from './ocr-core'

// ============================================================================
// getStandardDeviation
// ============================================================================

describe('getStandardDeviation', () => {
  it('returns 0 for single element', () => {
    expect(getStandardDeviation([5])).toBe(0)
  })

  it('returns 0 for empty array', () => {
    expect(getStandardDeviation([])).toBe(0)
  })

  it('returns 0 for identical values', () => {
    expect(getStandardDeviation([3, 3, 3])).toBe(0)
  })

  it('calculates correctly for known values', () => {
    // [2, 4, 4, 4, 5, 5, 7, 9] → mean=5, variance=4, std=2
    const result = getStandardDeviation([2, 4, 4, 4, 5, 5, 7, 9])
    expect(result).toBeCloseTo(2, 5)
  })

  it('handles two values', () => {
    // [0, 10] → mean=5, variance=25, std=5
    expect(getStandardDeviation([0, 10])).toBeCloseTo(5, 5)
  })
})

// ============================================================================
// inferAlignment
// ============================================================================

describe('inferAlignment', () => {
  it('returns "left" for single line', () => {
    expect(inferAlignment([{ bounds: { x: 10, width: 100 } }])).toBe('left')
  })

  it('infers left alignment when left edges are consistent', () => {
    const lines = [
      { bounds: { x: 10, width: 200 } },
      { bounds: { x: 10, width: 150 } },
      { bounds: { x: 10, width: 180 } },
    ]
    expect(inferAlignment(lines)).toBe('left')
  })

  it('infers center alignment when centers are consistent', () => {
    // All centered around x=100
    const lines = [
      { bounds: { x: 50, width: 100 } },  // center=100
      { bounds: { x: 60, width: 80 } },   // center=100
      { bounds: { x: 40, width: 120 } },  // center=100
    ]
    expect(inferAlignment(lines)).toBe('center')
  })

  it('infers right alignment when right edges are consistent', () => {
    // All right-aligned at x=200
    const lines = [
      { bounds: { x: 100, width: 100 } }, // right=200
      { bounds: { x: 120, width: 80 } },  // right=200
      { bounds: { x: 80, width: 120 } },  // right=200
    ]
    expect(inferAlignment(lines)).toBe('right')
  })
})

// ============================================================================
// getMinTesseractConfidence
// ============================================================================

describe('getMinTesseractConfidence', () => {
  it('returns higher threshold for very short text (<=3 chars)', () => {
    const result = getMinTesseractConfidence('OK')
    expect(result).toBeGreaterThanOrEqual(65)
  })

  it('returns medium threshold for short text (4-8 chars)', () => {
    const result = getMinTesseractConfidence('Hello')
    expect(result).toBeGreaterThanOrEqual(55)
  })

  it('returns lower threshold for medium text (9-15 chars)', () => {
    const result = getMinTesseractConfidence('Revenue Growth')
    expect(result).toBeGreaterThanOrEqual(45)
  })

  it('returns lowest threshold for long text (>15 chars)', () => {
    const result = getMinTesseractConfidence('This is a full sentence with context')
    expect(result).toBeGreaterThanOrEqual(35)
  })

  it('increases threshold for high numeric ratio', () => {
    const numeric = getMinTesseractConfidence('12345')
    const text = getMinTesseractConfidence('Hello')
    expect(numeric).toBeGreaterThan(text)
  })

  it('increases threshold for confusing characters in short text', () => {
    const confusing = getMinTesseractConfidence('0O1l')
    const normal = getMinTesseractConfidence('abcd')
    expect(confusing).toBeGreaterThan(normal)
  })

  it('caps at 80', () => {
    // Very short + numeric + confusing chars
    const result = getMinTesseractConfidence('01')
    expect(result).toBeLessThanOrEqual(80)
  })
})

// ============================================================================
// decodeRecognition (CTC Decoding)
// ============================================================================

describe('decodeRecognition', () => {
  // Helper to create a mock tensor output
  // dims: [1, seqLen, vocabSize]
  function makeTensor(seqLen, vocabSize, predictions) {
    // predictions is array of [maxIdx, maxVal] for each timestep
    const data = new Float32Array(seqLen * vocabSize)
    // Fill with low values
    data.fill(-10)
    for (let t = 0; t < predictions.length; t++) {
      const [idx, val] = predictions[t]
      data[t * vocabSize + idx] = val
    }
    return { data, dims: [1, seqLen, vocabSize] }
  }

  it('decodes simple character sequence', () => {
    // vocabSize must be dict.length + 1 so last index = space token, not a dict char
    const dict = ['blank', 'a', 'b', 'c'] // index 0=blank, 1=a, 2=b, 3=c
    const vocabSize = 5 // index 4 = space token (vocabSize-1)
    // Sequence: blank, a, blank, b, c
    const output = makeTensor(5, vocabSize, [
      [0, 1],  // blank
      [1, 2],  // a
      [0, 1],  // blank
      [2, 2],  // b
      [3, 2],  // c
    ])
    const result = decodeRecognition(output, dict)
    expect(result.text).toBe('abc')
  })

  it('collapses consecutive duplicates (CTC)', () => {
    const dict = ['blank', 'h', 'e', 'l', 'o']
    const vocabSize = 6 // index 5 = space token (vocabSize-1)
    // h, h, e, l, l, o → "helo" (CTC collapse)
    const output = makeTensor(6, vocabSize, [
      [1, 2], [1, 2], [2, 2], [3, 2], [3, 2], [4, 2],
    ])
    const result = decodeRecognition(output, dict)
    expect(result.text).toBe('helo')
  })

  it('handles space token (vocabSize - 1)', () => {
    const dict = ['blank', 'a', 'b']
    // vocabSize=3, so index 2 = last = space
    const output = makeTensor(3, 3, [
      [1, 2], // a
      [2, 2], // space (vocabSize-1 = 2)
      [1, 2], // a (same as first but after space, prevIdx changed)
    ])
    const result = decodeRecognition(output, dict)
    expect(result.text).toBe('a a')
  })

  it('returns empty text for all-blank sequence', () => {
    const dict = ['blank', 'a']
    const output = makeTensor(3, 2, [
      [0, 1], [0, 1], [0, 1],
    ])
    const result = decodeRecognition(output, dict)
    expect(result.text).toBe('')
    expect(result.confidence).toBe(0)
  })

  it('computes confidence as avg exp(maxVal) capped at 100', () => {
    const dict = ['blank', 'x']
    // Single char with logit value 0 → exp(0) = 1.0 → 100%
    const output = makeTensor(1, 2, [[1, 0]])
    const result = decodeRecognition(output, dict)
    expect(result.confidence).toBe(100)
  })
})

// ============================================================================
// mergeTextRegions
// ============================================================================

describe('mergeTextRegions', () => {
  function makeRegion(x, y, w, h, text, confidence = 90) {
    return {
      bounds: { x, y, width: w, height: h },
      text,
      confidence,
      recognitionFailed: false,
    }
  }

  it('returns empty array for no valid regions', () => {
    expect(mergeTextRegions([])).toEqual([])
  })

  it('filters out recognitionFailed regions', () => {
    const regions = [
      { bounds: { x: 0, y: 0, width: 100, height: 20 }, text: '', confidence: 0, recognitionFailed: true },
    ]
    expect(mergeTextRegions(regions)).toEqual([])
  })

  it('filters out empty text regions', () => {
    const regions = [makeRegion(0, 0, 100, 20, '   ')]
    expect(mergeTextRegions(regions)).toEqual([])
  })

  it('creates single block from single region', () => {
    const regions = [makeRegion(10, 20, 100, 30, 'Hello')]
    const result = mergeTextRegions(regions)
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('Hello')
  })

  it('merges nearby lines into one block with newlines', () => {
    // Two lines at different Y positions, same X
    // Gap must be < horizontalCutThreshold(0.3) * medianHeight
    // height=20, next line starts at y=30 → gap=0, well within threshold
    const regions = [
      makeRegion(10, 10, 100, 20, 'Line 1'),
      makeRegion(10, 30, 100, 20, 'Line 2'),
    ]
    const result = mergeTextRegions(regions)
    expect(result).toHaveLength(1)
    expect(result[0].text).toContain('Line 1')
    expect(result[0].text).toContain('Line 2')
  })

  it('joins same-line regions with spaces', () => {
    // Two regions on the same Y, different X (side by side)
    const regions = [
      makeRegion(10, 10, 50, 20, 'Hello'),
      makeRegion(70, 10, 50, 20, 'World'),
    ]
    const result = mergeTextRegions(regions)
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('Hello World')
  })

  it('splits into separate blocks when there is a large vertical gap', () => {
    // Two regions with a large Y gap (> horizontalCutThreshold * medianHeight)
    const regions = [
      makeRegion(10, 10, 200, 20, 'Title'),
      makeRegion(10, 200, 200, 20, 'Footer'),
    ]
    const result = mergeTextRegions(regions)
    expect(result.length).toBeGreaterThanOrEqual(2)
  })

  it('respects separator lines', () => {
    // Two regions separated by a vertical separator line
    const regions = [
      makeRegion(10, 10, 80, 20, 'Left'),
      makeRegion(200, 10, 80, 20, 'Right'),
    ]
    const separator = {
      id: 'sep1',
      start: { x: 150, y: 0 },
      end: { x: 150, y: 100 },
    }
    const result = mergeTextRegions(regions, [separator])
    expect(result.length).toBe(2)
  })

  it('includes alignment in output blocks', () => {
    const regions = [makeRegion(10, 10, 100, 20, 'Test')]
    const result = mergeTextRegions(regions)
    expect(result[0].alignment).toBeDefined()
    expect(['left', 'center', 'right']).toContain(result[0].alignment)
  })

  it('includes fontSize (max line height) in output', () => {
    // Use similar heights so XY-Cut doesn't split them
    // medianHeight=30, gap=0 → well within horizontalCutThreshold(0.3)*30=9
    const regions = [
      makeRegion(10, 10, 100, 25, 'Small'),
      makeRegion(10, 35, 100, 35, 'Big'),
    ]
    const result = mergeTextRegions(regions)
    expect(result).toHaveLength(1)
    expect(result[0].fontSize).toBe(35)
  })

  it('includes polygon in output', () => {
    const regions = [makeRegion(10, 20, 100, 30, 'Test')]
    const result = mergeTextRegions(regions)
    expect(result[0].polygon).toBeDefined()
    expect(result[0].polygon).toHaveLength(4)
  })
})

// ============================================================================
// Constants
// ============================================================================

describe('OCR constants', () => {
  it('DETECTION_MEAN has 3 channels', () => {
    expect(DETECTION_MEAN).toHaveLength(3)
  })

  it('DETECTION_STD has 3 channels', () => {
    expect(DETECTION_STD).toHaveLength(3)
  })

  it('DETECTION_STD values are positive', () => {
    DETECTION_STD.forEach((v) => expect(v).toBeGreaterThan(0))
  })
})
