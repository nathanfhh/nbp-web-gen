/**
 * Image generation options constants
 * Centralized constants for resolution, aspect ratio, and model configuration
 */

// Model Configuration
export const DEFAULT_MODEL = 'gemini-3-pro-image-preview'

// Resolution options for UI display
export const RESOLUTION_OPTIONS = [
  { value: '1k', label: '1K' },
  { value: '2k', label: '2K' },
  { value: '4k', label: '4K' },
]

// Resolution mapping for Gemini API (must be uppercase)
export const RESOLUTION_API_MAP = {
  '1k': '1K',
  '2k': '2K',
  '4k': '4K',
}

// Aspect ratio options for Generate mode (includes 21:9)
export const RATIO_OPTIONS_FULL = [
  { value: '1:1', label: '1:1' },
  { value: '3:4', label: '3:4' },
  { value: '4:3', label: '4:3' },
  { value: '9:16', label: '9:16' },
  { value: '16:9', label: '16:9' },
  { value: '21:9', label: '21:9' },
]

// Aspect ratio options for Sticker mode (no 21:9)
export const RATIO_OPTIONS_STANDARD = [
  { value: '1:1', label: '1:1' },
  { value: '3:4', label: '3:4' },
  { value: '4:3', label: '4:3' },
  { value: '9:16', label: '9:16' },
  { value: '16:9', label: '16:9' },
]

// Aspect ratio mapping for Gemini API
export const RATIO_API_MAP = {
  '1:1': '1:1',
  '3:4': '3:4',
  '4:3': '4:3',
  '9:16': '9:16',
  '16:9': '16:9',
  '21:9': '21:9',
}
