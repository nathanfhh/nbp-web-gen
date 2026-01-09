import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting'

export default defineConfig([
  {
    name: 'app/files-to-lint',
    files: ['**/*.{vue,js,mjs,jsx}'],
  },

  globalIgnores(['**/dist/**', '**/dist-ssr/**', '**/coverage/**']),

  {
    languageOptions: {
      globals: {
        ...globals.browser,
        __APP_VERSION__: 'readonly',
        __BUILD_HASH__: 'readonly',
      },
    },
  },

  // Node.js environment for config files
  {
    files: ['*.config.js', '*.config.mjs'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  js.configs.recommended,
  ...pluginVue.configs['flat/essential'],

  {
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },

  skipFormatting,
])
