// Wires @symbiotejs/css-parser's ready-made Metro transformer (compiles standalone
// .css/.module.css imports, delegates everything else to RN's own babel transformer) — the
// framework-agnostic path, same compiler the Vue example's inline <style> blocks use
// (examples/vue-sfc/metro-vue-transformer.js), just without an SFC wrapping it.
// `import styles from './card.module.css'` and `import './theme.css'` both work from this
// example's .ts files exactly like from React's or Vue's. This app does NOT need its own
// @symbiotejs/css-parser devDependency: @symbiotejs/angular/metro-css-parser re-exports it from
// INSIDE the adapter package, where css-parser resolves as a real dependency — Node resolves
// each require() relative to the requiring file's own location, so requiring through the
// adapter is what removes the extra install step. See the symbiote-sfc-style-compiler skill.
//
// @react-native/metro-babel-transformer is NOT reliably hoisted into this app's own
// node_modules the way it is for the React/Vue examples (a pnpm hoisting quirk specific to this
// package's dependency graph — react-native IS a real, direct dependency here too, confirmed
// via `pnpm why`, it simply isn't flattened to the top level). require.resolve with an explicit
// `paths` anchor, starting from @react-native/metro-config's own installed location (which IS
// always resolvable — metro-config depends on metro-babel-transformer itself, and pnpm
// guarantees a package can resolve its own dependencies from its own store location regardless
// of how the top-level app's node_modules got hoisted), sidesteps the whole issue instead of
// depending on hoisting to place it at this file's own level.
const path = require('path');
const metroConfigPkgPath = require.resolve('@react-native/metro-config/package.json');
const upstreamTransformer = require(
  require.resolve('@react-native/metro-babel-transformer', { paths: [path.dirname(metroConfigPkgPath)] }),
);
const { createCssMetroTransformer } = require('@symbiotejs/angular/metro-css-parser');

module.exports = createCssMetroTransformer(upstreamTransformer);
