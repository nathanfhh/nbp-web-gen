<script setup>
import { defineAsyncComponent, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGeneratorStore } from '@/stores/generator'
import { useGeneration } from '@/composables/useGeneration'
import { useToast } from '@/composables/useToast'
import { saveLocale } from '@/i18n'

// Core components (always loaded)
import ParticleBackground from '@/components/ParticleBackground.vue'
import ApiKeyInput from '@/components/ApiKeyInput.vue'
import ModeSelector from '@/components/ModeSelector.vue'
import PromptInput from '@/components/PromptInput.vue'
import CommonSettings from '@/components/CommonSettings.vue'
import ImagePreview from '@/components/ImagePreview.vue'
import ImageUploader from '@/components/ImageUploader.vue'
import ToastContainer from '@/components/ToastContainer.vue'
import GitHubLink from '@/components/GitHubLink.vue'
import YouTubeLink from '@/components/YouTubeLink.vue'

// Lazy loaded: Mode-specific options (only one shown at a time)
const GenerateOptions = defineAsyncComponent(() => import('@/components/GenerateOptions.vue'))
const StickerOptions = defineAsyncComponent(() => import('@/components/StickerOptions.vue'))
const EditOptions = defineAsyncComponent(() => import('@/components/EditOptions.vue'))
const StoryOptions = defineAsyncComponent(() => import('@/components/StoryOptions.vue'))
const DiagramOptions = defineAsyncComponent(() => import('@/components/DiagramOptions.vue'))

// Lazy loaded: Heavy components
const GenerationHistory = defineAsyncComponent(() => import('@/components/GenerationHistory.vue'))
const ThinkingProcess = defineAsyncComponent(() => import('@/components/ThinkingProcess.vue'))
const PromptDebug = defineAsyncComponent(() => import('@/components/PromptDebug.vue'))

const store = useGeneratorStore()
const { handleGenerate: executeGenerate } = useGeneration()
const { t, locale } = useI18n()
const toast = useToast()

// Build hash for update detection (injected by Vite)
const buildHash = __BUILD_HASH__
const BUILD_HASH_KEY = 'nbp-build-hash'

// Check if app has been updated
const checkAppUpdate = () => {
  const storedHash = localStorage.getItem(BUILD_HASH_KEY)

  // Update stored hash
  localStorage.setItem(BUILD_HASH_KEY, buildHash)

  // Show update notification if hash changed (and not first visit)
  if (storedHash && storedHash !== buildHash && buildHash !== 'dev') {
    toast.success(t('toast.appUpdated', { version: appVersion }), 5000)
  }
}

// Language toggle
const toggleLocale = () => {
  const newLocale = locale.value === 'zh-TW' ? 'en' : 'zh-TW'
  locale.value = newLocale
  saveLocale(newLocale)
}

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
    { threshold: 0.1, rootMargin: '0px 0px -50px 0px' },
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
  checkAppUpdate()
})

onUnmounted(() => {
  intersectionObserver?.disconnect()
})

// Show all panels immediately (skip animation wait)
const showAllPanels = () => {
  document.querySelectorAll('[data-panel-id]').forEach((el) => {
    el.classList.add('panel-visible')
    const id = el.dataset.panelId
    if (id) observedPanels.value.add(id)
  })
}

// Handle generation with UI callbacks
const handleGenerate = async () => {
  await executeGenerate({
    onStart: () => {
      showAllPanels()
      scrollToThinking()
    },
  })
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
          :class="
            store.theme === 'dark'
              ? 'bg-white/5 border border-white/10 hover:bg-white/10'
              : 'bg-blue-50 border border-blue-200 hover:bg-blue-100'
          "
          :title="$t('language.label')"
        >
          <span
            class="text-sm font-medium group-hover:scale-110 transition-transform inline-block"
            :class="store.theme === 'dark' ? 'text-gray-300' : 'text-gray-600'"
          >
            {{
              locale === 'zh-TW'
                ? $t('language.zhTW') + ' → ' + $t('language.en')
                : $t('language.en') + ' → ' + $t('language.zhTW')
            }}
          </span>
        </button>
        <!-- Theme Toggle Button -->
        <button
          @click="store.toggleTheme"
          class="p-3 rounded-xl transition-all group"
          :class="
            store.theme === 'dark'
              ? 'bg-white/5 border border-white/10 hover:bg-white/10'
              : 'bg-blue-50 border border-blue-200 hover:bg-blue-100'
          "
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
            alt="Nano Banana Pro"
            class="w-40 h-40 lg:w-48 lg:h-48 drop-shadow-2xl hero-float"
          />
        </div>
        <h1
          class="text-5xl lg:text-7xl font-bold bg-clip-text text-transparent mb-4"
          :class="
            store.theme === 'dark'
              ? 'bg-gradient-to-r from-blue-400 via-blue-300 to-blue-400 glow-text-purple'
              : 'bg-gradient-to-r from-blue-700 via-blue-500 to-blue-700'
          "
        >
          Nano Banana Pro
        </h1>
        <p
          class="text-2xl lg:text-3xl flex items-center justify-center gap-3 mb-2"
          :class="store.theme === 'dark' ? 'text-gray-300' : 'text-gray-700'"
        >
          {{ $t('hero.subtitle') }}
        </p>
        <div class="flex flex-col items-center gap-2">
          <span class="text-sm px-3 py-1 rounded-full bg-blue-500/20 text-blue-400 font-mono">
            v{{ appVersion }}
          </span>
          <div class="flex items-center gap-1">
            <GitHubLink size="md" />
            <YouTubeLink size="md" />
          </div>
        </div>
      </div>

      <!-- Scroll Down Button -->
      <button
        @click="scrollToContent"
        class="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-gray-400 hover:text-blue-400 transition-colors group cursor-pointer"
      >
        <span class="text-sm">{{ $t('hero.startUsing') }}</span>
        <div class="scroll-indicator">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M19 14l-7 7m0 0l-7-7m7 7V3"
            />
          </svg>
        </div>
      </button>
    </section>

    <!-- Main Content -->
    <section
      ref="panelsRef"
      class="relative z-10 container mx-auto px-4 pt-6 pb-6 lg:pt-8 lg:pb-8 scroll-section min-h-dvh"
    >
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
              <svg
                class="w-5 h-5 text-blue-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
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
                <span>{{
                  store.isGenerating ? $t('generate.generating') : $t('generate.button')
                }}</span>
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
      <footer class="mt-8 text-center space-y-3">
        <p class="text-sm" :class="store.theme === 'dark' ? 'text-gray-500' : 'text-gray-400'">
          {{ $t('footer.title') }}
        </p>
        <div class="flex items-center justify-center gap-1">
          <GitHubLink size="md" />
          <YouTubeLink size="md" />
        </div>
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
