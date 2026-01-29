import { ref } from 'vue'
import { useOPFS } from './useOPFS'

/**
 * Conversation Storage Composable
 *
 * Stores agent conversations in OPFS for efficient storage.
 * IndexedDB only stores lightweight metadata (prompt preview, counts, thumbnail).
 * Full conversation is stored as JSON in OPFS.
 *
 * Directory structure:
 *   /conversations/{historyId}/conversation.json
 */
export function useConversationStorage() {
  const opfs = useOPFS()
  const isProcessing = ref(false)
  const error = ref(null)

  /**
   * Save a conversation to OPFS
   * @param {number} historyId - History record ID
   * @param {Array} messages - Full conversation messages array
   * @returns {Promise<Object>} Metadata for IndexedDB
   */
  const saveConversation = async (historyId, messages) => {
    if (!messages || messages.length === 0) {
      return null
    }

    isProcessing.value = true
    error.value = null

    try {
      await opfs.initOPFS()

      // Create directory for this conversation
      const dirPath = `conversations/${historyId}`
      await opfs.getOrCreateDirectory(dirPath)

      // Strip large image data from messages for JSON storage
      // Images are stored separately in /images/{historyId}/
      // Assign imageIndex to each image part for later retrieval
      let imageIndex = 0
      const messagesForStorage = messages.map((msg) => ({
        ...msg,
        parts: msg.parts?.map((part) => {
          // Keep image metadata but remove base64 data (stored in OPFS images)
          if (part.type === 'image' || part.type === 'generatedImage') {
            const currentIndex = imageIndex++
            return {
              type: part.type,
              mimeType: part.mimeType,
              // Store the image index for later retrieval from OPFS
              imageIndex: currentIndex,
              dataStoredExternally: true,
            }
          }
          return part
        }),
      }))

      // Serialize and save
      const jsonString = JSON.stringify(messagesForStorage, null, 0) // Compact JSON
      const blob = new Blob([jsonString], { type: 'application/json' })
      const opfsPath = `/${dirPath}/conversation.json`

      await opfs.writeFile(opfsPath, blob)

      return {
        opfsPath,
        size: blob.size,
      }
    } catch (err) {
      error.value = err
      console.error('[ConversationStorage] Failed to save conversation:', err)
      throw err
    } finally {
      isProcessing.value = false
    }
  }

  /**
   * Load a conversation from OPFS
   * @param {string} opfsPath - OPFS file path
   * @returns {Promise<Array|null>} Messages array or null
   */
  const loadConversation = async (opfsPath) => {
    if (!opfsPath) return null

    try {
      await opfs.initOPFS()
      const blob = await opfs.readFile(opfsPath)

      if (!blob) return null

      const jsonString = await blob.text()
      return JSON.parse(jsonString)
    } catch (err) {
      console.error('[ConversationStorage] Failed to load conversation:', err)
      return null
    }
  }

  /**
   * Delete a conversation from OPFS
   * @param {number} historyId - History record ID
   * @returns {Promise<boolean>}
   */
  const deleteConversation = async (historyId) => {
    try {
      await opfs.initOPFS()
      const dirPath = `conversations/${historyId}`

      // Delete conversation file
      await opfs.deleteFile(`/${dirPath}/conversation.json`)

      // Try to remove directory (may fail if not empty, which is ok)
      try {
        await opfs.deleteDirectory(dirPath)
      } catch {
        // Directory might have other files or not exist
      }

      return true
    } catch (err) {
      console.error('[ConversationStorage] Failed to delete conversation:', err)
      return false
    }
  }

  /**
   * Delete all conversations from OPFS
   * @returns {Promise<boolean>}
   */
  const deleteAllConversations = async () => {
    try {
      await opfs.initOPFS()
      await opfs.deleteDirectory('conversations')
      return true
    } catch (err) {
      console.error('[ConversationStorage] Failed to delete all conversations:', err)
      return false
    }
  }

  /**
   * Get total size of all conversations
   * @returns {Promise<number>} Size in bytes
   */
  const getTotalSize = async () => {
    try {
      await opfs.initOPFS()
      return await opfs.getStorageUsage('conversations')
    } catch {
      return 0
    }
  }

  return {
    isProcessing,
    error,
    saveConversation,
    loadConversation,
    deleteConversation,
    deleteAllConversations,
    getTotalSize,
  }
}
