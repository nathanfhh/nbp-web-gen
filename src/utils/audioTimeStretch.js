/**
 * Time-stretch PCM audio using WSOLA — preserves pitch.
 * Pure JavaScript implementation with no external dependencies.
 *
 * WSOLA (Waveform Similarity Overlap-Add) works by reading overlapping windows
 * from the input at a faster rate than they are written to the output. A cross-
 * correlation search finds the best alignment for each window so that the
 * crossfade is smooth and artifact-free.
 *
 * @param {Float32Array} pcmData - Mono PCM samples
 * @param {number} speed - Playback speed multiplier (e.g. 1.5 = 1.5x faster)
 * @param {number} [sampleRate=48000] - Sample rate of the input
 * @returns {Promise<Float32Array>} Stretched mono PCM
 */
export async function timeStretchPcm(pcmData, speed, sampleRate = 48000) {
  if (!pcmData || pcmData.length === 0) return pcmData
  if (speed === 1) return pcmData

  // --- WSOLA parameters (tuned for speech) ---
  const WINDOW_MS = 40        // analysis window (ms)
  const OVERLAP_RATIO = 0.5   // overlap as fraction of window
  const SEARCH_MS = 8         // cross-correlation search radius (ms)
  const CORR_STRIDE = 4       // subsample correlation (4x speed boost)
  const SEARCH_STRIDE = 4     // coarse search stride, refined around best

  const windowSize = Math.round(WINDOW_MS / 1000 * sampleRate)
  const overlap = Math.round(windowSize * OVERLAP_RATIO)
  const searchRadius = Math.round(SEARCH_MS / 1000 * sampleRate)
  const hopOut = windowSize - overlap
  const hopIn = Math.round(hopOut * speed)

  const inputLen = pcmData.length

  // For very short input, return as-is (not enough for two windows)
  if (inputLen < windowSize * 2) return pcmData

  const maxOutputLen = Math.ceil(inputLen / speed) + windowSize
  const output = new Float32Array(maxOutputLen)

  // Hann crossfade ramps
  const fadeIn = new Float32Array(overlap)
  const fadeOut = new Float32Array(overlap)
  for (let i = 0; i < overlap; i++) {
    fadeIn[i] = 0.5 * (1 - Math.cos(Math.PI * i / overlap))
    fadeOut[i] = 1 - fadeIn[i]
  }

  // Seed output with the first window from input
  output.set(pcmData.subarray(0, Math.min(windowSize, inputLen)))

  let outPos = hopOut
  let inPos = hopIn
  let writtenEnd = Math.min(windowSize, inputLen)

  /**
   * Normalized cross-correlation between the output tail at outPos
   * and a candidate region in the input. Subsampled for performance.
   */
  function correlate(candidateStart) {
    let dot = 0, nA = 0, nB = 0
    for (let i = 0; i < overlap; i += CORR_STRIDE) {
      const a = output[outPos + i]
      const b = pcmData[candidateStart + i]
      dot += a * b
      nA += a * a
      nB += b * b
    }
    const denom = Math.sqrt(nA * nB)
    return denom > 1e-10 ? dot / denom : 0
  }

  while (outPos + windowSize <= maxOutputLen) {
    // Search bounds (clamped to valid input range)
    const searchLo = Math.max(0, inPos - searchRadius)
    const searchHi = Math.min(inputLen - windowSize, inPos + searchRadius)
    if (searchHi < searchLo) break

    // --- Coarse search (every SEARCH_STRIDE-th candidate) ---
    let bestPos = Math.min(Math.max(inPos, searchLo), searchHi)
    let bestScore = -Infinity
    for (let c = searchLo; c <= searchHi; c += SEARCH_STRIDE) {
      const s = correlate(c)
      if (s > bestScore) { bestScore = s; bestPos = c }
    }

    // --- Fine search around coarse best ---
    const fineLo = Math.max(searchLo, bestPos - SEARCH_STRIDE)
    const fineHi = Math.min(searchHi, bestPos + SEARCH_STRIDE)
    for (let c = fineLo; c <= fineHi; c++) {
      const s = correlate(c)
      if (s > bestScore) { bestScore = s; bestPos = c }
    }

    // Crossfade the overlap region
    for (let i = 0; i < overlap; i++) {
      output[outPos + i] = output[outPos + i] * fadeOut[i] + pcmData[bestPos + i] * fadeIn[i]
    }

    // Copy the non-overlapping portion of the window
    const copyEnd = Math.min(windowSize, inputLen - bestPos, maxOutputLen - outPos)
    for (let i = overlap; i < copyEnd; i++) {
      output[outPos + i] = pcmData[bestPos + i]
    }

    writtenEnd = outPos + copyEnd
    outPos += hopOut
    inPos += hopIn  // advance nominal position (maintains target speed ratio)
  }

  return output.slice(0, writtenEnd)
}
