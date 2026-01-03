<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useGeneratorStore } from '@/stores/generator'

const store = useGeneratorStore()
const inputKey = ref('')
const showKey = ref(false)
const isEditing = ref(false)

// Watch for API key changes (e.g., after store initialization)
watch(
  () => store.hasApiKey,
  (hasKey) => {
    // If API key becomes available and we're still in editing mode with empty input, exit editing
    if (hasKey && isEditing.value && !inputKey.value.trim()) {
      isEditing.value = false
    }
  },
  { immediate: true }
)

const maskedKey = computed(() => {
  if (!store.apiKey) return ''
  const key = store.apiKey
  if (key.length <= 8) return '*'.repeat(key.length)
  return key.slice(0, 4) + '*'.repeat(key.length - 8) + key.slice(-4)
})

const saveKey = () => {
  if (inputKey.value.trim()) {
    store.saveApiKey(inputKey.value.trim())
    inputKey.value = ''
    isEditing.value = false
  }
}

const clearKey = () => {
  store.saveApiKey('')
  inputKey.value = ''
  isEditing.value = true
}

const startEditing = () => {
  isEditing.value = true
  inputKey.value = ''
}

const cancelEditing = () => {
  isEditing.value = false
  inputKey.value = ''
}

onMounted(() => {
  if (!store.hasApiKey) {
    isEditing.value = true
  }
})
</script>

<template>
  <div class="glass p-6">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-3">
        <div
          class="w-10 h-10 rounded-xl flex items-center justify-center"
          :class="store.hasApiKey ? 'bg-emerald-500/20' : 'bg-amber-500/20'"
        >
          <svg
            v-if="store.hasApiKey"
            class="w-5 h-5 text-emerald-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
          <svg v-else class="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
            />
          </svg>
        </div>
        <div>
          <h3 class="font-semibold text-white">API Key</h3>
          <p class="text-sm text-gray-400">Google Gemini API</p>
        </div>
      </div>
      <div v-if="store.hasApiKey && !isEditing" class="flex items-center gap-2">
        <button @click="startEditing" class="btn-secondary text-sm py-2 px-4">
          更換
        </button>
        <button @click="clearKey" class="text-red-400 hover:text-red-300 text-sm py-2 px-4">
          清除
        </button>
      </div>
    </div>

    <!-- Display saved key -->
    <div v-if="store.hasApiKey && !isEditing" class="flex items-center gap-2">
      <div class="flex-1 min-w-0 input-premium font-mono text-sm overflow-hidden text-ellipsis whitespace-nowrap">
        {{ showKey ? store.apiKey : maskedKey }}
      </div>
      <button
        @click="showKey = !showKey"
        class="flex-shrink-0 w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 transition-colors flex items-center justify-center"
      >
        <svg v-if="showKey" class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
          />
        </svg>
        <svg v-else class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
          />
        </svg>
      </button>
    </div>

    <!-- Input new key -->
    <div v-else class="space-y-4">
      <div class="relative">
        <input
          v-model="inputKey"
          :type="showKey ? 'text' : 'password'"
          placeholder="輸入您的 Gemini API Key..."
          class="input-premium pr-12 font-mono"
          @keyup.enter="saveKey"
        />
        <button
          @click="showKey = !showKey"
          class="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg hover:bg-white/5 transition-colors"
        >
          <svg v-if="showKey" class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
            />
          </svg>
          <svg v-else class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
          </svg>
        </button>
      </div>
      <div class="flex gap-3">
        <button @click="saveKey" :disabled="!inputKey.trim()" class="btn-premium flex-1">
          儲存 API Key
        </button>
        <button v-if="store.hasApiKey" @click="cancelEditing" class="btn-secondary">
          取消
        </button>
      </div>
      <p class="text-xs text-gray-500">
        API Key 僅儲存在您的瀏覽器本地，不會傳送至任何伺服器。
        <a href="https://aistudio.google.com/apikey" target="_blank" class="text-purple-400 hover:text-purple-300">
          取得 API Key
        </a>
      </p>
    </div>
  </div>
</template>
