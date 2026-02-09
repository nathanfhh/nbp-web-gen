<script setup>
import { ref, computed } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

// Configure marked for safe rendering
marked.setOptions({
  breaks: true, // Convert \n to <br>
  gfm: true, // GitHub Flavored Markdown
})

// Configure DOMPurify hook to prevent reverse-tabnabbing
// Add rel="noopener noreferrer" to all links with target="_blank"
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    // Force external links to open in new tab safely
    if (node.getAttribute('target') === '_blank') {
      node.setAttribute('rel', 'noopener noreferrer')
    }
    // Also handle links that don't have target but are external
    const href = node.getAttribute('href')
    if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
    }
  }
})

/**
 * Render markdown content safely
 * @param {string} content - Markdown content
 * @returns {string} Sanitized HTML
 */
const renderMarkdown = (content) => {
  if (!content) return ''
  const html = marked.parse(content)
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'code', 'pre', 'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'hr'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
  })
}

/**
 * Extract title from thought content (first line with ** markers)
 * @param {string} content - Thought content
 * @returns {{ title: string, body: string }}
 */
const parseThoughtContent = (content) => {
  if (!content) return { title: '', body: '' }

  const lines = content.split('\n')
  const firstLine = lines[0]?.trim() || ''

  // Check if first line looks like a title (starts with ** or is short)
  const titleMatch = firstLine.match(/^\*\*(.+?)\*\*$/)
  if (titleMatch) {
    return {
      title: titleMatch[1],
      body: lines.slice(1).join('\n').trim(),
    }
  }

  // If first line is short (< 60 chars) and followed by content, treat as title
  if (firstLine.length < 60 && lines.length > 1) {
    return {
      title: firstLine.replace(/^\*\*|\*\*$/g, ''),
      body: lines.slice(1).join('\n').trim(),
    }
  }

  return { title: '', body: content }
}

const props = defineProps({
  message: {
    type: Object,
    required: true,
  },
  isStreaming: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['image-click', 'continue-about'])

// Filter out empty parts and normalize content
const filteredParts = computed(() => {
  if (!props.message.parts) return []

  return props.message.parts.filter((part) => {
    // Filter out empty text/thought parts
    if (part.type === 'text' || part.type === 'thought') {
      return part.content && part.content.trim().length > 0
    }
    // Keep all other part types
    return true
  })
})

// Track expanded state for thought parts (default collapsed)
const expandedThoughts = ref(new Set())

const toggleThought = (index) => {
  if (expandedThoughts.value.has(index)) {
    expandedThoughts.value.delete(index)
  } else {
    expandedThoughts.value.add(index)
  }
}

const isThoughtExpanded = (index) => {
  return expandedThoughts.value.has(index)
}

// Format timestamp
const formatTime = computed(() => {
  if (!props.message.timestamp) return ''
  const date = new Date(props.message.timestamp)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
})

// Check if message is from user
const isUser = computed(() => props.message.role === 'user')

// Handle image click for lightbox
const handleImageClick = (part, index) => {
  emit('image-click', { part, index, message: props.message })
}

// Handle "continue about this image" action
const handleContinueAbout = (part) => {
  emit('continue-about', { part, message: props.message })
}

// Get language display name for code blocks
const getLanguageDisplay = (lang) => {
  const langMap = {
    python: 'Python',
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    java: 'Java',
    cpp: 'C++',
    c: 'C',
    go: 'Go',
    rust: 'Rust',
    sql: 'SQL',
    html: 'HTML',
    css: 'CSS',
    json: 'JSON',
    yaml: 'YAML',
    bash: 'Bash',
    shell: 'Shell',
  }
  return langMap[lang?.toLowerCase()] || lang || 'Code'
}

// Check if code execution was successful
const isCodeSuccess = (part) => {
  return part.outcome === 'OUTCOME_OK' || part.outcome === 'OK' || !part.outcome
}
</script>

<template>
  <div
    class="agent-message flex gap-0 sm:gap-3 py-4"
    :class="[
      isUser ? 'flex-row-reverse' : '',
      isStreaming ? 'animate-pulse-subtle' : ''
    ]"
  >
    <!-- Avatar (hidden on mobile) -->
    <div
      class="hidden sm:flex flex-shrink-0 w-8 h-8 rounded-full items-center justify-center"
      :class="isUser ? 'bg-brand-primary-muted' : 'bg-mode-generate-muted'"
    >
      <!-- User icon -->
      <svg
        v-if="isUser"
        class="w-4 h-4 text-brand-primary"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
        />
      </svg>
      <!-- Bot icon -->
      <svg
        v-else
        class="w-4 h-4 text-mode-generate"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        />
      </svg>
    </div>

    <!-- Content -->
    <div
      class="flex-1 min-w-0 space-y-2"
      :class="isUser ? 'items-end' : 'items-start'"
    >
      <!-- Message parts -->
      <template v-for="(part, index) in filteredParts" :key="index">
        <!-- Text part with Markdown rendering -->
        <div
          v-if="part.type === 'text'"
          class="rounded-2xl px-4 py-2 max-w-full sm:max-w-[85%]"
          :class="isUser
            ? 'bg-brand-primary text-text-on-brand ml-auto'
            : 'bg-bg-muted text-text-primary'"
        >
          <div class="prose prose-sm max-w-none agent-markdown" v-html="renderMarkdown(part.content)"></div>
        </div>

        <!-- Thought/reasoning part (collapsible with title) -->
        <div
          v-else-if="part.type === 'thought'"
          class="rounded-xl border border-border-muted bg-bg-subtle/50 max-w-full sm:max-w-[85%] overflow-hidden"
        >
          <button
            @click="toggleThought(index)"
            class="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-bg-muted/50 transition-colors"
          >
            <svg
              class="w-4 h-4 text-text-muted transition-transform flex-shrink-0"
              :class="isThoughtExpanded(index) ? 'rotate-90' : ''"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
            <svg class="w-3.5 h-3.5 text-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <span class="text-sm font-medium text-text-secondary truncate">
              {{ parseThoughtContent(part.content).title || $t('agent.thinking') }}
            </span>
          </button>
          <div
            v-show="isThoughtExpanded(index)"
            class="px-3 pb-3 text-sm text-text-secondary border-t border-border-muted"
          >
            <div
              class="prose prose-sm max-w-none agent-markdown mt-2"
              v-html="renderMarkdown(parseThoughtContent(part.content).body || part.content)"
            ></div>
          </div>
        </div>

        <!-- Code part -->
        <div
          v-else-if="part.type === 'code'"
          class="rounded-xl border border-border-muted overflow-hidden max-w-full sm:max-w-[90%]"
        >
          <div class="flex items-center justify-between px-3 py-1.5 bg-bg-muted border-b border-border-muted">
            <span class="text-xs font-mono text-text-muted">{{ getLanguageDisplay(part.language) }}</span>
            <svg class="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </div>
          <pre class="p-3 overflow-x-auto bg-bg-elevated text-sm"><code class="text-text-primary font-mono whitespace-pre-wrap break-words">{{ part.content }}</code></pre>
        </div>

        <!-- Code execution result -->
        <div
          v-else-if="part.type === 'codeResult'"
          class="rounded-xl border overflow-hidden max-w-full sm:max-w-[90%]"
          :class="isCodeSuccess(part) ? 'border-status-success' : 'border-status-error'"
        >
          <div
            class="flex items-center gap-2 px-3 py-1.5 border-b"
            :class="isCodeSuccess(part)
              ? 'bg-status-success-muted border-status-success'
              : 'bg-status-error-muted border-status-error'"
          >
            <svg
              v-if="isCodeSuccess(part)"
              class="w-4 h-4 text-status-success"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
            <svg
              v-else
              class="w-4 h-4 text-status-error"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span class="text-xs font-medium" :class="isCodeSuccess(part) ? 'text-status-success' : 'text-status-error'">
              {{ isCodeSuccess(part) ? $t('agent.codeSuccess') : $t('agent.codeFailed') }}
            </span>
          </div>
          <pre class="p-3 overflow-x-auto bg-bg-elevated text-sm"><code class="font-mono whitespace-pre-wrap break-words" :class="isCodeSuccess(part) ? 'text-text-primary' : 'text-status-error'">{{ part.output }}</code></pre>
        </div>

        <!-- Generated image -->
        <div
          v-else-if="part.type === 'generatedImage' && part.data"
          class="max-w-[280px] space-y-2"
        >
          <div
            class="rounded-xl overflow-hidden border border-border-muted cursor-pointer hover:ring-2 hover:ring-mode-generate transition-all"
            @click="handleImageClick(part, index)"
          >
            <img
              :src="`data:${part.mimeType};base64,${part.data}`"
              alt="Generated image"
              class="w-full h-auto"
            />
          </div>
          <button
            @click="handleContinueAbout(part)"
            class="text-xs text-mode-generate hover:text-brand-primary transition-colors flex items-center gap-1"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {{ $t('agent.continueAbout') }}
          </button>
        </div>

        <!-- User uploaded image -->
        <div
          v-else-if="part.type === 'image' && part.data"
          class="max-w-[120px]"
          :class="isUser ? 'ml-auto' : ''"
        >
          <div
            class="rounded-lg overflow-hidden border border-border-muted cursor-pointer hover:ring-2 hover:ring-brand-primary transition-all"
            @click="handleImageClick(part, index)"
          >
            <img
              :src="`data:${part.mimeType};base64,${part.data}`"
              alt="Uploaded image"
              class="w-full h-auto"
            />
          </div>
        </div>
      </template>

      <!-- Streaming indicator -->
      <div v-if="isStreaming && !isUser" class="flex items-center gap-2 text-text-muted">
        <div class="flex gap-1">
          <span class="w-2 h-2 rounded-full bg-mode-generate animate-bounce" style="animation-delay: 0ms"></span>
          <span class="w-2 h-2 rounded-full bg-mode-generate animate-bounce" style="animation-delay: 150ms"></span>
          <span class="w-2 h-2 rounded-full bg-mode-generate animate-bounce" style="animation-delay: 300ms"></span>
        </div>
      </div>

      <!-- Timestamp -->
      <span
        v-if="formatTime && !isStreaming"
        class="text-xs text-text-muted"
        :class="isUser ? 'text-right' : ''"
      >
        {{ formatTime }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.animate-pulse-subtle {
  animation: pulse-subtle 2s ease-in-out infinite;
}

@keyframes pulse-subtle {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}

/* Markdown content styling */
.agent-markdown :deep(p) {
  margin-bottom: 0.5rem;
}

.agent-markdown :deep(p:last-child) {
  margin-bottom: 0;
}

.agent-markdown :deep(strong) {
  font-weight: 600;
}

.agent-markdown :deep(em) {
  font-style: italic;
}

.agent-markdown :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.875em;
  background-color: var(--color-bg-elevated);
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
}

.agent-markdown :deep(pre) {
  background-color: var(--color-bg-elevated);
  padding: 0.75rem;
  border-radius: 0.5rem;
  overflow-x: auto;
  margin: 0.5rem 0;
}

.agent-markdown :deep(pre code) {
  background: none;
  padding: 0;
}

.agent-markdown :deep(ul),
.agent-markdown :deep(ol) {
  padding-left: 1.5rem;
  margin: 0.5rem 0;
}

.agent-markdown :deep(li) {
  margin-bottom: 0.25rem;
}

.agent-markdown :deep(a) {
  color: var(--color-brand-primary);
  text-decoration: underline;
}

.agent-markdown :deep(a:hover) {
  opacity: 0.8;
}

.agent-markdown :deep(blockquote) {
  border-left: 3px solid var(--color-border-muted);
  padding-left: 0.75rem;
  margin: 0.5rem 0;
  color: var(--color-text-secondary);
}

.agent-markdown :deep(h1),
.agent-markdown :deep(h2),
.agent-markdown :deep(h3),
.agent-markdown :deep(h4) {
  font-weight: 600;
  margin-top: 0.75rem;
  margin-bottom: 0.5rem;
}

.agent-markdown :deep(h1) { font-size: 1.25rem; }
.agent-markdown :deep(h2) { font-size: 1.125rem; }
.agent-markdown :deep(h3) { font-size: 1rem; }
.agent-markdown :deep(h4) { font-size: 0.875rem; }

.agent-markdown :deep(hr) {
  border: none;
  border-top: 1px solid var(--color-border-muted);
  margin: 0.75rem 0;
}
</style>
