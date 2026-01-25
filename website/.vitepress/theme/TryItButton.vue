<script setup>
import { computed } from 'vue'
import { useData } from 'vitepress'

const props = defineProps({
  mode: {
    type: String,
    default: '',
    validator: (value) => !value || ['generate', 'sticker', 'edit', 'story', 'diagram', 'video'].includes(value),
  },
  // Direct path for standalone pages (e.g., 'slide-to-pptx')
  path: {
    type: String,
    default: '',
  },
  prompt: {
    type: String,
    default: '',
  },
  // For edit mode: show a note about needing to upload an image
  showUploadNote: {
    type: Boolean,
    default: false,
  },
})

const { lang } = useData()

// Get app base URL from environment variable
const appBaseUrl = import.meta.env.VITE_APP_BASE_URL || '/nbp-web-gen/'

// Build the full URL with query params
const tryItUrl = computed(() => {
  // If path is provided, use it directly (for standalone pages like slide-to-pptx)
  if (props.path) {
    return `${appBaseUrl}${props.path}`
  }

  // Otherwise, use mode-based URL
  const params = new URLSearchParams()
  if (props.mode) {
    params.set('mode', props.mode)
  }
  if (props.prompt) {
    // Convert literal \n strings to actual newlines (for multiline prompts in markdown)
    const processedPrompt = props.prompt.replace(/\\n/g, '\n')
    params.set('prompt', processedPrompt)
  }
  return `${appBaseUrl}?${params.toString()}`
})

// i18n texts
const buttonText = computed(() => (lang.value === 'zh-TW' ? '立即試試' : 'Try It Now'))
const uploadNoteText = computed(() =>
  lang.value === 'zh-TW' ? '需先上傳圖片' : 'Upload an image first'
)
</script>

<template>
  <div class="try-it-container">
    <a :href="tryItUrl" target="_blank" rel="noopener" class="try-it-button">
      <svg
        class="try-it-icon"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <polygon points="5 3 19 12 5 21 5 3" />
      </svg>
      <span>{{ buttonText }}</span>
      <svg
        class="try-it-arrow"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <line x1="7" y1="17" x2="17" y2="7" />
        <polyline points="7 7 17 7 17 17" />
      </svg>
    </a>
    <span v-if="showUploadNote" class="upload-note">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
      {{ uploadNoteText }}
    </span>
  </div>
</template>

<style scoped>
.try-it-container {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin: 16px 0;
}

.try-it-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
  font-weight: 600;
  font-size: 15px;
  border-radius: 8px;
  text-decoration: none;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
}

.try-it-button:hover {
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
  transform: translateY(-1px);
}

.try-it-button:active {
  transform: translateY(0);
}

.try-it-icon {
  flex-shrink: 0;
}

.try-it-arrow {
  flex-shrink: 0;
  opacity: 0.8;
}

.upload-note {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--vp-c-text-2);
}

/* Dark mode adjustments */
.dark .try-it-button {
  background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
}

.dark .try-it-button:hover {
  background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%);
}
</style>
