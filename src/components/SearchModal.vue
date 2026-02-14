<script setup>
import { ref, computed, watch, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useSearchWorker } from '@/composables/useSearchWorker'
import { useIndexedDB } from '@/composables/useIndexedDB'
import { useConversationStorage } from '@/composables/useConversationStorage'
import { useHistoryState } from '@/composables/useHistoryState'
import { deduplicateByParent, highlightSnippet, SEARCH_DEFAULTS } from '@/utils/search-core'
import { getModeTagStyle } from '@/constants'

dayjs.extend(relativeTime)

const props = defineProps({
  modelValue: Boolean,
})
const emit = defineEmits(['update:modelValue', 'openLightbox'])

const { t, locale } = useI18n()
const searchWorker = useSearchWorker()
const { getHistoryByIds, getAllHistoryIds } = useIndexedDB()
const conversationStorage = useConversationStorage()

// ============================================================================
// History State (back gesture support)
// ============================================================================

const { pushState, popState } = useHistoryState('searchModal', {
  onBackNavigation: () => close(),
})

// ============================================================================
// Local State
// ============================================================================

const searchInputRef = ref(null)
const query = ref('')
const selectedMode = ref('')
const selectedStrategy = ref('hybrid')
const results = ref([])
const searchElapsed = ref(0)
const isSearching = ref(false)
const isIndexing = ref(false)
const hasSearched = ref(false)

const strategies = ['hybrid', 'vector', 'fulltext']
const modeFilters = ['', 'generate', 'sticker', 'edit', 'story', 'diagram', 'video', 'slides', 'agent']

const modeLabels = computed(() => ({
  generate: t('modes.generate.name'),
  edit: t('modes.edit.name'),
  story: t('modes.story.name'),
  diagram: t('modes.diagram.name'),
  sticker: t('modes.sticker.name'),
  video: t('modes.video.name'),
  slides: t('modes.slides.name'),
  agent: t('modes.agent.name'),
}))

// ============================================================================
// Model loading label (changes based on stage)
// ============================================================================

const modelLoadingLabel = computed(() => {
  const stage = searchWorker.modelStage.value
  if (stage === 'init') return t('search.model.initializing')
  return t('search.model.downloading')
})

// ============================================================================
// Initialization
// ============================================================================

async function initializeSearch() {
  try {
    await searchWorker.initialize()
    console.log('[RAG Search] Worker ready, indexed:', searchWorker.indexedCount.value, 'parents')
    await runSelfHeal()

    // Run diagnostic and output to console
    await runDiagnostic()
  } catch (err) {
    console.error('[RAG Search] Init failed:', err)
  }
}

async function runDiagnostic() {
  try {
    const diag = await searchWorker.diagnose()
    console.group('[RAG Search] === Diagnostic Report ===')
    console.log('Orama chunks:', diag.totalDocs, '| Unique parents:', diag.uniqueParents)
    console.log('Embedding cache size:', diag.embeddingCacheSize)
    console.log('Parent IDs (first 50):', diag.parentIds)
    console.log('Chunk distribution (chunks/parent → count):', diag.chunkDistribution)
    if (diag.sampleDoc) {
      console.log('Sample:', diag.sampleDoc)
    }
    console.log('Has non-zero vectors:', diag.hasNonZeroVectors)
    console.groupEnd()
  } catch (err) {
    console.warn('[RAG Search] Diagnose failed:', err.message)
  }
}

async function runSelfHeal() {
  if (!searchWorker.isReady.value) return

  try {
    const allIds = await getAllHistoryIds()
    console.log('[RAG Search] Self-heal: history has', allIds.length, 'records')
    const missingIds = await searchWorker.selfHeal(allIds)
    console.log('[RAG Search] Self-heal: missing', missingIds.length, ', will index')

    if (missingIds.length > 0) {
      await indexMissingRecords(missingIds)
    }
  } catch (err) {
    console.error('[RAG Search] Self-heal failed:', err)
  }
}

/**
 * Strip heavy fields from a record before sending to worker.
 * Worker only needs: id, mode, prompt, timestamp, options.pagesContent
 */
function stripRecordForIndexing(record) {
  const stripped = {
    id: record.id,
    mode: record.mode,
    prompt: record.prompt,
    timestamp: record.timestamp,
  }
  // Slides mode needs pagesContent
  if (record.mode === 'slides' && record.options?.pagesContent) {
    stripped.options = { pagesContent: record.options.pagesContent }
  }
  return stripped
}

/**
 * Strip heavy fields from agent conversation messages.
 * Worker only needs user text messages (no images, no model replies).
 */
function stripConversationForIndexing(conversation) {
  if (!Array.isArray(conversation)) return null
  return conversation
    .filter((msg) => msg && msg.role === 'user' && !msg._isPartial)
    .map((msg) => ({
      role: msg.role,
      parts: (msg.parts || [])
        .filter((p) => p?.type === 'text')
        .map((p) => ({ type: 'text', text: p.text })),
    }))
}

async function indexMissingRecords(missingIds) {
  isIndexing.value = true
  console.log(`[RAG Search] Indexing ${missingIds.length} missing records...`)

  try {
    // Load records from IndexedDB
    const numericIds = missingIds.map((id) => (typeof id === 'string' ? parseInt(id, 10) : id))
    const records = await getHistoryByIds(numericIds)
    console.log(`[RAG Search] Loaded ${records.length} records from IndexedDB`)

    // Prepare lightweight records for worker
    const preparedRecords = []
    for (const record of records) {
      const item = { record: stripRecordForIndexing(record) }

      if (record.mode === 'agent') {
        try {
          const opfsPath = `/conversations/${record.id}/conversation.json`
          const conversation = await conversationStorage.loadConversation(opfsPath)
          if (conversation) {
            item.conversation = stripConversationForIndexing(conversation)
          }
        } catch {
          // Skip conversation loading errors
        }
      }

      preparedRecords.push(item)
    }

    // Send to worker for indexing
    console.log(`[RAG Search] Sending ${preparedRecords.length} records to worker for indexing...`)
    await searchWorker.indexRecords(preparedRecords)
    console.log(`[RAG Search] Indexing complete. Total indexed: ${searchWorker.indexedCount.value}`)

    // Persist after indexing
    console.log('[RAG Search] Persisting index to IndexedDB...')
    await searchWorker.persistIndex()
    console.log('[RAG Search] Index persisted')
  } catch (err) {
    console.error('[RAG Search] indexMissingRecords failed:', err)
  } finally {
    isIndexing.value = false
  }
}

// ============================================================================
// Search
// ============================================================================

let debounceTimer = null

function debouncedSearch() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => performSearch(), 300)
}

async function performSearch() {
  const q = query.value.trim()
  if (!q) {
    results.value = []
    hasSearched.value = false
    return
  }

  if (!searchWorker.isReady.value) return

  isSearching.value = true
  hasSearched.value = true

  try {
    const { hits, elapsed } = await searchWorker.search(q, {
      mode: selectedMode.value,
      strategy: selectedStrategy.value,
    })

    searchElapsed.value = elapsed
    console.log(`[RAG Search] Query "${q}" → ${hits.length} raw hits in ${elapsed}ms`)

    // Deduplicate by parent
    const deduped = deduplicateByParent(hits).slice(0, SEARCH_DEFAULTS.resultLimit)

    if (deduped.length === 0) {
      results.value = []
      return
    }

    // Hydrate with full records from IndexedDB
    const parentIds = deduped.map((h) => (typeof h.parentId === 'string' ? parseInt(h.parentId, 10) : h.parentId))
    const fullRecords = await getHistoryByIds(parentIds)

    // Merge hits with records
    const recordMap = new Map()
    for (const rec of fullRecords) {
      recordMap.set(String(rec.id), rec)
    }

    results.value = deduped
      .map((hit) => {
        const record = recordMap.get(hit.parentId)
        if (!record) return null
        return {
          ...record,
          score: hit.score,
          snippet: highlightSnippet(hit.chunkText, q),
        }
      })
      .filter(Boolean)
  } catch (err) {
    console.error('[RAG Search] Search failed:', err)
    results.value = []
  } finally {
    isSearching.value = false
  }
}

// ============================================================================
// Watch & Lifecycle
// ============================================================================

watch(() => props.modelValue, (open) => {
  if (open) {
    pushState()
    initializeSearch()
    // Auto-focus search input after transition
    nextTick(() => {
      setTimeout(() => searchInputRef.value?.focus(), 100)
    })
  }
})

watch([selectedMode, selectedStrategy], () => {
  if (query.value.trim()) {
    performSearch()
  }
})

watch(query, () => {
  debouncedSearch()
})

onUnmounted(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
})

// ============================================================================
// Actions
// ============================================================================

function close() {
  popState()
  emit('update:modelValue', false)
}

function handleKeydown(e) {
  if (e.key === 'Escape') close()
}

function handleResultClick(record) {
  emit('openLightbox', record)
}

function formatTime(timestamp) {
  if (!timestamp) return ''
  const dayjsLocale = locale.value === 'zh-TW' ? 'zh-tw' : 'en'
  return dayjs(timestamp).locale(dayjsLocale).fromNow()
}

function getThumbnailSrc(item) {
  if (item.video?.thumbnail) return item.video.thumbnail
  if (item.images?.[0]?.thumbnail) return `data:image/webp;base64,${item.images[0].thumbnail}`
  if (item.mode === 'agent' && item.thumbnail) return `data:image/webp;base64,${item.thumbnail}`
  return null
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="modelValue"
        class="fixed inset-0 z-[9990] flex items-start justify-center pt-[5vh] sm:pt-[10vh] px-4"
        @keydown="handleKeydown"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        :aria-label="$t('search.title')"
      >
        <!-- Backdrop (click does NOT close) -->
        <div class="absolute inset-0 bg-bg-overlay backdrop-blur-sm" />

        <!-- Modal -->
        <div class="relative w-full max-w-lg glass-strong rounded-2xl shadow-xl overflow-hidden max-h-[80vh] flex flex-col">
          <!-- Header -->
          <div class="flex items-center justify-between px-5 pt-5 pb-3">
            <h3 class="font-semibold text-text-primary text-base">
              {{ $t('search.title') }}
            </h3>
            <button
              @click="close"
              class="p-1.5 rounded-lg hover:bg-bg-interactive text-text-muted hover:text-text-primary transition-all"
              :aria-label="$t('common.close')"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Search Input -->
          <div class="px-5 pb-3">
            <div class="relative">
              <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref="searchInputRef"
                v-model="query"
                type="text"
                :placeholder="$t('search.placeholder')"
                :aria-label="$t('search.placeholder')"
                class="w-full pl-10 pr-4 py-2.5 rounded-xl bg-bg-input border border-border-muted text-text-primary placeholder-text-muted text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/50 transition-all"
                :disabled="!searchWorker.isReady.value && !searchWorker.isModelLoading.value"
                @keydown.esc="close"
              />
              <!-- Clear button -->
              <button
                v-if="query && !isSearching"
                @click="query = ''; results = []; hasSearched = false"
                :aria-label="$t('common.clear')"
                class="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-bg-interactive text-text-muted hover:text-text-primary transition-all"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <!-- Spinner in input -->
              <svg
                v-if="isSearching"
                class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-text-muted"
                fill="none" viewBox="0 0 24 24"
              >
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          </div>

          <!-- Mode Chips + Strategy -->
          <div class="px-5 pb-3 flex flex-col gap-2">
            <!-- Mode filter chips -->
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="mode in modeFilters"
                :key="mode"
                @click="selectedMode = mode"
                class="text-xs px-2 py-1 rounded-md font-medium transition-all"
                :class="
                  selectedMode === mode
                    ? 'bg-brand-primary text-text-on-brand'
                    : 'bg-bg-muted text-text-secondary hover:bg-bg-interactive'
                "
                :aria-pressed="selectedMode === mode"
              >
                {{ mode === '' ? $t('search.filterAll') : modeLabels[mode] }}
              </button>
            </div>

            <!-- Strategy selector -->
            <div class="flex items-center gap-2">
              <select
                v-model="selectedStrategy"
                :aria-label="$t('search.strategyLabel')"
                class="text-xs px-2 py-1 rounded-lg bg-bg-muted text-text-secondary border border-border-muted focus:outline-none focus:ring-1 focus:ring-brand-primary/50"
              >
                <option v-for="s in strategies" :key="s" :value="s">
                  {{ $t(`search.strategy.${s}`) }}
                </option>
              </select>
            </div>
          </div>

          <!-- Status Area (Model Loading / Indexing) -->
          <div v-if="searchWorker.isModelLoading.value || isIndexing" class="px-5 pb-3">
            <!-- Model loading -->
            <div v-if="searchWorker.isModelLoading.value" class="flex items-center gap-3">
              <div class="flex-1">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-xs text-text-muted">{{ modelLoadingLabel }}</span>
                  <span class="text-xs text-text-muted font-mono">{{ searchWorker.modelProgress.value }}%</span>
                </div>
                <div
                  class="w-full h-1.5 bg-bg-muted rounded-full overflow-hidden"
                  role="progressbar"
                  :aria-valuenow="searchWorker.modelProgress.value"
                  aria-valuemin="0"
                  aria-valuemax="100"
                >
                  <div
                    class="h-full bg-brand-primary rounded-full transition-all duration-300"
                    :style="{ width: `${searchWorker.modelProgress.value}%` }"
                  />
                </div>
              </div>
            </div>

            <!-- Indexing -->
            <div v-if="isIndexing" class="flex items-center gap-2 mt-2">
              <svg class="w-4 h-4 animate-spin text-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span class="text-xs text-text-muted">
                {{ $t('search.indexing', { current: searchWorker.indexingProgress.value.current, total: searchWorker.indexingProgress.value.total }) }}
              </span>
            </div>
          </div>

          <!-- Error -->
          <div v-if="searchWorker.error.value" class="px-5 pb-3">
            <div class="text-xs text-status-error bg-status-error-muted px-3 py-2 rounded-lg">
              {{ $t('search.error') }}: {{ searchWorker.error.value }}
            </div>
          </div>

          <!-- Results -->
          <div class="flex-1 overflow-y-auto px-5 pb-3 min-h-0" aria-live="polite">
            <!-- Result header -->
            <div v-if="hasSearched && !isSearching" class="flex items-center justify-between mb-2">
              <span class="text-xs text-text-muted">
                {{ $t('search.results', { count: results.length }) }}
              </span>
              <span class="text-xs text-text-muted font-mono">
                {{ $t('search.elapsed', { time: searchElapsed }) }}
              </span>
            </div>

            <!-- Result list -->
            <div v-if="results.length > 0" class="space-y-2">
              <div
                v-for="item in results"
                :key="item.id"
                @click="handleResultClick(item)"
                @keydown.enter="handleResultClick(item)"
                @keydown.space.prevent="handleResultClick(item)"
                tabindex="0"
                role="button"
                class="group flex items-start gap-3 p-3 rounded-xl bg-bg-muted/50 hover:bg-bg-interactive focus:bg-bg-interactive focus:outline-none focus:ring-2 focus:ring-brand-primary/50 cursor-pointer transition-all"
              >
                <!-- Thumbnail -->
                <div v-if="getThumbnailSrc(item)" class="flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden">
                  <img
                    :src="getThumbnailSrc(item)"
                    :alt="item.prompt"
                    class="w-full h-full object-cover"
                  />
                </div>

                <!-- Content -->
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1">
                    <span
                      class="text-xs px-1.5 py-0.5 rounded font-medium"
                      :class="getModeTagStyle(item.mode)"
                    >
                      {{ modeLabels[item.mode] || item.mode }}
                    </span>
                    <span class="text-xs text-text-muted">
                      {{ formatTime(item.timestamp) }}
                    </span>
                    <span class="text-xs text-text-muted font-mono">
                      #{{ item.id }}
                    </span>
                  </div>
                  <!-- Snippet with highlighting -->
                  <p class="text-sm text-text-secondary line-clamp-2" v-html="item.snippet" />
                </div>
              </div>
            </div>

            <!-- No results -->
            <div v-else-if="hasSearched && !isSearching" class="text-center py-8">
              <svg class="w-10 h-10 text-text-muted mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p class="text-sm text-text-muted">{{ $t('search.noResults') }}</p>
            </div>

            <!-- Initial state -->
            <div v-else-if="!hasSearched && searchWorker.isReady.value && !isIndexing" class="text-center py-8">
              <svg class="w-10 h-10 text-text-muted mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p class="text-sm text-text-muted">{{ $t('search.noQuery') }}</p>
            </div>
          </div>

          <!-- Footer -->
          <div v-if="searchWorker.isReady.value" class="px-5 py-3 border-t border-border-muted">
            <span class="text-xs text-text-muted">
              {{ $t('search.indexed', { count: searchWorker.indexedCount.value }) }}
            </span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-active .glass-strong,
.modal-leave-active .glass-strong {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from .glass-strong {
  transform: scale(0.95) translateY(-10px);
  opacity: 0;
}
.modal-leave-to .glass-strong {
  transform: scale(0.95) translateY(-10px);
  opacity: 0;
}
</style>
