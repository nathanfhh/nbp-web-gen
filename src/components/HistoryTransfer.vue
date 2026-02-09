<script setup>
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useHistoryTransfer } from '@/composables/useHistoryTransfer'
import { useCharacterTransfer } from '@/composables/useCharacterTransfer'
import { useIndexedDB } from '@/composables/useIndexedDB'
import { useImageStorage } from '@/composables/useImageStorage'
import { useVideoStorage } from '@/composables/useVideoStorage'
import { useToast } from '@/composables/useToast'
import { useHistoryState } from '@/composables/useHistoryState'
import { useHistoryTransferUI } from '@/composables/useHistoryTransferUI'
import PeerSync from '@/components/PeerSync.vue'
import SelectionControls from '@/components/SelectionControls.vue'
import TransferListItem from '@/components/TransferListItem.vue'
import TransferActionButtons from '@/components/TransferActionButtons.vue'
import PreviewLightbox from '@/components/PreviewLightbox.vue'

const { t } = useI18n()
const toast = useToast()
const transfer = useHistoryTransfer()
const charTransfer = useCharacterTransfer()
const indexedDB = useIndexedDB()
const imageStorage = useImageStorage()
const videoStorage = useVideoStorage()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'imported'])

// Use UI composable
const {
  activeTab,
  historyList,
  selectedIds,
  isLoadingList,
  selectedCount,
  isAllSelected,
  hasSelection,
  characterList,
  selectedCharIds,
  isLoadingCharacters,
  selectedCharCount,
  isAllCharSelected,
  hasCharSelection,
  previewCharacter,
  previewHistoryItem,
  previewHistoryImageUrl,
  previewHistoryVideoUrl,
  isLoadingPreview,
  isDragOver,
  modeColors,
  loadHistoryList,
  loadCharacterList,
  toggleSelect,
  selectAll,
  deselectAll,
  toggleCharSelect,
  selectAllChars,
  deselectAllChars,
  resetSelections,
  openCharPreview,
  closeCharPreview,
  openHistoryPreview,
  closeHistoryPreview,
  closeAnyPreview,
  formatRelativeTime,
  handleDragOver,
  handleDragLeave,
  handleDropEnd,
} = useHistoryTransferUI({ indexedDB, imageStorage, videoStorage })

// Peer sync modal
const showPeerSync = ref(false)
const peerSyncSelectedIds = ref([])
const peerSyncSelectedCharIds = ref([])
const peerSyncType = ref('history')

// File input ref
const fileInputRef = ref(null)

// History state management for back gesture/button support
const { pushState, popState } = useHistoryState('historyTransfer', {
  onBackNavigation: () => {
    if (!closeAnyPreview()) {
      emit('update:modelValue', false)
    }
  },
})

watch(
  () => props.modelValue,
  async (newVal) => {
    if (newVal) {
      pushState()
      document.body.style.overflow = 'hidden'
      await Promise.all([loadHistoryList(), loadCharacterList()])
      resetSelections()
    } else {
      popState()
      document.body.style.overflow = ''
    }
  }
)

// File handling
const handleFileSelect = async (e) => {
  const file = e.target.files?.[0]
  if (file) await processFile(file)
  if (fileInputRef.value) fileInputRef.value.value = ''
}

const handleDrop = async (e) => {
  e.preventDefault()
  handleDropEnd()
  const file = e.dataTransfer?.files?.[0]
  if (file) await processFile(file)
}

const processFile = async (file) => {
  if (!file.name.endsWith('.json')) {
    toast.error(t('historyTransfer.invalidFile'))
    return
  }
  try {
    const isCharFile = await charTransfer.isCharacterExportFile(file)

    if (isCharFile) {
      const result = await charTransfer.importCharacters(file)
      if (result) {
        emit('imported')
        await loadCharacterList()
        toast.success(t('historyTransfer.charImportSuccess', { imported: result.imported, skipped: result.skipped }))
        activeTab.value = 'characters'
      }
    } else {
      const result = await transfer.importHistory(file)
      if (result) {
        emit('imported')
        await loadHistoryList()
        toast.success(t('historyTransfer.importSuccess', { imported: result.imported, skipped: result.skipped }))
      }
    }
  } catch (err) {
    console.error('[HistoryTransfer] Import failed:', err)
    toast.error(t('historyTransfer.importError'))
  } finally {
    // Defensive: ensure loading states are always cleared
    transfer.isImporting.value = false
    transfer.progress.value = { current: 0, total: 0, phase: '' }
    charTransfer.isImporting.value = false
    charTransfer.progress.value = { current: 0, total: 0, phase: '' }
  }
}

// Export handlers
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

const handleCharExport = async () => {
  if (!hasCharSelection.value) {
    toast.error(t('historyTransfer.noSelection'))
    return
  }
  const ids = Array.from(selectedCharIds.value)
  const result = await charTransfer.exportCharacters(ids)
  if (result.success) {
    toast.success(t('historyTransfer.charExportSuccess', { count: result.count }))
  } else {
    toast.error(t('historyTransfer.exportError'))
  }
}

const handleSync = () => {
  peerSyncSelectedIds.value = Array.from(selectedIds.value)
  peerSyncSelectedCharIds.value = Array.from(selectedCharIds.value)
  peerSyncType.value = activeTab.value
  showPeerSync.value = true
}

const handleSynced = async () => {
  await Promise.all([loadHistoryList(), loadCharacterList()])
  emit('imported')
  window.dispatchEvent(new CustomEvent('characters-updated'))
}

const close = () => {
  emit('update:modelValue', false)
}

// Helper to get thumbnail src
const getHistoryThumbnail = (item) => {
  // Check for video thumbnail first (already a complete data URL)
  if (item.video?.thumbnail) {
    return item.video.thumbnail
  }
  // Agent mode stores thumbnail directly on the record
  if (item.mode === 'agent' && item.thumbnail) {
    return `data:image/webp;base64,${item.thumbnail}`
  }
  // Fall back to image thumbnail (needs base64 prefix)
  return item.images?.[0]?.thumbnail ? `data:image/webp;base64,${item.images[0].thumbnail}` : null
}

const getCharThumbnail = (char) => {
  return char.thumbnail ? `data:image/webp;base64,${char.thumbnail}` : null
}

const getCharPreviewSrc = () => {
  return previewCharacter.value?.imageData ? `data:image/png;base64,${previewCharacter.value.imageData}` : null
}

const getHistoryPreviewSrc = () => {
  if (previewHistoryImageUrl.value) return previewHistoryImageUrl.value
  if (previewHistoryItem.value?.thumbnail) {
    return `data:image/webp;base64,${previewHistoryItem.value.thumbnail}`
  }
  if (previewHistoryItem.value?.images?.[0]?.thumbnail) {
    return `data:image/webp;base64,${previewHistoryItem.value.images[0].thumbnail}`
  }
  return null
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
        <div class="absolute inset-0 bg-bg-overlay backdrop-blur-sm"></div>

        <div class="relative glass-strong rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <!-- Header -->
          <div class="flex items-center justify-between mb-4 flex-shrink-0">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-mode-generate-muted flex items-center justify-center">
                <svg class="w-5 h-5 text-mode-generate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              </div>
              <h3 class="text-lg font-semibold text-text-primary">{{ t('historyTransfer.title') }}</h3>
            </div>
            <button @click="close" class="p-2 rounded-lg hover:bg-bg-interactive text-text-muted hover:text-text-primary transition-all">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Tab Switcher -->
          <div class="flex gap-2 mb-3 flex-shrink-0">
            <button
              @click="activeTab = 'history'"
              :class="[
                'flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2',
                activeTab === 'history'
                  ? 'bg-mode-generate-muted text-mode-generate border border-mode-generate'
                  : 'bg-bg-muted text-text-muted hover:bg-bg-interactive border border-transparent'
              ]"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {{ t('historyTransfer.historyTab') }}
            </button>
            <button
              @click="activeTab = 'characters'"
              :class="[
                'flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2',
                activeTab === 'characters'
                  ? 'bg-mode-generate-muted text-mode-generate border border-mode-generate'
                  : 'bg-bg-muted text-text-muted hover:bg-bg-interactive border border-transparent'
              ]"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              {{ t('historyTransfer.charactersTab') }}
            </button>
          </div>

          <!-- Selection Controls -->
          <SelectionControls
            v-if="activeTab === 'history'"
            :is-all-selected="isAllSelected"
            :selected-count="selectedCount"
            @select-all="selectAll"
            @deselect-all="deselectAll"
          />
          <SelectionControls
            v-if="activeTab === 'characters'"
            :is-all-selected="isAllCharSelected"
            :selected-count="selectedCharCount"
            @select-all="selectAllChars"
            @deselect-all="deselectAllChars"
          />

          <!-- History List -->
          <div v-if="activeTab === 'history'" class="flex-1 overflow-y-auto mb-4 min-h-0 pr-2">
            <div v-if="isLoadingList" class="flex items-center justify-center py-8">
              <svg class="w-6 h-6 text-mode-generate animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
            <div v-else-if="historyList.length === 0" class="text-center py-8">
              <p class="text-text-muted text-sm">{{ t('history.empty') }}</p>
            </div>
            <div v-else class="space-y-2">
              <TransferListItem
                v-for="item in historyList"
                :key="item.id"
                :selected="selectedIds.has(item.id)"
                :thumbnail-src="getHistoryThumbnail(item)"
                :can-preview="!!item.video?.opfsPath || !!item.images?.[0]?.opfsPath || (item.mode === 'agent' && !!item.thumbnail)"
                @toggle="toggleSelect(item.id)"
                @preview="openHistoryPreview(item, $event)"
              >
                <template #content>
                  <div class="flex items-center gap-2 mb-1">
                    <span :class="['text-xs px-1.5 py-0.5 rounded', modeColors[item.mode] || 'bg-control-disabled text-text-secondary']">
                      {{ t(`modes.${item.mode}.name`) }}
                    </span>
                    <span class="text-xs text-text-muted">{{ formatRelativeTime(item.timestamp) }}</span>
                  </div>
                  <p class="text-sm text-text-secondary truncate">
                    {{ item.prompt?.slice(0, 50) }}{{ item.prompt?.length > 50 ? '...' : '' }}
                  </p>
                </template>
                <template #extra>
                  <div v-if="item.imageCount || item.images?.length" class="text-xs text-text-muted flex-shrink-0">
                    {{ item.imageCount || item.images.length }} {{ (item.imageCount || item.images.length) > 1 ? 'imgs' : 'img' }}
                  </div>
                </template>
              </TransferListItem>
            </div>
          </div>

          <!-- Characters List -->
          <div v-if="activeTab === 'characters'" class="flex-1 overflow-y-auto mb-4 min-h-0 pr-2">
            <div v-if="isLoadingCharacters" class="flex items-center justify-center py-8">
              <svg class="w-6 h-6 text-mode-generate animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
            <div v-else-if="characterList.length === 0" class="text-center py-8">
              <p class="text-text-muted text-sm">{{ t('historyTransfer.noCharacters') }}</p>
            </div>
            <div v-else class="space-y-2">
              <TransferListItem
                v-for="char in characterList"
                :key="char.id"
                :selected="selectedCharIds.has(char.id)"
                :thumbnail-src="getCharThumbnail(char)"
                thumbnail-size="w-12 h-12"
                can-preview
                @toggle="toggleCharSelect(char.id)"
                @preview="openCharPreview(char, $event)"
              >
                <template #placeholder>
                  <svg class="w-5 h-5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </template>
                <template #content>
                  <div class="flex items-center gap-2 mb-1">
                    <span class="text-sm font-medium text-text-primary truncate">{{ char.name }}</span>
                    <span class="text-xs text-text-muted">{{ formatRelativeTime(char.createdAt) }}</span>
                  </div>
                  <p class="text-xs text-text-muted truncate">
                    {{ char.description?.slice(0, 60) }}{{ char.description?.length > 60 ? '...' : '' }}
                  </p>
                </template>
              </TransferListItem>
            </div>
          </div>

          <!-- Action Buttons -->
          <TransferActionButtons
            v-if="activeTab === 'history'"
            :has-selection="hasSelection"
            :is-exporting="transfer.isExporting.value"
            :progress-current="transfer.progress.value.current"
            :progress-total="transfer.progress.value.total"
            @export="handleExport"
            @sync="handleSync"
          />
          <TransferActionButtons
            v-if="activeTab === 'characters'"
            :has-selection="hasCharSelection"
            :is-exporting="charTransfer.isExporting.value"
            :progress-current="charTransfer.progress.value.current"
            :progress-total="charTransfer.progress.value.total"
            @export="handleCharExport"
            @sync="handleSync"
          />

          <!-- Divider -->
          <div class="border-t border-border-muted mb-4 flex-shrink-0"></div>

          <!-- Import Section -->
          <div class="flex-shrink-0">
            <h4 class="text-sm font-medium text-text-secondary mb-2">{{ t('historyTransfer.import.title') }}</h4>
            <div
              @dragover="handleDragOver"
              @dragleave="handleDragLeave"
              @drop="handleDrop"
              @click="fileInputRef?.click()"
              :class="[
                'w-full py-6 px-4 rounded-xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center gap-2',
                isDragOver
                  ? 'border-mode-generate bg-mode-generate-muted'
                  : 'border-border-default hover:border-white/40 hover:bg-bg-muted',
                transfer.isImporting.value && 'pointer-events-none opacity-50'
              ]"
            >
              <template v-if="transfer.isImporting.value">
                <svg class="w-6 h-6 text-mode-generate animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span class="text-xs text-text-muted">
                  {{ t('historyTransfer.import.progress', { current: transfer.progress.value.current, total: transfer.progress.value.total }) }}
                </span>
              </template>
              <template v-else>
                <svg class="w-6 h-6 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span class="text-xs text-text-muted">{{ t('historyTransfer.import.dragDrop') }}</span>
              </template>
            </div>
            <input ref="fileInputRef" type="file" accept=".json" class="hidden" @change="handleFileSelect" />

            <!-- Import Result -->
            <Transition name="fade">
              <div
                v-if="transfer.importResult.value && !transfer.isImporting.value"
                class="mt-3 p-3 rounded-xl bg-bg-muted border border-border-muted"
              >
                <div class="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <div class="text-base font-semibold text-status-success">{{ transfer.importResult.value.imported }}</div>
                    <div class="text-xs text-text-muted">{{ t('historyTransfer.result.imported') }}</div>
                  </div>
                  <div>
                    <div class="text-base font-semibold text-status-warning">{{ transfer.importResult.value.skipped }}</div>
                    <div class="text-xs text-text-muted">{{ t('historyTransfer.result.skipped') }}</div>
                  </div>
                  <div>
                    <div class="text-base font-semibold text-status-error">{{ transfer.importResult.value.failed }}</div>
                    <div class="text-xs text-text-muted">{{ t('historyTransfer.result.failed') }}</div>
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
    :selected-character-ids="peerSyncSelectedCharIds"
    :sync-type="peerSyncType"
    @synced="handleSynced"
  />

  <!-- Character Preview Lightbox -->
  <PreviewLightbox
    :visible="!!previewCharacter"
    :image-src="getCharPreviewSrc()"
    @close="closeCharPreview"
  >
    <template #caption>
      <h3 class="text-xl font-semibold text-text-primary mb-2">{{ previewCharacter?.name }}</h3>
      <p class="text-sm text-text-muted max-w-md">{{ previewCharacter?.description }}</p>
    </template>
  </PreviewLightbox>

  <!-- History Preview Lightbox -->
  <PreviewLightbox
    :visible="!!previewHistoryItem"
    :image-src="getHistoryPreviewSrc()"
    :video-src="previewHistoryVideoUrl"
    :is-loading="isLoadingPreview"
    @close="closeHistoryPreview"
  >
    <template #caption>
      <div class="flex items-center justify-center gap-2 mb-2">
        <span :class="['text-xs px-2 py-1 rounded', modeColors[previewHistoryItem?.mode] || 'bg-control-disabled text-text-secondary']">
          {{ previewHistoryItem?.mode ? t(`modes.${previewHistoryItem.mode}.name`) : '' }}
        </span>
        <span class="text-xs text-text-muted">{{ previewHistoryItem?.timestamp ? formatRelativeTime(previewHistoryItem.timestamp) : '' }}</span>
        <span v-if="(previewHistoryItem?.imageCount || previewHistoryItem?.images?.length || 0) > 1" class="text-xs text-text-muted">
          · {{ previewHistoryItem.imageCount || previewHistoryItem.images?.length }} {{ t('common.images') || 'images' }}
        </span>
      </div>
      <p class="text-sm text-text-muted max-w-lg">{{ previewHistoryItem?.prompt }}</p>
    </template>
  </PreviewLightbox>
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
