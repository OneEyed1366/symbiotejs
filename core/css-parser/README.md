# @symbiotejs/css-parser

The **build-time CSS compiler** of [SymbioteJS](../../README.md) — turns a Vue SFC `<style>` block,
or a standalone `.css`/`.module.css` file, into a React Native style object at build time, resolved
back at render time through a class-name registry shared by every adapter (React's `className`,
Vue's `class`/`:class`, Angular's `addClass`/`removeClass`). It also compiles SCSS/Sass, Less, and
Stylus sources down to plain CSS before the same pipeline runs, so scoped styles, `:global()`, and
CSS Modules all work identically regardless of source language.

> New to SymbioteJS? The [root README](../../README.md) has the architecture. Styling with CSS
> classes (instead of `StyleSheet.create`) is the supported convention across every example app —
> this package is what makes it work at build time; [`@symbiotejs/engine`](../engine)'s
> `style-registry` is what resolves it at runtime.

---

## Who calls this, and how

**An app never imports this package directly.** It runs only inside a Metro transformer, on the
Node build machine — never shipped in the app's native JS bundle. Each adapter package
(`@symbiotejs/react`, `@symbiotejs/vue`, `@symbiotejs/angular`) depends on `@symbiotejs/css-parser`
as a regular dependency and re-exports it via its own `./metro-css-parser` subpath, so a consuming
app's `metro.config.js` wires:

```js
// metro-css-transformer.js, in the app
const { createCssMetroTransformer } = require('@symbiotejs/react/metro-css-parser');
module.exports = createCssMetroTransformer(require('@react-native/metro-babel-transformer'));
```

```js
// metro.config.js
resolver: { sourceExts: [...defaultSourceExts, 'css', 'scss', 'sass', 'less', 'styl'] },
transformer: { babelTransformerPath: require.resolve('./metro-css-transformer.js') },
```

From there, a plain stylesheet import just works, from any adapter's own source file:

```ts
import styles from './Card.module.css';   // CSS Modules — default export is a name→scopedName map
import './theme.css';                     // plain CSS — registers classes globally, no export
```

```tsx
<View className="card" style={styles.highlight} />   // React
```
```html
<!-- Vue SFC -->
<view :class="['card', { active: isActive }]" />
<style scoped>.card { padding: 10px; }</style>
```

## The pipeline

```
<style> CSS text / .css / .scss / .less / .styl        class="foo" / className / addClass
      │  (build time, Metro)                                       │  (runtime, all adapters)
      ▼                                                             ▼
@symbiotejs/css-parser                              @symbiotejs/engine's style-registry
  preprocessors.ts → parser.ts (parseCSS)            registerStyles() / resolveClassName()
```

A preprocessor source is reduced to plain CSS text first (`compileScss`/`compileSass`/
`compileLess`/`compileStylus`); `parseCSS()` is the single downstream consumer either way, so every
mechanism below runs identically regardless of source language.

## API surface

```ts
import {
  parseCSS, extractClassName, kebabToCamel,       // core compiler
  compileCssFile, isCssModuleFile,                 // standalone .css/.module.css files
  createCssMetroTransformer,                       // Metro babelTransformerPath factory
  compileScss, compileSass, compileLess, compileStylus, compile, detectLanguage, isStyleFile,
  classNamesToDtsSource, generateModuleDts,        // .d.ts generation for CSS Modules typing
  globalClassNamesIn, hashFilePath,
} from '@symbiotejs/css-parser';
```

- **`parseCSS(css, { filename? })`** — the compiler core: postcss AST walk, `var()`/`calc()`
  resolution, selector → camelCase key (`.card` → `card`, `.btn.primary` → `btnPrimary` compound,
  `.card .title` → `cardTitle` descendant). A selector containing a pseudo-class (`:hover`, …) is
  dropped whole — RN has no pseudo-class concept, so there is no partial-application semantics to
  preserve.
- **`compileCssFile` / `isCssModuleFile`** — the standalone-file form: `Card.module.css`'s classes
  are always scoped to a per-file hash and its default export is the name→scopedName map; a plain
  `.css` file registers globally via a side-effect import.
- **`createCssMetroTransformer`** — wraps an upstream RN Babel transformer, detecting a stylesheet
  extension and compiling it before delegating everything else unchanged.
- **Preprocessors** — `sass`/`less`/`stylus` are lazy, **optional** `devDependencies`: a project
  that never authors `.scss`/`.less`/`.styl` never installs any of the three.
- **CSS Modules type safety** — `css-dts` (bin) walks a directory and writes a real `<file>.d.ts`
  next to each `.module.css`/`.scss`/`.less`/`.styl` (no index signature, so a typo genuinely fails
  `tsc`), wired as a `pretypecheck` script; `./typescript-plugin` is a language-service plugin for
  live in-editor autocomplete. Both are needed — a `tsconfig.json` plugin is invisible to a
  standalone `tsc`/CI run, and the on-disk `.d.ts` gives no live-while-typing feedback.

## What it does NOT do

- It does not run at app runtime — it is a Node-only, Metro-build-time tool; the runtime half
  (resolving a class name back into a style object) lives in `@symbiotejs/engine`'s
  `style-registry`, not here.
- It does not implement Tailwind CSS — that needs whole-project class scanning and JIT utility
  generation, a fundamentally different shape than "one source file reduces to CSS text", and is
  being designed as a separate, future package.
- It supports `scoped` / `:global()` / CSS Modules and SCSS/Sass/Less/Stylus preprocessing; it does
  not yet generate a typed `.d.ts` for an **inline** Vue `<style module>` block (only standalone
  `.module.css` files get the strict, no-index-signature type — Vue's own Volar plugin gives inline
  blocks a looser, typo-tolerant type for free) and has no Svelte support yet (no Svelte adapter
  exists in SymbioteJS today).

## Related packages

- [`@symbiotejs/engine`](../engine) — owns the runtime `style-registry` (`registerStyles` /
  `resolveClassName`) this package's compiled output resolves against, and the class+style merge
  used by every adapter.
- [`@symbiotejs/react`](../../adapters/react) / [`@symbiotejs/vue`](../../adapters/vue) /
  [`@symbiotejs/angular`](../../adapters/angular) — each depends on this package directly and
  re-exports it via its own `./metro-css-parser` subpath, so a consuming app needs no extra install
  step.

## Test it

```bash
pnpm test              # vitest, from the workspace root — parser, preprocessors, metro transformer
```
