<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useHistoryTransfer } from '@/composables/useHistoryTransfer'
import { useToast } from '@/composables/useToast'

const { t } = useI18n()
const toast = useToast()
const transfer = useHistoryTransfer()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'imported'])

// History API for back gesture
const historyStatePushed = ref(false)

const handlePopState = (e) => {
  if (props.modelValue && e.state?.historyTransfer !== true) {
    emit('update:modelValue', false)
  }
}

watch(
  () => props.modelValue,
  (newVal) => {
    if (newVal) {
      if (!historyStatePushed.value) {
        history.pushState({ historyTransfer: true }, '')
        historyStatePushed.value = true
      }
      document.body.style.overflow = 'hidden'
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
  const result = await transfer.exportHistory()
  if (result.success) {
    toast.success(t('historyTransfer.exportSuccess', { count: result.count }))
  } else {
    toast.error(t('historyTransfer.exportError'))
  }
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
        <div class="relative glass-strong rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
          <!-- Header -->
          <div class="flex items-center justify-between mb-6">
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

          <!-- Export Section -->
          <div class="mb-6">
            <h4 class="text-sm font-medium text-gray-300 mb-2">
              {{ $t('historyTransfer.export.title') }}
            </h4>
            <p class="text-xs text-gray-500 mb-3">
              {{ $t('historyTransfer.export.description') }}
            </p>
            <button
              @click="handleExport"
              :disabled="transfer.isExporting.value"
              class="w-full py-3 px-4 rounded-xl text-sm font-medium transition-all bg-purple-500/30 border border-purple-500 text-purple-300 hover:bg-purple-500/40 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <template v-if="transfer.isExporting.value">
                <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>{{ $t('historyTransfer.export.progress', { current: transfer.progress.value.current, total: transfer.progress.value.total }) }}</span>
              </template>
              <template v-else>
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <span>{{ $t('historyTransfer.export.button') }}</span>
              </template>
            </button>
          </div>

          <!-- Divider -->
          <div class="border-t border-white/10 mb-6"></div>

          <!-- Import Section -->
          <div>
            <h4 class="text-sm font-medium text-gray-300 mb-2">
              {{ $t('historyTransfer.import.title') }}
            </h4>
            <p class="text-xs text-gray-500 mb-3">
              {{ $t('historyTransfer.import.description') }}
            </p>

            <!-- Drop Zone -->
            <div
              @dragover="handleDragOver"
              @dragleave="handleDragLeave"
              @drop="handleDrop"
              @click="fileInputRef?.click()"
              :class="[
                'w-full py-8 px-4 rounded-xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center gap-2',
                isDragOver
                  ? 'border-purple-400 bg-purple-500/10'
                  : 'border-white/20 hover:border-white/40 hover:bg-white/5',
                transfer.isImporting.value && 'pointer-events-none opacity-50'
              ]"
            >
              <template v-if="transfer.isImporting.value">
                <svg class="w-8 h-8 text-purple-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span class="text-sm text-gray-400">
                  {{ $t('historyTransfer.import.progress', { current: transfer.progress.value.current, total: transfer.progress.value.total }) }}
                </span>
              </template>
              <template v-else>
                <svg class="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span class="text-sm text-gray-400">
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
                class="mt-4 p-4 rounded-xl bg-white/5 border border-white/10"
              >
                <h5 class="text-sm font-medium text-white mb-3">
                  {{ $t('historyTransfer.result.title') }}
                </h5>
                <div class="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <div class="text-lg font-semibold text-emerald-400">
                      {{ transfer.importResult.value.imported }}
                    </div>
                    <div class="text-xs text-gray-500">
                      {{ $t('historyTransfer.result.imported') }}
                    </div>
                  </div>
                  <div>
                    <div class="text-lg font-semibold text-amber-400">
                      {{ transfer.importResult.value.skipped }}
                    </div>
                    <div class="text-xs text-gray-500">
                      {{ $t('historyTransfer.result.skipped') }}
                    </div>
                  </div>
                  <div>
                    <div class="text-lg font-semibold text-red-400">
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
