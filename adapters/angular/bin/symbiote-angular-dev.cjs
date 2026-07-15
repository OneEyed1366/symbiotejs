#!/usr/bin/env node
// Cross-platform replacement for the old per-app dev-with-watch.sh: Angular needs a pre-Metro
// AOT compile (ngc), kept in sync via `ngc --watch` while developing. Metro itself must stay
// the FOREGROUND process — it reads raw keypresses
// (r/j/d/...) straight off stdin, and any wrapper that pipes stdin through itself
// (concurrently, npm-run-all, ...) breaks that raw-mode read. So ngc runs as a plain background
// child process, never a stdin-owning process manager. `shell: true` resolves `ngc`/
// `react-native` off PATH exactly like the bash script did — npm/pnpm/yarn already prepend
// every `node_modules/.bin` up the tree to PATH for any script invocation, this one included.
const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');

const TSCONFIG = 'tsconfig.angular.json';
const metroArgs = process.argv.slice(2);
const projectRoot = process.cwd();

// perform_watch.js chokidar-watches angularCompilerOptions.basePath recursively (filtered only
// by a hardcoded node_modules/.dotfiles/.js/.map/.metadata.json regex — never ios/android/build),
// so an app's tsconfig.angular.json narrows basePath to its own src/ to keep the native platform
// trees out of the watch (see that file's own comment for the EMFILE story this fixes). That
// value is written relative (portable, checked in) — but @angular/compiler-cli's INCREMENTAL
// recompile path (oldProgram reuse, only reachable once `ngc --watch` is already running) calls
// absoluteFrom() on basePath directly and throws "TS500: ... path is not absolute" if it isn't
// already absolute, even though the initial cold compile tolerates a relative one fine. Resolve
// it here, at spawn time, into a throwaway override config — the checked-in tsconfig itself never
// carries a machine-specific absolute path.
function resolveWatchTsconfig(tsconfigName) {
  const realPath = path.resolve(projectRoot, tsconfigName);
  const { config, error } = ts.readConfigFile(realPath, ts.sys.readFile);
  const basePath = config?.angularCompilerOptions?.basePath;
  if (error || typeof basePath !== 'string' || path.isAbsolute(basePath)) {
    return realPath;
  }
  // Written inside the project (build/, already gitignored everywhere this script runs) rather
  // than os.tmpdir() — TS resolves default typeRoots/@types by walking up from the extending
  // config's OWN directory, and a tmpdir has no node_modules above it, so an os.tmpdir() location
  // broke `@types/node` resolution (TS2688) even though the extended real config was found fine.
  const buildDir = path.resolve(projectRoot, 'build');
  fs.mkdirSync(buildDir, { recursive: true });
  const watchConfigPath = path.join(buildDir, `symbiote-angular-dev-watch-${process.pid}.json`);
  fs.writeFileSync(
    watchConfigPath,
    JSON.stringify({
      extends: realPath,
      angularCompilerOptions: { basePath: path.resolve(projectRoot, basePath) },
    }),
  );
  return watchConfigPath;
}

// Without watchman, Metro falls back to chokidar's native fs.watch, which opens one OS file
// handle per watched directory. This project's watchFolders spans the whole monorepo, so that
// reliably blows past macOS's per-process fd limit (EMFILE) — doubly likely here since ngc
// --watch adds a second watcher on top of Metro's own. Warn instead of letting everyone
// individually debug a native stack trace down to this one missing binary.
const watchmanCheck = spawnSync('watchman', ['--version'], { stdio: 'ignore', shell: true });
if (watchmanCheck.status !== 0) {
  console.warn(
    '[symbiote-angular-dev] watchman not found on PATH. Metro will fall back to watching files ' +
      'itself, which commonly crashes with "EMFILE: too many open files" on a repo this size. ' +
      'Install it: https://facebook.github.io/watchman/docs/install (macOS: brew install watchman).',
  );
}

const initialBuild = spawnSync('ngc', ['-p', TSCONFIG], { stdio: 'inherit', shell: true });
if (initialBuild.status !== 0) {
  process.exit(initialBuild.status ?? 1);
}

const watchTsconfigPath = resolveWatchTsconfig(TSCONFIG);
const ngcWatch = spawn('ngc', ['-p', watchTsconfigPath, '--watch'], { stdio: 'inherit', shell: true });
const metro = spawn('react-native', ['start', ...metroArgs], { stdio: 'inherit', shell: true });

function stopNgcWatch() {
  ngcWatch.kill();
  if (watchTsconfigPath !== path.resolve(projectRoot, TSCONFIG)) {
    fs.rmSync(watchTsconfigPath, { force: true });
  }
}

metro.on('exit', (code) => {
  stopNgcWatch();
  process.exit(code ?? 0);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopNgcWatch();
    metro.kill(signal);
  });
}
