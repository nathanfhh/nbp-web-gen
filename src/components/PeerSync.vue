<script setup>
import { ref, watch, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePeerSync } from '@/composables/usePeerSync'
import { useCloudfareTurn } from '@/composables/useCloudfareTurn'
import { useToast } from '@/composables/useToast'
import ConfirmModal from '@/components/ConfirmModal.vue'

const { t } = useI18n()
const toast = useToast()
const sync = usePeerSync()
const turn = useCloudfareTurn()

// Confirm modal for close during transfer
const confirmModal = ref(null)

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  selectedIds: { type: Array, default: () => [] },
  selectedCharacterIds: { type: Array, default: () => [] },
  syncType: { type: String, default: 'history' }, // 'history' | 'characters'
})
const emit = defineEmits(['update:modelValue', 'synced'])

// UI state
const mode = ref(null) // null | 'send' | 'receive'
const inputCode = ref('')

// Cloudflare TURN settings
const showTurnSettings = ref(false)
const turnTokenId = ref('')
const apiToken = ref('')
const isFetchingIce = ref(false)
const hasTurnConfig = computed(() => turn.hasCfTurnCredentials())
const turnEnabled = ref(true)

// Debug log auto-scroll
const debugLogRef = ref(null)

// Load Cloudflare TURN credentials on mount
onMounted(() => {
  const creds = turn.getCfTurnCredentials()
  if (creds) {
    turnTokenId.value = creds.turnTokenId || ''
    apiToken.value = creds.apiToken || ''
  }
  turnEnabled.value = turn.isTurnEnabled()
})

const toggleTurnEnabled = () => {
  turnEnabled.value = !turnEnabled.value
  turn.setTurnEnabled(turnEnabled.value)
}

const saveTurnSettings = async () => {
  const result = turn.saveCfTurnCredentials(turnTokenId.value, apiToken.value)
  if (result.success) {
    // Test the credentials by fetching ICE servers
    isFetchingIce.value = true
    const fetchResult = await turn.fetchCfIceServers()
    isFetchingIce.value = false

    if (fetchResult.success) {
      toast.success(t('peerSync.turn.saved'))
      showTurnSettings.value = false
    } else {
      toast.error(fetchResult.error || t('peerSync.turn.fetchFailed'))
    }
  } else {
    toast.error(result.error)
  }
}

const clearTurnSettings = () => {
  turnTokenId.value = ''
  apiToken.value = ''
  turn.clearCfTurnCredentials()
  toast.success(t('peerSync.turn.cleared'))
}

// Auto-scroll debug log to bottom when new entries added
watch(
  () => sync.debugLog.value.length,
  async () => {
    await nextTick()
    if (debugLogRef.value) {
      debugLogRef.value.scrollTop = debugLogRef.value.scrollHeight
    }
  }
)

// History API for back gesture
const historyStatePushed = ref(false)

const handlePopState = (e) => {
  if (props.modelValue && e.state?.peerSync !== true) {
    close()
  }
}

watch(
  () => props.modelValue,
  (newVal) => {
    if (newVal) {
      if (!historyStatePushed.value) {
        history.pushState({ peerSync: true }, '')
        historyStatePushed.value = true
      }
      document.body.style.overflow = 'hidden'
    } else {
      if (historyStatePushed.value) {
        historyStatePushed.value = false
        if (history.state?.peerSync === true) {
          history.back()
        }
      }
      document.body.style.overflow = ''
      // Reset state when modal closes
      resetState()
    }
  }
)

onMounted(() => {
  window.addEventListener('popstate', handlePopState)
})

onUnmounted(() => {
  window.removeEventListener('popstate', handlePopState)
  if (historyStatePushed.value && history.state?.peerSync === true) {
    history.back()
  }
  sync.cleanup()
})

// Watch for completion
watch(
  () => sync.status.value,
  (newStatus) => {
    if (newStatus === 'completed') {
      emit('synced')
      if (sync.transferDirection.value === 'receive') {
        toast.success(t('peerSync.receiveSuccess'))
      } else {
        toast.success(t('peerSync.sendSuccess'))
      }
    } else if (newStatus === 'error') {
      toast.error(errorMessage.value || t('peerSync.error'))
    }
  }
)

const resetState = () => {
  mode.value = null
  inputCode.value = ''
  sync.cleanup()
}

const close = async () => {
  // Confirm if transfer is in progress
  if (sync.status.value === 'transferring' || sync.status.value === 'paired') {
    const confirmed = await confirmModal.value?.show({
      title: t('peerSync.closeConfirmTitle'),
      message: t('peerSync.closeConfirmMessage'),
      confirmText: t('peerSync.closeConfirmButton'),
    })
    if (!confirmed) return
  }
  emit('update:modelValue', false)
}

const startSending = async () => {
  mode.value = 'send'
  await sync.startAsSender({
    historyIds: props.syncType === 'history' && props.selectedIds.length > 0 ? props.selectedIds : null,
    characterIds: props.syncType === 'characters' && props.selectedCharacterIds.length > 0 ? props.selectedCharacterIds : null,
    type: props.syncType,
  })
}

const startReceiving = () => {
  mode.value = 'receive'
}

const connectWithCode = async () => {
  if (inputCode.value.length >= 6) {
    await sync.connectToSender(inputCode.value)
  }
}

const goBack = () => {
  resetState()
}

// Format code for display
const formattedCode = computed(() => sync.connectionCode.value)

// Format error message (handle i18n keys vs raw strings)
const errorMessage = computed(() => {
  const err = sync.error.value
  if (!err) return ''
  if (typeof err === 'object' && err.key) {
    return t(err.key)
  }
  return err
})

</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="modelValue"
        class="fixed inset-0 z-[9999] flex items-center justify-center p-4"
        @click.self="close"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>

        <!-- Modal -->
        <div class="relative glass-strong rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
          <!-- Header -->
          <div class="flex items-center justify-between mb-6">
            <div class="flex items-center gap-3">
              <button
                v-if="mode !== null && sync.status.value !== 'transferring'"
                @click="goBack"
                class="p-2 -ml-2 rounded-lg hover:bg-white/10 text-gray-500 text-gray-400 hover:text-white transition-all"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div class="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                <svg class="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              </div>
              <h3 class="text-lg font-semibold text-white">
                {{ $t('peerSync.title') }}
              </h3>
            </div>
            <button
              @click="close"
              class="p-2 rounded-lg hover:bg-white/10 text-gray-500 text-gray-400 hover:text-white transition-all"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Mode Selection -->
          <template v-if="mode === null">
            <p class="text-sm text-white/80 mb-6">
              {{ $t('peerSync.description') }}
            </p>

            <div class="space-y-3">
              <!-- Send Button -->
              <button
                @click="startSending"
                :disabled="(props.syncType === 'history' && props.selectedIds.length === 0) || (props.syncType === 'characters' && props.selectedCharacterIds.length === 0)"
                :class="[
                  'w-full p-4 rounded-xl border transition-all flex items-center gap-4',
                  (props.syncType === 'history' && props.selectedIds.length === 0) || (props.syncType === 'characters' && props.selectedCharacterIds.length === 0)
                    ? 'bg-gray-500/10 border-gray-500/30 opacity-50 cursor-not-allowed'
                    : 'bg-cyan-500/20 border-cyan-500/40 hover:bg-cyan-500/30'
                ]"
              >
                <div :class="[
                  'w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0',
                  (props.syncType === 'history' && props.selectedIds.length === 0) || (props.syncType === 'characters' && props.selectedCharacterIds.length === 0)
                    ? 'bg-gray-500/20'
                    : 'bg-cyan-500/30'
                ]">
                  <svg :class="[
                    'w-6 h-6',
                    (props.syncType === 'history' && props.selectedIds.length === 0) || (props.syncType === 'characters' && props.selectedCharacterIds.length === 0)
                      ? 'text-gray-500'
                      : 'text-cyan-400'
                  ]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                </div>
                <div class="text-left">
                  <div :class="(props.syncType === 'history' && props.selectedIds.length === 0) || (props.syncType === 'characters' && props.selectedCharacterIds.length === 0) ? 'text-gray-400' : 'text-white'" class="font-medium">{{ $t('peerSync.sendMode.title') }}</div>
                  <div class="text-xs" :class="(props.syncType === 'history' && props.selectedIds.length === 0) || (props.syncType === 'characters' && props.selectedCharacterIds.length === 0) ? 'text-gray-500' : 'text-white/70'">
                    <template v-if="props.syncType === 'history'">
                      {{ props.selectedIds.length === 0 ? $t('peerSync.sendMode.noSelection') : $t('peerSync.sendMode.historyDesc', { count: props.selectedIds.length }) }}
                    </template>
                    <template v-else>
                      {{ props.selectedCharacterIds.length === 0 ? $t('peerSync.sendMode.noCharacterSelection') : $t('peerSync.sendMode.charactersDesc', { count: props.selectedCharacterIds.length }) }}
                    </template>
                  </div>
                </div>
              </button>

              <!-- Receive Button -->
              <button
                @click="startReceiving"
                class="w-full p-4 rounded-xl bg-blue-500/20 border border-blue-500/40 hover:bg-blue-500/30 transition-all flex items-center gap-4"
              >
                <div class="w-12 h-12 rounded-xl bg-blue-500/30 flex items-center justify-center flex-shrink-0">
                  <svg class="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </div>
                <div class="text-left">
                  <div class="text-white font-medium">{{ $t('peerSync.receiveMode.title') }}</div>
                  <div class="text-xs text-white/70">{{ $t('peerSync.receiveMode.description') }}</div>
                </div>
              </button>
            </div>

            <!-- Cloudflare TURN Settings (collapsible) -->
            <div class="mt-6 pt-4 border-t border-white/10">
              <button
                @click="showTurnSettings = !showTurnSettings"
                class="w-full flex items-center justify-between text-sm text-white/80 hover:text-white transition-colors"
              >
                <div class="flex items-center gap-2">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>{{ $t('peerSync.turn.title') }}</span>
                  <span
                    v-if="hasTurnConfig"
                    class="w-2.5 h-2.5 rounded-full"
                    :class="turnEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-gray-500'"
                  ></span>
                </div>
                <svg
                  class="w-4 h-4 transition-transform"
                  :class="{ 'rotate-180': showTurnSettings }"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              <Transition name="slide">
                <div v-if="showTurnSettings" class="mt-4 space-y-3">
                  <p class="text-xs text-white/70">
                    {{ $t('peerSync.turn.description') }}
                  </p>

                  <!-- TURN Enable Toggle -->
                  <div v-if="hasTurnConfig" class="flex items-center justify-between py-2 px-3 rounded-lg bg-white/5">
                    <span class="text-sm text-white/80">{{ $t('peerSync.turn.enableLabel') }}</span>
                    <button
                      @click="toggleTurnEnabled"
                      :class="[
                        'relative w-11 h-6 rounded-full transition-colors',
                        turnEnabled ? 'bg-emerald-500' : 'bg-gray-600'
                      ]"
                    >
                      <span
                        :class="[
                          'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform',
                          turnEnabled ? 'translate-x-5' : 'translate-x-0'
                        ]"
                      ></span>
                    </button>
                  </div>

                  <a
                    href="https://developers.cloudflare.com/calls/turn/"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-1 text-xs text-cyan-400 hover:underline"
                  >
                    {{ $t('peerSync.turn.cloudflareLink') }}
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                  <div>
                    <label class="block text-xs text-white/70 mb-1">{{ $t('peerSync.turn.tokenIdLabel') }}</label>
                    <input
                      v-model="turnTokenId"
                      type="text"
                      class="w-full bg-black/30 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all"
                      :placeholder="$t('peerSync.turn.tokenIdPlaceholder')"
                    />
                  </div>
                  <div>
                    <label class="block text-xs text-white/70 mb-1">{{ $t('peerSync.turn.apiTokenLabel') }}</label>
                    <input
                      v-model="apiToken"
                      type="password"
                      class="w-full bg-black/30 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all"
                      :placeholder="$t('peerSync.turn.apiTokenPlaceholder')"
                    />
                  </div>
                  <div class="flex gap-2">
                    <button
                      @click="saveTurnSettings"
                      :disabled="!turnTokenId.trim() || !apiToken.trim() || isFetchingIce"
                      class="flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {{ isFetchingIce ? $t('peerSync.turn.verifying') : $t('common.save') }}
                    </button>
                    <button
                      v-if="hasTurnConfig"
                      @click="clearTurnSettings"
                      class="py-2 px-3 rounded-lg text-xs font-medium transition-all bg-rose-500/20 text-rose-400 hover:bg-rose-500/30"
                    >
                      {{ $t('common.clear') }}
                    </button>
                  </div>
                </div>
              </Transition>
            </div>
          </template>

          <!-- Sender View -->
          <template v-else-if="mode === 'send'">
            <!-- Waiting for connection -->
            <template v-if="sync.status.value === 'waiting'">
              <div class="text-center">
                <div class="mb-4">
                  <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-cyan-500/20 mb-4">
                    <svg class="w-8 h-8 text-cyan-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                    </svg>
                  </div>
                </div>

                <p class="text-sm text-gray-300 mb-4">{{ $t('peerSync.shareCode') }}</p>

                <!-- Connection Code -->
                <div class="bg-black/30 rounded-xl p-6 mb-4">
                  <div class="text-4xl font-mono font-bold text-white tracking-[0.3em]">
                    {{ formattedCode }}
                  </div>
                </div>

                <p class="text-xs text-gray-400 mb-4">
                  {{ $t('peerSync.waitingConnection') }}
                </p>

                <!-- Debug Log -->
                <div v-if="sync.debugLog.value.length" ref="debugLogRef" class="mt-4 p-3 bg-black/40 rounded-lg text-left max-h-32 overflow-y-auto">
                  <p class="text-xs text-gray-400 mb-1">Debug:</p>
                  <p v-for="(log, i) in sync.debugLog.value" :key="i" class="text-xs text-gray-300 font-mono">
                    {{ log }}
                  </p>
                </div>
              </div>
            </template>

            <!-- Paired - Show emojis -->
            <template v-else-if="sync.status.value === 'paired' && !sync.pairingConfirmed.value">
              <div class="text-center">
                <p class="text-sm text-gray-300 mb-4">{{ $t('peerSync.verifyEmojis') }}</p>

                <!-- Pairing Emojis -->
                <div class="bg-black/30 rounded-xl p-6 mb-6">
                  <div class="text-5xl flex justify-center gap-4">
                    <span v-for="(emoji, i) in sync.pairingEmojis.value" :key="i">{{ emoji }}</span>
                  </div>
                </div>

                <p class="text-xs text-gray-400 mb-6">
                  {{ $t('peerSync.confirmMatch') }}
                </p>

                <button
                  @click="sync.confirmPairing"
                  :disabled="sync.localConfirmed.value"
                  :class="[
                    'w-full py-3 px-4 rounded-xl text-sm font-medium transition-all border',
                    sync.localConfirmed.value
                      ? 'bg-gray-500/20 border-gray-500 text-gray-400 cursor-wait'
                      : 'bg-emerald-500/30 border-emerald-500 text-emerald-300 hover:bg-emerald-500/40'
                  ]"
                >
                  {{ sync.localConfirmed.value ? $t('peerSync.waitingRemote') : $t('peerSync.confirmButton') }}
                </button>
              </div>
            </template>

            <!-- Transferring -->
            <template v-else-if="sync.status.value === 'transferring' || (sync.pairingConfirmed.value && sync.status.value !== 'completed' && sync.status.value !== 'error')">
              <div class="text-center">
                <div class="mb-4">
                  <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-cyan-500/20 mb-4">
                    <svg class="w-8 h-8 text-cyan-400 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                </div>

                <p class="text-white font-medium mb-2">{{ $t('peerSync.sending') }}</p>
                <p class="text-sm text-gray-300 mb-2">
                  {{ sync.transferProgress.value.current }} / {{ sync.transferProgress.value.total }}
                </p>

                <!-- Transfer stats -->
                <div v-if="sync.transferStats.value.totalFormatted" class="text-xs text-gray-400 mb-4 flex items-center justify-center gap-3">
                  <span>{{ sync.transferStats.value.totalFormatted }}</span>
                  <span class="text-cyan-400">{{ sync.transferStats.value.speedFormatted }}</span>
                </div>

                <!-- Progress bar -->
                <div class="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    class="h-full bg-cyan-500 transition-all duration-300"
                    :style="{ width: sync.transferProgress.value.total > 0 ? `${(sync.transferProgress.value.current / sync.transferProgress.value.total) * 100}%` : '0%' }"
                  ></div>
                </div>
              </div>
            </template>

            <!-- Completed -->
            <template v-else-if="sync.status.value === 'completed'">
              <div class="text-center">
                <div class="mb-4">
                  <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/20 mb-4">
                    <svg class="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>

                <p class="text-white font-medium mb-2">{{ $t('peerSync.completed') }}</p>
                <p class="text-sm text-gray-300">
                  {{ $t('peerSync.sentCount', { count: sync.transferResult.value?.sent || 0 }) }}
                </p>
                <!-- Final transfer stats -->
                <p v-if="sync.transferStats.value.totalFormatted" class="text-xs text-gray-400 mt-1">
                  {{ sync.transferStats.value.totalFormatted }}
                </p>
              </div>
            </template>

            <!-- Error -->
            <template v-else-if="sync.status.value === 'error'">
              <div class="text-center">
                <div class="mb-4">
                  <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/20 mb-4">
                    <svg class="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                </div>

                <p class="text-white font-medium mb-2">{{ $t('peerSync.errorTitle') }}</p>
                <p class="text-sm text-red-400">{{ errorMessage }}</p>
              </div>
            </template>
          </template>

          <!-- Receiver View -->
          <template v-else-if="mode === 'receive'">
            <!-- Enter Code -->
            <template v-if="sync.status.value === 'idle'">
              <div class="text-center">
                <p class="text-sm text-gray-300 mb-4">{{ $t('peerSync.enterCode') }}</p>

                <!-- Code Input -->
                <input
                  v-model="inputCode"
                  type="text"
                  maxlength="6"
                  class="w-full bg-black/30 border border-white/20 rounded-xl px-4 py-4 text-center text-2xl font-mono font-bold text-white tracking-[0.3em] uppercase focus:outline-none focus:border-blue-500 transition-all"
                  :placeholder="$t('peerSync.codePlaceholder')"
                  @keyup.enter="connectWithCode"
                />

                <button
                  @click="connectWithCode"
                  :disabled="inputCode.length < 6"
                  class="w-full mt-4 py-3 px-4 rounded-xl text-sm font-medium transition-all bg-blue-500/30 border border-blue-500 text-blue-300 hover:bg-blue-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {{ $t('peerSync.connectButton') }}
                </button>
              </div>
            </template>

            <!-- Connecting -->
            <template v-else-if="sync.status.value === 'connecting'">
              <div class="text-center">
                <div class="mb-4">
                  <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500/20 mb-4">
                    <svg class="w-8 h-8 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                </div>

                <p class="text-white font-medium">{{ $t('peerSync.status.connecting') }}</p>

                <!-- Debug Log -->
                <div v-if="sync.debugLog.value.length" ref="debugLogRef" class="mt-4 p-3 bg-black/40 rounded-lg text-left max-h-32 overflow-y-auto">
                  <p class="text-xs text-gray-400 mb-1">Debug:</p>
                  <p v-for="(log, i) in sync.debugLog.value" :key="i" class="text-xs text-gray-300 font-mono">
                    {{ log }}
                  </p>
                </div>
              </div>
            </template>

            <!-- Paired - Show emojis -->
            <template v-else-if="sync.status.value === 'paired' && !sync.pairingConfirmed.value">
              <div class="text-center">
                <p class="text-sm text-gray-300 mb-4">{{ $t('peerSync.verifyEmojis') }}</p>

                <!-- Pairing Emojis -->
                <div class="bg-black/30 rounded-xl p-6 mb-6">
                  <div class="text-5xl flex justify-center gap-4">
                    <span v-for="(emoji, i) in sync.pairingEmojis.value" :key="i">{{ emoji }}</span>
                  </div>
                </div>

                <p class="text-xs text-gray-400 mb-6">
                  {{ $t('peerSync.confirmMatch') }}
                </p>

                <button
                  @click="sync.confirmPairing"
                  :disabled="sync.localConfirmed.value"
                  :class="[
                    'w-full py-3 px-4 rounded-xl text-sm font-medium transition-all border',
                    sync.localConfirmed.value
                      ? 'bg-gray-500/20 border-gray-500 text-gray-400 cursor-wait'
                      : 'bg-emerald-500/30 border-emerald-500 text-emerald-300 hover:bg-emerald-500/40'
                  ]"
                >
                  {{ sync.localConfirmed.value ? $t('peerSync.waitingRemote') : $t('peerSync.confirmButton') }}
                </button>
              </div>
            </template>

            <!-- Transferring -->
            <template v-else-if="sync.status.value === 'transferring' || (sync.pairingConfirmed.value && sync.status.value !== 'completed' && sync.status.value !== 'error')">
              <div class="text-center">
                <div class="mb-4">
                  <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500/20 mb-4">
                    <svg class="w-8 h-8 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                </div>

                <p class="text-white font-medium mb-2">{{ $t('peerSync.receiving') }}</p>
                <p class="text-sm text-gray-300 mb-2">
                  {{ sync.transferProgress.value.current }} / {{ sync.transferProgress.value.total }}
                </p>

                <!-- Transfer stats -->
                <div v-if="sync.transferStats.value.totalFormatted" class="text-xs text-gray-400 mb-4 flex items-center justify-center gap-3">
                  <span>{{ sync.transferStats.value.totalFormatted }}</span>
                  <span class="text-blue-400">{{ sync.transferStats.value.speedFormatted }}</span>
                </div>

                <!-- Progress bar -->
                <div class="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    class="h-full bg-blue-500 transition-all duration-300"
                    :style="{ width: sync.transferProgress.value.total > 0 ? `${(sync.transferProgress.value.current / sync.transferProgress.value.total) * 100}%` : '0%' }"
                  ></div>
                </div>
              </div>
            </template>

            <!-- Completed -->
            <template v-else-if="sync.status.value === 'completed'">
              <div class="text-center">
                <div class="mb-4">
                  <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/20 mb-4">
                    <svg class="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>

                <p class="text-white font-medium mb-4">{{ $t('peerSync.completed') }}</p>

                <!-- Result stats -->
                <div class="grid grid-cols-3 gap-3 text-center bg-black/20 rounded-xl p-4">
                  <div>
                    <div class="text-lg font-semibold text-emerald-400">
                      {{ sync.transferResult.value?.imported || 0 }}
                    </div>
                    <div class="text-xs text-gray-400">{{ $t('peerSync.result.imported') }}</div>
                  </div>
                  <div>
                    <div class="text-lg font-semibold text-amber-400">
                      {{ sync.transferResult.value?.skipped || 0 }}
                    </div>
                    <div class="text-xs text-gray-400">{{ $t('peerSync.result.skipped') }}</div>
                  </div>
                  <div>
                    <div class="text-lg font-semibold text-red-400">
                      {{ sync.transferResult.value?.failed || 0 }}
                    </div>
                    <div class="text-xs text-gray-400">{{ $t('peerSync.result.failed') }}</div>
                  </div>
                </div>
              </div>
            </template>

            <!-- Error -->
            <template v-else-if="sync.status.value === 'error'">
              <div class="text-center">
                <div class="mb-4">
                  <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/20 mb-4">
                    <svg class="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                </div>

                <p class="text-white font-medium mb-2">{{ $t('peerSync.errorTitle') }}</p>
                <p class="text-sm text-red-400 mb-4">{{ errorMessage }}</p>

                <button
                  @click="goBack"
                  class="w-full py-3 px-4 rounded-xl text-sm font-medium transition-all bg-white/10 border border-white/20 text-white hover:bg-white/20"
                >
                  {{ $t('peerSync.tryAgain') }}
                </button>
              </div>
            </template>
          </template>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Confirm Modal -->
  <ConfirmModal ref="confirmModal" />
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

/* Slide transition for TURN settings */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s ease;
  overflow: hidden;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  max-height: 0;
  transform: translateY(-10px);
}

.slide-enter-to,
.slide-leave-from {
  opacity: 1;
  max-height: 300px;
  transform: translateY(0);
}
</style>
