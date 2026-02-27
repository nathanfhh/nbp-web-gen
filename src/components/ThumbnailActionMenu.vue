<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps({
  // Position of the trigger element (for menu placement)
  triggerRect: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['edit', 'download', 'delete', 'close'])

const menuRef = ref(null)

// Calculate menu position to avoid overflow
const menuStyle = computed(() => {
  if (!props.triggerRect) return {}

  const { top, left, width, height } = props.triggerRect
  const menuWidth = 120
  const menuHeight = 140
  const padding = 8

  // Calculate initial position (centered below the thumbnail)
  let menuLeft = left + width / 2 - menuWidth / 2
  let menuTop = top + height + padding

  // Adjust if menu would overflow right edge
  if (menuLeft + menuWidth > window.innerWidth - padding) {
    menuLeft = window.innerWidth - menuWidth - padding
  }

  // Adjust if menu would overflow left edge
  if (menuLeft < padding) {
    menuLeft = padding
  }

  // Adjust if menu would overflow bottom edge - show above instead
  if (menuTop + menuHeight > window.innerHeight - padding) {
    menuTop = top - menuHeight - padding
  }

  // Adjust if menu would overflow top edge
  if (menuTop < padding) {
    menuTop = padding
  }

  return {
    position: 'fixed',
    top: `${menuTop}px`,
    left: `${menuLeft}px`,
    zIndex: 10010,
  }
})

// Handle click outside to close
const handleClickOutside = (e) => {
  if (menuRef.value && !menuRef.value.contains(e.target)) {
    emit('close')
  }
}

// Handle escape key
const handleKeyDown = (e) => {
  if (e.key === 'Escape') {
    emit('close')
  }
}

onMounted(async () => {
  await nextTick()
  document.addEventListener('click', handleClickOutside, true)
  document.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside, true)
  document.removeEventListener('keydown', handleKeyDown)
})

const handleEdit = () => {
  emit('edit')
  emit('close')
}

const handleDownload = () => {
  emit('download')
  emit('close')
}

const handleDelete = () => {
  emit('delete')
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div
      ref="menuRef"
      :style="menuStyle"
      class="min-w-[120px] py-1.5 rounded-xl glass-strong shadow-lg border border-border-muted"
    >
      <!-- Edit button -->
      <button
        @click="handleEdit"
        class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-text-secondary hover:bg-bg-interactive transition-colors"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
        <span>{{ t('common.edit') }}</span>
      </button>

      <!-- Download button -->
      <button
        @click="handleDownload"
        class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-text-secondary hover:bg-bg-interactive transition-colors"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        <span>{{ t('common.download') }}</span>
      </button>

      <!-- Divider -->
      <div class="my-1 border-t border-border-muted"></div>

      <!-- Delete button -->
      <button
        @click="handleDelete"
        class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-status-error hover:bg-status-error-subtle transition-colors"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        <span>{{ t('common.delete') }}</span>
      </button>
    </div>
  </Teleport>
</template>
