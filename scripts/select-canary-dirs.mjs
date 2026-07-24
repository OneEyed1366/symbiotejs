// Resolves every publishable package to its directory, for pkg-pr-new to pack and publish
// itself (`pkg-pr-new publish --pnpm <dir> <dir> ...`). No per-package selection — pkg.pr.new
// never touches the real registry (no dist-tag, no version bump, nothing to clean up), so
// publishing the full set every time is cheap and avoids a stale "selected" list going out of
// sync with what actually changed. `--pnpm` makes pkg-pr-new use `pnpm pack`, which — unlike
// `npm pack` — resolves each package's `publishConfig` override (ships `build/`, not the
// in-repo `src/*.ts` entry).
import { appendFileSync } from 'node:fs';

import { publishablePackageEntries } from './lib/publishable-packages.mjs';

const entries = publishablePackageEntries();
const dirs = entries.map((e) => e.dir).join(' ');

console.log(`Publishing: ${entries.map((e) => e.name).join(', ')}`);

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `dirs=${dirs}\n`);
}
