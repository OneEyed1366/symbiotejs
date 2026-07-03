const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, '../..');
const enginePkg = path.resolve(repoRoot, 'core/engine');
const componentsPkg = path.resolve(repoRoot, 'core/components');
const reactPkg = path.resolve(repoRoot, 'adapters/react');

/**
 * Metro is pointed straight at our packages' TypeScript source. There is no
 * build step. @react-native/babel-preset strips the types. react and
 * react-reconciler are pinned to the app's single copies so our adapter and the
 * app share one React instance.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const defaultConfig = getDefaultConfig(projectRoot);

const config = {
  // Compile standalone .css/.module.css imports on the way into the bundle (see
  // metro-css-transformer.js) — the framework-agnostic path, mirrored in the Vue and Angular
  // examples' own metro configs.
  transformer: {
    babelTransformerPath: require.resolve('./metro-css-transformer.js'),
  },
  // Watch the whole monorepo: examples/* are now pnpm-workspace packages whose deps
  // (react, @babel/runtime, …) are symlinked into the repo-root `.pnpm` store, so Metro
  // must treat repoRoot as a watched root to follow those symlinks (ADR 0025 / 0026).
  watchFolders: [repoRoot],
  resolver: {
    // Teach Metro that a style file is a source file (the transformer turns it into a module).
    // scss/sass/less/styl are optional SCSS/Sass/Less/Stylus preprocessor sources — see
    // core/css-parser/src/preprocessors.ts and the symbiote-sfc-style-compiler skill.
    sourceExts: [...defaultConfig.resolver.sourceExts, 'css', 'scss', 'sass', 'less', 'styl'],
    extraNodeModules: {
      '@symbiotejs/engine': enginePkg,
      '@symbiotejs/components': componentsPkg,
      '@symbiotejs/react': reactPkg,
      react: path.resolve(projectRoot, 'node_modules/react'),
      'react-reconciler': path.resolve(projectRoot, 'node_modules/react-reconciler'),
    },
    // App's own node_modules first, then the hoisted repo-root store where pnpm places
    // transitive deps like @babel/runtime.
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(repoRoot, 'node_modules'),
    ],
  },
};

module.exports = mergeConfig(defaultConfig, config);
