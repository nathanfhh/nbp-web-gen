import { createRouter, createWebHistory } from 'vue-router'
import { routeSeoMeta } from './seo-meta'

/**
 * Route definitions
 * SEO meta tags are defined in ./seo-meta.js (shared with scripts/postbuild.js)
 */
const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
    meta: routeSeoMeta['/'],
  },
  {
    path: '/character-extractor',
    name: 'character-extractor',
    component: () => import('@/views/CharacterExtractorView.vue'),
    meta: routeSeoMeta['/character-extractor'],
  },
  {
    path: '/line-sticker-tool',
    name: 'line-sticker-tool',
    component: () => import('@/views/LineStickerToolView.vue'),
    meta: routeSeoMeta['/line-sticker-tool'],
  },
  {
    path: '/slide-to-pptx',
    name: 'slide-to-pptx',
    component: () => import('@/views/SlideToPptxView.vue'),
    meta: routeSeoMeta['/slide-to-pptx'],
  },
  {
    path: '/sticker-grid-cutter',
    name: 'sticker-grid-cutter',
    component: () => import('@/views/GridCutterView.vue'),
    meta: routeSeoMeta['/sticker-grid-cutter'],
  },
  // Catch-all: redirect unknown routes to home (no meta needed)
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
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
