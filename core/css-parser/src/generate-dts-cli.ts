#!/usr/bin/env node
// `css-dts <dir-or-file> [...more]` — walks the given paths, finds every `.module.css` (and
// `.module.scss`/`.module.less`/`.module.styl`) file, and writes a sibling `.d.ts` next to it via
// generateModuleDts. Kept separate from generate-dts.ts so the actual generation logic stays a
// pure, disk-free function (source text in, .d.ts text out) — this file is the one place that
// touches the filesystem, run at dev/build time only, never imported by app code.
//
// Deliberately NOT wired into the Metro transformer (metro-css-module.ts/metro-transformer.ts):
// Metro's transform is content-hash-cached and only ever touches a file that is actually reached
// by the bundle graph it's currently building — a `tsc`/`vue-tsc` typecheck run in CI has no
// Metro involved at all, so a Metro-coupled generator would leave `.d.ts` files missing or stale
// exactly where correctness matters most. The intended hook is `pretypecheck` (runs before every
// typecheck, local or CI, with zero dependency on a running Metro/dev server) plus an optional
// `--watch` mode for live autocomplete while actively editing styles.
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { isStyleFile } from './preprocessors/index.ts';
import { isCssModuleFile } from './metro-css-module/index.ts';
import { generateModuleDts } from './generate-dts/index.ts';

const SKIPPED_DIR_NAMES: ReadonlySet<string> = new Set(['node_modules', 'build', '.git']);

async function collectModuleStyleFiles(root: string): Promise<string[]> {
  const stat = await fs.stat(root);
  if (!stat.isDirectory()) {
    return isStyleFile(root) && isCssModuleFile(root) ? [root] : [];
  }

  const entries = await fs.readdir(root, { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') || SKIPPED_DIR_NAMES.has(entry.name)) continue;
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await collectModuleStyleFiles(fullPath)));
    } else if (isStyleFile(fullPath) && isCssModuleFile(fullPath)) {
      found.push(fullPath);
    }
  }
  return found;
}

async function generateDtsForFile(filename: string): Promise<string | null> {
  const source = await fs.readFile(filename, 'utf8');
  const dts = await generateModuleDts(source, filename);
  if (dts === null) return null;

  const dtsPath = `${filename}.d.ts`;
  await fs.writeFile(dtsPath, dts, 'utf8');
  return dtsPath;
}

async function generateAll(roots: readonly string[]): Promise<number> {
  const files = (await Promise.all(roots.map(collectModuleStyleFiles))).flat();
  for (const file of files) {
    const dtsPath = await generateDtsForFile(file);
    if (dtsPath) console.log(`css-dts: wrote ${dtsPath}`);
  }
  return files.length;
}

// Dev-convenience only, not part of the correctness story above — re-runs the full generation
// pass on any filesystem event under a root (a plain-CSS edit re-triggers it too, harmlessly; a
// short debounce collapses an editor's typical write+rename burst into one pass) so an open
// editor's autocomplete stays live while a `.module.css` file is being edited, without requiring
// Metro or any other dev server to be running.
async function watch(roots: readonly string[]): Promise<void> {
  console.log(`css-dts: watching ${roots.join(', ')} for changes (ctrl-c to stop)`);
  let pending: ReturnType<typeof setTimeout> | undefined;
  const regenerate = (): void => {
    clearTimeout(pending);
    pending = setTimeout(() => {
      generateAll(roots).catch((error: unknown) => console.error(error));
    }, 100);
  };

  regenerate();
  await Promise.all(
    roots.map(async root => {
      const watcher = fs.watch(root, { recursive: true });
      for await (const _event of watcher) regenerate();
    }),
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isWatchMode = args.includes('--watch');
  const targets = args.filter(arg => arg !== '--watch');

  if (targets.length === 0) {
    console.error('Usage: css-dts [--watch] <dir-or-file> [...more]');
    process.exitCode = 1;
    return;
  }

  if (isWatchMode) {
    await watch(targets);
    return;
  }

  const fileCount = await generateAll(targets);
  if (fileCount === 0) {
    console.log('css-dts: no .module.css (or .module.scss/.less/.styl) files found');
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
