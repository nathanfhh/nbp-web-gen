<script setup>
defineProps({
  sticker: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(['close'])

const close = () => {
  emit('close')
}
</script>

<template>
  <Transition name="fade">
    <div v-if="sticker" class="sticker-lightbox" @click="close">
      <div class="sticker-lightbox-content" @click.stop>
        <button @click="close" class="sticker-lightbox-close">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div class="sticker-lightbox-img-wrap">
          <img :src="sticker.previewDataUrl" :alt="`Sticker ${sticker.id + 1}`" class="sticker-lightbox-img" />
        </div>
        <div class="sticker-lightbox-info">
          <span class="text-sm text-text-muted">{{ sticker.width }} x {{ sticker.height }}</span>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.sticker-lightbox {
  position: fixed;
  inset: 0;
  z-index: 10002;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(10, 10, 15, 0.95);
  backdrop-filter: blur(8px);
}

/* Force semantic text colors to be light in lightbox (overlay is always dark) */
.sticker-lightbox .text-text-primary {
  color: #f1f5f9 !important;
}

.sticker-lightbox .text-text-secondary {
  color: #cbd5e1 !important;
}

.sticker-lightbox .text-text-muted {
  color: #94a3b8 !important;
}

.sticker-lightbox-content {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 90vw;
  max-height: 90vh;
}

.sticker-lightbox-close {
  position: absolute;
  top: -3rem;
  right: 0;
  padding: 0.5rem;
  color: #9ca3af;
  transition: color 0.2s;
}

.sticker-lightbox-close:hover {
  color: white;
}

.sticker-lightbox-img-wrap {
  background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><rect fill="%231a1a1f" width="20" height="20"/><rect fill="%23252530" width="10" height="10"/><rect fill="%23252530" x="10" y="10" width="10" height="10"/></svg>');
  border-radius: 0.5rem;
  overflow: hidden;
  padding: 1rem;
}

.sticker-lightbox-img {
  max-width: 80vw;
  max-height: 70vh;
  object-fit: contain;
}

.sticker-lightbox-info {
  margin-top: 1rem;
  text-align: center;
}

/* Fade transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
