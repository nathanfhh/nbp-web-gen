<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  size: {
    type: String,
    default: 'md', // 'sm' | 'md' | 'lg'
  },
  path: {
    type: String,
    default: '', // e.g., 'guide/slide-conversion' - will be appended to docs URL
  },
})

const { locale } = useI18n()
const isDarkTheme = computed(() => document.documentElement.getAttribute('data-theme-type') === 'dark')

const sizeClasses = {
  sm: 'w-5 h-5',
  md: 'w-6 h-6',
  lg: 'w-7 h-7',
}

// Docs base URL - use relative path for same-origin docs
// Append locale prefix for English, then optional path
const docsUrl = computed(() => {
  const base = import.meta.env.BASE_URL + 'docs/'
  const localePath = locale.value === 'en' ? 'en/' : ''
  const pathSuffix = props.path ? props.path : ''
  return base + localePath + pathSuffix
})
</script>

<template>
  <a
    :href="docsUrl"
    target="_blank"
    rel="noopener noreferrer"
    class="inline-flex items-center justify-center p-2 rounded-lg transition-all"
    :class="isDarkTheme
      ? 'text-text-muted hover:text-mode-generate hover:bg-bg-interactive'
      : 'text-text-muted hover:text-mode-generate hover:bg-bg-subtle'"
    :title="$t('common.docs')"
  >
    <!-- Book/Document icon -->
    <svg :class="sizeClasses[size]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
      />
    </svg>
  </a>
</template>
