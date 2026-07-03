// Ambient module for a plain, side-effect-only `.css` import (`import './App.css'`) —
// @symbiotejs/css-parser compiles it at build time (Metro's babelTransformerPath, see
// metro-css-transformer.js) into a registerStyles() call; there's no runtime export to type.
// Mirrors examples/react/css.d.ts and examples/angular/css.d.ts. See the
// symbiote-sfc-style-compiler skill.
declare module '*.css';

// Generic (non-literal) fallback for a `.module.css` import — used by `tsc`/`vue-tsc` outside a
// file that already has its own generated `Card.module.css.d.ts` (see `css-dts`, wired to
// `pretypecheck`; a real per-file `.d.ts` takes priority over this wildcard once generated). The
// `@symbiotejs/vue/typescript-plugin` entry in tsconfig.json's `compilerOptions.plugins` gives the
// SAME per-file literal-key typing live in the editor — plugins never load for a standalone
// `tsc`/CI run, which is why both mechanisms exist side by side.
declare module '*.module.css' {
  const styles: Record<string, string>;
  export default styles;
}
