import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
  },
  {
    path: '/character-extractor',
    name: 'character-extractor',
    component: () => import('@/views/CharacterExtractorView.vue'),
  },
  {
    path: '/line-sticker-tool',
    name: 'line-sticker-tool',
    component: () => import('@/views/LineStickerToolView.vue'),
  },
]

// Get base URL safely - handle cases where BASE_URL might be undefined or string "undefined"
const getBaseUrl = () => {
  const base = import.meta.env.BASE_URL
  // Check for valid base: must be a string, not empty, not "undefined", and start with /
  if (typeof base === 'string' && base && base !== 'undefined' && base.startsWith('/')) {
    return base
  }
  return '/'
}

const router = createRouter({
  history: createWebHistory(getBaseUrl()),
  routes,
  scrollBehavior(to, from, savedPosition) {
    // If user navigates back/forward, restore saved position
    if (savedPosition) {
      return savedPosition
    }
    // Otherwise scroll to top
    return { top: 0 }
  },
})

export default router
