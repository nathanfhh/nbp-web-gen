<script setup>
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useHistoryTransfer } from '@/composables/useHistoryTransfer'
import { useIndexedDB } from '@/composables/useIndexedDB'
import { useToast } from '@/composables/useToast'
import PeerSync from '@/components/PeerSync.vue'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-tw'

dayjs.extend(relativeTime)

const { t, locale } = useI18n()
const toast = useToast()
const transfer = useHistoryTransfer()
const indexedDB = useIndexedDB()

// Peer sync modal
const showPeerSync = ref(false)
const peerSyncSelectedIds = ref([])

// History list for selection
const historyList = ref([])
const selectedIds = ref(new Set())
const isLoadingList = ref(false)

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'imported'])

// Computed
const selectedCount = computed(() => selectedIds.value.size)
const isAllSelected = computed(() =>
  historyList.value.length > 0 && selectedIds.value.size === historyList.value.length
)
const hasSelection = computed(() => selectedIds.value.size > 0)

// Mode label colors (light mode handled by style.css [data-theme="light"])
const modeColors = {
  generate: 'bg-purple-500/20 text-purple-300',
  sticker: 'bg-pink-500/20 text-pink-300',
  edit: 'bg-cyan-500/20 text-cyan-300',
  story: 'bg-amber-500/20 text-amber-300',
  diagram: 'bg-emerald-500/20 text-emerald-300',
}

// Load history list
const loadHistoryList = async () => {
  isLoadingList.value = true
  try {
    historyList.value = await indexedDB.getAllHistory()
    // Sort by timestamp descending
    historyList.value.sort((a, b) => b.timestamp - a.timestamp)
  } catch (err) {
    console.error('Failed to load history:', err)
  } finally {
    isLoadingList.value = false
  }
}

// Selection operations
const toggleSelect = (id) => {
  const newSet = new Set(selectedIds.value)
  if (newSet.has(id)) {
    newSet.delete(id)
  } else {
    newSet.add(id)
  }
  selectedIds.value = newSet
}

const selectAll = () => {
  selectedIds.value = new Set(historyList.value.map(h => h.id))
}

const deselectAll = () => {
  selectedIds.value = new Set()
}

// Format relative time
const formatRelativeTime = (timestamp) => {
  return dayjs(timestamp).locale(locale.value === 'zh-TW' ? 'zh-tw' : 'en').fromNow()
}

// History API for back gesture
const historyStatePushed = ref(false)

const handlePopState = (e) => {
  if (props.modelValue && e.state?.historyTransfer !== true) {
    emit('update:modelValue', false)
  }
}

watch(
  () => props.modelValue,
  async (newVal) => {
    if (newVal) {
      if (!historyStatePushed.value) {
        history.pushState({ historyTransfer: true }, '')
        historyStatePushed.value = true
      }
      document.body.style.overflow = 'hidden'
      // Load history list when modal opens
      await loadHistoryList()
      // Reset selection
      selectedIds.value = new Set()
    } else {
      if (historyStatePushed.value) {
        historyStatePushed.value = false
        if (history.state?.historyTransfer === true) {
          history.back()
        }
      }
      document.body.style.overflow = ''
    }
  }
)

onMounted(() => {
  window.addEventListener('popstate', handlePopState)
})

onUnmounted(() => {
  window.removeEventListener('popstate', handlePopState)
  if (historyStatePushed.value && history.state?.historyTransfer === true) {
    history.back()
  }
})

// File input handling
const fileInputRef = ref(null)
const isDragOver = ref(false)

const handleFileSelect = async (e) => {
  const file = e.target.files?.[0]
  if (file) await processFile(file)
  // Reset input for re-selecting same file
  if (fileInputRef.value) fileInputRef.value.value = ''
}

const handleDragOver = (e) => {
  e.preventDefault()
  isDragOver.value = true
}

const handleDragLeave = () => {
  isDragOver.value = false
}

const handleDrop = async (e) => {
  e.preventDefault()
  isDragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) await processFile(file)
}

const processFile = async (file) => {
  if (!file.name.endsWith('.json')) {
    toast.error(t('historyTransfer.invalidFile'))
    return
  }
  try {
    const result = await transfer.importHistory(file)
    if (result) {
      emit('imported')
      // Reload history list after import
      await loadHistoryList()
      toast.success(
        t('historyTransfer.importSuccess', {
          imported: result.imported,
          skipped: result.skipped,
        })
      )
    }
  } catch {
    toast.error(t('historyTransfer.importError'))
  }
}

const handleExport = async () => {
  if (!hasSelection.value) {
    toast.error(t('historyTransfer.noSelection'))
    return
  }
  const ids = Array.from(selectedIds.value)
  const result = await transfer.exportHistory(ids)
  if (result.success) {
    toast.success(t('historyTransfer.exportSuccess', { count: result.count }))
  } else {
    toast.error(t('historyTransfer.exportError'))
  }
}

const handleSync = () => {
  peerSyncSelectedIds.value = Array.from(selectedIds.value)
  showPeerSync.value = true
}

const close = () => {
  emit('update:modelValue', false)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="modelValue"
        class="fixed inset-0 z-[9998] flex items-center justify-center p-4"
        @click.self="close"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>

        <!-- Modal -->
        <div class="relative glass-strong rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <!-- Header -->
          <div class="flex items-center justify-between mb-4 flex-shrink-0">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <svg class="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              </div>
              <h3 class="text-lg font-semibold text-white">
                {{ $t('historyTransfer.title') }}
              </h3>
            </div>
            <button
              @click="close"
              class="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-all"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Selection Controls -->
          <div class="flex items-center justify-between mb-3 flex-shrink-0">
            <div class="flex items-center gap-2">
              <button
                v-if="!isAllSelected"
                @click="selectAll"
                class="text-xs px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 transition-all"
              >
                {{ $t('historyTransfer.selectAll') }}
              </button>
              <button
                v-else
                @click="deselectAll"
                class="text-xs px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 transition-all"
              >
                {{ $t('historyTransfer.deselectAll') }}
              </button>
            </div>
            <span class="text-xs text-gray-500">
              {{ $t('historyTransfer.selectedCount', { count: selectedCount }) }}
            </span>
          </div>

          <!-- History List -->
          <div class="flex-1 overflow-y-auto mb-4 min-h-0 pr-2">
            <div v-if="isLoadingList" class="flex items-center justify-center py-8">
              <svg class="w-6 h-6 text-purple-400 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
            <div v-else-if="historyList.length === 0" class="text-center py-8">
              <p class="text-gray-500 text-sm">{{ $t('history.empty') }}</p>
            </div>
            <div v-else class="space-y-2">
              <div
                v-for="item in historyList"
                :key="item.id"
                @click="toggleSelect(item.id)"
                :class="[
                  'flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all',
                  selectedIds.has(item.id)
                    ? 'bg-purple-500/20 border border-purple-500/50'
                    : 'bg-white/5 border border-transparent hover:bg-white/10'
                ]"
              >
                <!-- Checkbox -->
                <div
                  :class="[
                    'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all',
                    selectedIds.has(item.id)
                      ? 'bg-purple-500 border-purple-500'
                      : 'border-gray-500'
                  ]"
                >
                  <svg
                    v-if="selectedIds.has(item.id)"
                    class="w-3 h-3 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                  </svg>
                </div>

                <!-- Thumbnail -->
                <div class="w-10 h-10 rounded-lg bg-black/30 flex-shrink-0 overflow-hidden">
                  <img
                    v-if="item.images?.[0]?.thumbnail"
                    :src="`data:image/webp;base64,${item.images[0].thumbnail}`"
                    class="w-full h-full object-cover"
                    alt=""
                  />
                  <div v-else class="w-full h-full flex items-center justify-center">
                    <svg class="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                </div>

                <!-- Content -->
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1">
                    <span :class="['text-xs px-1.5 py-0.5 rounded', modeColors[item.mode] || 'bg-gray-500/20 text-gray-300']">
                      {{ $t(`modes.${item.mode}.name`) }}
                    </span>
                    <span class="text-xs text-gray-500">
                      {{ formatRelativeTime(item.timestamp) }}
                    </span>
                  </div>
                  <p class="text-sm text-gray-300 truncate">
                    {{ item.prompt?.slice(0, 50) }}{{ item.prompt?.length > 50 ? '...' : '' }}
                  </p>
                </div>

                <!-- Image count badge -->
                <div v-if="item.images?.length" class="text-xs text-gray-500 flex-shrink-0">
                  {{ item.images.length }} {{ item.images.length > 1 ? 'imgs' : 'img' }}
                </div>
              </div>
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="flex gap-3 mb-4 flex-shrink-0">
            <button
              @click="handleExport"
              :disabled="!hasSelection || transfer.isExporting.value"
              class="flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all bg-purple-500/30 border border-purple-500 text-purple-300 hover:bg-purple-500/40 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <template v-if="transfer.isExporting.value">
                <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>{{ transfer.progress.value.current }}/{{ transfer.progress.value.total }}</span>
              </template>
              <template v-else>
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <span>{{ $t('historyTransfer.export.button') }}</span>
              </template>
            </button>
            <button
              @click="handleSync"
              class="flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all bg-cyan-500/30 border border-cyan-500 text-cyan-300 hover:bg-cyan-500/40 flex items-center justify-center gap-2"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              <span>{{ $t('peerSync.title') }}</span>
            </button>
          </div>

          <!-- Divider -->
          <div class="border-t border-white/10 mb-4 flex-shrink-0"></div>

          <!-- Import Section -->
          <div class="flex-shrink-0">
            <h4 class="text-sm font-medium text-gray-300 mb-2">
              {{ $t('historyTransfer.import.title') }}
            </h4>

            <!-- Drop Zone -->
            <div
              @dragover="handleDragOver"
              @dragleave="handleDragLeave"
              @drop="handleDrop"
              @click="fileInputRef?.click()"
              :class="[
                'w-full py-6 px-4 rounded-xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center gap-2',
                isDragOver
                  ? 'border-purple-400 bg-purple-500/10'
                  : 'border-white/20 hover:border-white/40 hover:bg-white/5',
                transfer.isImporting.value && 'pointer-events-none opacity-50'
              ]"
            >
              <template v-if="transfer.isImporting.value">
                <svg class="w-6 h-6 text-purple-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span class="text-xs text-gray-400">
                  {{ $t('historyTransfer.import.progress', { current: transfer.progress.value.current, total: transfer.progress.value.total }) }}
                </span>
              </template>
              <template v-else>
                <svg class="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span class="text-xs text-gray-400">
                  {{ $t('historyTransfer.import.dragDrop') }}
                </span>
              </template>
            </div>
            <input
              ref="fileInputRef"
              type="file"
              accept=".json"
              class="hidden"
              @change="handleFileSelect"
            />

            <!-- Import Result -->
            <Transition name="fade">
              <div
                v-if="transfer.importResult.value && !transfer.isImporting.value"
                class="mt-3 p-3 rounded-xl bg-white/5 border border-white/10"
              >
                <div class="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <div class="text-base font-semibold text-emerald-400">
                      {{ transfer.importResult.value.imported }}
                    </div>
                    <div class="text-xs text-gray-500">
                      {{ $t('historyTransfer.result.imported') }}
                    </div>
                  </div>
                  <div>
                    <div class="text-base font-semibold text-amber-400">
                      {{ transfer.importResult.value.skipped }}
                    </div>
                    <div class="text-xs text-gray-500">
                      {{ $t('historyTransfer.result.skipped') }}
                    </div>
                  </div>
                  <div>
                    <div class="text-base font-semibold text-red-400">
                      {{ transfer.importResult.value.failed }}
                    </div>
                    <div class="text-xs text-gray-500">
                      {{ $t('historyTransfer.result.failed') }}
                    </div>
                  </div>
                </div>
              </div>
            </Transition>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Peer Sync Modal -->
  <PeerSync
    v-model="showPeerSync"
    :selected-ids="peerSyncSelectedIds"
    @synced="$emit('imported')"
  />
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .glass-strong,
.modal-leave-to .glass-strong {
  transform: scale(0.95);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
