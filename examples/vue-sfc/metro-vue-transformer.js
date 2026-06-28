// Metro babel transformer that teaches the bundler to read Vue SFCs (.vue). Metro has no
// Vue plugin (unplugin-vue ships vite/webpack/esbuild/rollup adapters, not Metro), so we do
// the single-pass compile here: parse the SFC, compile <script setup> + <template> into one
// component module, then hand the JS to RN's own babel transformer. This is the Metro twin
// of what @vitejs/plugin-vue does for Vite; the 'vue'→runtime-core rewrite is wolf-tui's
// pattern (a custom, non-DOM renderer needs the compiler helpers from @vue/runtime-core,
// not from vue/runtime-dom).

const upstreamTransformer = require('@react-native/metro-babel-transformer');
const { parse, compileScript } = require('@vue/compiler-sfc');

// A short, stable id per file, used as the SFC scope id (we have no scoped styles, but
// compileScript wants one). Deterministic so Metro's cache stays warm.
function scopeIdFor(filename) {
  let hash = 0;
  for (let i = 0; i < filename.length; i++) {
    hash = (Math.imul(31, hash) + filename.charCodeAt(i)) | 0;
  }
  return 'data-v-' + Math.abs(hash).toString(36).slice(0, 8);
}

function compileSfc(src, filename) {
  const { descriptor, errors } = parse(src, { filename });
  if (errors && errors.length > 0) {
    throw new Error(`Vue SFC parse error in ${filename}:\n${errors.map(String).join('\n')}`);
  }
  if (descriptor.scriptSetup == null && descriptor.script == null) {
    throw new Error(`Vue SFC ${filename} has no <script> / <script setup> block`);
  }
  // inlineTemplate folds the <template> render fn into setup(): one module, one `export
  // default`. Only valid with <script setup>, which the canary uses.
  const compiled = compileScript(descriptor, {
    id: scopeIdFor(filename),
    inlineTemplate: true,
  });
  // Point every Vue import (the compiler's injected helpers AND the user's own
  // `import { ref } from 'vue'`) at runtime-core, the same singleton the @symbiote/vue
  // adapter builds its custom renderer on. No vue/runtime-dom in a native bundle.
  return compiled.content.replace(/from\s*(['"])vue\1/g, 'from "@vue/runtime-core"');
}

module.exports.transform = function transform(params) {
  if (params.filename.endsWith('.vue')) {
    const code = compileSfc(params.src, params.filename);
    // Re-label as .tsx so RN's transformer strips any TS from <script setup lang="ts"> and
    // processes the module exactly like app source. Metro tracks the real path separately.
    return upstreamTransformer.transform({
      ...params,
      src: code,
      filename: params.filename + '.tsx',
    });
  }
  return upstreamTransformer.transform(params);
};

// Surface the upstream cache key so RN preset changes still bust Metro's cache. The SFC
// step itself is invalidated by `--reset-cache` (mirrors the babel DEBUG-inline note).
module.exports.getCacheKey = upstreamTransformer.getCacheKey;
