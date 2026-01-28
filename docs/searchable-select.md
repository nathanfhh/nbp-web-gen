# SearchableSelect Component

`src/components/SearchableSelect.vue` — A reusable filterable dropdown component inspired by Element Plus `el-select` filterable.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `modelValue` | `String` | `''` | v-model binding value |
| `options` | `Array` | `[]` | Flat options: `[{ value, label, description? }]` |
| `groups` | `Array` | `[]` | Grouped options: `[{ label, options: [...] }]` (mutually exclusive with `options`) |
| `placeholder` | `String` | `''` | Search input placeholder |
| `disabled` | `Boolean` | `false` | Disable the select |

## Usage

### Flat options

```vue
<SearchableSelect
  v-model="selectedValue"
  :options="[
    { value: 'a', label: 'Option A' },
    { value: 'b', label: 'Option B', description: 'Extra info' },
  ]"
  placeholder="Choose..."
/>
```

### Grouped options

```vue
<SearchableSelect
  v-model="selectedVoice"
  :groups="[
    {
      label: 'Female',
      options: [
        { value: 'Zephyr', label: 'Zephyr', description: 'Bright' },
      ],
    },
    {
      label: 'Male',
      options: [
        { value: 'Puck', label: 'Puck', description: 'Upbeat' },
      ],
    },
  ]"
  placeholder="Select voice"
/>
```

## Features

- **Search filtering**: Case-insensitive match on `label` and `description`
- **Keyboard navigation**: `↑↓` to navigate, `Enter` to select, `Escape` to close
- **Click outside**: Auto-closes the dropdown
- **Selected indicator**: Checkmark + brand accent color on the current value
- **Grouped sticky headers**: Group labels stay visible while scrolling
- **Theme-compliant**: Uses CSS variables (`--input-bg`, `--glass-border`, `--color-mode-generate`, etc.)
- **Transition**: Smooth open/close animation

## Styling

The component uses BEM-style scoped CSS with theme system variables. No hardcoded colors. The trigger matches the `input-premium` visual style (same bg, border, radius).

z-index of the dropdown panel is `50` — safely below lightbox layers (9999+).
