<script setup>
import { computed, watch, ref } from 'vue'
import { useGeneratorStore } from '@/stores/generator'
import { useVideoApi } from '@/composables/useVideoApi'
import {
  VEO_MODEL_OPTIONS,
  VIDEO_RESOLUTION_OPTIONS,
  VIDEO_RATIO_OPTIONS,
  VIDEO_SUB_MODE_OPTIONS,
  VIDEO_SUB_MODES,
  VIDEO_MODE_CONSTRAINTS,
  VIDEO_DURATION_OPTIONS,
  VIDEO_RESOLUTION_CONSTRAINTS,
} from '@/constants'

const store = useGeneratorStore()
const { calculateCostEstimate, getEffectiveOptions } = useVideoApi()

const options = store.videoOptions

// File input refs
const startFrameInput = ref(null)
const endFrameInput = ref(null)
const referenceImageInput = ref(null)

// Cost estimate (reactive)
const costEstimate = computed(() => calculateCostEstimate(options))

// Effective options with constraints applied
const effectiveOptions = computed(() => getEffectiveOptions(options))

// Check current sub-mode constraints
const currentConstraints = computed(() => VIDEO_MODE_CONSTRAINTS[options.subMode] || {})

// Check if options are locked
const isModelLocked = computed(() => !!currentConstraints.value.lockedModel)
const isResolutionLocked = computed(() => !!currentConstraints.value.lockedResolution)
const isRatioLocked = computed(() => !!currentConstraints.value.lockedRatio)

// Duration is locked if:
// 1. Sub-mode has lockedDuration (references-to-video, extend-video)
// 2. Resolution requires 8s (1080p, 4k)
const isDurationLocked = computed(() => {
  if (currentConstraints.value.lockedDuration) return true
  const resConstraints = VIDEO_RESOLUTION_CONSTRAINTS[effectiveOptions.value.resolution]
  return resConstraints?.lockedDuration !== undefined
})

// Get allowed duration options based on current resolution
const allowedDurations = computed(() => {
  const resConstraints = VIDEO_RESOLUTION_CONSTRAINTS[effectiveOptions.value.resolution]
  const allowed = resConstraints?.allowedDurations || [4, 6, 8]
  return VIDEO_DURATION_OPTIONS.filter((d) => allowed.includes(d.value))
})

// Handle sub-mode change - reset incompatible options
watch(
  () => options.subMode,
  (newSubMode) => {
    // Clear frames when switching away from frames-to-video
    if (newSubMode !== VIDEO_SUB_MODES.FRAMES_TO_VIDEO) {
      options.startFrame = null
      options.endFrame = null
      options.isLooping = false
    }
    // Clear references when switching away from references-to-video
    if (newSubMode !== VIDEO_SUB_MODES.REFERENCES_TO_VIDEO) {
      options.referenceImages = []
    }
    // Clear input video when switching away from extend-video
    if (newSubMode !== VIDEO_SUB_MODES.EXTEND_VIDEO) {
      options.inputVideo = null
    }
    // Auto-adjust duration if mode requires it
    const constraints = VIDEO_MODE_CONSTRAINTS[newSubMode] || {}
    if (constraints.lockedDuration) {
      options.duration = constraints.lockedDuration
    }
  }
)

// Handle resolution change - auto-adjust duration if needed
watch(
  () => options.resolution,
  (newResolution) => {
    const resConstraints = VIDEO_RESOLUTION_CONSTRAINTS[newResolution]
    if (resConstraints?.lockedDuration) {
      options.duration = resConstraints.lockedDuration
    } else if (resConstraints?.allowedDurations && !resConstraints.allowedDurations.includes(options.duration)) {
      // If current duration is not allowed, reset to max allowed
      options.duration = Math.max(...resConstraints.allowedDurations)
    }
  }
)

// File upload handlers
const handleFrameUpload = (event, frameType) => {
  const file = event.target.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (e) => {
    const base64 = e.target.result.split(',')[1]
    options[frameType] = {
      data: base64,
      mimeType: file.type,
      preview: e.target.result,
      name: file.name,
    }
  }
  reader.readAsDataURL(file)
  // Reset input
  event.target.value = ''
}

const handleReferenceUpload = (event) => {
  const file = event.target.files?.[0]
  if (!file) return

  const maxRefs = currentConstraints.value.maxReferenceImages || 3
  if (options.referenceImages.length >= maxRefs) return

  const reader = new FileReader()
  reader.onload = (e) => {
    const base64 = e.target.result.split(',')[1]
    options.referenceImages.push({
      data: base64,
      mimeType: file.type,
      preview: e.target.result,
      name: file.name,
      type: 'asset', // Default to asset, can be changed later
    })
  }
  reader.readAsDataURL(file)
  // Reset input
  event.target.value = ''
}

const removeFrame = (frameType) => {
  options[frameType] = null
  if (frameType === 'startFrame') {
    options.isLooping = false
  }
}

const removeReferenceImage = (index) => {
  options.referenceImages.splice(index, 1)
}

const toggleReferenceType = (index) => {
  const img = options.referenceImages[index]
  img.type = img.type === 'asset' ? 'style' : 'asset'
}

// Get video history for extend mode
const videoHistory = computed(() => {
  return store.history.filter(
    (h) => h.mode === 'video' && h.video?.opfsPath && h.options?.resolution === '720p'
  )
})

const selectInputVideo = (historyItem) => {
  options.inputVideo = {
    historyId: historyItem.id,
    uri: historyItem.video.uri,
    thumbnail: historyItem.video.thumbnail,
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Sub-mode Selector -->
    <div class="space-y-3">
      <label class="block text-sm font-medium text-text-secondary">{{
        $t('video.subMode.label')
      }}</label>
      <div class="grid grid-cols-2 gap-3">
        <button
          v-for="subMode in VIDEO_SUB_MODE_OPTIONS"
          :key="subMode.value"
          @click="options.subMode = subMode.value"
          class="py-3 px-4 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
          :class="
            options.subMode === subMode.value
              ? 'bg-mode-generate-muted border border-mode-generate text-mode-generate'
              : 'bg-bg-muted border border-transparent text-text-muted hover:bg-bg-interactive'
          "
        >
          <!-- Icons -->
          <svg
            v-if="subMode.icon === 'type'"
            class="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 6h16M4 12h16M4 18h7"
            />
          </svg>
          <svg
            v-else-if="subMode.icon === 'image'"
            class="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <svg
            v-else-if="subMode.icon === 'images'"
            class="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <svg
            v-else-if="subMode.icon === 'plus-circle'"
            class="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          {{ $t(`video.subMode.${subMode.value}`) }}
        </button>
      </div>
    </div>

    <!-- Mode Constraints Notice -->
    <div
      v-if="isModelLocked || isResolutionLocked || isRatioLocked || currentConstraints.lockedDuration"
      class="p-3 rounded-xl bg-status-warning/10 border border-status-warning/20"
    >
      <p class="text-sm text-status-warning">
        {{ $t('video.constraints.notice') }}
      </p>
      <ul class="text-xs text-status-warning/80 mt-1 list-disc list-inside">
        <li v-if="isModelLocked">
          {{ $t('video.constraints.model', { model: $t(`video.model.${effectiveOptions.model}`) }) }}
        </li>
        <li v-if="isResolutionLocked">
          {{ $t('video.constraints.resolution', { resolution: effectiveOptions.resolution }) }}
        </li>
        <li v-if="isRatioLocked">
          {{ $t('video.constraints.ratio', { ratio: effectiveOptions.ratio }) }}
        </li>
        <li v-if="currentConstraints.lockedDuration">
          {{ $t('video.constraints.duration', { duration: currentConstraints.lockedDuration }) }}
        </li>
      </ul>
    </div>

    <!-- Frames-to-Video: Frame Upload -->
    <div v-if="options.subMode === VIDEO_SUB_MODES.FRAMES_TO_VIDEO" class="space-y-4">
      <!-- Start Frame (Required) -->
      <div class="space-y-2">
        <label class="block text-sm font-medium text-text-secondary">
          {{ $t('video.frames.startFrame') }}
          <span class="text-status-error">*</span>
        </label>
        <div v-if="options.startFrame" class="relative inline-block">
          <img
            :src="options.startFrame.preview"
            class="w-32 h-20 object-cover rounded-lg border border-border-muted"
          />
          <button
            @click="removeFrame('startFrame')"
            class="absolute -top-2 -right-2 w-6 h-6 bg-status-error rounded-full text-white flex items-center justify-center hover:bg-status-error/80 transition-colors"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <label
          v-else
          class="flex items-center justify-center w-32 h-20 border-2 border-dashed border-border-muted rounded-lg cursor-pointer hover:border-mode-generate transition-colors"
        >
          <input
            ref="startFrameInput"
            type="file"
            accept="image/*"
            class="hidden"
            @change="(e) => handleFrameUpload(e, 'startFrame')"
          />
          <svg class="w-8 h-8 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 4v16m8-8H4"
            />
          </svg>
        </label>
      </div>

      <!-- End Frame (Optional) -->
      <div v-if="options.startFrame && !options.isLooping" class="space-y-2">
        <label class="block text-sm font-medium text-text-secondary">
          {{ $t('video.frames.endFrame') }}
          <span class="text-text-muted text-xs">({{ $t('common.optional') }})</span>
        </label>
        <div v-if="options.endFrame" class="relative inline-block">
          <img
            :src="options.endFrame.preview"
            class="w-32 h-20 object-cover rounded-lg border border-border-muted"
          />
          <button
            @click="removeFrame('endFrame')"
            class="absolute -top-2 -right-2 w-6 h-6 bg-status-error rounded-full text-white flex items-center justify-center hover:bg-status-error/80 transition-colors"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <label
          v-else
          class="flex items-center justify-center w-32 h-20 border-2 border-dashed border-border-muted rounded-lg cursor-pointer hover:border-mode-generate transition-colors"
        >
          <input
            ref="endFrameInput"
            type="file"
            accept="image/*"
            class="hidden"
            @change="(e) => handleFrameUpload(e, 'endFrame')"
          />
          <svg class="w-8 h-8 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 4v16m8-8H4"
            />
          </svg>
        </label>
      </div>

      <!-- Loop Toggle -->
      <div v-if="options.startFrame && !options.endFrame" class="flex items-center gap-2">
        <input
          type="checkbox"
          v-model="options.isLooping"
          id="isLooping"
          class="w-4 h-4 rounded border-border-muted accent-mode-generate"
        />
        <label for="isLooping" class="text-sm text-text-secondary cursor-pointer">
          {{ $t('video.frames.createLoop') }}
        </label>
      </div>
    </div>

    <!-- Text-to-Video: Hide the main ImageUploader (only prompt needed) -->
    <!-- Note: The main ImageUploader in HomeView is hidden when in video mode -->

    <!-- References-to-Video: Reference Images (max 3) -->
    <div v-if="options.subMode === VIDEO_SUB_MODES.REFERENCES_TO_VIDEO" class="space-y-4">
      <div class="space-y-2">
        <label class="block text-sm font-medium text-text-secondary">
          {{ $t('video.references.images') }}
          <span class="text-text-muted text-xs"
            >({{ options.referenceImages.length }}/{{
              currentConstraints.maxReferenceImages || 3
            }})</span
          >
        </label>
        <div class="flex flex-wrap gap-3">
          <!-- Existing reference images -->
          <div
            v-for="(img, index) in options.referenceImages"
            :key="index"
            class="relative group"
          >
            <img
              :src="img.preview"
              class="w-24 h-24 object-cover rounded-lg border border-border-muted"
            />
            <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
              <button
                @click="removeReferenceImage(index)"
                class="w-6 h-6 bg-status-error/80 rounded text-white hover:bg-status-error"
              >
                <svg class="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <!-- Clickable tag to toggle type -->
            <button
              @click="toggleReferenceType(index)"
              class="absolute bottom-1 left-1 px-1.5 py-0.5 rounded text-xs font-medium cursor-pointer transition-colors"
              :class="
                img.type === 'asset'
                  ? 'bg-brand-primary text-text-on-brand hover:bg-brand-primary-light'
                  : 'bg-status-warning text-black hover:bg-status-warning/80'
              "
            >
              {{ img.type === 'asset' ? $t('video.references.asset') : $t('video.references.style') }}
            </button>
          </div>
          <!-- Add button -->
          <label
            v-if="options.referenceImages.length < (currentConstraints.maxReferenceImages || 3)"
            class="flex items-center justify-center w-24 h-24 border-2 border-dashed border-border-muted rounded-lg cursor-pointer hover:border-mode-generate transition-colors"
          >
            <input
              ref="referenceImageInput"
              type="file"
              accept="image/*"
              class="hidden"
              @change="handleReferenceUpload"
            />
            <svg
              class="w-6 h-6 text-text-muted"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 4v16m8-8H4"
              />
            </svg>
          </label>
        </div>
        <p v-if="options.referenceImages.length > 0" class="text-xs text-text-muted">
          {{ $t('video.references.hint') }}
        </p>
      </div>
    </div>

    <!-- Extend-Video: Select Input Video -->
    <div v-if="options.subMode === VIDEO_SUB_MODES.EXTEND_VIDEO" class="space-y-4">
      <div class="space-y-2">
        <label class="block text-sm font-medium text-text-secondary">
          {{ $t('video.extend.selectVideo') }}
          <span class="text-status-error">*</span>
        </label>
        <div v-if="options.inputVideo" class="relative inline-block">
          <img
            v-if="options.inputVideo.thumbnail"
            :src="options.inputVideo.thumbnail"
            class="w-32 h-20 object-cover rounded-lg border border-mode-generate"
          />
          <div
            v-else
            class="w-32 h-20 bg-bg-muted rounded-lg border border-mode-generate flex items-center justify-center"
          >
            <svg
              class="w-8 h-8 text-mode-generate"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
              />
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <button
            @click="options.inputVideo = null"
            class="absolute -top-2 -right-2 w-6 h-6 bg-status-error rounded-full text-white flex items-center justify-center hover:bg-status-error/80 transition-colors"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div v-else-if="videoHistory.length > 0" class="flex flex-wrap gap-2">
          <button
            v-for="item in videoHistory.slice(0, 6)"
            :key="item.id"
            @click="selectInputVideo(item)"
            class="relative w-20 h-14 rounded-lg overflow-hidden border-2 border-transparent hover:border-mode-generate transition-colors"
          >
            <img
              v-if="item.video?.thumbnail"
              :src="item.video.thumbnail"
              class="w-full h-full object-cover"
            />
            <div
              v-else
              class="w-full h-full bg-bg-muted flex items-center justify-center"
            >
              <svg
                class="w-6 h-6 text-text-muted"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                />
              </svg>
            </div>
          </button>
        </div>
        <p v-else class="text-sm text-text-muted">
          {{ $t('video.extend.noVideos') }}
        </p>
      </div>
    </div>

    <!-- Model Selection -->
    <div class="space-y-3">
      <label class="block text-sm font-medium text-text-secondary">{{
        $t('video.model.label')
      }}</label>
      <div class="grid grid-cols-2 gap-3">
        <button
          v-for="model in VEO_MODEL_OPTIONS"
          :key="model.value"
          @click="!isModelLocked && (options.model = model.value)"
          :disabled="isModelLocked"
          class="py-3 px-4 rounded-xl text-sm font-medium transition-all"
          :class="[
            effectiveOptions.model === model.value
              ? 'bg-mode-generate-muted border border-mode-generate text-mode-generate'
              : 'bg-bg-muted border border-transparent text-text-muted hover:bg-bg-interactive',
            isModelLocked && 'opacity-50 cursor-not-allowed',
          ]"
        >
          {{ $t(`video.model.${model.value}`) }}
        </button>
      </div>
    </div>

    <!-- Duration -->
    <div class="space-y-3">
      <label class="block text-sm font-medium text-text-secondary">{{
        $t('video.duration.label')
      }}</label>
      <div class="grid grid-cols-3 gap-3">
        <button
          v-for="dur in VIDEO_DURATION_OPTIONS"
          :key="dur.value"
          @click="!isDurationLocked && (options.duration = dur.value)"
          :disabled="isDurationLocked || !allowedDurations.some((d) => d.value === dur.value)"
          class="py-3 px-4 rounded-xl text-sm font-medium transition-all"
          :class="[
            effectiveOptions.duration === dur.value
              ? 'bg-mode-generate-muted border border-mode-generate text-mode-generate'
              : 'bg-bg-muted border border-transparent text-text-muted hover:bg-bg-interactive',
            (isDurationLocked || !allowedDurations.some((d) => d.value === dur.value)) && 'opacity-50 cursor-not-allowed',
          ]"
        >
          {{ dur.label }}
        </button>
      </div>
      <p v-if="isDurationLocked" class="text-xs text-text-muted">
        {{ $t('video.duration.lockedHint') }}
      </p>
    </div>

    <!-- Resolution -->
    <div class="space-y-3">
      <label class="block text-sm font-medium text-text-secondary">{{
        $t('options.resolution')
      }}</label>
      <div class="grid grid-cols-3 gap-3">
        <button
          v-for="res in VIDEO_RESOLUTION_OPTIONS"
          :key="res.value"
          @click="!isResolutionLocked && (options.resolution = res.value)"
          :disabled="isResolutionLocked"
          class="py-3 px-4 rounded-xl text-sm font-medium transition-all"
          :class="[
            effectiveOptions.resolution === res.value
              ? 'bg-mode-generate-muted border border-mode-generate text-mode-generate'
              : 'bg-bg-muted border border-transparent text-text-muted hover:bg-bg-interactive',
            isResolutionLocked && 'opacity-50 cursor-not-allowed',
          ]"
        >
          {{ res.label }}
        </button>
      </div>
    </div>

    <!-- Aspect Ratio -->
    <div class="space-y-3">
      <label class="block text-sm font-medium text-text-secondary">{{
        $t('options.aspectRatio')
      }}</label>
      <div class="grid grid-cols-2 gap-3">
        <button
          v-for="ratio in VIDEO_RATIO_OPTIONS"
          :key="ratio.value"
          @click="!isRatioLocked && (options.ratio = ratio.value)"
          :disabled="isRatioLocked"
          class="py-3 px-4 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
          :class="[
            effectiveOptions.ratio === ratio.value
              ? 'bg-mode-generate-muted border border-mode-generate text-mode-generate'
              : 'bg-bg-muted border border-transparent text-text-muted hover:bg-bg-interactive',
            isRatioLocked && 'opacity-50 cursor-not-allowed',
          ]"
        >
          <!-- Ratio icons -->
          <svg
            v-if="ratio.value === '16:9'"
            class="w-5 h-3"
            viewBox="0 0 16 9"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <rect x="1" y="1" width="14" height="7" rx="1" />
          </svg>
          <svg
            v-else
            class="w-2.5 h-4"
            viewBox="0 0 9 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <rect x="1" y="1" width="7" height="14" rx="1" />
          </svg>
          {{ ratio.label }}
        </button>
      </div>
    </div>

    <!-- Cost Estimate -->
    <div class="p-4 rounded-xl bg-bg-muted border border-border-muted">
      <div class="flex items-center justify-between">
        <span class="text-sm text-text-secondary">{{ $t('video.cost.estimate') }}</span>
        <span class="text-lg font-semibold text-mode-generate">
          {{ costEstimate.formatted }}
          <span class="text-xs font-normal text-text-muted ml-1">USD</span>
        </span>
      </div>
      <p class="text-xs text-text-muted mt-1">
        ${{ costEstimate.pricePerSecond.toFixed(2) }}/{{ $t('video.cost.second') }} x
        {{ costEstimate.duration }}s
      </p>
    </div>
  </div>
</template>
