# NBP Theme Guide

This guide explains how to customize and create themes for Nano Banana Pro.

## Theme System Architecture

NBP uses a **Token-Based** theme system, where all colors and shadows are defined as "Tokens" (e.g., `brandPrimary`, `bgBase`). These tokens are then automatically converted into CSS Variables (e.g., `--color-brand-primary`, `--color-bg-base`) and injected into the DOM.

### Key Features

1.  **Automatic Detection**: Simply add a new `.js` file to the `src/theme/themes/` folder, and the system will automatically load and register it.
2.  **i18n Support**: Theme display names are managed via language files, supporting multi-language switching.
3.  **Semantic Tokens**: Colors are defined by "function" (e.g., `bgCard`, `textPrimary`) rather than "color name" (e.g., `bgBlue`, `textWhite`), making it easier to switch themes.

---

## Creating a New Theme

### 1. Create a Theme File

Create a new JavaScript file in `src/theme/themes/`, for example `ocean.js`.
The file name (minus .js) will serve as the unique ID for the theme.

**File Structure (`src/theme/themes/ocean.js`):**

```javascript
/**
 * Ocean Theme
 * Fresh blue tones
 */
export default {
  // Theme ID (must match filename)
  name: 'ocean',
  
  // Base type ('light' or 'dark')
  // Determines default behaviors for some components
  type: 'dark', 
  
  // PWA Theme Color (Optional, for mobile browser status bar)
  metaThemeColor: '#0f172a',

  // Token Definitions
  colors: {
    // Brand Colors
    brandPrimary: '#0ea5e9',
    brandPrimaryLight: '#38bdf8',
    brandPrimaryDark: '#0284c7',
    brandPrimaryHover: '#0284c7',
    brandAccent: '#f59e0b',
    brandAccentLight: '#fbbf24',

    // Backgrounds
    bgBase: '#0f172a',        // Page background
    bgCard: '#1e293b',        // Card background
    bgElevated: '#334155',    // Dropdowns/Modals
    bgMuted: 'rgba(255,255,255, 0.05)',
    bgInteractive: 'rgba(255,255,255, 0.1)',
    bgInteractiveHover: 'rgba(255,255,255, 0.15)',
    bgSubtle: 'rgba(14, 165, 233, 0.1)',
    bgOverlay: 'rgba(0,0,0, 0.5)',
    bgTooltip: '#0f172a',

    // Text
    textPrimary: '#f8fafc',
    textSecondary: '#cbd5e1',
    textMuted: '#94a3b8',
    textInverse: '#0f172a',
    textLink: '#38bdf8',

    // Borders
    borderDefault: 'rgba(148, 163, 184, 0.2)',
    borderMuted: 'rgba(148, 163, 184, 0.1)',
    borderFocus: '#0ea5e9',
    borderSubtle: 'rgba(14, 165, 233, 0.3)',

    // Status Colors (Success, Error, Warning, Info...)
    statusSuccess: '#10b981',
    statusSuccessMuted: 'rgba(16, 185, 129, 0.2)',
    statusSuccessSolid: '#10b981',
    statusSuccessHover: '#059669',
    // ... (See tokens.js for full list)

    // Mode Colors (Generate, Sticker, Edit...)
    modeGenerate: '#0ea5e9',
    modeGenerateMuted: 'rgba(14, 165, 233, 0.2)',
    // ...

    // Controls
    controlActive: '#10b981',
    controlInactive: '#475569',
    controlDisabled: '#334155',
    controlDisabledText: '#64748b',

    // Others
    accentPulse: '#06b6d4',
    accentStar: '#eab308',
    inputBg: 'rgba(30, 41, 59, 0.5)',
  },

  // Shadows
  shadows: {
    glowPrimary: '0 4px 20px rgba(14, 165, 233, 0.2)',
    glowSuccess: '0 4px 16px rgba(16, 185, 129, 0.2)',
    // ...
  }
}
```

### 2. Add Translations

To make the theme name appear correctly in the UI, add translation keys to the language files.

**`src/i18n/locales/zh-TW.json`:**
```json
{
  "theme": {
    "names": {
      "light": "亮色模式",
      "dark": "暗色模式",
      "ocean": "海洋深藍" // New theme
    }
  }
}
```

**`src/i18n/locales/en.json`:**
```json
{
  "theme": {
    "names": {
      "light": "Light Mode",
      "dark": "Dark Mode",
      "ocean": "Ocean Blue" // New theme
    }
  }
}
```

### 3. Done!

The system will automatically detect the new file, register it, and it will appear in the theme selection dropdown (once implemented). No other code changes are required.

---

## Token Reference

For a complete list of available tokens, please refer to `src/theme/tokens.js`.
Ensure that any new theme implements **all** tokens to avoid display issues.

**Tip**: The easiest way is to copy `src/theme/themes/dark.js` or `light.js` and modify the color codes.

## Using Tokens in Code

### In CSS/Tailwind
Tokens are exposed as CSS variables. In `tailwind.config.js` (or `style.css`), they are mapped to Tailwind classes.

```html
<!-- Example -->
<div class="bg-bg-base text-text-primary border-border-default">
  Content
</div>
```

### In JavaScript
If you need to access the current theme object in JS:

```javascript
import { useTheme } from '@/theme'

const theme = useTheme()
console.log(theme.value.colors.brandPrimary)
```