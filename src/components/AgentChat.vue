<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGeneratorStore } from '@/stores/generator'
import { useAgentApi } from '@/composables/useAgentApi'
import { useApiKeyManager } from '@/composables/useApiKeyManager'
import { useToast } from '@/composables/useToast'
import { compressToWebP, blobToBase64 } from '@/composables/useImageCompression'
import { MAX_UPLOAD_IMAGES } from '@/constants/defaults'
import AgentMessage from './AgentMessage.vue'
import ImageLightbox from './ImageLightbox.vue'
import ConfirmModal from './ConfirmModal.vue'

// Gemini API inline_data limit is 10MB, compress if larger than 1MB for safety
const COMPRESS_THRESHOLD = 1 * 1024 * 1024 // 1MB

const { t } = useI18n()
const store = useGeneratorStore()
const toast = useToast()
const { sendMessageWithFallback } = useAgentApi()
const { hasApiKeyFor } = useApiKeyManager()

// Refs
const messagesContainer = ref(null)
const inputTextarea = ref(null)
const fileInput = ref(null)
const confirmModal = ref(null)

// State
const inputText = ref('')
const pendingImages = ref([]) // { data: base64, mimeType, preview, name, isCompressing }
const isProcessing = ref(false)

// Check if any image is still compressing
const isAnyImageCompressing = computed(() =>
  pendingImages.value.some((img) => img.isCompressing)
)

// Lightbox state
const showLightbox = ref(false)
const lightboxImages = ref([])
const lightboxInitialIndex = ref(0)

// Computed
const conversation = computed(() => store.agentConversation)
const streamingMessage = computed(() => store.agentStreamingMessage)
// Use hasApiKeyFor('text') to support Free Tier key fallback
const hasApiKey = computed(() => hasApiKeyFor('text'))

const canSend = computed(() => {
  const hasContent = inputText.value.trim() || pendingImages.value.length > 0
  return hasContent && !isProcessing.value && !isAnyImageCompressing.value && hasApiKey.value
})

const hasConversation = computed(() => store.agentConversation.length > 0)

// Auto-scroll to bottom when new messages arrive
const scrollToBottom = () => {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

watch(conversation, () => {
  scrollToBottom()
}, { deep: true })

watch(streamingMessage, () => {
  scrollToBottom()
}, { deep: true })

// Initialize session if needed
onMounted(() => {
  if (!store.agentSessionId) {
    store.startNewAgentSession()
  }
  scrollToBottom()
})

// Handle sending message
const sendMessage = async () => {
  if (!canSend.value) return

  const text = inputText.value.trim()
  const images = [...pendingImages.value]

  // Clear input immediately for better UX
  inputText.value = ''
  pendingImages.value = []

  isProcessing.value = true

  try {
    // Build user message parts
    const userParts = []

    // Add images
    for (const img of images) {
      userParts.push({
        type: 'image',
        mimeType: img.mimeType,
        data: img.data,
      })
    }

    // Add text
    if (text) {
      userParts.push({
        type: 'text',
        content: text,
      })
    }

    // Snapshot conversation BEFORE adding user message
    // This prevents the message from being included twice in API request
    const conversationSnapshot = [...store.agentConversation]

    // Add user message to conversation (for immediate UI feedback)
    store.addAgentMessage({
      role: 'user',
      parts: userParts,
    })

    // Prepare streaming message
    store.setAgentStreamingMessage({
      role: 'model',
      parts: [],
      isStreaming: true,
    })

    // Send to API with streaming (using snapshot without current message)
    await sendMessageWithFallback(
      text,
      images.map((img) => ({ data: img.data, mimeType: img.mimeType })),
      {
        conversation: conversationSnapshot,
        onPart: (part, accumulatedParts) => {
          // Update streaming message with accumulated parts
          store.setAgentStreamingMessage({
            role: 'model',
            parts: [...accumulatedParts],
            isStreaming: true,
          })
        },
        onComplete: async (finalParts) => {
          // Clear streaming message
          store.clearAgentStreamingMessage()

          // Add final model message to conversation
          store.addAgentMessage({
            role: 'model',
            parts: finalParts,
          })

          // Auto-save conversation to history (incremental)
          try {
            await store.saveAgentConversation()
          } catch (err) {
            console.error('[AgentChat] Auto-save failed:', err)
          }
        },
        onError: (error) => {
          store.clearAgentStreamingMessage()
          toast.error(error.message || t('agent.sendFailed'))
        },
      }
    )
  } catch (error) {
    console.error('[AgentChat] Error:', error)
    // Clear streaming message on error to prevent UI getting stuck
    store.clearAgentStreamingMessage()
    toast.error(error.message || t('agent.sendFailed'))
  } finally {
    isProcessing.value = false
  }
}

// Handle Ctrl+Enter (Cmd+Enter on Mac) to send, Enter for newline
const handleKeydown = (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    sendMessage()
  }
}

// Handle new session
const handleNewSession = async () => {
  if (!hasConversation.value) {
    store.startNewAgentSession()
    return
  }

  const confirmed = await confirmModal.value?.show({
    title: t('agent.newSessionConfirmTitle'),
    message: t('agent.newSessionConfirmMessage'),
    confirmText: t('agent.newSession'),
    cancelText: t('common.cancel'),
  })

  if (confirmed) {
    // Current conversation is already auto-saved, just start fresh
    store.startNewAgentSession()
    toast.success(t('agent.newSessionCreated'))
  }
}

// Handle clear conversation
const handleClearConversation = async () => {
  if (!hasConversation.value) return

  const confirmed = await confirmModal.value?.show({
    title: t('agent.clearConfirmTitle'),
    message: t('agent.clearConfirmMessage'),
    confirmText: t('common.clear'),
    cancelText: t('common.cancel'),
  })

  if (confirmed) {
    store.clearAgentConversation()
    toast.success(t('agent.conversationCleared'))
  }
}

// Handle image upload
const openImagePicker = () => {
  fileInput.value?.click()
}

const handleFileSelect = async (e) => {
  const files = e.target.files
  if (!files?.length) return

  const remainingSlots = MAX_UPLOAD_IMAGES - pendingImages.value.length

  if (remainingSlots <= 0) {
    toast.warning(t('agent.maxImagesReached', { max: MAX_UPLOAD_IMAGES }))
    return
  }

  const filesToProcess = Array.from(files).slice(0, remainingSlots)

  for (const file of filesToProcess) {
    if (!file.type.startsWith('image/')) continue
    // Add image immediately with loading state, compress in background
    addImageWithCompression(file, file.name)
  }

  // Reset file input
  e.target.value = ''
}

/**
 * Add image to pending list immediately, then compress in background
 * This provides instant feedback to user while compression runs
 */
const addImageWithCompression = async (file, name) => {
  const imageId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const preview = URL.createObjectURL(file)

  // Add to pending images immediately with loading state
  pendingImages.value.push({
    id: imageId,
    data: null, // Will be filled after compression
    mimeType: null,
    preview,
    name,
    isCompressing: true,
  })

  try {
    const { data, mimeType } = await processImageFile(file)

    // Find and update the image entry (it might have been removed)
    const index = pendingImages.value.findIndex((img) => img.id === imageId)
    if (index !== -1) {
      pendingImages.value[index].data = data
      pendingImages.value[index].mimeType = mimeType
      pendingImages.value[index].isCompressing = false
    }
  } catch (err) {
    console.error('Failed to process image:', err)
    // Remove failed image
    const index = pendingImages.value.findIndex((img) => img.id === imageId)
    if (index !== -1) {
      URL.revokeObjectURL(preview)
      pendingImages.value.splice(index, 1)
      toast.error(t('agent.imageProcessFailed'))
    }
  }
}

/**
 * Process an image file - compress to WebP if needed
 * Clipboard pastes convert images to uncompressed PNG (300KB JPG → 16MB PNG)
 * Always compress to WebP to stay under Gemini's 10MB inline_data limit
 */
const processImageFile = async (file) => {
  // Read file as base64
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  // Always compress to WebP for consistency and smaller size
  // This handles the clipboard PNG explosion issue
  if (file.size > COMPRESS_THRESHOLD || file.type === 'image/png') {
    try {
      const compressed = await compressToWebP(
        { data: base64, mimeType: file.type },
        { quality: 0.85 }
      )
      const compressedBase64 = await blobToBase64(compressed.blob)
      console.log(
        `[AgentChat] Compressed ${(file.size / 1024 / 1024).toFixed(2)}MB → ${(compressed.compressedSize / 1024 / 1024).toFixed(2)}MB`
      )
      return { data: compressedBase64, mimeType: 'image/webp' }
    } catch (err) {
      console.warn('[AgentChat] Compression failed, using original:', err)
    }
  }

  return { data: base64, mimeType: file.type }
}

const removePendingImage = (index) => {
  const img = pendingImages.value[index]
  if (img.preview) {
    URL.revokeObjectURL(img.preview)
  }
  pendingImages.value.splice(index, 1)
}

// Handle paste (for images)
const handlePaste = (e) => {
  const items = e.clipboardData?.items
  if (!items) return

  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault()

      // Check if we can add more images
      if (pendingImages.value.length >= MAX_UPLOAD_IMAGES) {
        toast.warning(t('agent.maxImagesReached', { max: MAX_UPLOAD_IMAGES }))
        return
      }

      const file = item.getAsFile()
      if (file) {
        // Add image immediately with loading state, compress in background
        addImageWithCompression(file, `pasted-image-${Date.now()}.webp`)
      }
    }
  }
}

// Handle image click in messages (open lightbox)
const handleImageClick = ({ part }) => {
  // Note: ImageLightbox's getImageSrc expects raw base64 in `data`, not full data URL
  lightboxImages.value = [{
    data: part.data,
    mimeType: part.mimeType,
  }]
  lightboxInitialIndex.value = 0
  showLightbox.value = true
}

// Handle "continue about this image" action
const handleContinueAbout = ({ part }) => {
  // Add the image to pending images for the next message
  pendingImages.value.push({
    data: part.data,
    mimeType: part.mimeType,
    preview: `data:${part.mimeType};base64,${part.data}`,
    name: `follow-up-image.${part.mimeType.split('/')[1]}`,
  })

  // Focus the input
  inputTextarea.value?.focus()

  toast.info(t('agent.imageAddedForFollowup'))
}

// Cleanup
onUnmounted(() => {
  // Revoke blob URLs
  for (const img of pendingImages.value) {
    if (img.preview && img.preview.startsWith('blob:')) {
      URL.revokeObjectURL(img.preview)
    }
  }
})
</script>

<template>
  <div class="agent-chat flex flex-col h-[calc(100dvh-10rem)] min-h-[400px]">
    <!-- Messages area (scrollable) -->
    <div
      ref="messagesContainer"
      class="flex-1 min-h-[300px] overflow-y-auto px-4 py-2 space-y-2 agent-messages-scroll"
    >
      <!-- Empty state -->
      <div
        v-if="conversation.length === 0 && !streamingMessage"
        class="h-full flex flex-col items-center justify-center text-center py-12"
      >
        <div class="w-16 h-16 rounded-2xl bg-mode-generate-muted flex items-center justify-center mb-4">
          <svg class="w-8 h-8 text-mode-generate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <p class="text-text-secondary mb-2">{{ $t('agent.emptySession') }}</p>
        <p class="text-sm text-text-muted max-w-md">{{ $t('agent.emptySessionHint') }}</p>
      </div>

      <!-- Messages -->
      <AgentMessage
        v-for="msg in conversation"
        :key="msg.id"
        :message="msg"
        @image-click="handleImageClick"
        @continue-about="handleContinueAbout"
      />

      <!-- Streaming message -->
      <AgentMessage
        v-if="streamingMessage"
        :message="streamingMessage"
        :is-streaming="true"
        @image-click="handleImageClick"
        @continue-about="handleContinueAbout"
      />
    </div>

    <!-- Input area (fixed at bottom) -->
    <div class="flex-shrink-0 border-t border-border-muted bg-bg-card/50 backdrop-blur-sm p-4">
      <!-- Action toolbar -->
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2">
          <!-- New Session Button -->
          <button
            @click="handleNewSession"
            class="px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 bg-bg-muted hover:bg-bg-interactive text-text-secondary hover:text-text-primary"
            :title="$t('agent.newSession')"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            {{ $t('agent.newSession') }}
          </button>

          <!-- Clear Conversation Button -->
          <button
            v-if="hasConversation"
            @click="handleClearConversation"
            class="px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 bg-status-error-muted hover:bg-status-error/20 text-status-error"
            :title="$t('agent.clearConversation')"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            {{ $t('agent.clearConversation') }}
          </button>
        </div>

        <!-- Send hint -->
        <span class="text-xs text-text-muted hidden sm:block">
          {{ $t('agent.sendHint') }}
        </span>
      </div>

      <!-- Pending images preview -->
      <div v-if="pendingImages.length > 0" class="flex flex-wrap gap-2 mb-3">
        <div
          v-for="(img, index) in pendingImages"
          :key="img.id || index"
          class="relative group"
        >
          <img
            :src="img.preview"
            :alt="img.name"
            class="w-16 h-16 object-cover rounded-lg border border-border-muted"
            :class="{ 'opacity-50': img.isCompressing }"
          />
          <!-- Compressing indicator -->
          <div
            v-if="img.isCompressing"
            class="absolute inset-0 flex items-center justify-center"
          >
            <div class="w-5 h-5 border-2 border-brand-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
          <!-- Remove button (hidden while compressing) -->
          <button
            v-if="!img.isCompressing"
            @click="removePendingImage(index)"
            class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-status-error text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Input row -->
      <div class="flex items-center gap-2">
        <!-- Hidden file input -->
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          multiple
          class="hidden"
          @change="handleFileSelect"
        />

        <!-- Attach button -->
        <button
          @click="openImagePicker"
          class="flex-shrink-0 w-10 h-10 rounded-xl hover:bg-bg-muted text-text-muted hover:text-mode-generate transition-colors flex items-center justify-center"
          :title="$t('agent.attachImage')"
          :disabled="isProcessing"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
        </button>

        <!-- Text input -->
        <div class="flex-1 relative">
          <textarea
            ref="inputTextarea"
            v-model="inputText"
            @keydown="handleKeydown"
            @paste="handlePaste"
            :placeholder="$t('agent.placeholder')"
            :disabled="isProcessing || !hasApiKey"
            rows="1"
            class="w-full px-4 py-2.5 rounded-xl border border-border-muted bg-bg-input text-text-primary placeholder-text-muted resize-none focus:outline-none focus:ring-2 focus:ring-mode-generate focus:border-transparent transition-all max-h-32"
            style="min-height: 44px;"
          ></textarea>
        </div>

        <!-- Send button -->
        <button
          @click="sendMessage"
          :disabled="!canSend"
          class="flex-shrink-0 w-10 h-10 rounded-xl transition-all flex items-center justify-center"
          :class="canSend
            ? 'bg-mode-generate text-text-on-brand hover:brightness-110'
            : 'bg-bg-muted text-text-muted cursor-not-allowed'"
          :title="$t('agent.sendHint')"
        >
          <svg v-if="isProcessing" class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
          <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>

      <!-- API key warning -->
      <p v-if="!hasApiKey" class="text-xs text-status-warning mt-2">
        {{ $t('errors.noApiKey') }}
      </p>
    </div>

    <!-- Image Lightbox -->
    <ImageLightbox
      v-model="showLightbox"
      :images="lightboxImages"
      :initial-index="lightboxInitialIndex"
      @close="showLightbox = false"
    />

    <!-- Confirm Modal -->
    <ConfirmModal ref="confirmModal" />
  </div>
</template>

<style scoped>
.agent-messages-scroll::-webkit-scrollbar {
  width: 6px;
}

.agent-messages-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.agent-messages-scroll::-webkit-scrollbar-thumb {
  background: var(--color-border-default);
  border-radius: 3px;
}

.agent-messages-scroll::-webkit-scrollbar-thumb:hover {
  background: var(--color-border-focus);
}

/* Firefox */
.agent-messages-scroll {
  scrollbar-width: thin;
  scrollbar-color: var(--color-border-default) transparent;
}

/* Auto-resize textarea */
textarea {
  field-sizing: content;
}
</style>
