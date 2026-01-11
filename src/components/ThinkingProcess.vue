<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGeneratorStore } from '@/stores/generator'
import { formatElapsed } from '@/composables/useFormatTime'
import { useToast } from '@/composables/useToast'
import ImageLightbox from './ImageLightbox.vue'

const { t } = useI18n()
const store = useGeneratorStore()
const toast = useToast()
const contentRef = ref(null)
const isExpanded = ref(true)

// Lightbox state
const lightboxOpen = ref(false)
const lightboxIndex = ref(0)

// Extract all thinking images for lightbox
const thinkingImages = computed(() => {
  return store.thinkingProcess
    .filter((chunk) => chunk.type === 'image')
    .map((chunk) => ({
      data: chunk.data,
      mimeType: chunk.mimeType || 'image/png',
    }))
})

const openLightbox = (imageIndex) => {
  lightboxIndex.value = imageIndex
  lightboxOpen.value = true
}

// Combined text from all text thinking chunks
const thinkingText = computed(() => {
  return store.thinkingProcess
    .filter((chunk) => chunk.type === 'text')
    .map((chunk) => chunk.content)
    .join('')
})

// Parse thinking process into steps with timestamps
// Pattern: **Step Title**\n\nContent... (for text)
// Also includes images between steps
const thinkingSteps = computed(() => {
  const text = thinkingText.value
  const startTime = store.generationStartTime
  const allChunks = store.thinkingProcess

  // If no content at all, return empty
  if (!text && thinkingImages.value.length === 0) return []

  // Build a map of accumulated text length to timestamp (only for text chunks)
  let accumulatedLength = 0
  const timestampMap = []
  for (const chunk of allChunks) {
    if (chunk.type === 'text') {
      timestampMap.push({
        startPos: accumulatedLength,
        endPos: accumulatedLength + chunk.content.length,
        timestamp: chunk.timestamp,
      })
      accumulatedLength += chunk.content.length
    }
  }

  // Helper to find timestamp for a position in text
  const getTimestampForPosition = (pos) => {
    for (const entry of timestampMap) {
      if (pos >= entry.startPos && pos < entry.endPos) {
        return entry.timestamp
      }
    }
    return timestampMap[timestampMap.length - 1]?.timestamp || startTime
  }

  // Split by **Title** pattern and track positions
  const stepPattern = /\*\*([^*]+)\*\*/g
  const parts = text.split(stepPattern)

  const steps = []
  let currentPos = 0

  // parts[0] is text before first **, usually empty
  currentPos += parts[0]?.length || 0

  // parts[1] is first title, parts[2] is first content, etc.
  for (let i = 1; i < parts.length; i += 2) {
    const title = parts[i]?.trim()
    const content = parts[i + 1]?.trim() || ''

    if (title) {
      // Get timestamp for when this step started (position of **)
      const stepTimestamp = getTimestampForPosition(currentPos)
      const elapsedMs = startTime ? stepTimestamp - startTime : 0

      steps.push({
        type: 'text',
        title,
        content,
        timestamp: stepTimestamp,
        elapsedMs,
      })
    }

    // Update position: ** + title + ** + content
    currentPos += 2 + (parts[i]?.length || 0) + 2 + (parts[i + 1]?.length || 0)
  }

  // If no text steps found but we have text, treat entire text as one step
  if (steps.length === 0 && text.trim()) {
    const firstTimestamp = allChunks.find((c) => c.type === 'text')?.timestamp || startTime
    steps.push({
      type: 'text',
      title: t('thinking.defaultTitle'),
      content: text.trim(),
      timestamp: firstTimestamp,
      elapsedMs: startTime ? firstTimestamp - startTime : 0,
    })
  }

  // Now integrate images into the timeline based on timestamps
  const imageChunks = allChunks.filter((c) => c.type === 'image')
  const combinedSteps = []
  let imageIndex = 0 // Track which image we're on for lightbox

  // Merge text steps and images by timestamp
  let textIdx = 0
  let imgIdx = 0

  while (textIdx < steps.length || imgIdx < imageChunks.length) {
    const textStep = steps[textIdx]
    const imgChunk = imageChunks[imgIdx]

    if (!imgChunk || (textStep && textStep.timestamp <= imgChunk.timestamp)) {
      combinedSteps.push(textStep)
      textIdx++
    } else {
      combinedSteps.push({
        type: 'image',
        data: imgChunk.data,
        mimeType: imgChunk.mimeType,
        timestamp: imgChunk.timestamp,
        elapsedMs: startTime ? imgChunk.timestamp - startTime : 0,
        imageIndex: imageIndex++,
      })
      imgIdx++
    }
  }

  return combinedSteps
})

// Auto-scroll to bottom when new content arrives
watch(
  () => store.thinkingProcess.length,
  async () => {
    await nextTick()
    if (contentRef.value && isExpanded.value) {
      contentRef.value.scrollTop = contentRef.value.scrollHeight
    }
  }
)

const toggleExpanded = () => {
  isExpanded.value = !isExpanded.value
}

const copyToClipboard = async () => {
  try {
    await navigator.clipboard.writeText(thinkingText.value)
    toast.success(t('thinking.copiedToClipboard'))
  } catch (err) {
    console.error('Failed to copy:', err)
    toast.error(t('thinking.copyFailed'))
  }
}

// Step status based on index and streaming state
const getStepStatus = (index) => {
  if (!store.isStreaming) return 'completed'
  if (index < thinkingSteps.value.length - 1) return 'completed'
  return 'active'
}
</script>

<template>
  <div
    v-if="store.thinkingProcess.length > 0 || store.isStreaming"
    class="glass p-6 lg:p-8 fade-in"
  >
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-3">
        <div
          class="w-10 h-10 rounded-xl flex items-center justify-center bg-bg-muted"
        >
          <svg
            v-if="store.isStreaming"
            class="w-5 h-5 text-status-info animate-pulse"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
          <svg v-else class="w-5 h-5 text-mode-generate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <div>
          <h4 class="text-sm font-semibold text-text-primary">
            {{ store.isStreaming ? $t('thinking.aiThinking') : $t('thinking.title') }}
          </h4>
          <p class="text-xs text-text-muted">
            {{ store.isStreaming ? $t('thinking.streaming') : $t('thinking.steps', { count: thinkingSteps.length }) }}
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button
          @click="copyToClipboard"
          class="p-2 rounded-lg hover:bg-bg-interactive transition-colors text-text-muted hover:text-text-secondary"
          :title="$t('thinking.copyContent')"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
        </button>
        <button
          @click="toggleExpanded"
          class="p-2 rounded-lg hover:bg-bg-interactive transition-colors text-text-muted hover:text-text-secondary"
        >
          <svg
            class="w-4 h-4 transition-transform duration-300"
            :class="{ 'rotate-180': !isExpanded }"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Steps Timeline -->
    <div
      v-show="isExpanded"
      ref="contentRef"
      class="max-h-80 overflow-y-auto overflow-x-visible pl-2 pr-2 -ml-2 space-y-1"
    >
      <!-- Loading state -->
      <div v-if="thinkingSteps.length === 0 && store.isStreaming" class="flex items-center gap-3 p-4">
        <div class="w-8 h-8 rounded-full bg-status-info-muted flex items-center justify-center relative">
          <div class="w-3 h-3 rounded-full bg-accent-pulse animate-pulse"></div>
          <div class="absolute inset-0 rounded-full bg-accent-pulse-muted animate-ping"></div>
        </div>
        <span class="text-text-muted text-sm">{{ $t('thinking.waiting') }}</span>
      </div>

      <!-- Steps -->
      <div
        v-for="(step, index) in thinkingSteps"
        :key="index"
        class="relative"
      >
        <!-- Timeline connector -->
        <div
          v-if="index < thinkingSteps.length - 1"
          class="absolute left-4 top-10 bottom-0 w-0.5 bg-gradient-to-b from-[var(--color-gradient-timeline-start)] to-transparent"
        ></div>

        <!-- Text Step card -->
        <div v-if="step.type === 'text'" class="flex gap-3 group">
          <!-- Step indicator -->
          <div class="flex-shrink-0 relative w-8 h-8">
            <div
              class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 relative z-10"
              :class="{
                'bg-gradient-to-br from-[var(--color-gradient-step-active-start)] to-[var(--color-gradient-step-active-end)] text-white shadow-lg shadow-[var(--shadow-step-active)]': getStepStatus(index) === 'active',
                'bg-gradient-to-br from-[var(--color-gradient-step-completed-start)] to-[var(--color-gradient-step-completed-end)] text-white': getStepStatus(index) === 'completed',
              }"
            >
              <template v-if="getStepStatus(index) === 'active'">
                <div class="w-2 h-2 rounded-full bg-white animate-pulse"></div>
              </template>
              <template v-else>
                {{ index + 1 }}
              </template>
            </div>
            <!-- Glow ring for active step (contained within bounds) -->
            <div
              v-if="getStepStatus(index) === 'active'"
              class="absolute inset-0 rounded-full border-2 border-status-info animate-pulse"
            ></div>
          </div>

          <!-- Step content -->
          <div
            class="flex-1 pb-4 transition-all duration-300"
            :class="{ 'opacity-70': getStepStatus(index) === 'completed' && store.isStreaming }"
          >
            <!-- Step title -->
            <div class="flex items-center gap-2 mb-1">
              <h5
                class="text-sm font-semibold"
                :class="{
                  'text-status-info': getStepStatus(index) === 'active',
                  'text-mode-generate': getStepStatus(index) === 'completed',
                }"
              >
                {{ step.title }}
              </h5>
              <!-- Elapsed time badge -->
              <span
                class="text-[10px] px-2 py-0.5 rounded-full font-mono"
                :class="{
                  'bg-status-info-muted text-status-info': getStepStatus(index) === 'active',
                  'bg-control-disabled text-text-muted': getStepStatus(index) === 'completed',
                }"
              >
                {{ formatElapsed(step.elapsedMs) }}
              </span>
              <span
                v-if="getStepStatus(index) === 'active'"
                class="text-[10px] px-2 py-0.5 rounded-full bg-status-info-muted text-status-info font-medium"
              >
                {{ $t('thinking.processing') }}
              </span>
            </div>

            <!-- Step description -->
            <p
              v-if="step.content"
              class="text-xs text-text-muted leading-relaxed bg-bg-muted rounded-lg p-3 border border-white/5"
            >
              {{ step.content }}
            </p>
          </div>
        </div>

        <!-- Image Step card -->
        <div v-else-if="step.type === 'image'" class="flex gap-3 group">
          <!-- Image indicator -->
          <div class="flex-shrink-0 relative w-8 h-8">
            <div
              class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 relative z-10 bg-gradient-to-br from-[var(--color-gradient-step-success-start)] to-[var(--color-gradient-step-success-end)] text-white"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          </div>

          <!-- Image content -->
          <div class="flex-1 pb-4">
            <!-- Image header -->
            <div class="flex items-center gap-2 mb-2">
              <h5 class="text-sm font-semibold text-status-success">{{ $t('thinking.thinkingDraft') }}</h5>
              <span class="text-[10px] px-2 py-0.5 rounded-full font-mono bg-control-disabled text-text-muted">
                {{ formatElapsed(step.elapsedMs) }}
              </span>
            </div>

            <!-- Image preview -->
            <div
              class="relative inline-block cursor-pointer rounded-lg overflow-hidden border border-border-muted hover:border-status-success transition-all group/img"
              @click="openLightbox(step.imageIndex)"
            >
              <img
                :src="`data:${step.mimeType};base64,${step.data}`"
                :alt="`Thinking image ${step.imageIndex + 1}`"
                class="max-w-48 max-h-48 object-contain"
              />
              <!-- Hover overlay -->
              <div class="absolute inset-0 bg-black/50 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                <svg class="w-6 h-6 text-text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Streaming cursor -->
      <div v-if="store.isStreaming && thinkingSteps.length > 0" class="flex items-center gap-2 pl-11 pt-2">
        <span class="inline-block w-2 h-4 bg-accent-pulse animate-pulse rounded-sm"></span>
        <span class="text-xs text-text-muted">{{ $t('thinking.continueThinking') }}</span>
      </div>
    </div>

    <!-- Lightbox for thinking images -->
    <ImageLightbox
      v-if="thinkingImages.length > 0"
      v-model="lightboxOpen"
      :images="thinkingImages"
      :initial-index="lightboxIndex"
      :image-metadata="[]"
      :is-historical="false"
    />
  </div>
</template>

<style scoped>
.rotate-180 {
  transform: rotate(180deg);
}

/* Custom scrollbar */
.max-h-80::-webkit-scrollbar {
  width: 4px;
}

.max-h-80::-webkit-scrollbar-track {
  background: transparent;
}

.max-h-80::-webkit-scrollbar-thumb {
  background: var(--color-border-default);
  border-radius: 2px;
}

.max-h-80::-webkit-scrollbar-thumb:hover {
  background: var(--color-border-focus);
}
</style>
