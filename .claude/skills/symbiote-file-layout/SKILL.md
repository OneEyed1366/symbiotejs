---
name: symbiote-file-layout
description: "Symbiote file layout & placement conventions — read BEFORE creating, moving, or renaming ANY file in the SymbioteNative monorepo, or deciding where a type / module / component goes. Covers (1) the MONOREPO MAP — core/{engine,components}, adapters/{react,vue}, examples/{react,vue-sfc,vue-tsx}, packages/{slider,android}, .docs/, .ng-spike/. (2) ADR 0026 FOLDER-AS-MODULE — a module that has platform (X.ios/X.android) and/or shared (X-shared) variants lives in its OWN folder X/ with an index barrel (X/index.ts base, X/index.ios.ts, X/index.android.ts, X/shared.ts, co-located X/X.test.ts); the real example is core/engine/src/vibration/. A SINGLE-file module with no variants STAYS FLAT (node.ts, commit.ts). The import contract is unchanged: from '.../X' resolves to the folder; only an explicit platform import changes ('.../X.ios' → '.../X/index.ios', '.../X-shared' → '.../X/shared'). (3) ADAPTER src/ BUCKETS — components/ modules/ utils/ carry the SAME name in every adapter; the lifecycle bucket is framework-idiomatic (React hooks/, Vue composables/ — a Vue hooks/ or React composables/ folder is WRONG); the reconciler wiring stays FLAT at package root (index, render, host-config/renderer, descriptor-to-X, components.ts barrel, *.d.ts). (4) the PROP-TYPE SPLIT — an all-agnostic public prop type (ISwitchProps, IActivityIndicatorProps) lives ONCE in @symbiote-native/components and every adapter RE-EXPORTS it verbatim (never redeclares); a type with a framework children/ref/render-callback (IViewProps, IPressableProps) is declared per-adapter over the shared agnostic base. (5) dlog gating, Metro filename platform-selection (ADR 0020). Trigger on any file-placement / move / rename / 'where does this go' / 'should this be a folder' decision."
---

# Symbiote file layout & placement conventions

Where a file goes is governed, not freeform. Two ADRs and three category rules
decide it. Get this right before creating or moving anything — the structure is
load-bearing (Metro platform-selection, pnpm isolation, the adapter parity model
all depend on it).

## 1. The monorepo map

```
core/
  engine/      @symbiote-native/engine     — retained tree + clone-on-write + pure utils (Platform, StyleSheet, dlog)
  components/  @symbiote-native/components  — framework-agnostic state machines + render fns (→ Descriptor)
adapters/
  react/       @symbiote-native/react       — react-reconciler host config (reference adapter)
  vue/         @symbiote-native/vue          — @vue/runtime-core createRenderer
examples/
  react/  vue-sfc/  vue-tsx/  angular/  — PUBLIC canary apps, @symbiote-native/* always catalog: (published)
.examples/       — same four apps, PRIVATE dev harness, @symbiote-native/* always workspace:*, gitignored
                    (see symbiote-dev-examples — never wire dev work into examples/ instead)
packages/
  slider/      a third-party-style package;  android/  native host shims
.docs/         decision records (ADRs) + e2e cases
.ng-spike/     Angular prototype (pre-production, gitignored — NOT adapters/angular yet)
.claude/skills/  these skills
```

Code imports only `@symbiote-native/*` barrels. Internal grouping is invisible to
consumers — moving a file between buckets never changes a package's public
surface (the `src/index.ts` barrel is the only thing external code touches).

## 2. ADR 0026 — folder-as-module (the big one)

**A module gets its own folder ONLY if it has platform and/or shared variants.**
A single-file module with no variants stays FLAT. This is the most common
file-placement mistake.

```
HAS VARIANTS → folder + index barrel        NO VARIANTS → stays flat
core/engine/src/vibration/                  core/engine/src/node.ts
  index.ts          (base: re-exports iOS    core/engine/src/commit.ts
                     for headless/tsx)        core/engine/src/surface.ts
  index.ios.ts      (platform)               core/engine/src/debug.ts
  index.android.ts  (platform)
  shared.ts         (platform-invariant)     ← these have no .ios/.android/shared,
  vibration.test.ts (co-located, ADR 0025)     so a folder would be noise
```

**The import contract is unchanged** — a folder is invisible to importers:

```
from '.../vibration'          → resolves to the folder (Metro picks index.ios on iOS,
                                 index.android on Android, index.ts headless)
from '.../vibration/index.ios' (was '.../vibration.ios')      ← only EXPLICIT platform imports change form
from '.../vibration/shared'    (was '.../vibration-shared')
```

Inside a folder, a sibling is `./shared` / `./index.ios`; a package-root module one
level up is `../debug` / `../node`. Real folder-form groups in `core/engine/src/`:
`vibration/`, `alert/`, `share/`, `linking/`, `accessibility-info/`, `status-bar/`,
`platform/`, `app-state/`, `dimensions/`. Platform selection is by **filename**, never
a `Platform.OS` read (ADR 0020).

### Migrating flat → folder leaves STALE build artifacts (prune them, or `pnpm build` fails)

`tsc --build` is incremental and **never deletes** outputs whose source moved. When you
migrate `src/X.ts` → `src/X/index.ts`, the old `build/X.js` (+`.d.ts`/`.map`) is orphaned —
it lingers indefinitely because nothing regenerates that path. Two ways it bites, both
non-obvious because the error never points at the real cause:

- **`fix-esm-extensions.mjs` reported `UNRESOLVED … -> ./Something.css`** (2026-07, css-parser).
  The script used to regex-scan EVERY `build/**/*.js` **including comments and string literals**,
  so a stale flat file whose doc-comment held `import styles from './Card.module.css'` was flagged
  as an unresolved import and exited 1 — the `.css` a red herring, the "import" a comment. FIXED
  2026-07: it now walks the source with a string/comment/regex-aware scanner and only rewrites real
  specifiers (see `scripts/fix-esm-extensions.test.mjs`). So a stale file no longer false-positives
  on comments/strings — but it can still error on a REAL dead import, and it is pure garbage either
  way. Prune it.
- Diagnostic: a top-level `build/X.js` that ALSO has `build/X/index.js` beside it, with an
  OLD mtime, and NO `src/X.ts` (only `src/X/index.ts`) → it's stale.

Fix: prune the stale flat outputs (`rm build/X.js build/X.d.ts build/X.js.map build/X.d.ts.map`)
or nuke+rebuild the package's `build/`. `build/` is gitignored and regenerated, so this is safe.
Do this as PART OF any flat→folder migration — don't leave it for `pnpm build` to trip over later.

## 3. Adapter `src/` buckets

Two kinds of bucket: framework-AGNOSTIC ones carry the **same** name in every
adapter; the lifecycle bucket is **framework-idiomatic**
(`<adapter_src_follows_framework_idioms>`).

```
                 React (adapters/react/src/)     Vue (adapters/vue/src/)
agnostic buckets components/                      components/        (visual primitives — folder-per-component)
   (same name)   modules/                         modules/          (imperative RN namespaces: Alert, Share…)
                 utils/                            utils/            (small agnostic helpers)
lifecycle bucket hooks/        ← React term        composables/      ← Vue term   (a Vue hooks/ is WRONG)
flat at root     index.ts                          index.ts          ← public barrel, the ONLY external surface
   (reconciler   host-config.ts                    renderer.ts       ← the framework seam
    wiring,      host-instance.ts                  host-instance/    ← findNodeHandle (Vue folds it into a folder)
    NEVER in a   descriptor-to-react/              descriptor-to-vue.ts  ← the Descriptor → element bridge
    bucket)      components.ts                      components.ts      ← re-export barrel
                 render.ts / reconciler-constants.ts render.ts          ← mount / unmount
                 *.d.ts                              globals.d.ts
```

A new component is a **folder under `components/`** in ADR 0026 form
(`components/switch/{index.ts, index.ios.ts, index.android.ts, shared.ts}`). A new
`use*` hook goes in `hooks/` (React) / `composables/` (Vue). A new imperative
RN-namespace (no view) goes in `modules/`.

## 4. The prop-type split — where a public prop type lives

Decided by a single test: **does any field carry a framework element/ref?**

```
ALL fields agnostic                          ANY field is a framework element/ref
(scalars, IStyleProp, ISymbioteEvent,        (children: ReactNode vs Vue slots, a host
 IAccessibilityProps/IAriaProps)              ref, renderItem: (info) => ReactNode/VNode)
        │                                              │
   ONE definition in @symbiote-native/components       each adapter DECLARES ITS OWN, sharing only
   next to its render fn; every adapter         the agnostic FIELD BASE from the shared layer
   RE-EXPORTS it verbatim:                      and adding its children/ref/render fields
   export type { ISwitchProps }                 (React's and Vue's IPressableProps are
     from '@symbiote-native/components'                 SEPARATE declarations by design)
   ── a 2nd definition in an adapter             ── still per-adapter: IViewProps, ITextProps,
      is a DUPLICATION BUG                          the ITouchable*Props family, ISectionListProps
```

Already shared: `ISwitchProps`, `IActivityIndicatorProps`, `IButtonProps`,
`IResponderProps`. An adapter NEVER imports another adapter's types
(`<third_party_rn_packages_are_react_only>` — the React-dispatcher reason). Promoting
a per-adapter type to fully shared requires making the base generic over the element
type — a deliberate decision with its own ADR, never a silent move.

## 5. Diagnostic logging placement

New code with non-trivial runtime behavior leaves a `dlog` at its seam — gated,
zero-cost when off, never deleted (`<keep_logs_gate_behind_DEBUG>`). Always
`dlog`/`isDebug` from `@symbiote-native/engine`, never a bare `console.log`. Mechanism:
the `symbiote-engine-core` skill §7.

## 6. Decision records to cite

`.docs/decisions/` — the placement-relevant ones: **0020** (Metro filename
platform-selection — why `.ios.ts`/`.android.ts`, no `Platform.OS`), **0026**
(folder-as-module), **0025** (co-located tests — `X/X.test.ts`), **0013**
(packaging — RN as explicit top-level peer). The CLAUDE.md invariants
`<adapter_src_follows_framework_idioms>` and `<prop_types_split_agnostic_vs_per_adapter>`
are the prose form of §3 and §4.

## Reference

- ADR 0026 (real text): `.docs/decisions/0026-module-group-folder-layout.md`.
- Folder-as-module example: `core/engine/src/vibration/`. Flat counter-example:
  `core/engine/src/node.ts`.
- Adapter buckets: `adapters/react/src/` vs `adapters/vue/src/`.
- Shared prop type + re-export: `core/components/src/view/render-switch.ts`
  (`ISwitchProps`) re-exported at `adapters/react/src/components/switch/shared.ts`.
- Adding a component into this layout: the `symbiote-add-component` skill.
- Building a whole adapter's `src/`: the `symbiote-new-adapter` skill.
</content>
