import { defineConfig } from 'vitest/config';

// Root unit/integration runner (ADR 0025). Tests are co-located with what they exercise:
// pure engine/components logic next to `core/*/src`, framework-driven pipeline tests next to
// the adapter source and inside the example apps. `@symbiote/*` packages resolve to raw
// `src/*.ts` (their package `main`), so they must be inlined for Vitest to transform them.
// A single `react` copy across the monorepo is enforced by the `overrides` in
// pnpm-workspace.yaml (the adapter's reconciler and the app's hooks must share one instance,
// else "Invalid hook call"); no Vitest-side dedupe/alias is needed on top of that.
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'core/**/src/**/*.test.{ts,tsx}',
      'adapters/**/src/**/*.test.{ts,tsx}',
      'packages/**/src/**/*.test.{ts,tsx}',
      'examples/*/**/*.test.{ts,tsx}',
    ],
    // `**/e2e/**` keeps the Detox on-device suite (jest, decision 0025) out of the vitest run.
    // Its `*.test.ts` files import `detox` and drive a real device, not the fake-Fabric slot.
    exclude: ['**/node_modules/**', '**/build/**', '**/e2e/**'],
    server: { deps: { inline: [/@symbiote\//] } },
  },
});
