/**
 * Parse narration script text into segments with optional speaker attribution.
 *
 * @param {string} script - Raw script text (may contain speaker prefixes)
 * @param {Array<{name: string}>} speakers - Speaker list from narration settings
 * @param {string} speakerMode - 'single' or 'dual'
 * @returns {Array<{speaker: string|null, text: string}>} Parsed segments
 */
export function parseTranscript(script, speakers, speakerMode) {
  if (!script || typeof script !== 'string') return []

  const trimmed = script.trim()
  if (!trimmed) return []

  if (speakerMode !== 'dual' || !speakers?.length) {
    return parseSingleMode(trimmed, speakers)
  }

  return parseDualMode(trimmed, speakers)
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Single speaker mode: strip leading speaker label if present, return one segment.
 */
function parseSingleMode(text, speakers) {
  let cleaned = text

  if (speakers?.length) {
    for (const s of speakers) {
      if (!s.name) continue
      const pattern = new RegExp(`^${escapeRegExp(s.name)}\\s*[:：]\\s*`, '')
      if (pattern.test(cleaned)) {
        cleaned = cleaned.replace(pattern, '')
        break
      }
    }
  }

  cleaned = cleaned.trim()
  return cleaned ? [{ speaker: null, text: cleaned }] : []
}

/**
 * Dual speaker mode: scan entire text for known speaker prefixes and split into segments.
 *
 * Handles both newline-separated and inline speaker transitions (e.g. LLM output
 * that puts "Speaker 2:" in the middle of a line without a preceding newline).
 */
function parseDualMode(text, speakers) {
  const names = speakers.map((s) => s.name).filter(Boolean)
  if (names.length === 0) return [{ speaker: null, text }]

  // Build global regex to find all speaker prefix occurrences in the entire text.
  // Matches: SpeakerName + optional whitespace + colon (half or full width) + optional whitespace
  const namesPattern = names.map(escapeRegExp).join('|')
  const prefixRegex = new RegExp(`(${namesPattern})\\s*[:：]\\s*`, 'g')

  // Find all valid speaker prefix positions
  const splitPoints = []
  let match
  while ((match = prefixRegex.exec(text)) !== null) {
    const pos = match.index
    // A valid speaker position: at start of text, preceded by whitespace,
    // or preceded by sentence-ending punctuation (CJK and Western).
    // This prevents false matches mid-word (e.g. "metSpeaker 2") while allowing
    // splits after "。Speaker 2:" which LLMs often generate without a space.
    if (pos === 0 || /[\s.。!！?？,，;；)）\]】》」』>]/.test(text[pos - 1])) {
      splitPoints.push({
        speaker: match[1],
        matchStart: pos,
        textStart: pos + match[0].length,
      })
    }
  }

  if (splitPoints.length === 0) {
    const t = text.trim()
    return t ? [{ speaker: null, text: t }] : []
  }

  const segments = []

  // Text before the first speaker prefix
  if (splitPoints[0].matchStart > 0) {
    const before = text.slice(0, splitPoints[0].matchStart).trim()
    if (before) segments.push({ speaker: null, text: before })
  }

  // Each speaker segment runs from its textStart to the next matchStart
  for (let i = 0; i < splitPoints.length; i++) {
    const end = i + 1 < splitPoints.length ? splitPoints[i + 1].matchStart : text.length
    const segText = text.slice(splitPoints[i].textStart, end).trim()
    if (segText) {
      segments.push({ speaker: splitPoints[i].speaker, text: segText })
    }
  }

  return segments
}
