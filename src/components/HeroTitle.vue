<script setup>
import { ref, onMounted, computed } from 'vue'
import { useGeneratorStore } from '@/stores/generator'

const store = useGeneratorStore()

// Animation phases:
// 0 = initial (hidden)
// 1 = flying in + genie bounce
// 2 = collision! 'a' ejects
// 3 = 'e' ejects
// 4 = 'r' ejects
// 5 = 'C' ejects
// 6 = "Mediator" formed
// 7 = flip letters r→o→t→a→i→d→e→m, swap a&i
// 8 = AI highlight effect
// 9 = final state
const animationPhase = ref(0)
const showSparks = ref(false)

// Track which letters have been flipped
const flippedLetters = ref(new Set())
// Track if a&i have been swapped
const aiSwapped = ref(false)
// Track AI highlight state
const aiHighlight = ref(false)
// Prevent re-triggering during animation
const isAnimating = ref(false)

const runAnimation = () => {
  // Ignore clicks while animation is running
  if (isAnimating.value) return

  isAnimating.value = true
  animationPhase.value = 0
  showSparks.value = false
  flippedLetters.value = new Set()
  aiSwapped.value = false
  aiHighlight.value = false
  mLowercased.value = false

  requestAnimationFrame(() => {
    setTimeout(() => {
      // Phase 1: Fly in + genie bounce
      animationPhase.value = 1

      setTimeout(() => {
        // Phase 2: Collision! 'a' ejects
        animationPhase.value = 2
        showSparks.value = true

        setTimeout(() => {
          animationPhase.value = 3 // 'e' ejects
          setTimeout(() => {
            animationPhase.value = 4 // 'r' ejects
            setTimeout(() => {
              animationPhase.value = 5 // 'C' ejects
              showSparks.value = false
              setTimeout(() => {
                animationPhase.value = 6 // Mediator formed

                // Start flip sequence after a pause
                setTimeout(() => {
                  animationPhase.value = 7
                  startFlipSequence()
                }, 600)
              }, 300)
            }, 150)
          }, 150)
        }, 150)
      }, 700 + 600)
    }, 100)
  })
}

const startFlipSequence = () => {
  // Flip order: r(7) → o(6) → t(5) → a(4) → i(3) → d(2) → e(1) → m(0)
  // Index in "Mediator": M(0) e(1) d(2) i(3) a(4) t(5) o(6) r(7)
  const flipOrder = [7, 6, 5, 4, 3, 2, 1, 0] // r, o, t, a, i, d, e, m
  let delay = 0
  const flipDuration = 120

  flipOrder.forEach((index) => {
    setTimeout(() => {
      flippedLetters.value.add(index)

      // When both a(4) and i(3) are flipped, swap them (at 90deg, halfway through flip)
      if (flippedLetters.value.has(3) && flippedLetters.value.has(4) && !aiSwapped.value) {
        setTimeout(() => {
          aiSwapped.value = true
        }, flipDuration / 2)
      }

      // When M(0) is flipped, lowercase it at 90deg
      if (index === 0 && !mLowercased.value) {
        setTimeout(() => {
          mLowercased.value = true
        }, flipDuration / 2)
      }
    }, delay)
    delay += flipDuration
  })

  // After all flips complete, trigger AI highlight
  setTimeout(() => {
    animationPhase.value = 8
    aiHighlight.value = true

    // Return to final state
    setTimeout(() => {
      aiHighlight.value = false
      animationPhase.value = 9
      isAnimating.value = false
    }, 800)
  }, delay + 300)
}

onMounted(() => {
  runAnimation()
})

const phase = computed(() => animationPhase.value)

// Track if M has been lowercased (during its flip)
const mLowercased = ref(false)

// Letters for final Mediator display
const mediatorLetters = computed(() => {
  const m = mLowercased.value ? 'm' : 'M'
  if (!aiSwapped.value) {
    // Original: M-e-d-i-a-t-o-r
    return [m, 'e', 'd', 'i', 'a', 't', 'o', 'r']
  } else {
    // Swapped: m-e-d-A-I-t-o-r
    return [m, 'e', 'd', 'A', 'I', 't', 'o', 'r']
  }
})

const isFlipped = (index) => flippedLetters.value.has(index)

defineExpose({ runAnimation })
</script>

<template>
  <h1
    class="text-5xl lg:text-7xl font-bold mb-4 hero-title cursor-pointer select-none"
    :class="store.theme === 'dark' ? 'glow-text-purple' : ''"
    @click="runAnimation"
    :title="$t('hero.replayAnimation')"
  >
    <!-- Phase 0-6: Media + Creator collision animation -->
    <span v-if="phase < 7" class="hero-container" :class="`phase-${phase}`">
      <span class="hero-word hero-media">Media</span>
      <span class="hero-space">&nbsp;</span>

      <span v-if="showSparks" class="sparks-container">
        <span class="spark spark-1"></span>
        <span class="spark spark-2"></span>
        <span class="spark spark-3"></span>
        <span class="spark spark-4"></span>
        <span class="spark spark-5"></span>
        <span class="spark spark-6"></span>
      </span>

      <span class="hero-word hero-creator">
        <span class="hero-letter hero-C">C</span>
        <span class="hero-letter hero-r">r</span>
        <span class="hero-letter hero-e">e</span>
        <span class="hero-letter hero-a">a</span>
        <span class="hero-letter hero-tor">tor</span>
      </span>
    </span>

    <!-- Phase 7+: Flip animation to medAItor -->
    <span v-else class="hero-container mediator-final">
      <span
        v-for="(letter, index) in mediatorLetters"
        :key="index"
        class="flip-letter"
        :class="{
          'is-flipped': isFlipped(index),
          'is-ai': aiSwapped && (index === 3 || index === 4),
          'ai-highlight': aiHighlight && (index === 3 || index === 4)
        }"
      >{{ letter }}</span>
    </span>
  </h1>
</template>

<style scoped>
.hero-title {
  position: relative;
  display: block;
  text-align: center;
  overflow: visible;
}

.hero-container {
  display: inline-flex;
  position: relative;
  justify-content: center;
  align-items: center;
}

.hero-word {
  display: inline-flex;
  background: linear-gradient(
    to right,
    var(--color-gradient-brand-start),
    var(--color-gradient-brand-middle),
    var(--color-gradient-brand-end)
  );
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  white-space: nowrap;
  will-change: transform, opacity;
}

.hero-media {
  transition:
    transform 0.7s cubic-bezier(0.34, 1.56, 0.64, 1),
    opacity 0.5s ease;
}

.hero-creator {
  transition:
    transform 0.7s cubic-bezier(0.34, 1.56, 0.64, 1),
    opacity 0.5s ease;
}

.hero-letter {
  display: inline-block;
  transition:
    opacity 0.15s ease,
    transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
    max-width 0.15s ease;
  overflow: hidden;
}

.hero-C { max-width: 0.7em; }
.hero-r { max-width: 0.45em; }
.hero-e { max-width: 0.55em; }
.hero-a { max-width: 0.55em; }

.hero-space {
  display: inline-block;
  max-width: 0.5ch;
  transition: max-width 0.3s ease, opacity 0.3s ease;
  overflow: hidden;
}

/* ============================================
   Sparks Effect
   ============================================ */
.sparks-container {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 10;
}

.spark {
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-gradient-brand-middle, #fbbf24);
  box-shadow:
    0 0 6px 2px var(--color-gradient-brand-middle, #fbbf24),
    0 0 12px 4px var(--color-gradient-brand-start, #f59e0b);
  animation: spark-fly 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
}

.spark-1 { --spark-x: -60px; --spark-y: -40px; animation-delay: 0ms; }
.spark-2 { --spark-x: 60px; --spark-y: -35px; animation-delay: 50ms; }
.spark-3 { --spark-x: -45px; --spark-y: 45px; animation-delay: 30ms; }
.spark-4 { --spark-x: 50px; --spark-y: 40px; animation-delay: 80ms; }
.spark-5 { --spark-x: -30px; --spark-y: -55px; animation-delay: 60ms; }
.spark-6 { --spark-x: 35px; --spark-y: 50px; animation-delay: 40ms; }

@keyframes spark-fly {
  0% {
    transform: translate(0, 0) scale(1);
    opacity: 1;
  }
  100% {
    transform: translate(var(--spark-x), var(--spark-y)) scale(0);
    opacity: 0;
  }
}

/* ============================================
   Phase 0-6: Collision Animation
   ============================================ */
.phase-0 .hero-media {
  opacity: 0;
  transform: translateX(-100vw);
}

.phase-0 .hero-creator {
  opacity: 0;
  transform: translateX(100vw);
}

.phase-1 .hero-media {
  opacity: 1;
  transform: translateX(0);
  animation: genie-bounce 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

.phase-1 .hero-creator {
  opacity: 1;
  transform: translateX(0);
  animation: genie-bounce 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

@keyframes genie-bounce {
  0% { transform: translateX(0) scale(1); }
  40% { transform: translateX(0) scale(1.15, 0.9); }
  60% { transform: translateX(0) scale(0.95, 1.05); }
  80% { transform: translateX(0) scale(1.02, 0.98); }
  100% { transform: translateX(0) scale(1); }
}

.phase-2 .hero-media {
  opacity: 1;
  transform: translateX(5px) scaleX(0.97);
  animation: squeeze-left 0.15s ease-in-out;
}

.phase-2 .hero-creator {
  opacity: 1;
  transform: translateX(-5px) scaleX(0.97);
  animation: squeeze-right 0.15s ease-in-out;
}

@keyframes squeeze-left {
  0%, 100% { transform: translateX(0) scaleX(1); }
  50% { transform: translateX(8px) scaleX(0.94); }
}

@keyframes squeeze-right {
  0%, 100% { transform: translateX(0) scaleX(1); }
  50% { transform: translateX(-8px) scaleX(0.94); }
}

.phase-2 .hero-space,
.phase-3 .hero-space,
.phase-4 .hero-space,
.phase-5 .hero-space,
.phase-6 .hero-space {
  max-width: 0;
  opacity: 0;
}

.phase-2 .hero-a {
  opacity: 0;
  max-width: 0;
  transform: translate(20px, -40px) rotate(15deg) scale(0.5);
}
.phase-3 .hero-a,
.phase-4 .hero-a,
.phase-5 .hero-a,
.phase-6 .hero-a {
  opacity: 0;
  max-width: 0;
  transform: none;
}

.phase-3 .hero-media,
.phase-4 .hero-media,
.phase-5 .hero-media,
.phase-6 .hero-media {
  opacity: 1;
  transform: translateX(0);
}

.phase-3 .hero-creator,
.phase-4 .hero-creator,
.phase-5 .hero-creator,
.phase-6 .hero-creator {
  opacity: 1;
  transform: translateX(0);
}

.phase-3 .hero-e {
  opacity: 0;
  max-width: 0;
  transform: translate(35px, -50px) rotate(-20deg) scale(0.5);
}
.phase-4 .hero-e,
.phase-5 .hero-e,
.phase-6 .hero-e {
  opacity: 0;
  max-width: 0;
  transform: none;
}

.phase-4 .hero-r {
  opacity: 0;
  max-width: 0;
  transform: translate(50px, -35px) rotate(30deg) scale(0.5);
}
.phase-5 .hero-r,
.phase-6 .hero-r {
  opacity: 0;
  max-width: 0;
  transform: none;
}

.phase-5 .hero-C {
  opacity: 0;
  max-width: 0;
  transform: translate(60px, -60px) rotate(-25deg) scale(0.5);
}
.phase-6 .hero-C {
  opacity: 0;
  max-width: 0;
  transform: none;
}

/* ============================================
   Phase 7+: Flip Animation & AI Highlight
   ============================================ */
.mediator-final {
  perspective: 1000px;
}

.flip-letter {
  display: inline-block;
  position: relative;
  background: linear-gradient(
    to right,
    var(--color-gradient-brand-start),
    var(--color-gradient-brand-middle),
    var(--color-gradient-brand-end)
  );
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  transition: margin 0.3s ease, transform 0.3s ease;
}

/* Flip animation */
.flip-letter.is-flipped {
  animation: card-flip 0.3s ease forwards;
}

@keyframes card-flip {
  0% {
    transform: perspective(400px) rotateY(0deg);
  }
  50% {
    transform: perspective(400px) rotateY(90deg) scale(1.1);
  }
  100% {
    transform: perspective(400px) rotateY(0deg);
  }
}

/* AI letters styling after swap */
.flip-letter.is-ai {
  font-weight: 800;
}

/* AI highlight effect */
.flip-letter.ai-highlight {
  background: linear-gradient(
    to bottom,
    var(--color-mode-generate, #3b82f6),
    var(--color-brand-primary, #6366f1)
  );
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: ai-pop 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  filter: drop-shadow(0 0 12px var(--color-mode-generate, #3b82f6));
}

/* First AI letter (A at index 3) - add left margin */
.flip-letter.ai-highlight:nth-child(4) {
  margin-left: 0.15em;
}

/* Second AI letter (I at index 4) - add right margin */
.flip-letter.ai-highlight:nth-child(5) {
  margin-right: 0.15em;
}

@keyframes ai-pop {
  0% {
    transform: scaleY(1) scaleX(1);
  }
  30% {
    transform: scaleY(1.4) scaleX(1.1);
  }
  60% {
    transform: scaleY(1.2) scaleX(1.05);
  }
  100% {
    transform: scaleY(1) scaleX(1);
  }
}
</style>
