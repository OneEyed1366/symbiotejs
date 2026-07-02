// Wires @symbiote/css-parser's ready-made Metro transformer (compiles standalone
// .css/.module.css imports, delegates everything else to RN's own babel transformer) — the
// framework-agnostic path, same compiler the Vue example's inline <style> blocks use
// (examples/vue-sfc/metro-vue-transformer.js), just without an SFC wrapping it.
// `import styles from './Card.module.css'` and `import './theme.css'` both work from this
// example's .tsx files exactly like from Vue's or Angular's. This app does NOT need its own
// @symbiote/css-parser devDependency: @symbiote/react/metro-css-parser re-exports it from
// INSIDE the adapter package, where css-parser resolves as a real dependency — Node resolves
// each require() relative to the requiring file's own location, so requiring through the
// adapter is what removes the extra install step. See the symbiote-sfc-style-compiler skill.

const upstreamTransformer = require('@react-native/metro-babel-transformer');
const { createCssMetroTransformer } = require('@symbiote/react/metro-css-parser');

module.exports = createCssMetroTransformer(upstreamTransformer);
