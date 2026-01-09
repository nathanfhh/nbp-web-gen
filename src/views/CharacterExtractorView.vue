<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useGeneratorStore } from '@/stores/generator'
import { useIndexedDB } from '@/composables/useIndexedDB'
import { useLocalStorage } from '@/composables/useLocalStorage'
import { useCharacterExtraction, EXTRACTION_MODELS } from '@/composables/useCharacterExtraction'
import { useToast } from '@/composables/useToast'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()
const store = useGeneratorStore()
const toast = useToast()
const { addCharacter, getCharacterById, updateCharacter } = useIndexedDB()
const { getQuickSetting, updateQuickSetting } = useLocalStorage()
const { isExtracting, extractCharacter, generateThumbnail } = useCharacterExtraction()

// Editing state
const editingCharacterId = ref(null)
const isEditMode = computed(() => !!editingCharacterId.value)

// Image state
const imageData = ref(null)
const imagePreview = ref(null)
const imageMimeType = ref('image/png')
const fileInput = ref(null)
const isDragging = ref(false)

// API settings (persisted via useLocalStorage)
const savedApiKey = getQuickSetting('extractionApiKey', '')
const useNbpKey = ref(!savedApiKey) // Default to alternate key if one is saved
const customApiKey = ref(savedApiKey)
const selectedModel = ref(getQuickSetting('extractionModel', EXTRACTION_MODELS[0].id))

// Save settings when changed
watch(customApiKey, (newVal) => {
  updateQuickSetting('extractionApiKey', newVal || '')
})

watch(selectedModel, (newVal) => {
  updateQuickSetting('extractionModel', newVal)
})

// Extraction result
const extractedData = ref(null)
const characterName = ref('')

// New tag inputs
const newAccessory = ref('')
const newFeature = ref('')

// Load image from route query or edit existing character
onMounted(async () => {
  // Edit mode - load existing character
  if (route.query.edit) {
    const characterId = parseInt(route.query.edit, 10)
    if (!isNaN(characterId)) {
      try {
        const character = await getCharacterById(characterId)
        if (character) {
          editingCharacterId.value = characterId
          characterName.value = character.name
          imageData.value = character.imageData
          imagePreview.value = `data:image/webp;base64,${character.thumbnail}`
          imageMimeType.value = 'image/png'
          extractedData.value = {
            description: character.description,
            physicalTraits: character.physicalTraits,
            clothing: character.clothing,
            accessories: character.accessories || [],
            distinctiveFeatures: character.distinctiveFeatures || [],
          }
        }
      } catch (e) {
        console.error('Failed to load character for editing:', e)
        toast.error(t('errors.loadFailed'))
      }
    }
  }
  // New extraction from image
  else if (route.query.image) {
    const storedImage = sessionStorage.getItem('characterExtractorImage')
    if (storedImage) {
      try {
        const data = JSON.parse(storedImage)
        imageData.value = data.data
        imagePreview.value = data.preview || `data:${data.mimeType};base64,${data.data}`
        imageMimeType.value = data.mimeType || 'image/png'
        sessionStorage.removeItem('characterExtractorImage')
      } catch (e) {
        console.error('Failed to load image from sessionStorage:', e)
      }
    }
  }
})

const goBack = () => {
  router.push('/')
}

// File handling
const handleDragOver = (e) => {
  e.preventDefault()
  isDragging.value = true
}

const handleDragLeave = () => {
  isDragging.value = false
}

const handleDrop = (e) => {
  e.preventDefault()
  isDragging.value = false
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
  if (files.length > 0) {
    processFile(files[0])
  }
}

const handleFileSelect = (e) => {
  const files = Array.from(e.target.files)
  if (files.length > 0) {
    processFile(files[0])
  }
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

const processFile = (file) => {
  const reader = new FileReader()
  reader.onload = (e) => {
    const dataUrl = e.target.result
    imageData.value = dataUrl.split(',')[1]
    imagePreview.value = dataUrl
    imageMimeType.value = file.type || 'image/png'
    // Reset extraction result when new image is loaded
    extractedData.value = null
    characterName.value = ''
  }
  reader.readAsDataURL(file)
}

const triggerFileInput = () => {
  fileInput.value?.click()
}

// Extraction
const handleExtract = async () => {
  if (!imageData.value) {
    toast.error(t('characterExtractor.noImage'))
    return
  }

  try {
    const result = await extractCharacter({
      imageData: imageData.value,
      mimeType: imageMimeType.value,
      model: selectedModel.value,
      useNbpKey: useNbpKey.value,
      customApiKey: customApiKey.value,
    })

    extractedData.value = result
    toast.success(t('characterExtractor.extractSuccess'))
  } catch (error) {
    toast.error(error.message || t('characterExtractor.extractFailed'))
  }
}

// Save character (create or update)
const handleSave = async () => {
  if (!characterName.value.trim()) {
    toast.error(t('characterExtractor.noName'))
    return
  }

  if (!extractedData.value) {
    toast.error(t('characterExtractor.noImage'))
    return
  }

  try {
    // Generate thumbnail
    const thumbnail = await generateThumbnail(imageData.value)

    const characterData = {
      name: characterName.value.trim(),
      ...extractedData.value,
      imageData: imageData.value,
      thumbnail,
    }

    if (isEditMode.value) {
      // Update existing character
      await updateCharacter(editingCharacterId.value, characterData)
      toast.success(t('characterExtractor.updateSuccess'))
    } else {
      // Create new character
      await addCharacter(characterData)
      toast.success(t('characterExtractor.saveSuccess'))
    }

    // Go back to home
    router.push('/')
  } catch (error) {
    toast.error(error.message)
  }
}

// Tag management
const addAccessory = () => {
  if (newAccessory.value.trim() && extractedData.value) {
    extractedData.value.accessories.push(newAccessory.value.trim())
    newAccessory.value = ''
  }
}

const removeAccessory = (index) => {
  if (extractedData.value) {
    extractedData.value.accessories.splice(index, 1)
  }
}

const addFeature = () => {
  if (newFeature.value.trim() && extractedData.value) {
    extractedData.value.distinctiveFeatures.push(newFeature.value.trim())
    newFeature.value = ''
  }
}

const removeFeature = (index) => {
  if (extractedData.value) {
    extractedData.value.distinctiveFeatures.splice(index, 1)
  }
}

const hasNbpKey = computed(() => store.hasApiKey)
const canExtract = computed(() => {
  return imageData.value && (useNbpKey.value ? hasNbpKey.value : customApiKey.value)
})
const canSave = computed(() => {
  return extractedData.value && characterName.value.trim()
})
</script>

<template>
  <div class="relative z-10 min-h-screen">
    <!-- Header -->
    <header class="sticky top-0 z-50 backdrop-blur-xl extractor-header border-b border-white/10">
      <div class="container mx-auto px-4 py-4 flex items-center justify-between">
        <button
          @click="goBack"
          class="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
          <span>{{ $t('characterExtractor.back') }}</span>
        </button>
        <h1 class="text-xl font-semibold text-white">{{ $t('characterExtractor.title') }}</h1>
        <div class="w-24"></div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="container mx-auto px-4 py-8">
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <!-- Left Column - Image & Settings -->
        <div class="space-y-6">
          <!-- Image Upload/Preview -->
          <div class="glass p-6">
            <h2 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {{ $t('characterExtractor.uploadImage') }}
            </h2>

            <!-- Image Preview or Upload Zone -->
            <div
              v-if="imagePreview"
              class="relative h-[40vh] rounded-xl overflow-hidden bg-black/30 border border-white/10 flex items-center justify-center"
            >
              <img
                :src="imagePreview"
                alt="Character preview"
                class="max-w-full max-h-full object-contain"
              />
              <button
                @click="triggerFileInput"
                class="absolute bottom-4 right-4 px-4 py-2 rounded-lg bg-black/60 backdrop-blur-sm text-white text-sm hover:bg-black/80 transition-colors flex items-center gap-2"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                {{ $t('common.change') }}
              </button>
            </div>
            <div
              v-else
              @dragover="handleDragOver"
              @dragleave="handleDragLeave"
              @drop="handleDrop"
              @click="triggerFileInput"
              class="aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all"
              :class="isDragging ? 'border-blue-500 bg-blue-500/10' : 'border-white/20 hover:border-blue-500/50 hover:bg-white/5'"
            >
              <div class="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center mb-4">
                <svg class="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p class="text-gray-300 text-center">{{ $t('characterExtractor.dragDrop') }}</p>
            </div>

            <input
              ref="fileInput"
              type="file"
              accept="image/*"
              class="hidden"
              @change="handleFileSelect"
            />
          </div>

          <!-- API Settings -->
          <div class="glass p-6">
            <h2 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {{ $t('characterExtractor.apiSettings') }}
            </h2>

            <!-- API Key Selection -->
            <div class="space-y-3">
              <label class="flex items-center gap-3 cursor-pointer group">
                <input
                  type="radio"
                  :value="true"
                  v-model="useNbpKey"
                  class="w-4 h-4 text-blue-500 bg-white/10 border-white/30 focus:ring-blue-500"
                />
                <span class="text-gray-300 group-hover:text-white transition-colors">
                  {{ $t('characterExtractor.useNbpKey') }}
                  <span v-if="!hasNbpKey" class="text-red-400 text-sm ml-2">({{ $t('errors.noApiKey') }})</span>
                </span>
              </label>

              <label class="flex items-center gap-3 cursor-pointer group">
                <input
                  type="radio"
                  :value="false"
                  v-model="useNbpKey"
                  class="w-4 h-4 text-blue-500 bg-white/10 border-white/30 focus:ring-blue-500"
                />
                <span class="text-gray-300 group-hover:text-white transition-colors">
                  {{ $t('characterExtractor.useAlternateKey') }}
                </span>
              </label>

              <!-- Custom API Key Input -->
              <div v-if="!useNbpKey" class="mt-3">
                <input
                  v-model="customApiKey"
                  type="password"
                  :placeholder="$t('characterExtractor.enterApiKey')"
                  class="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            <!-- Model Selection -->
            <div class="mt-6">
              <label class="block text-sm text-gray-400 mb-2">{{ $t('characterExtractor.model') }}</label>
              <select
                v-model="selectedModel"
                class="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500 transition-colors"
              >
                <option
                  v-for="model in EXTRACTION_MODELS"
                  :key="model.id"
                  :value="model.id"
                  class="bg-gray-900"
                >
                  {{ model.name }}
                </option>
              </select>
            </div>

            <!-- Extract Button -->
            <button
              @click="handleExtract"
              :disabled="!canExtract || isExtracting"
              class="mt-6 w-full py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
              :class="canExtract && !isExtracting
                ? 'bg-blue-500 hover:bg-blue-600 text-white'
                : 'bg-white/10 text-gray-500 cursor-not-allowed'"
            >
              <svg v-if="isExtracting" class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              {{ isExtracting ? $t('characterExtractor.extracting') : $t('characterExtractor.extract') }}
            </button>
          </div>
        </div>

        <!-- Right Column - Extraction Results -->
        <div class="space-y-6">
          <div class="glass p-6">
            <h2 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              {{ $t('characterExtractor.editResult') }}
            </h2>

            <!-- Empty State -->
            <div v-if="!extractedData" class="py-12 text-center">
              <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
                <svg class="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <p class="text-gray-500">{{ $t('characterExtractor.noImage') }}</p>
            </div>

            <!-- Extraction Result Form -->
            <div v-else class="space-y-5">
              <!-- Character Name -->
              <div>
                <label class="block text-sm text-gray-400 mb-2">{{ $t('characterExtractor.name') }} *</label>
                <input
                  v-model="characterName"
                  type="text"
                  :placeholder="$t('characterExtractor.namePlaceholder')"
                  class="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <!-- Description -->
              <div>
                <label class="block text-sm text-gray-400 mb-2">{{ $t('characterExtractor.description') }}</label>
                <textarea
                  v-model="extractedData.description"
                  rows="2"
                  class="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors resize-none"
                ></textarea>
              </div>

              <!-- Physical Traits -->
              <div>
                <label class="block text-sm text-gray-400 mb-3">{{ $t('characterExtractor.physicalTraits') }}</label>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs text-gray-500 mb-1">{{ $t('characterExtractor.hair') }}</label>
                    <input
                      v-model="extractedData.physicalTraits.hair"
                      type="text"
                      class="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label class="block text-xs text-gray-500 mb-1">{{ $t('characterExtractor.eyes') }}</label>
                    <input
                      v-model="extractedData.physicalTraits.eyes"
                      type="text"
                      class="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label class="block text-xs text-gray-500 mb-1">{{ $t('characterExtractor.face') }}</label>
                    <input
                      v-model="extractedData.physicalTraits.face"
                      type="text"
                      class="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label class="block text-xs text-gray-500 mb-1">{{ $t('characterExtractor.body') }}</label>
                    <input
                      v-model="extractedData.physicalTraits.body"
                      type="text"
                      class="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                  <div class="col-span-2">
                    <label class="block text-xs text-gray-500 mb-1">{{ $t('characterExtractor.skin') }}</label>
                    <input
                      v-model="extractedData.physicalTraits.skin"
                      type="text"
                      class="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                </div>
              </div>

              <!-- Clothing -->
              <div>
                <label class="block text-sm text-gray-400 mb-2">{{ $t('characterExtractor.clothing') }}</label>
                <textarea
                  v-model="extractedData.clothing"
                  rows="2"
                  class="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors resize-none"
                ></textarea>
              </div>

              <!-- Accessories -->
              <div>
                <label class="block text-sm text-gray-400 mb-2">{{ $t('characterExtractor.accessories') }}</label>
                <div class="flex flex-wrap gap-2 mb-2">
                  <span
                    v-for="(accessory, index) in extractedData.accessories"
                    :key="index"
                    class="accessory-tag inline-flex items-center gap-1 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-sm"
                  >
                    {{ accessory }}
                    <button @click="removeAccessory(index)" class="hover:text-white">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                </div>
                <div class="flex gap-2">
                  <input
                    v-model="newAccessory"
                    type="text"
                    :placeholder="$t('characterExtractor.addTag')"
                    class="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                    @keyup.enter="addAccessory"
                  />
                  <button
                    @click="addAccessory"
                    class="add-tag-btn px-3 py-2 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
                  >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </div>
              </div>

              <!-- Distinctive Features -->
              <div>
                <label class="block text-sm text-gray-400 mb-2">{{ $t('characterExtractor.distinctiveFeatures') }}</label>
                <div class="flex flex-wrap gap-2 mb-2">
                  <span
                    v-for="(feature, index) in extractedData.distinctiveFeatures"
                    :key="index"
                    class="feature-tag inline-flex items-center gap-1 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-sm"
                  >
                    {{ feature }}
                    <button @click="removeFeature(index)" class="hover:text-white">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                </div>
                <div class="flex gap-2">
                  <input
                    v-model="newFeature"
                    type="text"
                    :placeholder="$t('characterExtractor.addTag')"
                    class="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                    @keyup.enter="addFeature"
                  />
                  <button
                    @click="addFeature"
                    class="add-tag-btn px-3 py-2 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
                  >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </div>
              </div>

              <!-- Save Button -->
              <button
                @click="handleSave"
                :disabled="!canSave"
                class="save-btn w-full py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
                :class="canSave
                  ? 'bg-blue-500 hover:bg-blue-600 text-white'
                  : 'bg-white/10 text-gray-500 cursor-not-allowed'"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
                {{ $t('characterExtractor.save') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
/* Default header for dark mode */
.extractor-header {
  background: rgba(0, 0, 0, 0.3);
}

/* Light theme overrides */
[data-theme="light"] .extractor-header {
  background: rgba(255, 255, 255, 0.95) !important;
  border-color: rgba(13, 94, 175, 0.15) !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

/* Tags need dark text in light mode */
[data-theme="light"] .accessory-tag,
[data-theme="light"] .feature-tag {
  background: rgba(13, 94, 175, 0.12) !important;
  color: #1f2937 !important;
}

[data-theme="light"] .accessory-tag button,
[data-theme="light"] .feature-tag button {
  color: #4b5563 !important;
}

[data-theme="light"] .accessory-tag button:hover,
[data-theme="light"] .feature-tag button:hover {
  color: #1f2937 !important;
}

/* Add tag buttons in light mode */
[data-theme="light"] .add-tag-btn {
  background: rgba(13, 94, 175, 0.12) !important;
  color: #0D5EAF !important;
}

[data-theme="light"] .add-tag-btn:hover {
  background: rgba(13, 94, 175, 0.2) !important;
}

/* Save button in light mode */
[data-theme="light"] .save-btn.bg-blue-500 {
  background: #0D5EAF !important;
}

[data-theme="light"] .save-btn.bg-blue-500:hover {
  background: #0A4C8C !important;
}
</style>
