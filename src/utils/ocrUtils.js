// OPFS Utilities for handling OCR models
// Shared between Main Thread and Web Workers

const OPFS_DIR = 'ocr-models'

// Check if OPFS is supported
export function isOpfsSupported() {
  return typeof navigator !== 'undefined' && 'storage' in navigator && 'getDirectory' in navigator.storage
}

// Get the root directory handle for models
export async function getModelsDirectory() {
  if (!isOpfsSupported()) {
    throw new Error('OPFS is not supported in this environment')
  }
  const root = await navigator.storage.getDirectory()
  return await root.getDirectoryHandle(OPFS_DIR, { create: true })
}

// Check if a file exists in the models directory
export async function modelExists(filename) {
  try {
    const dir = await getModelsDirectory()
    await dir.getFileHandle(filename, { create: false })
    return true
  } catch {
    return false
  }
}

// Read a model file from OPFS
// Returns string for .txt files, ArrayBuffer for others
export async function readModel(filename) {
  const dir = await getModelsDirectory()
  const fileHandle = await dir.getFileHandle(filename, { create: false })
  const file = await fileHandle.getFile()
  return filename.endsWith('.txt') ? await file.text() : await file.arrayBuffer()
}

// Write a model file to OPFS
export async function writeModel(filename, data) {
  const dir = await getModelsDirectory()
  const fileHandle = await dir.getFileHandle(filename, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(data)
  await writable.close()
}

// Download a model with progress callback
// onProgress(percent, mbDownloaded, totalMb)
export async function downloadModel(url, filename, expectedSize, onProgress) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download ${filename}: ${response.status}`)
  }

  const contentLength = response.headers.get('content-length')
  const total = contentLength ? parseInt(contentLength, 10) : expectedSize

  const reader = response.body.getReader()
  const chunks = []
  let received = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    chunks.push(value)
    received += value.length

    if (onProgress) {
      const fileProgress = Math.min(100, Math.round((received / total) * 100))
      const sizeMB = Math.round(received / 1024 / 1024)
      const totalMB = Math.round(total / 1024 / 1024)
      onProgress(fileProgress, sizeMB, totalMB)
    }
  }

  const data = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    data.set(chunk, offset)
    offset += chunk.length
  }

  return filename.endsWith('.txt') ? new TextDecoder().decode(data) : data.buffer
}

// Clear all models from cache
export async function clearModelCache() {
  try {
    const root = await navigator.storage.getDirectory()
    await root.removeEntry(OPFS_DIR, { recursive: true })
    return true
  } catch (err) {
    if (err.name !== 'NotFoundError') {
      throw err
    }
    return false
  }
}

// Get total cache size in bytes
export async function getModelCacheSize() {
  try {
    const dir = await getModelsDirectory()
    let totalSize = 0

    for await (const [, handle] of dir.entries()) {
      if (handle.kind === 'file') {
        const file = await handle.getFile()
        totalSize += file.size
      }
    }

    return totalSize
  } catch {
    return 0
  }
}
