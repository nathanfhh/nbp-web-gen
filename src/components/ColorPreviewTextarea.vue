<script setup>
import { ref, computed, watch, nextTick } from 'vue'

const props = defineProps({
  modelValue: {
    type: String,
    default: '',
  },
  placeholder: {
    type: String,
    default: '',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  rows: {
    type: [Number, String],
    default: 4,
  },
})

const emit = defineEmits(['update:modelValue'])

const textareaRef = ref(null)
const renderLayerRef = ref(null)

// Sync scroll between textarea and render layer
const syncScroll = () => {
  if (textareaRef.value && renderLayerRef.value) {
    renderLayerRef.value.scrollTop = textareaRef.value.scrollTop
    renderLayerRef.value.scrollLeft = textareaRef.value.scrollLeft
  }
}

// Handle input and emit update
const handleInput = (event) => {
  emit('update:modelValue', event.target.value)
}

// Escape HTML to prevent XSS
const escapeHtml = (text) => {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// Convert text to HTML with color highlights (underline approach - no layout shift)
const highlightedHtml = computed(() => {
  if (!props.modelValue) return ''

  // Escape HTML first for safety
  const escaped = escapeHtml(props.modelValue)

  // Replace hex colors with colored underline indicator
  // Match #RGB, #RGBA, #RRGGBB, #RRGGBBAA
  const hexPattern = /#([0-9A-Fa-f]{3,4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})\b/g

  return escaped.replace(hexPattern, (match) => {
    // Use a thick colored underline to indicate the color - no extra width added
    return `<span class="color-highlight" style="--highlight-color: ${match}">${match}</span>`
  })
})

// Watch for external changes and sync scroll
watch(
  () => props.modelValue,
  () => {
    nextTick(syncScroll)
  },
)
</script>

<template>
  <div class="color-preview-textarea-container">
    <!-- Render layer (behind textarea) -->
    <div
      ref="renderLayerRef"
      class="render-layer"
      v-html="highlightedHtml"
    />
    <!-- Editable textarea (transparent, on top) -->
    <textarea
      ref="textareaRef"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :rows="rows"
      class="edit-layer input-premium text-sm resize-y"
      @input="handleInput"
      @scroll="syncScroll"
    />
  </div>
</template>

<style scoped>
.color-preview-textarea-container {
  position: relative;
  width: 100%;
}

.render-layer {
  position: absolute;
  inset: 0;
  padding: 12px 14px; /* Match input-premium padding */
  font-family: inherit;
  font-size: 0.875rem; /* text-sm */
  line-height: 1.5;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow: hidden;
  pointer-events: none;
  color: transparent; /* Hide text, only show swatches */
  border: 1px solid transparent;
  border-radius: 12px; /* Match input-premium */
}

.edit-layer {
  position: relative;
  width: 100%;
  background: transparent !important;
  caret-color: var(--color-text-primary);
}

/* Color highlight styling - underline approach for zero layout shift */
:deep(.color-highlight) {
  display: inline;
  border-bottom: 3px solid var(--highlight-color);
  padding-bottom: 1px;
}
</style>
