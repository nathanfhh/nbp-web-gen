<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useIndexedDB } from '@/composables/useIndexedDB'
import { useLocalStorage } from '@/composables/useLocalStorage'
import { useApiKeyManager } from '@/composables/useApiKeyManager'
import { useCharacterExtraction, EXTRACTION_MODELS } from '@/composables/useCharacterExtraction'
import { useCharacterStorage } from '@/composables/useCharacterStorage'
import { useToast } from '@/composables/useToast'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()
const toast = useToast()
const { addCharacter, getCharacterById, updateCharacter } = useIndexedDB()
const { getQuickSetting, updateQuickSetting } = useLocalStorage()
const { hasApiKeyFor } = useApiKeyManager()
const { isExtracting, extractCharacter, generateThumbnail } = useCharacterExtraction()
const { saveCharacterImage, loadCharacterImageWithFallback } = useCharacterStorage()

// Editing state
const editingCharacterId = ref(null)
const isEditMode = computed(() => !!editingCharacterId.value)

// Image state
const imageData = ref(null)
const imagePreview = ref(null)
const imageMimeType = ref('image/png')
const fileInput = ref(null)
const isDragging = ref(false)

// Model settings (persisted via useLocalStorage)
const selectedModel = ref(getQuickSetting('extractionModel', EXTRACTION_MODELS[0].id))

// Save settings when changed
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

          // Load imageData from OPFS with fallback to legacy IndexedDB data
          imageData.value = await loadCharacterImageWithFallback(characterId, character.imageData)
          // Use full-resolution image for preview, not thumbnail
          imagePreview.value = imageData.value ? `data:image/png;base64,${imageData.value}` : null
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

    // Metadata only - imageData stored in OPFS, NOT in IndexedDB
    const characterMetadata = {
      name: characterName.value.trim(),
      ...extractedData.value,
      thumbnail,
      // Do NOT include imageData - it goes to OPFS
    }

    if (isEditMode.value) {
      // Update existing character metadata
      await updateCharacter(editingCharacterId.value, characterMetadata)
      // Save imageData to OPFS
      await saveCharacterImage(editingCharacterId.value, imageData.value, imageMimeType.value)
      toast.success(t('characterExtractor.updateSuccess'))
    } else {
      // Create new character (get the new ID)
      const newCharacterId = await addCharacter(characterMetadata)
      // Save imageData to OPFS using the new ID
      await saveCharacterImage(newCharacterId, imageData.value, imageMimeType.value)
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

// Check if any API key is available for text processing
const hasAnyApiKey = computed(() => hasApiKeyFor('text'))
const canExtract = computed(() => {
  return imageData.value && hasAnyApiKey.value
})
const canSave = computed(() => {
  return extractedData.value && characterName.value.trim()
})
</script>

<template>
  <div class="relative z-10 min-h-screen">
    <!-- Header -->
    <header class="sticky top-0 z-50 backdrop-blur-xl bg-glass-bg-strong border-b border-border-subtle shadow-card">
      <div class="container mx-auto px-4 py-4 flex items-center justify-between">
        <button
          @click="goBack"
          class="flex items-center gap-2 text-text-muted hover:text-text-primary transition-colors"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
          <span>{{ $t('characterExtractor.back') }}</span>
        </button>
        <h1 class="text-xl font-semibold text-text-primary">{{ $t('characterExtractor.title') }}</h1>
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
            <h2 class="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
              <svg class="w-5 h-5 text-mode-generate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {{ $t('characterExtractor.uploadImage') }}
            </h2>

            <!-- Image Preview or Upload Zone -->
            <div
              v-if="imagePreview"
              class="relative h-[40vh] rounded-xl overflow-hidden bg-bg-muted border border-border-muted flex items-center justify-center"
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
              :class="isDragging ? 'border-mode-generate bg-mode-generate-muted' : 'border-border-default hover:border-mode-generate hover:bg-bg-interactive'"
            >
              <div class="w-16 h-16 rounded-full bg-mode-generate-muted flex items-center justify-center mb-4">
                <svg class="w-8 h-8 text-mode-generate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p class="text-text-secondary text-center">{{ $t('characterExtractor.dragDrop') }}</p>
            </div>

            <input
              ref="fileInput"
              type="file"
              accept="image/*"
              class="hidden"
              @change="handleFileSelect"
            />
          </div>

          <!-- Extraction Settings -->
          <div class="glass p-6">
            <h2 class="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
              <svg class="w-5 h-5 text-mode-generate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {{ $t('characterExtractor.extractionSettings') }}
            </h2>

            <!-- API Key Warning -->
            <div v-if="!hasAnyApiKey" class="mb-4 p-3 rounded-lg bg-status-warning/10 border border-status-warning/30">
              <p class="text-sm text-status-warning">
                {{ $t('characterExtractor.noApiKeyWarning') }}
              </p>
            </div>

            <!-- Model Selection -->
            <div>
              <label class="block text-sm text-text-muted mb-2">{{ $t('characterExtractor.model') }}</label>
              <select
                v-model="selectedModel"
                class="w-full px-4 py-3 rounded-xl bg-bg-muted border border-border-muted text-text-primary focus:outline-none focus:border-brand-primary transition-colors"
              >
                <option
                  v-for="model in EXTRACTION_MODELS"
                  :key="model.id"
                  :value="model.id"
                  class="bg-bg-elevated"
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
                ? 'bg-brand-primary hover:bg-brand-primary-hover text-text-on-brand'
                : 'bg-bg-interactive text-text-muted cursor-not-allowed'"
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
            <h2 class="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
              <svg class="w-5 h-5 text-mode-generate" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              {{ $t('characterExtractor.editResult') }}
            </h2>

            <!-- Empty State -->
            <div v-if="!extractedData" class="py-12 text-center">
              <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-bg-muted flex items-center justify-center">
                <svg class="w-8 h-8 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <p class="text-text-muted">{{ $t('characterExtractor.noImage') }}</p>
            </div>

            <!-- Extraction Result Form -->
            <div v-else class="space-y-5">
              <!-- Character Name -->
              <div>
                <label class="block text-sm text-text-muted mb-2">{{ $t('characterExtractor.name') }} *</label>
                <input
                  v-model="characterName"
                  type="text"
                  :placeholder="$t('characterExtractor.namePlaceholder')"
                  class="w-full px-4 py-3 rounded-xl bg-bg-muted border border-border-muted text-text-primary placeholder-gray-500 focus:outline-none focus:border-brand-primary transition-colors"
                />
              </div>

              <!-- Description -->
              <div>
                <label class="block text-sm text-text-muted mb-2">{{ $t('characterExtractor.description') }}</label>
                <textarea
                  v-model="extractedData.description"
                  rows="2"
                  class="w-full px-4 py-3 rounded-xl bg-bg-muted border border-border-muted text-text-primary placeholder-gray-500 focus:outline-none focus:border-brand-primary transition-colors resize-none"
                ></textarea>
              </div>

              <!-- Physical Traits -->
              <div>
                <label class="block text-sm text-text-muted mb-3">{{ $t('characterExtractor.physicalTraits') }}</label>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs text-text-muted mb-1">{{ $t('characterExtractor.hair') }}</label>
                    <input
                      v-model="extractedData.physicalTraits.hair"
                      type="text"
                      class="w-full px-3 py-2 rounded-lg bg-bg-muted border border-border-muted text-text-primary text-sm focus:outline-none focus:border-brand-primary transition-colors"
                    />
                  </div>
                  <div>
                    <label class="block text-xs text-text-muted mb-1">{{ $t('characterExtractor.eyes') }}</label>
                    <input
                      v-model="extractedData.physicalTraits.eyes"
                      type="text"
                      class="w-full px-3 py-2 rounded-lg bg-bg-muted border border-border-muted text-text-primary text-sm focus:outline-none focus:border-brand-primary transition-colors"
                    />
                  </div>
                  <div>
                    <label class="block text-xs text-text-muted mb-1">{{ $t('characterExtractor.face') }}</label>
                    <input
                      v-model="extractedData.physicalTraits.face"
                      type="text"
                      class="w-full px-3 py-2 rounded-lg bg-bg-muted border border-border-muted text-text-primary text-sm focus:outline-none focus:border-brand-primary transition-colors"
                    />
                  </div>
                  <div>
                    <label class="block text-xs text-text-muted mb-1">{{ $t('characterExtractor.body') }}</label>
                    <input
                      v-model="extractedData.physicalTraits.body"
                      type="text"
                      class="w-full px-3 py-2 rounded-lg bg-bg-muted border border-border-muted text-text-primary text-sm focus:outline-none focus:border-brand-primary transition-colors"
                    />
                  </div>
                  <div class="col-span-2">
                    <label class="block text-xs text-text-muted mb-1">{{ $t('characterExtractor.skin') }}</label>
                    <input
                      v-model="extractedData.physicalTraits.skin"
                      type="text"
                      class="w-full px-3 py-2 rounded-lg bg-bg-muted border border-border-muted text-text-primary text-sm focus:outline-none focus:border-brand-primary transition-colors"
                    />
                  </div>
                </div>
              </div>

              <!-- Clothing -->
              <div>
                <label class="block text-sm text-text-muted mb-2">{{ $t('characterExtractor.clothing') }}</label>
                <textarea
                  v-model="extractedData.clothing"
                  rows="2"
                  class="w-full px-4 py-3 rounded-xl bg-bg-muted border border-border-muted text-text-primary placeholder-gray-500 focus:outline-none focus:border-brand-primary transition-colors resize-none"
                ></textarea>
              </div>

              <!-- Accessories -->
              <div>
                <label class="block text-sm text-text-muted mb-2">{{ $t('characterExtractor.accessories') }}</label>
                <div class="flex flex-wrap gap-2 mb-2">
                  <span
                    v-for="(accessory, index) in extractedData.accessories"
                    :key="index"
                    class="accessory-tag inline-flex items-center gap-1 px-3 py-1 rounded-full bg-mode-generate-muted text-mode-generate text-sm"
                  >
                    {{ accessory }}
                    <button @click="removeAccessory(index)" class="hover:text-text-primary">
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
                    class="flex-1 px-3 py-2 rounded-lg bg-bg-muted border border-border-muted text-text-primary text-sm focus:outline-none focus:border-brand-primary transition-colors"
                    @keyup.enter="addAccessory"
                  />
                  <button
                    @click="addAccessory"
                    class="add-tag-btn px-3 py-2 rounded-lg bg-mode-generate-muted text-mode-generate hover:bg-mode-generate-muted transition-colors"
                  >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </div>
              </div>

              <!-- Distinctive Features -->
              <div>
                <label class="block text-sm text-text-muted mb-2">{{ $t('characterExtractor.distinctiveFeatures') }}</label>
                <div class="flex flex-wrap gap-2 mb-2">
                  <span
                    v-for="(feature, index) in extractedData.distinctiveFeatures"
                    :key="index"
                    class="feature-tag inline-flex items-center gap-1 px-3 py-1 rounded-full bg-mode-generate-muted text-mode-generate text-sm"
                  >
                    {{ feature }}
                    <button @click="removeFeature(index)" class="hover:text-text-primary">
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
                    class="flex-1 px-3 py-2 rounded-lg bg-bg-muted border border-border-muted text-text-primary text-sm focus:outline-none focus:border-brand-primary transition-colors"
                    @keyup.enter="addFeature"
                  />
                  <button
                    @click="addFeature"
                    class="add-tag-btn px-3 py-2 rounded-lg bg-mode-generate-muted text-mode-generate hover:bg-mode-generate-muted transition-colors"
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
                  ? 'bg-brand-primary hover:bg-brand-primary-hover text-text-on-brand'
                  : 'bg-bg-interactive text-text-muted cursor-not-allowed'"
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

