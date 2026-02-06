import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify('0.0.0-test'),
    __BUILD_HASH__: JSON.stringify('test'),
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      exclude: [
        'src/**/*.test.js',
        'src/**/*.vue',
        'src/workers/**',
        'src/router/**',
        'src/i18n/**',
        'src/theme/**',
        'src/main.js',
        'src/assets/**',
      ],
    },
  },
})
