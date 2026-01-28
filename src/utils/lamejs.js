/**
 * lamejs ESM Wrapper
 *
 * lamejs is a CJS-only package with deep internal require() chains.
 * Vite/esbuild cannot correctly pre-bundle it (MPEGMode and other
 * internal symbols are lost during CJS→ESM conversion).
 *
 * Workaround: load the pre-built `lame.all.js` bundle as raw text
 * and evaluate it. That file is a self-contained IIFE where all
 * internal references are resolved within a single function scope.
 */

let _lamejs = null

export async function loadLamejs() {
  if (_lamejs) return _lamejs

  const { default: source } = await import('lamejs/lame.all.js?raw')
  // lame.all.js defines `function lamejs() { ... }` then calls `lamejs()`.
  // The call adds Mp3Encoder/WavHeader as properties on the function object.
  const factory = new Function(source + '\nreturn lamejs;')
  _lamejs = factory()
  return _lamejs
}
