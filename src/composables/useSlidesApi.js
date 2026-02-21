import { GoogleGenAI } from '@google/genai'
import { useApiKeyManager } from './useApiKeyManager'
import { DEFAULT_TEXT_MODEL } from '@/constants/modelOptions'
import { t } from '@/i18n'

/**
 * JSON Schema for slide style analysis response
 */
const SLIDE_STYLE_SCHEMA = {
  type: 'object',
  properties: {
    globalStyle: {
      type: 'string',
      description:
        'Overall design style recommendation for the entire presentation as a detailed design system (4-6 sentences)',
    },
    pageStyles: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            description: 'The unique identifier of the page',
          },
          styleGuide: {
            type: 'string',
            description:
              'Page-specific style recommendation (1-2 sentences), or empty string if global style is sufficient',
          },
        },
        required: ['pageId', 'styleGuide'],
      },
    },
  },
  required: ['globalStyle', 'pageStyles'],
}

/**
 * JSON Schema for content splitting response
 */
const CONTENT_SPLIT_SCHEMA = {
  type: 'object',
  properties: {
    globalDescription: {
      type: 'string',
      description: 'Overall presentation description (2-3 sentences summarizing the topic)',
    },
    pages: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          pageNumber: {
            type: 'integer',
            description: 'Sequential page number starting from 1',
          },
          content: {
            type: 'string',
            description: 'Content for this specific slide page',
          },
        },
        required: ['pageNumber', 'content'],
      },
    },
  },
  required: ['globalDescription', 'pages'],
}

/**
 * Composable for slides-specific API functions
 * Provides style analysis and content splitting capabilities
 */
export function useSlidesApi() {
  const { callWithFallback } = useApiKeyManager()

  /**
   * Analyze slide content and suggest design styles (global + per-page)
   * Uses JSON mode for structured output with thinking mode for transparency
   * @param {Array<{id: string, pageNumber: number, content: string}>} pages - Pages with ID and content
   * @param {Object} options - Analysis options
   * @param {string} options.model - Model to use (default: DEFAULT_TEXT_MODEL)
   * @param {string} options.styleGuidance - User's style preferences and constraints
   * @param {Function} onThinkingChunk - Callback for streaming thinking chunks
   * @returns {Promise<{globalStyle: string, pageStyles: Array<{pageId: string, styleGuide: string}>}>}
   */
  const analyzeSlideStyle = async (pages, options = {}, onThinkingChunk = null) => {
    const model = options.model || DEFAULT_TEXT_MODEL
    const styleGuidance = options.styleGuidance?.trim() || ''

    // Build content with page IDs
    const pagesContent = pages
      .map((p) => `[Page ID: ${p.id}]\nPage ${p.pageNumber}:\n${p.content}`)
      .join('\n\n---\n\n')

    // Build optional style guidance section
    const styleGuidanceSection = styleGuidance
      ? `
---

## USER STYLE GUIDANCE

The user has provided the following preferences and constraints for the design:

${styleGuidance}

**Important:** You MUST incorporate these preferences into your design recommendations. If the user specifies things they want or don't want, respect those requirements strictly.

`
      : ''

    const analysisPrompt = `# Presentation Design Analysis Task

You are a senior presentation design consultant. Analyze the slide content below and create a comprehensive design system.

---

## INPUT: Slide Content

${pagesContent}
${styleGuidanceSection}
---

## OUTPUT REQUIREMENTS

### 1. Global Style Guide (\`globalStyle\`)

Create a detailed design system (4-6 sentences) that ensures visual consistency across ALL slides. Include:

**Color System:**
- Primary background color (e.g., "clean white #FFFFFF" or "soft cream #F5F5F0")
- Primary accent color with hex code (e.g., "deep navy blue #1a365d")
- Secondary accent color with hex code (e.g., "warm coral #ff6b6b")
- Text colors (heading color, body text color)

**Typography System:**
- Heading font family and weight (e.g., "Inter Bold" or "Montserrat SemiBold")
- Body text font family (e.g., "Open Sans Regular")
- Size hierarchy description (e.g., "large bold titles, medium subheadings, readable body")

**Visual Language:**
- Layout approach (e.g., "left-aligned with generous whitespace", "centered symmetric")
- Shape language (e.g., "rounded corners", "sharp geometric", "organic curves")
- Decorative elements (e.g., "subtle gradients", "line accents", "geometric patterns")
- Icon style if applicable (e.g., "outline icons", "filled minimal icons")

### 2. Page-Specific Styles (\`pageStyles\`)

For EACH page, determine if it needs additional styling:

- **Title slides**: May need larger, bolder treatment
- **Content slides with lists**: Standard styling usually sufficient
- **Chart/Data slides**: Specify data visualization colors and style
- **Quote slides**: May need special typography treatment
- **Image-heavy slides**: Layout considerations for image placement

Return an EMPTY string ("") for \`styleGuide\` if global style is sufficient.

---

## STRICT CONSTRAINTS

⛔ Your style recommendations must NEVER include:
- Page numbers or slide numbers
- Headers or footers
- Date/time stamps
- Company logos (unless content specifically mentions one)

✅ Your style recommendations MUST ensure:
- **Exact color consistency** - same hex codes reused across all slides
- **Typography consistency** - same fonts for same content types
- **Visual coherence** - slides look like they belong together

---

## OUTPUT FORMAT

Return valid JSON matching this structure:
\`\`\`json
{
  "globalStyle": "Detailed 4-6 sentence design system description...",
  "pageStyles": [
    { "pageId": "ab12", "styleGuide": "" },
    { "pageId": "xy9k", "styleGuide": "Special styling for this page..." }
  ]
}
\`\`\`

⚠️ **CRITICAL - Page ID Verification:**
- Each page has a unique ID shown as \`[Page ID: xxxx]\` in the input (typically 4 characters)
- You MUST copy the **EXACT** page ID character-by-character into your response
- **Before finalizing**, verify each \`pageId\` in your output matches the corresponding \`[Page ID: xxxx]\` from input
- A single wrong character will cause the style to be lost for that page

Write all descriptions in English.`

    try {
      // Use callWithFallback: Free Tier first, then paid key on quota error
      return await callWithFallback(async (apiKey) => {
        const ai = new GoogleGenAI({ apiKey })

        // Use streaming to capture thinking process
        const response = await ai.models.generateContentStream({
          model,
          contents: [{ role: 'user', parts: [{ text: analysisPrompt }] }],
          config: {
            temperature: 0.3, // Low temperature for consistency
            responseMimeType: 'application/json',
            responseSchema: SLIDE_STYLE_SCHEMA,
            thinkingConfig: {
              includeThoughts: true,
            },
          },
        })

        // Process stream
        let textResponse = ''

        for await (const chunk of response) {
          if (chunk.candidates?.[0]?.content?.parts) {
            for (const part of chunk.candidates[0].content.parts) {
              if (part.text) {
                if (part.thought) {
                  // Thinking content - stream to callback
                  if (onThinkingChunk) {
                    onThinkingChunk(part.text)
                  }
                } else {
                  // Final response text (JSON)
                  textResponse += part.text
                }
              }
            }
          }
        }

        // Parse JSON response
        try {
          const parsed = JSON.parse(textResponse.trim())
          // Validate structure
          if (!parsed.globalStyle || !Array.isArray(parsed.pageStyles)) {
            throw new Error('Invalid response structure')
          }
          return parsed
        } catch (parseErr) {
          // Fallback: if JSON parsing fails, use raw text as global style
          console.warn('JSON parse failed, using fallback:', parseErr)
          return {
            globalStyle: textResponse.trim() || 'Professional presentation design',
            pageStyles: pages.map((p) => ({ pageId: p.id, styleGuide: '' })),
          }
        }
      }, 'text')
    } catch (err) {
      throw new Error(t('slides.analyzeFailed') + ': ' + err.message)
    }
  }

  /**
   * Split raw content into presentation pages using AI
   * Uses JSON mode for structured output with thinking mode for transparency
   * @param {string} rawContent - Raw material to split
   * @param {Object} options
   * @param {string} options.model - Model to use (from TEXT_MODELS)
   * @param {number} options.targetPages - Target number of pages (1-30)
   * @param {string} options.additionalNotes - Additional instructions
   * @param {Function} onThinkingChunk - Callback for thinking chunks
   * @returns {Promise<{globalDescription: string, pages: Array<{pageNumber: number, content: string}>}>}
   */
  const splitSlidesContent = async (rawContent, options = {}, onThinkingChunk = null) => {
    const model = options.model || DEFAULT_TEXT_MODEL
    const targetPages = options.targetPages || 10
    const additionalNotes = options.additionalNotes?.trim() || ''

    const additionalSection = additionalNotes
      ? `
## ADDITIONAL INSTRUCTIONS
${additionalNotes}
`
      : ''

    const splitPrompt = `# Presentation Content Splitting Task

You are a professional presentation designer and content strategist. Your task is to analyze the raw material below and split it into a well-structured presentation.

---

## INPUT: Raw Material

${rawContent}
${additionalSection}
---

## OUTPUT REQUIREMENTS

Create a presentation with **exactly ${targetPages} pages**.

### Global Description
Write a 2-3 sentence overview that captures:
- The main topic/theme of the presentation
- The target audience or purpose
- The overall tone (professional, educational, casual, etc.)

### Page Content Guidelines
For each page, create content that:
1. **Is self-contained** - Each page should make sense on its own
2. **Follows logical flow** - Pages should progress naturally from introduction to conclusion
3. **Has clear focus** - Each page addresses ONE main point or concept
4. **Is presentation-ready** - Content should be suitable for visual slides (not paragraphs of text)

### Content Structure Suggestions
- **Page 1**: Title/Introduction
- **Pages 2-${targetPages - 1}**: Main content, key points, examples, data
- **Page ${targetPages}**: Summary/Conclusion/Call-to-action

### Formatting Guidelines
- Use bullet points for lists
- Keep text concise (aim for 3-5 bullet points per page)
- Include suggestions for visuals where appropriate (e.g., "[Chart: Sales growth]")
- Avoid long paragraphs

---

Write all content in the same language as the input material.`

    try {
      // Use callWithFallback: Free Tier first, then paid key on quota error
      return await callWithFallback(async (apiKey) => {
        const ai = new GoogleGenAI({ apiKey })

        const response = await ai.models.generateContentStream({
          model,
          contents: [{ role: 'user', parts: [{ text: splitPrompt }] }],
          config: {
            temperature: 0.5,
            responseMimeType: 'application/json',
            responseSchema: CONTENT_SPLIT_SCHEMA,
            thinkingConfig: {
              includeThoughts: true,
            },
          },
        })

        // Process stream
        let textResponse = ''

        for await (const chunk of response) {
          if (chunk.candidates?.[0]?.content?.parts) {
            for (const part of chunk.candidates[0].content.parts) {
              if (part.text) {
                if (part.thought) {
                  // Thinking content - stream to callback
                  if (onThinkingChunk) {
                    onThinkingChunk(part.text)
                  }
                } else {
                  // Final response text (JSON)
                  textResponse += part.text
                }
              }
            }
          }
        }

        // Parse JSON response
        try {
          const parsed = JSON.parse(textResponse.trim())
          // Validate structure
          if (!parsed.globalDescription || !Array.isArray(parsed.pages)) {
            throw new Error('Invalid response structure')
          }
          return parsed
        } catch (parseErr) {
          console.warn('JSON parse failed in splitSlidesContent:', parseErr)
          throw new Error(t('slides.contentSplitter.error'))
        }
      }, 'text')
    } catch (err) {
      // Avoid duplicating i18n messages if err.message is already localized
      throw new Error(err.message || t('slides.contentSplitter.error'))
    }
  }

  return {
    analyzeSlideStyle,
    splitSlidesContent,
  }
}
