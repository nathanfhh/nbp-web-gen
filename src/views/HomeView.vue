<script setup>
import { defineAsyncComponent, onMounted, onUnmounted, ref, computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGeneratorStore } from '@/stores/generator'
import { useGeneration } from '@/composables/useGeneration'
import { useToast } from '@/composables/useToast'
import { useTour } from '@/composables/useTour'
import { saveLocale } from '@/i18n'
import { getAvailableThemes, useTheme, getThemeType } from '@/theme'

// Core components (always loaded)
import ApiKeyInput from '@/components/ApiKeyInput.vue'
import ModeSelector from '@/components/ModeSelector.vue'
import PromptInput from '@/components/PromptInput.vue'
import CommonSettings from '@/components/CommonSettings.vue'
import ImagePreview from '@/components/ImagePreview.vue'
import ImageUploader from '@/components/ImageUploader.vue'
import GitHubLink from '@/components/GitHubLink.vue'
import YouTubeLink from '@/components/YouTubeLink.vue'
import HeroTitle from '@/components/HeroTitle.vue'

// Lazy loaded: Mode-specific options (only one shown at a time)
const GenerateOptions = defineAsyncComponent(() => import('@/components/GenerateOptions.vue'))
const StickerOptions = defineAsyncComponent(() => import('@/components/StickerOptions.vue'))
const EditOptions = defineAsyncComponent(() => import('@/components/EditOptions.vue'))
const StoryOptions = defineAsyncComponent(() => import('@/components/StoryOptions.vue'))
const DiagramOptions = defineAsyncComponent(() => import('@/components/DiagramOptions.vue'))
const VideoOptions = defineAsyncComponent(() => import('@/components/VideoOptions.vue'))
const VideoPromptBuilder = defineAsyncComponent(() => import('@/components/VideoPromptBuilder.vue'))
const SlidesOptions = defineAsyncComponent(() => import('@/components/SlidesOptions.vue'))

// Lazy loaded: Heavy components
const GenerationHistory = defineAsyncComponent(() => import('@/components/GenerationHistory.vue'))
const ThinkingProcess = defineAsyncComponent(() => import('@/components/ThinkingProcess.vue'))
const PromptDebug = defineAsyncComponent(() => import('@/components/PromptDebug.vue'))
const CharacterCarousel = defineAsyncComponent(() => import('@/components/CharacterCarousel.vue'))
const UserTour = defineAsyncComponent(() => import('@/components/UserTour.vue'))

const store = useGeneratorStore()
const { handleGenerate: executeGenerate } = useGeneration()
const { t, locale } = useI18n()
const toast = useToast()
const tour = useTour()

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

// Theme handling
const isThemeMenuOpen = ref(false)
const themeDropdownRef = ref(null)
const availableThemes = computed(() => getAvailableThemes())
const currentTheme = useTheme()
const isDarkTheme = computed(() => currentTheme.value?.type === 'dark')

// Check if slides mode requires style confirmation before generating or has too many pages
const MAX_SLIDES_PAGES = 30
const isSlidesNotReady = computed(() => {
  if (store.currentMode !== 'slides') return false
  // Check style confirmation and page limit
  return !store.slidesOptions.styleConfirmed || store.slidesOptions.totalPages > MAX_SLIDES_PAGES
})

// Check if any single page is being regenerated (to disable main Generate button)
const isAnyPageGenerating = computed(() => {
  if (store.currentMode !== 'slides') return false
  return store.slidesOptions.pages.some((p) => p.status === 'generating')
})

// Check if slides style is being analyzed
const isSlidesAnalyzing = computed(() => {
  if (store.currentMode !== 'slides') return false
  return store.slidesOptions.isAnalyzing
})

// ============================================================================
// Slides Progress Bar (shown above Generate button during slides generation)
// ============================================================================
const slidesEtaMs = ref(0)
let slidesEtaIntervalId = null

// Progress percentage: completed pages / total pages
// currentPageIndex is 0-based and represents the page currently being generated
// So completed pages = currentPageIndex (pages 0 to currentPageIndex-1 are done)
const slidesProgressPercent = computed(() => {
  const opts = store.slidesOptions
  if (opts.currentPageIndex < 0 || opts.totalPages === 0) return 0
  // When generating page N (0-indexed), N pages are completed (0 to N-1)
  return Math.round((opts.currentPageIndex / opts.totalPages) * 100)
})

// Calculate ETA based on completed page times
const calculateSlidesEta = () => {
  const opts = store.slidesOptions
  const times = opts.pageGenerationTimes
  if (!times || times.length === 0) return 0

  const avgTimePerPage = times.reduce((sum, t) => sum + t, 0) / times.length
  // Remaining pages = total - completed = total - currentPageIndex
  // Plus 1 for the current page being generated
  const remainingPages = opts.totalPages - opts.currentPageIndex
  if (remainingPages <= 0) return 0
  return avgTimePerPage * remainingPages
}

// Formatted ETA display
const slidesEtaFormatted = computed(() => {
  if (slidesEtaMs.value <= 0) return null
  const seconds = Math.round(slidesEtaMs.value / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (remainingSeconds === 0) return `${minutes}m`
  return `${minutes}m ${remainingSeconds}s`
})

// Watch for page completion to recalculate ETA
watch(
  () => store.slidesOptions.pageGenerationTimes?.length,
  () => {
    if (store.isGenerating && store.currentMode === 'slides') {
      slidesEtaMs.value = calculateSlidesEta()
    }
  },
)

// Start/stop countdown timer based on generation state
watch(
  () => store.isGenerating,
  (isGenerating) => {
    if (isGenerating && store.currentMode === 'slides') {
      // Start countdown interval
      slidesEtaIntervalId = setInterval(() => {
        if (slidesEtaMs.value > 1000) {
          slidesEtaMs.value -= 1000
        }
      }, 1000)
    } else {
      // Stop countdown and reset
      if (slidesEtaIntervalId) {
        clearInterval(slidesEtaIntervalId)
        slidesEtaIntervalId = null
      }
      slidesEtaMs.value = 0
    }
  },
)

// Cleanup on unmount
onUnmounted(() => {
  if (slidesEtaIntervalId) {
    clearInterval(slidesEtaIntervalId)
  }
})

const closeThemeMenu = () => {
  isThemeMenuOpen.value = false
}

// Auto scroll to current theme when dropdown opens
watch(isThemeMenuOpen, async (isOpen) => {
  if (isOpen) {
    await nextTick()
    const container = themeDropdownRef.value
    const activeItem = container?.querySelector('[data-active="true"]')
    if (activeItem && container) {
      activeItem.scrollIntoView({ block: 'nearest' })
    }
  }
})

// Click outside handler for theme menu
const setupClickOutside = () => {
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('theme-menu-container')
    if (menu && !menu.contains(e.target)) {
      closeThemeMenu()
    }
  })
}

const changeTheme = async (themeName, event) => {
  closeThemeMenu()

  // Fallback for browsers without View Transitions support
  if (!document.startViewTransition) {
    store.setTheme(themeName)
    return
  }

  // Get click coordinates for ripple effect
  const x = event?.clientX ?? window.innerWidth / 2
  const y = event?.clientY ?? window.innerHeight / 2

  // Set CSS variables for the ripple origin
  document.documentElement.style.setProperty('--ripple-x', `${x}px`)
  document.documentElement.style.setProperty('--ripple-y', `${y}px`)
  document.documentElement.setAttribute('data-theme-transition', 'active')

  // Start the transition
  const transition = document.startViewTransition(() => {
    store.setTheme(themeName)
  })

  // Clean up after transition
  try {
    await transition.finished
  } finally {
    document.documentElement.removeAttribute('data-theme-transition')
  }
}

// App version from package.json (injected by Vite)
const appVersion = __APP_VERSION__

// Scroll to panels
const heroRef = ref(null)
const panelsRef = ref(null)
const thinkingRef = ref(null)

const scrollToContent = () => {
  panelsRef.value?.scrollIntoView({ behavior: 'smooth' })
}

const scrollToThinking = () => {
  thinkingRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// ============================================
// Asymmetric Scroll Behavior
// - Scroll down: Easy snap from Hero to Main (20% threshold)
// - Scroll up: Requires scrolling near top to return to Hero
// ============================================
const isInMainSection = ref(false)
const isScrollLocked = ref(false)
let lastScrollY = 0
let scrollVelocity = 0
let lastScrollTime = 0

const handleAsymmetricScroll = () => {
  if (isScrollLocked.value) return

  const currentScrollY = window.scrollY
  const currentTime = Date.now()
  const heroHeight = heroRef.value?.offsetHeight || window.innerHeight

  // Calculate scroll velocity (px/ms)
  const timeDelta = currentTime - lastScrollTime
  if (timeDelta > 0) {
    scrollVelocity = (currentScrollY - lastScrollY) / timeDelta
  }

  const scrollDirection = currentScrollY > lastScrollY ? 'down' : 'up'

  // Scroll DOWN: Easy snap to Main Section
  if (scrollDirection === 'down' && !isInMainSection.value) {
    // Snap when scrolled past 20% of hero height
    if (currentScrollY > heroHeight * 0.2) {
      snapToMain()
    }
  }

  // Scroll UP: Requires more effort to return to Hero
  if (scrollDirection === 'up' && isInMainSection.value) {
    // Option 1: Scrolled very close to top (< 80px)
    // Option 2: Fast upward scroll velocity (> 1.5 px/ms) near top area
    const nearTop = currentScrollY < 80
    const fastScrollNearTop = currentScrollY < heroHeight * 0.5 && scrollVelocity < -1.5

    if (nearTop || fastScrollNearTop) {
      snapToHero()
    }
  }

  lastScrollY = currentScrollY
  lastScrollTime = currentTime
}

const snapToMain = () => {
  isScrollLocked.value = true
  isInMainSection.value = true
  panelsRef.value?.scrollIntoView({ behavior: 'smooth' })
  // Unlock after animation completes
  setTimeout(() => {
    isScrollLocked.value = false
    lastScrollY = window.scrollY
  }, 600)
}

const snapToHero = () => {
  isScrollLocked.value = true
  isInMainSection.value = false
  heroRef.value?.scrollIntoView({ behavior: 'smooth' })
  // Unlock after animation completes
  setTimeout(() => {
    isScrollLocked.value = false
    lastScrollY = window.scrollY
  }, 600)
}

// Throttle scroll handler for performance
let scrollThrottleTimer = null
const throttledScrollHandler = () => {
  if (scrollThrottleTimer) return
  scrollThrottleTimer = setTimeout(() => {
    handleAsymmetricScroll()
    scrollThrottleTimer = null
  }, 50)
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

// Prevent accidental page close during generation
const handleBeforeUnload = (e) => {
  if (store.isGenerating) {
    e.preventDefault()
    e.returnValue = t('common.confirmLeave')
    return e.returnValue
  }
}

onMounted(() => {
  // Force scroll to top on page load
  window.scrollTo({ top: 0, behavior: 'instant' })

  // Setup asymmetric scroll behavior
  window.addEventListener('scroll', throttledScrollHandler, { passive: true })

  // Register beforeunload handler
  window.addEventListener('beforeunload', handleBeforeUnload)

  intersectionObserver = setupIntersectionObserver()
  checkAppUpdate()
  setupClickOutside()
  tour.autoStartIfNeeded()
})

onUnmounted(() => {
  window.removeEventListener('scroll', throttledScrollHandler)
  window.removeEventListener('beforeunload', handleBeforeUnload)
  if (scrollThrottleTimer) {
    clearTimeout(scrollThrottleTimer)
    scrollThrottleTimer = null
  }
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

// Handle character set as start frame (frames-to-video mode)
const handleSetAsStartFrame = (frameData) => {
  store.videoOptions.startFrame = frameData
}

// Handle character add to references (references-to-video mode)
const handleAddToReferences = (referenceData) => {
  const maxRefs = 3
  if (store.videoOptions.referenceImages.length >= maxRefs) {
    toast.warning(t('characterCarousel.referencesLimitReached', { max: maxRefs }))
    return
  }
  store.videoOptions.referenceImages.push(referenceData)
}
</script>

<template>
  <div>
    <!-- Hero Section - Full Screen -->
    <section ref="heroRef" class="relative z-10 h-dvh flex flex-col items-center justify-center">
      <!-- Top Right Controls -->
      <div class="absolute right-4 top-4 flex items-center gap-2">
        <!-- Tour Help Button -->
        <button
          @click="tour.resetTourCompletion(); tour.start()"
          class="h-[50px] px-3 rounded-xl transition-all group flex items-center justify-center"
          :class="
            store.theme === 'dark'
              ? 'bg-bg-muted border border-border-muted hover:bg-bg-interactive'
              : 'bg-bg-subtle border border-border-subtle hover:bg-bg-subtle'
          "
          :title="$t('tour.help')"
        >
          <svg
            class="w-5 h-5 group-hover:scale-110 transition-transform"
            :class="store.theme === 'dark' ? 'text-text-secondary' : 'text-text-muted'"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </button>

        <!-- Language Toggle Button -->
        <button
          @click="toggleLocale"
          class="p-3 rounded-xl transition-all group"
          :class="
            store.theme === 'dark'
              ? 'bg-bg-muted border border-border-muted hover:bg-bg-interactive'
              : 'bg-bg-subtle border border-border-subtle hover:bg-bg-subtle'
          "
          :title="$t('language.label')"
          :aria-label="$t('language.label')"
        >
          <span
            class="text-sm font-medium group-hover:scale-110 transition-transform inline-block text-text-secondary"
          >
            {{
              locale === 'zh-TW'
                ? $t('language.zhTW') + ' → ' + $t('language.en')
                : $t('language.en') + ' → ' + $t('language.zhTW')
            }}
          </span>
        </button>
        
        <!-- Theme Selector (Dropdown) -->
        <div id="theme-menu-container" class="relative">
          <button
            @click="isThemeMenuOpen = !isThemeMenuOpen"
            class="p-3 rounded-xl transition-all group flex items-center gap-2"
            :class="
              store.theme === 'dark'
                ? 'bg-bg-muted border border-border-muted hover:bg-bg-interactive'
                : 'bg-bg-subtle border border-border-subtle hover:bg-bg-subtle'
            "
            :title="$t('theme.label')"
          >
            <!-- Current Theme Icon: 亮色→太陽, 暗色→月亮 -->
            <svg
              v-if="isDarkTheme"
              class="w-5 h-5 text-brand-primary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
            <svg
              v-else
              class="w-5 h-5 text-accent-star"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <span class="text-sm font-medium hidden sm:block" :class="store.theme === 'dark' ? 'text-text-secondary' : 'text-text-muted'">
              {{ $t(`theme.names.${store.theme}`) }}
            </span>
            <svg class="w-4 h-4 transition-transform duration-200" :class="[store.theme === 'dark' ? 'text-text-secondary' : 'text-text-muted', isThemeMenuOpen ? 'rotate-180' : '']" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <!-- Dropdown Menu -->
          <Transition
            enter-active-class="transition duration-200 ease-out"
            enter-from-class="transform scale-95 opacity-0"
            enter-to-class="transform scale-100 opacity-100"
            leave-active-class="transition duration-75 ease-in"
            leave-from-class="transform scale-100 opacity-100"
            leave-to-class="transform scale-95 opacity-0"
          >
            <div
              v-if="isThemeMenuOpen"
              ref="themeDropdownRef"
              class="absolute right-0 mt-2 w-48 max-h-[50vh] rounded-xl shadow-lg border backdrop-blur-xl z-50 overflow-y-auto"
              :class="isDarkTheme ? 'bg-bg-elevated/90 border-border-muted' : 'bg-bg-card/95 border-border-subtle'"
            >
              <div class="py-1">
                <button
                  v-for="themeName in availableThemes"
                  :key="themeName"
                  :data-active="store.theme === themeName"
                  @click="(e) => changeTheme(themeName, e)"
                  class="w-full text-left px-4 py-3 text-sm transition-colors flex items-center justify-between group"
                  :class="[
                    store.theme === themeName
                      ? (isDarkTheme ? 'bg-bg-interactive text-text-primary' : 'bg-bg-subtle text-brand-primary')
                      : (isDarkTheme ? 'text-text-secondary hover:bg-bg-interactive' : 'text-text-primary hover:bg-bg-subtle')
                  ]"
                >
                  <span class="flex items-center gap-2">
                    <!-- 淺色主題 → 太陽 -->
                    <svg
                      v-if="getThemeType(themeName) === 'light'"
                      class="w-4 h-4 text-accent-star"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                    <!-- 深色主題 → 月亮 -->
                    <svg
                      v-else
                      class="w-4 h-4 text-brand-primary"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                    <span class="font-medium">{{ $t(`theme.names.${themeName}`) }}</span>
                  </span>
                  <svg v-if="store.theme === themeName" class="w-4 h-4 text-status-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                </button>
              </div>
            </div>
          </Transition>
        </div>
      </div>

      <!-- Hero Content -->
      <div class="text-center">
        <div class="inline-flex items-center gap-3 mb-6">
          <img
            src="/nbp-title-384.webp"
            srcset="/nbp-title-320.webp 320w, /nbp-title-384.webp 384w, /nbp-title-512.webp 512w"
            sizes="(min-width: 1024px) 192px, 160px"
            alt="Nano Banana Pro"
            class="w-40 h-40 lg:w-48 lg:h-48 drop-shadow-2xl hero-float"
            fetchpriority="high"
          />
        </div>
        <HeroTitle />
        <p
          class="text-lg lg:text-xl flex items-center justify-center gap-2 mb-2"
          :class="store.theme === 'dark' ? 'text-text-secondary' : 'text-text-muted'"
        >
          <span class="opacity-60">—</span>
          <span>Powered by Nano Banana Pro & Veo</span>
          <span class="opacity-60">—</span>
        </p>
        <div class="flex flex-col items-center gap-2">
          <span class="text-sm px-3 py-1 rounded-full bg-mode-generate-muted text-mode-generate font-mono">
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
        class="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-text-muted hover:text-mode-generate transition-colors group cursor-pointer"
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
      class="relative z-10 container mx-auto px-4 pt-6 pb-6 lg:pt-8 lg:pb-8 min-h-dvh"
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
            <h3 class="font-semibold text-text-primary mb-4 flex items-center gap-2">
              <svg
                class="w-5 h-5 text-mode-generate"
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

          <!-- Common Settings (hidden in video mode - not used) -->
          <div v-show="store.currentMode !== 'video'" data-panel-id="common-settings" class="panel-animate">
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

            <!-- LINE Sticker Tool Entry (sticker mode only) -->
            <router-link
              v-if="store.currentMode === 'sticker'"
              to="/line-sticker-tool"
              class="mt-6 flex items-center justify-between p-4 rounded-xl bg-status-success-muted border border-status-success hover:bg-status-success-muted transition-all group"
            >
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-status-success-muted flex items-center justify-center">
                  <svg class="w-5 h-5 text-status-success" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 5.93 2 10.66c0 2.72 1.33 5.13 3.42 6.72.17.13.28.35.26.59l-.35 2.08c-.06.39.34.68.68.49l2.5-1.4c.17-.1.38-.12.57-.06.93.25 1.92.38 2.92.38 5.52 0 10-3.93 10-8.66S17.52 2 12 2z"/>
                  </svg>
                </div>
                <div>
                  <p class="text-sm font-medium text-status-success">{{ $t('lineStickerTool.entry.title') }}</p>
                  <p class="text-xs text-text-muted">{{ $t('lineStickerTool.entry.desc') }}</p>
                </div>
              </div>
              <svg class="w-5 h-5 text-text-muted group-hover:text-status-success transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </router-link>

            <!-- Slide to PPTX Tool Entry (slides mode only) -->
            <router-link
              v-if="store.currentMode === 'slides'"
              to="/slide-to-pptx"
              class="mt-6 flex items-center justify-between p-4 rounded-xl bg-mode-generate-muted border border-mode-generate hover:brightness-95 transition-all group"
            >
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-mode-generate-muted flex items-center justify-center">
                  <svg class="w-5 h-5 text-mode-generate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <p class="text-sm font-medium text-mode-generate">{{ $t('slideToPptx.entry.title') }}</p>
                  <p class="text-xs text-text-muted">{{ $t('slideToPptx.entry.desc') }}</p>
                </div>
              </div>
              <svg class="w-5 h-5 text-text-muted group-hover:text-mode-generate transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </router-link>

            <!-- Reference Images (not shown in video/slides mode - they have their own upload UI) -->
            <div v-if="store.currentMode !== 'video' && store.currentMode !== 'slides'" class="mt-6">
              <ImageUploader />
            </div>

            <!-- Character Carousel -->
            <!-- In video mode: only show for frames-to-video and references-to-video -->
            <!-- In slides mode: hidden (has its own reference images UI) -->
            <!-- In other modes: always show -->
            <div
              v-if="store.currentMode !== 'slides' && (store.currentMode !== 'video' || ['frames-to-video', 'references-to-video'].includes(store.videoOptions.subMode))"
              class="mt-6"
            >
              <CharacterCarousel
                :video-sub-mode="store.currentMode === 'video' ? store.videoOptions.subMode : null"
                @set-as-start-frame="handleSetAsStartFrame"
                @add-to-references="handleAddToReferences"
              />
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
                <VideoOptions v-else-if="store.currentMode === 'video'" key="video" />
                <SlidesOptions v-else-if="store.currentMode === 'slides'" key="slides" />
              </Transition>
            </div>

            <!-- Video Prompt Builder (video mode only) -->
            <div v-if="store.currentMode === 'video'" class="mt-6">
              <div class="divider"></div>
              <h3 class="font-semibold text-text-primary mb-4 flex items-center gap-2 mt-6">
                <svg class="w-5 h-5 text-mode-generate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                {{ $t('videoPrompt.title') }}
              </h3>
              <VideoPromptBuilder />
            </div>

            <!-- Error Message -->
            <div
              v-if="store.generationError"
              class="mt-6 p-4 rounded-xl bg-status-error-muted border border-status-error"
            >
              <div class="flex items-start gap-3">
                <svg
                  class="w-5 h-5 text-status-error flex-shrink-0 mt-0.5"
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
                <p class="text-status-error text-sm">{{ store.generationError }}</p>
              </div>
            </div>

            <!-- Slides Generation Progress Bar -->
            <div
              v-if="store.currentMode === 'slides' && store.isGenerating && store.slidesOptions.currentPageIndex >= 0"
              class="mt-6 p-4 rounded-xl bg-mode-generate-muted/30 border border-mode-generate space-y-3"
            >
              <!-- Progress Header -->
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <div class="w-2 h-2 rounded-full bg-mode-generate animate-pulse" />
                  <span class="text-sm font-medium text-mode-generate">
                    {{ $t('slides.generatingPage', { current: store.slidesOptions.currentPageIndex + 1, total: store.slidesOptions.totalPages }) }}
                  </span>
                </div>
                <span class="text-sm font-mono text-mode-generate">{{ slidesProgressPercent }}%</span>
              </div>

              <!-- Progress Bar -->
              <div class="h-2 bg-bg-muted rounded-full overflow-hidden">
                <div
                  class="h-full bg-mode-generate rounded-full transition-all duration-500 ease-out"
                  :style="{ width: `${slidesProgressPercent}%` }"
                />
              </div>

              <!-- ETA Display -->
              <div class="flex items-center justify-between text-xs text-text-muted">
                <span>{{ $t('slides.progressCompleted', { count: store.slidesOptions.currentPageIndex }) }}</span>
                <span v-if="slidesEtaFormatted">{{ $t('slides.eta', { time: slidesEtaFormatted }) }}</span>
              </div>
            </div>

            <!-- Generate Button -->
            <div class="mt-8">
              <button
                @click="handleGenerate"
                :disabled="store.isGenerating || isAnyPageGenerating || isSlidesAnalyzing || !store.hasApiKey || isSlidesNotReady"
                data-tour="generate-button"
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
        <p class="text-sm" :class="store.theme === 'dark' ? 'text-text-muted' : 'text-text-muted'">
          {{ $t('footer.title') }}
        </p>
        <div class="flex items-center justify-center gap-1">
          <GitHubLink size="md" />
          <YouTubeLink size="md" />
        </div>
      </footer>
    </section>

    <!-- User Tour (Onboarding) -->
    <UserTour />
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
