<template>
  <div class="hero-video-wrapper">
    <video
      ref="videoRef"
      class="hero-video"
      src="/hero-page-banner.webm"
      poster="/images/app-overview.webp"
      autoplay
      loop
      muted
      playsinline
    />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const videoRef = ref(null)
const FADE_DURATION = 0.6

let onTimeUpdate = null
let onSeeked = null

onMounted(() => {
  const video = videoRef.value
  if (!video) return

  onTimeUpdate = () => {
    const remaining = video.duration - video.currentTime
    if (remaining <= FADE_DURATION) {
      video.style.opacity = '0.5'
    }
  }

  onSeeked = () => {
    if (video.currentTime < 1) {
      requestAnimationFrame(() => {
        video.style.opacity = '1'
      })
    }
  }

  video.addEventListener('timeupdate', onTimeUpdate)
  video.addEventListener('seeked', onSeeked)
})

onUnmounted(() => {
  const video = videoRef.value
  if (!video) return
  if (onTimeUpdate) video.removeEventListener('timeupdate', onTimeUpdate)
  if (onSeeked) video.removeEventListener('seeked', onSeeked)
})
</script>

<style scoped>
.hero-video-wrapper {
  width: 100%;
  border-radius: 8px;
  overflow: hidden;
}
.hero-video {
  width: 100%;
  display: block;
  transition: opacity 0.6s ease-in-out;
}
</style>
