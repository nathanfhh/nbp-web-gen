/**
 * Global Audio Manager - Singleton pattern for audio playback mutual exclusion
 *
 * Ensures only one audio source plays at a time across the entire application.
 * When a new audio starts playing, any previously playing audio is paused.
 *
 * Usage:
 * - Call registerPlaying() when starting audio playback
 * - Call unregisterPlaying() when audio stops/pauses
 * - Call pauseAll() to stop all playing audio (e.g., when opening Lightbox)
 */

// Module-level singleton state
let currentPauseFn = null

/**
 * Register a playing audio source
 * @param {HTMLAudioElement|null} _audioEl - The audio element (optional, for reference, unused)
 * @param {Function} pauseFn - Function to call to pause this audio
 */
export function registerPlaying(_audioEl, pauseFn) {
  // Pause any previously playing audio
  if (currentPauseFn && currentPauseFn !== pauseFn) {
    currentPauseFn()
  }

  currentPauseFn = pauseFn
}

/**
 * Unregister a playing audio source (call when audio stops/pauses)
 * @param {Function} pauseFn - The same pauseFn passed to registerPlaying
 */
export function unregisterPlaying(pauseFn) {
  if (currentPauseFn === pauseFn) {
    currentPauseFn = null
  }
}

/**
 * Pause all currently playing audio
 * Useful when opening a modal/lightbox that will play its own audio
 */
export function pauseAll() {
  if (currentPauseFn) {
    currentPauseFn()
    currentPauseFn = null
  }
}

/**
 * Composable wrapper for Vue components
 */
export function useGlobalAudioManager() {
  return {
    registerPlaying,
    unregisterPlaying,
    pauseAll,
  }
}
