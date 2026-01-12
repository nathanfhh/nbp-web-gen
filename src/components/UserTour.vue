<script setup>
/**
 * User Tour Component
 * 首次使用導覽 UI，提供 spotlight 聚焦和 tooltip 說明
 */
import { computed, watch, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTour } from '@/composables/useTour'

const { t } = useI18n()
const tour = useTour()

// Confetti 粒子
const confettiParticles = ref([])
const CONFETTI_COLORS = [
  '#FF6B6B', '#4ECDC4', '#FFE66D', '#95E1D3',
  '#F38181', '#AA96DA', '#FCBAD3', '#A8D8EA',
  '#FF9F43', '#6C5CE7', '#00B894', '#FD79A8'
]

// 生成 confetti 粒子
const generateConfetti = () => {
  const particles = []
  for (let i = 0; i < 100; i++) {
    particles.push({
      id: i,
      x: Math.random() * 100, // 起始 X 位置 (%)
      delay: Math.random() * 0.5, // 延遲 (秒)
      duration: 2 + Math.random() * 2, // 持續時間 (秒)
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      size: 6 + Math.random() * 8, // 大小 (px)
      rotation: Math.random() * 360, // 初始旋轉角度
    })
  }
  confettiParticles.value = particles
}

// 監聽 confetti 狀態
watch(
  () => tour.showConfetti.value,
  (show) => {
    if (show) {
      generateConfetti()
    } else {
      confettiParticles.value = []
    }
  }
)

// 註冊事件監聽器 (確保只在此組件中註冊一次)
onMounted(() => {
  tour.registerEventListeners()
})

onUnmounted(() => {
  tour.unregisterEventListeners()
})

// Tooltip 尺寸常數
const TOOLTIP_WIDTH = 320
const TOOLTIP_PADDING = 16
const SPOTLIGHT_PADDING = 8

// ============================================================================
// Spotlight 樣式計算
// ============================================================================
const spotlightStyle = computed(() => {
  if (!tour.targetRect.value) {
    return { display: 'none' }
  }

  const rect = tour.targetRect.value
  const padding = SPOTLIGHT_PADDING

  return {
    top: `${rect.top - padding}px`,
    left: `${rect.left - padding}px`,
    width: `${rect.width + padding * 2}px`,
    height: `${rect.height + padding * 2}px`,
  }
})

// ============================================================================
// Tooltip 位置計算
// ============================================================================
const tooltipStyle = computed(() => {
  if (!tour.targetRect.value || !tour.currentStep.value) {
    return { display: 'none' }
  }

  const rect = tour.targetRect.value
  const placement = tour.currentStep.value.placement
  const gap = TOOLTIP_PADDING
  const tooltipWidth = TOOLTIP_WIDTH
  const estimatedTooltipHeight = 200

  let top, left

  switch (placement) {
    case 'top':
      top = rect.top - estimatedTooltipHeight - gap
      left = rect.left + rect.width / 2 - tooltipWidth / 2
      break
    case 'bottom':
      top = rect.bottom + gap
      left = rect.left + rect.width / 2 - tooltipWidth / 2
      break
    case 'left':
      top = rect.top + rect.height / 2 - estimatedTooltipHeight / 2
      left = rect.left - tooltipWidth - gap
      break
    case 'right':
    default:
      top = rect.top + rect.height / 2 - estimatedTooltipHeight / 2
      left = rect.right + gap
      break
  }

  // 邊界檢查：確保不超出視窗
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  // 水平邊界
  if (left < gap) {
    left = gap
  } else if (left + tooltipWidth > viewportWidth - gap) {
    left = viewportWidth - tooltipWidth - gap
  }

  // 垂直邊界
  if (top < gap) {
    top = gap
  } else if (top + estimatedTooltipHeight > viewportHeight - gap) {
    top = viewportHeight - estimatedTooltipHeight - gap
  }

  return {
    top: `${top}px`,
    left: `${left}px`,
    width: `${tooltipWidth}px`,
  }
})

// 當步驟改變時重新計算位置
watch(
  () => tour.currentStepIndex.value,
  () => {
    tour.updateTargetRect()
  }
)
</script>

<template>
  <Teleport to="body">
    <!-- Confetti 效果 -->
    <Transition name="confetti">
      <div v-if="tour.showConfetti.value" class="confetti-container">
        <div
          v-for="particle in confettiParticles"
          :key="particle.id"
          class="confetti-particle"
          :style="{
            left: `${particle.x}%`,
            backgroundColor: particle.color,
            width: `${particle.size}px`,
            height: `${particle.size}px`,
            animationDelay: `${particle.delay}s`,
            animationDuration: `${particle.duration}s`,
            transform: `rotate(${particle.rotation}deg)`,
          }"
        />
      </div>
    </Transition>

    <Transition name="tour">
      <div v-if="tour.isActive.value" class="tour-container">
        <!-- Overlay - 全螢幕暗化背景 (允許滾動穿透) -->
        <div class="tour-overlay" />

        <!-- Spotlight - 高亮目標元素 -->
        <div v-if="tour.targetRect.value" class="tour-spotlight" :style="spotlightStyle" />

        <!-- Tooltip - 說明卡片 -->
        <div class="tour-tooltip glass-strong" :style="tooltipStyle">
          <!-- Header: 進度 + 關閉按鈕 -->
          <div class="flex items-center justify-between mb-4">
            <span
              class="text-xs font-medium px-2 py-1 rounded-full bg-mode-generate-muted text-mode-generate"
            >
              {{ tour.progress.value }}
            </span>
            <button
              @click="tour.skip"
              class="p-1.5 rounded-lg hover:bg-bg-interactive text-text-muted hover:text-text-primary transition-colors"
              :title="t('tour.skip')"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <!-- Content: 標題 + 說明 -->
          <div class="mb-6">
            <h3 class="text-lg font-semibold text-text-primary mb-2">
              {{ tour.currentStep.value?.title }}
            </h3>
            <p class="text-sm text-text-muted leading-relaxed">
              {{ tour.currentStep.value?.description }}
            </p>
          </div>

          <!-- Footer: 導航按鈕 -->
          <div class="flex items-center gap-3">
            <!-- 上一步 / 跳過 -->
            <button
              v-if="!tour.isFirstStep.value"
              @click="tour.prev"
              class="flex-1 py-2.5 px-4 rounded-xl text-sm font-medium transition-all bg-bg-muted border border-border-muted text-text-secondary hover:bg-bg-interactive"
            >
              {{ t('tour.prev') }}
            </button>
            <button
              v-else
              @click="tour.skip"
              class="flex-1 py-2.5 px-4 rounded-xl text-sm font-medium transition-all bg-bg-muted border border-border-muted text-text-secondary hover:bg-bg-interactive"
            >
              {{ t('tour.skip') }}
            </button>

            <!-- 下一步 / 完成 -->
            <button
              @click="tour.next"
              class="flex-1 py-2.5 px-4 rounded-xl text-sm font-medium transition-all bg-brand-primary text-text-on-brand hover:bg-brand-primary-hover"
            >
              {{ tour.isLastStep.value ? t('tour.finish') : t('tour.next') }}
            </button>
          </div>

          <!-- 鍵盤提示 -->
          <p class="text-xs text-text-muted text-center mt-4 hidden sm:block">
            {{ t('tour.keyboardHint') }}
          </p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Container */
.tour-container {
  position: fixed;
  inset: 0;
  z-index: 10000;
  pointer-events: none;
}

/* Overlay - 全螢幕暗化 (允許滾動穿透) */
.tour-overlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
}

/* Spotlight - 高亮目標元素 */
.tour-spotlight {
  position: fixed;
  border-radius: 12px;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.6);
  pointer-events: none;
  transition: all 0.3s ease;
  z-index: 10001;
}

/* Tooltip */
.tour-tooltip {
  position: fixed;
  max-width: 320px;
  padding: 20px;
  z-index: 10002;
  pointer-events: auto;
  transition: all 0.3s ease;
}

/* Transitions */
.tour-enter-active,
.tour-leave-active {
  transition: opacity 0.3s ease;
}

.tour-enter-from,
.tour-leave-to {
  opacity: 0;
}

.tour-enter-active .tour-tooltip,
.tour-leave-active .tour-tooltip {
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}

.tour-enter-from .tour-tooltip,
.tour-leave-to .tour-tooltip {
  transform: scale(0.95);
}

/* Confetti Container */
.confetti-container {
  position: fixed;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 10003;
}

/* Confetti Particle */
.confetti-particle {
  position: absolute;
  top: -20px;
  border-radius: 2px;
  animation: confetti-fall linear forwards;
}

@keyframes confetti-fall {
  0% {
    transform: translateY(0) rotate(0deg);
    opacity: 1;
  }
  100% {
    transform: translateY(100vh) rotate(720deg);
    opacity: 0;
  }
}

/* Confetti Transition */
.confetti-enter-active {
  transition: opacity 0.2s ease;
}

.confetti-leave-active {
  transition: opacity 0.5s ease;
}

.confetti-enter-from,
.confetti-leave-to {
  opacity: 0;
}
</style>
