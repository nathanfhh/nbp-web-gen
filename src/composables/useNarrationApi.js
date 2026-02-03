import { GoogleGenAI } from '@google/genai'
import { useApiKeyManager } from './useApiKeyManager'
import { useGeneratorStore } from '@/stores/generator'
import { convertTtsResponseToAudio } from '@/utils/audioEncoder'
import { getLanguageDirectives } from '@/constants/voiceOptions'
import { t } from '@/i18n'
import { createMinIntervalLimiter } from './requestScheduler'
import { TTS_MIN_START_INTERVAL_MS } from '@/constants'

// Module-level singleton for TTS rate limiting
// TTS API limit is 10 RPM, so minimum 6 seconds between request starts
const ttsStartLimiter = createMinIntervalLimiter({
  minIntervalMs: TTS_MIN_START_INTERVAL_MS,
})

/**
 * JSON Schema for narration script generation
 */
const NARRATION_SCRIPT_SCHEMA = {
  type: 'object',
  properties: {
    globalStyleDirective: {
      type: 'string',
      description:
        'Overall narration style and tone direction for the entire presentation. This will be prepended to every TTS call as voice direction.',
    },
    pageScripts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            description: 'The exact page ID from input (copy character-by-character)',
          },
          styleDirective: {
            type: 'string',
            description:
              'Page-specific voice direction (e.g., enthusiastic for intro, analytical for data, reflective for conclusion)',
          },
          script: {
            type: 'string',
            description:
              'Full narration script with Speaker labels (e.g., "Speaker 1: ..." or "Alice: ...")',
          },
        },
        required: ['pageId', 'styleDirective', 'script'],
      },
    },
  },
  required: ['globalStyleDirective', 'pageScripts'],
}

/**
 * Style descriptions for narration prompt
 */
const STYLE_DESCRIPTIONS = {
  discussion:
    'Both speakers collaborate naturally, building on each other\'s points. One introduces concepts, the other adds insights, examples, or asks clarifying questions. The tone is conversational and supportive.',
  critical:
    'One speaker presents the content while the other offers constructive criticism, pointing out limitations or alternative perspectives (up to 3 challenges per page). The critic should be thoughtful, not hostile.',
  debate:
    'One speaker presents a position from the slides, while the other challenges assumptions and offers counterarguments (up to 3 per page). The presenter defends their points. Both remain professional and respectful.',
}

/**
 * Composable for narration script generation and TTS audio
 */
export function useNarrationApi() {
  const { callWithFallback } = useApiKeyManager()
  const store = useGeneratorStore()

  /**
   * Build the narration script generation prompt
   */
  const buildNarrationPrompt = (pages, settings) => {
    const speakerSetup =
      settings.speakerMode === 'dual'
        ? `- Mode: Dual speakers
- Speaker 1: ${settings.speakers[0].name} (Voice: ${settings.speakers[0].voiceName})
- Speaker 2: ${settings.speakers[1].name} (Voice: ${settings.speakers[1].voiceName})`
        : `- Mode: Single speaker
- Speaker: ${settings.speakers[0].name} (Voice: ${settings.speakers[0].voiceName})`

    const styleDesc = STYLE_DESCRIPTIONS[settings.style] || STYLE_DESCRIPTIONS.discussion

    const customSection = settings.customPrompt?.trim()
      ? `\n## Additional Guidance\n${settings.customPrompt.trim()}\n`
      : ''

    const pagesContent = pages
      .map((p) => `[Page ID: ${p.id}]\nPage ${p.pageNumber}:\n${p.content}`)
      .join('\n\n---\n\n')

    const langDirectives = getLanguageDirectives(settings.language, settings.customLanguages)

    return `# Presentation Narration Script Generation

## Speaker Setup
${speakerSetup}

## Style: ${settings.style.charAt(0).toUpperCase() + settings.style.slice(1)}
${styleDesc}

## Language
${langDirectives.scriptInstruction}
The speaker names should remain as-is (not translated).

${customSection}
## Slide Content

${pagesContent}

---

## Output Requirements

### globalStyleDirective
Write a concise overall voice direction (1-2 sentences) that describes the general tone, pace, and energy for the entire narration. This will be sent to the TTS engine as voice styling guidance.

### pageScripts
For EACH page, provide:
1. **styleDirective**: A brief voice direction specific to this page's content (e.g., "enthusiastic and welcoming" for intro, "analytical with measured pace" for data, "reflective and summarizing" for conclusion)
2. **script**: The full narration script with speaker labels

Script format:
${
  settings.speakerMode === 'dual'
    ? `- Use "${settings.speakers[0].name}:" and "${settings.speakers[1].name}:" labels
- Alternate naturally between speakers
- Each speaker should have substantive things to say`
    : `- Use "${settings.speakers[0].name}:" label
- Maintain a natural, engaging monologue style`
}

### Narrative Structure
${
  pages.length === 1
    ? `- This is a single-page presentation. The script should open with a brief, engaging introduction that sets the context, then deliver the main content, and close with a concise concluding remark or call-to-action.`
    : `- **First page**: Open with a cohesive introduction — greet the audience, set the topic, and preview what the presentation will cover. Make it inviting and set the tone for the entire presentation.
- **Middle pages**: Deliver the content naturally, maintaining flow between pages.
- **Last page**: Conclude with a strong closing statement — summarize key takeaways, offer a final insight, or provide a call-to-action. Signal clearly that the presentation is wrapping up.`
}

⚠️ **CRITICAL - Page ID Verification:**
- Each page has a unique ID shown as \`[Page ID: xxxx]\` in the input
- You MUST copy the **EXACT** page ID character-by-character into your response
- Every page MUST have a corresponding script entry
- Before finalizing, verify each pageId matches the input exactly`
  }

  /**
   * Call script generation API with streaming and return parsed JSON
   * @param {Array} pages - Pages to generate scripts for
   * @param {Object} settings - Narration settings
   * @param {string} model - Model name
   * @param {number} temperature - Temperature value
   * @param {Function} onThinkingChunk - Thinking callback
   * @returns {Promise<Object>} Parsed JSON response
   */
  const callScriptGeneration = async (pages, settings, model, temperature, onThinkingChunk) => {
    return callWithFallback(async (apiKey) => {
      const ai = new GoogleGenAI({ apiKey })
      const prompt = buildNarrationPrompt(pages, settings)

      const response = await ai.models.generateContentStream({
        model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          temperature,
          responseMimeType: 'application/json',
          responseSchema: NARRATION_SCRIPT_SCHEMA,
          thinkingConfig: {
            includeThoughts: true,
          },
        },
      })

      let textResponse = ''
      for await (const chunk of response) {
        if (chunk.candidates?.[0]?.content?.parts) {
          for (const part of chunk.candidates[0].content.parts) {
            if (part.text) {
              if (part.thought) {
                onThinkingChunk?.(part.text)
              } else {
                textResponse += part.text
              }
            }
          }
        }
      }

      return JSON.parse(textResponse.trim())
    }, 'text')
  }

  /**
   * Generate narration scripts for all pages with retry for missing pages
   * @param {Array} pages - Array of { id, pageNumber, content }
   * @param {Object} settings - Narration settings
   * @param {Function} onThinkingChunk - Callback for streaming thinking chunks
   * @param {number} maxRetries - Maximum retry attempts for missing pages
   * @returns {Promise<Object>} { globalStyleDirective, pageScripts }
   */
  const generateNarrationScripts = async (
    pages,
    settings,
    onThinkingChunk = null,
    maxRetries = 2,
  ) => {
    const model = settings.scriptModel || 'gemini-3-flash-preview'
    const temperature = store.temperature

    const result = await callScriptGeneration(pages, settings, model, temperature, onThinkingChunk)

    if (!result.globalStyleDirective || !Array.isArray(result.pageScripts)) {
      throw new Error('Invalid narration script response structure')
    }

    // Retry for missing pages
    let attempt = 0
    while (attempt < maxRetries) {
      const allPageIds = pages.map((p) => p.id)
      const missingPageIds = allPageIds.filter(
        (id) => !result.pageScripts.find((s) => s.pageId === id),
      )

      if (missingPageIds.length === 0) break

      attempt++
      onThinkingChunk?.(
        `\n${t('slides.narration.retrying', { attempt })} ${t('slides.narration.missingScripts', { pages: missingPageIds.join(', ') })}\n`,
      )

      const missingPages = pages.filter((p) => missingPageIds.includes(p.id))

      try {
        const retryResult = await callScriptGeneration(
          missingPages, settings, model, temperature, onThinkingChunk,
        )

        // Merge retry results
        if (retryResult.pageScripts) {
          result.pageScripts.push(...retryResult.pageScripts)
        }
      } catch (retryErr) {
        console.warn(`Retry attempt ${attempt} failed:`, retryErr)
      }
    }

    return result
  }

  /**
   * Generate TTS audio for a single page
   * @param {string} globalStyleDirective - Overall style guidance
   * @param {string} pageStyleDirective - Page-specific style guidance
   * @param {string} script - The narration script text
   * @param {Object} settings - Narration settings (ttsModel, speakers, speakerMode)
   * @returns {Promise<{ blob: Blob, mimeType: string }>}
   */
  const generatePageAudio = async (
    globalStyleDirective,
    pageStyleDirective,
    script,
    settings,
  ) => {
    // Acquire rate limiter slot before making API call
    // This ensures requests are spaced at least 6 seconds apart (10 RPM limit)
    await ttsStartLimiter.acquire()

    const ttsModel = settings.ttsModel || 'gemini-2.5-flash-preview-tts'

    // Build TTS prompt with style directives and language-specific accent
    const langDirectives = getLanguageDirectives(settings.language, settings.customLanguages)

    const ttsPrompt = [globalStyleDirective, pageStyleDirective, langDirectives.accentDirective, script].filter(Boolean).join('\n\n')

    // Determine voice config based on speaker mode
    const speechConfig =
      settings.speakerMode === 'dual'
        ? {
            multiSpeakerVoiceConfig: {
              speakerVoiceConfigs: [
                {
                  speaker: settings.speakers[0].name,
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: settings.speakers[0].voiceName },
                  },
                },
                {
                  speaker: settings.speakers[1].name,
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: settings.speakers[1].voiceName },
                  },
                },
              ],
            },
          }
        : {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: settings.speakers[0].voiceName },
            },
          }

    const result = await callWithFallback(async (apiKey) => {
      const ai = new GoogleGenAI({ apiKey })

      const response = await ai.models.generateContent({
        model: ttsModel,
        contents: [{ role: 'user', parts: [{ text: ttsPrompt }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig,
        },
      })

      // Extract audio data from response
      const audioPart = response.candidates?.[0]?.content?.parts?.find(
        (p) => p.inlineData?.mimeType?.startsWith('audio/'),
      )

      if (!audioPart?.inlineData) {
        throw new Error('No audio data in TTS response')
      }

      const { data, mimeType } = audioPart.inlineData

      // Convert PCM to compressed audio (Opus → MP3 → WAV fallback)
      return await convertTtsResponseToAudio(data, mimeType)
    }, 'text')

    return result
  }

  return {
    generateNarrationScripts,
    generatePageAudio,
  }
}
