/**
 * GPU Error Utilities
 * Shared error classes and detection for WebGPU operations
 */

/**
 * Custom error class for GPU memory issues
 * Used to trigger automatic fallback to CPU/WASM mode
 */
export class GpuOutOfMemoryError extends Error {
  constructor(originalMessage) {
    super(`GPU out of memory: ${originalMessage}`)
    this.name = 'GpuOutOfMemoryError'
    this.originalMessage = originalMessage
  }
}

/**
 * Custom error class for GPU buffer size limit exceeded
 * Distinct from OOM - this is a hard WebGPU limit that can be resolved by using smaller models
 */
export class GpuBufferSizeError extends Error {
  constructor(originalMessage) {
    super(`GPU buffer size exceeded: ${originalMessage}`)
    this.name = 'GpuBufferSizeError'
    this.originalMessage = originalMessage
  }
}

/**
 * Check if an error message indicates GPU buffer size limit exceeded
 * This is a hard WebGPU limit (e.g., 134MB max storage buffer binding size on mobile)
 */
export function isGpuBufferSizeError(errorMessage) {
  if (!errorMessage) return false
  const msg = errorMessage.toLowerCase()
  return (
    msg.includes('larger than the maximum storage buffer binding size') ||
    msg.includes('exceeds the max buffer size') ||
    (msg.includes('buffer size') && msg.includes('exceed'))
  )
}

/**
 * Check if an error message indicates GPU memory exhaustion
 * Common patterns from WebGPU/ONNX Runtime when VRAM is insufficient
 */
export function isGpuMemoryError(errorMessage) {
  if (!errorMessage) return false
  const msg = errorMessage.toLowerCase()
  return (
    msg.includes('out of memory') ||
    msg.includes('allocation failed') ||
    msg.includes('device lost') ||
    msg.includes('buffer allocation') ||
    msg.includes('memory exhausted') ||
    msg.includes('oom') ||
    msg.includes('gpu memory') ||
    msg.includes('vram') ||
    // WebGPU specific errors
    msg.includes('createbuffer') ||
    msg.includes('mapasync') ||
    // ONNX Runtime specific
    msg.includes('failed to allocate') ||
    msg.includes('gpubufferoffset')
  )
}
