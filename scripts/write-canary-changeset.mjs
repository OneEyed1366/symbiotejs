// `changeset version --snapshot` only bumps/publishes packages that already
// have a real .changeset/*.md file — it does NOT know about the packages
// select-canary-dirs.mjs/resolve-manual-canary-packages.mjs picked, so a
// canary run against a branch with no committed changeset silently publishes
// nothing ("No unreleased changesets found"). This writes a throwaway
// changeset for exactly the selected packages so snapshot mode has something
// to act on. Runs only inside the ephemeral publish-canary CI checkout — never
// committed or pushed, discarded with the runner.
import { writeFileSync } from 'node:fs';

const packages = (process.env.CANARY_PACKAGES ?? '')
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);

if (packages.length === 0) {
  console.error('CANARY_PACKAGES must be set (expected from the preceding package-resolution step).');
  process.exit(1);
}

const frontmatter = packages.map((name) => `"${name}": patch`).join('\n');
const content = `---\n${frontmatter}\n---\n\nCanary snapshot publish (CI-generated, not committed).\n`;

writeFileSync('.changeset/canary-publish.md', content);
console.log(`Wrote ephemeral changeset for: ${packages.join(', ')}`);
