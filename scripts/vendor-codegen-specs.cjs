#!/usr/bin/env node

// react-native codegen resolves codegenConfig.jsSrcsDir as a LITERAL path relative to a
// package's own root (a plain lstat, not Node's require() resolution). Under pnpm, a real npm
// install of a native-proxy package (slider, splash-screen, navigation, ...) never nests its
// wrapped native dependency inside its own node_modules — pnpm places it as a SIBLING in the
// enclosing store directory, reachable only by require.resolve's ancestor walk. So jsSrcsDir can
// never literally point through node_modules; every native-proxy package instead vendors the
// wrapped library's codegen spec sources into its own `codegen-specs/` at `prepare` time and
// points jsSrcsDir at that copy — real files, resolvable the same way regardless of how the
// package manager laid out its dependencies. This is that vendoring, shared: the logic is
// identical across every native-proxy package, only the wrapped package name and its specs
// subdir differ, so each package's `prepare` script just calls this with those two arguments
// instead of carrying its own copy. See `.claude/rules/native-proxy-package-files.md`.
const fs = require('fs');
const path = require('path');

const [, , packageName, specsSubdir] = process.argv;
if (!packageName || !specsSubdir) {
  console.error('Usage: vendor-codegen-specs.cjs <native-package-name> <specs-subdir>');
  process.exit(1);
}

// Resolve from the CALLING package's own directory (npm/pnpm scripts run with cwd = that
// package's root), not from this shared script's own location — the wrapped dependency is only
// ever reachable via the calling package's node_modules chain.
const nativePackageRoot = path.dirname(
  require.resolve(`${packageName}/package.json`, { paths: [process.cwd()] }),
);
const sourceDir = path.join(nativePackageRoot, specsSubdir);
const targetDir = path.join(process.cwd(), 'codegen-specs');

fs.rmSync(targetDir, { recursive: true, force: true });
fs.cpSync(sourceDir, targetDir, { recursive: true });
