const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { withSymbioteAngularMetroConfig } = require('@symbiote-native/angular/metro-config');

const projectRoot = __dirname;

const defaultConfig = getDefaultConfig(projectRoot);

/**
 * Angular is the one adapter that needs a pre-Metro compile step: ngc writes partial-Ivy JS,
 * then Babel's Angular linker plugin (babel.config.js) runs inside Metro and turns that
 * partial output into full Ivy. @symbiote-native/angular and @symbiote-native/slider build this
 * themselves via their own `prepare` script (runs automatically on `npm install`) and point
 * their package.json `exports`'s "react-native" condition straight at it — Metro's own
 * package-exports resolution (on by default: @react-native/metro-config sets
 * unstable_enablePackageExports + conditionNames ['react-native']) picks that up with no
 * custom resolveRequest needed here. @symbiote-native/* resolve as ordinary npm packages from
 * this app's own node_modules (examples/* is a standalone npm install, decoupled from the
 * monorepo's pnpm workspace — see pnpm-workspace.yaml).
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  // Compile standalone .css/.module.css imports on the way into the bundle —
  // @symbiote-native/angular ships the transformer itself, so no local wiring file is needed
  // (same framework-agnostic path the React and Vue examples use via their own adapter's
  // ./metro-css-parser export). Angular has no compiler-plugin conflict here: the ngc/linker
  // pipeline (see the block comment above) only ever sees .ts files, never .css.
  transformer: {
    babelTransformerPath: require.resolve('@symbiote-native/angular/metro-css-parser'),
  },
  resolver: {
    // sourceExts + the ngc-outDir CSS-redirect resolveRequest — see
    // adapters/angular/metro-config.cjs for the full mechanism.
    ...withSymbioteAngularMetroConfig(defaultConfig, projectRoot).resolver,
  },
};

module.exports = mergeConfig(defaultConfig, config);
