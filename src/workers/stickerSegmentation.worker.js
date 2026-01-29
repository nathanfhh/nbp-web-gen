/**
 * Sticker Segmentation Worker
 * Performs background removal + projection-based region detection off the main thread
 */

/**
 * Remove background using edge-connected flood fill
 * Protects interior pixels that match background color
 * @param {Uint8ClampedArray} data - Raw RGBA pixel data, modified in place
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

    // Check 8-connected neighbors (includes diagonals)
    const xMin = x > 0
    const xMax = x < width - 1
    const yMin = y > 0
    const yMax = y < height - 1

    // Cardinal directions
    if (xMin) {
      const nPos = pos - 1
      if (!visited[nPos] && matchesBg(nPos * 4)) {
        visited[nPos] = 1
        queue.push(nPos)
      }
    }
    if (xMax) {
      const nPos = pos + 1
      if (!visited[nPos] && matchesBg(nPos * 4)) {
        visited[nPos] = 1
        queue.push(nPos)
      }
    }
    if (yMin) {
      const nPos = pos - width
      if (!visited[nPos] && matchesBg(nPos * 4)) {
        visited[nPos] = 1
        queue.push(nPos)
      }
    }
    if (yMax) {
      const nPos = pos + width
      if (!visited[nPos] && matchesBg(nPos * 4)) {
        visited[nPos] = 1
        queue.push(nPos)
      }
    }
    // Diagonal directions
    if (xMin && yMin) {
      const nPos = pos - width - 1
      if (!visited[nPos] && matchesBg(nPos * 4)) {
        visited[nPos] = 1
        queue.push(nPos)
      }
    }
    if (xMax && yMin) {
      const nPos = pos - width + 1
      if (!visited[nPos] && matchesBg(nPos * 4)) {
        visited[nPos] = 1
        queue.push(nPos)
      }
    }
    if (xMin && yMax) {
      const nPos = pos + width - 1
      if (!visited[nPos] && matchesBg(nPos * 4)) {
        visited[nPos] = 1
        queue.push(nPos)
      }
    }
    if (xMax && yMax) {
      const nPos = pos + width + 1
      if (!visited[nPos] && matchesBg(nPos * 4)) {
        visited[nPos] = 1
        queue.push(nPos)
      }
    }
  }
}

/**
 * Find sticker regions using projection-based segmentation
 * Better for grid-based sticker sheets where text and characters may be separate
 * @param {Uint8ClampedArray} data - Raw RGBA pixel data
 * @param {number} width
 * @param {number} height
 * @param {number} minSize - Minimum region size to keep
 * @returns {Array<{x: number, y: number, w: number, h: number}>}
 */
function findRegionsProjection(data, width, height, minSize = 20) {
  // Helper: check if row has any non-transparent content
  const isRowHasContent = (y) => {
    const rowStart = y * width * 4
    for (let x = 0; x < width; x++) {
      if (data[rowStart + x * 4 + 3] > 0) return true
    }
    return false
  }

  // Helper: check if column has content in Y range
  const isColHasContent = (x, yStart, yEnd) => {
    for (let y = yStart; y < yEnd; y++) {
      if (data[(y * width + x) * 4 + 3] > 0) return true
    }
    return false
  }

  const regions = []

  // Step 1: Find horizontal rows with content
  const rowRegions = []
  let inContent = false
  let startY = 0

  for (let y = 0; y < height; y++) {
    const hasContent = isRowHasContent(y)
    if (hasContent && !inContent) {
      inContent = true
      startY = y
    } else if (!hasContent && inContent) {
      inContent = false
      rowRegions.push({ y: startY, h: y - startY })
    }
  }
  if (inContent) rowRegions.push({ y: startY, h: height - startY })

  // Step 2: For each row, find columns with content
  for (const row of rowRegions) {
    let inItem = false
    let startX = 0

    for (let x = 0; x < width; x++) {
      const hasContent = isColHasContent(x, row.y, row.y + row.h)
      if (hasContent && !inItem) {
        inItem = true
        startX = x
      } else if (!hasContent && inItem) {
        inItem = false
        regions.push({ x: startX, y: row.y, w: x - startX, h: row.h })
      }
    }
    if (inItem) regions.push({ x: startX, y: row.y, w: width - startX, h: row.h })
  }

  // Filter out small noise regions
  const validRegions = regions.filter(r => r.w > minSize && r.h > minSize)

  // Sort by position (top-to-bottom, left-to-right)
  validRegions.sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x)

  return validRegions
}

/**
 * Extend a line segment to the image edges
 * NOTE: This function is duplicated in SeparatorEditor.vue for UI preview.
 *       If you modify this logic, update both locations.
 * @param {{x: number, y: number}} start - Start point
 * @param {{x: number, y: number}} end - End point
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {{start: {x: number, y: number}, end: {x: number, y: number}}}
 */
function extendLineToEdges(start, end, width, height) {
  const dx = end.x - start.x
  const dy = end.y - start.y

  // Handle degenerate case (same point)
  if (dx === 0 && dy === 0) {
    return { start, end }
  }

  let extStart, extEnd

  if (Math.abs(dx) >= Math.abs(dy)) {
    // More horizontal: extend to left (x=0) and right (x=width-1)
    const slope = dy / dx
    extStart = {
      x: 0,
      y: Math.round(start.y + slope * (0 - start.x)),
    }
    extEnd = {
      x: width - 1,
      y: Math.round(start.y + slope * (width - 1 - start.x)),
    }
  } else {
    // More vertical: extend to top (y=0) and bottom (y=height-1)
    const slope = dx / dy
    extStart = {
      x: Math.round(start.x + slope * (0 - start.y)),
      y: 0,
    }
    extEnd = {
      x: Math.round(start.x + slope * (height - 1 - start.y)),
      y: height - 1,
    }
  }

  // Clamp to bounds
  extStart.x = Math.max(0, Math.min(width - 1, extStart.x))
  extStart.y = Math.max(0, Math.min(height - 1, extStart.y))
  extEnd.x = Math.max(0, Math.min(width - 1, extEnd.x))
  extEnd.y = Math.max(0, Math.min(height - 1, extEnd.y))

  return { start: extStart, end: extEnd }
}

/**
 * Rasterize a line with given width using Bresenham's algorithm
 * @param {{x: number, y: number}} start - Start point
 * @param {{x: number, y: number}} end - End point
 * @param {number} lineWidth - Line width in pixels (default 3)
 * @returns {Array<{x: number, y: number}>} Array of pixel coordinates
 */
function rasterizeLine(start, end, lineWidth = 3) {
  const pixels = []
  const halfWidth = Math.floor(lineWidth / 2)

  // Bresenham's line algorithm
  let x0 = Math.round(start.x)
  let y0 = Math.round(start.y)
  const x1 = Math.round(end.x)
  const y1 = Math.round(end.y)

  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx - dy

  while (true) {
    // Add pixels with line width
    for (let ox = -halfWidth; ox <= halfWidth; ox++) {
      for (let oy = -halfWidth; oy <= halfWidth; oy++) {
        pixels.push({ x: x0 + ox, y: y0 + oy })
      }
    }

    if (x0 === x1 && y0 === y1) break
    const e2 = 2 * err
    if (e2 > -dy) {
      err -= dy
      x0 += sx
    }
    if (e2 < dx) {
      err += dx
      y0 += sy
    }
  }

  return pixels
}

/**
 * Find connected regions from a binary mask using flood fill
 * @param {Uint8Array} mask - Binary mask (1 = content, 0 = barrier/background)
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} minSize - Minimum region size to keep
 * @returns {Array<{x: number, y: number, w: number, h: number}>}
 */
function findRegionsFromMask(mask, width, height, minSize = 20) {
  const visited = new Uint8Array(width * height)
  const regions = []

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pos = y * width + x
      if (mask[pos] === 1 && !visited[pos]) {
        // Start flood fill for this region
        let minX = x, maxX = x, minY = y, maxY = y
        const queue = [pos]
        visited[pos] = 1

        let head = 0
        while (head < queue.length) {
          const p = queue[head++]
          const px = p % width
          const py = (p / width) | 0

          minX = Math.min(minX, px)
          maxX = Math.max(maxX, px)
          minY = Math.min(minY, py)
          maxY = Math.max(maxY, py)

          // 4-connected neighbors
          const neighbors = [
            p - 1, p + 1, p - width, p + width,
          ]
          const xCheck = [px > 0, px < width - 1, true, true]
          const yCheck = [true, true, py > 0, py < height - 1]

          for (let i = 0; i < 4; i++) {
            const np = neighbors[i]
            if (xCheck[i] && yCheck[i] && mask[np] === 1 && !visited[np]) {
              visited[np] = 1
              queue.push(np)
            }
          }
        }

        const w = maxX - minX + 1
        const h = maxY - minY + 1
        if (w > minSize && h > minSize) {
          regions.push({ x: minX, y: minY, w, h })
        }
      }
    }
  }

  // Sort by position (top-to-bottom, left-to-right)
  regions.sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x)

  return regions
}

/**
 * Process image in manual separator mode
 * User-drawn lines define region boundaries
 * @param {Uint8ClampedArray} data - Raw RGBA pixel data
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {{r: number, g: number, b: number}} bgColor - Background color
 * @param {number} tolerance - Tolerance for background removal
 * @param {number} erosion - Edge erosion iterations
 * @param {Array<{start: {x: number, y: number}, end: {x: number, y: number}}>} separatorLines - User-drawn lines
 * @param {number} minSize - Minimum region size
 * @returns {{data: Uint8ClampedArray, regions: Array}}
 */
function processManualMode(data, width, height, bgColor, tolerance, erosion, separatorLines, minSize) {
  // Step 1: Create mask (all 1s = content)
  const mask = new Uint8Array(width * height).fill(1)

  // Step 2: Draw separator lines on mask (0 = barrier)
  for (const line of separatorLines) {
    const extended = extendLineToEdges(line.start, line.end, width, height)
    const pixels = rasterizeLine(extended.start, extended.end, 3)
    for (const { x, y } of pixels) {
      if (x >= 0 && x < width && y >= 0 && y < height) {
        mask[y * width + x] = 0
      }
    }
  }

  // Step 3: Find regions from mask (NOT affected by tolerance!)
  const regions = findRegionsFromMask(mask, width, height, minSize)

  // Step 4: Remove background from ORIGINAL image
  removeBackground(data, width, height, bgColor, tolerance)

  // Step 5: Draw separator lines on image (transparent cuts)
  for (const line of separatorLines) {
    const extended = extendLineToEdges(line.start, line.end, width, height)
    const pixels = rasterizeLine(extended.start, extended.end, 3)
    for (const { x, y } of pixels) {
      if (x >= 0 && x < width && y >= 0 && y < height) {
        data[(y * width + x) * 4 + 3] = 0 // Set alpha to 0
      }
    }
  }

  // Step 6: Erode edges
  if (erosion > 0) {
    erodeEdges(data, width, height, erosion)
  }

  return { data, regions }
}

/**
 * Erode edges of non-transparent regions by removing boundary pixels
 * Each iteration removes one layer of edge pixels (8-connected)
 * @param {Uint8ClampedArray} data - Raw RGBA pixel data, modified in place
 * @param {number} width
 * @param {number} height
 * @param {number} iterations - Number of erosion passes (0 = skip)
 */
function erodeEdges(data, width, height, iterations) {
  if (iterations <= 0) return

  for (let iter = 0; iter < iterations; iter++) {
    // Collect boundary pixels to remove (must collect first, then clear)
    const toRemove = []

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pos = y * width + x
        // Skip already transparent pixels
        if (data[pos * 4 + 3] === 0) continue

        // Check 8-connected neighbors for any transparent pixel
        const xMin = x > 0
        const xMax = x < width - 1
        const yMin = y > 0
        const yMax = y < height - 1

        let isBoundary = false

        // Cardinal
        if (xMin && data[(pos - 1) * 4 + 3] === 0) isBoundary = true
        else if (xMax && data[(pos + 1) * 4 + 3] === 0) isBoundary = true
        else if (yMin && data[(pos - width) * 4 + 3] === 0) isBoundary = true
        else if (yMax && data[(pos + width) * 4 + 3] === 0) isBoundary = true
        // Diagonal
        else if (xMin && yMin && data[(pos - width - 1) * 4 + 3] === 0) isBoundary = true
        else if (xMax && yMin && data[(pos - width + 1) * 4 + 3] === 0) isBoundary = true
        else if (xMin && yMax && data[(pos + width - 1) * 4 + 3] === 0) isBoundary = true
        else if (xMax && yMax && data[(pos + width + 1) * 4 + 3] === 0) isBoundary = true

        if (isBoundary) {
          toRemove.push(pos)
        }
      }
    }

    // Clear all boundary pixels at once
    for (let i = 0; i < toRemove.length; i++) {
      data[toRemove[i] * 4 + 3] = 0
    }
  }
}

// Handle messages from main thread
self.onmessage = function(e) {
  const {
    imageData: pixelData,
    width,
    height,
    backgroundColor,
    tolerance,
    minSize,
    erosion = 0,
    mode = 'auto',
    separatorLines = [],
  } = e.data

  let regions

  if (mode === 'manual' && separatorLines.length > 0) {
    // Manual mode: use user-drawn separator lines
    const result = processManualMode(
      pixelData,
      width,
      height,
      backgroundColor,
      tolerance,
      erosion,
      separatorLines,
      minSize
    )
    regions = result.regions
  } else {
    // Auto mode: original behavior
    // Step 1: Remove background (modifies pixelData in place)
    removeBackground(pixelData, width, height, backgroundColor, tolerance)

    // Step 1.5: Erode edges to remove boundary artifacts
    erodeEdges(pixelData, width, height, erosion)

    // Step 2: Find regions using projection-based segmentation
    regions = findRegionsProjection(pixelData, width, height, minSize)
  }

  // Return processed pixel data and regions
  self.postMessage(
    { imageData: pixelData, regions, erosion },
    [pixelData.buffer] // Transfer back
  )
}
