const fs = require('fs');
const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, '../..');
const enginePkg = path.resolve(repoRoot, 'core/engine');
const componentsPkg = path.resolve(repoRoot, 'core/components');

const defaultConfig = getDefaultConfig(projectRoot);

/**
 * Angular is the one adapter that needs a pre-Metro compile step: ngc writes partial-Ivy JS
 * (adapters/angular/build/angular, packages/slider/build-ngc/angular), then Babel's Angular
 * linker plugin (babel.config.js) runs inside Metro and turns that partial output into full
 * Ivy. Both packages build this themselves via their own `prepare` script (runs automatically
 * on `pnpm install`, in dependency order) and point their package.json `exports`'s
 * "react-native" condition straight at it — Metro's own package-exports resolution (on by
 * default: @react-native/metro-config sets unstable_enablePackageExports + conditionNames
 * ['react-native']) picks that up with no custom resolveRequest needed here.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  // Compile standalone .css/.module.css imports on the way into the bundle (see
  // metro-css-transformer.js) — the framework-agnostic path, mirrored in the React and Vue
  // examples' own metro configs. Angular has no compiler-plugin conflict here: the ngc/linker
  // pipeline (see the block comment above) only ever sees .ts files, never .css.
  transformer: {
    babelTransformerPath: require.resolve('./metro-css-transformer.js'),
  },
  watchFolders: [repoRoot],
  resolver: {
    // Teach Metro that a style file is a source file (the transformer turns it into a module).
    // scss/sass/less/styl are optional SCSS/Sass/Less/Stylus preprocessor sources — see
    // core/css-parser/src/preprocessors.ts and the symbiote-sfc-style-compiler skill.
    sourceExts: [...defaultConfig.resolver.sourceExts, 'css', 'scss', 'sass', 'less', 'styl'],
    // ngc mirrors this app's whole source tree into build/angular (see the block comment above),
    // but it only ever compiles .ts — a relative style import (`import './App.css'`) survives
    // untouched in the compiled .js, still pointing at the ORIGINAL source location, which ngc
    // never copies there. Metro resolves that relative specifier against the COMPILED file's own
    // location (build/angular/...), so without this it 404s on a build/angular/App.css that was
    // never created. Redirects such an import back to the real source file instead of copying it:
    // a copy would need its own re-copy on every CSS edit during `ng:watch` (which only re-runs
    // ngc on .ts changes), while this redirect lets Metro's own watchFolders — already covering
    // the whole repo — pick up a source-file CSS edit for free. Applies identically to a release
    // `react-native bundle`, which resolves through this same config.
    resolveRequest: (context, moduleName, platform) => {
      const isRelativeStyleImport =
        /^\.\.?\//.test(moduleName) && /\.(css|scss|sass|less|styl)$/.test(moduleName);
      if (isRelativeStyleImport) {
        const buildRoot = path.join(projectRoot, 'build', 'angular');
        const originDir = path.dirname(context.originModulePath);
        if (originDir === buildRoot || originDir.startsWith(buildRoot + path.sep)) {
          const sourceDir = path.join(projectRoot, path.relative(buildRoot, originDir));
          const sourceFile = path.resolve(sourceDir, moduleName);
          if (fs.existsSync(sourceFile)) {
            return { type: 'sourceFile', filePath: sourceFile };
          }
        }
      }
      return context.resolveRequest(context, moduleName, platform);
    },
    extraNodeModules: {
      '@symbiotejs/engine': enginePkg,
      '@symbiotejs/components': componentsPkg,
      '@angular/core': path.resolve(projectRoot, 'node_modules/@angular/core'),
      react: path.resolve(projectRoot, 'node_modules/react'),
    },
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(repoRoot, 'node_modules'),
    ],
  },
};

module.exports = mergeConfig(defaultConfig, config);
