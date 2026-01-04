import { ref } from 'vue'

/**
 * OPFS (Origin Private File System) Composable
 *
 * Provides file system operations for storing images in the browser's
 * private file system. OPFS is faster than IndexedDB for binary data
 * and doesn't require serialization.
 *
 * Directory structure:
 *   /images/{historyId}/0.webp
 *   /images/{historyId}/1.webp
 *   ...
 *
 * Browser support (2026): Chrome 86+, Firefox 111+, Safari 15.2+
 */
export function useOPFS() {
  const isSupported = ref(false)
  const isReady = ref(false)
  const error = ref(null)

  let rootHandle = null

  /**
   * Check if OPFS is supported in the current browser
   */
  const checkSupport = () => {
    isSupported.value = 'storage' in navigator && 'getDirectory' in navigator.storage
    return isSupported.value
  }

  /**
   * Initialize OPFS and get root directory handle
   */
  const initOPFS = async () => {
    if (!checkSupport()) {
      error.value = new Error('OPFS is not supported in this browser')
      return false
    }

    try {
      rootHandle = await navigator.storage.getDirectory()
      isReady.value = true
      return true
    } catch (err) {
      error.value = err
      return false
    }
  }

  /**
   * Get or create a directory handle by path
   * @param {string} path - Path like '/images/123' or 'images/123'
   * @returns {Promise<FileSystemDirectoryHandle>}
   */
  const getOrCreateDirectory = async (path) => {
    if (!rootHandle) await initOPFS()
    if (!rootHandle) throw new Error('OPFS not initialized')

    // Normalize path: remove leading slash, split by /
    const parts = path.replace(/^\//, '').split('/').filter(Boolean)

    let currentHandle = rootHandle
    for (const part of parts) {
      currentHandle = await currentHandle.getDirectoryHandle(part, { create: true })
    }

    return currentHandle
  }

  /**
   * Get a directory handle (without creating)
   * @param {string} path - Directory path
   * @returns {Promise<FileSystemDirectoryHandle|null>}
   */
  const getDirectory = async (path) => {
    if (!rootHandle) await initOPFS()
    if (!rootHandle) throw new Error('OPFS not initialized')

    const parts = path.replace(/^\//, '').split('/').filter(Boolean)

    let currentHandle = rootHandle
    try {
      for (const part of parts) {
        currentHandle = await currentHandle.getDirectoryHandle(part, { create: false })
      }
      return currentHandle
    } catch {
      return null
    }
  }

  /**
   * Write a file to OPFS
   * @param {string} path - Full file path like '/images/123/0.webp'
   * @param {Blob|ArrayBuffer|string} data - File content
   * @returns {Promise<boolean>}
   */
  const writeFile = async (path, data) => {
    try {
      // Split path into directory and filename
      const parts = path.replace(/^\//, '').split('/')
      const filename = parts.pop()
      const dirPath = parts.join('/')

      // Get or create directory
      const dirHandle = await getOrCreateDirectory(dirPath)

      // Create file
      const fileHandle = await dirHandle.getFileHandle(filename, { create: true })

      // Write content
      const writable = await fileHandle.createWritable()
      await writable.write(data)
      await writable.close()

      return true
    } catch (err) {
      error.value = err
      console.error('OPFS writeFile error:', err)
      return false
    }
  }

  /**
   * Read a file from OPFS
   * @param {string} path - Full file path
   * @returns {Promise<Blob|null>}
   */
  const readFile = async (path) => {
    try {
      const parts = path.replace(/^\//, '').split('/')
      const filename = parts.pop()
      const dirPath = parts.join('/')

      const dirHandle = await getDirectory(dirPath)
      if (!dirHandle) return null

      const fileHandle = await dirHandle.getFileHandle(filename, { create: false })
      const file = await fileHandle.getFile()

      return file
    } catch (err) {
      // File not found is not necessarily an error
      if (err.name !== 'NotFoundError') {
        error.value = err
        console.error('OPFS readFile error:', err)
      }
      return null
    }
  }

  /**
   * Delete a file from OPFS
   * @param {string} path - Full file path
   * @returns {Promise<boolean>}
   */
  const deleteFile = async (path) => {
    try {
      const parts = path.replace(/^\//, '').split('/')
      const filename = parts.pop()
      const dirPath = parts.join('/')

      const dirHandle = await getDirectory(dirPath)
      if (!dirHandle) return true // Already doesn't exist

      await dirHandle.removeEntry(filename)
      return true
    } catch (err) {
      if (err.name === 'NotFoundError') return true
      error.value = err
      console.error('OPFS deleteFile error:', err)
      return false
    }
  }

  /**
   * Delete a directory and all its contents
   * @param {string} path - Directory path
   * @param {boolean} recursive - Whether to delete recursively
   * @returns {Promise<boolean>}
   */
  const deleteDirectory = async (path, recursive = true) => {
    try {
      const parts = path.replace(/^\//, '').split('/')
      const dirName = parts.pop()
      const parentPath = parts.join('/')

      let parentHandle
      if (parentPath) {
        parentHandle = await getDirectory(parentPath)
      } else {
        if (!rootHandle) await initOPFS()
        parentHandle = rootHandle
      }

      if (!parentHandle) return true // Parent doesn't exist

      await parentHandle.removeEntry(dirName, { recursive })
      return true
    } catch (err) {
      if (err.name === 'NotFoundError') return true
      error.value = err
      console.error('OPFS deleteDirectory error:', err)
      return false
    }
  }

  /**
   * List files in a directory
   * @param {string} path - Directory path
   * @returns {Promise<Array<{name: string, kind: string}>>}
   */
  const listFiles = async (path) => {
    try {
      const dirHandle = await getDirectory(path)
      if (!dirHandle) return []

      const entries = []
      for await (const [name, handle] of dirHandle.entries()) {
        entries.push({ name, kind: handle.kind })
      }
      return entries
    } catch (err) {
      error.value = err
      console.error('OPFS listFiles error:', err)
      return []
    }
  }

  /**
   * Get the size of a file
   * @param {string} path - Full file path
   * @returns {Promise<number>} Size in bytes, or 0 if not found
   */
  const getFileSize = async (path) => {
    const file = await readFile(path)
    return file ? file.size : 0
  }

  /**
   * Calculate total storage usage for a directory (recursive)
   * @param {string} path - Directory path (default: 'images')
   * @returns {Promise<number>} Total size in bytes
   */
  const getStorageUsage = async (path = 'images') => {
    try {
      const dirHandle = await getDirectory(path)
      if (!dirHandle) return 0

      let totalSize = 0

      const calculateSize = async (handle) => {
        for await (const [, entry] of handle.entries()) {
          if (entry.kind === 'file') {
            const file = await entry.getFile()
            totalSize += file.size
          } else if (entry.kind === 'directory') {
            await calculateSize(entry)
          }
        }
      }

      await calculateSize(dirHandle)
      return totalSize
    } catch (err) {
      // Directory might not exist yet
      if (err.name !== 'NotFoundError') {
        error.value = err
        console.error('OPFS getStorageUsage error:', err)
      }
      return 0
    }
  }

  /**
   * Check if a file exists
   * @param {string} path - Full file path
   * @returns {Promise<boolean>}
   */
  const fileExists = async (path) => {
    try {
      const parts = path.replace(/^\//, '').split('/')
      const filename = parts.pop()
      const dirPath = parts.join('/')

      const dirHandle = await getDirectory(dirPath)
      if (!dirHandle) return false

      await dirHandle.getFileHandle(filename, { create: false })
      return true
    } catch {
      return false
    }
  }

  /**
   * Get a file as an Object URL (for displaying in img src)
   * @param {string} path - Full file path
   * @returns {Promise<string|null>} Object URL or null
   */
  const getFileURL = async (path) => {
    const file = await readFile(path)
    if (!file) return null
    return URL.createObjectURL(file)
  }

  // Initialize on first use
  checkSupport()

  return {
    // State
    isSupported,
    isReady,
    error,

    // Methods
    initOPFS,
    getOrCreateDirectory,
    getDirectory,
    writeFile,
    readFile,
    deleteFile,
    deleteDirectory,
    listFiles,
    getFileSize,
    getStorageUsage,
    fileExists,
    getFileURL,
  }
}
