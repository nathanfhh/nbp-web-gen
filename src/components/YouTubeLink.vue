<script setup>
import { useGeneratorStore } from '@/stores/generator'

defineProps({
  size: {
    type: String,
    default: 'md', // 'sm' | 'md' | 'lg'
  },
})

const store = useGeneratorStore()

const sizeClasses = {
  sm: 'w-5 h-5',
  md: 'w-6 h-6',
  lg: 'w-7 h-7',
}
</script>

<template>
  <a
    href="https://youtu.be/w7yAHJq66Pk"
    target="_blank"
    rel="noopener noreferrer"
    class="inline-flex items-center justify-center p-2 rounded-lg transition-all"
    :class="store.theme === 'dark'
      ? 'text-text-muted hover:text-status-error hover:bg-bg-interactive'
      : 'text-text-muted hover:text-status-error hover:bg-bg-subtle'"
  >
    <svg :class="sizeClasses[size]" fill="currentColor" viewBox="0 0 24 24">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
  </a>
</template>
