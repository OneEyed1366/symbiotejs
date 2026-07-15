import { defineConfig } from 'vitest/config';

// Root unit/integration runner. Tests are co-located with what they exercise:
// pure engine/components logic next to `core/*/src`, framework-driven pipeline tests next to
// the adapter source. `@symbiote-native/*` packages resolve to raw `src/*.ts` (their package
// `main`), so they must be inlined for Vitest to transform them. examples/* left the pnpm
// workspace (2026-07, standalone npm installs) and no longer shares this install/lockfile,
// so its tests are out of scope here — run them from inside the example app itself.
// A single `react` copy across the monorepo is enforced by the `overrides` in
// pnpm-workspace.yaml (the adapter's reconciler and the app's hooks must share one instance,
// else "Invalid hook call"); no Vitest-side dedupe/alias is needed on top of that.
export default defineConfig({
  // Vitest imports Angular adapter source directly. The production AOT path is still ngc partial
  // compilation, but source tests need Vite/Oxc to lower Angular's legacy TS decorators before
  // Node evaluates @Component/@Directive files.
  oxc: { decorator: { legacy: true } },
  test: {
    environment: 'node',
    include: [
      'core/**/src/**/*.test.{ts,tsx}',
      'adapters/**/src/**/*.test.{ts,tsx}',
      // A Metro transformer must be a hand-authored, package-root .cjs (Metro requires() it
      // directly; a compiled-from-src ESM file wouldn't load) — its co-located test lives at
      // the same root level, not under src/. See adapters/vue/metro-vue-transformer.cjs.
      'adapters/*/*.test.{ts,tsx}',
      'packages/**/src/**/*.test.{ts,tsx}',
    ],
    // `**/e2e/**` keeps the Detox on-device suite (jest-based) out of the vitest run.
    // Its `*.test.ts` files import `detox` and drive a real device, not the fake-Fabric slot.
    exclude: ['**/node_modules/**', '**/build/**', '**/e2e/**'],
    server: { deps: { inline: [/@symbiote-native\//] } },
  },
});
