// Sweeps every publishable @symbiote-native/* package for stale canary
// snapshot versions (Changesets snapshot mode, e.g. 0.0.0-canary-<timestamp>)
// published to real npm and retires them, since canary builds otherwise
// accumulate on the registry forever. Runs on a schedule from
// .github/workflows/canary-cleanup.yml — no live npm/git calls happen from a
// dev machine, this is CI-only.
//
// Real npm publishes are only fully deletable (`npm unpublish`) within 72h of
// publishing (npmjs policy); past that, only `npm deprecate` (soft warning
// label, package stays installable) is possible. So: < 72h old → unpublish,
// >= 72h old → deprecate. The version currently pinned to the `canary`
// dist-tag is never touched — that's the one `"pkg": "canary"` consumers are
// actively depending on.
//
// Auth: NOT OIDC trusted publishing like release.yml's `changeset publish`
// step — npm's OIDC trusted-publisher exchange only covers `npm publish` /
// `npm stage publish` (confirmed against docs.npmjs.com/trusted-publishers/,
// "Other npm commands such as install, view, or access still require
// traditional authentication methods"). `npm view`, `npm unpublish`, and
// `npm deprecate` all need a real token, so this script authenticates via
// NODE_AUTH_TOKEN (set by the workflow from a granular npm token secret)
// instead of `permissions: id-token: write`.
import { execFileSync } from 'node:child_process';

import { publishablePackageEntries } from './lib/publishable-packages.mjs';

const CANARY_MARKER = '-canary';
const UNPUBLISH_WINDOW_MS = 72 * 60 * 60 * 1000;
const DEPRECATION_MESSAGE = 'canary build superseded — safe to ignore';

const npmViewJson = (name, field) => {
  const raw = execFileSync('npm', ['view', name, field, '--json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const trimmed = raw.trim();
  // `npm view` prints nothing (not even "null") for a field a package has
  // never set (e.g. a package with no dist-tags yet) — treat that as absent
  // rather than a JSON.parse crash.
  return trimmed ? JSON.parse(trimmed) : undefined;
};

// npm's E404 for "package doesn't exist" is the one case we treat as an
// expected, non-fatal skip (a brand-new package that hasn't cleared the
// OIDC trust-bootstrap first-publish yet). Anything else — auth failure,
// network flake, registry hiccup — is a real failure worth surfacing.
const isNotFoundError = (error) => /\bE404\b|404 Not Found/i.test(`${error.stderr ?? ''} ${error.message ?? ''}`);

const formatAge = (ms) => `${(ms / (60 * 60 * 1000)).toFixed(1)}h`;

const summary = {
  unpublished: [],
  deprecated: [],
  skippedCurrentTag: [],
  neverPublished: [],
  failures: [],
};

const entries = publishablePackageEntries();
console.log(`Scanning ${entries.length} publishable package(s) for stale canary versions...\n`);

for (const { name } of entries) {
  console.log(`=== ${name} ===`);

  let versions;
  let times;
  let distTags;
  try {
    versions = npmViewJson(name, 'versions') ?? [];
    times = npmViewJson(name, 'time') ?? {};
    distTags = npmViewJson(name, 'dist-tags') ?? {};
  } catch (error) {
    if (isNotFoundError(error)) {
      console.log('  skip: package not found on npm (never published yet)');
      summary.neverPublished.push(name);
    } else {
      console.error(`  FAILED: could not read npm metadata — ${error.message}`);
      summary.failures.push(name);
    }
    continue;
  }

  const currentCanaryVersion = distTags.canary;
  const canaryVersions = versions.filter((version) => version.includes(CANARY_MARKER));

  if (canaryVersions.length === 0) {
    console.log('  no canary-pattern versions found — nothing to do');
    continue;
  }

  for (const version of canaryVersions) {
    const spec = `${name}@${version}`;
    try {
      // Belt-and-suspenders: re-check the marker right at the mutating call
      // so a future refactor of the filter above can never point unpublish
      // or deprecate at a plain release version.
      if (!version.includes(CANARY_MARKER)) {
        console.log(`  skip ${spec} — does not match the canary version pattern`);
        continue;
      }

      if (version === currentCanaryVersion) {
        console.log(`  skip ${spec} — currently the "canary" dist-tag`);
        summary.skippedCurrentTag.push(spec);
        continue;
      }

      const publishedAt = times[version];
      if (!publishedAt) {
        console.log(`  skip ${spec} — no publish timestamp in npm time data`);
        continue;
      }

      const ageMs = Date.now() - new Date(publishedAt).getTime();
      if (ageMs < UNPUBLISH_WINDOW_MS) {
        console.log(`  unpublish ${spec} (age ${formatAge(ageMs)}, within the 72h unpublish window)`);
        execFileSync('npm', ['unpublish', spec], { stdio: 'inherit' });
        summary.unpublished.push(spec);
      } else {
        console.log(`  deprecate ${spec} (age ${formatAge(ageMs)}, unpublish window closed)`);
        execFileSync('npm', ['deprecate', spec, DEPRECATION_MESSAGE], { stdio: 'inherit' });
        summary.deprecated.push(spec);
      }
    } catch (error) {
      console.error(`  FAILED on ${spec}: ${error.message}`);
      summary.failures.push(spec);
    }
  }
}

console.log('\n--- Summary ---');
console.log(`Unpublished (${summary.unpublished.length}): ${summary.unpublished.join(', ') || 'none'}`);
console.log(`Deprecated (${summary.deprecated.length}): ${summary.deprecated.join(', ') || 'none'}`);
console.log(`Skipped, current canary tag (${summary.skippedCurrentTag.length}): ${summary.skippedCurrentTag.join(', ') || 'none'}`);
console.log(`Never published, skipped (${summary.neverPublished.length}): ${summary.neverPublished.join(', ') || 'none'}`);

if (summary.failures.length > 0) {
  console.error(`\nFailed (${summary.failures.length}): ${summary.failures.join(', ')}`);
  process.exit(1);
}

console.log('\nDone — no failures.');
