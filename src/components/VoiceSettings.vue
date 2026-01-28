<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGeneratorStore } from '@/stores/generator'
import { VOICES, DEFAULT_LANGUAGES, NARRATION_STYLES, SCRIPT_MODELS, TTS_MODELS } from '@/constants/voiceOptions'
import SearchableSelect from '@/components/SearchableSelect.vue'

const props = defineProps({
  modelValue: {
    type: Object,
    required: true,
  },
  showStyleOptions: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:modelValue'])

useI18n()
const store = useGeneratorStore()

const settings = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

const update = (key, value) => {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

const updateSpeaker = (index, key, value) => {
  const speakers = [...props.modelValue.speakers]
  speakers[index] = { ...speakers[index], [key]: value }
  emit('update:modelValue', { ...props.modelValue, speakers })
}

// Custom language
const showAddLanguage = ref(false)
const newLangCode = ref('')
const newLangLabel = ref('')

const allLanguages = computed(() => {
  return [...DEFAULT_LANGUAGES, ...(props.modelValue.customLanguages || [])]
})

const addCustomLanguage = () => {
  const code = newLangCode.value.trim()
  const label = newLangLabel.value.trim()
  if (!code || !label) return

  const customs = [...(props.modelValue.customLanguages || []), { code, label }]
  emit('update:modelValue', { ...props.modelValue, customLanguages: customs, language: code })
  newLangCode.value = ''
  newLangLabel.value = ''
  showAddLanguage.value = false
}

// Voice helpers
const voicesByGender = computed(() => {
  const female = VOICES.filter((v) => v.gender === 'female')
  const male = VOICES.filter((v) => v.gender === 'male')
  return { female, male }
})

const voiceGroups = computed(() => [
  {
    label: 'Female',
    options: voicesByGender.value.female.map((v) => ({
      value: v.name,
      label: v.name,
      description: v.characteristic,
    })),
  },
  {
    label: 'Male',
    options: voicesByGender.value.male.map((v) => ({
      value: v.name,
      label: v.name,
      description: v.characteristic,
    })),
  },
])

const isDuplicateVoice = computed(() => {
  if (props.modelValue.speakerMode !== 'dual') return false
  return props.modelValue.speakers[0].voiceName === props.modelValue.speakers[1].voiceName
})

const temperatureValue = computed(() => store.temperature)
</script>

<template>
  <div class="space-y-4">
    <!-- Language -->
    <div>
      <label class="text-xs font-medium text-text-secondary mb-1.5 block">
        {{ $t('slides.narration.language') }}
      </label>
      <div class="flex items-center gap-2">
        <SearchableSelect
          :modelValue="settings.language"
          @update:modelValue="update('language', $event)"
          :options="allLanguages.map((l) => ({ value: l.code, label: l.label }))"
          :placeholder="$t('slides.narration.language')"
          class="flex-1"
        />
        <button
          @click="showAddLanguage = !showAddLanguage"
          class="p-2 rounded-lg hover:bg-bg-interactive transition-colors text-text-muted"
          :title="$t('slides.narration.addLanguage')"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      <!-- Add custom language -->
      <div v-if="showAddLanguage" class="mt-2 p-3 rounded-lg bg-bg-muted space-y-2">
        <input
          v-model="newLangCode"
          :placeholder="$t('slides.narration.addLanguagePlaceholder')"
          class="input-premium text-xs w-full"
        />
        <input
          v-model="newLangLabel"
          :placeholder="$t('slides.narration.addLanguageLabel')"
          class="input-premium text-xs w-full"
        />
        <button
          @click="addCustomLanguage"
          :disabled="!newLangCode.trim() || !newLangLabel.trim()"
          class="text-xs px-3 py-1.5 rounded-lg bg-mode-generate text-text-on-brand hover:opacity-90 disabled:opacity-50 transition-all"
        >
          {{ $t('slides.narration.addLanguage') }}
        </button>
      </div>
    </div>

    <!-- Temperature hint -->
    <div class="text-xs text-text-muted px-1">
      {{ $t('slides.narration.temperatureHint', { value: temperatureValue }) }}
    </div>

    <!-- Speaker Mode -->
    <div>
      <label class="text-xs font-medium text-text-secondary mb-1.5 block">
        {{ $t('slides.narration.speakerMode') }}
      </label>
      <div class="flex gap-2">
        <button
          @click="update('speakerMode', 'single')"
          class="flex-1 py-2 text-sm rounded-lg transition-all border"
          :class="
            settings.speakerMode === 'single'
              ? 'bg-mode-generate text-text-on-brand border-mode-generate'
              : 'bg-bg-muted text-text-secondary border-border-muted hover:border-border-default'
          "
        >
          {{ $t('slides.narration.single') }}
        </button>
        <button
          @click="update('speakerMode', 'dual')"
          class="flex-1 py-2 text-sm rounded-lg transition-all border"
          :class="
            settings.speakerMode === 'dual'
              ? 'bg-mode-generate text-text-on-brand border-mode-generate'
              : 'bg-bg-muted text-text-secondary border-border-muted hover:border-border-default'
          "
        >
          {{ $t('slides.narration.dual') }}
        </button>
      </div>
    </div>

    <!-- Speaker 1 -->
    <div class="p-3 rounded-xl bg-bg-muted border border-border-muted space-y-3">
      <div>
        <label class="text-xs text-text-muted mb-1 block">{{ $t('slides.narration.speakerName') }} 1</label>
        <input
          :value="settings.speakers[0].name"
          @input="updateSpeaker(0, 'name', $event.target.value)"
          class="input-premium text-sm w-full"
        />
      </div>
      <div>
        <label class="text-xs text-text-muted mb-1 block">{{ $t('slides.narration.voiceSelect') }}</label>
        <SearchableSelect
          :modelValue="settings.speakers[0].voiceName"
          @update:modelValue="updateSpeaker(0, 'voiceName', $event)"
          :groups="voiceGroups"
          :placeholder="$t('slides.narration.voiceSelect')"
        />
      </div>
    </div>

    <!-- Speaker 2 (dual only) -->
    <div v-if="settings.speakerMode === 'dual'" class="p-3 rounded-xl bg-bg-muted border border-border-muted space-y-3">
      <div>
        <label class="text-xs text-text-muted mb-1 block">{{ $t('slides.narration.speakerName') }} 2</label>
        <input
          :value="settings.speakers[1].name"
          @input="updateSpeaker(1, 'name', $event.target.value)"
          class="input-premium text-sm w-full"
        />
      </div>
      <div>
        <label class="text-xs text-text-muted mb-1 block">{{ $t('slides.narration.voiceSelect') }}</label>
        <SearchableSelect
          :modelValue="settings.speakers[1].voiceName"
          @update:modelValue="updateSpeaker(1, 'voiceName', $event)"
          :groups="voiceGroups"
          :placeholder="$t('slides.narration.voiceSelect')"
        />
      </div>

      <!-- Duplicate voice warning -->
      <p v-if="isDuplicateVoice" class="text-xs text-status-warning">
        {{ $t('slides.narration.duplicateVoiceWarning') }}
      </p>
    </div>

    <!-- Voice preview link -->
    <a
      href="https://aistudio.google.com/live"
      target="_blank"
      rel="noopener noreferrer"
      class="text-xs text-brand-primary hover:underline inline-flex items-center gap-1"
    >
      {{ $t('slides.narration.voicePreviewLink') }}
      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
    </a>

    <!-- Style (only for slides) -->
    <div v-if="showStyleOptions">
      <label class="text-xs font-medium text-text-secondary mb-1.5 block">
        {{ $t('slides.narration.style') }}
      </label>
      <div class="space-y-2">
        <label
          v-for="style in NARRATION_STYLES"
          :key="style"
          class="flex items-start gap-3 p-2.5 rounded-lg cursor-pointer transition-all border"
          :class="
            settings.style === style
              ? 'bg-mode-generate-muted/30 border-mode-generate'
              : 'bg-bg-muted border-border-muted hover:border-border-default'
          "
        >
          <input
            type="radio"
            :value="style"
            :checked="settings.style === style"
            @change="update('style', style)"
            class="mt-0.5 accent-mode-generate"
          />
          <div>
            <div class="text-sm text-text-primary">{{ $t(`slides.narration.${style}`) }}</div>
            <div class="text-xs text-text-muted mt-0.5">{{ $t(`slides.narration.${style}Desc`) }}</div>
          </div>
        </label>
      </div>
    </div>

    <!-- Custom Prompt -->
    <div>
      <label class="text-xs font-medium text-text-secondary mb-1.5 block">
        {{ $t('slides.narration.customPrompt') }}
      </label>
      <textarea
        :value="settings.customPrompt"
        @input="update('customPrompt', $event.target.value)"
        :placeholder="$t('slides.narration.customPromptPlaceholder')"
        class="input-premium text-sm min-h-[60px] w-full"
        rows="2"
      />
    </div>

    <!-- Script Model -->
    <div>
      <label class="text-xs font-medium text-text-secondary mb-1.5 block">
        {{ $t('slides.narration.scriptModel') }}
      </label>
      <SearchableSelect
        :modelValue="settings.scriptModel"
        @update:modelValue="update('scriptModel', $event)"
        :options="SCRIPT_MODELS"
      />
    </div>

    <!-- TTS Model -->
    <div>
      <label class="text-xs font-medium text-text-secondary mb-1.5 block">
        {{ $t('slides.narration.ttsModel') }}
      </label>
      <SearchableSelect
        :modelValue="settings.ttsModel"
        @update:modelValue="update('ttsModel', $event)"
        :options="TTS_MODELS"
      />
    </div>
  </div>
</template>
