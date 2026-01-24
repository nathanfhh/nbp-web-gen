import DefaultTheme from 'vitepress/theme'
import Layout from './Layout.vue'
import TryItButton from './TryItButton.vue'
import mediumZoom from 'medium-zoom'
import { onMounted, watch, nextTick } from 'vue'
import { useRoute } from 'vitepress'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    // Register global components
    app.component('TryItButton', TryItButton)
  },
  setup() {
    const route = useRoute()
    const initZoom = () => {
      // Target images in the main content area
      mediumZoom('.vp-doc img', { background: 'var(--vp-c-bg)' })
    }
    onMounted(() => initZoom())
    watch(
      () => route.path,
      () => nextTick(() => initZoom())
    )
  },
}
