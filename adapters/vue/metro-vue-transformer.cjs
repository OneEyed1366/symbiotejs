// Metro babel transformer that teaches the bundler to read Vue SFCs (.vue). Metro has no
// Vue plugin (unplugin-vue ships vite/webpack/esbuild/rollup adapters, not Metro), so we do
// the single-pass compile here: parse the SFC, compile <script setup> + <template> into one
// component module, then hand the JS to RN's own babel transformer. This is the Metro twin
// of what @vitejs/plugin-vue does for Vite; the 'vue'→runtime-core rewrite is needed because
// a custom, non-DOM renderer needs the compiler helpers from @vue/runtime-core, not from
// vue/runtime-dom.
//
// Retargeted at @symbiote-native/vue/runtime-helpers rather than bare @vue/runtime-core: that shim
// re-exports runtime-core verbatim PLUS supplies our own `vShow` (compiled v-show imports it by
// name, and only @vue/runtime-dom's DOM-based version exists otherwise).
//
// Ships as a package-level export (`@symbiote-native/vue/metro-vue-transformer`) rather than living
// in each consuming app: a consumer's own metro.config.js just points babelTransformerPath at it.

const nodeFs = require('fs');
const { parse, compileScript, registerTS } = require('@vue/compiler-sfc');
const { createCompoundExpression } = require('@vue/compiler-core');

// A bare-specifier type import (`import type { X } from '@symbiote-native/navigation/vue'`, as
// opposed to a relative one) needs real node_modules resolution (package.json exports, pnpm
// symlinks) to turn the specifier into a file path — compileScript's own `fs` option only reads
// paths it's already given, it can't do that resolution. @vue/compiler-sfc's sanctioned hook for
// this is `registerTS`, the same one @vitejs/plugin-vue and vue-tsc call: it hands the compiler a
// lazy loader for the real `typescript` package, which resolves the specifier via
// `ts.resolveModuleName` and self-supplies `ts.sys` as the fs fallback.
registerTS(() => require('typescript'));
// @symbiote-native/css-parser is a real dependency of THIS package, so requiring it directly here
// (rather than through the ./metro-css-parser public subpath, which exists for CONSUMERS) resolves
// straight from this package's own node_modules under pnpm.
const {
  compile: compilePreprocessor,
  compileCssFile,
  globalClassNamesIn,
  hashFilePath,
  isStyleFile,
  kebabToCamel,
  parseCSS,
  resolveUpstreamTransformer,
} = require('@symbiote-native/css-parser');

const upstreamTransformer = resolveUpstreamTransformer();

// compileScript needs file system access to resolve a type-only `defineProps<ISomeProps>()`
// where ISomeProps is imported from another file — without it, Metro's worker process (a real
// Node process, but one @vue/compiler-sfc doesn't auto-detect as Node unless the consumer calls
// its `registerTS` hook) throws "No fs option provided ... in non-Node environment". Wiring
// Node's own `fs` module straight through is simpler than registering the `typescript` package
// as a loader (registerTS), and this file already runs in Node at Metro build time.
const compileScriptFs = {
  fileExists: (file) => nodeFs.existsSync(file),
  readFile: (file) => {
    try {
      return nodeFs.readFileSync(file, 'utf-8');
    } catch {
      return undefined;
    }
  },
};

// Rewrites a Vue template AST so every `class`/`:class` binding on an element resolves
// against this file's scoped class names at the compiled call site, via @symbiote-native/engine's
// scopeClassName(value, localNames, scopeId). This runs at the AST level rather than as a
// raw-text regex: Vue itself merges a static `class=`
// and a dynamic `:class=` on the same element into ONE codegen entry, and text substitution
// can't reproduce that merge safely; letting Vue's own transformElement do the merge on our
// already-rewritten nodes reuses that logic instead of reimplementing it).
//
// A static class="foo bar" attribute is a plain AttributeNode (prop.type === 6): its value is
// resolved to the final string directly here, at compile time — no runtime call needed for the
// purely-static case, since every token is already known. Each token is normalized kebab->camel
// FIRST (kebabToCamel) — a template may write class="section-label" (idiomatic CSS) instead of
// class="sectionLabel"; the css-parser always registers the CAMEL form, and localNames (built
// from that same registration) is camelCase-keyed, so the scoping check below only recognizes a
// token once it is in that form. The emitted string is always camelCase, suffixed or not.
//
// A dynamic :class="expr" is a `bind` DirectiveNode (prop.type === 7) targeting the `class`
// arg. Vue's own transformExpression has ALREADY run by the time our transform sees it (node
// transforms are appended after the built-in preset, per @vue/compiler-core's TransformOptions
// merge order), so prop.exp is usually a COMPOUND_EXPRESSION (type 8, a `children` array mixing
// literal source chunks with resolved identifier nodes), not a plain string — a bare identifier
// binding (`:class="dynamicClass"`) is the one case that stays a SIMPLE_EXPRESSION (type 4).
// Either way, `createCompoundExpression` wraps the ORIGINAL exp node (whichever shape it is) as
// a single child inside `scopeClassName(<original>, __localScopedClassNames, __scopeId)`, so
// codegen emits the call with the original expression source reproduced unchanged inside it —
// this needs no per-shape branching, and correctly defers even a fully opaque runtime value
// (`:class="dynamicClass"`) to scopeClassName's own runtime token-matching, so there is no
// unresolved gap for dynamic scoped classes.
function createScopeClassNodeTransform(localNames, scopeId) {
  return function scopeClassNodeTransform(node) {
    if (node.type !== 1 /* NodeTypes.ELEMENT */) return;

    for (const prop of node.props) {
      if (prop.type === 6 /* NodeTypes.ATTRIBUTE */ && prop.name === 'class' && prop.value) {
        prop.value.content = prop.value.content
          .split(/\s+/)
          .filter(Boolean)
          .map((token) => {
            const camelToken = kebabToCamel(token);
            return localNames.has(camelToken) ? `${camelToken}__${scopeId}` : camelToken;
          })
          .join(' ');
        continue;
      }

      if (
        prop.type === 7 /* NodeTypes.DIRECTIVE */ &&
        prop.name === 'bind' &&
        prop.arg &&
        prop.arg.type === 4 /* NodeTypes.SIMPLE_EXPRESSION */ &&
        prop.arg.content === 'class' &&
        prop.exp
      ) {
        prop.exp = createCompoundExpression(
          ['__scopeClass(', prop.exp, ', __localScopedClassNames, __scopeId)'],
          prop.exp.loc,
        );
      }
    }
  };
}

// A short, stable id per file, used as the SFC scope id (compileScript wants one regardless of
// whether the file has scoped styles) — Vue's own `data-v-hash` naming convention, built on
// @symbiote-native/css-parser's shared hashFilePath so the algorithm isn't duplicated against the
// standalone .module.css compiler's identical need (metro-css-module.ts).
function scopeIdFor(filename) {
  return 'data-v-' + hashFilePath(filename);
}

// An SFC style block's `lang` attribute names a preprocessor language directly (`lang="scss"`),
// unlike a standalone file, which is identified by its extension — so this is its own small
// lookup rather than reusing detectLanguage(), which is extension-keyed.
const SFC_STYLE_LANG_TO_PREPROCESSOR = new Map([
  ['scss', 'scss'],
  ['sass', 'scss'],
  ['less', 'less'],
  ['stylus', 'stylus'],
]);

// Reduces one <style> block down to plain CSS text. A lang-less or lang="css" block passes
// through unchanged, exactly as before. Anything outside the four recognized preprocessor langs
// (a typo, or a genuinely unsupported lang) still throws, same message as before this feature
// existed.
async function compileStyleBlockContent(style, filename) {
  if (style.lang == null || style.lang === 'css') return style.content;

  const preprocessorLang = SFC_STYLE_LANG_TO_PREPROCESSOR.get(style.lang);
  if (!preprocessorLang) {
    throw new Error(`SFC style lang="${style.lang}" not supported yet — plain CSS only`);
  }

  // Sass' `.sass` indented syntax and `.scss` syntax share one compiler entry point that picks
  // between them off the file extension (see preprocessors.ts's compileScss) — an inline SFC
  // style block has no file of its own, so a synthetic `.sass`-suffixed path is the only way to
  // select the indented syntax. Every other preprocessor only uses the path for relative-import
  // resolution (dirname), where the real .vue file's own path is correct as-is.
  const syntheticPath = style.lang === 'sass' ? `${filename}.sass` : filename;
  return compilePreprocessor(style.content, preprocessorLang, syntheticPath);
}

async function compileSfc(src, filename) {
  const { descriptor, errors } = parse(src, { filename });
  if (errors && errors.length > 0) {
    throw new Error(`Vue SFC parse error in ${filename}:\n${errors.map(String).join('\n')}`);
  }
  if (descriptor.scriptSetup == null && descriptor.script == null) {
    throw new Error(`Vue SFC ${filename} has no <script> / <script setup> block`);
  }

  const scopeId = scopeIdFor(filename);

  // `descriptor.styles` is already parsed by @vue/compiler-sfc itself (one entry per <style>
  // block, `.content` pre-trimmed, `.scoped` already a plain boolean flag), so there's no need
  // to re-extract style blocks with a regex.
  //
  // A scoped block's classes get their key SUFFIXED with this file's scopeId before
  // registration (`card` -> `card__data-v-xxxxxxxx`), so two components can each define their
  // own `.card` without colliding in the shared global registry — mirroring what Vue's own
  // `data-v-hash` attribute does for DOM targets, just as a name suffix instead of an attribute
  // selector (we have neither DOM nor attribute-selector matching). An unscoped block's classes
  // register exactly as before: no suffix, globally shared. `:global(...)` selectors inside a
  // scoped block are the one exception — @symbiote-native/css-parser already unwraps them to their
  // plain class name (`:global(.reset)` parses like `.reset`), so `globalClassNamesIn` re-scans
  // the block's own raw text to find which specific keys should be exempted from suffixing.
  //
  // Cascade multiple blocks last-block-wins, same as CSS — this holds across scoped/unscoped
  // blocks too: only each block's OWN css-parser output is scoped independently, then merged.
  //
  // <style module> (CSS Modules) reuses this exact suffixing machinery instead of a separate
  // pipeline: `.card` still goes through parseCSS unchanged and still registers via the same
  // registerStyles() call, just under a suffixed key — the only new output is a plain name->
  // scopedName object (`$style` by default, or the block's `module="name"` value) emitted as a
  // preamble const, so `:class="$style.card"` passes the already-scoped string straight to
  // resolveClassName's existing exact-match path (no registry changes needed). Unlike `scoped`, a module block's classes are NEVER
  // auto-applied to a literal class="..." attribute — CSS Modules is opt-in per usage via
  // `$style.x`, so module classes are kept out of `localScopedNames` (the nodeTransform only
  // rewrites literal class strings for `scoped` blocks). The registry key gets an extra
  // `module` tag (`card__module__<scopeId>`, vs scoped's plain `card__<scopeId>`) so a file
  // that happens to mix `<style scoped>` and `<style module>` with the same class name can't
  // collide in the shared registry.
  const styles = {};
  const localScopedNames = new Set();
  const cssModuleBindings = new Map();

  for (const style of descriptor.styles) {
    // Reduces a preprocessor block down to plain CSS text BEFORE any of the scoping logic
    // below runs — that logic is entirely language-agnostic, it only ever sees parseCSS's
    // plain-CSS output, same as it always did for a lang-less/lang="css" block. Anything other
    // than the four recognized preprocessor langs (a typo, or a genuinely unsupported lang)
    // still throws, unchanged from before.
    const content = await compileStyleBlockContent(style, filename);
    const parsed = parseCSS(content, { filename });

    if (style.module) {
      const bindingName = typeof style.module === 'string' ? style.module : '$style';
      // Scanned against the COMPILED content, not style.content: :global(...) isn't native
      // SCSS/Less/Stylus syntax (each preprocessor passes an unrecognized selector through
      // unchanged), but scanning the compiler's actual output can't drift under nesting/
      // interpolation the way assuming source-and-output stay textually identical could.
      const exemptFromScope = globalClassNamesIn(content);
      const classMap = cssModuleBindings.get(bindingName) ?? {};
      for (const [className, props] of Object.entries(parsed)) {
        const isExempt = exemptFromScope.has(className);
        const registeredName = isExempt ? className : `${className}__module__${scopeId}`;
        classMap[className] = registeredName;
        styles[registeredName] = { ...styles[registeredName], ...props };
      }
      cssModuleBindings.set(bindingName, classMap);
    } else if (style.scoped) {
      const exemptFromScope = globalClassNamesIn(content);
      for (const [className, props] of Object.entries(parsed)) {
        const isExempt = exemptFromScope.has(className);
        const registeredName = isExempt ? className : `${className}__${scopeId}`;
        if (!isExempt) localScopedNames.add(className);
        styles[registeredName] = { ...styles[registeredName], ...props };
      }
    } else {
      for (const [className, props] of Object.entries(parsed)) {
        styles[className] = { ...styles[className], ...props };
      }
    }
  }

  // The nodeTransform rewrites every class/:class binding's compiled output to route through
  // scopeClassName() at the scoped names this file actually defines — skipped entirely (not
  // even passed to the compiler) when nothing in this file is scoped, so a .vue with only
  // unscoped/no styles compiles exactly as before, zero added runtime cost or behavior change.
  const templateOptions =
    localScopedNames.size > 0
      ? {
          compilerOptions: {
            nodeTransforms: [createScopeClassNodeTransform(localScopedNames, scopeId)],
          },
        }
      : undefined;

  // inlineTemplate folds the <template> render fn into setup(): one module, one `export
  // default`. Only valid with <script setup>, which the canary uses.
  const compiled = compileScript(descriptor, {
    id: scopeId,
    inlineTemplate: true,
    templateOptions,
    fs: compileScriptFs,
  });
  // Point every Vue import (the compiler's injected helpers AND the user's own
  // `import { ref } from 'vue'`) at the runtime-helpers shim, which re-exports the same
  // @vue/runtime-core singleton the @symbiote-native/vue adapter builds its custom renderer on, plus
  // our own directive implementations. No vue/runtime-dom in a native bundle.
  const code = compiled.content.replace(/from\s*(['"])vue\1/g, 'from "@symbiote-native/vue/runtime-helpers"');

  if (Object.keys(styles).length === 0) return code;

  // Only a scoped file needs scopeClassName + its two per-file constants — the nodeTransform
  // above only ever emits calls to `__scopeClass`/`__localScopedClassNames`/`__scopeId` when
  // localScopedNames is non-empty, so these stay unimported/undeclared (and absent from the
  // bundle) for every non-scoped .vue file.
  const engineImports =
    localScopedNames.size > 0 ? 'registerStyles, scopeClassName as __scopeClass' : 'registerStyles';

  const preamble = [`registerStyles(${JSON.stringify(styles)});`];
  if (localScopedNames.size > 0) {
    preamble.push(
      `const __localScopedClassNames = new Set(${JSON.stringify([...localScopedNames])});`,
      `const __scopeId = ${JSON.stringify(scopeId)};`,
    );
  }
  // Each <style module> binding becomes a plain top-level const holding its name->scopedName
  // map. Placed before the compiled `export default {...}`, so it's just a closed-over module
  // scope variable inside setup() — same trick registerStyles/__scopeId already rely on — and
  // usable both from the inlined template (`:class="$style.card"`) and from <script setup> code
  // itself (`$style.card`), no extra wiring needed on either side.
  for (const [bindingName, classMap] of cssModuleBindings) {
    preamble.push(`const ${bindingName} = ${JSON.stringify(classMap)};`);
  }

  return [`import { ${engineImports} } from '@symbiote-native/engine';`, ...preamble, code].join('\n') + '\n';
}

// Exported separately from `transform` so tests can assert on the compiled SFC output
// (imports, injected `registerStyles` call) without driving the full upstream RN Babel preset.
module.exports.compileSfc = compileSfc;

// Async uniformly, including the `.vue` and plain-passthrough branches that never touch a
// preprocessor: compileSfc() itself is async now (a scss/sass/less/stylus <style> block awaits
// preprocessors.ts's compile()), and Metro's own metro-transform-worker already
// `await transformer.transform(...)` before touching the result (confirmed by reading the
// installed metro-transform-worker source), so returning a Promise here is a supported,
// exercised shape, not a hack. A sync fast-path for
// the no-preprocessor branches would fork this function into two shapes to save a single
// microtask on a call that only ever runs at Metro build time, content-hash-cached — not worth
// the duplication.
module.exports.transform = async function transform(params) {
  if (params.filename.endsWith('.vue')) {
    const code = await compileSfc(params.src, params.filename);
    // Re-label as .tsx so RN's transformer strips any TS from <script setup lang="ts"> and
    // processes the module exactly like app source. Metro tracks the real path separately.
    return upstreamTransformer.transform({
      ...params,
      src: code,
      filename: params.filename + '.tsx',
    });
  }
  // A standalone style file (as opposed to a `.vue` file's own inline <style> block above) —
  // the framework-agnostic path (core/css-parser's compileCssFile), usable from this example's
  // .vue files exactly like from any other adapter's example. isStyleFile recognizes
  // .css/.scss/.sass/.less/.styl/.stylus (+ each .module.* twin).
  if (isStyleFile(params.filename)) {
    const { code } = await compileCssFile(params.src, params.filename);
    return upstreamTransformer.transform({ ...params, src: code, filename: params.filename + '.js' });
  }
  return upstreamTransformer.transform(params);
};

// Surface the upstream cache key so RN preset changes still bust Metro's cache. The SFC
// step itself is invalidated by `--reset-cache` (mirrors the babel DEBUG-inline note).
module.exports.getCacheKey = upstreamTransformer.getCacheKey;
