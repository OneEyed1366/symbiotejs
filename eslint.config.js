import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

// Flat config for the symbiote LIBRARY code only (core / adapters / packages).
// The RN example apps own their formatting + lint via the @react-native eslint
// toolchain (examples/*/.eslintrc.js) and are ignored here on purpose.
//
// Shape: one shared base + one scoped layer per framework adapter. A new adapter
// (angular / solid / svelte) adds its own block. That is the per-framework seam.
export default defineConfig(
  {
    ignores: ['**/dist/**', '**/build/**', '**/build-ngc/**', '**/*.tsbuildinfo', 'examples/**'],
  },

  // ── shared base: every adapter and the engine inherit this ──
  {
    files: ['{core,adapters,packages}/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // The Fabric JSI seam (nativeFabricUIManager, ViewConfigs, host element bags)
      // is genuinely untyped at the boundary, so `any` there is the contract rather than a lint slip.
      '@typescript-eslint/no-explicit-any': 'off',
      // Allow intentionally-unused args/vars prefixed with _ (descriptor bridges, reducer
      // signatures, platform stubs all carry placeholder params).
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },

  // ── per-framework adapter layers (extend the base, add framework-specific rules) ──

  // React: Rules of Hooks + exhaustive-deps. The adapter drives RN through use*State
  // hooks (useReducer/useEffect/useRef over the core/components state reducers), so a
  // conditional hook or a stale dep array is a real bug class here.
  {
    files: ['adapters/react/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // Classic Rules of Hooks, the high-signal React-specific checks. The v7 plugin
      // also ships the React Compiler rules (refs / purity / preserve-manual-memoization),
      // but those misfire on a hand-written imperative reconciler, so we keep them opt-in.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // Vue: reactivity discipline lives here. Engine/native nodes must be held by identity
  // (shallowRef / markRaw), never wrapped in a deep reactive ref (see the
  // vue-adapter-reactivity invariant). No off-the-shelf plugin enforces that yet; add
  // project-specific no-restricted-syntax rules in this block as the surface grows.
  {
    files: ['adapters/vue/**/*.ts'],
    rules: {},
  },

  // Future adapters get their own block here, e.g.:
  // { files: ['adapters/angular/**/*.ts'], plugins: { ... }, rules: { ... } },
  // { files: ['adapters/solid/**/*.{ts,tsx}'], plugins: { solid }, rules: { ...solid.configs.recommended.rules } },
  // { files: ['adapters/svelte/**/*.svelte'], languageOptions: { parser: svelteParser }, rules: { ... } },

  // prettier last: switch off every formatting rule, since prettier owns formatting.
  prettier,
);
