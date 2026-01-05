<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGeneratorStore } from '@/stores/generator'
import { useApi } from '@/composables/useApi'
import { saveLocale } from '@/i18n'
import ParticleBackground from '@/components/ParticleBackground.vue'
import ApiKeyInput from '@/components/ApiKeyInput.vue'
import ModeSelector from '@/components/ModeSelector.vue'
import PromptInput from '@/components/PromptInput.vue'
import CommonSettings from '@/components/CommonSettings.vue'
import GenerateOptions from '@/components/GenerateOptions.vue'
import StickerOptions from '@/components/StickerOptions.vue'
import EditOptions from '@/components/EditOptions.vue'
import StoryOptions from '@/components/StoryOptions.vue'
import DiagramOptions from '@/components/DiagramOptions.vue'
import ImagePreview from '@/components/ImagePreview.vue'
import GenerationHistory from '@/components/GenerationHistory.vue'
import ThinkingProcess from '@/components/ThinkingProcess.vue'
import PromptDebug from '@/components/PromptDebug.vue'
import ImageUploader from '@/components/ImageUploader.vue'
import ToastContainer from '@/components/ToastContainer.vue'
import { useToast } from '@/composables/useToast'
import { useImageStorage } from '@/composables/useImageStorage'
import { useIndexedDB } from '@/composables/useIndexedDB'

const store = useGeneratorStore()
const toast = useToast()
const { t, locale } = useI18n()

// Language toggle
const toggleLocale = () => {
  const newLocale = locale.value === 'zh-TW' ? 'en' : 'zh-TW'
  locale.value = newLocale
  saveLocale(newLocale)
}
const imageStorage = useImageStorage()
const { updateHistoryImages } = useIndexedDB()
const { generateImageStream, generateStory, editImage, generateDiagram } = useApi()

// App version from package.json (injected by Vite)
const appVersion = __APP_VERSION__

// Scroll to panels
const panelsRef = ref(null)
const thinkingRef = ref(null)

const scrollToContent = () => {
  panelsRef.value?.scrollIntoView({ behavior: 'smooth' })
}

const scrollToThinking = () => {
  thinkingRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// Intersection observer for panel animations
const observedPanels = ref(new Set())

const setupIntersectionObserver = () => {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = entry.target.dataset.panelId
          if (id && !observedPanels.value.has(id)) {
            observedPanels.value.add(id)
            entry.target.classList.add('panel-visible')
          }
        }
      })
    },
    { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
  )

  // Observe all panels after mount
  setTimeout(() => {
    document.querySelectorAll('[data-panel-id]').forEach((el) => {
      observer.observe(el)
    })
  }, 100)

  return observer
}

let intersectionObserver = null

onMounted(async () => {
  await store.initialize()
  intersectionObserver = setupIntersectionObserver()
})

onUnmounted(() => {
  intersectionObserver?.disconnect()
})

// Callback for streaming thinking chunks
const onThinkingChunk = (chunk) => {
  store.addThinkingChunk(chunk)
}

// Show all panels immediately (skip animation wait)
const showAllPanels = () => {
  document.querySelectorAll('[data-panel-id]').forEach((el) => {
    el.classList.add('panel-visible')
    const id = el.dataset.panelId
    if (id) observedPanels.value.add(id)
  })
}

const handleGenerate = async () => {
  if (!store.prompt.trim()) {
    store.setGenerationError(t('errors.noPrompt'))
    return
  }

  if (!store.hasApiKey) {
    store.setGenerationError(t('errors.noApiKey'))
    return
  }

  // Show all panels and scroll to thinking process
  showAllPanels()
  scrollToThinking()

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
      case 'sticker':
        result = await generateImageStream(store.prompt, options, 'sticker', refImages, onThinkingChunk)
        break
      case 'edit':
        if (refImages.length === 0) {
          throw new Error(t('errors.noEditImage'))
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
      const imageCount = result.images.length
      toast.success(t('toast.generateSuccess', { count: imageCount }))
    }

    // Collect thinking text
    if (result?.thinkingText) {
      thinkingText = result.thinkingText
    }

    // Save to history with thinking process
    const historyId = await store.addToHistory({
      prompt: store.prompt,
      mode: store.currentMode,
      options: { ...options },
      status: 'success',
      thinkingText: thinkingText || store.thinkingProcess.filter((c) => c.type === 'text').map((c) => c.content).join(''),
    })

    // Background save images to OPFS (don't block UI)
    if (result?.images && result.images.length > 0) {
      imageStorage.saveGeneratedImages(historyId, result.images)
        .then(async (metadata) => {
          // Update IndexedDB with image metadata
          await updateHistoryImages(historyId, metadata)
          // Update store metadata for current view
          store.setGeneratedImagesMetadata(metadata)
          // Update storage usage
          await store.updateStorageUsage()
          // Reload history to get updated record with images
          await store.loadHistory()
        })
        .catch((err) => {
          console.error('Failed to save images to OPFS:', err)
          toast.warning(t('toast.imageSaveFailed'))
        })
    }

    // Save settings
    await store.saveSettings()
  } catch (err) {
    store.setGenerationError(err.message || t('toast.generateFailed'))

    // Save failed attempt to history
    await store.addToHistory({
      prompt: store.prompt,
      mode: store.currentMode,
      options: { ...options },
      status: 'failed',
      error: err.message,
      thinkingText: store.thinkingProcess.filter((c) => c.type === 'text').map((c) => c.content).join(''),
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

    <!-- Hero Section - Full Screen -->
    <section class="relative z-10 h-dvh flex flex-col items-center justify-center scroll-section">
      <!-- Top Right Controls -->
      <div class="absolute right-4 top-4 flex items-center gap-2">
        <!-- Language Toggle Button -->
        <button
          @click="toggleLocale"
          class="p-3 rounded-xl transition-all group"
          :class="store.theme === 'dark'
            ? 'bg-white/5 border border-white/10 hover:bg-white/10'
            : 'bg-blue-50 border border-blue-200 hover:bg-blue-100'"
          :title="$t('language.label')"
        >
          <span
            class="text-sm font-medium group-hover:scale-110 transition-transform inline-block"
            :class="store.theme === 'dark' ? 'text-gray-300' : 'text-gray-600'"
          >
            {{ locale === 'zh-TW' ? $t('language.zhTW') + ' → ' + $t('language.en') : $t('language.en') + ' → ' + $t('language.zhTW') }}
          </span>
        </button>
        <!-- Theme Toggle Button -->
        <button
          @click="store.toggleTheme"
          class="p-3 rounded-xl transition-all group"
          :class="store.theme === 'dark'
            ? 'bg-white/5 border border-white/10 hover:bg-white/10'
            : 'bg-blue-50 border border-blue-200 hover:bg-blue-100'"
          :title="store.theme === 'dark' ? $t('theme.switchToLight') : $t('theme.switchToDark')"
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
      </div>

      <!-- Hero Content -->
      <div class="text-center">
        <div class="inline-flex items-center gap-3 mb-6">
          <img
            src="/nbp-title.webp"
            alt="NanoBanana"
            class="w-40 h-40 lg:w-48 lg:h-48 drop-shadow-2xl hero-float"
          />
        </div>
        <h1
          class="text-5xl lg:text-7xl font-bold bg-clip-text text-transparent mb-4"
          :class="store.theme === 'dark'
            ? 'bg-gradient-to-r from-purple-400 via-cyan-400 to-purple-400 glow-text-purple'
            : 'bg-gradient-to-r from-blue-700 via-blue-500 to-blue-700'"
        >
          NanoBanana
        </h1>
        <p
          class="text-2xl lg:text-3xl flex items-center justify-center gap-3 mb-2"
          :class="store.theme === 'dark' ? 'text-gray-300' : 'text-gray-700'"
        >
          {{ $t('hero.subtitle') }}
        </p>
        <span class="inline-block text-sm px-3 py-1 rounded-full bg-purple-500/20 text-purple-400 font-mono">
          v{{ appVersion }}
        </span>
      </div>

      <!-- Scroll Down Button -->
      <button
        @click="scrollToContent"
        class="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-gray-400 hover:text-purple-400 transition-colors group cursor-pointer"
      >
        <span class="text-sm">{{ $t('hero.startUsing') }}</span>
        <div class="scroll-indicator">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>
      </button>
    </section>

    <!-- Main Content -->
    <section ref="panelsRef" class="relative z-10 container mx-auto px-4 py-12 lg:py-16 scroll-section min-h-dvh">

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        <!-- Left Column - Settings -->
        <div class="lg:col-span-1 space-y-6">
          <!-- API Key -->
          <div data-panel-id="api-key" class="panel-animate">
            <ApiKeyInput />
          </div>

          <!-- Mode Selector -->
          <div data-panel-id="mode-selector" class="panel-animate glass p-6">
            <h3 class="font-semibold text-white mb-4 flex items-center gap-2">
              <svg class="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                />
              </svg>
              {{ $t('modes.title') }}
            </h3>
            <ModeSelector />
          </div>

          <!-- Common Settings -->
          <div data-panel-id="common-settings" class="panel-animate">
            <CommonSettings />
          </div>

          <!-- History -->
          <div data-panel-id="history" class="panel-animate">
            <GenerationHistory />
          </div>

          <!-- Prompt Debug -->
          <div data-panel-id="prompt-debug" class="panel-animate">
            <PromptDebug />
          </div>
        </div>

        <!-- Right Column - Main Area -->
        <div class="lg:col-span-2 space-y-6">
          <!-- Prompt Input -->
          <div data-panel-id="prompt-input" class="panel-animate glass p-6 lg:p-8">
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
                <StickerOptions v-else-if="store.currentMode === 'sticker'" key="sticker" />
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
                <span>{{ store.isGenerating ? $t('generate.generating') : $t('generate.button') }}</span>
              </button>
            </div>
          </div>

          <!-- Thinking Process -->
          <div ref="thinkingRef" data-panel-id="thinking-process" class="panel-animate">
            <ThinkingProcess />
          </div>

          <!-- Image Preview -->
          <div data-panel-id="image-preview" class="panel-animate glass p-6 lg:p-8">
            <ImagePreview />
          </div>
        </div>
      </div>

      <!-- Footer -->
      <footer class="mt-16 text-center space-y-3">
        <p class="text-sm" :class="store.theme === 'dark' ? 'text-gray-500' : 'text-gray-400'">
          {{ $t('footer.title') }}
        </p>
        <a
          href="https://github.com/nathanfhh/nbp-web-gen"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center justify-center p-2 rounded-lg transition-all"
          :class="store.theme === 'dark'
            ? 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'"
        >
          <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
          </svg>
        </a>
      </footer>
    </section>
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
