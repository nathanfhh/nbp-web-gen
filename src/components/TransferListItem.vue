<script setup>
defineProps({
  selected: {
    type: Boolean,
    required: true,
  },
  thumbnailSrc: {
    type: String,
    default: null,
  },
  thumbnailSize: {
    type: String,
    default: 'w-10 h-10', // 'w-10 h-10' for history, 'w-12 h-12' for character
  },
  canPreview: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['toggle', 'preview'])
</script>

<template>
  <div
    @click="emit('toggle')"
    :class="[
      'flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all',
      selected
        ? 'bg-mode-generate-muted border border-mode-generate'
        : 'bg-bg-muted border border-transparent hover:bg-bg-interactive'
    ]"
  >
    <!-- Checkbox -->
    <div
      :class="[
        'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all',
        selected ? 'bg-brand-primary border-mode-generate' : 'border-border-muted'
      ]"
    >
      <svg
        v-if="selected"
        class="w-3 h-3 text-text-primary"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
      </svg>
    </div>

    <!-- Thumbnail -->
    <div
      @click.stop="canPreview && emit('preview', $event)"
      :class="[
        thumbnailSize,
        'rounded-lg bg-bg-muted flex-shrink-0 overflow-hidden transition-all',
        canPreview && 'cursor-zoom-in hover:ring-2 hover:ring-blue-400'
      ]"
    >
      <img
        v-if="thumbnailSrc"
        :src="thumbnailSrc"
        class="w-full h-full object-cover"
        alt=""
      />
      <div v-else class="w-full h-full flex items-center justify-center">
        <slot name="placeholder">
          <svg class="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </slot>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 min-w-0">
      <slot name="content"></slot>
    </div>

    <!-- Extra -->
    <slot name="extra"></slot>
  </div>
</template>
