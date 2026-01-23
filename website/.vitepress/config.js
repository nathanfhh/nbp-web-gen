import { defineConfig } from 'vitepress'

// Base path: use /nbp-web-gen/docs/ in GitHub Actions, / in local dev
const base = process.env.GITHUB_ACTIONS ? '/nbp-web-gen/docs/' : '/'

// App base path for "return to app" link
const appBase = process.env.GITHUB_ACTIONS ? '/nbp-web-gen/' : '/'

// Sitemap hostname (VitePress automatically appends base path)
const sitemapHostname = 'https://nathanfhh.github.io'

// Shared sidebar for zh-TW
const zhTWSidebar = [
  {
    text: '介紹',
    items: [
      { text: '什麼是 Mediator？', link: '/guide/what-is-mediator' },
      { text: '快速開始', link: '/guide/getting-started' },
    ],
  },
  {
    text: '功能教學',
    items: [
      { text: '生成模式', link: '/guide/image-generation' },
      { text: '貼圖模式', link: '/guide/sticker-generation' },
      { text: '編輯模式', link: '/guide/image-editing' },
      { text: '故事模式', link: '/guide/story-mode' },
      { text: '圖表模式', link: '/guide/diagram-generation' },
      { text: '影片模式', link: '/guide/video-generation' },
      { text: '簡報模式', link: '/guide/slide-generation' },
      { text: '簡報轉換', link: '/guide/slide-conversion' },
    ],
  },
  {
    text: '進階功能',
    items: [
      { text: 'API Key 管理', link: '/guide/api-key-management' },
      { text: '角色庫', link: '/guide/character-library' },
      { text: '歷史紀錄', link: '/guide/history' },
    ],
  },
]

// Shared sidebar for English
const enSidebar = [
  {
    text: 'Introduction',
    items: [
      { text: 'What is Mediator?', link: '/en/guide/what-is-mediator' },
      { text: 'Getting Started', link: '/en/guide/getting-started' },
    ],
  },
  {
    text: 'Features',
    items: [
      { text: 'Generate Mode', link: '/en/guide/image-generation' },
      { text: 'Sticker Mode', link: '/en/guide/sticker-generation' },
      { text: 'Edit Mode', link: '/en/guide/image-editing' },
      { text: 'Story Mode', link: '/en/guide/story-mode' },
      { text: 'Diagram Mode', link: '/en/guide/diagram-generation' },
      { text: 'Video Mode', link: '/en/guide/video-generation' },
      { text: 'Slides Mode', link: '/en/guide/slide-generation' },
      { text: 'Slide Conversion', link: '/en/guide/slide-conversion' },
    ],
  },
  {
    text: 'Advanced',
    items: [
      { text: 'API Key Management', link: '/en/guide/api-key-management' },
      { text: 'Character Library', link: '/en/guide/character-library' },
      { text: 'History', link: '/en/guide/history' },
    ],
  },
]

export default defineConfig({
  base,

  // Sitemap generation
  sitemap: {
    hostname: sitemapHostname,
    transformItems: (items) => {
      // VitePress doesn't auto-prepend base to sitemap URLs, so we do it manually
      return items.map(item => {
        // Ensure URL has leading slash and prepend base
        const itemUrl = item.url.startsWith('/') ? item.url : '/' + item.url
        const fullUrl = base.replace(/\/$/, '') + itemUrl
        return {
          ...item,
          url: fullUrl,
          lastmod: new Date().toISOString().split('T')[0],
          changefreq: 'weekly',
          priority: item.url.includes('getting-started') ? 0.9 : 0.8,
        }
      })
    },
  },

  // Dev server on different port than main app (5173)
  vite: {
    server: {
      port: 5174,
    },
  },

  // Site metadata (default)
  title: 'Mediator Docs',
  description: 'Documentation for Mediator - AI Image & Video Generator',

  // Head tags
  head: [
    ['link', { rel: 'icon', href: `${base}favicon.ico` }],
  ],

  // i18n locales
  locales: {
    root: {
      label: '繁體中文',
      lang: 'zh-TW',
      themeConfig: {
        nav: [
          { text: '首頁', link: '/' },
          { text: '快速開始', link: '/guide/getting-started' },
          { text: '返回應用程式', link: appBase },
        ],
        sidebar: zhTWSidebar,
        docFooter: {
          prev: '上一頁',
          next: '下一頁',
        },
        outline: {
          label: '本頁目錄',
        },
        lastUpdated: {
          text: '最後更新',
        },
      },
    },
    en: {
      label: 'English',
      lang: 'en',
      link: '/en/',
      themeConfig: {
        nav: [
          { text: 'Home', link: '/en/' },
          { text: 'Getting Started', link: '/en/guide/getting-started' },
          { text: 'Back to App', link: appBase },
        ],
        sidebar: enSidebar,
        docFooter: {
          prev: 'Previous',
          next: 'Next',
        },
        outline: {
          label: 'On this page',
        },
        lastUpdated: {
          text: 'Last updated',
        },
      },
    },
  },

  // Theme configuration (shared)
  themeConfig: {
    // Logo
    logo: '/logo.png',

    // Social links
    socialLinks: [
      { icon: 'github', link: 'https://github.com/nathanfhh/nbp-web-gen' },
    ],

    // Footer
    footer: {
      message: 'Built with VitePress',
      copyright: 'Copyright © 2026',
    },

    // Search
    search: {
      provider: 'local',
      options: {
        locales: {
          root: {
            translations: {
              button: {
                buttonText: '搜尋',
                buttonAriaLabel: '搜尋文件',
              },
              modal: {
                noResultsText: '找不到結果',
                resetButtonTitle: '清除搜尋',
                footer: {
                  selectText: '選擇',
                  navigateText: '切換',
                  closeText: '關閉',
                },
              },
            },
          },
          en: {
            translations: {
              button: {
                buttonText: 'Search',
                buttonAriaLabel: 'Search docs',
              },
              modal: {
                noResultsText: 'No results found',
                resetButtonTitle: 'Clear search',
                footer: {
                  selectText: 'Select',
                  navigateText: 'Navigate',
                  closeText: 'Close',
                },
              },
            },
          },
        },
      },
    },
  },
})
