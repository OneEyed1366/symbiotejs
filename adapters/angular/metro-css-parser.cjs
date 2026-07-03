// Re-exports @symbiotejs/css-parser verbatim from INSIDE this package, so a consuming app's own
// require('@symbiotejs/angular/metro-css-parser') resolves css-parser relative to THIS file's
// location (adapters/angular/node_modules, where css-parser IS a real dependency — see
// package.json), not relative to the app's own node_modules, which does not and should not
// need to declare @symbiotejs/css-parser itself. Node resolves each require() relative to the
// requiring FILE's own location, so this indirection is what actually removes the extra install
// step, not pnpm hoisting (which does not propagate this transitively across workspace packages
// the way a flat classic node_modules would). .cjs, not .js: this package is "type": "module",
// and Metro's babelTransformerPath loading expects a require()-able module. See the
// symbiote-sfc-style-compiler skill.
module.exports = require('@symbiotejs/css-parser');
