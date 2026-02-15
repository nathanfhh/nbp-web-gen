/**
 * UMAP Dimensionality Reduction Web Worker
 *
 * Reduces high-dimensional embedding vectors to 3D coordinates for visualization.
 * Uses umap-js library for client-side UMAP computation.
 *
 * Communication Protocol:
 * Main → Worker:
 *   { type: 'reduce', vectors: number[][], nNeighbors?, minDist? }
 *
 * Worker → Main:
 *   { type: 'result', coordinates: number[][] }  // [N, 3]
 *   { type: 'error', message: string }
 */

import { UMAP } from 'umap-js'

self.onmessage = (event) => {
  const { type, vectors, nNeighbors = 15, minDist = 0.1 } = event.data

  if (type !== 'reduce') return

  try {
    if (!vectors || !vectors.length) {
      throw new Error('No vectors provided')
    }

    const umap = new UMAP({
      nComponents: 3,
      nNeighbors: Math.min(nNeighbors, vectors.length - 1),
      minDist,
    })

    const coordinates = umap.fit(vectors)

    self.postMessage({ type: 'result', coordinates })
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message || 'UMAP computation failed' })
  }
}
