// Packs every publishable @symbiote-native/* package into a real npm tarball
// via `pnpm pack` (which — unlike plain `npm pack` — resolves each package's
// `publishConfig` override so the tarball ships `build/`, not the in-repo
// `src/*.ts` entry) into one throwaway directory, for pkg.pr.new's prebuilt-
// tarball mode (`pkg-pr-new publish '<dir>/*.tgz'` — uploaded as-is, never
// repacked). Only ever run inside CI (.github/workflows/release.yml's
// publish-canary job), after `pnpm run prepublish-build`.

// CANARY_PACKAGES: optional comma-separated list of short package names
// (e.g. "slider,splash-screen") to restrict which packages get packed —
// unset/empty means every publishable package. The publish-canary job
// derives this from its per-package workflow_dispatch checkboxes.
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { publishablePackageEntries } from './lib/publishable-packages.mjs';

const shortName = (name) => name.replace('@symbiote-native/', '');

const rawFilter = (process.env.CANARY_PACKAGES ?? '').trim();
const wanted = rawFilter ? new Set(rawFilter.split(',').map((s) => s.trim()).filter(Boolean)) : null;

const entries = publishablePackageEntries().filter((entry) => !wanted || wanted.has(shortName(entry.name)));
if (entries.length === 0) {
  console.error(
    wanted
      ? `No publishable package matched CANARY_PACKAGES="${rawFilter}". Available: ${publishablePackageEntries().map((e) => shortName(e.name)).join(', ')}`
      : 'No publishable @symbiote-native/* packages found.',
  );
  process.exit(1);
}

const outDir = mkdtempSync(join(tmpdir(), 'symbiote-canary-'));

for (const { name, dir } of entries) {
  console.log(`Packing ${name} (${dir}) -> ${outDir}`);
  execFileSync('pnpm', ['pack', '--pack-destination', outDir], { cwd: resolve(dir), stdio: 'inherit' });
}

console.log(`\nTarballs written to ${outDir}`);

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `dir=${outDir}\n`);
}
