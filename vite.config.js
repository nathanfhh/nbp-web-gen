import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { visualizer } from 'rollup-plugin-visualizer'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

// Get git commit hash for build tracking
const getBuildHash = () => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'dev'
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/nbp-web-gen/' : '/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_HASH__: JSON.stringify(getBuildHash()),
  },
  plugins: [
    // Replace %APP_VERSION% in index.html with actual version
    {
      name: 'html-transform',
      transformIndexHtml(html) {
        return html.replace(/%APP_VERSION%/g, pkg.version)
      },
    },
    vue(),
    vueDevTools(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['banana.webp', 'nbp-title.webp'],
      manifest: {
        name: 'Mediator - AI Image & Video Generator',
        short_name: 'Mediator',
        description: 'Media + Creator = Mediator. AI-powered image & video generation with Gemini & Veo 3.1',
        theme_color: '#111827',
        background_color: '#1f2937',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
        skipWaiting: true,      // 新 SW 立即激活，不等待
        clientsClaim: true,     // 立即接管所有頁面
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  optimizeDeps: {
    // Exclude onnxruntime-web from Vite's pre-bundling
    // This allows the package to load WASM files from CDN correctly
    exclude: ['onnxruntime-web'],
  },
  server: {
    host: '0.0.0.0',
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Vue core
          'vue-vendor': ['vue', 'pinia', 'vue-i18n'],
          // Heavy libraries
          'jszip': ['jszip'],
          'peerjs': ['peerjs'],
        },
      },
      plugins: [
        visualizer({
          filename: 'dist/stats.html',
          open: false,
          gzipSize: true,
        }),
      ],
    },
  },
})
