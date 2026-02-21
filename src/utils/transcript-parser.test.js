import { describe, it, expect } from 'vitest'
import { parseTranscript } from './transcript-parser'

describe('parseTranscript', () => {
  // --- Edge cases ---
  describe('edge cases', () => {
    it('returns empty array for null script', () => {
      expect(parseTranscript(null, [], 'single')).toEqual([])
    })

    it('returns empty array for undefined script', () => {
      expect(parseTranscript(undefined, [], 'single')).toEqual([])
    })

    it('returns empty array for empty string', () => {
      expect(parseTranscript('', [], 'single')).toEqual([])
    })

    it('returns empty array for whitespace-only string', () => {
      expect(parseTranscript('   \n  ', [], 'single')).toEqual([])
    })

    it('returns empty array for non-string input', () => {
      expect(parseTranscript(123, [], 'single')).toEqual([])
    })
  })

  // --- Single mode ---
  describe('single mode', () => {
    it('returns plain text as single segment', () => {
      const result = parseTranscript('Hello world', [], 'single')
      expect(result).toEqual([{ speaker: null, text: 'Hello world' }])
    })

    it('strips leading speaker label when speakers provided', () => {
      const speakers = [{ name: 'Alice' }]
      const result = parseTranscript('Alice: Hello world', speakers, 'single')
      expect(result).toEqual([{ speaker: null, text: 'Hello world' }])
    })

    it('strips leading speaker label with full-width colon', () => {
      const speakers = [{ name: 'Alice' }]
      const result = parseTranscript('Alice： Hello world', speakers, 'single')
      expect(result).toEqual([{ speaker: null, text: 'Hello world' }])
    })

    it('does not strip non-matching speaker label', () => {
      const speakers = [{ name: 'Alice' }]
      const result = parseTranscript('Bob: Hello world', speakers, 'single')
      expect(result).toEqual([{ speaker: null, text: 'Bob: Hello world' }])
    })

    it('handles multi-line text as single segment', () => {
      const result = parseTranscript('Line 1\nLine 2\nLine 3', [], 'single')
      expect(result).toEqual([{ speaker: null, text: 'Line 1\nLine 2\nLine 3' }])
    })

    it('treats dual mode as single when no speakers provided', () => {
      const result = parseTranscript('Hello world', [], 'dual')
      expect(result).toEqual([{ speaker: null, text: 'Hello world' }])
    })

    it('treats dual mode as single when speakers is null', () => {
      const result = parseTranscript('Hello world', null, 'dual')
      expect(result).toEqual([{ speaker: null, text: 'Hello world' }])
    })
  })

  // --- Dual mode ---
  describe('dual mode', () => {
    const speakers = [
      { name: 'Speaker 1', voiceName: 'Zephyr' },
      { name: 'Speaker 2', voiceName: 'Puck' },
    ]

    it('splits basic dual speaker dialogue', () => {
      const script = 'Speaker 1: Hello\nSpeaker 2: World'
      const result = parseTranscript(script, speakers, 'dual')
      expect(result).toEqual([
        { speaker: 'Speaker 1', text: 'Hello' },
        { speaker: 'Speaker 2', text: 'World' },
      ])
    })

    it('handles multi-line segments', () => {
      const script = 'Speaker 1: First line\nSecond line\nSpeaker 2: Response'
      const result = parseTranscript(script, speakers, 'dual')
      expect(result).toEqual([
        { speaker: 'Speaker 1', text: 'First line\nSecond line' },
        { speaker: 'Speaker 2', text: 'Response' },
      ])
    })

    it('handles full-width colons', () => {
      const script = 'Speaker 1： Hello\nSpeaker 2： World'
      const result = parseTranscript(script, speakers, 'dual')
      expect(result).toEqual([
        { speaker: 'Speaker 1', text: 'Hello' },
        { speaker: 'Speaker 2', text: 'World' },
      ])
    })

    it('handles text before any speaker label', () => {
      const script = 'Introduction text\nSpeaker 1: Hello'
      const result = parseTranscript(script, speakers, 'dual')
      expect(result).toEqual([
        { speaker: null, text: 'Introduction text' },
        { speaker: 'Speaker 1', text: 'Hello' },
      ])
    })

    it('does not misidentify colon in middle of text', () => {
      const script = 'Speaker 1: The time is 3:00 PM\nSpeaker 2: Okay'
      const result = parseTranscript(script, speakers, 'dual')
      expect(result).toEqual([
        { speaker: 'Speaker 1', text: 'The time is 3:00 PM' },
        { speaker: 'Speaker 2', text: 'Okay' },
      ])
    })

    it('handles names with special regex characters', () => {
      const specialSpeakers = [
        { name: 'Dr. Smith (PhD)', voiceName: 'Zephyr' },
        { name: 'Ms. Jones', voiceName: 'Puck' },
      ]
      const script = 'Dr. Smith (PhD): Hello\nMs. Jones: Hi there'
      const result = parseTranscript(script, specialSpeakers, 'dual')
      expect(result).toEqual([
        { speaker: 'Dr. Smith (PhD)', text: 'Hello' },
        { speaker: 'Ms. Jones', text: 'Hi there' },
      ])
    })

    it('handles alternating speakers', () => {
      const script = [
        'Speaker 1: First',
        'Speaker 2: Second',
        'Speaker 1: Third',
        'Speaker 2: Fourth',
      ].join('\n')
      const result = parseTranscript(script, speakers, 'dual')
      expect(result).toHaveLength(4)
      expect(result[0]).toEqual({ speaker: 'Speaker 1', text: 'First' })
      expect(result[2]).toEqual({ speaker: 'Speaker 1', text: 'Third' })
    })

    it('skips empty segments', () => {
      const script = 'Speaker 1: \nSpeaker 2: Hello'
      const result = parseTranscript(script, speakers, 'dual')
      expect(result).toEqual([
        { speaker: 'Speaker 2', text: 'Hello' },
      ])
    })

    it('handles only one speaker in dual mode', () => {
      const script = 'Speaker 1: All by myself\nStill talking'
      const result = parseTranscript(script, speakers, 'dual')
      expect(result).toEqual([
        { speaker: 'Speaker 1', text: 'All by myself\nStill talking' },
      ])
    })

    it('handles Chinese speaker names', () => {
      const cnSpeakers = [
        { name: '主持人', voiceName: 'Zephyr' },
        { name: '來賓', voiceName: 'Puck' },
      ]
      const script = '主持人：歡迎收聽\n來賓：謝謝邀請'
      const result = parseTranscript(script, cnSpeakers, 'dual')
      expect(result).toEqual([
        { speaker: '主持人', text: '歡迎收聽' },
        { speaker: '來賓', text: '謝謝邀請' },
      ])
    })

    it('handles speakers with empty names gracefully', () => {
      const badSpeakers = [
        { name: '', voiceName: 'Zephyr' },
        { name: 'Speaker 2', voiceName: 'Puck' },
      ]
      const script = 'Speaker 2: Hello'
      const result = parseTranscript(script, badSpeakers, 'dual')
      expect(result).toEqual([
        { speaker: 'Speaker 2', text: 'Hello' },
      ])
    })

    // --- Inline speaker transitions (no newline) ---
    it('splits inline speakers on the same line', () => {
      const script = 'Speaker 1: 大家好！歡迎來到今天的分享。 Speaker 2: 沒錯！隨著 AI 技術的飛速發展。'
      const result = parseTranscript(script, speakers, 'dual')
      expect(result).toEqual([
        { speaker: 'Speaker 1', text: '大家好！歡迎來到今天的分享。' },
        { speaker: 'Speaker 2', text: '沒錯！隨著 AI 技術的飛速發展。' },
      ])
    })

    it('splits mixed inline and newline speaker transitions', () => {
      const script = 'Speaker 1: Hello. Speaker 2: Yes!\nSpeaker 1: Continue.\nMore text. Speaker 2: End.'
      const result = parseTranscript(script, speakers, 'dual')
      expect(result).toEqual([
        { speaker: 'Speaker 1', text: 'Hello.' },
        { speaker: 'Speaker 2', text: 'Yes!' },
        { speaker: 'Speaker 1', text: 'Continue.\nMore text.' },
        { speaker: 'Speaker 2', text: 'End.' },
      ])
    })

    it('handles inline Chinese speakers with full-width colon', () => {
      const cnSpeakers = [
        { name: '主持人', voiceName: 'Zephyr' },
        { name: '來賓', voiceName: 'Puck' },
      ]
      const script = '主持人：歡迎收聽節目。 來賓：謝謝邀請我來分享。'
      const result = parseTranscript(script, cnSpeakers, 'dual')
      expect(result).toEqual([
        { speaker: '主持人', text: '歡迎收聽節目。' },
        { speaker: '來賓', text: '謝謝邀請我來分享。' },
      ])
    })

    it('does not split on speaker name not preceded by whitespace', () => {
      const script = 'Speaker 1: I metSpeaker 2 yesterday.\nSpeaker 2: Really?'
      const result = parseTranscript(script, speakers, 'dual')
      // "metSpeaker 2" should NOT be split because "Speaker 2" is not preceded by whitespace
      expect(result).toHaveLength(2)
      expect(result[0].speaker).toBe('Speaker 1')
      expect(result[0].text).toContain('metSpeaker 2')
      expect(result[1].speaker).toBe('Speaker 2')
    })
  })
})
