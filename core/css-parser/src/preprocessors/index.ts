// Optional SCSS/Sass, Less, and Stylus preprocessor support. Each compiler here only ever reduces
// its own syntax down to plain CSS text — parser.ts's `parseCSS()` is the single, UNCHANGED
// downstream consumer of that text, exactly as it always was for a plain `.css` file. Tailwind
// is a separate, out-of-scope concern and has no branch here.
//
// `sass`/`less`/`stylus` are lazy `import()`ed, never a top-level import, and are
// devDependencies of THIS package ONLY (never a `dependency`, see package.json) — a project that
// never authors `.scss`/`.less`/`.styl` must never be forced to install any of the three. The
// loaders below throw an install-instruction error the first time a preprocessor is actually
// needed and its package turns out to be missing, instead of failing this package's whole module
// graph at import time.
import * as path from 'node:path';

export type IPreprocessorLanguage = 'css' | 'scss' | 'less' | 'stylus';

// Every extension this module recognizes as "a style file, possibly needing preprocessing" —
// the one list `isStyleFile` (the Metro-transformer-facing "should I even look at this file?"
// check) and `detectLanguage` (the "which compiler?" check) both key off, so a new preprocessor
// extension is added in exactly one place.
const RECOGNIZED_EXTENSIONS: ReadonlyMap<string, IPreprocessorLanguage> = new Map([
  ['.css', 'css'],
  ['.scss', 'scss'],
  ['.sass', 'scss'],
  ['.less', 'less'],
  ['.styl', 'stylus'],
  ['.stylus', 'stylus'],
]);

export function isStyleFile(filename: string): boolean {
  return RECOGNIZED_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

/** Extension → preprocessor language. `.scss`/`.sass` both route through the SCSS/Sass compiler
 * (`compileScss` itself picks the concrete syntax off the extension); anything unrecognized is
 * treated as plain CSS, same as today. */
export function detectLanguage(filename: string): IPreprocessorLanguage {
  return RECOGNIZED_EXTENSIONS.get(path.extname(filename).toLowerCase()) ?? 'css';
}

let sassModule: typeof import('sass') | undefined;
let lessModule: typeof import('less') | undefined;
let stylusModule: typeof import('stylus') | undefined;

async function loadSass(): Promise<typeof import('sass')> {
  if (!sassModule) {
    try {
      sassModule = await import('sass');
    } catch {
      throw new Error('sass is required for .scss/.sass files. Install it: npm i -D sass');
    }
  }
  return sassModule;
}

async function loadLess(): Promise<typeof import('less')> {
  if (!lessModule) {
    try {
      const mod = await import('less');
      lessModule = mod.default ?? mod;
    } catch {
      throw new Error('less is required for .less files. Install it: npm i -D less');
    }
  }
  return lessModule;
}

async function loadStylus(): Promise<typeof import('stylus')> {
  if (!stylusModule) {
    try {
      const mod = await import('stylus');
      stylusModule = mod.default ?? mod;
    } catch {
      throw new Error('stylus is required for .styl files. Install it: npm i -D stylus');
    }
  }
  return stylusModule;
}

/** Compiles SCSS, or the indented Sass syntax when `filePath` ends in `.sass`, down to plain CSS
 * text. `loadPaths` points at the source file's own directory so a relative `@use`/`@import`
 * resolves the way an author would expect. */
export async function compileScss(source: string, filePath?: string): Promise<string> {
  const sass = await loadSass();
  const result = sass.compileString(source, {
    loadPaths: filePath ? [path.dirname(filePath)] : [],
    syntax: filePath?.endsWith('.sass') ? 'indented' : 'scss',
  });
  return result.css;
}

// The indented Sass syntax and SCSS syntax share the one compiler entry point (`compileScss`'s
// `syntax` option already picks between them off the file extension) — `compileSass` is just the
// `.sass`-reading alias for it.
export const compileSass = compileScss;

/** Compiles Less down to plain CSS text. Less has no synchronous render API. */
export async function compileLess(source: string, filePath?: string): Promise<string> {
  const less = await loadLess();
  const result = await less.render(source, {
    filename: filePath,
    paths: filePath ? [path.dirname(filePath)] : [],
  });
  return result.css;
}

/** Compiles Stylus down to plain CSS text. Stylus's `render` is callback-based; wrapped in a
 * Promise so it composes with the rest of this module's async API. */
export async function compileStylus(source: string, filePath?: string): Promise<string> {
  const stylus = await loadStylus();
  const compiler = stylus(source);
  if (filePath) compiler.set('filename', filePath);

  return new Promise((resolve, reject) => {
    compiler.render((error, css) => {
      if (error) reject(error);
      else resolve(css ?? '');
    });
  });
}

/** Unified entry point: reduces any recognized preprocessor language down to plain CSS text.
 * `lang: 'css'` is a no-op passthrough — callers decide whether preprocessing is needed at all,
 * typically via {@link detectLanguage}. */
export async function compile(
  source: string,
  lang: IPreprocessorLanguage,
  filePath?: string,
): Promise<string> {
  switch (lang) {
    case 'scss':
      return compileScss(source, filePath);
    case 'less':
      return compileLess(source, filePath);
    case 'stylus':
      return compileStylus(source, filePath);
    case 'css':
      return source;
  }
}
