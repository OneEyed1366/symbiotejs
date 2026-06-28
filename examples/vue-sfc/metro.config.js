const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, '../..');
const enginePkg = path.resolve(repoRoot, 'core/engine');
const componentsPkg = path.resolve(repoRoot, 'core/components');
const vuePkg = path.resolve(repoRoot, 'adapters/vue');

const defaultConfig = getDefaultConfig(projectRoot);

/**
 * Metro is pointed straight at our packages' TypeScript source; there is no build step.
 * @react-native/babel-preset strips the types. react and @vue/runtime-core are pinned to
 * the app's single copies so the Vue adapter and the app share one Vue runtime. Vue's
 * reactivity is a singleton, so two copies would silently fail to react.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  // Compile .vue SFCs on the way into the bundle (see metro-vue-transformer.js).
  transformer: {
    babelTransformerPath: require.resolve('./metro-vue-transformer.js'),
  },
  // Watch the whole monorepo: examples/* are now pnpm-workspace packages whose deps
  // (react, @babel/runtime, …) are symlinked into the repo-root `.pnpm` store, so Metro
  // must treat repoRoot as a watched root to follow those symlinks (ADR 0025 / 0026).
  watchFolders: [repoRoot],
  resolver: {
    // Teach Metro that .vue is a source file (the transformer turns it into a module).
    sourceExts: [...defaultConfig.resolver.sourceExts, 'vue'],
    extraNodeModules: {
      '@symbiote/engine': enginePkg,
      '@symbiote/components': componentsPkg,
      '@symbiote/vue': vuePkg,
      react: path.resolve(projectRoot, 'node_modules/react'),
      '@vue/runtime-core': path.resolve(projectRoot, 'node_modules/@vue/runtime-core'),
    },
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(repoRoot, 'node_modules'),
    ],
  },
};

module.exports = mergeConfig(defaultConfig, config);
