// Wires @symbiotejs/css-parser's ready-made Metro transformer (compiles standalone
// .css/.module.css imports, delegates everything else to RN's own babel transformer) — the
// framework-agnostic path, same compiler the Vue SFC example's inline <style> blocks use
// (examples/vue-sfc/metro-vue-transformer.js), just without an SFC wrapping it. This app has
// no .vue files at all (JSX/TSX authored via @vue/babel-plugin-jsx, see babel.config.js), so
// standalone .css/.module.css imports are the ONLY CSS-class path available here.
// `import styles from './Card.module.css'` and `import './theme.css'` both work from this
// example's .tsx files exactly like from the React or Vue SFC examples. This app does NOT need
// its own @symbiotejs/css-parser devDependency: @symbiotejs/vue/metro-css-parser re-exports it from
// INSIDE the adapter package, where css-parser resolves as a real dependency — Node resolves
// each require() relative to the requiring file's own location, so requiring through the
// adapter is what removes the extra install step. See the symbiote-sfc-style-compiler skill.

const upstreamTransformer = require('@react-native/metro-babel-transformer');
const { createCssMetroTransformer } = require('@symbiotejs/vue/metro-css-parser');

module.exports = createCssMetroTransformer(upstreamTransformer);
