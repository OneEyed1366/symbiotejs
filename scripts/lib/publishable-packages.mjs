import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PACKAGE_GROUPS = ['core', 'adapters', 'packages'];

export const publishablePackageEntries = () => {
  const entries = [];
  for (const group of PACKAGE_GROUPS) {
    if (!existsSync(group)) continue;
    for (const entry of readdirSync(group, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = join(group, entry.name);
      const manifest = join(dir, 'package.json');
      if (!existsSync(manifest)) continue;
      const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
      if (!pkg.private && typeof pkg.name === 'string' && pkg.name.startsWith('@symbiote-native/')) {
        entries.push({ name: pkg.name, dir });
      }
    }
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name));
};

export const publishablePackages = () => publishablePackageEntries().map((entry) => entry.name);
