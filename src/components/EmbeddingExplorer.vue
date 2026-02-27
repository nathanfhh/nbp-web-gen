<script setup>
import { ref, watch, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useEmbeddingExplorer } from '@/composables/useEmbeddingExplorer'
import { GENERATION_MODES } from '@/constants/modeStyles'

const props = defineProps({
  modelValue: Boolean,
})
const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()
const { settings, isProcessing, errorMessage, plotData, snapshotDocCount, startProcess, cleanup } =
  useEmbeddingExplorer()

const plotContainer = ref(null)
let Plotly = null

// ============================================================================
// Mode colors for scatter plot (CSS-independent, Plotly-native)
// ============================================================================

const MODE_COLORS = {
  generate: '#6366f1',
  sticker: '#f59e0b',
  edit: '#10b981',
  story: '#ec4899',
  diagram: '#8b5cf6',
  video: '#ef4444',
  slides: '#0ea5e9',
  agent: '#14b8a6',
}

const SINGLE_COLOR = '#6366f1'

// Palette for historyId coloring (distinct colors for up to ~20 IDs, then cycles)
const HISTORY_PALETTE = [
  '#6366f1', '#ef4444', '#10b981', '#f59e0b', '#ec4899',
  '#0ea5e9', '#8b5cf6', '#14b8a6', '#f97316', '#06b6d4',
  '#84cc16', '#e11d48', '#7c3aed', '#059669', '#d946ef',
  '#0284c7', '#ca8a04', '#dc2626', '#2563eb', '#65a30d',
]

// ============================================================================
// Mode filter
// ============================================================================

function toggleMode(mode) {
  const idx = settings.filterModes.indexOf(mode)
  if (idx >= 0) {
    // Don't allow deselecting all
    if (settings.filterModes.length > 1) settings.filterModes.splice(idx, 1)
  } else {
    settings.filterModes.push(mode)
  }
}

function toggleAllModes() {
  if (settings.filterModes.length === GENERATION_MODES.length) return
  settings.filterModes.splice(0, settings.filterModes.length, ...GENERATION_MODES)
}

const isAllModesSelected = computed(() => settings.filterModes.length === GENERATION_MODES.length)

// ============================================================================
// Modal lifecycle
// ============================================================================

function close() {
  emit('update:modelValue', false)
}

watch(
  () => props.modelValue,
  async (val) => {
    if (!val) {
      destroyPlot()
    } else if (plotData.value) {
      await nextTick()
      renderPlot()
    }
  },
)

onBeforeUnmount(() => {
  cleanup()
  destroyPlot()
})

// ============================================================================
// Plotly rendering
// ============================================================================

async function loadPlotly() {
  if (!Plotly) {
    const mod = await import('plotly.js-dist-min')
    Plotly = mod.default
  }
  return Plotly
}

function destroyPlot() {
  if (plotContainer.value && Plotly) {
    try {
      Plotly.purge(plotContainer.value)
    } catch {
      // ignore
    }
  }
}

function wrapText(text, maxWidth = 40) {
  const words = text.split(/(\s+)/)
  let line = ''
  const lines = []
  for (const word of words) {
    if ((line + word).length > maxWidth && line.length > 0) {
      lines.push(line)
      line = word.trimStart()
    } else {
      line += word
    }
  }
  if (line) lines.push(line)
  return lines.join('<br>')
}

function buildHoverText(doc) {
  const id = `#${doc.parentId}`
  if (settings.hoverText === 'none') return id
  const text = doc.chunkText || ''
  if (settings.hoverText === 'full') return `${id}<br>${wrapText(text)}`
  const truncated = text.length > settings.hoverLength ? text.slice(0, settings.hoverLength) + '...' : text
  return `${id}<br>${wrapText(truncated)}`
}

function buildGroupedTraces(docs, coordinates, groupFn, colorFn, labelFn) {
  const groups = {}
  docs.forEach((doc, i) => {
    const key = groupFn(doc)
    if (!groups[key]) groups[key] = { x: [], y: [], z: [], text: [] }
    groups[key].x.push(coordinates[i][0])
    groups[key].y.push(coordinates[i][1])
    groups[key].z.push(coordinates[i][2])
    groups[key].text.push(buildHoverText(doc))
  })

  const keys = Object.keys(groups)
  return keys.map((key, idx) => ({
    type: 'scatter3d',
    mode: 'markers',
    name: labelFn(key, idx),
    x: groups[key].x,
    y: groups[key].y,
    z: groups[key].z,
    text: groups[key].text,
    hoverinfo: 'text',
    marker: {
      size: 5,
      color: colorFn(key, idx),
      opacity: 0.85,
    },
  }))
}

function buildTraces(docs, coordinates) {
  if (settings.colorBy === 'mode') {
    return buildGroupedTraces(
      docs, coordinates,
      (doc) => doc.mode || 'unknown',
      (mode) => MODE_COLORS[mode] || '#94a3b8',
      (mode) => t(`modes.${mode}.name`, mode),
    )
  }

  if (settings.colorBy === 'historyId') {
    // Assign a stable color per unique parentId
    const uniqueIds = [...new Set(docs.map((d) => d.parentId))]
    const idColorMap = Object.fromEntries(
      uniqueIds.map((id, i) => [id, HISTORY_PALETTE[i % HISTORY_PALETTE.length]]),
    )
    return buildGroupedTraces(
      docs, coordinates,
      (doc) => doc.parentId,
      (parentId) => idColorMap[parentId],
      (parentId) => `#${parentId}`,
    )
  }

  // Single color
  const x = [],
    y = [],
    z = [],
    text = []
  coordinates.forEach((coord, i) => {
    x.push(coord[0])
    y.push(coord[1])
    z.push(coord[2])
    text.push(buildHoverText(docs[i]))
  })

  return [
    {
      type: 'scatter3d',
      mode: 'markers',
      x,
      y,
      z,
      text,
      hoverinfo: 'text',
      marker: { size: 5, color: SINGLE_COLOR, opacity: 0.85 },
    },
  ]
}

async function renderPlot() {
  if (!plotData.value || !plotContainer.value) return
  const { docs, coordinates } = plotData.value

  // Apply mode filter
  const filterSet = new Set(settings.filterModes)
  const filteredDocs = []
  const filteredCoords = []
  docs.forEach((doc, i) => {
    if (filterSet.has(doc.mode)) {
      filteredDocs.push(doc)
      filteredCoords.push(coordinates[i])
    }
  })

  const plt = await loadPlotly()
  const traces = filteredDocs.length > 0 ? buildTraces(filteredDocs, filteredCoords) : []

  const isLight = document.documentElement.getAttribute('data-theme-type') === 'light'
  const gridColor = isLight ? 'rgba(0,0,0,0.12)' : 'rgba(150,150,150,0.2)'
  const legendColor = isLight ? '#475569' : '#94a3b8'

  const axisStyle = { showgrid: true, gridcolor: gridColor, zerolinecolor: gridColor, showticklabels: false }
  const layout = {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    margin: { l: 0, r: 0, t: 0, b: 0 },
    scene: {
      xaxis: axisStyle,
      yaxis: axisStyle,
      zaxis: axisStyle,
      bgcolor: 'rgba(0,0,0,0)',
    },
    legend: {
      font: { color: legendColor, size: 12 },
      bgcolor: 'rgba(0,0,0,0)',
      itemsizing: 'constant',
      y: 0.95,
      yanchor: 'top',
      tracegroupgap: 2,
    },
    showlegend: settings.colorBy !== 'single',
  }

  destroyPlot()
  plt.newPlot(plotContainer.value, traces, layout, {
    responsive: true,
    displayModeBar: true,
    modeBarButtonsToRemove: ['sendDataToCloud'],
    displaylogo: false,
  })
}

// Watch plotData to render
watch(plotData, async (val) => {
  if (val) {
    await nextTick()
    renderPlot()
  }
})

// Re-render on filter change (no UMAP recomputation)
watch(() => settings.filterModes.length, async () => {
  if (plotData.value) {
    await nextTick()
    renderPlot()
  }
})

// Re-render on display settings change
watch(() => settings.colorBy, async () => {
  if (plotData.value) {
    await nextTick()
    renderPlot()
  }
})

watch(() => settings.hoverText, async () => {
  if (plotData.value) {
    await nextTick()
    renderPlot()
  }
})

watch(() => settings.hoverLength, async () => {
  if (plotData.value) {
    await nextTick()
    renderPlot()
  }
})

// ============================================================================
// Actions
// ============================================================================

async function handleStart() {
  await startProcess()
}

// ESC handler on document capture phase — prevents event from reaching history below
function handleKeydown(e) {
  if (e.key === 'Escape' && props.modelValue) {
    e.stopPropagation()
    e.preventDefault()
    close()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown, true)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="explorer-modal">
      <div
        v-if="modelValue"
        class="fixed inset-0 z-[9995] flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        :aria-label="t('embeddingExplorer.title')"
        @wheel.prevent
      >
        <!-- Backdrop (no click-to-close — use ESC or close button) -->
        <div class="absolute inset-0 bg-bg-overlay backdrop-blur-sm" />

        <!-- Modal -->
        <div
          class="relative w-full max-w-7xl glass-strong rounded-2xl shadow-xl overflow-hidden flex flex-col"
          style="max-height: 95vh"
        >
          <!-- Header -->
          <div class="flex items-center justify-between px-5 pt-5 pb-3">
            <h3 class="font-semibold text-text-primary text-base">
              {{ t('embeddingExplorer.title') }}
            </h3>
            <button
              @click="close"
              class="p-1.5 rounded-lg hover:bg-bg-interactive text-text-muted hover:text-text-primary transition-all"
              :aria-label="t('common.close')"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Control Panel -->
          <div class="px-5 pb-3 space-y-3">
            <!-- Row 1: Data Source + Sampling -->
            <div class="flex flex-wrap items-center gap-4 text-sm">
              <!-- Data Source Radio -->
              <div class="flex items-center gap-3">
                <span class="text-text-secondary font-medium">{{ t('embeddingExplorer.dataSource') }}:</span>
                <label class="flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio"
                    v-model="settings.dataSource"
                    value="local"
                    class="accent-mode-generate"
                  />
                  <span class="text-text-primary">Local</span>
                </label>
                <label class="flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio"
                    v-model="settings.dataSource"
                    value="gemini"
                    class="accent-mode-generate"
                  />
                  <span class="text-text-primary">Gemini</span>
                </label>
              </div>

              <!-- Sample Size (hidden when full data is checked) -->
              <div v-if="!settings.useFullData" class="flex items-center gap-2">
                <label class="text-text-secondary font-medium">{{ t('embeddingExplorer.sampleSize') }}:</label>
                <input
                  type="number"
                  v-model.number="settings.sampleSize"
                  min="10"
                  max="10000"
                  class="w-20 px-2 py-1 rounded-lg bg-bg-input border border-border-muted text-text-primary text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
                />
              </div>

              <!-- Full Data Toggle -->
              <label class="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  v-model="settings.useFullData"
                  class="accent-mode-generate"
                />
                <span class="text-text-secondary text-sm">{{ t('embeddingExplorer.fullData') }}</span>
              </label>
            </div>

            <!-- Row 2: Mode Filter -->
            <div class="flex flex-wrap items-center gap-2 text-sm">
              <span class="text-text-secondary font-medium shrink-0">{{ t('embeddingExplorer.filterModes') }}:</span>
              <button
                @click="toggleAllModes"
                class="mode-chip"
                :class="isAllModesSelected ? 'mode-chip-active' : 'mode-chip-inactive'"
              >
                {{ t('embeddingExplorer.allModes') }}
              </button>
              <button
                v-for="mode in GENERATION_MODES"
                :key="mode"
                @click="toggleMode(mode)"
                class="mode-chip"
                :class="settings.filterModes.includes(mode) ? 'mode-chip-active' : 'mode-chip-inactive'"
                :style="settings.filterModes.includes(mode) ? { backgroundColor: MODE_COLORS[mode] + '22', borderColor: MODE_COLORS[mode], color: MODE_COLORS[mode] } : {}"
              >
                <span
                  class="inline-block w-2 h-2 rounded-full shrink-0"
                  :style="{ backgroundColor: MODE_COLORS[mode] }"
                />
                {{ t(`modes.${mode}.name`, mode) }}
              </button>
            </div>

            <!-- Row 3: Color + Hover + Start -->
            <div class="flex flex-wrap items-center gap-4 text-sm">
              <!-- Color By -->
              <div class="flex items-center gap-2">
                <label class="text-text-secondary font-medium">{{ t('embeddingExplorer.colorBy') }}:</label>
                <select
                  v-model="settings.colorBy"
                  class="px-2 py-1 rounded-lg bg-bg-input border border-border-muted text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
                >
                  <option value="mode">{{ t('embeddingExplorer.colorByMode') }}</option>
                  <option value="historyId">{{ t('embeddingExplorer.colorByHistoryId') }}</option>
                  <option value="single">{{ t('embeddingExplorer.colorBySingle') }}</option>
                </select>
              </div>

              <!-- Hover Text -->
              <div class="flex items-center gap-2">
                <label class="text-text-secondary font-medium">{{ t('embeddingExplorer.hoverLabel') }}:</label>
                <select
                  v-model="settings.hoverText"
                  class="px-2 py-1 rounded-lg bg-bg-input border border-border-muted text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
                >
                  <option value="none">{{ t('embeddingExplorer.hoverNone') }}</option>
                  <option value="truncate">{{ t('embeddingExplorer.hoverTruncate') }}</option>
                  <option value="full">{{ t('embeddingExplorer.hoverFull') }}</option>
                </select>
                <input
                  v-if="settings.hoverText === 'truncate'"
                  type="number"
                  v-model.number="settings.hoverLength"
                  min="10"
                  max="500"
                  class="w-16 px-2 py-1 rounded-lg bg-bg-input border border-border-muted text-text-primary text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
                />
              </div>

              <!-- Start Button -->
              <button
                @click="handleStart"
                :disabled="isProcessing"
                class="ml-auto px-4 py-1.5 rounded-xl bg-brand-primary text-text-on-brand text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {{ isProcessing ? t('embeddingExplorer.processing') : t('embeddingExplorer.start') }}
              </button>
            </div>
          </div>

          <!-- Plot Area -->
          <div class="plot-area flex-1 relative min-h-0 mx-5 mb-5 rounded-xl border border-border-muted">
            <!-- Loading Overlay -->
            <div
              v-if="isProcessing"
              class="absolute inset-0 z-10 flex items-center justify-center bg-bg-overlay/60 backdrop-blur-sm rounded-xl"
            >
              <div class="flex flex-col items-center gap-3">
                <div class="w-10 h-10 border-3 border-brand-primary border-t-transparent rounded-full animate-spin" />
                <span class="text-text-secondary text-sm">{{ t('embeddingExplorer.computing') }}</span>
              </div>
            </div>

            <!-- Error State -->
            <div
              v-else-if="errorMessage"
              class="absolute inset-0 flex items-center justify-center"
            >
              <div class="text-center px-6">
                <p class="text-status-error text-sm mb-2">
                  {{ t(`embeddingExplorer.error.${errorMessage}`, errorMessage) }}
                </p>
                <p class="text-text-muted text-xs">
                  {{ t('embeddingExplorer.errorHint') }}
                </p>
              </div>
            </div>

            <!-- Empty State -->
            <div
              v-else-if="!plotData"
              class="absolute inset-0 flex items-center justify-center"
            >
              <div class="text-center px-6">
                <svg class="w-12 h-12 mx-auto mb-3 text-text-muted opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                </svg>
                <p class="text-text-muted text-sm">{{ t('embeddingExplorer.emptyState') }}</p>
              </div>
            </div>

            <!-- Plotly container (@wheel.stop prevents parent's @wheel.prevent from blocking zoom) -->
            <div ref="plotContainer" class="w-full h-full" @wheel.stop />

            <!-- Data info badge -->
            <div
              v-if="plotData"
              class="absolute bottom-2 left-2 px-2 py-1 rounded-lg bg-bg-elevated/80 text-text-muted text-xs backdrop-blur-sm"
            >
              {{ plotData.docs.length }} / {{ snapshotDocCount }} {{ t('embeddingExplorer.points') }}
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.plot-area {
  min-height: 450px;
}

/* Mode filter chips */
.mode-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.2rem 0.6rem;
  border-radius: 9999px;
  border: 1.5px solid transparent;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  line-height: 1.4;
}
.mode-chip-active {
  border-color: var(--color-brand-primary);
  background: var(--color-brand-primary-alpha, rgba(99,102,241,0.13));
  color: var(--color-brand-primary);
}
.mode-chip-inactive {
  border-color: var(--color-border-muted);
  background: transparent;
  color: var(--color-text-muted);
  opacity: 0.6;
}
.mode-chip-inactive:hover {
  opacity: 0.9;
  border-color: var(--color-text-muted);
}

/* Move Plotly modebar to top-left to avoid legend overlap */
.plot-area :deep(.modebar-container) {
  left: 4px !important;
  right: auto !important;
}
.plot-area :deep(.modebar) {
  left: 0 !important;
  right: auto !important;
}

.explorer-modal-enter-active,
.explorer-modal-leave-active {
  transition: opacity 0.2s ease;
}
.explorer-modal-enter-active .glass-strong,
.explorer-modal-leave-active .glass-strong {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.explorer-modal-enter-from,
.explorer-modal-leave-to {
  opacity: 0;
}
.explorer-modal-enter-from .glass-strong {
  transform: scale(0.95) translateY(-10px);
  opacity: 0;
}
.explorer-modal-leave-to .glass-strong {
  transform: scale(0.95) translateY(-10px);
  opacity: 0;
}
</style>
