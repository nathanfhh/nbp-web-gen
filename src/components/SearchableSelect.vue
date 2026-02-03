<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'

const props = defineProps({
  modelValue: {
    type: String,
    default: '',
  },
  options: {
    type: Array,
    default: () => [],
  },
  groups: {
    type: Array,
    default: () => [],
  },
  placeholder: {
    type: String,
    default: '',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:modelValue'])

const isOpen = ref(false)
const searchQuery = ref('')
const highlightIndex = ref(-1)
const containerRef = ref(null)
const searchInputRef = ref(null)
const listRef = ref(null)

// Flatten all options for lookup and keyboard navigation
const flatOptions = computed(() => {
  if (props.groups.length > 0) {
    return props.groups.flatMap((g) => g.options)
  }
  return props.options
})

// Currently selected label
const selectedLabel = computed(() => {
  const found = flatOptions.value.find((o) => o.value === props.modelValue)
  return found ? found.label : ''
})

// Selected description (for voice selects)
const selectedDescription = computed(() => {
  const found = flatOptions.value.find((o) => o.value === props.modelValue)
  return found?.description || ''
})

// Filter logic
const filterFn = (option) => {
  if (!searchQuery.value) return true
  const q = searchQuery.value.toLowerCase()
  return (
    option.label.toLowerCase().includes(q) ||
    (option.description && option.description.toLowerCase().includes(q))
  )
}

const filteredOptions = computed(() => {
  if (props.groups.length > 0) return []
  return props.options.filter(filterFn)
})

const filteredGroups = computed(() => {
  if (props.groups.length === 0) return []
  return props.groups
    .map((g) => ({
      label: g.label,
      options: g.options.filter(filterFn),
    }))
    .filter((g) => g.options.length > 0)
})

// Flat filtered list for keyboard navigation
const filteredFlat = computed(() => {
  if (props.groups.length > 0) {
    return filteredGroups.value.flatMap((g) => g.options)
  }
  return filteredOptions.value
})

const hasResults = computed(() => filteredFlat.value.length > 0)

// Scroll to selected option when dropdown opens
// Uses scrollTop instead of scrollIntoView to avoid scrolling outer containers
const scrollToSelected = () => {
  nextTick(() => {
    const list = listRef.value
    const selectedEl = list?.querySelector('[data-selected="true"]')
    if (list && selectedEl) {
      // Calculate scroll position to center the selected item in the list
      const listRect = list.getBoundingClientRect()
      const selectedRect = selectedEl.getBoundingClientRect()
      const scrollOffset = selectedEl.offsetTop - list.offsetTop - (listRect.height / 2) + (selectedRect.height / 2)
      list.scrollTop = Math.max(0, scrollOffset)
    }
  })
}

// Open / close
const open = () => {
  if (props.disabled) return
  isOpen.value = true
  searchQuery.value = ''
  highlightIndex.value = -1
  nextTick(() => {
    searchInputRef.value?.focus()
    scrollToSelected()
  })
}

const close = () => {
  isOpen.value = false
  searchQuery.value = ''
  highlightIndex.value = -1
}

const toggle = () => {
  if (isOpen.value) {
    close()
  } else {
    open()
  }
}

const selectOption = (value) => {
  emit('update:modelValue', value)
  close()
}

// Keyboard navigation
const onKeydown = (e) => {
  const len = filteredFlat.value.length
  if (!len) return

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    highlightIndex.value = (highlightIndex.value + 1) % len
    scrollToHighlighted()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    highlightIndex.value = (highlightIndex.value - 1 + len) % len
    scrollToHighlighted()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (highlightIndex.value >= 0 && highlightIndex.value < len) {
      selectOption(filteredFlat.value[highlightIndex.value].value)
    }
  } else if (e.key === 'Escape') {
    e.preventDefault()
    close()
  }
}

const scrollToHighlighted = () => {
  nextTick(() => {
    const el = listRef.value?.querySelector('[data-highlighted="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  })
}

// Reset highlight when search changes
watch(searchQuery, () => {
  highlightIndex.value = -1
})

// Click outside
const onClickOutside = (e) => {
  if (containerRef.value && !containerRef.value.contains(e.target)) {
    close()
  }
}

watch(isOpen, (val) => {
  if (val) {
    document.addEventListener('mousedown', onClickOutside)
  } else {
    document.removeEventListener('mousedown', onClickOutside)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onClickOutside)
})
</script>

<template>
  <div ref="containerRef" class="searchable-select">
    <!-- Trigger -->
    <button
      type="button"
      class="searchable-select__trigger"
      :class="{ 'searchable-select__trigger--disabled': disabled }"
      :disabled="disabled"
      @click="toggle"
    >
      <span v-if="selectedLabel" class="searchable-select__value">
        {{ selectedLabel }}
        <span v-if="selectedDescription" class="searchable-select__desc">
          — {{ selectedDescription }}
        </span>
      </span>
      <span v-else class="searchable-select__placeholder">{{ placeholder }}</span>
      <svg
        class="searchable-select__chevron"
        :class="{ 'searchable-select__chevron--open': isOpen }"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>

    <!-- Dropdown panel -->
    <Transition name="searchable-select-dropdown">
      <div v-if="isOpen" class="searchable-select__panel">
        <!-- Search input -->
        <div class="searchable-select__search-wrap">
          <svg
            class="searchable-select__search-icon"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            class="searchable-select__search"
            :placeholder="placeholder || 'Search...'"
            @keydown="onKeydown"
          />
        </div>

        <!-- Options list -->
        <div ref="listRef" class="searchable-select__list">
          <template v-if="hasResults">
            <!-- Flat options -->
            <template v-if="groups.length === 0">
              <button
                v-for="(opt, idx) in filteredOptions"
                :key="opt.value"
                type="button"
                class="searchable-select__option"
                :class="{
                  'searchable-select__option--selected': opt.value === modelValue,
                  'searchable-select__option--highlighted': idx === highlightIndex,
                }"
                :data-highlighted="idx === highlightIndex"
                :data-selected="opt.value === modelValue"
                @click="selectOption(opt.value)"
                @mouseenter="highlightIndex = idx"
              >
                <span class="searchable-select__option-text">
                  <span>{{ opt.label }}</span>
                  <span v-if="opt.description" class="searchable-select__option-desc">
                    {{ opt.description }}
                  </span>
                </span>
                <slot name="option-suffix" :option="opt" />
                <svg
                  v-if="opt.value === modelValue"
                  class="searchable-select__check"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </button>
            </template>

            <!-- Grouped options -->
            <template v-else>
              <div v-for="group in filteredGroups" :key="group.label" class="searchable-select__group">
                <div class="searchable-select__group-label">{{ group.label }}</div>
                <button
                  v-for="opt in group.options"
                  :key="opt.value"
                  type="button"
                  class="searchable-select__option"
                  :class="{
                    'searchable-select__option--selected': opt.value === modelValue,
                    'searchable-select__option--highlighted':
                      filteredFlat.indexOf(opt) === highlightIndex,
                  }"
                  :data-highlighted="filteredFlat.indexOf(opt) === highlightIndex"
                  :data-selected="opt.value === modelValue"
                  @click="selectOption(opt.value)"
                  @mouseenter="highlightIndex = filteredFlat.indexOf(opt)"
                >
                  <span class="searchable-select__option-text">
                    <span>{{ opt.label }}</span>
                    <span v-if="opt.description" class="searchable-select__option-desc">
                      {{ opt.description }}
                    </span>
                  </span>
                  <slot name="option-suffix" :option="opt" />
                  <svg
                    v-if="opt.value === modelValue"
                    class="searchable-select__check"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </button>
              </div>
            </template>
          </template>

          <!-- No results -->
          <div v-else class="searchable-select__empty">No results</div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.searchable-select {
  position: relative;
  width: 100%;
}

.searchable-select__trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 14px;
  background: var(--input-bg);
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.4;
  cursor: pointer;
  transition: all 0.3s ease;
  text-align: left;
}

.searchable-select__trigger:hover:not(:disabled) {
  border-color: var(--color-brand-primary);
}

.searchable-select__trigger:focus {
  outline: none;
  border-color: var(--color-brand-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-brand-primary), transparent 85%);
}

.searchable-select__trigger--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.searchable-select__value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.searchable-select__desc {
  color: var(--text-muted);
}

.searchable-select__placeholder {
  flex: 1;
  color: var(--text-muted);
}

.searchable-select__chevron {
  flex-shrink: 0;
  color: var(--text-muted);
  transition: transform 0.2s ease;
}

.searchable-select__chevron--open {
  transform: rotate(180deg);
}

/* Panel */
.searchable-select__panel {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 50;
  background: var(--input-bg);
  backdrop-filter: blur(12px);
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  overflow: hidden;
}

/* Search */
.searchable-select__search-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--glass-border);
}

.searchable-select__search-icon {
  flex-shrink: 0;
  color: var(--text-muted);
}

.searchable-select__search {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-size: 13px;
}

.searchable-select__search::placeholder {
  color: var(--text-muted);
}

/* List */
.searchable-select__list {
  max-height: 200px;
  overflow-y: auto;
  padding: 4px 4px 4px;
}

/* Group */
.searchable-select__group-label {
  position: sticky;
  top: -4px;
  margin: 0 -4px;
  padding: 6px 14px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  background: var(--color-bg-base);
  border-bottom: 1px solid var(--glass-border);
  z-index: 1;
}

/* Option */
.searchable-select__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s ease;
}

.searchable-select__option:hover,
.searchable-select__option--highlighted {
  background: var(--color-bg-interactive);
}

.searchable-select__option--selected {
  color: var(--color-mode-generate);
}

.searchable-select__option-text {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.searchable-select__option-desc {
  color: var(--text-muted);
  font-size: 12px;
}

.searchable-select__check {
  flex-shrink: 0;
  color: var(--color-mode-generate);
}

/* Empty */
.searchable-select__empty {
  padding: 16px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}

/* Dropdown transition */
.searchable-select-dropdown-enter-active {
  transition: all 0.15s ease-out;
}

.searchable-select-dropdown-leave-active {
  transition: all 0.1s ease-in;
}

.searchable-select-dropdown-enter-from,
.searchable-select-dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
