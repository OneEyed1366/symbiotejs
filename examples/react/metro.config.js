const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const projectRoot = __dirname;

/**
 * @symbiote-native/* resolve as ordinary npm packages from this app's own node_modules
 * (examples/* is a standalone npm install, decoupled from the monorepo's pnpm workspace —
 * see pnpm-workspace.yaml). @react-native/babel-preset strips the types.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const defaultConfig = getDefaultConfig(projectRoot);

const config = {
  // Compile standalone .css/.module.css imports on the way into the bundle —
  // @symbiote-native/react ships this transformer itself, the framework-agnostic path
  // mirrored by the Vue and Angular examples' own adapter's ./metro-css-parser export.
  transformer: {
    babelTransformerPath: require.resolve('@symbiote-native/react/metro-css-parser'),
  },
  resolver: {
    // Teach Metro that a style file is a source file (the transformer turns it into a module).
    // scss/sass/less/styl are optional SCSS/Sass/Less/Stylus preprocessor sources handled by
    // core/css-parser/src/preprocessors.ts, which reduces each to plain CSS before compiling.
    sourceExts: [...defaultConfig.resolver.sourceExts, 'css', 'scss', 'sass', 'less', 'styl'],
  },
};

module.exports = mergeConfig(defaultConfig, config);
