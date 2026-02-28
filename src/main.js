import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import i18n from './i18n'
import { initTheme } from './theme'
import './style.css'

// Eruda mobile console — lazy load only when ?debug=1
if (new URLSearchParams(window.location.search).has('debug')) {
  import('https://cdn.jsdelivr.net/npm/eruda@3.4.3/eruda.min.js').then(() => {
    window.eruda.init()
  })
}

// Initialize theme system before mounting (prevents flash)
initTheme()

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(i18n)

app.mount('#app')
