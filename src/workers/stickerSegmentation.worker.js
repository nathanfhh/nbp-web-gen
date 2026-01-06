/**
 * Sticker Segmentation Worker
 * Performs background removal + CCL off the main thread
 */

/**
 * Remove background using edge-connected flood fill
 * Protects interior pixels that match background color
 * @param {Uint8ClampedArray} data - ImageData.data (RGBA), modified in place
 * @param {number} width
 * @param {number} height
 * @param {{r: number, g: number, b: number}} bgColor
 * @param {number} tolerance
 */
function removeBackground(data, width, height, bgColor, tolerance) {
  const { r: bgR, g: bgG, b: bgB } = bgColor
  const tol = tolerance * 3

  // Helper: check if pixel matches background color
  const matchesBg = (idx) => {
    const r = data[idx]
    const g = data[idx + 1]
    const b = data[idx + 2]
    const diff = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB)
    return diff <= tol
  }

  const totalPixels = width * height
  const visited = new Uint8Array(totalPixels)
  const queue = []

  // Add all edge pixels that match background color to queue
  for (let x = 0; x < width; x++) {
    // Top edge
    const topIdx = x * 4
    if (matchesBg(topIdx)) {
      queue.push(x)
      visited[x] = 1
    }
    // Bottom edge
    const bottomPos = (height - 1) * width + x
    const bottomIdx = bottomPos * 4
    if (matchesBg(bottomIdx) && !visited[bottomPos]) {
      queue.push(bottomPos)
      visited[bottomPos] = 1
    }
  }
  for (let y = 1; y < height - 1; y++) {
    // Left edge
    const leftPos = y * width
    const leftIdx = leftPos * 4
    if (matchesBg(leftIdx) && !visited[leftPos]) {
      queue.push(leftPos)
      visited[leftPos] = 1
    }
    // Right edge
    const rightPos = y * width + width - 1
    const rightIdx = rightPos * 4
    if (matchesBg(rightIdx) && !visited[rightPos]) {
      queue.push(rightPos)
      visited[rightPos] = 1
    }
  }

  // BFS: process connected background pixels
  let head = 0
  while (head < queue.length) {
    const pos = queue[head++]
    const x = pos % width
    const y = (pos / width) | 0

    // Set pixel to transparent
    data[pos * 4 + 3] = 0

    // Check 4-connected neighbors
    // Left
    if (x > 0) {
      const nPos = pos - 1
      if (!visited[nPos] && matchesBg(nPos * 4)) {
        visited[nPos] = 1
        queue.push(nPos)
      }
    }
    // Right
    if (x < width - 1) {
      const nPos = pos + 1
      if (!visited[nPos] && matchesBg(nPos * 4)) {
        visited[nPos] = 1
        queue.push(nPos)
      }
    }
    // Up
    if (y > 0) {
      const nPos = pos - width
      if (!visited[nPos] && matchesBg(nPos * 4)) {
        visited[nPos] = 1
        queue.push(nPos)
      }
    }
    // Down
    if (y < height - 1) {
      const nPos = pos + width
      if (!visited[nPos] && matchesBg(nPos * 4)) {
        visited[nPos] = 1
        queue.push(nPos)
      }
    }
  }
}

/**
 * Find connected components using BFS flood fill
 * @param {Uint8ClampedArray} data - ImageData.data (RGBA)
 * @param {number} width
 * @param {number} height
 * @param {number} minSize - Minimum region size to keep
 * @returns {Array<{x: number, y: number, w: number, h: number}>}
 */
function findConnectedComponents(data, width, height, minSize = 20) {
  const totalPixels = width * height
  const labels = new Int32Array(totalPixels)
  let currentLabel = 0
  const boundingBoxes = new Map()

  // Helper: check if pixel is non-transparent
  const isContent = (pos) => data[pos * 4 + 3] > 0

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pos = y * width + x

      // Skip if already labeled or transparent
      if (labels[pos] !== 0 || !isContent(pos)) continue

      // Start new component
      currentLabel++
      labels[pos] = currentLabel
      const queue = [pos]
      let head = 0
      let minX = x, minY = y, maxX = x, maxY = y

      // BFS flood fill
      while (head < queue.length) {
        const p = queue[head++]
        const px = p % width
        const py = (p / width) | 0

        // Update bounding box
        if (px < minX) minX = px
        if (px > maxX) maxX = px
        if (py < minY) minY = py
        if (py > maxY) maxY = py

        // Check 4-connected neighbors
        if (px > 0) {
          const np = p - 1
          if (labels[np] === 0 && isContent(np)) {
            labels[np] = currentLabel
            queue.push(np)
          }
        }
        if (px < width - 1) {
          const np = p + 1
          if (labels[np] === 0 && isContent(np)) {
            labels[np] = currentLabel
            queue.push(np)
          }
        }
        if (py > 0) {
          const np = p - width
          if (labels[np] === 0 && isContent(np)) {
            labels[np] = currentLabel
            queue.push(np)
          }
        }
        if (py < height - 1) {
          const np = p + width
          if (labels[np] === 0 && isContent(np)) {
            labels[np] = currentLabel
            queue.push(np)
          }
        }
      }

      boundingBoxes.set(currentLabel, { minX, minY, maxX, maxY })
    }
  }

  // Convert to regions and filter small ones
  const regions = []
  for (const [, box] of boundingBoxes) {
    const w = box.maxX - box.minX + 1
    const h = box.maxY - box.minY + 1
    if (w > minSize && h > minSize) {
      regions.push({ x: box.minX, y: box.minY, w, h })
    }
  }

  // Sort by position (top-to-bottom, left-to-right)
  regions.sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x)

  return regions
}

// Handle messages from main thread
self.onmessage = function(e) {
  const { imageData, width, height, backgroundColor, tolerance, minSize } = e.data

  // Step 1: Remove background (modifies imageData in place)
  removeBackground(imageData, width, height, backgroundColor, tolerance)

  // Step 2: Find connected components
  const regions = findConnectedComponents(imageData, width, height, minSize)

  // Return processed image data and regions
  self.postMessage(
    { imageData, regions },
    [imageData.buffer]  // Transfer back
  )
}
