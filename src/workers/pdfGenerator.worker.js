/**
 * PDF Generator Worker
 * Generates PDF from images off the main thread using pdf-lib
 * Uses OffscreenCanvas for WebP → PNG conversion
 */
import { PDFDocument } from 'pdf-lib'

/**
 * Convert image blob to PNG using OffscreenCanvas
 * Required because pdf-lib only supports PNG and JPEG
 * @param {Blob} blob - Image blob (may be WebP or other format)
 * @returns {Promise<ArrayBuffer>} PNG ArrayBuffer
 */
async function convertToPng(blob) {
  // Check OffscreenCanvas support
  if (typeof OffscreenCanvas === 'undefined') {
    throw new Error('OffscreenCanvas not supported. Please use a modern browser (Chrome 69+, Firefox 105+, Safari 16.4+)')
  }

  const bitmap = await createImageBitmap(blob)
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()

  const pngBlob = await canvas.convertToBlob({ type: 'image/png' })
  return await pngBlob.arrayBuffer()
}

/**
 * Generate PDF from image data
 * @param {Array<{data: ArrayBuffer, mimeType: string}>} images
 * @returns {Promise<ArrayBuffer>} PDF ArrayBuffer
 */
async function generatePdf(images) {
  const pdfDoc = await PDFDocument.create()

  for (const image of images) {
    let arrayBuffer = image.data
    const mimeType = image.mimeType || 'image/png'

    // pdf-lib only supports PNG and JPEG
    const isPng = mimeType === 'image/png'
    const isJpeg = mimeType === 'image/jpeg' || mimeType === 'image/jpg'

    if (!isPng && !isJpeg) {
      // Convert WebP/other formats to PNG using OffscreenCanvas
      const blob = new Blob([arrayBuffer], { type: mimeType })
      arrayBuffer = await convertToPng(blob)
    }

    // Embed image
    const pdfImage = isJpeg
      ? await pdfDoc.embedJpg(arrayBuffer)
      : await pdfDoc.embedPng(arrayBuffer)

    // Create page with exact image dimensions
    const page = pdfDoc.addPage([pdfImage.width, pdfImage.height])
    page.drawImage(pdfImage, {
      x: 0,
      y: 0,
      width: pdfImage.width,
      height: pdfImage.height,
    })
  }

  return await pdfDoc.save()
}

// Handle messages from main thread
self.onmessage = async function (e) {
  const { images } = e.data

  try {
    const pdfBytes = await generatePdf(images)
    // Transfer ArrayBuffer back to main thread
    self.postMessage({ success: true, data: pdfBytes }, [pdfBytes.buffer])
  } catch (error) {
    self.postMessage({ success: false, error: error.message })
  }
}
