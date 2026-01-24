<script setup>
import { useData } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import { computed, defineAsyncComponent } from 'vue'

const { Layout: DefaultLayout } = DefaultTheme
const { frontmatter } = useData()

// Lazy load Three.js component only when needed
const HeroBanana = defineAsyncComponent(() => import('./HeroBanana.vue'))

// Check if current page is home page (zh-TW root or /en/)
const isHomePage = computed(() => {
  return frontmatter.value.layout === 'home'
})
</script>

<template>
  <DefaultLayout>
    <template v-if="isHomePage" #home-hero-image>
      <HeroBanana />
    </template>
  </DefaultLayout>
</template>
