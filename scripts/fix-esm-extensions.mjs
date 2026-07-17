// tsc --build emits build/**/*.js with moduleResolution:"Bundler" semantics: relative imports
// keep whatever extension (usually none) the .ts source used. That's correct for Metro/Vitest
// resolving src/*.ts directly (main/exports point there in-repo), but it's invalid ESM once
// the compiled build/ output is consumed by Node's own loader
// (no bundler in between) — Node requires an explicit extension on every relative specifier.
//
// The fix can't live in src/*.ts: Metro's resolver treats a given extension as literal (only
// layering .ios/.android/.native suffixes on top of it) rather than mapping .js back to .ts the
// way tsc/Node's own resolution does, so writing '.js' in the TypeScript source breaks Metro's
// dev-mode resolution of the unbuilt source (verified directly — a local example app failed to
// resolve adapters/vue/src/modules/app-registry/index.js). So this runs ONLY over already-compiled
// build/**/*.js output, once, after `tsc --build` — src/*.ts is never touched.
import fs from 'node:fs';
import path from 'node:path';
import { esmExtensionBuildDirs } from './lib/build-dirs.mjs';

const EXT_RE = /\.(js|jsx|mjs|cjs|json)$/;
const RELATIVE_RE = /^\.\.?\//; // a specifier we rewrite: './x' or '../x'

function listJsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJsFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const PLATFORM_SUFFIXES = ['ios', 'android', 'native'];

// ADR 0026 folder-as-module / flat platform-split files (`X.ios.js`, `X/index.android.js`, ...)
// need to stay extensionless so Metro can layer its own platform suffix on top at bundle time —
// baking in the resolved base file's extension here would make Metro treat it as literal and skip
// straight past `.ios`/`.android`, always resolving to the same (headless-fallback) file on every
// platform. Mirrors react-native-builder-bob's ESM extension-fixer, which skips these same imports.
function hasPlatformSibling(dirPath, baseName) {
  return PLATFORM_SUFFIXES.some((platform) => fs.existsSync(path.join(dirPath, `${baseName}.${platform}.js`)));
}

// Returns the fixed specifier, `'skip'` for an intentional platform-split no-op, or `null` when
// nothing on disk matches (a real "unresolved" case the caller should report).
function resolveSpecifier(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  if (fs.existsSync(base + '.js')) {
    if (hasPlatformSibling(path.dirname(base), path.basename(base))) return 'skip';
    return spec + '.js';
  }
  if (fs.existsSync(base) && fs.statSync(base).isDirectory()) {
    if (fs.existsSync(path.join(base, 'index.js'))) {
      if (hasPlatformSibling(base, 'index')) return 'skip';
      return spec + '/index.js';
    }
  }
  return null;
}

// --- Source scanner -----------------------------------------------------------------------------
// The old approach ran two regexes over the whole file, so `from './x'` INSIDE a comment or a
// string literal matched and was reported UNRESOLVED — a false positive that failed the publish
// gate (a `// … import styles from './Card.module.css'` doc-comment, 2026-07). core/css-parser
// makes the string case real: it emits JS source AS strings, some containing `from './…'`.
// A regex comment-strip can't fix this (it corrupts `//` inside a `'https://…'` URL). So we walk
// the source char-by-char tracking whether we're in a string / comment / regex, and only ever
// touch a single-quoted specifier string that sits in real code right after `from` or `import(`.

// Advance past a quoted string starting at `start` (the opening quote). Returns the index AFTER
// the closing quote, honoring backslash escapes.
function scanString(source, start, quote) {
  for (let i = start + 1; i < source.length; i++) {
    const c = source[i];
    if (c === '\\') i++;
    else if (c === quote) return i + 1;
  }
  return source.length; // unterminated
}

// Advance past a `${…}` template hole starting just after the `${`. Returns the index AFTER the
// matching `}`, itself skipping nested strings/templates/comments/regexes and brace nesting.
function scanTemplateHole(source, start) {
  let depth = 1;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (c === '\\') i++;
    else if (c === '{') depth++;
    else if (c === '}') {
      if (--depth === 0) return i + 1;
    } else if (c === '"' || c === "'") i = scanString(source, i, c) - 1;
    else if (c === '`') i = scanTemplate(source, i) - 1;
    else if (c === '/' && source[i + 1] === '/') i = lineCommentEnd(source, i) - 1;
    else if (c === '/' && source[i + 1] === '*') i = blockCommentEnd(source, i) - 1;
  }
  return source.length;
}

// Advance past a template literal starting at the backtick. Returns the index AFTER the closing
// backtick; the whole literal (holes included) is treated as opaque — never a specifier.
function scanTemplate(source, start) {
  for (let i = start + 1; i < source.length; i++) {
    const c = source[i];
    if (c === '\\') i++;
    else if (c === '`') return i + 1;
    else if (c === '$' && source[i + 1] === '{') i = scanTemplateHole(source, i + 2) - 1;
  }
  return source.length;
}

function lineCommentEnd(source, start) {
  const nl = source.indexOf('\n', start);
  return nl === -1 ? source.length : nl;
}

function blockCommentEnd(source, start) {
  const close = source.indexOf('*/', start + 2);
  return close === -1 ? source.length : close + 2;
}

// Advance past a regex literal starting at `/`. Returns the index AFTER the closing `/` (flags are
// ordinary word chars, scanned as code). A newline before the close means it wasn't a regex after
// all → bail returning start+1 so the `/` is consumed as a lone division char, never runaway.
function scanRegex(source, start) {
  let inClass = false;
  for (let i = start + 1; i < source.length; i++) {
    const c = source[i];
    if (c === '\\') i++;
    else if (c === '\n') return start + 1;
    else if (c === '[') inClass = true;
    else if (c === ']') inClass = false;
    else if (c === '/' && !inClass) return i + 1;
  }
  return start + 1;
}

// A `/` starts a regex (not division) only in value position — after these operators/punctuators,
// or after one of these keywords. Judged off the code-only tail, so a quote inside a regex like
// `/['"]/` never mis-opens a string. Keeps division (`a / b`) from being read as a regex.
const REGEX_PRECEDING_KEYWORDS = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'do', 'else', 'yield', 'await', 'case',
]);
const REGEX_PRECEDING_PUNCTUATORS = new Set([...'([{,;:?=+-*/%&|^!~<>']);

function regexAllowed(codeTail) {
  const t = codeTail.replace(/\s+$/, '');
  if (t === '') return true;
  const last = t[t.length - 1];
  if (/[\w$]/.test(last)) return REGEX_PRECEDING_KEYWORDS.has(t.match(/[\w$]+$/)[0]);
  return REGEX_PRECEDING_PUNCTUATORS.has(last);
}

function nextNonSpaceIsCloseParen(source, from) {
  let i = from;
  while (i < source.length && /\s/.test(source[i])) i++;
  return source[i] === ')';
}

const FROM_TAIL_RE = /\bfrom\s+$/; // static import / re-export: `… from '…'`
const IMPORT_TAIL_RE = /\bimport\(\s*$/; // dynamic import: `import('…')`

// Rewrites real relative ESM specifiers in `source`, calling `resolve(spec)` for each one found in
// code (never in a comment/string/regex). `resolve` returns the replacement specifier, `'skip'`
// to leave it as-is (already-extensioned / platform-split), or `null` for genuinely unresolved.
// Returns the new source plus the fix count and the list of unresolved specifiers.
export function rewriteEsmSpecifiers(source, resolve) {
  let out = '';
  let codeTail = ''; // code-only mirror (strings/comments/regexes blanked) — drives context checks
  let importsFixed = 0;
  const unresolved = [];

  for (let i = 0; i < source.length; ) {
    const c = source[i];
    const next = source[i + 1];

    if (c === '/' && next === '/') {
      const end = lineCommentEnd(source, i);
      out += source.slice(i, end);
      codeTail += ' ';
      i = end;
    } else if (c === '/' && next === '*') {
      const end = blockCommentEnd(source, i);
      out += source.slice(i, end);
      codeTail += ' ';
      i = end;
    } else if (c === '/' && regexAllowed(codeTail)) {
      const end = scanRegex(source, i);
      out += source.slice(i, end);
      codeTail += end === i + 1 ? '/' : ' '; // bailed (division) → keep as code, else blank
      i = end;
    } else if (c === '"' || c === '`') {
      const end = c === '"' ? scanString(source, i, '"') : scanTemplate(source, i);
      out += source.slice(i, end);
      codeTail += ' ';
      i = end;
    } else if (c === "'") {
      const end = scanString(source, i, "'");
      const spec = source.slice(i + 1, end - 1);
      const isDynamic = IMPORT_TAIL_RE.test(codeTail) && nextNonSpaceIsCloseParen(source, end);
      const isSpecifier = (FROM_TAIL_RE.test(codeTail) || isDynamic) && RELATIVE_RE.test(spec);
      const resolved = isSpecifier ? resolve(spec) : 'skip';
      if (typeof resolved === 'string' && resolved !== 'skip') {
        out += `'${resolved}'`;
        importsFixed++;
      } else {
        if (resolved === null) unresolved.push(spec);
        out += source.slice(i, end);
      }
      codeTail += ' ';
      i = end;
    } else {
      out += c;
      codeTail += c;
      i++;
    }
  }

  return { code: out, importsFixed, unresolved };
}

export function fixEsmExtensions(buildDir) {
  if (!fs.existsSync(buildDir)) return { filesChanged: 0, importsFixed: 0, unresolved: [] };

  let filesChanged = 0;
  let importsFixed = 0;
  const unresolved = [];

  for (const file of listJsFiles(buildDir)) {
    const original = fs.readFileSync(file, 'utf8');
    const resolve = (spec) => (EXT_RE.test(spec) ? 'skip' : resolveSpecifier(file, spec));
    const result = rewriteEsmSpecifiers(original, resolve);

    importsFixed += result.importsFixed;
    for (const spec of result.unresolved) unresolved.push(`${file} -> ${spec}`);

    if (result.code !== original) {
      filesChanged++;
      fs.writeFileSync(file, result.code);
    }
  }

  return { filesChanged, importsFixed, unresolved };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // No args → derive every publishable package's build/ dir from its own
  // publishConfig (scripts/lib/build-dirs.mjs), so a new package is covered
  // automatically instead of needing a hand-maintained arg list here.
  const dirs = process.argv.slice(2).length > 0 ? process.argv.slice(2) : esmExtensionBuildDirs();
  let totalFiles = 0;
  let totalImports = 0;
  const allUnresolved = [];
  for (const dir of dirs) {
    const { filesChanged, importsFixed, unresolved } = fixEsmExtensions(dir);
    totalFiles += filesChanged;
    totalImports += importsFixed;
    allUnresolved.push(...unresolved);
  }
  console.log(`Files changed: ${totalFiles}`);
  console.log(`Import specifiers fixed: ${totalImports}`);
  if (allUnresolved.length) {
    console.error(`\nUNRESOLVED (${allUnresolved.length}) - fix or investigate before publishing:`);
    allUnresolved.forEach((u) => console.error('  ' + u));
    process.exit(1);
  }
}
