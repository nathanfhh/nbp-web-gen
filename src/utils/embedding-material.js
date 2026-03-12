// ============================================================================
// Embedding Material — Per-mode strategy for preparing multimodal embedding input
// Follows the Strategy Pattern (same as promptBuilders.js)
// ============================================================================

/**
 * Strip whitespace and truncate text to maxLength.
 * @param {string} text
 * @param {number} maxLength
 * @returns {string}
 */
function stripAndTruncate(text, maxLength) {
  const stripped = (text || '').replace(/\s+/g, ' ').trim()
  return stripped.length > maxLength ? stripped.slice(0, maxLength) : stripped
}

/**
 * Default builder: prompt + each image as a separate embedding material item.
 * Used by generate, edit, story, diagram, agent modes.
 * @param {Object} record - History record (stripped for indexing, with images opfsPath retained)
 * @returns {Array<{ text: string, imagePath: string, originalIndex: number }>}
 */
function buildDefault(record) {
  const images = record.images
  if (!Array.isArray(images) || images.length === 0) return []
  const text = record.prompt || ''
  return images
    .map((img, i) => ({ img, i }))
    .filter(({ img }) => img?.opfsPath)
    .map(({ img, i }) => ({ text, imagePath: img.opfsPath, originalIndex: i }))
}

/**
 * Sticker builder: only embed the original sticker sheet (images[0]),
 * not the individually split stickers.
 */
function buildSticker(record) {
  const images = record.images
  if (!Array.isArray(images) || images.length === 0) return []
  const firstImage = images[0]
  if (!firstImage?.opfsPath) return []
  return [{ text: record.prompt || '', imagePath: firstImage.opfsPath, originalIndex: 0 }]
}

/**
 * Slides builder: per-page content + narration script + image.
 * Each page produces one embedding material item with rich contextual text.
 */
function buildSlides(record) {
  const images = record.images
  if (!Array.isArray(images) || images.length === 0) return []

  return images
    .map((img, originalIndex) => ({ img, originalIndex }))
    .filter(({ img }) => img?.opfsPath)
    .map(({ img, originalIndex }) => {
      const pageContent = record.options?.pagesContent?.[originalIndex]?.content || ''
      const narrationScript = record.narration?.scripts?.[originalIndex]?.script || ''
      const combined = `${pageContent} ${narrationScript}`
      const text = stripAndTruncate(combined, 1024) || record.prompt || ''
      return { text, imagePath: img.opfsPath, originalIndex }
    })
}

// Strategy pattern: map mode to embedding material builder
const builders = {
  generate: buildDefault,
  sticker: buildSticker,
  edit: buildDefault,
  story: buildDefault,
  diagram: buildDefault,
  slides: buildSlides,
  agent: buildDefault,
  video: () => [],
}

/**
 * Prepare multimodal embedding material for a history record.
 * Returns an array of { text, imagePath } items, each producing one image embedding chunk.
 *
 * @param {Object} record - History record (should include images with opfsPath)
 * @returns {Array<{ text: string, imagePath: string, originalIndex: number }>}
 */
export function prepareEmbeddingMaterial(record) {
  if (!record) return []
  const mode = record.mode || ''
  const builder = builders[mode]
  if (!builder) return []
  return builder(record)
}

// Export individual builders for testing
export { buildDefault, buildSticker, buildSlides, stripAndTruncate }
