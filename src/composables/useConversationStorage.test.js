import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock useOPFS before importing the module under test
const mockWriteFile = vi.fn().mockResolvedValue(undefined)
const mockInitOPFS = vi.fn().mockResolvedValue(undefined)
const mockGetOrCreateDirectory = vi.fn().mockResolvedValue(undefined)

vi.mock('./useOPFS', () => ({
  useOPFS: () => ({
    initOPFS: mockInitOPFS,
    getOrCreateDirectory: mockGetOrCreateDirectory,
    writeFile: mockWriteFile,
  }),
}))

const { useConversationStorage } = await import('./useConversationStorage')

/**
 * Intercept writeFile and parse the JSON from the Blob to inspect stored messages.
 */
function captureWrittenMessages() {
  let captured = null
  mockWriteFile.mockImplementation(async (_path, blob) => {
    // Extract text from Blob
    const text = await blob.text()
    captured = JSON.parse(text)
  })
  return () => captured
}

describe('useConversationStorage - saveConversation imageIndex assignment', () => {
  let conversationStorage

  beforeEach(() => {
    vi.clearAllMocks()
    conversationStorage = useConversationStorage()
  })

  it('assigns sequential imageIndex to all new images (no ext parts)', async () => {
    const getMessages = captureWrittenMessages()

    const messages = [
      {
        id: 'msg1',
        role: 'user',
        parts: [
          { type: 'image', data: 'base64data1', mimeType: 'image/png' },
          { type: 'text', content: 'hello' },
        ],
      },
      {
        id: 'msg2',
        role: 'model',
        parts: [
          { type: 'text', content: 'response' },
          { type: 'generatedImage', data: 'base64data2', mimeType: 'image/png' },
        ],
      },
    ]

    await conversationStorage.saveConversation(1, messages)
    const stored = getMessages()

    expect(stored).not.toBeNull()
    // msg1 image should get index 0
    const msg1ImagePart = stored[0].parts.find((p) => p.type === 'image')
    expect(msg1ImagePart.imageIndex).toBe(0)
    expect(msg1ImagePart.dataStoredExternally).toBe(true)
    expect(msg1ImagePart.data).toBeUndefined()

    // msg2 generatedImage should get index 1
    const msg2ImagePart = stored[1].parts.find((p) => p.type === 'generatedImage')
    expect(msg2ImagePart.imageIndex).toBe(1)
    expect(msg2ImagePart.dataStoredExternally).toBe(true)
    expect(msg2ImagePart.data).toBeUndefined()
  })

  it('preserves existing imageIndex for dataStoredExternally parts', async () => {
    const getMessages = captureWrittenMessages()

    const messages = [
      {
        id: 'msg1',
        role: 'user',
        parts: [
          {
            type: 'image',
            mimeType: 'image/webp',
            imageIndex: 0,
            dataStoredExternally: true,
          },
        ],
      },
      {
        id: 'msg2',
        role: 'model',
        parts: [{ type: 'generatedImage', data: 'newBase64', mimeType: 'image/png' }],
      },
    ]

    await conversationStorage.saveConversation(1, messages)
    const stored = getMessages()

    // Preserved ext part keeps index 0
    const extPart = stored[0].parts[0]
    expect(extPart.imageIndex).toBe(0)
    expect(extPart.dataStoredExternally).toBe(true)

    // New image gets index 1 (after max ext index 0)
    const newPart = stored[1].parts[0]
    expect(newPart.imageIndex).toBe(1)
    expect(newPart.dataStoredExternally).toBe(true)
  })

  it('assigns new indices starting after the highest ext index', async () => {
    const getMessages = captureWrittenMessages()

    const messages = [
      {
        id: 'msg1',
        role: 'user',
        parts: [
          { type: 'image', mimeType: 'image/webp', imageIndex: 0, dataStoredExternally: true },
        ],
      },
      {
        id: 'msg2',
        role: 'model',
        parts: [
          {
            type: 'generatedImage',
            mimeType: 'image/webp',
            imageIndex: 3, // non-sequential ext index
            dataStoredExternally: true,
          },
        ],
      },
      {
        id: 'msg3',
        role: 'model',
        parts: [{ type: 'generatedImage', data: 'newData1', mimeType: 'image/png' }],
      },
      {
        id: 'msg4',
        role: 'model',
        parts: [{ type: 'generatedImage', data: 'newData2', mimeType: 'image/png' }],
      },
    ]

    await conversationStorage.saveConversation(1, messages)
    const stored = getMessages()

    expect(stored[0].parts[0].imageIndex).toBe(0) // preserved
    expect(stored[1].parts[0].imageIndex).toBe(3) // preserved
    expect(stored[2].parts[0].imageIndex).toBe(4) // new: max(0,3)+1 = 4
    expect(stored[3].parts[0].imageIndex).toBe(5) // new: 5
  })

  it('handles mixed ext and data parts in the same message', async () => {
    const getMessages = captureWrittenMessages()

    const messages = [
      {
        id: 'msg1',
        role: 'model',
        parts: [
          {
            type: 'generatedImage',
            mimeType: 'image/webp',
            imageIndex: 0,
            dataStoredExternally: true,
          },
          { type: 'text', content: 'generated these:' },
          { type: 'generatedImage', data: 'newImage', mimeType: 'image/png' },
        ],
      },
    ]

    await conversationStorage.saveConversation(1, messages)
    const stored = getMessages()

    const imageParts = stored[0].parts.filter(
      (p) => p.type === 'generatedImage' || p.type === 'image',
    )
    expect(imageParts[0].imageIndex).toBe(0) // preserved ext
    expect(imageParts[1].imageIndex).toBe(1) // new, starts after max ext(0)
  })

  it('text-only parts are not affected by image indexing', async () => {
    const getMessages = captureWrittenMessages()

    const messages = [
      {
        id: 'msg1',
        role: 'user',
        parts: [{ type: 'text', content: 'hello world' }],
      },
      {
        id: 'msg2',
        role: 'model',
        parts: [
          { type: 'text', content: 'response text' },
          { type: 'thought', content: 'thinking...' },
        ],
      },
    ]

    await conversationStorage.saveConversation(1, messages)
    const stored = getMessages()

    // Text parts should be unchanged
    expect(stored[0].parts[0]).toEqual({ type: 'text', content: 'hello world' })
    expect(stored[1].parts[0]).toEqual({ type: 'text', content: 'response text' })
    expect(stored[1].parts[1]).toEqual({ type: 'thought', content: 'thinking...' })
  })

  it('returns null for empty messages', async () => {
    const result = await conversationStorage.saveConversation(1, [])
    expect(result).toBeNull()
  })

  it('handles messages with no parts gracefully', async () => {
    const getMessages = captureWrittenMessages()

    const messages = [
      { id: 'msg1', role: 'user' }, // no parts property
      { id: 'msg2', role: 'model', parts: undefined },
    ]

    await conversationStorage.saveConversation(1, messages)
    const stored = getMessages()
    expect(stored).toHaveLength(2)
  })
})
