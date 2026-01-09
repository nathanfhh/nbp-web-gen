/**
 * PNG Color Quantization Web Worker
 * Uses image-q library for color quantization with alpha channel support
 */

import { buildPalette, applyPalette, utils } from 'image-q'

self.onmessage = async function (e) {
  const { imageData, width, height, targetColors = 256 } = e.data

  try {
    // Convert Uint8ClampedArray to PointContainer
    const pointContainer = utils.PointContainer.fromUint8Array(imageData, width, height)

    // Build color palette using Wu's quantization (better for images with transparency)
    const palette = await buildPalette([pointContainer], {
      colorDistanceFormula: 'euclidean-bt709', // Good for perceived color difference
      paletteQuantization: 'wuquant', // Wu's quantizer, good quality
      colors: targetColors,
    })

    // Apply palette with Floyd-Steinberg dithering to reduce banding
    const outPointContainer = await applyPalette(pointContainer, palette, {
      colorDistanceFormula: 'euclidean-bt709',
      imageQuantization: 'floyd-steinberg', // Dithering for smoother gradients
    })

    // Convert back to Uint8Array
    const outImageData = outPointContainer.toUint8Array()

    // Transfer the buffer back to main thread
    self.postMessage({ imageData: outImageData }, [outImageData.buffer])
  } catch (error) {
    self.postMessage({ error: error.message })
  }
}
