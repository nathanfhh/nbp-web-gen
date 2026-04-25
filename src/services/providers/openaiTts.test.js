import { describe, it, expect } from 'vitest'
import {
  parseSpeakerSegments,
  modelSupportsTtsInstructions,
  generateMultiSpeakerOpenAI,
} from './openaiTts'

describe('openaiTts / parseSpeakerSegments', () => {
  it('returns a single anonymous segment when no speakers are given', () => {
    expect(parseSpeakerSegments('Hello world')).toEqual([
      { speaker: null, text: 'Hello world' },
    ])
  })

  it('returns empty array for empty script', () => {
    expect(parseSpeakerSegments('')).toEqual([])
    expect(parseSpeakerSegments(null)).toEqual([])
    expect(parseSpeakerSegments('   ')).toEqual([])
  })

  it('falls back to first speaker when no labels are found', () => {
    const out = parseSpeakerSegments('Just narration without labels', ['Alice', 'Bob'])
    expect(out).toEqual([{ speaker: 'Alice', text: 'Just narration without labels' }])
  })

  it('splits a two-speaker dialogue', () => {
    const script = `Alice: Hello everyone.
Bob: Welcome.
Alice: Today we'll discuss.`
    expect(parseSpeakerSegments(script, ['Alice', 'Bob'])).toEqual([
      { speaker: 'Alice', text: 'Hello everyone.' },
      { speaker: 'Bob', text: 'Welcome.' },
      { speaker: 'Alice', text: "Today we'll discuss." },
    ])
  })

  it('preserves multi-line utterances', () => {
    const script = `Alice: First line.
Still Alice.
Bob: Bob speaks now.`
    expect(parseSpeakerSegments(script, ['Alice', 'Bob'])).toEqual([
      { speaker: 'Alice', text: 'First line.\nStill Alice.' },
      { speaker: 'Bob', text: 'Bob speaks now.' },
    ])
  })

  it('escapes regex metacharacters in speaker names', () => {
    const script = `Dr. Smith: Hello
Ms. O'Brien: Hi`
    const out = parseSpeakerSegments(script, ['Dr. Smith', "Ms. O'Brien"])
    expect(out).toEqual([
      { speaker: 'Dr. Smith', text: 'Hello' },
      { speaker: "Ms. O'Brien", text: 'Hi' },
    ])
  })

  it('ignores empty segments (e.g., trailing label with no text)', () => {
    const script = `Alice: Hello.
Bob: `
    expect(parseSpeakerSegments(script, ['Alice', 'Bob'])).toEqual([
      { speaker: 'Alice', text: 'Hello.' },
    ])
  })

  it('tolerates extra whitespace around labels and colons', () => {
    const script = `   Alice :  one
  Bob  :  two`
    expect(parseSpeakerSegments(script, ['Alice', 'Bob'])).toEqual([
      { speaker: 'Alice', text: 'one' },
      { speaker: 'Bob', text: 'two' },
    ])
  })
})

describe('generateMultiSpeakerOpenAI input validation', () => {
  const baseArgs = {
    apiKey: 'sk-test',
    model: 'gpt-4o-mini-tts-2025-12-15',
    script: 'Alice: hi\nBob: hello',
  }

  it('rejects empty speakers array with a clear error', async () => {
    await expect(
      generateMultiSpeakerOpenAI({ ...baseArgs, speakers: [] }),
    ).rejects.toThrow(/at least one speaker/i)
  })

  it('rejects non-array speakers', async () => {
    await expect(
      generateMultiSpeakerOpenAI({ ...baseArgs, speakers: null }),
    ).rejects.toThrow(/at least one speaker/i)
  })

  it('rejects speakers missing name or voice', async () => {
    await expect(
      generateMultiSpeakerOpenAI({ ...baseArgs, speakers: [{ name: '', voice: '' }] }),
    ).rejects.toThrow(/name \+ voice/i)
  })

  it('rejects when ANY speaker is missing name or voice (regression: was .some)', async () => {
    // .some would pass this since the first entry is complete; .every must reject.
    await expect(
      generateMultiSpeakerOpenAI({
        ...baseArgs,
        speakers: [
          { name: 'A', voice: 'alloy' },
          { name: 'B', voice: '' },
        ],
      }),
    ).rejects.toThrow(/name \+ voice/i)
  })
})

describe('modelSupportsTtsInstructions', () => {
  it('allows instructions for gpt-4o-mini-tts family', () => {
    expect(modelSupportsTtsInstructions('gpt-4o-mini-tts-2025-12-15')).toBe(true)
  })

  it('rejects instructions for tts-1 / tts-1-hd', () => {
    expect(modelSupportsTtsInstructions('tts-1')).toBe(false)
    expect(modelSupportsTtsInstructions('tts-1-hd')).toBe(false)
  })

  it('returns false for unknown or empty model ids', () => {
    expect(modelSupportsTtsInstructions('')).toBe(false)
    expect(modelSupportsTtsInstructions(undefined)).toBe(false)
    expect(modelSupportsTtsInstructions('bogus')).toBe(false)
  })
})
