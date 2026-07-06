#!/usr/bin/env node

// Thin rebrand of react-native-bootsplash's own asset-generation CLI — zero reimplementation.
// Its `generate()` only writes native android/ios/web project files (drawables, storyboards,
// AndroidManifest/Info.plist theme wiring); it has no idea which JS renderer the app uses, so
// delegating is exact. We can't `require()` its internals directly: its package.json `exports`
// map only opens ".", "./expo", "./package.json", "./app.plugin.js" — the CLI script and the
// generate module live outside that map. Resolving `cli.js` as a sibling of the (exported)
// package.json and spawning it as its own process sidesteps the exports encapsulation
// entirely, since we never `require()` into the package — we just run its bin file.
const path = require('path');
const { spawnSync } = require('child_process');

const nativeCliPath = path.join(
  path.dirname(require.resolve('react-native-bootsplash/package.json')),
  'cli.js',
);

const result = spawnSync(process.execPath, [nativeCliPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
