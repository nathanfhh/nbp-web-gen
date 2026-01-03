<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useGeneratorStore } from '@/stores/generator'
import { formatElapsed } from '@/composables/useFormatTime'

const store = useGeneratorStore()
const contentRef = ref(null)
const isExpanded = ref(true)

// Combined text from all thinking chunks
const thinkingText = computed(() => {
  return store.thinkingProcess.map((chunk) => chunk.content).join('')
})

// Parse thinking text into steps with timestamps
// Pattern: **Step Title**\n\nContent...
const thinkingSteps = computed(() => {
  const text = thinkingText.value
  if (!text) return []

  const startTime = store.generationStartTime

  // Build a map of accumulated text length to timestamp
  let accumulatedLength = 0
  const timestampMap = []
  for (const chunk of store.thinkingProcess) {
    timestampMap.push({
      startPos: accumulatedLength,
      endPos: accumulatedLength + chunk.content.length,
      timestamp: chunk.timestamp,
    })
    accumulatedLength += chunk.content.length
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
        title,
        content,
        timestamp: stepTimestamp,
        elapsedMs,
      })
    }

    // Update position: ** + title + ** + content
    currentPos += 2 + (parts[i]?.length || 0) + 2 + (parts[i + 1]?.length || 0)
  }

  // If no steps found, treat entire text as one step
  if (steps.length === 0 && text.trim()) {
    const firstTimestamp = store.thinkingProcess[0]?.timestamp || startTime
    steps.push({
      title: '思考中',
      content: text.trim(),
      timestamp: firstTimestamp,
      elapsedMs: startTime ? firstTimestamp - startTime : 0,
    })
  }

  return steps
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
  } catch (err) {
    console.error('Failed to copy:', err)
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
    class="glass p-4 fade-in"
  >
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-3">
        <div
          class="w-10 h-10 rounded-xl flex items-center justify-center"
          :class="store.isStreaming ? 'bg-gradient-to-br from-cyan-500/30 to-blue-500/30' : 'bg-gradient-to-br from-purple-500/30 to-pink-500/30'"
        >
          <svg
            v-if="store.isStreaming"
            class="w-5 h-5 text-cyan-400 animate-pulse"
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
          <svg v-else class="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <div>
          <h4 class="text-sm font-semibold text-white">
            {{ store.isStreaming ? 'AI 思考中...' : '思考過程' }}
          </h4>
          <p class="text-xs text-gray-500">
            {{ store.isStreaming ? '串流回應中' : `${thinkingSteps.length} 個步驟` }}
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button
          @click="copyToClipboard"
          class="p-2 rounded-lg hover:bg-white/10 transition-colors text-gray-400 hover:text-gray-300"
          title="複製內容"
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
          class="p-2 rounded-lg hover:bg-white/10 transition-colors text-gray-400 hover:text-gray-300"
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
        <div class="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center relative">
          <div class="w-3 h-3 rounded-full bg-cyan-400 animate-pulse"></div>
          <div class="absolute inset-0 rounded-full bg-cyan-400/30 animate-ping"></div>
        </div>
        <span class="text-gray-400 text-sm">等待 AI 回應...</span>
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
          class="absolute left-4 top-10 bottom-0 w-0.5 bg-gradient-to-b from-purple-500/50 to-transparent"
        ></div>

        <!-- Step card -->
        <div class="flex gap-3 group">
          <!-- Step indicator -->
          <div class="flex-shrink-0 relative w-8 h-8">
            <div
              class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 relative z-10"
              :class="{
                'bg-gradient-to-br from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/50': getStepStatus(index) === 'active',
                'bg-gradient-to-br from-purple-500 to-pink-500 text-white': getStepStatus(index) === 'completed',
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
              class="absolute inset-0 rounded-full border-2 border-cyan-400/50 animate-pulse"
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
                  'text-cyan-300': getStepStatus(index) === 'active',
                  'text-purple-300': getStepStatus(index) === 'completed',
                }"
              >
                {{ step.title }}
              </h5>
              <!-- Elapsed time badge -->
              <span
                class="text-[10px] px-2 py-0.5 rounded-full font-mono"
                :class="{
                  'bg-cyan-500/20 text-cyan-400': getStepStatus(index) === 'active',
                  'bg-gray-500/20 text-gray-400': getStepStatus(index) === 'completed',
                }"
              >
                {{ formatElapsed(step.elapsedMs) }}
              </span>
              <span
                v-if="getStepStatus(index) === 'active'"
                class="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 font-medium"
              >
                處理中
              </span>
            </div>

            <!-- Step description -->
            <p
              v-if="step.content"
              class="text-xs text-gray-400 leading-relaxed bg-white/5 rounded-lg p-3 border border-white/5"
            >
              {{ step.content }}
            </p>
          </div>
        </div>
      </div>

      <!-- Streaming cursor -->
      <div v-if="store.isStreaming && thinkingSteps.length > 0" class="flex items-center gap-2 pl-11 pt-2">
        <span class="inline-block w-2 h-4 bg-cyan-400 animate-pulse rounded-sm"></span>
        <span class="text-xs text-gray-500">繼續思考中...</span>
      </div>
    </div>
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
  background: rgba(139, 92, 246, 0.3);
  border-radius: 2px;
}

.max-h-80::-webkit-scrollbar-thumb:hover {
  background: rgba(139, 92, 246, 0.5);
}
</style>
