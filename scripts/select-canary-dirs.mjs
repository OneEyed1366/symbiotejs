// Resolves the workflow_dispatch checkbox selection (CANARY_PACKAGES, a comma-separated
// list of short package names) to the matching package directories, for pkg-pr-new to pack
// and publish itself (`pkg-pr-new publish --pnpm <dir> <dir> ...`). pkg-pr-new's own glob
// resolution only matches directories (never prebuilt tarballs in v0.0.75 — that mode isn't
// released yet), and defaults to `npm pack` unless `--pnpm` is passed, which would ignore
// each package's `publishConfig` override (shipping `src/*.ts` instead of `build/`).
import { appendFileSync } from 'node:fs';

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

const dirs = entries.map((e) => e.dir).join(' ');
console.log(`Selected: ${entries.map((e) => e.name).join(', ')}`);

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `dirs=${dirs}\n`);
}
