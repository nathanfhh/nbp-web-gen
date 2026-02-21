import { ref } from 'vue'
import { GoogleGenAI } from '@google/genai'
import { useApiKeyManager } from './useApiKeyManager'
import { DEFAULT_TEXT_MODEL } from '@/constants/modelOptions'
import { useGeneratorStore } from '@/stores/generator'

/**
 * Composable for Google Gemini Agentic Vision API
 *
 * Uses DEFAULT_TEXT_MODEL (currently gemini-3-flash-preview) with:
 * - tools: [{ codeExecution: {} }] for code execution capability
 * - thinkingConfig: { includeThoughts: true } for reasoning visibility
 *
 * Output types: text, thought, executableCode, codeExecutionResult, inlineData
 */
export function useAgentApi() {
  const { getApiKey, callWithFallback } = useApiKeyManager()
  const store = useGeneratorStore()

  const isStreaming = ref(false)
  const currentChatSession = ref(null)

  /**
   * Parse a part from the Gemini response into our internal format
   * @param {Object} part - Part from Gemini response
   * @returns {Object} Parsed part with type and content
   *
   * Gemini response structure:
   * - Thought: { text: "content", thought: true }
   * - Text: { text: "content" } or { text: "content", thought: false }
   * - Code: { executableCode: { language: "PYTHON", code: "..." } }
   * - Result: { codeExecutionResult: { outcome: "OUTCOME_OK", output: "..." } }
   * - Image: { inlineData: { mimeType: "image/png", data: "base64..." } }
   */
  const parsePart = (part) => {
    // Text or Thought content - check thought flag first
    if (part.text !== undefined) {
      // thought: true means this is a thinking/reasoning part
      if (part.thought === true) {
        return {
          type: 'thought',
          content: part.text,
        }
      }
      // Otherwise it's regular text
      return {
        type: 'text',
        content: part.text,
      }
    }

    // Executable code
    if (part.executableCode) {
      return {
        type: 'code',
        language: part.executableCode.language || 'python',
        content: part.executableCode.code,
      }
    }

    // Code execution result
    if (part.codeExecutionResult) {
      return {
        type: 'codeResult',
        outcome: part.codeExecutionResult.outcome,
        output: part.codeExecutionResult.output,
      }
    }

    // Inline data (generated image)
    if (part.inlineData) {
      return {
        type: 'generatedImage',
        mimeType: part.inlineData.mimeType,
        data: part.inlineData.data,
      }
    }

    // Function call (for future extensibility)
    if (part.functionCall) {
      return {
        type: 'functionCall',
        name: part.functionCall.name,
        args: part.functionCall.args,
      }
    }

    // Function response
    if (part.functionResponse) {
      return {
        type: 'functionResponse',
        name: part.functionResponse.name,
        response: part.functionResponse.response,
      }
    }

    // Unknown part type
    return {
      type: 'unknown',
      raw: part,
    }
  }

  /**
   * Build chat history in Gemini SDK format from our conversation
   * @param {Array} messages - Our conversation messages
   * @param {number} contextDepth - Number of message pairs to include
   * @param {boolean} includeImages - Whether to include images in history
   * @returns {Array} History in Gemini format
   */
  const buildChatHistory = (messages, contextDepth, includeImages = false) => {
    // Take last N*2 messages (each exchange has user + model)
    const recentMessages = messages.slice(-(contextDepth * 2))

    return recentMessages.map((msg) => ({
      role: msg.role,
      parts: msg.parts
        .filter((part) => {
          // Exclude thoughts - they're internal reasoning, not relevant for context
          if (part.type === 'thought') return false
          // Optionally exclude images to save tokens
          if ((part.type === 'image' || part.type === 'generatedImage') && !includeImages) return false
          return true
        })
        .map((part) => {
          // Convert our internal format back to Gemini format
          switch (part.type) {
            case 'text':
              return { text: part.content }
            case 'code':
              return { executableCode: { language: part.language, code: part.content } }
            case 'codeResult':
              return { codeExecutionResult: { outcome: part.outcome, output: part.output } }
            case 'image':
            case 'generatedImage':
              return { inlineData: { mimeType: part.mimeType, data: part.data } }
            default:
              return { text: part.content || '' }
          }
        }),
    })).filter((msg) => msg.parts.length > 0) // Remove empty messages
  }

  /**
   * Build message parts for Gemini API
   * @param {string} text - User text input
   * @param {Array} images - Array of { data: base64, mimeType } objects
   * @returns {Array} Parts array for Gemini API
   */
  const buildMessageParts = (text, images = []) => {
    const parts = []

    // Add images first (order matters for some models)
    for (const img of images) {
      parts.push({
        inlineData: {
          mimeType: img.mimeType,
          data: img.data,
        },
      })
    }

    // Add text
    if (text && text.trim()) {
      parts.push({ text: text.trim() })
    }

    return parts
  }

  /**
   * Send a message and stream the response
   * @param {string} text - User text input
   * @param {Array} images - Array of { data: base64, mimeType } objects
   * @param {Object} callbacks - { onPart, onComplete, onError }
   */
  const sendMessageStream = async (text, images = [], callbacks = {}) => {
    const { onPart, onComplete, onError } = callbacks

    isStreaming.value = true

    try {
      const apiKey = getApiKey('text') // Use text usage for potential free tier fallback
      if (!apiKey) {
        throw new Error('API key not set')
      }

      const ai = new GoogleGenAI({ apiKey })
      const contextDepth = store.agentOptions.contextDepth || 5

      // Build history from existing conversation
      const history = buildChatHistory(store.agentConversation, contextDepth)

      // Create chat session with Agentic Vision config
      const chat = ai.chats.create({
        model: DEFAULT_TEXT_MODEL,
        history,
        config: {
          tools: [{ codeExecution: {} }],
          thinkingConfig: { includeThoughts: true },
          temperature: store.temperature,
        },
      })

      currentChatSession.value = chat

      // Build message parts
      const messageParts = buildMessageParts(text, images)

      // Accumulated parts for the complete message
      const accumulatedParts = []

      // Stream the response
      const response = await chat.sendMessageStream({ message: messageParts })

      for await (const chunk of response) {
        // Process each candidate
        if (chunk.candidates && chunk.candidates.length > 0) {
          for (const candidate of chunk.candidates) {
            if (candidate.content && candidate.content.parts) {
              for (const part of candidate.content.parts) {
                const parsedPart = parsePart(part)
                accumulatedParts.push(parsedPart)

                // Callback for real-time updates
                if (onPart) {
                  onPart(parsedPart, accumulatedParts)
                }
              }
            }
          }
        }
      }

      // Call completion callback
      if (onComplete) {
        onComplete(accumulatedParts)
      }

      return accumulatedParts
    } catch (error) {
      console.error('[Agent API] Error:', error)
      if (onError) {
        onError(error)
      }
      throw error
    } finally {
      isStreaming.value = false
      currentChatSession.value = null
    }
  }

  /**
   * Send a message with automatic retry/fallback
   * Wraps sendMessageStream with API key fallback handling
   * @param {string} text - User text input
   * @param {Array} images - Array of { data: base64, mimeType } objects
   * @param {Object} callbacks - { onPart, onComplete, onError, conversation }
   * @param {Array} callbacks.conversation - Optional conversation snapshot to use for history
   *   (pass this to avoid including the current message in history)
   */
  const sendMessageWithFallback = async (text, images = [], callbacks = {}) => {
    const { onPart, onComplete, onError, conversation } = callbacks

    return await callWithFallback(async (apiKey) => {
      const ai = new GoogleGenAI({ apiKey })
      const contextDepth = store.agentOptions.contextDepth || 5

      isStreaming.value = true

      try {
        // Use provided conversation snapshot or fall back to store
        const conversationForHistory = conversation || store.agentConversation
        const includeImages = store.agentOptions.includeImagesInContext ?? false
        const history = buildChatHistory(conversationForHistory, contextDepth, includeImages)

        const chat = ai.chats.create({
          model: DEFAULT_TEXT_MODEL,
          history,
          config: {
            tools: [{ codeExecution: {} }],
            thinkingConfig: { includeThoughts: true },
            temperature: store.temperature,
          },
        })

        currentChatSession.value = chat

        const messageParts = buildMessageParts(text, images)
        const accumulatedParts = []

        /**
         * Merge or append a part to accumulatedParts
         * Consecutive text/thought parts are merged into one
         */
        const mergeOrAppendPart = (parsedPart) => {
          const lastPart = accumulatedParts[accumulatedParts.length - 1]

          // Merge consecutive text parts
          if (
            parsedPart.type === 'text' &&
            lastPart?.type === 'text'
          ) {
            lastPart.content += parsedPart.content
            return
          }

          // Merge consecutive thought parts
          if (
            parsedPart.type === 'thought' &&
            lastPart?.type === 'thought'
          ) {
            lastPart.content += parsedPart.content
            return
          }

          // Otherwise, append as new part
          accumulatedParts.push(parsedPart)
        }

        const response = await chat.sendMessageStream({ message: messageParts })

        for await (const chunk of response) {
          if (chunk.candidates && chunk.candidates.length > 0) {
            for (const candidate of chunk.candidates) {
              if (candidate.content && candidate.content.parts) {
                for (const part of candidate.content.parts) {
                  const parsedPart = parsePart(part)
                  mergeOrAppendPart(parsedPart)

                  if (onPart) {
                    onPart(parsedPart, accumulatedParts)
                  }
                }
              }
            }
          }
        }

        if (onComplete) {
          onComplete(accumulatedParts)
        }

        return accumulatedParts
      } catch (error) {
        if (onError) {
          onError(error)
        }
        throw error
      } finally {
        isStreaming.value = false
        currentChatSession.value = null
      }
    }, 'text')
  }

  return {
    // State
    isStreaming,

    // Methods
    sendMessageStream,
    sendMessageWithFallback,
  }
}
