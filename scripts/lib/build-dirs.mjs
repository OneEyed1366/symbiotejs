import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { publishablePackageEntries } from './publishable-packages.mjs';

// A package needs its build/ ESM extensions fixed only if publishConfig points
// somewhere under "./build/" (build-ngc's AOT output is a sibling dir, excluded
// by construction — the string check is anchored to "./build/", not "./build").
// fixEsmExtensions() itself recurses, so one "<pkgDir>/build" entry covers every
// nested entry point (core/react/vue subfolders, bootstrap.js, etc).
export const esmExtensionBuildDirs = () =>
  publishablePackageEntries()
    .filter(({ dir }) => {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
      return pkg.publishConfig && /"\.\/build\//.test(JSON.stringify(pkg.publishConfig));
    })
    .map(({ dir }) => `${dir}/build`);
