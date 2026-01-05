<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGeneratorStore } from '@/stores/generator'

const { t } = useI18n()
const store = useGeneratorStore()

const placeholders = computed(() => ({
  generate: t('prompt.placeholders.generate'),
  sticker: t('prompt.placeholders.generate'),
  edit: t('prompt.placeholders.edit'),
  story: t('prompt.placeholders.story'),
  diagram: t('prompt.placeholders.diagram'),
}))
</script>

<template>
  <div class="space-y-3">
    <label class="block text-sm font-medium text-gray-300">
      {{ $t('prompt.label') }}
    </label>
    <textarea
      v-model="store.prompt"
      :placeholder="placeholders[store.currentMode]"
      class="textarea-premium min-h-[140px]"
      rows="4"
    ></textarea>
    <div class="flex justify-between items-center text-xs text-gray-500">
      <span>{{ $t('prompt.hint') }}</span>
      <span>{{ store.prompt.length }} {{ $t('common.characters') }}</span>
    </div>
  </div>
</template>
