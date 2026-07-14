import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { publishablePackageEntries } from './lib/publishable-packages.mjs';

const WORKFLOW_PATH = '.github/workflows/release.yml';
const PKG_PATH = 'package.json';
const BEGIN_MARKER = '      # BEGIN GENERATED CANARY PACKAGE INPUTS';
const END_MARKER = '      # END GENERATED CANARY PACKAGE INPUTS';
const ESM_SCRIPT_RE = /("fix-esm-extensions":\s*")node scripts\/fix-esm-extensions\.mjs [^"]*(")/;

const shortName = (packageName) => packageName.replace('@symbiote-native/', '');

const buildCanaryInputsBlock = () => {
  const entries = publishablePackageEntries();
  const header = [
    BEGIN_MARKER + ' — do not edit by hand, run',
    '      # `pnpm run sync:release-config` (scripts/sync-release-config.mjs derives',
    '      # this list from publishablePackageEntries(), the same package',
    '      # discovery `select-canary-dirs.mjs`/`trust-publishers.mjs` use).',
  ].join('\n');
  const body = entries
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

const syncCanaryInputs = ({ check }) => {
  const workflow = readFileSync(WORKFLOW_PATH, 'utf8');
  const beginIndex = workflow.indexOf(BEGIN_MARKER);
  const endIndex = workflow.indexOf(END_MARKER);
  if (beginIndex === -1 || endIndex === -1) {
    console.error(`${WORKFLOW_PATH}: missing BEGIN/END generated-block markers — cannot sync.`);
    return false;
  }

  const before = workflow.slice(0, beginIndex);
  const after = workflow.slice(endIndex + END_MARKER.length);
  const next = `${before}${buildCanaryInputsBlock()}${after}`;

  if (next === workflow) {
    console.log(`${WORKFLOW_PATH}: canary inputs already in sync.`);
    return true;
  }
  if (check) {
    console.error(`${WORKFLOW_PATH}: canary inputs are out of sync — run \`pnpm run sync:release-config\`.`);
    return false;
  }
  writeFileSync(WORKFLOW_PATH, next);
  console.log(`${WORKFLOW_PATH}: canary inputs synced.`);
  return true;
};

// A package needs its build/ ESM extensions fixed only if publishConfig points
// somewhere under "./build/" (build-ngc's AOT output is a sibling dir, excluded
// by construction — the string check is anchored to "./build/", not "./build").
// fixEsmExtensions() itself recurses, so one "<pkgDir>/build" entry covers every
// nested entry point (core/react/vue subfolders, bootstrap.js, etc).
const collectBuildDirs = () =>
  publishablePackageEntries()
    .filter(({ dir }) => {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
      return pkg.publishConfig && /"\.\/build\//.test(JSON.stringify(pkg.publishConfig));
    })
    .map(({ dir }) => `${dir}/build`);

const syncEsmExtensions = ({ check }) => {
  const pkgText = readFileSync(PKG_PATH, 'utf8');
  const match = pkgText.match(ESM_SCRIPT_RE);
  if (!match) {
    console.error(`${PKG_PATH}: could not find the "fix-esm-extensions" script line — cannot sync.`);
    return false;
  }

  const nextCommand = `node scripts/fix-esm-extensions.mjs ${collectBuildDirs().join(' ')}`;
  const next = pkgText.replace(ESM_SCRIPT_RE, `$1${nextCommand}$2`);

  if (next === pkgText) {
    console.log(`${PKG_PATH}: fix-esm-extensions dirs already in sync.`);
    return true;
  }
  if (check) {
    console.error(`${PKG_PATH}: "fix-esm-extensions" script is out of sync — run \`pnpm run sync:release-config\`.`);
    return false;
  }
  writeFileSync(PKG_PATH, next);
  console.log(`${PKG_PATH}: fix-esm-extensions dirs synced.`);
  return true;
};

const check = process.argv.includes('--check');
const ok = [syncCanaryInputs({ check }), syncEsmExtensions({ check })].every(Boolean);
if (!ok) process.exit(1);
