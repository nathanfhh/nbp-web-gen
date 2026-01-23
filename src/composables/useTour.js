/**
 * User Tour (Onboarding) Composable
 * 首次使用導覽功能，引導新用戶了解主要功能
 *
 * 使用 Singleton 模式：狀態在模組級別共享，確保多處呼叫 useTour() 共用同一狀態
 */
import { ref, computed, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLocalStorage } from '@/composables/useLocalStorage'

const TOUR_COMPLETED_KEY = 'nbp-tour-completed'
const TOUR_VERSION = 2 // 若 tour 更新可升版，強制用戶重新觀看

/**
 * Tour 步驟定義
 * @type {Array<{id: string, selector: string, placement: string}>}
 */
const TOUR_STEP_CONFIG = [
  {
    id: 'apiKey',
    selector: '[data-panel-id="api-key"]',
    placement: 'right',
  },
  {
    id: 'modeSelector',
    selector: '[data-panel-id="mode-selector"]',
    placement: 'right',
  },
  {
    id: 'promptInput',
    selector: '[data-panel-id="prompt-input"]',
    placement: 'left',
  },
  {
    id: 'generateButton',
    selector: '[data-tour="generate-button"]',
    placement: 'left',
  },
  {
    id: 'history',
    selector: '[data-panel-id="history"]',
    placement: 'right',
  },
  {
    id: 'docs',
    selector: '[data-tour="docs-link"]',
    placement: 'bottom',
  },
]

// ============================================================================
// Singleton State (模組級別，確保多處呼叫共用同一狀態)
// ============================================================================
const isActive = ref(false)
const currentStepIndex = ref(0)
const targetRect = ref(null)
const showConfetti = ref(false)

export function useTour() {
  const { t } = useI18n()
  const { getQuickSetting, updateQuickSetting } = useLocalStorage()

  // ============================================================================
  // Computed - 步驟配置 (帶 i18n)
  // ============================================================================
  const steps = computed(() =>
    TOUR_STEP_CONFIG.map((step) => ({
      ...step,
      title: t(`tour.steps.${step.id}.title`),
      description: t(`tour.steps.${step.id}.description`),
    }))
  )

  const currentStep = computed(() => steps.value[currentStepIndex.value] || null)
  const totalSteps = computed(() => steps.value.length)
  const isFirstStep = computed(() => currentStepIndex.value === 0)
  const isLastStep = computed(() => currentStepIndex.value === steps.value.length - 1)
  const progress = computed(() => `${currentStepIndex.value + 1}/${totalSteps.value}`)

  // ============================================================================
  // Persistence
  // ============================================================================
  const isTourCompleted = () => {
    const completed = getQuickSetting(TOUR_COMPLETED_KEY)
    // 檢查版本，若版本升級則需重新觀看
    return completed?.version >= TOUR_VERSION
  }

  const markTourCompleted = () => {
    updateQuickSetting(TOUR_COMPLETED_KEY, {
      version: TOUR_VERSION,
      completedAt: Date.now(),
    })
  }

  const resetTourCompletion = () => {
    updateQuickSetting(TOUR_COMPLETED_KEY, null)
  }

  // ============================================================================
  // Element Targeting
  // ============================================================================

  // 只更新位置，不滾動（用於 scroll/resize 事件）
  const updateTargetRect = () => {
    if (!currentStep.value) {
      targetRect.value = null
      return
    }

    const el = document.querySelector(currentStep.value.selector)
    if (!el) {
      targetRect.value = null
      return
    }

    targetRect.value = el.getBoundingClientRect()
  }

  // 滾動到目標元素並更新位置（用於切換步驟時）
  const scrollToTargetAndUpdate = async () => {
    if (!currentStep.value) {
      targetRect.value = null
      return
    }

    const el = document.querySelector(currentStep.value.selector)
    if (!el) {
      targetRect.value = null
      return
    }

    // 取得元素位置
    const rect = el.getBoundingClientRect()

    // 檢查元素是否在視窗內
    const isInViewport = rect.top >= 0 && rect.bottom <= window.innerHeight

    if (!isInViewport) {
      // 滾動到目標元素
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      // 等待滾動完成後重新計算位置
      await new Promise((resolve) => setTimeout(resolve, 350))
    }

    // 更新位置
    targetRect.value = el.getBoundingClientRect()
  }

  // ============================================================================
  // Navigation
  // ============================================================================
  const start = async () => {
    currentStepIndex.value = 0
    isActive.value = true
    await nextTick()
    await scrollToTargetAndUpdate()
  }

  const next = async () => {
    if (isLastStep.value) {
      complete()
      return
    }

    currentStepIndex.value++
    await nextTick()
    await scrollToTargetAndUpdate()
  }

  const prev = async () => {
    if (isFirstStep.value) return

    currentStepIndex.value--
    await nextTick()
    await scrollToTargetAndUpdate()
  }

  const skip = () => {
    isActive.value = false
    markTourCompleted()
  }

  const complete = () => {
    isActive.value = false
    markTourCompleted()
    // 觸發 confetti 效果
    showConfetti.value = true
    // 動畫結束後重置
    setTimeout(() => {
      showConfetti.value = false
    }, 3000)
  }

  // ============================================================================
  // Auto-start Logic
  // ============================================================================
  const autoStartIfNeeded = () => {
    if (!isTourCompleted()) {
      // 延遲啟動，等待 Hero 動畫完成 (~2.5s) + 面板動畫
      setTimeout(() => {
        start()
      }, 3500)
    }
  }

  // ============================================================================
  // Event Handlers (由 UserTour.vue 組件管理，避免重複註冊)
  // ============================================================================
  const handleResize = () => {
    if (isActive.value) {
      updateTargetRect()
    }
  }

  const handleScroll = () => {
    if (isActive.value) {
      updateTargetRect()
    }
  }

  const handleKeydown = (e) => {
    if (!isActive.value) return

    switch (e.key) {
      case 'Escape':
        skip()
        break
      case 'ArrowRight':
      case 'Enter':
        next()
        break
      case 'ArrowLeft':
        prev()
        break
    }
  }

  // 註冊/移除事件監聯器 (由組件呼叫，確保只註冊一次)
  const registerEventListeners = () => {
    window.addEventListener('resize', handleResize)
    window.addEventListener('scroll', handleScroll, true) // capture phase 以捕獲所有滾動
    window.addEventListener('keydown', handleKeydown)
  }

  const unregisterEventListeners = () => {
    window.removeEventListener('resize', handleResize)
    window.removeEventListener('scroll', handleScroll, true)
    window.removeEventListener('keydown', handleKeydown)
  }

  return {
    // State
    isActive,
    currentStep,
    currentStepIndex,
    totalSteps,
    progress,
    targetRect,
    isFirstStep,
    isLastStep,
    showConfetti,

    // Actions
    start,
    next,
    prev,
    skip,
    complete,
    autoStartIfNeeded,
    resetTourCompletion,
    isTourCompleted,
    updateTargetRect,
    registerEventListeners,
    unregisterEventListeners,
  }
}
