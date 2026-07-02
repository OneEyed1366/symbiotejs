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
const runtimeCore = path.resolve(projectRoot, 'node_modules/@vue/runtime-core');

const config = {
  // JSX is still compiled by @vue/babel-plugin-jsx via babel.config.js regardless of which
  // transformer runs it (unlike the SFC canary, which needs a Metro transformer to compile
  // .vue) — the custom transformer below only adds standalone .css/.module.css compilation
  // on top of the stock RN babel transformer, the same framework-agnostic path the React and
  // Angular examples wire (see metro-css-transformer.js).
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
      '@symbiote/engine': enginePkg,
      '@symbiote/components': componentsPkg,
      '@symbiote/vue': vuePkg,
      react: path.resolve(projectRoot, 'node_modules/react'),
      '@vue/runtime-core': runtimeCore,
      // @vue/babel-plugin-jsx injects helper imports `from 'vue'`; there is no vue/runtime-dom
      // in a native bundle, so the bare 'vue' specifier resolves to the runtime-core singleton
      // the adapter renders on (the resolver twin of the SFC transformer's 'vue'→runtime-core
      // string rewrite).
      vue: runtimeCore,
    },
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(repoRoot, 'node_modules'),
    ],
  },
};

module.exports = mergeConfig(defaultConfig, config);
