<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useGeneratorStore } from '@/stores/generator'
import { useIndexedDB } from '@/composables/useIndexedDB'
import { useCharacterTransfer } from '@/composables/useCharacterTransfer'
import { useToast } from '@/composables/useToast'
import ConfirmModal from '@/components/ConfirmModal.vue'

const { t } = useI18n()
const router = useRouter()
const store = useGeneratorStore()
const toast = useToast()
const { getCharacters, deleteCharacter: dbDeleteCharacter, getCharacterCount } = useIndexedDB()
const { exportSingleCharacter, isExporting } = useCharacterTransfer()

// Confirm modal ref
const confirmModal = ref(null)

// Characters data
const characters = ref([])
const isLoading = ref(false)
const characterCount = ref(0)

// Carousel state
const currentIndex = ref(0)
const isAnimating = ref(false)

// Load characters on mount
const loadCharacters = async () => {
  isLoading.value = true
  try {
    characters.value = await getCharacters(50) // Load up to 50 characters
    characterCount.value = await getCharacterCount()
    // Reset index if out of bounds
    if (currentIndex.value >= characters.value.length && characters.value.length > 0) {
      currentIndex.value = 0
    }
  } catch (err) {
    console.error('Failed to load characters:', err)
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  loadCharacters()
  // Listen for character updates from other components (e.g., P2P sync)
  window.addEventListener('characters-updated', loadCharacters)
})

onUnmounted(() => {
  window.removeEventListener('characters-updated', loadCharacters)
})

// Current character
const currentCharacter = computed(() => {
  return characters.value[currentIndex.value] || null
})

// Check if current character is selected
const isSelected = computed(() => {
  return store.selectedCharacter?.id === currentCharacter.value?.id
})

// Navigation
const hasPrev = computed(() => characters.value.length > 1)
const hasNext = computed(() => characters.value.length > 1)

const goToPrev = () => {
  if (isAnimating.value || !hasPrev.value) return
  isAnimating.value = true
  currentIndex.value = (currentIndex.value - 1 + characters.value.length) % characters.value.length
  setTimeout(() => { isAnimating.value = false }, 500)
}

const goToNext = () => {
  if (isAnimating.value || !hasNext.value) return
  isAnimating.value = true
  currentIndex.value = (currentIndex.value + 1) % characters.value.length
  setTimeout(() => { isAnimating.value = false }, 500)
}

// Select/deselect character
const toggleSelect = () => {
  if (!currentCharacter.value) return

  if (isSelected.value) {
    store.deselectCharacter()
  } else {
    store.selectCharacter(currentCharacter.value)
  }
}

// Delete character
const handleDelete = async () => {
  if (!currentCharacter.value) return

  const confirmed = await confirmModal.value?.show({
    title: t('characterCarousel.deleteConfirmTitle'),
    message: t('characterCarousel.deleteConfirmMessage', { name: currentCharacter.value.name }),
    confirmText: t('common.delete'),
    cancelText: t('common.cancel'),
  })

  if (!confirmed) return

  // If currently selected, deselect first
  if (isSelected.value) {
    store.deselectCharacter()
  }

  try {
    await dbDeleteCharacter(currentCharacter.value.id)
    await loadCharacters()
    toast.success(t('characterCarousel.deleteSuccess'))
  } catch (err) {
    console.error('Failed to delete character:', err)
    toast.error(t('characterCarousel.deleteError'))
  }
}

// Navigate to character extractor
const goToExtractor = () => {
  router.push({ name: 'character-extractor' })
}

// Edit current character
const editCharacter = () => {
  if (!currentCharacter.value) return
  router.push({ name: 'character-extractor', query: { edit: currentCharacter.value.id } })
}

// Export current character
const handleExport = async () => {
  if (!currentCharacter.value || isExporting.value) return
  const result = await exportSingleCharacter(currentCharacter.value.id)
  if (result.success) {
    toast.success(t('characterCarousel.exportSuccess'))
  } else {
    toast.error(t('characterCarousel.exportError'))
  }
}

// Calculate card position for 3D carousel
const getCardStyle = (index) => {
  const total = characters.value.length
  if (total <= 1) return { transform: 'translateZ(0)' }

  // Calculate position relative to current index
  let position = index - currentIndex.value

  // Wrap around for circular navigation
  if (position > total / 2) position -= total
  if (position < -total / 2) position += total

  // Calculate rotation and translation
  const rotateY = position * (360 / Math.max(total, 6))
  const translateZ = 180 // Distance from center
  const opacity = position === 0 ? 1 : Math.max(0.3, 1 - Math.abs(position) * 0.3)
  const scale = position === 0 ? 1 : Math.max(0.7, 1 - Math.abs(position) * 0.15)

  return {
    transform: `rotateY(${rotateY}deg) translateZ(${translateZ}px) scale(${scale})`,
    opacity,
    zIndex: 100 - Math.abs(position),
  }
}

// Watch for external character changes
watch(() => store.selectedCharacter, (newVal) => {
  if (newVal) {
    const idx = characters.value.findIndex(c => c.id === newVal.id)
    if (idx !== -1 && idx !== currentIndex.value) {
      currentIndex.value = idx
    }
  }
})
</script>

<template>
  <div class="character-carousel">
    <div class="carousel-header">
      <h3 class="carousel-title">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        {{ $t('characterCarousel.title') }}
        <span v-if="characterCount > 0" class="carousel-count">({{ characterCount }})</span>
      </h3>
      <button
        @click="goToExtractor"
        class="carousel-add-btn"
        :title="$t('characterCarousel.addNew')"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>

    <!-- Loading state -->
    <div v-if="isLoading" class="carousel-loading">
      <svg class="w-8 h-8 animate-spin text-mode-generate" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
      </svg>
    </div>

    <!-- Empty state -->
    <div v-else-if="characters.length === 0" class="carousel-empty">
      <div class="empty-icon">
        <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </div>
      <p class="empty-text">{{ $t('characterCarousel.empty') }}</p>
      <button @click="goToExtractor" class="empty-btn">
        {{ $t('characterCarousel.extractFirst') }}
      </button>
    </div>

    <!-- 3D Carousel -->
    <div v-else class="carousel-container">
      <!-- Navigation: Previous -->
      <button
        v-if="characters.length > 1"
        @click="goToPrev"
        class="carousel-nav carousel-nav-prev"
        :disabled="isAnimating"
      >
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <!-- Carousel Track -->
      <div class="carousel-stage">
        <div class="carousel-track" :class="{ 'is-animating': isAnimating }">
          <div
            v-for="(character, index) in characters"
            :key="character.id"
            class="carousel-card"
            :class="{ 'is-current': index === currentIndex, 'is-selected': store.selectedCharacter?.id === character.id }"
            :style="getCardStyle(index)"
            @click="currentIndex = index"
          >
            <div class="card-image">
              <img
                :src="`data:image/webp;base64,${character.thumbnail}`"
                :alt="character.name"
              />
            </div>
            <div class="card-name">{{ character.name }}</div>
          </div>
        </div>
      </div>

      <!-- Navigation: Next -->
      <button
        v-if="characters.length > 1"
        @click="goToNext"
        class="carousel-nav carousel-nav-next"
        :disabled="isAnimating"
      >
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>

    <!-- Character Info Panel -->
    <div v-if="currentCharacter" class="character-info">
      <div class="info-header">
        <h4 class="info-name">{{ currentCharacter.name }}</h4>
        <div class="info-actions">
          <button
            @click="toggleSelect"
            class="info-btn"
            :class="{ 'is-selected': isSelected }"
          >
            <svg v-if="isSelected" class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
            </svg>
            <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            {{ isSelected ? $t('characterCarousel.selected') : $t('characterCarousel.select') }}
          </button>
          <button
            @click="editCharacter"
            class="info-btn"
            :title="$t('common.edit')"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          <button
            @click="handleExport"
            class="info-btn"
            :class="{ 'opacity-50 cursor-wait': isExporting }"
            :disabled="isExporting"
            :title="$t('common.export')"
          >
            <svg v-if="isExporting" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
            <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          </button>
          <button
            @click="handleDelete"
            class="info-btn info-btn-danger"
            :title="$t('common.delete')"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
      <p class="info-description">{{ currentCharacter.description }}</p>

      <!-- Physical traits tags -->
      <div v-if="currentCharacter.physicalTraits" class="info-traits">
        <span
          v-for="(value, key) in currentCharacter.physicalTraits"
          :key="key"
          class="trait-tag"
          v-show="value && value !== 'unknown'"
        >
          {{ value }}
        </span>
      </div>
    </div>
  </div>

  <!-- Confirm Modal -->
  <ConfirmModal ref="confirmModal" />
</template>

<style scoped>
.character-carousel {
  padding: 1rem;
  background: var(--color-bg-subtle);
  border-radius: 1rem;
  border: 1px solid var(--color-border-subtle);
}

.carousel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.carousel-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text-primary);
}

.carousel-count {
  font-weight: 400;
  color: var(--color-text-muted);
}

.carousel-add-btn {
  padding: 0.5rem;
  background: var(--color-bg-interactive);
  border-radius: 0.5rem;
  color: var(--color-brand-primary);
  transition: all 0.2s;
}

.carousel-add-btn:hover {
  background: var(--color-bg-interactive-hover);
  transform: scale(1.05);
}

/* Loading state */
.carousel-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3rem;
}

/* Empty state */
.carousel-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2rem;
  text-align: center;
}

.empty-icon {
  color: var(--color-text-muted);
  margin-bottom: 0.75rem;
}

.empty-text {
  font-size: 0.875rem;
  color: var(--color-text-muted);
  margin-bottom: 1rem;
}

.empty-btn {
  padding: 0.5rem 1rem;
  background: var(--color-bg-interactive);
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-brand-primary);
  transition: all 0.2s;
}

.empty-btn:hover {
  background: var(--color-bg-interactive-hover);
}

/* Carousel container */
.carousel-container {
  position: relative;
  display: flex;
  align-items: center;
  padding: 0 2.5rem;
}

/* Stage and track for 3D effect */
.carousel-stage {
  flex: 1;
  perspective: 1000px;
  height: 160px;
  overflow: visible;
}

.carousel-track {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

.carousel-track.is-animating {
  pointer-events: none;
}

/* Carousel card */
.carousel-card {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 100px;
  margin-left: -50px;
  margin-top: -70px;
  transform-style: preserve-3d;
  transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
}

.carousel-card .card-image {
  width: 100px;
  height: 100px;
  border-radius: 0.75rem;
  overflow: hidden;
  background: var(--color-bg-elevated);
  border: 2px solid transparent;
  transition: all 0.3s;
  box-shadow: var(--shadow-glow-primary);
}

.carousel-card.is-current .card-image {
  border-color: var(--color-brand-primary-light);
  box-shadow: 0 12px 32px var(--color-bg-interactive-hover);
}

.carousel-card.is-selected .card-image {
  border-color: var(--color-status-success);
  box-shadow: 0 0 20px var(--color-status-success-muted);
}

.carousel-card .card-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.carousel-card .card-name {
  margin-top: 0.5rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-text-secondary);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.3s;
}

.carousel-card.is-current .card-name {
  color: var(--color-text-primary);
}

/* Navigation buttons */
.carousel-nav {
  position: absolute;
  z-index: 10;
  padding: 0.5rem;
  background: var(--color-bg-interactive);
  border-radius: 9999px;
  color: var(--color-text-secondary);
  transition: all 0.2s;
}

.carousel-nav:hover:not(:disabled) {
  background: var(--color-bg-interactive-hover);
  color: var(--color-text-primary);
}

.carousel-nav:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.carousel-nav-prev {
  left: 0;
}

.carousel-nav-next {
  right: 0;
}

/* Character info panel */
.character-info {
  margin-top: 1rem;
  padding: 1rem;
  background: var(--color-bg-muted);
  border-radius: 0.75rem;
}

.info-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.info-name {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text-primary);
}

.info-actions {
  display: flex;
  gap: 0.5rem;
}

.info-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 500;
  border-radius: 0.5rem;
  background: var(--color-bg-interactive);
  color: var(--color-brand-primary);
  transition: all 0.2s;
}

.info-btn:hover {
  background: var(--color-bg-interactive-hover);
}

.info-btn.is-selected {
  background: var(--color-status-success-muted);
  color: var(--color-status-success);
}

.info-btn.is-selected:hover {
  background: var(--color-status-success-muted);
  opacity: 0.8;
}

.info-btn-danger {
  background: var(--color-status-error-muted);
  color: var(--color-status-error);
}

.info-btn-danger:hover {
  background: var(--color-status-error-muted);
  opacity: 0.8;
}

.info-description {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin-bottom: 0.75rem;
}

.info-traits {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.trait-tag {
  padding: 0.25rem 0.5rem;
  font-size: 0.7rem;
  background: var(--color-bg-interactive);
  border-radius: 0.375rem;
  color: var(--color-text-muted);
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .carousel-track,
  .carousel-card {
    transition: none;
  }
}
</style>
