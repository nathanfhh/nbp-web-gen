<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useEmbeddingExplorer } from '@/composables/useEmbeddingExplorer'

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
      // Re-render existing data when modal reopens (plot was purged on close)
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

function buildTraces(docs, coordinates) {
  if (settings.colorBy === 'mode') {
    // Group by mode, one trace per mode
    const groups = {}
    docs.forEach((doc, i) => {
      const mode = doc.mode || 'unknown'
      if (!groups[mode]) groups[mode] = { x: [], y: [], z: [], text: [] }
      groups[mode].x.push(coordinates[i][0])
      groups[mode].y.push(coordinates[i][1])
      groups[mode].z.push(coordinates[i][2])
      groups[mode].text.push(buildHoverText(doc))
    })

    return Object.entries(groups).map(([mode, data]) => ({
      type: 'scatter3d',
      mode: 'markers',
      name: mode,
      x: data.x,
      y: data.y,
      z: data.z,
      text: data.text,
      hoverinfo: 'text',
      marker: {
        size: 5,
        color: MODE_COLORS[mode] || '#94a3b8',
        opacity: 0.85,
      },
    }))
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

  const plt = await loadPlotly()
  const traces = buildTraces(docs, coordinates)

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
    },
    showlegend: settings.colorBy === 'mode',
  }

  destroyPlot()
  plt.newPlot(plotContainer.value, traces, layout, {
    responsive: true,
    displayModeBar: true,
    modeBarButtonsToRemove: ['toImage', 'sendDataToCloud'],
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

              <!-- Sample Size -->
              <div class="flex items-center gap-2">
                <label class="text-text-secondary font-medium">{{ t('embeddingExplorer.sampleSize') }}:</label>
                <input
                  type="number"
                  v-model.number="settings.sampleSize"
                  min="10"
                  max="10000"
                  class="w-20 px-2 py-1 rounded-lg bg-bg-input border border-border-muted text-text-primary text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
                  :disabled="settings.useFullData"
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

            <!-- Row 2: Color + Hover + Start -->
            <div class="flex flex-wrap items-center gap-4 text-sm">
              <!-- Color By -->
              <div class="flex items-center gap-2">
                <label class="text-text-secondary font-medium">{{ t('embeddingExplorer.colorBy') }}:</label>
                <select
                  v-model="settings.colorBy"
                  class="px-2 py-1 rounded-lg bg-bg-input border border-border-muted text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
                >
                  <option value="mode">{{ t('embeddingExplorer.colorByMode') }}</option>
                  <option value="single">{{ t('embeddingExplorer.colorBySingle') }}</option>
                </select>
              </div>

              <!-- Hover Text -->
              <div class="flex items-center gap-2">
                <label class="text-text-secondary font-medium">Hover:</label>
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
          <div class="plot-area flex-1 relative min-h-0 mx-5 mb-5 rounded-xl border border-border-muted overflow-hidden">
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

            <!-- Plotly container -->
            <div ref="plotContainer" class="w-full h-full" />

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
  min-height: 300px;
}

/* Move Plotly modebar from top-right to bottom-right.
   Both .modebar-container (inline style) and .modebar (SCSS)
   default to position:absolute; top:2px; right:2px.
   Override only top→bottom on both; keep right:2px intact. */
.plot-area :deep(.modebar-container) {
  top: auto !important;
  bottom: 4px !important;
}
.plot-area :deep(.modebar) {
  top: auto !important;
  bottom: 0 !important;
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
