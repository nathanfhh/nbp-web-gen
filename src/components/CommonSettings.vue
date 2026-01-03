<script setup>
import { computed } from 'vue'
import { useGeneratorStore } from '@/stores/generator'

const store = useGeneratorStore()

const temperatureLabel = computed(() => {
  const t = store.temperature
  if (t < 0.5) return '保守'
  if (t < 1.0) return '平衡'
  if (t < 1.5) return '創意'
  return '狂野'
})
</script>

<template>
  <div class="glass p-6 space-y-6">
    <h3 class="font-semibold text-white flex items-center gap-2">
      <svg class="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      進階設定
    </h3>

    <!-- Temperature -->
    <div class="space-y-3">
      <div class="flex justify-between items-center">
        <label class="text-sm text-gray-300">Temperature</label>
        <div class="flex items-center gap-2">
          <span class="text-xs px-2 py-1 rounded-md bg-purple-500/20 text-purple-300">
            {{ temperatureLabel }}
          </span>
          <span class="font-mono text-sm text-white">{{ store.temperature.toFixed(1) }}</span>
        </div>
      </div>
      <input
        v-model.number="store.temperature"
        type="range"
        min="0"
        max="2"
        step="0.1"
        class="slider-premium"
      />
      <div class="flex justify-between text-xs text-gray-500">
        <span>0.0 保守</span>
        <span>1.0 平衡</span>
        <span>2.0 狂野</span>
      </div>
    </div>

    <!-- Seed -->
    <div class="space-y-3">
      <div class="flex justify-between items-center">
        <label class="text-sm text-gray-300">Seed（隨機種子）</label>
        <button
          v-if="store.seed"
          @click="store.seed = ''"
          class="text-xs text-gray-500 hover:text-gray-400"
        >
          清除
        </button>
      </div>
      <div class="relative">
        <input
          v-model="store.seed"
          type="number"
          placeholder="留空使用隨機種子"
          class="input-premium pr-12 font-mono"
        />
        <button
          @click="store.seed = Math.floor(Math.random() * 2147483647).toString()"
          class="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg hover:bg-white/5 transition-colors"
          title="生成隨機種子"
        >
          <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>
      <p class="text-xs text-gray-500">
        相同的 seed 與 prompt 會產生相同的結果，方便重現
      </p>
    </div>
  </div>
</template>
