// Re-exports @symbiote/css-parser verbatim from INSIDE this package, so a consuming app's own
// require('@symbiote/vue/metro-css-parser') resolves css-parser relative to THIS file's
// location (adapters/vue/node_modules, where css-parser IS a real dependency — see
// package.json), not relative to the app's own node_modules, which does not and should not
// need to declare @symbiote/css-parser itself. Node resolves each require() relative to the
// requiring FILE's own location, so this indirection is what actually removes the extra install
// step, not pnpm hoisting (which does not propagate this transitively across workspace packages
// the way a flat classic node_modules would). .cjs, not .js: this package is "type": "module",
// and Metro's babelTransformerPath loading expects a require()-able module. Used by
// examples/vue-sfc/metro-vue-transformer.js for BOTH its inline <style> block compilation and
// standalone .css/.module.css file imports. See the symbiote-sfc-style-compiler skill.
module.exports = require('@symbiote/css-parser');
