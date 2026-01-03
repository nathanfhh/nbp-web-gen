<script setup>
import { onMounted } from 'vue'
import { useGeneratorStore } from '@/stores/generator'
import { useApi } from '@/composables/useApi'
import ParticleBackground from '@/components/ParticleBackground.vue'
import ApiKeyInput from '@/components/ApiKeyInput.vue'
import ModeSelector from '@/components/ModeSelector.vue'
import PromptInput from '@/components/PromptInput.vue'
import CommonSettings from '@/components/CommonSettings.vue'
import GenerateOptions from '@/components/GenerateOptions.vue'
import EditOptions from '@/components/EditOptions.vue'
import StoryOptions from '@/components/StoryOptions.vue'
import DiagramOptions from '@/components/DiagramOptions.vue'
import ImagePreview from '@/components/ImagePreview.vue'
import GenerationHistory from '@/components/GenerationHistory.vue'
import ThinkingProcess from '@/components/ThinkingProcess.vue'
import PromptDebug from '@/components/PromptDebug.vue'
import ImageUploader from '@/components/ImageUploader.vue'
import ToastContainer from '@/components/ToastContainer.vue'

const store = useGeneratorStore()
const { generateImageStream, generateStory, editImage, generateDiagram } = useApi()

onMounted(async () => {
  await store.initialize()
})

// Callback for streaming thinking chunks
const onThinkingChunk = (chunk) => {
  store.addThinkingChunk(chunk)
}

const handleGenerate = async () => {
  if (!store.prompt.trim()) {
    store.setGenerationError('請輸入 Prompt 描述')
    return
  }

  if (!store.hasApiKey) {
    store.setGenerationError('請先設定 API Key')
    return
  }

  store.setGenerating(true)
  store.setStreaming(true)
  store.clearGenerationError()
  store.clearGeneratedImages()
  store.clearThinkingProcess()

  const options = store.getCurrentOptions
  let thinkingText = ''

  // Get reference images for API calls
  const refImages = store.referenceImages

  try {
    let result

    switch (store.currentMode) {
      case 'generate':
        result = await generateImageStream(store.prompt, options, 'generate', refImages, onThinkingChunk)
        break
      case 'edit':
        if (refImages.length === 0) {
          throw new Error('請先上傳要編輯的圖片')
        }
        result = await editImage(store.prompt, refImages, options, onThinkingChunk)
        break
      case 'story':
        result = await generateStory(store.prompt, options, refImages, onThinkingChunk)
        // Flatten story results
        if (result.results) {
          const allImages = []
          result.results.forEach((r) => {
            if (r.images) {
              allImages.push(...r.images)
            }
            if (r.thinkingText) {
              thinkingText += r.thinkingText
            }
          })
          result.images = allImages
        }
        break
      case 'diagram':
        result = await generateDiagram(store.prompt, options, refImages, onThinkingChunk)
        break
    }

    if (result?.images) {
      store.setGeneratedImages(result.images)
    }

    // Collect thinking text
    if (result?.thinkingText) {
      thinkingText = result.thinkingText
    }

    // Save to history with thinking process
    await store.addToHistory({
      prompt: store.prompt,
      mode: store.currentMode,
      options: { ...options },
      status: 'success',
      thinkingText: thinkingText || store.thinkingProcess.map((c) => c.content).join(''),
    })

    // Save settings
    await store.saveSettings()
  } catch (err) {
    store.setGenerationError(err.message || '生成失敗，請重試')

    // Save failed attempt to history
    await store.addToHistory({
      prompt: store.prompt,
      mode: store.currentMode,
      options: { ...options },
      status: 'failed',
      error: err.message,
      thinkingText: store.thinkingProcess.map((c) => c.content).join(''),
    })
  } finally {
    store.setGenerating(false)
    store.setStreaming(false)
  }
}
</script>

<template>
  <div class="min-h-screen">
    <!-- Toast Notifications -->
    <ToastContainer />

    <!-- Background Effects -->
    <div class="gradient-bg"></div>
    <ParticleBackground />

    <!-- Main Content -->
    <div class="relative z-10 container mx-auto px-4 py-8 lg:py-12">
      <!-- Header -->
      <header class="text-center mb-12 relative">
        <!-- Theme Toggle Button -->
        <button
          @click="store.toggleTheme"
          class="absolute right-0 top-0 p-3 rounded-xl transition-all group"
          :class="store.theme === 'dark'
            ? 'bg-white/5 border border-white/10 hover:bg-white/10'
            : 'bg-blue-50 border border-blue-200 hover:bg-blue-100'"
          :title="store.theme === 'dark' ? '切換至亮色模式' : '切換至暗色模式'"
        >
          <!-- Sun icon (shown in dark mode) -->
          <svg
            v-if="store.theme === 'dark'"
            class="w-5 h-5 text-yellow-400 group-hover:scale-110 transition-transform"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
            />
          </svg>
          <!-- Moon icon (shown in light mode) -->
          <svg
            v-else
            class="w-5 h-5 text-blue-600 group-hover:scale-110 transition-transform"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
            />
          </svg>
        </button>

        <div class="inline-flex items-center gap-3 mb-4">
          <div
            class="w-12 h-12 rounded-2xl flex items-center justify-center glow-purple"
            :class="store.theme === 'dark'
              ? 'bg-gradient-to-br from-purple-500 to-cyan-500'
              : 'bg-gradient-to-br from-blue-600 to-blue-400'"
          >
            <svg class="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
        </div>
        <h1
          class="text-4xl lg:text-5xl font-bold bg-clip-text text-transparent mb-3"
          :class="store.theme === 'dark'
            ? 'bg-gradient-to-r from-purple-400 via-cyan-400 to-purple-400 glow-text-purple'
            : 'bg-gradient-to-r from-blue-700 via-blue-500 to-blue-700'"
        >
          NanoBanana
        </h1>
        <p class="text-lg" :class="store.theme === 'dark' ? 'text-gray-400' : 'text-gray-600'">
          AI 圖像生成工具
        </p>
      </header>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        <!-- Left Column - Settings -->
        <div class="lg:col-span-1 space-y-6">
          <!-- API Key -->
          <ApiKeyInput />

          <!-- Mode Selector -->
          <div class="glass p-6">
            <h3 class="font-semibold text-white mb-4 flex items-center gap-2">
              <svg class="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                />
              </svg>
              生成模式
            </h3>
            <ModeSelector />
          </div>

          <!-- Common Settings -->
          <CommonSettings />

          <!-- History -->
          <GenerationHistory />

          <!-- Prompt Debug -->
          <PromptDebug />
        </div>

        <!-- Right Column - Main Area -->
        <div class="lg:col-span-2 space-y-6">
          <!-- Prompt Input -->
          <div class="glass p-6 lg:p-8">
            <PromptInput />

            <!-- Reference Images (shared across all modes) -->
            <div class="mt-6">
              <ImageUploader />
            </div>

            <!-- Mode-specific Options -->
            <div class="mt-6">
              <div class="divider"></div>

              <Transition name="fade" mode="out-in">
                <GenerateOptions v-if="store.currentMode === 'generate'" key="generate" />
                <EditOptions v-else-if="store.currentMode === 'edit'" key="edit" />
                <StoryOptions v-else-if="store.currentMode === 'story'" key="story" />
                <DiagramOptions v-else-if="store.currentMode === 'diagram'" key="diagram" />
              </Transition>
            </div>

            <!-- Error Message -->
            <div
              v-if="store.generationError"
              class="mt-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30"
            >
              <div class="flex items-start gap-3">
                <svg
                  class="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p class="text-red-300 text-sm">{{ store.generationError }}</p>
              </div>
            </div>

            <!-- Generate Button -->
            <div class="mt-8">
              <button
                @click="handleGenerate"
                :disabled="store.isGenerating || !store.hasApiKey"
                class="btn-premium w-full py-4 text-lg font-semibold flex items-center justify-center gap-3"
              >
                <svg v-if="store.isGenerating" class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle
                    class="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="4"
                  ></circle>
                  <path
                    class="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                  />
                </svg>
                <span>{{ store.isGenerating ? '生成中...' : '開始生成' }}</span>
              </button>
            </div>
          </div>

          <!-- Thinking Process -->
          <ThinkingProcess />

          <!-- Image Preview -->
          <div class="glass p-6 lg:p-8">
            <ImagePreview />
          </div>
        </div>
      </div>

      <!-- Footer -->
      <footer class="mt-16 text-center">
        <p class="text-sm" :class="store.theme === 'dark' ? 'text-gray-500' : 'text-gray-400'">
          NanoBanana Image Generator
        </p>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
