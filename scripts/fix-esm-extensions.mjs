// tsc --build emits build/**/*.js with moduleResolution:"Bundler" semantics: relative imports
// keep whatever extension (usually none) the .ts source used. That's correct for Metro/Vitest
// resolving src/*.ts directly (main/exports point there in-repo — see symbiote-release-publishing
// skill), but it's invalid ESM once the compiled build/ output is consumed by Node's own loader
// (no bundler in between) — Node requires an explicit extension on every relative specifier.
//
// The fix can't live in src/*.ts: Metro's resolver treats a given extension as literal (only
// layering .ios/.android/.native suffixes on top of it) rather than mapping .js back to .ts the
// way tsc/Node's own resolution does, so writing '.js' in the TypeScript source breaks Metro's
// dev-mode resolution of the unbuilt source (verified directly — .examples/vue-tsx failed to
// resolve adapters/vue/src/modules/app-registry/index.js). So this runs ONLY over already-compiled
// build/**/*.js output, once, after `tsc --build` — src/*.ts is never touched.
import fs from 'node:fs';
import path from 'node:path';

const STATIC_RE = /(\bfrom\s+)'(\.\.?\/[^']+)'/g;
const DYNAMIC_RE = /(\bimport\(\s*)'(\.\.?\/[^']+)'(\s*\))/g;
const EXT_RE = /\.(js|jsx|mjs|cjs|json)$/;

function listJsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJsFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

function resolveSpecifier(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  if (fs.existsSync(base + '.js')) return spec + '.js';
  if (fs.existsSync(base) && fs.statSync(base).isDirectory()) {
    if (fs.existsSync(path.join(base, 'index.js'))) return spec + '/index.js';
  }
  return null;
}

export function fixEsmExtensions(buildDir) {
  if (!fs.existsSync(buildDir)) return { filesChanged: 0, importsFixed: 0, unresolved: [] };

  let filesChanged = 0;
  let importsFixed = 0;
  const unresolved = [];

  for (const file of listJsFiles(buildDir)) {
    const original = fs.readFileSync(file, 'utf8');
    let changed = original;

    const rewrite = (match, prefix, spec, suffix = '') => {
      if (EXT_RE.test(spec)) return match;
      const resolved = resolveSpecifier(file, spec);
      if (resolved === null) {
        unresolved.push(`${file} -> ${spec}`);
        return match;
      }
      importsFixed++;
      return `${prefix}'${resolved}'${suffix}`;
    };

    changed = changed.replace(STATIC_RE, (m, prefix, spec) => rewrite(m, prefix, spec));
    changed = changed.replace(DYNAMIC_RE, (m, prefix, spec, suffix) => rewrite(m, prefix, spec, suffix));

    if (changed !== original) {
      filesChanged++;
      fs.writeFileSync(file, changed);
    }
  }

  return { filesChanged, importsFixed, unresolved };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dirs = process.argv.slice(2);
  if (dirs.length === 0) {
    console.error('Usage: node scripts/fix-esm-extensions.mjs <build-dir> [<build-dir> ...]');
    process.exit(1);
  }
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
