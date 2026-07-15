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
const config = {
  // Compile .vue SFCs on the way into the bundle — @symbiote-native/vue ships the transformer
  // itself, so no local wiring file is needed (see adapters/vue/metro-vue-transformer.cjs).
  transformer: {
    babelTransformerPath: require.resolve('@symbiote-native/vue/metro-vue-transformer'),
  },
  resolver: {
    // Teach Metro that .vue and every style extension are source files (the transformer turns
    // each into a module) — css/scss/sass/less/styl is the framework-agnostic standalone
    // stylesheet/CSS-Modules path, shared with the React and Angular examples (see
    // metro-css-transformer.js there); scss/sass/less/styl are optional preprocessor sources
    // (see core/css-parser/src/preprocessors.ts).
    sourceExts: [...defaultConfig.resolver.sourceExts, 'vue', 'css', 'scss', 'sass', 'less', 'styl'],
  },
};

module.exports = mergeConfig(defaultConfig, config);
