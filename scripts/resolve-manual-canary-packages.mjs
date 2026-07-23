// Manual counterpart to select-canary-dirs.mjs: resolves the workflow_dispatch
// `canary-packages` input (comma-separated short or full names, e.g. "react,vue")
// to full package names, instead of diffing a PR. Used for a republish with no
// code change, or publishing off a branch with no open PR to diff against.
import { appendFileSync } from 'node:fs';

import { publishablePackageEntries } from './lib/publishable-packages.mjs';

const shortName = (name) => name.replace('@symbiote-native/', '');

const requested = (process.env.CANARY_PACKAGES_INPUT ?? '')
  .split(',')
  .map((token) => token.trim())
  .filter(Boolean);

if (requested.length === 0) {
  console.error('CANARY_PACKAGES_INPUT must be set (the canary-packages workflow_dispatch input).');
  process.exit(1);
}

const entries = publishablePackageEntries();
const unknown = [];
const resolved = requested.map((token) => {
  const entry = entries.find((e) => e.name === token || shortName(e.name) === token);
  if (!entry) unknown.push(token);
  return entry;
});

if (unknown.length > 0) {
  console.error(
    `Unknown package(s): ${unknown.join(', ')}\n` +
      `Available: ${entries.map((e) => shortName(e.name)).join(', ')}`,
  );
  process.exit(1);
}

const names = resolved.map((e) => e.name).join(',');
console.log(`Selected: ${names}`);

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `packages=${names}\n`);
}
