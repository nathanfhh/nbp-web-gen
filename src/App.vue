<script setup>
import { onMounted } from 'vue'
import { useGeneratorStore } from '@/stores/generator'

// Global components (always loaded)
import ParticleBackground from '@/components/ParticleBackground.vue'
import ToastContainer from '@/components/ToastContainer.vue'

const store = useGeneratorStore()

onMounted(async () => {
  await store.initialize()
})
</script>

<template>
  <div class="min-h-screen">
    <!-- Toast Notifications -->
    <ToastContainer />

    <!-- Background Effects -->
    <div class="gradient-bg"></div>
    <ParticleBackground />

    <!-- Router View -->
    <RouterView />
  </div>
</template>
