#!/usr/bin/env node
/**
 * Voice Sample Generator for Mediator
 *
 * Generates audio samples for all Google TTS voices with a brief introduction.
 * Progress is logged to JSON for resumption if interrupted.
 *
 * Usage:
 *   GEMINI_API_KEY=xxx node scripts/generate-voice-samples.mjs
 *   GEMINI_API_KEY=xxx node scripts/generate-voice-samples.mjs --voice Puck
 */

import { GoogleGenAI } from '@google/genai'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')

// Output paths
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'public', 'voice-samples')
const PROGRESS_FILE = path.join(OUTPUT_DIR, 'progress.json')

// All voices from voiceOptions.js
const VOICES = [
  { name: 'Zephyr', characteristic: 'Bright', gender: 'female' },
  { name: 'Puck', characteristic: 'Upbeat', gender: 'male' },
  { name: 'Charon', characteristic: 'Informative', gender: 'male' },
  { name: 'Kore', characteristic: 'Firm', gender: 'female' },
  { name: 'Fenrir', characteristic: 'Excitable', gender: 'male' },
  { name: 'Leda', characteristic: 'Youthful', gender: 'female' },
  { name: 'Orus', characteristic: 'Firm', gender: 'male' },
  { name: 'Aoede', characteristic: 'Breezy', gender: 'female' },
  { name: 'Callirrhoe', characteristic: 'Easy-going', gender: 'female' },
  { name: 'Autonoe', characteristic: 'Bright', gender: 'female' },
  { name: 'Enceladus', characteristic: 'Breathy', gender: 'male' },
  { name: 'Iapetus', characteristic: 'Clear', gender: 'male' },
  { name: 'Umbriel', characteristic: 'Easy-going', gender: 'male' },
  { name: 'Algieba', characteristic: 'Smooth', gender: 'male' },
  { name: 'Despina', characteristic: 'Smooth', gender: 'female' },
  { name: 'Erinome', characteristic: 'Clear', gender: 'female' },
  { name: 'Algenib', characteristic: 'Gravelly', gender: 'male' },
  { name: 'Rasalgethi', characteristic: 'Informative', gender: 'male' },
  { name: 'Laomedeia', characteristic: 'Upbeat', gender: 'female' },
  { name: 'Achernar', characteristic: 'Soft', gender: 'female' },
  { name: 'Alnilam', characteristic: 'Firm', gender: 'male' },
  { name: 'Schedar', characteristic: 'Even', gender: 'female' },
  { name: 'Gacrux', characteristic: 'Mature', gender: 'female' },
  { name: 'Pulcherrima', characteristic: 'Forward', gender: 'female' },
  { name: 'Achird', characteristic: 'Friendly', gender: 'male' },
  { name: 'Zubenelgenubi', characteristic: 'Casual', gender: 'male' },
  { name: 'Vindemiatrix', characteristic: 'Gentle', gender: 'female' },
  { name: 'Sadachbia', characteristic: 'Lively', gender: 'male' },
  { name: 'Sadaltager', characteristic: 'Knowledgeable', gender: 'male' },
  { name: 'Sulafat', characteristic: 'Warm', gender: 'female' },
]

/**
 * Generate a script that highlights the voice's characteristic
 */
function generateScript(voice) {
  const { name, characteristic, gender } = voice
  const pronoun = gender === 'male' ? 'his' : 'her'

  // Create characteristic-specific introductions
  const characteristicIntros = {
    Bright: `with a bright and cheerful energy`,
    Upbeat: `bringing upbeat vibes to everything`,
    Informative: `here to keep you informed`,
    Firm: `with a firm and confident tone`,
    Excitable: `and I get excited about great ideas`,
    Youthful: `with a fresh, youthful perspective`,
    Breezy: `keeping things light and breezy`,
    'Easy-going': `with an easy-going, relaxed style`,
    Breathy: `with a soft, breathy delivery`,
    Clear: `bringing you clear and crisp narration`,
    Smooth: `with a smooth, flowing voice`,
    Gravelly: `with a distinctive gravelly texture`,
    Soft: `with a soft and gentle touch`,
    Even: `delivering content with an even, balanced tone`,
    Mature: `with a mature, seasoned perspective`,
    Forward: `with a forward, direct approach`,
    Friendly: `your friendly guide`,
    Casual: `keeping things casual and conversational`,
    Gentle: `with a gentle, soothing presence`,
    Lively: `bringing lively energy to your content`,
    Knowledgeable: `sharing knowledge with confidence`,
    Warm: `wrapping your content in warmth`,
  }

  const intro = characteristicIntros[characteristic] || `with ${pronoun} ${characteristic.toLowerCase()} style`

  return `Hi, I'm ${name}, ${intro}. Welcome to Mediator — your AI creative studio for images, videos, and presentations.`
}

/**
 * Load progress from JSON file
 */
async function loadProgress() {
  try {
    const data = await fs.readFile(PROGRESS_FILE, 'utf-8')
    return JSON.parse(data)
  } catch {
    return { completed: [], failed: [] }
  }
}

/**
 * Save progress to JSON file
 */
async function saveProgress(progress) {
  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  await fs.writeFile(PROGRESS_FILE, JSON.stringify(progress, null, 2))
}

/**
 * Generate audio for a single voice
 */
async function generateVoiceSample(ai, voice) {
  const script = generateScript(voice)

  console.log(`\n[${voice.name}] Generating...`)
  console.log(`  Script: "${script}"`)

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-preview-tts',
    contents: [{ role: 'user', parts: [{ text: script }] }],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voice.name },
        },
      },
    },
  })

  // Extract audio data
  const audioPart = response.candidates?.[0]?.content?.parts?.find(
    (p) => p.inlineData?.mimeType?.startsWith('audio/')
  )

  if (!audioPart?.inlineData) {
    throw new Error('No audio data in TTS response')
  }

  const { data, mimeType } = audioPart.inlineData

  // Determine file extension based on mime type
  const ext = mimeType.includes('wav') ? 'wav' : 'pcm'
  const filename = `${voice.name.toLowerCase()}.${ext}`
  const filepath = path.join(OUTPUT_DIR, filename)

  // Decode base64 and save
  const buffer = Buffer.from(data, 'base64')
  await fs.writeFile(filepath, buffer)

  console.log(`  Saved: ${filepath} (${(buffer.length / 1024).toFixed(1)} KB)`)

  return { filename, mimeType, script, size: buffer.length }
}

/**
 * Main function
 */
async function main() {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('Error: GEMINI_API_KEY environment variable is required')
    process.exit(1)
  }

  // Parse CLI args
  const args = process.argv.slice(2)
  const voiceArgIndex = args.indexOf('--voice')
  const targetVoice = voiceArgIndex !== -1 ? args[voiceArgIndex + 1] : null

  // Filter voices if specific voice requested
  let voicesToProcess = VOICES
  if (targetVoice) {
    const found = VOICES.find((v) => v.name.toLowerCase() === targetVoice.toLowerCase())
    if (!found) {
      console.error(`Error: Voice "${targetVoice}" not found`)
      console.log('Available voices:', VOICES.map((v) => v.name).join(', '))
      process.exit(1)
    }
    voicesToProcess = [found]
  }

  // Ensure output directory exists
  await fs.mkdir(OUTPUT_DIR, { recursive: true })

  // Load progress
  const progress = await loadProgress()

  // Initialize Gemini client
  const ai = new GoogleGenAI({ apiKey })

  console.log('='.repeat(60))
  console.log('Voice Sample Generator for Mediator')
  console.log('='.repeat(60))
  console.log(`Output directory: ${OUTPUT_DIR}`)
  console.log(`Voices to process: ${voicesToProcess.map((v) => v.name).join(', ')}`)
  console.log(`Already completed: ${progress.completed.length}`)
  console.log('='.repeat(60))

  for (const voice of voicesToProcess) {
    // Skip if already completed (unless single voice mode)
    if (!targetVoice && progress.completed.includes(voice.name)) {
      console.log(`\n[${voice.name}] Skipping (already completed)`)
      continue
    }

    try {
      const result = await generateVoiceSample(ai, voice)

      // Update progress
      if (!progress.completed.includes(voice.name)) {
        progress.completed.push(voice.name)
      }
      // Remove from failed if previously failed
      progress.failed = progress.failed.filter((f) => f.name !== voice.name)

      // Save metadata
      if (!progress.metadata) progress.metadata = {}
      progress.metadata[voice.name] = {
        ...voice,
        ...result,
        generatedAt: new Date().toISOString(),
      }

      await saveProgress(progress)

    } catch (error) {
      console.error(`  Error: ${error.message}`)

      // Track failure
      const failedEntry = progress.failed.find((f) => f.name === voice.name)
      if (failedEntry) {
        failedEntry.error = error.message
        failedEntry.attempts = (failedEntry.attempts || 1) + 1
      } else {
        progress.failed.push({ name: voice.name, error: error.message, attempts: 1 })
      }

      await saveProgress(progress)
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log('Summary')
  console.log('='.repeat(60))
  console.log(`Completed: ${progress.completed.length}/${VOICES.length}`)
  if (progress.failed.length > 0) {
    console.log(`Failed: ${progress.failed.map((f) => f.name).join(', ')}`)
  }
  console.log(`Progress saved to: ${PROGRESS_FILE}`)
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
