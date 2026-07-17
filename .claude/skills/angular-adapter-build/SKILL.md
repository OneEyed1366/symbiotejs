---
name: angular-adapter-build
description: "Symbiote Angular adapter build pipeline — read BEFORE touching the Angular AOT/Metro build (ngc, tsconfig.angular.json, compiler-cli/linker), an Angular-shipping package's package.json (prepare script, conditional exports), the repo ROOT's prepublish-build/build script, or the dev/watch scripts (symbiote-angular-dev.cjs). Covers: (1) two-stage AOT — Stage A ngtsc compilationMode:'partial' needs the WHOLE TS program (template type-check + cross-file imports), Stage B compiler-cli/linker/babel is a per-file plugin in Metro's babelTransformerPath; why Metro's per-file model can't run ngtsc directly; Variant 1 (two-phase ngc --watch beside Metro, shipping) vs Variant 2 (live ngtsc transformer, deferred); bench-spike compat facts (Babel 7, TS rootDir, CUSTOM_ELEMENTS_SCHEMA hyphen rule). (2) every package builds ITSELF via prepare + conditional exports, not a tsconfig paths/resolveRequest hack (TS500 ngc crash, decorators-not-enabled error). (3) why dev/start need ngc --watch beside Metro without wrapping Metro's stdin, and (3a) why ngc --watch itself crashes with EMFILE on ios/android and how angularCompilerOptions.basePath + a src/ split + an absolute-basePath override for the incremental-recompile TS500 'absoluteFrom path is not absolute' crash fix it for real, plus the separate Watchman-degradation hot-reload failure mode to not conflate with it. (4) §4/§5: a source fix in any Angular-shipping package looks fixed by every headless signal (tests/tsc/consumer's own ngc) but is unchanged on device — stale `build`/`build-ngc` output, either the package's own prepare never ran, or (§5) the ROOT prepublish-build script hand-named packages in a --filter list and silently missed one; fix is `--filter '...glob...' --if-present`, never a hand-maintained list. Trigger also on: EMFILE too many open files watch, ngc chokidar, TS500 absoluteFrom, ngc --watch crash."
---

# Symbiote Angular adapter — build pipeline

How Angular source becomes runnable JS under Metro: two-stage AOT compilation,
every Angular-shipping package building itself, and keeping the compiled output
warm during `dev`/`start`. This is the one genuinely new build-pipeline risk
Angular introduces versus Vue — Vue's SFC compiler is a normal single-file Metro
transformer; Angular's ngtsc is a whole-program compiler that does not fit
Metro's per-file slot.

## When to use this skill

Use before touching:

- `adapters/angular/tsconfig.angular.json`, `packages/slider/tsconfig.angular.json`,
  or any new package's Angular AOT config.
- `ngc`, `ng:build` scripts, or `@angular/compiler-cli/linker`.
- Any Angular-shipping package's `package.json` `exports` map or `prepare` script.
- `adapters/angular/bin/symbiote-angular-dev.cjs`, `metro.config.js` for an Angular
  example app, or anything about Fast Refresh serving stale compiled output.
- A `TS500: Cannot destructure property 'pos' of 'file.referencedFiles[index]'`
  ngc crash, a `TS500: ... absoluteFrom(...): path is not absolute` crash, or a
  Metro `SyntaxError: decorators isn't currently enabled`.
- `EMFILE: too many open files, watch` from `ngc --watch`, or hot reload silently
  serving stale output for any framework (React/Vue/Angular).
- Interactive Metro keypresses (`r`/`j`/`d`/...) silently doing nothing during
  `dev`/`start`.

For the renderer seam itself, bootstrap, version floor, or component parity —
this skill does NOT cover those; see **Scope boundary** below.

## 1. AOT compilation under Metro — the boss

This is the one genuinely new risk vs Vue. Angular AOT is **two stages**, very
different in how they fit Metro:

```
@Component({ template })  ──ngtsc, compilationMode:'partial'──▶  ɵɵngDeclareComponent(...)
   (Stage A: compiles the TEMPLATE; needs the WHOLE TS program —              │
    template type-check + resolving other components from `imports`)          │
                                                                              │
   ──@angular/compiler-cli/linker/babel──▶  ɵɵdefineComponent(...)  (full Ivy, Hermes-ready)
   (Stage B: per-file, no program — the default Babel plugin)
```

- **Stage B is easy.** `@angular/compiler-cli/linker/babel`'s default export
  (`defaultLinkerPlugin`, `babel_plugin.ts`) is a normal per-file Babel plugin; it
  drops into Metro `babelTransformerPath` directly. It links **already-partial**
  declarations → full Ivy. It does NOT compile templates from source.
- **Stage A is the boss.** ngtsc needs the **whole TypeScript program** (template
  type-check, and a standalone component's template references other components via
  its `imports`, declared in other files). Metro's model is **per-file** ("give me
  one file → transform → cache"). A whole-program compiler does not fit that slot.
  webpack solves this with `@ngtools/webpack` (holds a live Angular program across
  the build); **Metro has no equivalent — building it is the work.**

### Variant 1 (two-phase) — chosen for start

Run `ngc --compilationMode partial` (a ready CLI tool, ships with Angular) as a
**separate process** before/beside Metro: it reads all source, emits partial-Ivy JS
to a dir; Metro reads that dir and does Stage B (linker). De-risks fastest because
the hard part (`ngc`) already exists — we only write glue.

"Dirt" of Variant 1 (all confined to the **dev harness** — build scripts +
`metro.config` + ngc config; it does NOT leak into app source, adapter code, or the
engine):

```
two processes (ngc --watch + metro)        low    — one npm script spawns both
double-watch hot-reload latency (ngc→metro) MED   — the most "felt" cost; ngc incremental is <1s
intermediate partial-output dir            low    — gitignore + Metro watchFolder
source-map chaining (.ts → partial → bundle) MED  — wire once so stacks/debugger point at real .ts
cold-start ordering (Metro waits 1st emit) low    — sequence in the start script
```

It is **not** architectural debt: this is literally how Angular builds every
published library (partial → linker), a documented path. And it is **reversible** —
swapping to Variant 2 later touches **zero** app/adapter code (both emit identical
linked Ivy; the author writes the same source).

### Variant 2 (live ngtsc in a Metro transformer) — clean endgame

The Metro transformer itself holds a live ngtsc program in memory and answers
per-file partial requests (the program already has all files loaded) — a
mini-`@ngtools/metro`. Clean surface (one source tree, native Metro watch/Fast
Refresh, no second process) but **no off-the-shelf piece exists** — it is bespoke
code that manages compiler lifecycle / incremental invalidation, and that hidden
incremental logic is exactly where it is "far easier to get a subtle bug" (stale
partial, missed recompile on a dependency change). Defer until Variant 1 proves the
chain.

### Bench-spike — PROVEN 2026-06 (Angular 22.0.4, off-Metro)

The chain `source → ngc --compilationMode partial → @angular/compiler-cli/linker/babel
→ full Ivy` is **green**. A hello-world standalone component with
`template: '<View [style]="boxStyle"><Text>Hello {{ name }}</Text></View>'` linked to:

```js
template: function AppComponent_Template(rf, ctx) {
  if (rf & 1) { i0.ɵɵdomElementStart(0, "View")(1, "Text"); i0.ɵɵtext(2); i0.ɵɵdomElementEnd()(); }
  if (rf & 2) { i0.ɵɵstyleMap(ctx.boxStyle); i0.ɵɵadvance(2); i0.ɵɵtextInterpolate1("Hello ", ctx.name); }
}
```

This directly confirms the seam input — at runtime these instructions call:
`ɵɵdomElementStart(0,"View")` → `renderer.createElement("View")` (custom tags reach
us as STRINGS → `descriptorFor`); `ɵɵstyleMap` → `renderer.setStyle`; `ɵɵtextInterpolate1`
→ `renderer.setValue`. The renderer-seam mapping table (see the main `angular-adapter`
skill §1) holds against real compiler output.

Compat facts the spike nailed (carry into the real build):

- **The Angular linker requires `@babel/core` ^7** (`assertVersion(7)`). Metro is also
  Babel-7-based (`metro-babel-transformer`), so Stage B drops into Metro with NO
  version conflict — the main hidden integration risk is retired. (Babel 8 = ESM /
  named-exports-only and is rejected by the linker — do not use it.)
- TS 6.0 needs an explicit `rootDir` in tsconfig (else TS5011).
- **Custom tags without a hyphen** (`View`, `Text`) are NOT accepted by
  `CUSTOM_ELEMENTS_SCHEMA` (that only allows hyphenated web-component tags). Options:
  `NO_ERRORS_SCHEMA` (blunt — disables all template element/attr checking) OR — the
  right call — declare `View`/`Text`/… as Angular components/directives **with those
  selectors** (wolf-tui `BoxComponent` style), which keeps template type-checking on
  and is also how the host element name reaches `createElement`.
- L1 first-paint check: confirm the `domElement*` instruction family honors a custom
  `RendererFactory2` (it does in principle — that is the whole Renderer2 contract, and
  wolf-tui proves it — but verify on the first real paint).
- partial-mode emit keeps the template as a STRING inside `ɵɵngDeclareComponent`; the
  LINKER is what compiles that string into the instruction function above.

Reproducible bench: `.ng-spike/` (gitignored): `src/app.ts` + `tsconfig.json`
(`compilationMode:'partial'`) → `ngc -p tsconfig.json` emits `partial/app.js` →
`node link.mjs` runs the linker Babel plugin and prints the verdict.

## 2. Every Angular-shipping package builds ITSELF via `prepare` + conditional `exports`

(2026-07, superseded from the original per-app-hack version documented at the bottom
of this section)

`@symbiote-native/slider` (the `@react-native-community/slider` wrapper) got an Angular entry
(`packages/slider/src/angular/`, mirroring `src/vue/slider/` — `SliderBase` (`@Directive()`,
the shared `@Input`/`@Output` surface + the `descriptor` getter folding props through the
CORE's `renderSlider`), then a concrete `@Component` per platform rendering via
`<symbiote-descriptor-outlet [node]="descriptor" />` (`DescriptorOutlet`, see the main
`angular-adapter` skill §6) — the FIRST real external consumer of that bridge, proving it
generalizes beyond `ActivityIndicator`.

**The first fix attempt (below, kept as a cautionary example — do NOT redo this) leaked the
package's own build concern into every consumer by hand**: a `paths` override in every
downstream `tsconfig.angular.json` pointing at `@symbiote-native/angular`'s prebuilt `.d.ts`, a
`resolveRequest` branch in every Angular example app's `metro.config.js` for every
Angular-shipping subpath, and the app's own `ng:build` script manually chaining
`pnpm --filter @symbiote-native/angular ng:build && pnpm --filter @symbiote-native/slider ng:build && ...`
— naming every Angular dependency by hand. Add a new Angular-shipping dependency and every
consumer's tsconfig/metro.config/`ng:build` chain needs a matching edit, or it silently
breaks in a different way at a different pipeline stage (the user's own framing: **an app must
never build its own already-built dependencies** — that responsibility belongs to the package).

**The actual fix: the package encapsulates which artifact ships to which consumer, via
conditional `exports`, and builds that artifact ITSELF via a `prepare` script.**

```jsonc
// adapters/angular/package.json (packages/slider/package.json's "./angular" subpath, same shape)
"exports": {
  ".": {
    "types": "./build/angular/index.d.ts",        // ngc partial-Ivy declaration (has ɵcmp/ɵfac)
    "react-native": "./build/angular/index.js",    // ngc partial-Ivy JS, needs the linker (Metro runs it)
    "default": "./src/index.ts"                    // raw decorated source, for JIT (vitest/oxc legacy decorators)
  }
},
"scripts": {
  "prepare": "pnpm run ng:build",
  "ng:build": "ngc -p tsconfig.angular.json"
}
```

Why each condition resolves to the right thing with ZERO consumer-side configuration:
- **`"types"`** — TypeScript's module resolution (with `moduleResolution: "Bundler"` or
  `node16`/`nodenext`) always checks the `"types"` condition first, before any other
  condition, when resolving a `.d.ts` for an import — regardless of what other conditions are
  present. So `ngc`/`tsc` in ANY downstream package (`packages/slider`, `examples/angular`)
  automatically gets the prebuilt Ivy declaration. **No `tsconfig.angular.json` `paths`
  override needed anywhere** — this is exactly what was crashing ngc with `TS500: Cannot
  destructure property 'pos' of 'file.referencedFiles[index]'` (a known cross-tool bug:
  angular-cli#32281, #31649, angular#57850, nx#33876 — raw-source resolution confuses ngc's
  diagnostic explainer). Once `exports` routes `"types"` to the prebuilt `.d.ts` unconditionally,
  ngc never sees the raw decorated source through this path and the crash class disappears.
- **`"react-native"`** — Metro (`@react-native/metro-config`) sets `unstable_enablePackageExports:
  true` and `unstable_conditionNames: ['react-native']` **by default** (verified against the
  installed `@react-native/metro-config@0.86.0` + `metro-resolver@0.84.4` in this repo — no
  config needed). So Metro automatically picks the prebuilt partial-Ivy JS for both
  `@symbiote-native/angular` and `@symbiote-native/slider/angular` with **no `resolveRequest` override at
  all** — `examples/angular/metro.config.js` no longer needs the per-specifier branches or the
  `extraNodeModules` entry for `@symbiote-native/angular` that the old approach required.
- **`"default"`** — Vitest (Vite's resolver) and any other Node-based consumer don't set a
  `"react-native"` condition, so they fall through to `"default"` → raw decorated source, same
  as today; `vitest.config.ts`'s `oxc: { decorator: { legacy: true } }` still lowers the
  decorators for JIT evaluation exactly as before. Nothing about the test path changes.

**The `prepare` script is what makes "the package builds itself" literally true, not just
aspirational.** Verified empirically (isolated scratch pnpm workspace, this session): pnpm 11
runs a workspace-local package's `prepare` script automatically on `pnpm install`, **in
topological dependency order** (a dependency's `prepare` completes before a dependent
package's `prepare` runs) — confirmed with a 2-package chain where package B's `prepare`
script asserted package A's build artifact already existed. This is NOT gated by
`pnpm-workspace.yaml`'s `allowBuilds` allowlist (that gate — see the existing `detox`/`esbuild`/
`sharp`/`dtrace-provider` entries — applies to lifecycle scripts of FETCHED registry
dependencies with native/build steps; a local `workspace:*` package's own scripts run
unconditionally, same trust level as the app's own source). So: `pnpm install` at the repo
root is sufficient to produce `adapters/angular/build/angular` and
`packages/slider/build-ngc/angular` in the correct order — **no consumer ever runs another
package's `ng:build`.**

**A consuming app's `ng:build` script therefore does exactly ONE thing: compile ITS OWN
source** (`"ng:build": "ngc -p tsconfig.angular.json"`, no `pnpm --filter` chain). This is not
optional cleanup — an app hand-listing its dependencies' build commands is precisely the leak
this section exists to describe; if you find yourself adding a `pnpm --filter <dep> ng:build &&`
to an app's script, that dependency is missing its own `prepare`/conditional-`exports` pair —
fix it there, not in the app.

**Generalizes to any future third-party wrapper** (`@symbiote-native/<x>/angular`): give it the same
three things — a `tsconfig.angular.json` (`compilationMode: 'partial'`, `strictTemplates:
true`, its own `outDir`), an `ng:build` script, a `prepare` script that runs it, and a
conditional `exports` entry for the Angular subpath shaped exactly like the block above. That
is the ENTIRE integration surface — no example app's `metro.config.js` or `tsconfig.angular.json`
needs to change to consume it. The new output directory needs a `.gitignore` entry if its name
doesn't already match an ignored pattern (`build-ngc/` was added for this reason — the root
`build/` pattern doesn't match a differently-named directory).

**Confirmed missing on `packages/navigation` (found 2026-07-09).** Its `./angular` export was
still a bare string (`"./angular": "./src/angular/index.ts"`) — the exact anti-pattern this
section describes — and it reproduced the identical `TS500` crash the moment `.examples/angular`
added it as a `workspace:*` dependency. Concrete confirmation the generalization above isn't
hypothetical: any Angular-shipping package that skips this gets the same crash, verbatim. Fixed
by giving it the same `build-ngc/angular` + `ng:build` + `prepare` + conditional-`exports` shape
as `packages/slider`.

**Wrong turn to avoid when this crash shows up and the fix above isn't front of mind: do NOT
widen the CONSUMING app's `tsconfig.angular.json` `rootDir`** (e.g. from `"."` to `"../.."`) to
make the dependency's raw source "count" as in-root. It silences the crash, but `outDir` mirrors
the source tree relative to `rootDir`, so the app's own compiled output shifts from the expected
flat `build/angular/App.js` to a nested `build/angular/<app's-relative-path>/App.js` — breaking
any fixed downstream import (`index.js`'s `import ... from './build/angular/App'`) and needing a
postbuild flatten step that has to re-run on every watch recompile. TS project references
(`composite`/`tsc -b`) and `preserveSymlinks: true` are two more textbook-looking fixes that also
don't fit here: the former conflicts with the `.examples/*` live-source-edit convention this repo
relies on (`workspace:*`, no rebuild step — see `symbiote-dev-examples`), and pnpm's own docs warn
`preserveSymlinks` breaks type resolution for linked `node_modules` generally. The fix is always
in the DEPENDENCY's `exports`, per this section — never in the consumer's tsconfig.

### 2a. A plain, decorator-free NEW subpath on `adapters/angular` still needs the SAME conditional shape

Don't assume the conditional-`exports` requirement only applies to the package's main Angular
surface. Adding a small, unrelated, decorator-free subpath (e.g. `"./bootstrap": "./src/bootstrap.ts"`
for a zero-config app-entry helper, no `@Component`/`@Directive` anywhere in it) as a **plain string
path** still breaks Metro, because `adapters/angular/src/` is one interconnected module graph: that
new file's own relative imports (`./modules/app-registry` → `../../render` → `./services/*.service.ts`)
transitively reach a `@Injectable()`-decorated file within the SAME package. A plain subpath resolves
Metro straight to raw `.ts` source, which then parses the decorated file with Metro's plain Babel
transform (no linker) and throws `SyntaxError ... Support for the experimental syntax 'decorators'
isn't currently enabled` — even though the new file you added has zero decorators itself. `tsc --build`
and `vitest` both stay green (neither routes through Metro's package-exports resolution), so this only
surfaces on a real Metro bundle/simulator run.

The fix is identical to the main `"."` entry — give the new subpath the same three-condition shape,
pointing `"react-native"` at the file `ngc` already compiles into `build/angular/` (since
`tsconfig.angular.json`'s `"include": ["src/**/*.ts"]` covers the whole `src/` tree, the compiled
counterpart already exists after `ng:build`, no extra build step needed):

```jsonc
"./bootstrap": {
  "types": "./build/angular/bootstrap.d.ts",
  "react-native": "./build/angular/bootstrap.js",
  "default": "./src/bootstrap.ts"
}
```

Rule of thumb: on `adapters/angular` (or any Angular-shipping package), EVERY subpath in `"exports"`
needs this conditional shape, never a bare string — there is no such thing as a "safe" plain-string
subpath once the package has even one decorated file anywhere in its module graph.

<details>
<summary>Original (leaky) fix — kept only as a "what not to do" reference, superseded above</summary>

The first pass solved the same two symptoms (`ngc` `TS500` crash; Metro `SyntaxError:
decorators isn't currently enabled`) by patching every CONSUMER instead of the package: a
`paths` override in `examples/angular/tsconfig.angular.json` and `packages/slider/
tsconfig.angular.json` pointing `@symbiote-native/angular` at its prebuilt `.d.ts` by hand, a
`resolveRequest` override in `examples/angular/metro.config.js` with one exact-match branch
per Angular-decorated specifier (`@symbiote-native/angular`, `@symbiote-native/slider/angular`), and
`examples/angular/package.json`'s `ng:build` manually chaining
`pnpm --filter @symbiote-native/angular ng:build && pnpm --filter @symbiote-native/slider ng:build && ngc -p
tsconfig.angular.json`. It worked, but every new Angular-shipping dependency needed the same
three edits applied again, by hand, in every consumer — exactly the "инкапсулировать внутри
пакета" complaint that led to the `exports`+`prepare` fix above. All of it has been removed
from the actual config files; this paragraph exists so a future session doesn't reintroduce it.

</details>

## 3. `dev`/`start` need `ngc --watch` running alongside Metro — and it must NOT wrap Metro's stdin

`index.js` imports the COMPILED `./build/angular/src/App` (§3a explains the `src/` segment),
not `App.ts` itself (§1's Variant 1 shape). So `dev`/`start` must keep `build/angular/`'s
output in sync while editing, or Fast Refresh has nothing new to serve — Metro dutifully
reloads the same stale compiled output forever, which looks exactly like "hot reload doesn't
work" with no error anywhere. Fix: run `ngc -p tsconfig.angular.json --watch` for the whole
dev session, not just the one-shot `ng:build` the scripts used to do.

**First attempt — wrapping both processes in `concurrently` — broke Metro's interactive
keypresses (`r`/`j`/`d`/...).** Metro's CLI reads those as raw, unbuffered keystrokes off
stdin (TTY raw mode), and a process-manager wrapper that owns/pipes stdin to fan it out to
multiple children (`concurrently`, `npm-run-all`, ...) does not reliably preserve that raw
TTY passthrough to the specific child that needs it — the symptom is silent: no crash, no
warning, the keys just do nothing.

**Fix (superseded 2026-07, was a per-app bash script `dev-with-watch.sh`, now
`adapters/angular/bin/symbiote-angular-dev.cjs`, one shared cross-platform launcher every
Angular app's `dev`/`start` calls via `npx symbiote-angular-dev`)**: run `ngc --watch` as a
plain background `child_process.spawn`, and let `react-native start` stay the sole FOREGROUND
process, inheriting stdin directly from the real terminal with no wrapper in between — same
principle as the original bash version (`&` + `trap EXIT`), just cross-platform and shared
across every Angular canary instead of duplicated per app:
```js
const initialBuild = spawnSync('ngc', ['-p', TSCONFIG], { stdio: 'inherit', shell: true });
const ngcWatch = spawn('ngc', ['-p', watchTsconfigPath, '--watch'], { stdio: 'inherit', shell: true });
const metro = spawn('react-native', ['start', ...metroArgs], { stdio: 'inherit', shell: true });
metro.on('exit', code => { ngcWatch.kill(); process.exit(code ?? 0); });
```
`package.json`'s `dev`/`start` just call `symbiote-angular-dev` (`--reset-cache` passed through
as CLI args for `dev`). This generalizes to any future case in this repo of "run a background
watcher alongside an interactive foreground CLI": plain background spawn + kill-on-exit, not a
process-manager package, whenever the foreground process needs real stdin/TTY control.

### 3a. `ngc --watch`'s own chokidar recurses the WHOLE tsconfig directory — EMFILE on `ios`/`android`, fixed via `angularCompilerOptions.basePath` + a `src/` split (2026-07)

**Incident:** `symbiote-angular-dev`'s `ngc --watch` crashed with
`EMFILE: too many open files, watch` on a completely fresh, correctly-installed canary — no
version drift, no environment misconfiguration. Root-caused by reading the actual vendored
source, not by inference: `@angular/compiler-cli`'s watch mode
(`perform_watch.js`/`createPerformWatchHost`, bundled as `chunk-IR3PPLIF.js`) does

```js
const watcher = chokidar.watch(options.basePath, {
  ignored: (p) => /((^[\/\\])\..)|(\.js$)|(\.map$)|(\.metadata\.json|node_modules)/.test(p),
  ignoreInitial: true,
  persistent: true,
});
```

— a blunt, dependency-graph-blind recursive watch of `options.basePath`, filtered only by that
hardcoded regex (`.dotfiles`, `.js`, `.map`, `.metadata.json`, `node_modules` — **not**
`ios`/`android`/`build`). `basePath` defaults to `dirname(<the -p tsconfig path>)` — see
`calcProjectFileAndBasePath()` in `chunk-KSGQLYXT.js` — with **zero relation** to the TS
program's actual `rootNames`/`files`/`include`. In a React Native app, `ios/`/`android/` (full
generated Xcode/Gradle projects, tens of thousands of files) sit as SIBLINGS of the tsconfig,
so the watch recursed into both and blew macOS's per-process fd/watch-handle limit. `ngc`'s CLI
has no flag for this (`ngc --help` — no `--basePath`); it is ONLY settable via
`angularCompilerOptions.basePath` in the tsconfig JSON. Cross-checked against prior art before
fixing: NativeScript-Angular's webpack-based watcher (`watchpack`) only watches files that are
actually in the import graph, architecturally immune to this class of bug — confirming
`ngc --watch`'s "recurse the whole directory" design is the naive part, not RN's `ios`/`android`
convention.

**The fix is structural, not a patch or an env tweak** — raising `ulimit -n` was tried and
disproven first (the crash reproduces identically even with the soft AND hard limit raised past
1,000,000; it is not really about raw fd count), and `patch-package` on the vendored regex was
considered and rejected (fragile, needs re-verifying on every Angular bump). Three real,
composable pieces:

1. **`angularCompilerOptions.basePath` IS a sanctioned override** — `readConfiguration()`
   spreads the tsconfig's own `angularCompilerOptions` block OVER the computed default
   `{genDir: basePath, basePath}`, and this exact value is what `chokidar.watch()` uses as its
   root. Confirmed empirically that overriding it does NOT affect actual file/`rootDir`/`files`
   resolution at all (pointed it at an unrelated directory and the build still found and
   compiled the real files correctly) — it is consumed ONLY by the watch call. This means it can
   be narrowed WITHOUT touching `rootDir` (§2's own "do NOT widen rootDir" warning is about a
   different, unrelated crash class — narrowing basePath doesn't touch rootDir at all).
2. **The app's whole Angular source tree moves into a `src/` subdirectory**, since narrowing
   `basePath` only helps if the actual source no longer has `ios`/`android` as a watch-root
   sibling. Move `App.ts` and everything it transitively imports (screens, components, routes,
   navigation config, `.css`) as ONE UNIT, preserving relative structure between files 1:1 — this
   needs zero import-statement rewrites, since every file's relative imports to its siblings stay
   correct after a uniform depth shift. `ios`/`android`/`node_modules`/`build`/`assets` stay at
   the app root. `tsconfig.angular.json` becomes:
   ```jsonc
   "files": ["src/App.ts", "src/css.d.ts"],
   "angularCompilerOptions": { "basePath": "src" }
   ```
   `rootDir: "."` and `outDir: "build/angular"` stay untouched (protected — §2's rule), so output
   now lands at `build/angular/src/...` — update `index.js`'s
   `import { AppComponent } from './build/angular/App'` to `'./build/angular/src/App'`.
   `adapters/angular/metro-config.cjs`'s existing CSS-redirect `resolveRequest`
   (`withSymbioteAngularMetroConfig`) already derives its source directory generically from
   `outDir`/`rootDir`, so it needs **zero changes** — it resolves a relative `import './App.css'`
   from the new nested build output back to `src/App.css` automatically.
3. **A second, independent bug surfaces once `basePath` narrowing is actually tested**: the
   INCREMENTAL recompile path (`perform_watch.js`'s `doCompilation()` reusing `oldProgram` on the
   2nd+ file-change event) calls `absoluteFrom()` directly on `angularCompilerOptions.basePath`
   and throws `TS500: Error: Internal Error: absoluteFrom(<value>): path is not absolute` if it
   isn't already absolute — even though the FIRST/cold compile (the initial `ngc -p ...` and
   watch's own first compile before any file change) tolerates a relative value fine. Cause:
   `readConfiguration()`'s DEFAULT basePath is always `host.resolve(projectDir)` (absolute); an
   explicit `angularCompilerOptions.basePath` in tsconfig JSON overrides it via object spread with
   **zero extra resolution applied**, so a relative value like `"src"` stays relative all the way
   into ngtsc's incremental-reuse path, which — unlike the cold path — needs it pre-resolved.
   Since hardcoding a machine-specific absolute path into a checked-in tsconfig isn't portable,
   `symbiote-angular-dev.cjs` resolves it at spawn time instead: reads the real
   `tsconfig.angular.json` via `ts.readConfigFile()` (TypeScript's own JSONC-aware parser — avoids
   a fragile hand-rolled comment-stripper), and if `angularCompilerOptions.basePath` is relative,
   writes a throwaway `{extends: <absolute real tsconfig path>, angularCompilerOptions: {basePath:
   <resolved absolute>}}` override and points `ngc --watch` at THAT — the checked-in tsconfig
   itself stays fully portable. The initial one-shot build (both the script's own pre-watch build
   and the standalone `ng:build` script) keeps using the real tsconfig directly; a relative
   `basePath` is fine cold, only the incremental-reuse path needs the override.
   - **Gotcha inside the gotcha**: the override config was first written to `os.tmpdir()` — broke
     with `TS2688: Cannot find type definition file for 'node'`, because TS resolves default
     `typeRoots`/`@types` by walking UP from the EXTENDING config's own directory, and a tmpdir has
     no `node_modules` above it. Fixed by writing the override into the app's own `build/`
     directory (already gitignored, and has `node_modules` above it same as the real tsconfig)
     instead. General lesson beyond this one script: a generated/ephemeral tsconfig that `extends`
     a real project config must live INSIDE that project's directory tree — a scratch/tmp location
     outside it breaks implicit type resolution even though explicit `files`/`extends` paths still
     resolve fine.

Verified end-to-end via real `npx symbiote-angular-dev` runs (not bare `ngc` calls) in both
`examples/angular` and `.examples/angular`: no EMFILE, no TS500, a real source edit triggers
"File change detected. Starting incremental compilation." → "Compilation complete." → the
compiled output's mtime updates — repeatably. SIGTERM teardown confirmed clean (ngc, Metro, and
the generated override config all clean up).

**A separate, unrelated hot-reload failure mode to not conflate with this one**: Metro's OWN
file watcher goes through Watchman (`watchman debug-status`), completely independent of `ngc`'s
internal chokidar above. A Watchman watch that's degraded on the relevant root
(`recrawl_info.warning` mentioning `MustScanSubDirs`/a climbing `count` — typically from a burst
of filesystem churn, e.g. a large `npm install`/lockfile change) breaks Fast-Refresh-style hot
reload for EVERY framework (React, Vue, Angular alike), not just Angular's `ngc --watch`. Fixed
via the standard recovery Watchman's own warning suggests: `watchman watch-del <root> && watchman
watch-project <root>`. If "hot reload is broken" is reported, check `watchman debug-status` FIRST
(cheap, rules the Metro-side cause in/out for every framework at once) before assuming it's this
section's `ngc`-specific bug.

## 4. A real-device fix in `adapters/angular/src/**` is invisible until the ADAPTER itself rebuilds — not just the example app

**Incident (2026-07):** a ScrollView Android layout bug was correctly root-caused and fixed in
`adapters/angular/src/components/scroll-view/{shared,index.android}.ts`, proven with a
red→green unit test, `tsc --build`, and a clean `examples/angular` `ngc` build — every
headless signal said "fixed." On a real emulator it was still broken. Root cause: `ng:build`
was only re-run inside `examples/angular` (the app's own AOT compile), which reads
`@symbiote-native/angular` through its `"react-native"` export condition
(`adapters/angular/build/angular/index.js`, §2 above) — a precompiled artifact that is
**only** regenerated by the adapter package's own `prepare`/`ng:build`. Editing
`adapters/angular/src/**` does not touch that artifact; Metro has no Fast Refresh path back
to it outside an active `ngc --watch` (§3). The app's own `ng:build` succeeding proves nothing
about whether the *dependency* rebuilt — it just recompiles the app against whatever
`build/angular/` already contains, stale or not.

**Fast diagnostic**: if a source fix in `adapters/angular/src/**` (or any Angular-shipping
package) passes unit tests + `tsc` + the CONSUMING app's own `ngc` build, but a real-device
symptom persists unchanged, suspect a stale dependency build before any further debugging.
Compare mtimes: `stat -f "%Sm" adapters/angular/build/angular/index.js` against the edited
source file — if the build predates the edit, that is the whole bug. A dlog added to the
edited file and never appearing in `adb logcat` after a fresh app restart is the same tell at
runtime (confirms the OLD code is genuinely what's loaded, not a timing/cache fluke elsewhere).

**Fix**: `cd adapters/angular && pnpm run ng:build` (or `pnpm install` at the repo root, which
reruns every workspace package's `prepare` in topological order) — then relaunch the app.
Generalizes to any Angular-shipping dependency (`packages/slider`, a future wrapper): rebuild
THAT package, not the app that consumes it.

## 4a. `ngc -p` NEVER deletes orphaned outputs — clean `build/` before every build, or a stale file SHADOWS the current one

**Incident (2026-07-17, device-verified):** app-authored composed screens and even a statically-tagged
`Stack` rendered blank on iOS / redboxed on Android (`Can't find ViewManager '<selector>'`) under
`.examples/angular` (`workspace:*`), while the freshly-built npm/canary `examples/angular` worked. That
split — local workspace build broken, fresh pack fine — is the signature of stale local artifacts.

`ngc -p tsconfig.angular.json` (and plain `tsc -p`, i.e. NON-`--build` mode) emits new outputs but NEVER
prunes ones whose source disappeared. When the adapter renderer moved `src/renderer.ts` →
`src/renderer/index.ts` (a `symbiote-file-layout` folder-as-module pass), ngc wrote
`build/angular/renderer/index.js` and left the now-orphaned `build/angular/renderer.js` behind. **In
Node/Metro resolution a FILE beats a directory**, so `require.resolve('./renderer')` (the barrel's
`export … from './renderer'`) picked the stale flat `renderer.js` — which still carried an old inline copy
of `ANCHOR_HOST_COMPONENTS`. Result: the bundle had TWO registry modules, `registerComposedComponent` wrote
one Set and `createElement` read the stale other, and every composed selector fell through to a raw native
view name.

**Headless diagnostic (no device needed):** ngc the app, then
`react-native bundle --platform ios --dev true --reset-cache --bundle-output <tmp>.js`, then grep the bundle
— `grep -c 'function isAnchorHostComponent'` (or any distinctive singleton definition) should be 1; a count
of 2 means a duplicate/stale module got bundled. Cross-check on disk with
`node -e "console.log(require.resolve('./build/angular/renderer'))"` — if it returns `…/renderer.js` while
the live source is `renderer/index.ts`, that flat file is a stale shadow.

**Fix / rule:** every Angular-shipping package (`adapters/angular`, `packages/{slider,navigation,splash-screen}`)
has `"clean": "rm -rf build"` and `"ng:build": "pnpm run clean && ngc …"`. Do NOT drop the clean prefix, and
add it to any NEW `ngc -p`/`tsc -p`-built package. The general lesson beyond Angular: after ANY source
file/folder rename in a package whose build tool doesn't prune (`ngc -p`, `tsc -p`, most transpilers),
`rm -rf` the output dir before rebuilding — an incremental build over a renamed layout is a latent
wrong-module bug that headless `tsc`/unit tests never catch (they read `src`, not the shadowed `build/`).

## 5. The ROOT `prepublish-build`/`build` script needs every Angular-shipping package too — a hand-maintained `--filter` list silently drifts

**Incident (2026-07):** a Tab/Drawer focus-synthesis fix in `packages/navigation/src/angular/{tabs,drawer}.ts`
passed unit tests, `tsc --build`, and `.examples/angular`'s own `ngc` build — every headless
signal said "fixed," same as §4's ScrollView incident. On a real device, unchanged. Root cause
was the SAME class of staleness §4 describes (`.examples/angular` reads
`@symbiote-native/navigation`'s `"./angular"` export through its `"react-native"` condition,
`packages/navigation/build-ngc/angular/*.js` — only regenerated by that package's own
`ng:build`/`prepare`), but from a DIFFERENT, not-yet-documented source: the repo ROOT's
`package.json` `"prepublish-build"` script —
```jsonc
"prepublish-build": "pnpm run typecheck && pnpm run fix-esm-extensions && pnpm --filter @symbiote-native/angular --filter @symbiote-native/slider run ng:build"
```
— named `@symbiote-native/angular` and `@symbiote-native/slider` by hand and never named
`@symbiote-native/navigation`, even though that package has had its own `ng:build`/`prepare`/
conditional-`exports` triad (§2's shape) since 2026-07-09. Running `pnpm build` (`build` →
`prepublish-build`) therefore silently skipped rebuilding it — exactly the same silent-drift
failure §2 warns about for a CONSUMING app's `ng:build` script ("if you find yourself adding a
`pnpm --filter <dep> ng:build &&`... that dependency is missing its own `prepare`), just at the
monorepo's own orchestration script instead. Confirmed not hypothetical: `packages/splash-screen`
— which also has its own `ng:build` — was independently missing from the same list, unnoticed
until this incident because nothing had exercised its Angular AOT output on a real device yet.

Note this is a genuinely different bug class from §2/§4: `pnpm install`'s automatic
topological `prepare` run (§2, confirmed empirically) DOES rebuild every package correctly on a
fresh install — the gap is specifically that `pnpm build`/`prepublish-build` does not itself
trigger `prepare` (only `pnpm install` does), so a workflow of "edit source → `pnpm build` →
`pnpm dev`" with no intervening `pnpm install` never rebuilds anything whose only trigger is
`prepare`.

**Fix — stop naming packages by hand, run the script everywhere it exists:**
```jsonc
"prepublish-build": "pnpm run typecheck && pnpm run fix-esm-extensions && pnpm --filter './{core,adapters,packages}/*' --if-present run ng:build"
```
`--if-present` makes pnpm silently skip any workspace package under `core/`, `adapters/`, or
`packages/` that has no `ng:build` script, instead of erroring — so this never needs another
manual edit when a new Angular-shipping package is added (or an existing one gains `ng:build`
for the first time). Scoped to `{core,adapters,packages}` rather than a bare `pnpm -r
--if-present` specifically to exclude `examples/*`/`.examples/*` (those are demo apps, not
publishable packages — `prepublish-build`'s job is package publish-readiness, not building every
demo app in the monorepo).

**Diagnostic when this class of bug is suspected**: `grep -n '"prepublish-build"' package.json`
and check whether it's still a hand-maintained `--filter A --filter B` chain rather than
`--filter '...glob...' --if-present`. If hand-maintained, cross-check every package with an
`ng:build` script (`grep -rl '"ng:build"' core/*/package.json adapters/*/package.json
packages/*/package.json`) against the list — any package present in the grep but absent from
the filter list has the exact staleness bug this section describes, whether or not it has been
noticed yet.

## Verification checklist

After changing anything in the build pipeline:

1. `pnpm install` at the repo root rebuilds every Angular-shipping package's `prepare`
   output in topological order — confirm `adapters/angular/build/angular/` and (if touched)
   `packages/slider/build-ngc/angular/` exist and are current.
2. A consuming app's own `ng:build` compiles ONLY its own source — grep for `pnpm --filter`
   chains inside any `ng:build` script; if found, that dependency is missing its
   `prepare`/conditional-`exports` pair. Separately, confirm the ROOT `prepublish-build` script
   uses `--filter '...glob...' --if-present` rather than a hand-maintained package list (§5) —
   the same drift risk applies there, just at the monorepo level instead of a single app.
3. `tsc`/`ngc` never resolves a dependency's raw decorated `src/index.ts` for an Angular
   import — if it does, the `"types"` condition is missing or misordered in that package's
   `exports`.
4. Metro resolves the `"react-native"` condition for every Angular-shipping package with no
   `resolveRequest` override in `metro.config.js` — a manual branch there is a sign the
   package's conditional `exports` regressed.
5. Run `dev`/`start` and confirm both: Metro's interactive keys (`r`/`j`/`d`) still respond,
   AND editing an Angular source file triggers Fast Refresh (not stale compiled output).
6. Re-run the bench-spike shape (`.ng-spike/`) after any Angular/TypeScript/Babel version
   bump — the linker's `@babel/core` ^7 requirement and TS `rootDir` requirement are exactly
   the kind of thing a version bump silently breaks.

## Common failure modes

**A package's `tsc --build` (the real typecheck gate) deliberately EXCLUDES `*.test.ts`**: e.g.
`packages/navigation/tsconfig.json` excludes test files from its build project. Don't build an
ad-hoc scratch tsconfig to force-typecheck them: extending `tsconfig.angular.json` (its
`moduleResolution: "Bundler"` + `angularCompilerOptions.strictTemplates` + `ES2022`/`DOM` lib) onto
per-file test compilation surfaces a pre-existing TS2339/TS2349 "`Property/expression does not
exist on type 'never'`" false positive on ordinary guard patterns (`if (!host) throw ...; return
host.someProp;`), confirmed 2026-07 by diffing against a `git stash`ed pre-change baseline, where
the identical errors already existed untouched. This is presumably why the project excludes test
files from the real build in the first place. Trust `pnpm run typecheck` (which excludes tests) +
`vitest run` (which actually executes them) as the real gates; don't chase this "never" narrowing
error in a scratch check without first proving it isn't already there on the baseline.

| Failure | Cause | Fix |
|---|---|---|
| `ngc` crashes with `TS500: Cannot destructure property 'pos' of 'file.referencedFiles[index]'` | ngc resolved a dependency's raw decorated source instead of its prebuilt `.d.ts` | Add/fix that dependency's `"types"` condition in `exports` |
| Metro throws `SyntaxError: decorators isn't currently enabled` | Metro resolved a package's raw decorated `src/` instead of the linked `build/angular` output | Add/fix that dependency's `"react-native"` condition in `exports`, ensure its `prepare` ran |
| Fast Refresh reloads but shows old code | `symbiote-angular-dev`'s `ngc --watch` isn't running (crashed, or `dev`/`start` bypassed it), so `build/angular/` is stale | Confirm `ngc --watch` is still alive in the process list; if it crashed, see §3a for EMFILE/TS500 |
| Metro's `r`/`j`/`d` keypresses do nothing during `dev` | `concurrently`/`npm-run-all` (or similar) is wrapping stdin and breaking raw TTY passthrough to Metro | Run the watcher as a plain background child process (not a process-manager package), keep `react-native start` the sole foreground process — see `symbiote-angular-dev.cjs` |
| A new Angular dependency needs consumers' `metro.config.js`/`tsconfig.angular.json`/`ng:build` edited | It is missing its own `prepare` script + conditional `exports` | Give it `tsconfig.angular.json` + `ng:build` + `prepare` + `exports`, per §2's template — never patch consumers |
| A source fix in `adapters/angular/src/**` (or `packages/slider/src/angular/**`) passes tests/tsc/the app's own `ngc` build, but a real-device symptom is unchanged | Only the consuming app's `ng:build` was re-run; the ADAPTER's own precompiled `build/angular/` (§2's `"react-native"` export target) never rebuilt | `cd adapters/angular && pnpm run ng:build` (or `pnpm install` at root) before retesting on device — see §4 |
| Linker throws an assertVersion/Babel error after a dependency bump | `@babel/core` moved off the ^7 line, or Babel 8 (ESM-only) got pulled in | Pin `@babel/core` ^7 for the linker; do not adopt Babel 8 |
| ngc fails with `TS5011` on a fresh TS version | TS 6.0 needs an explicit `rootDir` in the Angular tsconfig | Add `rootDir` to `tsconfig.angular.json` |
| Template compiles but `<View>`/`<Text>` fail schema validation | Custom tags without a hyphen aren't accepted by `CUSTOM_ELEMENTS_SCHEMA` | Declare `View`/`Text`/… as real Angular components/directives with those selectors (not `NO_ERRORS_SCHEMA`) |
| A consuming app's typecheck still resolves an OLD export name after a rename/delete under a package's `src/angular/**` | `ngc`'s `build-ngc/angular/` output is incremental and doesn't clean up files whose source moved/vanished; the consumer's `package.json` `exports["./angular"].types` points at that stale `.d.ts`, not live source | `pnpm run ng:build` in the renamed package, then `rm -rf` the stale generated subdirectory if `ngc` left one behind, before trusting any consumer's typecheck |
| A source fix in `packages/navigation/src/angular/**` (or any Angular-shipping package) passes tests/tsc/`.examples/angular`'s own `ngc` build, but `pnpm build && pnpm dev` shows no change on device | ROOT `prepublish-build` hand-named packages in its `--filter` list and missed this one — `pnpm build` doesn't trigger `prepare` the way `pnpm install` does | `--filter '...glob...' --if-present` instead of a hand-maintained list, per §5 |
| `ngc` fails with `TS6307: File 'X' is not listed within the file list of project` on a file that clearly exists | `tsconfig.angular.json`'s `include` names an explicit flat file path (e.g. `"src/register.ts"`) that a folder-as-module refactor (ADR 0026, `symbiote-file-layout` skill) turned into a folder (`src/register/index.ts`) — the old path no longer resolves, so ngc silently drops it from the program even though something else imports it | Update the stale entry to a glob over the new folder (`"src/register/**/*.ts"`); after any folder-as-module refactor, grep every Angular-shipping package's `tsconfig.angular.json` `include` array for flat paths that moved |
| `symbiote-angular-dev`'s `ngc --watch` crashes with `EMFILE: too many open files, watch` | `perform_watch.js`'s chokidar watches `angularCompilerOptions.basePath` (defaults to the tsconfig's own directory) recursively, filtered only by a hardcoded regex that never excludes `ios`/`android`/`build` — those full native platform trees are siblings of the tsconfig and blow the fd/watch-handle limit | §3a: move the app's real source into `src/`, narrow `angularCompilerOptions.basePath` to `"src"` |
| `ngc --watch` runs fine on the first compile, then throws `TS500: Error: Internal Error: absoluteFrom(<value>): path is not absolute` on the SECOND+ file change | The incremental-reuse compile path calls `absoluteFrom()` on `angularCompilerOptions.basePath` directly and needs it pre-resolved to absolute, unlike the cold-compile path which tolerates a relative value | §3a: let `symbiote-angular-dev.cjs` resolve it to absolute at spawn time via a generated override config — never hardcode an absolute path in the checked-in tsconfig |
| Editing an Angular source file never triggers Fast Refresh, on React/Vue apps too (not Angular-specific) | Metro's OWN watcher (via Watchman) is degraded on the relevant root, unrelated to `ngc`'s internal chokidar | §3a: `watchman debug-status` → if `recrawl_info.warning` shows `MustScanSubDirs`/climbing count, `watchman watch-del <root> && watchman watch-project <root>` |

## Scope boundary

This skill owns the **BUILD pipeline**: two-stage AOT (ngtsc partial → compiler-cli
linker), Variant 1 vs Variant 2, the bench-spike proof and compat facts, every
Angular-shipping package building itself via `prepare` + conditional `exports`, and the
`dev`/`start` watch-alongside-Metro workflow. For everything else about the Angular
adapter, see the main **`angular-adapter`** skill (§0 status, the Renderer2/
RendererFactory2 seam, the DOM-less bootstrap, the `@angular/core >=20` version floor,
zoneless change-detection wiring, and the component parity model), and its more focused
siblings by topic:

- **`angular-adapter-change-detection`** — CD scheduling, `SignalView`, `ApplicationRef`.
- **`angular-adapter-events`** — `@Output()` conversion, the onScroll-family exception,
  the anchor double-fire bug, wrapped-component forwarding breakage.
- **`angular-adapter-lists`** — `FlatList`/`SectionList`/`ScrollView` projection bugs.
- **`angular-adapter-portal`** — `createPortal`/`createTunnel`/`AppRegistry`.

If the work is about how Angular *code becomes runnable JS* — this skill. If it's about
what that JS *does at runtime* — one of the siblings above.
