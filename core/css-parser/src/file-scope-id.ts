// A short, stable id derived from a file path, used to scope CSS classes so two files can each
// define their own `.card` without colliding in the shared runtime registry (core/engine's
// style-registry). Deterministic so Metro's cache stays warm across rebuilds. Shared by both
// the Vue SFC compiler's own scope-id convention (examples/vue-sfc/metro-vue-transformer.js,
// which prefixes it `data-v-` to match Vue's own attribute-based scoping) and the
// framework-agnostic standalone `.module.css` file compiler (metro-css-module.ts) — same hash,
// different prefix per caller, so the algorithm lives once.
export function hashFilePath(filePath: string): string {
  let hash = 0;
  for (let i = 0; i < filePath.length; i++) {
    hash = (Math.imul(31, hash) + filePath.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36).slice(0, 8);
}
