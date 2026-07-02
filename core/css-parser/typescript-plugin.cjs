// @symbiote/css-parser/typescript-plugin — a TypeScript language-service plugin that gives live,
// in-editor autocomplete AND typo-catching for a standalone `.module.css` import
// (`import styles from './Card.module.css'`). No terminal, no watch process, no generation step
// a developer has to remember to run: it hooks into the IDE's OWN TS server (VS Code/WebStorm),
// so it recomputes on every keystroke the same way the rest of tsserver already does. This is
// the piece that makes "does the user need to keep something running" a non-question for the
// live-editing case; generate-dts-cli.ts (`css-dts`, wired to `pretypecheck`) remains the
// separate, on-disk source of truth for `tsc`/`vue-tsc` CLI runs — plugins never load there.
//
// Ported from wolf-tui's `@wolf-tui/typescript-plugin` (wolf-tui/packages/typescript-plugin/
// src/index.ts) — same core mechanism (override getScriptSnapshot + resolveModuleNameLiterals to
// synthesize a virtual .d.ts for the import), fixing two real bugs found by reading that source
// directly: (1) its class extractor never converts kebab-case to camelCase, so a suggested key
// like `section-tight` does NOT match the ACTUAL exported key our runtime produces
// (@symbiote/css-parser's parseCSS always camelCases — see src/generate-dts.ts's
// classNamesToDtsSource, which this plugin's dts shape mirrors); (2) its dts cache never
// invalidates, so autocomplete goes stale after editing the CSS file until the IDE restarts
// tsserver — this version keys the cache on the file's mtime instead. wolf-tui's package.json
// also lists a real dependency on `@wolf-tui/css-parser` that its index.ts never actually
// imports — a leftover of an abandoned attempt to reuse it directly, for the same reason
// explained below.
//
// SCOPE: plain `.module.css` only, not `.module.scss`/`.module.less`/`.module.styl` —
// getScriptSnapshot must be fully SYNCHRONOUS (tsserver's plugin protocol has no async hook), and
// while Sass has a genuine sync compile API, Less and Stylus do not (see src/preprocessors.ts) —
// a correct, non-approximated preprocessor pipeline can't run here today. Those files still get
// basic (non-literal) type coverage from the project's ambient `.css` fallback declaration and
// from `css-dts`'s on-disk generation at pretypecheck time — just without live per-class
// completion in the plugin. A real follow-up, not a silent gap: recorded here, not hidden.
//
// SCOPE, second cut: only a SIMPLE `.foo { ... }` class selector is recognized correctly — a
// compound (`.btn.primary`) or descendant (`.card .title`) selector, which the real
// src/parser.ts's extractClassName merges into ONE key (`btnPrimary`/`cardTitle`), gets
// extracted here as TWO separate (wrong, non-existent) keys instead. Same accepted limitation
// wolf-tui's own README documents for its regex approach ("complex selectors may not be
// detected").
//
// Hand-written plain CommonJS, NOT compiled from a `.ts`/`.cts` source — same convention already
// used for each adapter's metro-css-parser.cjs shim (see the symbiote-sfc-style-compiler skill's
// "Distribution" section). tsserver loads a plugin via a synchronous `require()`, which cannot
// load this package's own ESM build output; a `.cts` source was tried first and rejected because
// this package's shared tsconfig (`moduleResolution: "Bundler"`, needed for the rest of the
// package) doesn't apply the classic .cts→CJS format-forcing TypeScript otherwise gives Node16/
// NodeNext projects — carving out a second tsconfig/project reference just for one file was more
// machinery than a ~150-line, dependency-free plugin warrants.
'use strict';

const fs = require('node:fs');

const CSS_MODULE_RE = /\.module\.css$/;
const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function isCssModuleFile(fileName) {
  return CSS_MODULE_RE.test(fileName);
}

function kebabToCamel(value) {
  return value.replace(/-([a-z0-9])/gi, (_match, char) => char.toUpperCase());
}

function extractClassNames(css) {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const names = new Set();
  const classRe = /\.([a-zA-Z_][\w-]*)/g;
  let match;
  while ((match = classRe.exec(withoutComments))) {
    names.add(kebabToCamel(match[1]));
  }
  return [...names];
}

function generateDts(classNames) {
  if (classNames.length === 0) {
    return 'declare const styles: Record<string, string>;\nexport default styles;\n';
  }

  const fields = [...classNames]
    .sort()
    .map((name) => {
      const key = IDENTIFIER_RE.test(name) ? name : JSON.stringify(name);
      return `  readonly ${key}: string;`;
    })
    .join('\n');

  return `declare const styles: {\n${fields}\n};\nexport default styles;\n`;
}

function resolveRelativePath(moduleName, containingFile) {
  const dir = containingFile.slice(0, containingFile.lastIndexOf('/'));
  const parts = dir.split('/');
  for (const part of moduleName.split('/')) {
    if (part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}

function init(modules) {
  const typescript = modules.typescript;

  function create(info) {
    const host = info.languageServiceHost;
    const dtsCache = new Map();

    function getDtsForCssFile(cssPath) {
      let mtimeMs = 0;
      try {
        mtimeMs = fs.statSync(cssPath).mtimeMs;
      } catch {
        // missing file — falls through to a fresh (empty) read below, no cache to hit anyway
      }

      const cached = dtsCache.get(cssPath);
      if (cached && cached.mtimeMs === mtimeMs) return cached.dts;

      const content = host.readFile ? (host.readFile(cssPath) ?? '') : '';
      const dts = generateDts(extractClassNames(content));
      dtsCache.set(cssPath, { mtimeMs, dts });
      return dts;
    }

    const originalGetScriptKind = host.getScriptKind ? host.getScriptKind.bind(host) : undefined;
    const originalGetScriptSnapshot = host.getScriptSnapshot.bind(host);
    const originalResolveModuleNameLiterals = host.resolveModuleNameLiterals;

    host.getScriptKind = (fileName) =>
      isCssModuleFile(fileName)
        ? typescript.ScriptKind.TS
        : (originalGetScriptKind ? originalGetScriptKind(fileName) : typescript.ScriptKind.Unknown);

    host.getScriptSnapshot = (fileName) =>
      isCssModuleFile(fileName)
        ? typescript.ScriptSnapshot.fromString(getDtsForCssFile(fileName))
        : originalGetScriptSnapshot(fileName);

    if (originalResolveModuleNameLiterals) {
      host.resolveModuleNameLiterals = (
        literals,
        containingFile,
        redirectedReference,
        options,
        sourceFile,
        reusedNames,
      ) => {
        const resolved = originalResolveModuleNameLiterals.call(
          host,
          literals,
          containingFile,
          redirectedReference,
          options,
          sourceFile,
          reusedNames,
        );

        return literals.map((literal, index) => {
          const moduleName = literal.text;
          if (isCssModuleFile(moduleName) && moduleName.startsWith('.')) {
            const resolvedPath = resolveRelativePath(moduleName, containingFile);
            if (host.fileExists && host.fileExists(resolvedPath)) {
              return {
                resolvedModule: {
                  resolvedFileName: resolvedPath,
                  extension: typescript.Extension.Dts,
                  isExternalLibraryImport: false,
                },
              };
            }
          }
          return resolved[index];
        });
      };
    }

    return info.languageService;
  }

  return { create };
}

module.exports = init;
