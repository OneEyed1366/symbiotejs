// A ready-made Metro babel transformer wrapper for .css/.scss/.sass/.less/.styl (+ their
// .module.* twins) support, so a consuming app's own metro.config.js needs only
// `babelTransformerPath: require.resolve('@symbiote-native/<adapter>/metro-css-parser')` instead of
// hand-rolling the "compile a style file, delegate everything else to upstream" boilerplate once
// per adapter's example. @symbiote-native/css-parser is a regular `dependency` of every adapter
// package (@symbiote-native/react, @symbiote-native/vue, @symbiote-native/angular), so this is
// transitively resolvable from any app that already depends on one of them — this repo's
// shamefully-hoist pnpm config (.npmrc) makes that resolvable without the app adding
// @symbiote-native/css-parser to its own package.json.
//
// Sync vs async: `transform()` is async uniformly, for every recognized style extension
// including plain `.css`. Metro's own `metro-transform-worker` already does
// `await transformer.transform(...)` before touching the result (confirmed by reading the
// installed metro-transform-worker source directly — `transformJSWithBabel` in its `index.js`),
// so a babelTransformerPath module's `transform()` returning a Promise is a supported, exercised
// shape, not a hack. SCSS/Less/Stylus compilation is inherently async in Node (Less ships no sync
// render API at all; Stylus's callback-based render must be Promise-wrapped; Sass's
// `compileString` does have a sync API, but the lazy `import('sass')` step itself is async
// either way — see preprocessors.ts). A sync fast-path could still be kept for plain `.css`, but
// that forks this function into two shapes to save a single microtask on a call that only ever
// runs at Metro build time, content-hash-cached, never a runtime hot path — not worth the
// duplication. `return upstreamTransformer.transform(...)` as the last line of an async function
// forwards whatever it returns (Promise or not) as this function's own resolved value with no
// extra `await` needed; Metro awaits the whole chain regardless.
import { createRequire } from 'node:module';
import { compileCssFile } from '../metro-css-module/index.ts';
import { isStyleFile } from '../preprocessors/index.ts';

export interface IMetroTransformParams {
  filename: string;
  src: string;
  [key: string]: unknown;
}

export interface IMetroTransformer {
  // May return a Promise (see the module-level comment) — `unknown` already covers that,
  // Metro's own transform worker awaits the call either way.
  transform: (params: IMetroTransformParams) => unknown;
  getCacheKey?: (...args: unknown[]) => string;
}

// @react-native/metro-babel-transformer is a real `dependency` of this package (not merely a
// peer/dev dep), so it lands in css-parser's OWN resolvable node_modules under pnpm — no
// hoisting or `paths`-anchored require.resolve trick needed, unlike the app-local workaround
// this replaces (formerly duplicated in every adapter's example metro-css-transformer.js).
// Exported (not just used internally) so a per-framework Metro transformer that ALSO needs to
// delegate to the upstream RN transformer (the Vue SFC transformer, for its non-.vue passthrough
// branch) can reuse this instead of its own fragile direct `require('@react-native/metro-babel-
// transformer')`, which would only resolve for an external install by accident of hoisting.
export function resolveUpstreamTransformer(): IMetroTransformer {
  const require = createRequire(import.meta.url);
  return require('@react-native/metro-babel-transformer');
}

export function createCssMetroTransformer(
  upstreamTransformer: IMetroTransformer = resolveUpstreamTransformer(),
): IMetroTransformer {
  return {
    async transform(params) {
      if (!isStyleFile(params.filename)) return upstreamTransformer.transform(params);
      const { code } = await compileCssFile(params.src, params.filename);
      return upstreamTransformer.transform({
        ...params,
        src: code,
        filename: `${params.filename}.js`,
      });
    },
    getCacheKey: upstreamTransformer.getCacheKey,
  };
}
