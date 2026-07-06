---
name: react-adapter-portal
description: "Symbiote React adapter — createPortal (create-portal.ts, host-config.ts's Container type) AND createTunnel (create-tunnel.tsx). Read BEFORE touching host-config.ts's Container/reconciler generics, adding createPortal, or reaching for cross-surface content sharing. Covers why real RN's Fabric can't support createPortal (persistent mode) while @symbiote-native/react (mutation mode) can; createPortal is an instance method on the built reconciler, not a package export; the Container-type widening; isSymbioteNode as the guard; why same-surface-only is createPortal's PERMANENT scope (researched: facebook/react#17147, pmndrs/tunnel-rat) — cross-surface uses createTunnel instead. createTunnel's In/Out are COMPONENTS (Context.Provider/Consumer shape), not hooks — an earlier hook-based version caused a real infinite-render-loop white screen when In/Out shared a component; separate components structurally prevent it (Out's forced re-render never bounces into In), which useMemo/deps-array approaches only patch around."
---

# Symbiote React adapter — `createPortal`

React's `createPortal` is a genuine Fiber-level primitive (`HostPortal` work
tag) baked into `react-reconciler` itself, not a `react-dom`-specific add-on —
any custom renderer built on `react-reconciler` gets the SAME mechanism for
free, provided its host config implements the right container operations.

## Stock React Native does NOT support this — confirmed, not assumed

Checked three independent sources before building on this:

1. **The `react-native` npm package never exports `createPortal`** — `index.js`
   has no such export. Every "React Native portal" library
   (`gorhom/react-native-portal`, `zenyr/react-native-portal`) is a Context-based
   fake (render elsewhere in the SAME tree via a provider), not a real
   reconciler portal — because there is no real one to use.
2. **Real RN's Fabric host config runs PERSISTENT mode only** —
   `.vendors/react/packages/react-native-renderer/src/ReactFiberConfigFabric.js`
   declares `supportsPersistence = true` and never sets `supportsMutation`. It
   implements the PERSISTENT container API (`createContainerChildSet`,
   `appendChildToContainerChildSet`, `finalizeContainerChildren`,
   `replaceContainerChildren` — building ONE root's own committed child set) but
   NEVER the MUTATION-mode container ops (`appendChildToContainer`,
   `insertInContainerBefore`, `removeChildFromContainer`) that `createPortal`'s
   plumbing calls on an arbitrary containerInfo. Without them, a portal's
   mutations have nowhere to go.
3. **A live, acknowledged community gap** —
   [react-native-community/discussions-and-proposals#402](https://github.com/react-native-community/discussions-and-proposals/issues/402)
   ("React Native Portals") and
   [facebook/react-native#36273](https://github.com/facebook/react-native/issues/36273)
   ("React Portal children gets overriden in Fabric") document portal content
   mounting momentarily then getting stomped by the next HostRoot commit — the
   exact Fabric-persistent-mode failure mode predicted from (2).

`@symbiote-native/react`'s host config (`adapters/react/src/host-config.ts`) is
deliberately **MUTATION mode** (`supportsMutation: true, supportsPersistence:
false`) — the opposite choice from real RN — and it already implements ALL
THREE mutation-mode container ops for its own root. That is what makes a real
portal structurally possible here in a way it never was in stock RN.

## `react-reconciler`'s `createPortal` is an instance method, not a package export

Verified empirically (a static grep of the bundle is misleading — the
assignment happens inside the `createReconciler(options)` factory's own
closure, so it looks like a top-level `exports.createPortal` in the source but
is NOT reachable as `import { createPortal } from 'react-reconciler'`):

```js
const createReconciler = require('react-reconciler');
typeof createReconciler.createPortal;      // 'undefined'
const reconciler = createReconciler({ ...host config... });
typeof reconciler.createPortal;            // 'function'  <- HERE
```

So `adapters/react/src/create-portal.ts` imports the adapter's OWN default
export from `./host-config` (the built reconciler instance) and calls
`reconciler.createPortal(children, container, null, key ?? null)` on it — never
a bare package import.

`@types/react-reconciler`'s `ReactPortal` interface (`containerInfo`/
`implementation` fields) is a DIFFERENT shape than `react`'s own `ReactPortal`
type (`type`/`props`, a `ReactElement`) — same runtime object, two incompatible
`.d.ts`s. Fixed with a `@ts-expect-error` (matching this file's existing
precedent for the `HostTransitionContext` cross-library mismatch in the same
`host-config.ts`), never an `as` cast.

## The Container-type widening

`host-config.ts`'s reconciler `Container` generic slot used to be bare
`SymbioteSurface` (only ever the primary root). Widened to a union:

```ts
type IContainer = SymbioteSurface | ISymbioteNode;

function isSurfaceContainer(container: IContainer): container is SymbioteSurface {
  return container instanceof SymbioteSurface;
}
```

— mirroring the Vue renderer's pre-existing `IHostElement = ISymbioteNode |
SymbioteSurface` union and its own `isSurface()` guard
(`adapters/vue/src/renderer.ts`). Every container op branches on it:

```ts
appendChildToContainer: (container, child) => {
  if (isSurfaceContainer(container)) container.appendChild(child);
  else appendChild(container, child); // the generic engine node-append fn
},
// insertInContainerBefore / removeChildFromContainer: same shape
resetAfterCommit: container => {
  if (isSurfaceContainer(container)) container.commit();
},
clearContainer: container => {
  if (isSurfaceContainer(container)) container.clear();
},
```

`resetAfterCommit`/`clearContainer` guard rather than branch-with-an-else,
because they are ONLY ever called by the reconciler with the PRIMARY root's own
container — never with a portal's target — see the scope note below for why
that matters.

## Scope — same-surface targets only, PERMANENTLY (not a v1 stopgap)

The portal target must be an **already-mounted `ISymbioteNode` within the SAME
surface** as the call site (e.g. a ref to a persistent "overlay host" `View`
near the app root) — **not** a second, independently-`mount()`-ed
`SymbioteSurface`.

Reason: `resetAfterCommit(container)` fires exactly ONCE per commit, and ONLY
with the container originally passed to `createContainer` (the primary root) —
never with a portal's own target container. If the target were a DIFFERENT
surface, mutating its tree would never trigger THAT surface's own
`.commit()`/`.requestCommit()` — a silent no-paint bug, not a crash (this is
structurally the SAME class of bug as facebook/react-native#36273, just from
the opposite direction: there it was PERSISTENT-mode HostRoot overriding the
portal; here it would be an uncommitted second surface never repainting at
all).

Same-surface targets need **zero extra plumbing** to work correctly: the single
`resetAfterCommit(primarySurface)` call walks `primarySurface.children`
**recursively**, so wherever the portal's mutation moved nodes to (as long as
it's still somewhere under the primary surface's own tree) gets picked up and
committed in that same pass.

**Cross-surface is NOT a followup to build here — it's a permanently different
mechanism: `createTunnel` (`create-tunnel.tsx`).** Before reaching for an
engine-level fix (e.g. tracking a target's owning rootTag via the commit
mirror and scheduling a foreign recommit), read the researched rationale
below — the ecosystem already tried and rejected that path.

### Why cross-surface was designed OUT, not just deferred

Real prior art was checked before deciding this, not assumed:

- **React DOM's `createPortal`** never faces this problem at all — a DOM
  mutation (`container.appendChild`) IS the paint, there is no per-root
  "commit" step to trigger. Not a transferable precedent (Fabric is
  persistent/clone-on-write; DOM isn't).
- **react-three-fiber** (the closest real analog — also a custom
  `react-reconciler` host) hit exactly this class of bug:
  [facebook/react#17147](https://github.com/facebook/react/issues/17147)
  ("react-reconciler & portals: missing root instance") — a portal's
  container reaching the host config in place of the "home" root's own
  container, losing access to per-root state.
- **The ecosystem's actual fix for genuinely separate renderers/roots is NOT
  a portal at all**: [pmndrs/tunnel-rat](https://github.com/pmndrs/tunnel-rat)
  exists specifically because DOM's renderer and r3f's Canvas renderer are
  separate reconcilers that can't `createPortal` into each other. Its own
  README states it plainly: "each renderer is traditionally separated." The
  mechanism: `<Out/>` renders as an ORDINARY component inside its OWN
  root/tree, subscribed to a shared store; `<In/>` elsewhere just WRITES to
  that store. The foreign root commits ITSELF, through its own completely
  normal path — no reaching into someone else's commit machinery, no
  "not-committed-yet" race, no new engine surface area at all.

`createTunnel` is SymbioteNative's twin of that pattern — see its own file header
for the full design and `create-tunnel.test.tsx` for the cross-surface proof
(two real `mount()` calls, content registered on one painting on the other).

## Modal is NOT a portal candidate

It's tempting to think `createPortal`/`Teleport` are now the mechanism for
rewriting `Modal` "onto a real platform alternative" — they aren't, and Modal
doesn't need it. Modal is already a real native primitive: `symbiote-modal`
resolves to `ModalHostView` (iOS) / `RCTModalHostView` (Android), hand-registered
builtins (`core/components/src/component-names/index.{ios,android}.ts`,
`BUILTIN_COMPONENTS` in `core/engine/src/registry.ts`) — the SAME native
component real RN's own `Modal.js` renders. Its content commits as an ORDINARY
Fabric child, exactly like any other node; the reparent onto a second native
surface (a `UIWindow`/`UIViewController` on iOS, a `Dialog` on Android) happens
entirely on the **native** side, AFTER the Fabric commit, invisible to JS. A JS
portal has no role there — there is no JS-tree move to make. (Full component
already ships at parity across React/Vue/Angular via the shared
`renderModal`/`modalReducer` in `@symbiote-native/components` — see
`symbiote-add-component`.)

## The safety guard — `isSymbioteNode`, reused not reinvented

```ts
export function createPortal(
  children: ReactNode,
  container: IPortalContainer, // ISymbioteNode | SymbioteSurface
  key?: string | null,
): ReactPortal {
  if (!(container instanceof SymbioteSurface) && !isSymbioteNode(container)) {
    throw new Error(
      'createPortal target must be an already-mounted host node — got something else. ' +
        "Did you forget `.current`/`.value`, or pass a CSS-selector-style string?",
    );
  }
  // @ts-expect-error see the ReactPortal type-mismatch note above
  return reconciler.createPortal(children, container, null, key ?? null);
}
```

`isSymbioteNode` (`core/engine/src/node.ts`, exported from `@symbiote-native/engine`)
is the engine's own branded-object check — a private `unique symbol` set by
`createElement`/`createRawText`/`createAnchor`. It's the SAME guard the Vue
`Teleport` twin uses (`vue-adapter-directives` skill) for an identical reason:
catch a plain object, a string, `undefined`, or a forgotten `.current`/`.value`
BEFORE it reaches `appendChild`/`insertBefore` deep in the engine, where a wrong
value would produce an unclear low-level failure instead of an actionable one.

## Testing the ref-timing gotcha

A React ref's `.current` is `null` for the ENTIRE first render (refs attach
during commit, after render returns) — a component that reads
`overlayRef.current` during its OWN render to decide whether to call
`createPortal` sees `null` on that first pass no matter what. The fix is NOT
`useRef` + a manual second `mount()` call (each `mount()` fully tears down and
rebuilds a surface from scratch, so that doesn't simulate a re-render) — it's
`useState` + a callback ref:

```tsx
const [overlay, setOverlay] = useState<IHostInstance | null>(null);
// ...
<View ref={setOverlay} />
```

`setOverlay(node)` fires during commit and schedules a state update; verified
empirically that ONE synchronous `mount()` call (`updateContainerSync` +
`flushSyncWork()`, `LegacyRoot`) is enough to pick it up too — this legacy-mode
reconciler drains its ENTIRE sync work queue in one flush, including updates
scheduled from within its own commit phase, not just the update that triggered
the call.

See `adapters/react/src/create-portal.test.tsx` for the full test (parentage
assertion via `fabric.committed`, plus guard-rejection tests built with
`JSON.parse('{}')`/`JSON.parse('"body"')` to get untyped values without an `as`
cast — this repo bans `as` in application code, tests included).

## Live example — `examples/react/App.tsx`

A "Show toast (createPortal)" button near the Modal-open button. The overlay
host is a persistent, empty `<View pointerEvents="box-none">` rendered as a
SIBLING of the root `ScrollView` (both inside `SafeAreaView`) — the callback
ref (`ref={setOverlayHost}`, `useState`, not `useRef`; see the ref-timing
gotcha above) resolves on the FIRST commit. The toast card itself is authored
deep inside the scroll content but portals out to sit above it, still
repainting on the ONE commit the surface already does.

## Common failure modes

| Failure | Cause | Fix |
|---|---|---|
| `container.commit is not a function` / similar at a portal call site | Passed a bare object that isn't `instanceof SymbioteSurface` where surface-only code still runs | Confirm the container op actually branches via `isSurfaceContainer`, not a direct `.commit()`/`.clear()` call |
| Portal content never appears, no error, no crash | Target node lives in a DIFFERENT, separately-mounted `SymbioteSurface` | Permanently out of scope for `createPortal` — use `createTunnel` instead |
| Portal content appears then vanishes on the next render | Read `ref.current` synchronously assuming it's populated on the FIRST render | Use `useState` + a callback ref, not `useRef`, to get the re-render that resolves the target |
| `reconciler.createPortal is not a function` | Tried `import { createPortal } from 'react-reconciler'` directly | It's an instance method — call it on the BUILT reconciler (`host-config.ts`'s default export), not the package |
| TS error assigning `reconciler.createPortal(...)`'s result | `@types/react-reconciler`'s `ReactPortal` and `react`'s `ReactPortal` are different interfaces for the same object | `@ts-expect-error` with the explanatory comment, not an `as` cast |

## `createTunnel` — the cross-surface answer (`create-tunnel.tsx`)

For a target that genuinely lives in a different, independently-`mount()`-ed
surface (a real multi-surface embedding — split-screen, a separate always-
on-top system overlay surface): don't extend `createPortal`. Use
`createTunnel()` (`adapters/react/src/create-tunnel.tsx`) — a shared store,
NOT a Fabric-node reference. `In`/`Out` are COMPONENTS (the `Context.Provider`/
`Context.Consumer` shape, and the Vue twin's shape), not hooks:

```tsx
export const overlayTunnel = createTunnel(); // module-level singleton, importable from BOTH surfaces

// Inside the surface that should PAINT the content:
function OverlayHost() {
  return (
    <View style={styles.overlayHost}>
      <overlayTunnel.Out />
    </View>
  );
}
// Inside ANY other component, in ANY surface:
function Toast() {
  return toastVisible ? (
    <overlayTunnel.In>
      <ToastCard />
    </overlayTunnel.In>
  ) : null;
}
```

`Out` reads via `useSyncExternalStore` from WHICHEVER surface renders it —
that surface's OWN render/commit paints it, normally, no cross-surface
reach-in. `In` never touches a Fabric node, so there's no `isSymbioteNode`
guard, no ref-timing gotcha, no rootTag lookup — it works identically
whether `In` and `Out` share a surface or not. See `create-tunnel.test.tsx`
for the two-`mount()` proof.

### Why `In`/`Out` are components, not hooks — a real bug, not a style choice

Confirmed, not hypothetical: an EARLIER version exposed this as
`useTunnelIn(children)`/`useTunnelOut()` hooks, called directly inside one
component (`App`) in `examples/react/App.tsx`. That produced a **silent
white screen on device**, no thrown error, no `console.error`, from the very
first commit (not just after tapping the demo button). Root cause, traced
end to end:

1. `useTunnelIn`'s sync effect wrote `children` into the shared Map and
   called `notify()` on every render, with nothing to compare against.
2. `useTunnelOut()`, called from the SAME component (`App`), subscribes via
   `useSyncExternalStore` — `notify()` forces a re-render of THAT component.
3. `App` re-renders → `useTunnelIn` runs again → `notify()` fires again →
   step 2 repeats. Forever. This custom renderer's synchronous commit loop
   (`updateContainerSync` + `flushSyncWork()`, no React concurrent
   scheduler) has no "Maximum update depth exceeded" guard to catch it and
   throw — it just hangs the JS thread.

Two tempting hook-level non-fixes were considered and rejected:
- **`useMemo`-stabilize the JSX before passing it in** — does NOT reliably
  fix it: React documents `useMemo`'s cache as a discardable performance
  optimization, not a correctness guarantee, so relying on its reference
  staying stable across renders is fragile.
- **An explicit `useTunnelIn(children, deps)` dependency list** (the
  `useEffect`/`useMemo` contract) — works, but only patches the symptom: it
  still lets a caller reintroduce the exact same class of bug by forgetting
  `deps`, or by listing an incomplete dependency set.

**The actual fix is structural, not a comparison to get right**: make `In`
and `Out` SEPARATE COMPONENTS. `useSyncExternalStore`'s only lever is
"force-rerender the component that subscribed" — as long as that's `Out`
alone, the forced update has nowhere to bounce back to, even when `In` and
`Out` are direct siblings under the SAME parent (confirmed by
`create-tunnel.test.tsx`'s "does NOT loop" test, which renders both as
children of one component and drives a toggle through a real native event —
`onLayout`/`topLayout`, the same dispatch path `modal.test.tsx`/
`switch.test.ts` use — asserting the render count stays bounded). This is
also why the Vue twin never had this bug at all: Vue's `In`/`Out` were
ALREADY separate components with independent reactive scopes from the
start — the same structural property, arrived at for a different reason
(a composable can't accept template markup).

**Vue's `createTunnel` twin needs none of this** — not a smaller version of
the same fix, structurally immune. `In` and `Out` are separate Vue
components, each with its OWN reactive scope; writing to the shared
`reactive` Map from `In` only re-triggers whichever component actually READS
that Map in ITS OWN render (`Out`) — never `In` itself, even when `In` and
`Out` are both descendants of the same parent. React's version has no
per-hook reactive scope to isolate the update to — `useSyncExternalStore`'s
only lever is "re-render the WHOLE component that called it," which is
exactly `App` here, the same component that also calls `useTunnelIn`. This is
the concrete reason the two adapters' `createTunnel` APIs are shaped
differently, not just a naming/idiom choice.

## See also

- `vue-adapter-directives` — the Vue `Teleport` twin: same `isSymbioteNode`
  guard, same same-surface-only scope, and Vue's own `createTunnel` twin —
  its `In`/`Out` are slot-based components for a DIFFERENT reason (a Vue
  composable can't accept template markup; only a component has a slot),
  but land on the SAME components-not-hooks shape this file's React version
  needed for correctness, not just idiom.
- `angular-adapter` (§15) — the Angular twins, `PortalDirective`/
  `PortalOutletDirective` and `createTunnel`'s `TunnelInDirective`/
  `TunnelOut`. Neither can be a per-call factory like React's/Vue's —
  Angular has no runtime component synthesis (no JIT under Metro/Hermes) —
  so `createTunnel()` there returns only a plain signal-backed store, and
  both are ONE static, pre-authored pair parameterized by an input.
  `PortalDirective`/`TunnelInDirective` are STRUCTURAL directives
  (`*portal="x"`/`*tunnelIn="x"`, the `*ngIf` idiom), not components taking
  a separate `<ng-template>` + `[content]` binding — an earlier version did
  that and read as foreign to normal Angular code. `PortalDirective` also
  replaces the `isSymbioteNode` runtime guard with a compile-time one: its
  target is typed as a directive instance only Angular's own template
  compiler can produce, so `strictTemplates` rejects anything else before
  runtime.
- `symbiote-engine-core` — `isSymbioteNode`, the `mirror` WeakMap, and the
  commit/reconcile model this scope decision rests on.
