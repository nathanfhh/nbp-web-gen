/**
 * OCR Worker Composable
 * Uses ONNX Runtime Web + PaddleOCR v5 models for text recognition
 * Models are cached in OPFS for fast subsequent loads
 */

import { ref } from 'vue'
import * as ort from 'onnxruntime-web'
import { useOcrModelCache } from './useOcrModelCache'

// Configure ONNX Runtime WASM paths (must match installed version)
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/'

/**
 * OCR result for a single text region
 * @typedef {Object} OcrResult
 * @property {string} text - Recognized text
 * @property {number} confidence - Confidence score (0-100)
 * @property {{ x: number, y: number, width: number, height: number }} bounds - Bounding box
 * @property {Array<[number, number]>} polygon - Original polygon points from detection
 */

// Singleton state for OCR sessions
let detSession = null
let recSession = null
let dictionary = null
let ocrInitialized = false
let ocrInitializing = false
let ocrInitPromise = null

/**
 * @returns {Object} OCR worker composable
 */
export function useOcrWorker() {
  const modelCache = useOcrModelCache()

  const isLoading = ref(false)
  const isReady = ref(ocrInitialized)
  const progress = ref(0)
  const status = ref('')
  const error = ref(null)

  /**
   * Initialize OCR models (singleton)
   */
  const initialize = async () => {
    if (ocrInitialized) {
      isReady.value = true
      status.value = 'OCR engine ready'
      progress.value = 100
      return
    }

    if (ocrInitializing && ocrInitPromise) {
      isLoading.value = true
      status.value = 'Waiting for OCR initialization...'
      try {
        await ocrInitPromise
        isReady.value = true
        status.value = 'OCR engine ready'
        progress.value = 100
      } catch (err) {
        error.value = err.message
        status.value = 'Failed to initialize OCR'
        throw err
      } finally {
        isLoading.value = false
      }
      return
    }

    ocrInitializing = true
    isLoading.value = true
    status.value = 'Initializing OCR engine...'
    error.value = null
    progress.value = 0

    ocrInitPromise = (async () => {
      try {
        // Load models from OPFS cache (or download)
        const models = await modelCache.loadAllModels((p) => {
          progress.value = Math.round(p * 0.7) // 70% for model loading
          status.value = modelCache.status.value
        })

        status.value = 'Creating ONNX sessions...'
        progress.value = 75

        // Create ONNX inference sessions
        const sessionOptions = {
          executionProviders: ['wasm'],
          graphOptimizationLevel: 'all',
        }

        detSession = await ort.InferenceSession.create(models.detection, sessionOptions)
        progress.value = 85

        recSession = await ort.InferenceSession.create(models.recognition, sessionOptions)
        progress.value = 95

        // Parse dictionary
        // Split by newline and remove ONLY the last entry if empty to avoid shifting indices
        // Do not use trim() or filter() as some valid characters (like ideographic space) are whitespace
        dictionary = models.dictionary.split(/\r?\n/)
        if (dictionary.length > 0 && dictionary[dictionary.length - 1] === '') {
          dictionary.pop()
        }
        dictionary.unshift('blank') // Add blank token at index 0

        ocrInitialized = true
        isReady.value = true
        progress.value = 100
        status.value = 'OCR engine ready'
      } catch (err) {
        console.error('Failed to initialize OCR:', err)
        error.value = err.message
        status.value = 'Failed to initialize OCR'
        ocrInitializing = false
        ocrInitPromise = null
        throw err
      } finally {
        isLoading.value = false
      }
    })()

    await ocrInitPromise
  }

  /**
   * Load image from various sources
   * @param {string|Blob|File|HTMLImageElement} image
   * @returns {Promise<HTMLImageElement>}
   */
  const loadImage = async (image) => {
    if (image instanceof HTMLImageElement) {
      if (image.complete) return image
      return new Promise((resolve, reject) => {
        image.onload = () => resolve(image)
        image.onerror = reject
      })
    }

    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Failed to load image'))

      if (typeof image === 'string') {
        // Check if it's a data URL or plain base64
        if (image.startsWith('data:')) {
          // Already a data URL
          img.src = image
        } else if (image.startsWith('http://') || image.startsWith('https://') || image.startsWith('blob:')) {
          // Regular URL
          img.src = image
        } else {
          // Assume it's plain base64 - detect image type and convert to data URL
          // Common base64 prefixes: /9j/ = JPEG, iVBOR = PNG, UklGR = WebP, R0lGOD = GIF
          let mimeType = 'image/png' // default
          if (image.startsWith('/9j/')) {
            mimeType = 'image/jpeg'
          } else if (image.startsWith('iVBOR')) {
            mimeType = 'image/png'
          } else if (image.startsWith('UklGR')) {
            mimeType = 'image/webp'
          } else if (image.startsWith('R0lGOD')) {
            mimeType = 'image/gif'
          }
          img.src = `data:${mimeType};base64,${image}`
        }
      } else if (image instanceof Blob || image instanceof File) {
        const url = URL.createObjectURL(image)
        img.onload = () => {
          URL.revokeObjectURL(url)
          resolve(img)
        }
        img.src = url
      } else {
        reject(new Error('Invalid image source'))
      }
    })
  }

  /**
   * Preprocess image for detection model
   * @param {HTMLImageElement} img
   * @returns {{ tensor: ort.Tensor, scale: number, width: number, height: number }}
   */
  const preprocessForDetection = (img) => {
    // Increased from 960 to 1280 to better detect small text
    const maxSideLen = 1280
    let width = img.naturalWidth
    let height = img.naturalHeight

    // Scale to max side length
    let scale = 1
    if (Math.max(width, height) > maxSideLen) {
      scale = maxSideLen / Math.max(width, height)
      width = Math.round(width * scale)
      height = Math.round(height * scale)
    }

    // Make dimensions divisible by 32 (required by model)
    const newWidth = Math.ceil(width / 32) * 32
    const newHeight = Math.ceil(height / 32) * 32

    // Draw to canvas
    const canvas = document.createElement('canvas')
    canvas.width = newWidth
    canvas.height = newHeight
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, newWidth, newHeight)
    ctx.drawImage(img, 0, 0, width, height)

    // Get image data and normalize
    const imageData = ctx.getImageData(0, 0, newWidth, newHeight)
    const data = imageData.data

    // Normalize: (pixel / 255 - mean) / std
    const mean = [0.485, 0.456, 0.406]
    const std = [0.229, 0.224, 0.225]

    const float32Data = new Float32Array(3 * newWidth * newHeight)
    for (let i = 0; i < newWidth * newHeight; i++) {
      const r = data[i * 4] / 255
      const g = data[i * 4 + 1] / 255
      const b = data[i * 4 + 2] / 255

      float32Data[i] = (r - mean[0]) / std[0]
      float32Data[newWidth * newHeight + i] = (g - mean[1]) / std[1]
      float32Data[2 * newWidth * newHeight + i] = (b - mean[2]) / std[2]
    }

    const tensor = new ort.Tensor('float32', float32Data, [1, 3, newHeight, newWidth])

    return {
      tensor,
      width: newWidth,
      height: newHeight,
      originalWidth: img.naturalWidth,
      originalHeight: img.naturalHeight,
      // Scale factors for coordinate mapping (model space -> original space)
      // Use 'width' and 'height' (scaled image dims) instead of 'newWidth'/'newHeight' (padded dims)
      // to ensure coordinates map correctly to the original image
      scaleX: img.naturalWidth / width,
      scaleY: img.naturalHeight / height,
    }
  }

  /**
   * Simple morphological dilation for binary mask
   * @param {Uint8Array} mask - Binary mask (0 or 255)
   * @param {number} width
   * @param {number} height
   * @param {number} iterations
   * @returns {Uint8Array}
   */
  const dilateMask = (mask, width, height, iterations) => {
    let current = mask
    let next = new Uint8Array(mask.length)

    for (let iter = 0; iter < iterations; iter++) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x
          if (current[idx] === 255) {
            next[idx] = 255
            // 4-connectivity dilation
            if (x > 0) next[idx - 1] = 255
            if (x < width - 1) next[idx + 1] = 255
            if (y > 0) next[idx - width] = 255
            if (y < height - 1) next[idx + width] = 255
          }
        }
      }
      // Swap buffers
      const temp = current
      current = next
      next = temp
      // Clear next buffer for subsequent iteration
      if (iter < iterations - 1) {
        next.fill(0)
      }
    }
    return current
  }

  /**
   * Post-process detection output (DBNet)
   * @param {ort.Tensor} output
   * @param {number} width - Model input width
   * @param {number} height - Model input height
   * @param {number} scaleX - X scale factor (originalWidth / modelWidth)
   * @param {number} scaleY - Y scale factor (originalHeight / modelHeight)
   * @param {number} originalWidth
   * @param {number} originalHeight
   * @returns {Array<{box: number[][], score: number}>}
   */
  const postProcessDetection = (output, width, height, scaleX, scaleY, originalWidth, originalHeight) => {
    let data = output.data
    const outputDims = output.dims
    // Lower threshold to detect fainter text (Original implementation uses 0.2)
    const threshold = 0.2
    const boxThreshold = 0.5
    // Reduce minArea to detect punctuation and small characters (Original uses 10)
    const minArea = 10 

    // Handle different output shapes: [1, 1, H, W], [1, H, W], or [H, W]
    // The actual spatial dimensions should match width x height
    let outputH, outputW
    if (outputDims.length === 4) {
      // [batch, channels, height, width]
      outputH = outputDims[2]
      outputW = outputDims[3]
    } else if (outputDims.length === 3) {
      // [batch, height, width] or [channels, height, width]
      outputH = outputDims[1]
      outputW = outputDims[2]
    } else {
      // [height, width]
      outputH = outputDims[0]
      outputW = outputDims[1]
    }

    console.log('[OCR Debug] postProcessDetection:', {
      expectedWxH: `${width}x${height}`,
      actualWxH: `${outputW}x${outputH}`,
      dataLength: data.length,
    })

    // If dimensions don't match, use output dimensions
    const actualWidth = outputW || width
    const actualHeight = outputH || height

    // Adjust scale factors for potential model downsampling
    // width/height are the INPUT tensor dimensions (padded)
    // actualWidth/actualHeight are the OUTPUT tensor dimensions
    // scaleX/scaleY are the pre-calculated scales from Input Content -> Original Image
    const finalScaleX = scaleX * (width / actualWidth)
    const finalScaleY = scaleY * (height / actualHeight)

    // Create binary mask
    let mask = new Uint8Array(actualWidth * actualHeight)
    for (let i = 0; i < actualWidth * actualHeight; i++) {
      mask[i] = data[i] > threshold ? 255 : 0
    }

    // Apply dilation to connect broken text components
    // Original implementation uses distinct horizontal (4) and vertical (2) dilation
    // Here we use a balanced dilation (2 iterations) which is generally sufficient
    mask = dilateMask(mask, actualWidth, actualHeight, 2)

    // Find contours using simple connected component analysis
    const boxes = []
    const visited = new Set()

    for (let y = 0; y < actualHeight; y++) {
      for (let x = 0; x < actualWidth; x++) {
        const idx = y * actualWidth + x
        if (mask[idx] === 0 || visited.has(idx)) continue

        // BFS to find connected component
        const component = []
        const queue = [[x, y]]
        visited.add(idx)

        while (queue.length > 0) {
          const [cx, cy] = queue.shift()
          component.push([cx, cy])

          // Check 4-connected neighbors
          const neighbors = [
            [cx - 1, cy],
            [cx + 1, cy],
            [cx, cy - 1],
            [cx, cy + 1],
          ]

          for (const [nx, ny] of neighbors) {
            if (nx < 0 || nx >= actualWidth || ny < 0 || ny >= actualHeight) continue
            const nidx = ny * actualWidth + nx
            if (mask[nidx] === 0 || visited.has(nidx)) continue
            visited.add(nidx)
            queue.push([nx, ny])
          }
        }

        // Filter by minimum area (in model space)
        if (component.length < minArea) continue

        // Get bounding box in model space
        let minX = Infinity,
          maxX = -Infinity
        let minY = Infinity,
          maxY = -Infinity

        for (const [px, py] of component) {
          minX = Math.min(minX, px)
          maxX = Math.max(maxX, px)
          minY = Math.min(minY, py)
          maxY = Math.max(maxY, py)
        }

        // Calculate unclip offset (DBNet expansion)
        // The model outputs a shrunk text region. We need to expand it back to the full text boundary.
        // offset = Area * unclip_ratio / Perimeter
        const w = maxX - minX + 1
        const h = maxY - minY + 1
        const area = component.length
        const perimeter = 2 * (w + h)
        // Slightly reduced unclip ratio because dilation already expanded the box somewhat
        const unclipRatio = 1.5 
        const offset = (area * unclipRatio) / perimeter

        // Expand the box
        const expandedMinX = Math.max(0, minX - offset)
        const expandedMinY = Math.max(0, minY - offset)
        const expandedMaxX = Math.min(actualWidth - 1, maxX + offset)
        const expandedMaxY = Math.min(actualHeight - 1, maxY + offset)

        // Calculate average score in region (using the original heatmap, NOT the dilated mask)
        // We use the coordinates of the component to sample the original confidence map
        let scoreSum = 0
        for (const [px, py] of component) {
          scoreSum += data[py * actualWidth + px]
        }
        const score = scoreSum / component.length

        if (score < boxThreshold) continue

        // Scale back to original image coordinates using final scale factors
        const box = [
          [expandedMinX * finalScaleX, expandedMinY * finalScaleY],
          [expandedMaxX * finalScaleX, expandedMinY * finalScaleY],
          [expandedMaxX * finalScaleX, expandedMaxY * finalScaleY],
          [expandedMinX * finalScaleX, expandedMaxY * finalScaleY],
        ]

        // Clip to image bounds
        for (const point of box) {
          point[0] = Math.max(0, Math.min(originalWidth, point[0]))
          point[1] = Math.max(0, Math.min(originalHeight, point[1]))
        }

        boxes.push({ box, score })
      }
    }

    return boxes
  }

  /**
   * Crop and preprocess region for recognition
   * @param {HTMLImageElement} img
   * @param {number[][]} box - 4 corner points
   * @returns {ort.Tensor}
   */
  const preprocessForRecognition = (img, box) => {
    const targetHeight = 48
    const maxWidth = 320

    // Get bounding box
    const xs = box.map((p) => p[0])
    const ys = box.map((p) => p[1])
    const x0 = Math.floor(Math.min(...xs))
    const y0 = Math.floor(Math.min(...ys))
    const x1 = Math.ceil(Math.max(...xs))
    const y1 = Math.ceil(Math.max(...ys))

    const cropWidth = x1 - x0
    const cropHeight = y1 - y0

    if (cropWidth <= 0 || cropHeight <= 0) {
      return null
    }

    // Calculate target width maintaining aspect ratio
    const aspectRatio = cropWidth / cropHeight
    let targetWidth = Math.round(targetHeight * aspectRatio)
    targetWidth = Math.min(targetWidth, maxWidth)
    targetWidth = Math.max(targetWidth, 10)

    // Crop and resize
    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const ctx = canvas.getContext('2d')

    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, targetWidth, targetHeight)
    ctx.drawImage(img, x0, y0, cropWidth, cropHeight, 0, 0, targetWidth, targetHeight)

    // Get image data and normalize
    const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight)
    const data = imageData.data

    // Normalize: (pixel / 255 - 0.5) / 0.5
    const float32Data = new Float32Array(3 * targetWidth * targetHeight)
    for (let i = 0; i < targetWidth * targetHeight; i++) {
      const r = (data[i * 4] / 255 - 0.5) / 0.5
      const g = (data[i * 4 + 1] / 255 - 0.5) / 0.5
      const b = (data[i * 4 + 2] / 255 - 0.5) / 0.5

      float32Data[i] = r
      float32Data[targetWidth * targetHeight + i] = g
      float32Data[2 * targetWidth * targetHeight + i] = b
    }

    return new ort.Tensor('float32', float32Data, [1, 3, targetHeight, targetWidth])
  }

  /**
   * Decode recognition output using CTC
   * @param {ort.Tensor} output
   * @returns {{ text: string, confidence: number }}
   */
  const decodeRecognition = (output) => {
    const data = output.data
    const dims = output.dims
    const seqLen = dims[1]
    const vocabSize = dims[2]

    let text = ''
    let totalConf = 0
    let charCount = 0
    let prevIdx = 0

    for (let t = 0; t < seqLen; t++) {
      // Find argmax for this timestep
      let maxIdx = 0
      let maxVal = data[t * vocabSize]

      for (let v = 1; v < vocabSize; v++) {
        const val = data[t * vocabSize + v]
        if (val > maxVal) {
          maxVal = val
          maxIdx = v
        }
      }

      // CTC: skip blank (0) and repeated characters
      if (maxIdx !== 0 && maxIdx !== prevIdx) {
        if (maxIdx < dictionary.length) {
          text += dictionary[maxIdx]
          totalConf += Math.exp(maxVal) // Softmax approximation
          charCount++
        }
      }

      prevIdx = maxIdx
    }

    const confidence = charCount > 0 ? Math.round((totalConf / charCount) * 100) : 0
    return { text, confidence: Math.min(100, confidence) }
  }

  /**
   * Calculate standard deviation of an array of numbers
   * @param {number[]} arr
   * @returns {number}
   */
  const getStandardDeviation = (arr) => {
    if (arr.length <= 1) return 0
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length
    const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length
    return Math.sqrt(variance)
  }

  /**
   * Infer alignment of a group of text lines
   * @param {Array} lines
   * @returns {'left'|'center'|'right'}
   */
  const inferAlignment = (lines) => {
    if (lines.length <= 1) return 'left'

    const lefts = lines.map((l) => l.bounds.x)
    const centers = lines.map((l) => l.bounds.x + l.bounds.width / 2)
    const rights = lines.map((l) => l.bounds.x + l.bounds.width)

    const leftStd = getStandardDeviation(lefts)
    const centerStd = getStandardDeviation(centers)
    const rightStd = getStandardDeviation(rights)

    // Heuristics:
    // If center variation is significantly smaller than others -> Center
    // If right variation is very small -> Right
    // Default -> Left

    // Give slight bias to left alignment as it's most common
    if (centerStd < leftStd * 0.8 && centerStd < rightStd * 0.8) return 'center'
    if (rightStd < leftStd * 0.8 && rightStd < centerStd) return 'right'

    return 'left'
  }

  /**
   * Merge separate text lines into paragraphs/blocks
   * @param {OcrResult[]} rawResults
   * @returns {OcrResult[]}
   */
  const mergeTextRegions = (rawResults) => {
    if (rawResults.length === 0) return []

    // 1. Sort by Y coordinate (Top to Bottom)
    const sorted = [...rawResults].sort((a, b) => a.bounds.y - b.bounds.y)

    const groups = []

    // 2. Clustering
    for (const line of sorted) {
      let added = false

      // Try to add to existing groups (look at the last added group mostly)
      // We iterate backwards to find the closest vertical neighbor
      for (let i = groups.length - 1; i >= 0; i--) {
        const group = groups[i]
        const lastLine = group.lines[group.lines.length - 1]

        // Logic Criteria:
        // A. Vertical Proximity: Distance is less than N * LineHeight
        const verticalDist = line.bounds.y - (lastLine.bounds.y + lastLine.bounds.height)
        const avgHeight = (line.bounds.height + lastLine.bounds.height) / 2
        // Allow gap up to 1.0x line height (standard paragraph spacing)
        const isCloseVertically = verticalDist < avgHeight * 1.2 && verticalDist > -avgHeight * 0.5

        // B. Font Size Similarity: Height diff < 25%
        const heightDiffRatio = Math.abs(line.bounds.height - lastLine.bounds.height) / Math.max(line.bounds.height, lastLine.bounds.height)
        const isSimilarSize = heightDiffRatio < 0.25

        // C. Horizontal Overlap: They must align somewhat (prevent merging 2 columns)
        const l1 = lastLine.bounds.x
        const r1 = lastLine.bounds.x + lastLine.bounds.width
        const l2 = line.bounds.x
        const r2 = line.bounds.x + line.bounds.width
        const overlap = Math.max(0, Math.min(r1, r2) - Math.max(l1, l2))
        const minWidth = Math.min(lastLine.bounds.width, line.bounds.width)
        // Overlap must be at least 30% of the smaller line's width, or they are essentially centered/aligned
        const isHorizontallyAligned = overlap > minWidth * 0.3 ||
          (Math.abs((l1 + r1) / 2 - (l2 + r2) / 2) < minWidth * 0.5) // Centers are close

        if (isCloseVertically && isSimilarSize && isHorizontallyAligned) {
          group.lines.push(line)
          added = true
          break // Found a home for this line, stop searching
        }
      }

      if (!added) {
        groups.push({ lines: [line] })
      }
    }

    // 3. Convert groups back to OcrResult format with inferred properties
    return groups.map(group => {
      const lines = group.lines

      // Calculate bounding box union
      const minX = Math.min(...lines.map(l => l.bounds.x))
      const minY = Math.min(...lines.map(l => l.bounds.y))
      const maxX = Math.max(...lines.map(l => l.bounds.x + l.bounds.width))
      const maxY = Math.max(...lines.map(l => l.bounds.y + l.bounds.height))

      // Join text with newlines
      const text = lines.map(l => l.text).join('\n')

      // Average confidence
      const confidence = lines.reduce((sum, l) => sum + l.confidence, 0) / lines.length

      // Infer Alignment
      const alignment = inferAlignment(lines)

      return {
        text,
        confidence,
        bounds: {
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY
        },
        // We keep the polygon of the bounding box union (approximate)
        polygon: [
          [minX, minY],
          [maxX, minY],
          [maxX, maxY],
          [minX, maxY]
        ],
        // Additional metadata for PPTX generation
        alignment,
        fontSize: lines.reduce((sum, l) => sum + l.bounds.height, 0) / lines.length // Average height as font size
      }
    })
  }

  /**
   * Recognize text in an image
   * @param {string|Blob|File|HTMLImageElement} image
   * @returns {Promise<OcrResult[]>}
   */
  const recognize = async (image) => {
    if (!ocrInitialized) {
      await initialize()
    }

    isLoading.value = true
    progress.value = 0
    status.value = 'Loading image...'
    error.value = null

    try {
      const img = await loadImage(image)
      progress.value = 10
      status.value = 'Detecting text regions...'

      // Detection
      const { tensor: detTensor, width, height, originalWidth, originalHeight, scaleX, scaleY } = preprocessForDetection(img)

      console.log('[OCR Debug] Preprocessing:', {
        originalWidth, originalHeight,
        modelWidth: width, modelHeight: height,
        scaleX, scaleY,
        tensorShape: detTensor.dims,
      })

      const detFeeds = { [detSession.inputNames[0]]: detTensor }
      const detResults = await detSession.run(detFeeds)
      const detOutput = detResults[detSession.outputNames[0]]

      console.log('[OCR Debug] Detection output:', {
        outputShape: detOutput.dims,
        dataLength: detOutput.data.length,
        expectedLength: width * height,
        sampleValues: Array.from(detOutput.data.slice(0, 10)),
      })

      progress.value = 40
      status.value = 'Processing detection results...'

      const detectedBoxes = postProcessDetection(detOutput, width, height, scaleX, scaleY, originalWidth, originalHeight)

      console.log('[OCR Debug] Detected boxes:', detectedBoxes.length, detectedBoxes.slice(0, 3))

      if (detectedBoxes.length === 0) {
        status.value = 'No text detected'
        progress.value = 100
        return []
      }

      progress.value = 50
      status.value = `Recognizing ${detectedBoxes.length} text regions...`

      // Recognition
      const rawResults = []
      for (let i = 0; i < detectedBoxes.length; i++) {
        const { box } = detectedBoxes[i]

        const recTensor = preprocessForRecognition(img, box)
        if (!recTensor) continue

        const recFeeds = { [recSession.inputNames[0]]: recTensor }
        const recResults = await recSession.run(recFeeds)
        const recOutput = recResults[recSession.outputNames[0]]

        const { text, confidence } = decodeRecognition(recOutput)

        if (text.trim()) {
          const xs = box.map((p) => p[0])
          const ys = box.map((p) => p[1])

          rawResults.push({
            text: text.trim(),
            confidence,
            bounds: {
              x: Math.min(...xs),
              y: Math.min(...ys),
              width: Math.max(...xs) - Math.min(...xs),
              height: Math.max(...ys) - Math.min(...ys),
            },
            polygon: box,
          })
        }

        progress.value = 50 + Math.round((i / detectedBoxes.length) * 45)
      }

      // Merge text regions (Layout Analysis)
      status.value = 'Analyzing layout...'
      const mergedResults = mergeTextRegions(rawResults)

      status.value = `Found ${mergedResults.length} text blocks (${rawResults.length} lines)`
      progress.value = 100
      
      // Return both merged (for PPTX) and raw (for Inpainting) results
      return {
        regions: mergedResults,
        rawRegions: rawResults
      }
    } catch (err) {
      console.error('OCR recognition failed:', err)
      error.value = err.message
      status.value = 'Recognition failed'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Recognize text in multiple images
   * @param {Array} images
   * @param {function} onProgress
   * @returns {Promise<OcrResult[][]>}
   */
  const recognizeMultiple = async (images, onProgress) => {
    const results = []
    for (let i = 0; i < images.length; i++) {
      if (onProgress) {
        onProgress(i + 1, images.length)
      }
      const result = await recognize(images[i])
      results.push(result)
    }
    return results
  }

  /**
   * Generate mask from OCR results
   * @param {number} width
   * @param {number} height
   * @param {OcrResult[]} ocrResults
   * @param {number} padding
   * @returns {ImageData}
   */
  const generateMask = (width, height, ocrResults, padding = 5) => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')

    ctx.fillStyle = 'black'
    ctx.fillRect(0, 0, width, height)

    ctx.fillStyle = 'white'
    ctx.strokeStyle = 'white'
    ctx.lineWidth = padding * 2
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    for (const result of ocrResults) {
      if (result.polygon && result.polygon.length >= 3) {
        ctx.beginPath()
        ctx.moveTo(result.polygon[0][0], result.polygon[0][1])
        for (let i = 1; i < result.polygon.length; i++) {
          ctx.lineTo(result.polygon[i][0], result.polygon[i][1])
        }
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      } else {
        const { x, y, width: w, height: h } = result.bounds
        ctx.fillRect(
          Math.max(0, x - padding),
          Math.max(0, y - padding),
          Math.min(width - x + padding, w + padding * 2),
          Math.min(height - y + padding, h + padding * 2)
        )
      }
    }

    return ctx.getImageData(0, 0, width, height)
  }

  /**
   * Terminate OCR engine
   */
  const terminate = () => {
    isReady.value = false
    status.value = 'OCR engine terminated'
    // Note: ONNX sessions are kept for reuse
  }

  return {
    // State
    isLoading,
    isReady,
    progress,
    status,
    error,

    // Methods
    initialize,
    recognize,
    recognizeMultiple,
    generateMask,
    terminate,

    // Model cache access
    modelCache,
  }
}

// Export available languages
export const OCR_LANGUAGES = [{ code: 'ch', label: '中文/English (Chinese + English)' }]

export const OCR_MODEL_VERSIONS = [{ code: 'PP-OCRv5', label: 'PP-OCRv5 Server (PaddleOCR)' }]
