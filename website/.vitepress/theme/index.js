import DefaultTheme from 'vitepress/theme'
import TryItButton from './TryItButton.vue'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    // Register global components
    app.component('TryItButton', TryItButton)
  },
}
