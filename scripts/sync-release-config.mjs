import { readFileSync, writeFileSync } from 'node:fs';
import { publishablePackageEntries } from './lib/publishable-packages.mjs';

// Only release.yml's workflow_dispatch checkboxes need this: GitHub Actions has
// no way to compute an input schema at dispatch time, it must be committed YAML
// on the target ref. Everything else derived from publishablePackageEntries()
// (fix-esm-extensions' build dirs, select-canary-dirs.mjs) computes at RUN time
// instead — no generated/committed artifact, nothing to go stale.
const WORKFLOW_PATH = '.github/workflows/release.yml';
const BEGIN_MARKER = '      # BEGIN GENERATED CANARY PACKAGE INPUTS';
const END_MARKER = '      # END GENERATED CANARY PACKAGE INPUTS';

const shortName = (packageName) => packageName.replace('@symbiote-native/', '');

const buildCanaryInputsBlock = () => {
  const header = [
    BEGIN_MARKER + ' — do not edit by hand, run',
    '      # `pnpm run sync:release-config` (derives this list from',
    '      # publishablePackageEntries(), the same package discovery',
    '      # `select-canary-dirs.mjs`/`trust-publishers.mjs` use).',
  ].join('\n');
  const body = publishablePackageEntries()
    .map(({ name }) => {
      const key = shortName(name);
      return [
        `      ${key}:`,
        `        description: '${name}'`,
        '        type: boolean',
        '        default: false',
      ].join('\n');
    })
    .join('\n');
  return `${header}\n${body}\n${END_MARKER}`;
};

const check = process.argv.includes('--check');
const workflow = readFileSync(WORKFLOW_PATH, 'utf8');
const beginIndex = workflow.indexOf(BEGIN_MARKER);
const endIndex = workflow.indexOf(END_MARKER);
if (beginIndex === -1 || endIndex === -1) {
  console.error(`${WORKFLOW_PATH}: missing BEGIN/END generated-block markers — cannot sync.`);
  process.exit(1);
}

const next = `${workflow.slice(0, beginIndex)}${buildCanaryInputsBlock()}${workflow.slice(endIndex + END_MARKER.length)}`;

if (next === workflow) {
  console.log(`${WORKFLOW_PATH}: canary inputs already in sync.`);
} else if (check) {
  console.error(`${WORKFLOW_PATH}: canary inputs are out of sync — run \`pnpm run sync:release-config\`.`);
  process.exit(1);
} else {
  writeFileSync(WORKFLOW_PATH, next);
  console.log(`${WORKFLOW_PATH}: canary inputs synced.`);
}
