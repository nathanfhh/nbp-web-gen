/**
 * OpenAI Text-to-Speech adapter.
 *
 * - generateSpeechOpenAI: single-voice /audio/speech call; returns a Blob.
 * - parseSpeakerSegments: pure, splits a script into per-speaker spans.
 * - generateMultiSpeakerOpenAI: orchestrates per-segment calls and stitches
 *   the resulting audio into one Blob using AudioContext decode + re-encode.
 *
 * OpenAI TTS has no native multi-speaker endpoint; client-side stitching is
 * the only way to keep UX parity with Gemini's multiSpeakerVoiceConfig.
 */

import { openaiFetch } from './openaiClient'

const DEFAULT_FORMAT = 'mp3'

export async function generateSpeechOpenAI({
  apiKey,
  model,
  input,
  voice,
  instructions,
  format = DEFAULT_FORMAT,
  signal,
}) {
  const body = { model, input, voice, response_format: format }
  if (instructions) body.instructions = instructions

  const response = await openaiFetch('/audio/speech', {
    apiKey,
    method: 'POST',
    body,
    signal,
  })

  const blob = await response.blob()
  const mimeType = blob.type || `audio/${format === 'mp3' ? 'mpeg' : format}`
  return { blob, mimeType }
}

/**
 * Split a two-or-one-speaker transcript into ordered segments. The transcript
 * is expected to use "SpeakerName:" prefixes on lines, matching the Gemini
 * narration prompt contract.
 *
 * @param {string} script
 * @param {string[]} speakerNames - names as they appear in the script
 * @returns {Array<{ speaker: string, text: string }>}
 */
export function parseSpeakerSegments(script, speakerNames = []) {
  if (!script) return []
  const trimmed = script.trim()
  if (speakerNames.length === 0) {
    return trimmed ? [{ speaker: null, text: trimmed }] : []
  }

  const escaped = speakerNames
    .filter(Boolean)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (escaped.length === 0) {
    return trimmed ? [{ speaker: null, text: trimmed }] : []
  }

  const labelRegex = new RegExp(`(^|\\n)\\s*(${escaped.join('|')})\\s*:\\s*`, 'g')
  const segments = []
  const matches = [...trimmed.matchAll(labelRegex)]

  if (matches.length === 0) {
    return [{ speaker: speakerNames[0], text: trimmed }]
  }

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]
    const speaker = match[2]
    const startOfText = match.index + match[0].length
    const endOfText = i + 1 < matches.length ? matches[i + 1].index : trimmed.length
    const text = trimmed.slice(startOfText, endOfText).trim()
    if (text) segments.push({ speaker, text })
  }

  return segments
}

function concatAudioBuffers(audioContext, buffers) {
  const numChannels = Math.max(1, ...buffers.map((b) => b.numberOfChannels))
  const sampleRate = buffers[0].sampleRate
  const totalLength = buffers.reduce((sum, b) => sum + b.length, 0)
  const out = audioContext.createBuffer(numChannels, totalLength, sampleRate)

  for (let ch = 0; ch < numChannels; ch++) {
    const outChannel = out.getChannelData(ch)
    let offset = 0
    for (const buf of buffers) {
      const source = buf.numberOfChannels > ch ? buf.getChannelData(ch) : buf.getChannelData(0)
      outChannel.set(source, offset)
      offset += buf.length
    }
  }
  return out
}

/**
 * Encode an AudioBuffer into a 16-bit PCM WAV Blob.
 */
function audioBufferToWavBlob(buffer) {
  const numChannels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const samples = buffer.length * numChannels
  const bytesPerSample = 2
  const byteRate = sampleRate * numChannels * bytesPerSample
  const blockAlign = numChannels * bytesPerSample
  const dataSize = samples * bytesPerSample
  const totalSize = 44 + dataSize

  const ab = new ArrayBuffer(totalSize)
  const view = new DataView(ab)

  const writeString = (offset, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }

  writeString(0, 'RIFF')
  view.setUint32(4, totalSize - 8, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true) // PCM chunk size
  view.setUint16(20, 1, true) // PCM format
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true) // bits per sample
  writeString(36, 'data')
  view.setUint32(40, dataSize, true)

  const interleave = numChannels > 1
  const channelData = []
  for (let ch = 0; ch < numChannels; ch++) {
    channelData.push(buffer.getChannelData(ch))
  }

  let offset = 44
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channelData[interleave ? ch : 0][i]))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      offset += 2
    }
  }

  return new Blob([ab], { type: 'audio/wav' })
}

/**
 * Generate multi-speaker audio by calling OpenAI per segment and stitching
 * the results into a single WAV Blob.
 *
 * Requires a main-thread AudioContext (decodeAudioData is not worker-safe
 * in most browsers). Callers in the main thread can pass their own context
 * or rely on the default one created here.
 *
 * @returns {Promise<{ blob: Blob, mimeType: string, segmentCount: number }>}
 */
export async function generateMultiSpeakerOpenAI({
  apiKey,
  model,
  script,
  speakers,
  instructions,
  signal,
  audioContext,
}) {
  const names = speakers.map((s) => s.name)
  const voiceByName = new Map(speakers.map((s) => [s.name, s.voice]))
  const segments = parseSpeakerSegments(script, names)

  if (segments.length === 0) {
    throw new Error('No speaker segments parsed from script')
  }

  const ownCtx = !audioContext
   
  const ctx = audioContext || new (globalThis.AudioContext || globalThis.webkitAudioContext)()

  try {
    const buffers = []
    for (const { speaker, text } of segments) {
      const voice = voiceByName.get(speaker) || speakers[0].voice
      const { blob } = await generateSpeechOpenAI({
        apiKey,
        model,
        input: text,
        voice,
        instructions,
        format: 'mp3',
        signal,
      })
      const arrayBuffer = await blob.arrayBuffer()
      const decoded = await ctx.decodeAudioData(arrayBuffer)
      buffers.push(decoded)
    }

    const combined = concatAudioBuffers(ctx, buffers)
    const wavBlob = audioBufferToWavBlob(combined)
    return {
      blob: wavBlob,
      mimeType: 'audio/wav',
      segmentCount: segments.length,
    }
  } finally {
    if (ownCtx) {
      try {
        await ctx.close()
      } catch {
        // closing can throw on some browsers if already closed
      }
    }
  }
}
