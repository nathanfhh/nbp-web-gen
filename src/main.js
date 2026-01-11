import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createGtag } from 'vue-gtag'

import App from './App.vue'
import router from './router'
import i18n from './i18n'
import { initTheme } from './theme'
import './style.css'

// Initialize theme system before mounting (prevents flash)
initTheme()

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(i18n)

// Google Analytics 4 via vue-gtag - only in production
// GA's gtag.js wraps History API and causes bugs with vue-router in development
if (import.meta.env.PROD) {
  app.use(createGtag({
    tagId: 'G-3SX3YT6Y5J',
    pageTracker: {
      router,
    },
  }))
}

app.mount('#app')
