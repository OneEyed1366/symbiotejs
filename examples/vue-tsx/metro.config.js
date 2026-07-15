const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const projectRoot = __dirname;

const defaultConfig = getDefaultConfig(projectRoot);

/**
 * @symbiote-native/* and @vue/runtime-core resolve as ordinary npm packages from this app's
 * own node_modules (examples/* is a standalone npm install, decoupled from the monorepo's
 * pnpm workspace — see pnpm-workspace.yaml). @react-native/babel-preset strips the types.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const runtimeCore = path.resolve(projectRoot, 'node_modules/@vue/runtime-core');

const config = {
  // JSX is still compiled by @vue/babel-plugin-jsx via babel.config.js regardless of which
  // transformer runs it (unlike the SFC canary, which needs a Metro transformer to compile
  // .vue) — @symbiote-native/vue ships the standalone .css/.module.css transformer itself
  // (same framework-agnostic path the React and Angular examples use via their own adapter's
  // ./metro-css-parser export), so no local wiring file is needed here either.
  transformer: {
    babelTransformerPath: require.resolve('@symbiote-native/vue/metro-css-parser'),
  },
  resolver: {
    // Teach Metro that a style file is a source file (the transformer turns it into a module).
    // scss/sass/less/styl are optional SCSS/Sass/Less/Stylus preprocessor sources — see
    // core/css-parser/src/preprocessors.ts.
    sourceExts: [...defaultConfig.resolver.sourceExts, 'css', 'scss', 'sass', 'less', 'styl'],
    extraNodeModules: {
      // @vue/babel-plugin-jsx injects helper imports `from 'vue'`; there is no vue/runtime-dom
      // in a native bundle, and this app never installs the `vue` package itself (only
      // @vue/runtime-core), so the bare 'vue' specifier is aliased to the runtime-core
      // singleton the adapter renders on (the resolver twin of the SFC transformer's
      // 'vue'→runtime-core string rewrite).
      vue: runtimeCore,
    },
  },
};

module.exports = mergeConfig(defaultConfig, config);
