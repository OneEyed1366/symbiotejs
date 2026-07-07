#!/usr/bin/env node

// react-native codegen resolves codegenConfig.jsSrcsDir as a LITERAL path relative to
// this package's own root (a plain lstat, not Node's require() resolution). Under pnpm,
// a real npm install of this package never nests @react-native-community/slider inside its
// own node_modules — pnpm places it as a SIBLING in the enclosing store directory, reachable
// only by require.resolve's ancestor walk. So jsSrcsDir can never literally point through
// node_modules; instead we vendor the native component's spec sources into our own package at
// prepare time and point jsSrcsDir at that copy — real files, resolvable the same way
// regardless of how the package manager laid out its dependencies. Twin of
// packages/splash-screen/vendor-codegen-specs.cjs (and the same reason the podspec vendors
// the native ios/common sources into .rn-slider).
const fs = require('fs');
const path = require('path');

const nativeSliderRoot = path.dirname(require.resolve('@react-native-community/slider/package.json'));
const srcDir = path.join(nativeSliderRoot, 'src');
const targetDir = path.join(__dirname, 'codegen-specs');

fs.rmSync(targetDir, { recursive: true, force: true });
// The whole src is copied (not just RNCSliderNativeComponent.ts) so codegen sees the exact
// same input the old `node_modules/@react-native-community/slider/src` jsSrcsDir pointed at —
// codegen picks up only the NativeComponent spec and ignores the rest.
fs.cpSync(srcDir, targetDir, { recursive: true });
