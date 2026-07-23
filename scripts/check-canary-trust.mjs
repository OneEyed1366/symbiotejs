// Preflight for the canary-publish job (.github/workflows/release.yml): refuses
// to let CI attempt a canary publish for a package that has never been published
// to npm at all. npm's OIDC trusted-publishing (`npm trust github`, see
// trust-publishers.mjs) can only be registered for a package that already exists
// on the registry, so a never-published package would otherwise 404 silently
// deep inside `changeset publish` instead of failing here with a clear reason.
//
// Checks EVERY publishable package, not just the ones a changeset directly
// bumps — `updateInternalDependencies: patch` can cascade a publish onto any
// package depending on one that's bumped, so there's no fixed "selected" set
// to narrow this to.
import { execFileSync } from 'node:child_process';

import { publishablePackageEntries } from './lib/publishable-packages.mjs';

const shortName = (name) => name.replace('@symbiote-native/', '');

const neverPublished = publishablePackageEntries().filter(({ name }) => {
  try {
    execFileSync('npm', ['view', name, 'version'], { stdio: 'pipe' });
    return false;
  } catch {
    return true;
  }
});

if (neverPublished.length > 0) {
  const names = neverPublished.map((e) => e.name);
  console.error(
    `The following package(s) have never been published to npm, so OIDC trust cannot be registered for them yet: ${names.join(', ')}\n` +
      `Run \`pnpm run trust:publishers <short-name>\` locally first (one-off, interactive) for each of: ${names.map(shortName).join(', ')}.`,
  );
  process.exit(1);
}

console.log('npm trust preflight OK for every publishable package.');
