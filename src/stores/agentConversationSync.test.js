import { describe, it, expect } from 'vitest'

/**
 * Tests for the agent conversation sync logic:
 * - mergeConversations: multi-tab merge with correct preference
 * - imageIndex alignment between saveConversation and saveAgentConversation
 *
 * These functions are closures inside the Pinia store, so we recreate
 * the exact logic here as pure functions for isolated unit testing.
 * Any change to the source must be reflected here (and vice versa).
 */

// === Recreated from src/stores/generator.js ===

function generateFallbackId(msg) {
  const content = JSON.stringify({
    role: msg.role,
    timestamp: msg.timestamp || 0,
    firstPartPreview: msg.parts?.[0]?.content?.slice(0, 50) || '',
  })
  let hash = 0
  for (const char of content) {
    hash = (hash << 5) - hash + char.charCodeAt(0)
    hash = hash & hash
  }
  return `legacy-${Math.abs(hash).toString(36)}`
}

function mergeConversations(existingMessages, localMessages) {
  const messageMap = new Map()
  for (const msg of existingMessages) {
    const key = msg.id || generateFallbackId(msg)
    messageMap.set(key, msg)
  }
  for (const msg of localMessages) {
    const key = msg.id || generateFallbackId(msg)
    const existing = messageMap.get(key)
    // FIXED: >= instead of > so local (data-rich) version wins on equal timestamp
    if (!existing || (msg.timestamp || 0) >= (existing.timestamp || 0)) {
      messageMap.set(key, msg)
    }
  }
  const merged = Array.from(messageMap.values())
  merged.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
  return merged
}

// === Recreated from src/composables/useConversationStorage.js ===

function computeSaveConversationIndices(messages) {
  let nextImageIndex = 0
  for (const msg of messages) {
    for (const part of msg.parts || []) {
      if (
        (part.type === 'image' || part.type === 'generatedImage') &&
        part.dataStoredExternally &&
        part.imageIndex !== undefined
      ) {
        nextImageIndex = Math.max(nextImageIndex, part.imageIndex + 1)
      }
    }
  }

  const indexMap = [] // { msgId, partIndex, imageIndex }
  for (const msg of messages) {
    for (let i = 0; i < (msg.parts || []).length; i++) {
      const part = msg.parts[i]
      if (part.type === 'image' || part.type === 'generatedImage') {
        if (part.dataStoredExternally && part.imageIndex !== undefined) {
          indexMap.push({ msgId: msg.id, partIndex: i, imageIndex: part.imageIndex })
        } else {
          const currentIndex = nextImageIndex++
          indexMap.push({ msgId: msg.id, partIndex: i, imageIndex: currentIndex })
        }
      }
    }
  }
  return indexMap
}

// === Recreated from src/stores/generator.js saveAgentConversation ===

function computeSaveAgentIndices(conversationSnapshot, savedAgentImageCount, existingMessages) {
  let maxExtIndex = -1
  for (const msg of conversationSnapshot) {
    for (const part of msg.parts || []) {
      if (
        (part.type === 'image' || part.type === 'generatedImage') &&
        part.dataStoredExternally &&
        part.imageIndex !== undefined
      ) {
        maxExtIndex = Math.max(maxExtIndex, part.imageIndex)
      }
    }
  }
  // alreadySavedCount: uses BOTH savedAgentImageCount AND existingMessages max index
  // (existingMessages may have ext images that are already in OPFS even if merge replaced them)
  let alreadySavedCount = savedAgentImageCount
  if (existingMessages) {
    let maxExistingIndex = -1
    for (const msg of existingMessages) {
      for (const part of msg.parts || []) {
        if (
          (part.type === 'image' || part.type === 'generatedImage') &&
          part.dataStoredExternally &&
          part.imageIndex !== undefined
        ) {
          maxExistingIndex = Math.max(maxExistingIndex, part.imageIndex)
        }
      }
    }
    alreadySavedCount = Math.max(alreadySavedCount, maxExistingIndex + 1)
  }

  // nextImageIndex: starts after max ext index in the MERGED conversation only
  // (not existingMessages, because merge may have replaced ext with data)
  let nextImageIndex = Math.max(0, maxExtIndex + 1)

  const newImageIndices = [] // indices that would be saved to OPFS
  const skippedIndices = [] // indices that are already saved (optimization skip)

  for (const msg of conversationSnapshot) {
    for (const part of msg.parts || []) {
      if (part.type === 'image' || part.type === 'generatedImage') {
        if (part.dataStoredExternally) {
          continue
        }
        if (part.data) {
          const currentIndex = nextImageIndex++
          if (currentIndex < alreadySavedCount) {
            skippedIndices.push(currentIndex)
          } else {
            newImageIndices.push(currentIndex)
          }
        }
      }
    }
  }

  return { newImageIndices, skippedIndices, totalImageCount: nextImageIndex }
}

// === Recreated from src/stores/generator.js saveAgentConversation (imageCount) ===

function computeImageCount(conversationSnapshot) {
  let imageCount = 0
  for (const msg of conversationSnapshot) {
    if (msg._isPartial) continue
    for (const part of msg.parts || []) {
      if (part.type === 'image' || part.type === 'generatedImage') {
        imageCount++
      }
    }
  }
  return imageCount
}

// =====================================================
// Tests
// =====================================================

describe('mergeConversations', () => {
  it('local message wins when timestamps are equal (>= fix)', () => {
    const existing = [
      {
        id: 'msg1',
        role: 'user',
        timestamp: 1000,
        parts: [{ type: 'image', mimeType: 'image/webp', imageIndex: 0, dataStoredExternally: true }],
      },
    ]
    const local = [
      {
        id: 'msg1',
        role: 'user',
        timestamp: 1000, // same timestamp
        parts: [{ type: 'image', data: 'base64data', mimeType: 'image/png' }],
      },
    ]

    const merged = mergeConversations(existing, local)
    expect(merged).toHaveLength(1)
    // Local version should win (has data, no dataStoredExternally)
    expect(merged[0].parts[0].data).toBe('base64data')
    expect(merged[0].parts[0].dataStoredExternally).toBeUndefined()
  })

  it('local message wins when timestamp is newer', () => {
    const existing = [{ id: 'msg1', role: 'user', timestamp: 1000, parts: [{ type: 'text', content: 'old' }] }]
    const local = [{ id: 'msg1', role: 'user', timestamp: 2000, parts: [{ type: 'text', content: 'new' }] }]

    const merged = mergeConversations(existing, local)
    expect(merged[0].parts[0].content).toBe('new')
  })

  it('existing message wins when timestamp is newer', () => {
    const existing = [{ id: 'msg1', role: 'user', timestamp: 2000, parts: [{ type: 'text', content: 'existing' }] }]
    const local = [{ id: 'msg1', role: 'user', timestamp: 1000, parts: [{ type: 'text', content: 'old-local' }] }]

    const merged = mergeConversations(existing, local)
    expect(merged[0].parts[0].content).toBe('existing')
  })

  it('combines messages with different IDs', () => {
    const existing = [{ id: 'msg1', role: 'user', timestamp: 1000, parts: [] }]
    const local = [{ id: 'msg2', role: 'model', timestamp: 2000, parts: [] }]

    const merged = mergeConversations(existing, local)
    expect(merged).toHaveLength(2)
    expect(merged[0].id).toBe('msg1') // sorted by timestamp
    expect(merged[1].id).toBe('msg2')
  })

  it('sorts merged messages by timestamp', () => {
    const existing = [
      { id: 'msg3', role: 'model', timestamp: 3000, parts: [] },
      { id: 'msg1', role: 'user', timestamp: 1000, parts: [] },
    ]
    const local = [{ id: 'msg2', role: 'model', timestamp: 2000, parts: [] }]

    const merged = mergeConversations(existing, local)
    expect(merged.map((m) => m.id)).toEqual(['msg1', 'msg2', 'msg3'])
  })

  it('handles multi-tab scenario: OPFS has extra messages from other tab', () => {
    const existing = [
      { id: 'msg1', role: 'user', timestamp: 1000, parts: [{ type: 'image', imageIndex: 0, dataStoredExternally: true, mimeType: 'image/webp' }] },
      { id: 'msg2', role: 'model', timestamp: 2000, parts: [{ type: 'generatedImage', imageIndex: 1, dataStoredExternally: true, mimeType: 'image/webp' }] },
      { id: 'msg3', role: 'user', timestamp: 3000, parts: [{ type: 'text', content: 'from other tab' }] },
    ]
    const local = [
      { id: 'msg1', role: 'user', timestamp: 1000, parts: [{ type: 'image', data: 'localData', mimeType: 'image/png' }] },
      { id: 'msg4', role: 'user', timestamp: 4000, parts: [{ type: 'text', content: 'new local' }] },
    ]

    const merged = mergeConversations(existing, local)
    expect(merged).toHaveLength(4)
    // msg1: local wins (same timestamp, >= applies)
    expect(merged[0].parts[0].data).toBe('localData')
    // msg2: only in existing (ext)
    expect(merged[1].parts[0].dataStoredExternally).toBe(true)
    // msg3: only in existing
    expect(merged[2].parts[0].content).toBe('from other tab')
    // msg4: only in local
    expect(merged[3].parts[0].content).toBe('new local')
  })

  it('uses fallback ID for legacy messages without id field', () => {
    const existing = [{ role: 'user', timestamp: 1000, parts: [{ type: 'text', content: 'hello' }] }]
    const local = [{ role: 'user', timestamp: 1000, parts: [{ type: 'text', content: 'hello' }] }]

    // Same content + timestamp → same fallback ID → dedup to 1
    const merged = mergeConversations(existing, local)
    expect(merged).toHaveLength(1)
  })
})

describe('imageIndex alignment between saveConversation and saveAgentConversation', () => {
  describe('scenario: single-tab load + continue', () => {
    it('indices match when all parts have data (no ext parts)', () => {
      const conversation = [
        { id: 'msg1', parts: [{ type: 'image', data: 'img0', mimeType: 'image/png' }] },
        { id: 'msg2', parts: [{ type: 'generatedImage', data: 'img1', mimeType: 'image/png' }] },
        { id: 'msg3', parts: [{ type: 'generatedImage', data: 'img2', mimeType: 'image/png' }] },
      ]

      const saveConvIndices = computeSaveConversationIndices(conversation)
      const { newImageIndices, skippedIndices, totalImageCount } = computeSaveAgentIndices(
        conversation,
        2, // previously saved 2 images
        null,
      )

      // saveConversation: 0, 1, 2
      expect(saveConvIndices.map((x) => x.imageIndex)).toEqual([0, 1, 2])

      // saveAgent: skips 0,1 (already saved), saves 2
      expect(skippedIndices).toEqual([0, 1])
      expect(newImageIndices).toEqual([2])
      expect(totalImageCount).toBe(3)

      // Critical: the new image index (2) matches saveConversation's assignment (2)
      expect(newImageIndices[0]).toBe(saveConvIndices[2].imageIndex)
    })
  })

  describe('scenario: multi-tab merge with ext parts', () => {
    it('indices match when conversation has mixed ext and data parts', () => {
      // After merge: msg1 has ext (from OPFS), msg2 has data (new from local)
      const conversation = [
        {
          id: 'msg1',
          parts: [{ type: 'image', mimeType: 'image/webp', imageIndex: 0, dataStoredExternally: true }],
        },
        {
          id: 'msg2',
          parts: [{ type: 'generatedImage', data: 'newImg', mimeType: 'image/png' }],
        },
      ]

      const existingMessages = [
        {
          id: 'msg1',
          parts: [{ type: 'image', mimeType: 'image/webp', imageIndex: 0, dataStoredExternally: true }],
        },
      ]

      const saveConvIndices = computeSaveConversationIndices(conversation)
      const { newImageIndices } = computeSaveAgentIndices(conversation, 0, existingMessages)

      // saveConversation: msg1→0 (preserved), msg2→1 (new)
      expect(saveConvIndices.map((x) => x.imageIndex)).toEqual([0, 1])

      // saveAgent: msg1 skipped (ext), msg2 saved as index 1
      expect(newImageIndices).toEqual([1])

      // CRITICAL: indices match!
      expect(newImageIndices[0]).toBe(saveConvIndices[1].imageIndex)
    })

    it('indices match with multiple ext parts and multiple new parts', () => {
      const conversation = [
        { id: 'msg1', parts: [{ type: 'image', mimeType: 'image/webp', imageIndex: 0, dataStoredExternally: true }] },
        { id: 'msg2', parts: [{ type: 'generatedImage', mimeType: 'image/webp', imageIndex: 1, dataStoredExternally: true }] },
        { id: 'msg3', parts: [{ type: 'generatedImage', mimeType: 'image/webp', imageIndex: 2, dataStoredExternally: true }] },
        { id: 'msg4', parts: [{ type: 'image', data: 'new1', mimeType: 'image/png' }] },
        { id: 'msg5', parts: [{ type: 'generatedImage', data: 'new2', mimeType: 'image/png' }] },
      ]

      const existingMessages = conversation.slice(0, 3)

      const saveConvIndices = computeSaveConversationIndices(conversation)
      const { newImageIndices } = computeSaveAgentIndices(conversation, 0, existingMessages)

      // saveConversation: 0(ext), 1(ext), 2(ext), 3(new), 4(new)
      expect(saveConvIndices.map((x) => x.imageIndex)).toEqual([0, 1, 2, 3, 4])

      // saveAgent: ext parts skipped, new parts at 3, 4
      expect(newImageIndices).toEqual([3, 4])

      // Alignment check
      expect(newImageIndices[0]).toBe(saveConvIndices[3].imageIndex)
      expect(newImageIndices[1]).toBe(saveConvIndices[4].imageIndex)
    })

    it('handles non-sequential ext indices (gaps)', () => {
      const conversation = [
        { id: 'msg1', parts: [{ type: 'image', mimeType: 'image/webp', imageIndex: 0, dataStoredExternally: true }] },
        { id: 'msg2', parts: [{ type: 'generatedImage', mimeType: 'image/webp', imageIndex: 5, dataStoredExternally: true }] },
        { id: 'msg3', parts: [{ type: 'generatedImage', data: 'newImg', mimeType: 'image/png' }] },
      ]

      const saveConvIndices = computeSaveConversationIndices(conversation)
      const { newImageIndices } = computeSaveAgentIndices(conversation, 0, null)

      // saveConversation: 0(ext), 5(ext), 6(new) — starts after max(0,5)+1=6
      expect(saveConvIndices.map((x) => x.imageIndex)).toEqual([0, 5, 6])
      expect(newImageIndices).toEqual([6])
      expect(newImageIndices[0]).toBe(saveConvIndices[2].imageIndex)
    })
  })

  describe('scenario: already-saved optimization', () => {
    it('skips images below alreadySavedCount but still assigns correct indices', () => {
      // After loading 3 images from history, user adds a new one
      const conversation = [
        { id: 'msg1', parts: [{ type: 'image', data: 'restored0', mimeType: 'image/webp' }] },
        { id: 'msg2', parts: [{ type: 'generatedImage', data: 'restored1', mimeType: 'image/webp' }] },
        { id: 'msg3', parts: [{ type: 'generatedImage', data: 'restored2', mimeType: 'image/webp' }] },
        { id: 'msg4', parts: [{ type: 'generatedImage', data: 'brandNew', mimeType: 'image/png' }] },
      ]

      const savedAgentImageCount = 3

      const saveConvIndices = computeSaveConversationIndices(conversation)
      const { newImageIndices, skippedIndices } = computeSaveAgentIndices(
        conversation,
        savedAgentImageCount,
        null,
      )

      // saveConversation: 0, 1, 2, 3
      expect(saveConvIndices.map((x) => x.imageIndex)).toEqual([0, 1, 2, 3])

      // saveAgent: 0,1,2 skipped (already saved), 3 is new
      expect(skippedIndices).toEqual([0, 1, 2])
      expect(newImageIndices).toEqual([3])
      expect(newImageIndices[0]).toBe(saveConvIndices[3].imageIndex)
    })
  })

  describe('scenario: full flow — load, merge, save', () => {
    it('reproduces the original bug scenario and verifies fix', () => {
      // Step 1: User loads conversation from history (2 messages, 1 image each)
      // loadAgentFromHistory restores base64 data, sets savedAgentImageCount = 2

      // Step 2: User sends new message with image, save triggers
      // agentConversation has [msg1(data), msg2(data), msg3(data)]
      // OPFS has [msg1(ext,idx=0), msg2(ext,idx=1)]

      const existingMessages = [
        { id: 'msg1', role: 'user', timestamp: 1000, parts: [{ type: 'image', mimeType: 'image/webp', imageIndex: 0, dataStoredExternally: true }] },
        { id: 'msg2', role: 'model', timestamp: 2000, parts: [{ type: 'generatedImage', mimeType: 'image/webp', imageIndex: 1, dataStoredExternally: true }] },
      ]

      const localMessages = [
        { id: 'msg1', role: 'user', timestamp: 1000, parts: [{ type: 'image', data: 'restoredImg0', mimeType: 'image/webp' }] },
        { id: 'msg2', role: 'model', timestamp: 2000, parts: [{ type: 'generatedImage', data: 'restoredImg1', mimeType: 'image/webp' }] },
        { id: 'msg3', role: 'user', timestamp: 3000, parts: [{ type: 'image', data: 'newUserImg', mimeType: 'image/png' }] },
      ]

      // Step 3: Merge (with >= fix, local wins for msg1, msg2)
      const merged = mergeConversations(existingMessages, localMessages)

      expect(merged).toHaveLength(3)
      // msg1: local wins (data preserved)
      expect(merged[0].parts[0].data).toBe('restoredImg0')
      expect(merged[0].parts[0].dataStoredExternally).toBeUndefined()
      // msg2: local wins (data preserved)
      expect(merged[1].parts[0].data).toBe('restoredImg1')
      // msg3: only in local (new)
      expect(merged[2].parts[0].data).toBe('newUserImg')

      // Step 4: Verify index alignment
      const saveConvIndices = computeSaveConversationIndices(merged)
      const { newImageIndices, skippedIndices, totalImageCount } = computeSaveAgentIndices(
        merged,
        2, // savedAgentImageCount from load
        existingMessages,
      )

      // saveConversation: all data → sequential 0, 1, 2
      expect(saveConvIndices.map((x) => x.imageIndex)).toEqual([0, 1, 2])

      // saveAgent: 0,1 already saved → skip, 2 is new → save
      expect(skippedIndices).toEqual([0, 1])
      expect(newImageIndices).toEqual([2])
      expect(totalImageCount).toBe(3)

      // CRITICAL: the new image will be saved as 2.webp,
      // and saveConversation's JSON says index 2 → MATCH!
      expect(newImageIndices[0]).toBe(saveConvIndices[2].imageIndex)
    })

    it('reproduces the OLD buggy behavior for reference', () => {
      // This test documents what USED TO happen before the fix.
      // With the old `>` (strict), OPFS version won for equal timestamps.

      const existingMessages = [
        { id: 'msg1', role: 'user', timestamp: 1000, parts: [{ type: 'image', mimeType: 'image/webp', imageIndex: 0, dataStoredExternally: true }] },
      ]

      const localMessages = [
        { id: 'msg1', role: 'user', timestamp: 1000, parts: [{ type: 'image', data: 'restoredData', mimeType: 'image/webp' }] },
        { id: 'msg2', role: 'model', timestamp: 2000, parts: [{ type: 'generatedImage', data: 'newGenerated', mimeType: 'image/png' }] },
      ]

      // With the fix (>=), local wins → all data → correct indices
      const merged = mergeConversations(existingMessages, localMessages)
      expect(merged[0].parts[0].data).toBe('restoredData')
      // This ensures no dataStoredExternally parts in merged result for single-tab
    })
  })

  describe('edge cases', () => {
    it('handles conversation with no images', () => {
      const conversation = [
        { id: 'msg1', parts: [{ type: 'text', content: 'hello' }] },
        { id: 'msg2', parts: [{ type: 'text', content: 'world' }] },
      ]

      const saveConvIndices = computeSaveConversationIndices(conversation)
      const { newImageIndices, totalImageCount } = computeSaveAgentIndices(conversation, 0, null)

      expect(saveConvIndices).toEqual([])
      expect(newImageIndices).toEqual([])
      expect(totalImageCount).toBe(0)
    })

    it('handles messages with undefined parts', () => {
      const conversation = [
        { id: 'msg1' },
        { id: 'msg2', parts: undefined },
        { id: 'msg3', parts: [{ type: 'image', data: 'img0', mimeType: 'image/png' }] },
      ]

      const saveConvIndices = computeSaveConversationIndices(conversation)
      expect(saveConvIndices).toHaveLength(1)
      expect(saveConvIndices[0].imageIndex).toBe(0)
    })

    it('handles empty merge (both arrays empty)', () => {
      const merged = mergeConversations([], [])
      expect(merged).toEqual([])
    })

    it('handles merge where only existing has messages', () => {
      const existing = [{ id: 'msg1', role: 'user', timestamp: 1000, parts: [] }]
      const merged = mergeConversations(existing, [])
      expect(merged).toHaveLength(1)
    })

    it('handles merge where only local has messages', () => {
      const local = [{ id: 'msg1', role: 'user', timestamp: 1000, parts: [] }]
      const merged = mergeConversations([], local)
      expect(merged).toHaveLength(1)
    })

    it('filters _isPartial ghosts before merge to prevent index inflation', () => {
      // Scenario: 2 auto-saves during streaming create ghost partial messages in OPFS
      // Without the fix, ghosts accumulate and push indices up each save cycle.

      // After auto-save 1: OPFS has [msg1 ext 0, partial-1 ext 1]
      // Auto-save 2 loads existing, then local has [msg1(data), partial-2(data)] (new partial ID)
      // WITHOUT fix: merge yields [msg1(data), partial-1(ext 1), partial-2(data)]
      //   → maxExtIndex=1 → nextImageIndex=2 → images re-saved at 2,3 → DUPLICATION!
      // WITH fix: filter partials → existing = [msg1(ext 0)] → merge = [msg1(data), partial-2(data)]
      //   → maxExtIndex=-1 → nextImageIndex=0 → properly skipped

      const existingMessagesRaw = [
        { id: 'msg1', role: 'user', timestamp: 1000, parts: [{ type: 'image', mimeType: 'image/webp', imageIndex: 0, dataStoredExternally: true }] },
        { id: 'partial-1', role: 'model', timestamp: 1500, _isPartial: true, parts: [{ type: 'generatedImage', mimeType: 'image/webp', imageIndex: 1, dataStoredExternally: true }] },
      ]

      // Filter out partials (the fix)
      const existingMessages = existingMessagesRaw.filter((msg) => !msg._isPartial)

      const localMessages = [
        { id: 'msg1', role: 'user', timestamp: 1000, parts: [{ type: 'image', data: 'imgA', mimeType: 'image/png' }] },
        { id: 'partial-2', role: 'model', timestamp: 2000, _isPartial: true, parts: [{ type: 'generatedImage', data: 'imgB', mimeType: 'image/png' }] },
      ]

      const merged = mergeConversations(existingMessages, localMessages)
      expect(merged).toHaveLength(2) // msg1 + partial-2, no ghost partial-1

      const saveConvIndices = computeSaveConversationIndices(merged)
      const { newImageIndices, skippedIndices } = computeSaveAgentIndices(
        merged, 2, existingMessages, // savedAgentImageCount=2 from previous save
      )

      // saveConversation: 0, 1 (sequential, no ext inflating)
      expect(saveConvIndices.map((x) => x.imageIndex)).toEqual([0, 1])

      // saveAgent: both < alreadySavedCount(2) → both skipped → NO re-save!
      expect(skippedIndices).toEqual([0, 1])
      expect(newImageIndices).toEqual([])
    })

    it('without filter, ghosts cause exponential index growth (documents old bug)', () => {
      // Same scenario but WITHOUT filtering — shows the old buggy behavior
      const existingMessages = [
        { id: 'msg1', role: 'user', timestamp: 1000, parts: [{ type: 'image', mimeType: 'image/webp', imageIndex: 0, dataStoredExternally: true }] },
        { id: 'partial-1', role: 'model', timestamp: 1500, _isPartial: true, parts: [{ type: 'generatedImage', mimeType: 'image/webp', imageIndex: 1, dataStoredExternally: true }] },
      ]
      // NO filter — old behavior
      const localMessages = [
        { id: 'msg1', role: 'user', timestamp: 1000, parts: [{ type: 'image', data: 'imgA', mimeType: 'image/png' }] },
        { id: 'partial-2', role: 'model', timestamp: 2000, _isPartial: true, parts: [{ type: 'generatedImage', data: 'imgB', mimeType: 'image/png' }] },
      ]

      const merged = mergeConversations(existingMessages, localMessages)
      expect(merged).toHaveLength(3) // msg1 + partial-1 GHOST + partial-2

      // Ghost partial-1 has ext index 1 → pushes nextImageIndex to 2
      const saveConvIndices = computeSaveConversationIndices(merged)
      const { newImageIndices } = computeSaveAgentIndices(merged, 2, existingMessages)

      // BAD: images get re-indexed to 2 and 3 (ghost pushes index up)
      // saveConversation order: msg1(data→2), partial-1(ext→1 preserved), partial-2(data→3)
      expect(saveConvIndices.map((x) => x.imageIndex)).toEqual([2, 1, 3])
      // Both data-bearing images saved again (2 >= alreadySavedCount=2)
      expect(newImageIndices).toEqual([2, 3])
    })

    it('simulates 5 consecutive auto-saves verifying no duplication with filter', () => {
      // Full realistic scenario: 5 auto-saves during streaming, 2 images total
      let savedAgentImageCount = 0
      let opfsMessages = [] // what OPFS conversation.json contains

      // Save 1: User message with image A
      const userMsg = {
        id: 'msg1', role: 'user', timestamp: 1000,
        parts: [{ type: 'image', data: 'imgA', mimeType: 'image/png' }],
      }

      {
        const snapshot = [userMsg]
        // No existing → no merge
        const saveConvIndices = computeSaveConversationIndices(snapshot)
        const { newImageIndices, totalImageCount } = computeSaveAgentIndices(snapshot, savedAgentImageCount, null)
        expect(newImageIndices).toEqual([0])
        savedAgentImageCount = totalImageCount
        expect(savedAgentImageCount).toBe(1)
        // Simulate OPFS write
        opfsMessages = snapshot.map((msg) => ({
          ...msg,
          parts: msg.parts.map((p, i) => ({
            type: p.type, mimeType: 'image/webp', imageIndex: saveConvIndices[i]?.imageIndex ?? p.imageIndex,
            dataStoredExternally: true,
          })),
        }))
      }

      // Save 2-5: Auto-saves during streaming (each with new partial ID)
      for (let saveNum = 2; saveNum <= 5; saveNum++) {
        const partialMsg = {
          id: `partial-${saveNum}`, role: 'model', timestamp: 1000 + saveNum * 100,
          _isPartial: true,
          parts: [{ type: 'generatedImage', data: 'imgB', mimeType: 'image/png' }],
        }

        const localSnapshot = [userMsg, partialMsg]

        // Filter partials from existing (THE FIX)
        const filteredExisting = opfsMessages.filter((msg) => !msg._isPartial)

        const merged = mergeConversations(filteredExisting, localSnapshot)
        const saveConvIndices = computeSaveConversationIndices(merged)
        const { newImageIndices, totalImageCount } = computeSaveAgentIndices(
          merged, savedAgentImageCount, filteredExisting,
        )

        // CRITICAL: after save 2, no more new images should be saved
        if (saveNum === 2) {
          expect(newImageIndices).toEqual([1]) // imgB saved for the first time
        } else {
          expect(newImageIndices).toEqual([]) // no re-saves!
        }

        savedAgentImageCount = Math.max(savedAgentImageCount, totalImageCount)

        // Update simulated OPFS content
        opfsMessages = merged.map((msg) => ({
          ...msg,
          parts: msg.parts.map((p) => {
            if (p.type === 'image' || p.type === 'generatedImage') {
              const idx = saveConvIndices.find(
                (x) => x.msgId === msg.id && (x.partIndex === 0 || x.partIndex === msg.parts.indexOf(p)),
              )
              return {
                type: p.type, mimeType: 'image/webp',
                imageIndex: idx?.imageIndex ?? p.imageIndex,
                dataStoredExternally: true,
                ...(msg._isPartial ? { _parentPartial: true } : {}),
              }
            }
            return p
          }),
          ...(msg._isPartial ? { _isPartial: true } : {}),
        }))
      }

      // After 5 saves, savedAgentImageCount should be exactly 2 (not 10!)
      expect(savedAgentImageCount).toBe(2)
    })

    it('ext parts with undefined imageIndex are treated as new images', () => {
      // Defensive: if somehow a part has dataStoredExternally but no imageIndex
      const conversation = [
        { id: 'msg1', parts: [{ type: 'image', dataStoredExternally: true, mimeType: 'image/webp' }] },
        { id: 'msg2', parts: [{ type: 'generatedImage', data: 'newImg', mimeType: 'image/png' }] },
      ]

      const saveConvIndices = computeSaveConversationIndices(conversation)
      // The ext part without imageIndex is treated as new (gets index 0)
      expect(saveConvIndices[0].imageIndex).toBe(0)
      expect(saveConvIndices[1].imageIndex).toBe(1)
    })

    it('image parts without data and without ext flag are ignored in saveAgent', () => {
      // Part that somehow has neither data nor dataStoredExternally
      const conversation = [
        { id: 'msg1', parts: [{ type: 'image', mimeType: 'image/png' }] }, // no data, no ext
        { id: 'msg2', parts: [{ type: 'generatedImage', data: 'valid', mimeType: 'image/png' }] },
      ]

      const { newImageIndices, totalImageCount } = computeSaveAgentIndices(conversation, 0, null)
      // msg1's image: not ext, no data → skipped entirely
      // msg2's image: has data → index 0
      expect(newImageIndices).toEqual([0])
      expect(totalImageCount).toBe(1)
    })
  })
})

describe('computeImageCount (badge display)', () => {
  it('counts image and generatedImage parts', () => {
    const conversation = [
      { id: 'msg1', role: 'user', parts: [{ type: 'image', data: 'img0', mimeType: 'image/png' }] },
      { id: 'msg2', role: 'model', parts: [{ type: 'generatedImage', data: 'img1', mimeType: 'image/png' }] },
    ]
    expect(computeImageCount(conversation)).toBe(2)
  })

  it('ignores text and thought parts', () => {
    const conversation = [
      { id: 'msg1', role: 'user', parts: [{ type: 'text', content: 'hello' }, { type: 'image', data: 'img0', mimeType: 'image/png' }] },
      { id: 'msg2', role: 'model', parts: [{ type: 'thought', content: 'thinking...' }, { type: 'text', content: 'response' }] },
    ]
    expect(computeImageCount(conversation)).toBe(1)
  })

  it('excludes _isPartial messages from count', () => {
    const conversation = [
      { id: 'msg1', role: 'user', parts: [{ type: 'image', data: 'img0', mimeType: 'image/png' }] },
      { id: 'partial-1', role: 'model', _isPartial: true, parts: [{ type: 'generatedImage', data: 'img1', mimeType: 'image/png' }] },
    ]
    // Only msg1's image counts; partial is excluded
    expect(computeImageCount(conversation)).toBe(1)
  })

  it('counts ext (dataStoredExternally) images too', () => {
    const conversation = [
      { id: 'msg1', parts: [{ type: 'image', mimeType: 'image/webp', imageIndex: 0, dataStoredExternally: true }] },
      { id: 'msg2', parts: [{ type: 'generatedImage', data: 'new', mimeType: 'image/png' }] },
    ]
    expect(computeImageCount(conversation)).toBe(2)
  })

  it('returns 0 for text-only conversation', () => {
    const conversation = [
      { id: 'msg1', role: 'user', parts: [{ type: 'text', content: 'hello' }] },
      { id: 'msg2', role: 'model', parts: [{ type: 'text', content: 'world' }] },
    ]
    expect(computeImageCount(conversation)).toBe(0)
  })

  it('handles messages with no parts', () => {
    const conversation = [
      { id: 'msg1', role: 'user' },
      { id: 'msg2', role: 'model', parts: undefined },
    ]
    expect(computeImageCount(conversation)).toBe(0)
  })
})
