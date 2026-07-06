---
name: symbiote-engine-core
description: "Symbiote engine core — how to drive @symbiote-native/engine correctly, read BEFORE writing or debugging any core/engine/** code OR any adapter renderer seam (host-config / createRenderer / Renderer2) that calls the engine. The engine is a retained MUTABLE shadow-tree that the engine alone translates into Fabric's persistent CLONE-ON-WRITE child sets; every adapter drives the same tiny mutation API and NONE re-implements persistence. Covers (1) the MUTATION API in core/engine/src/node.ts — createElement / createRawText / createAnchor / appendChild / insertBefore / removeChild / setProp / setEventListener / setText, and the ONE entry point flat-bag adapters use, routeProp (it decides onX→event-vs-prop via the ViewConfig, strips React __self/__source, attaches responder events) — do NOT pre-split events yourself. (2) NODE IDENTITY — the engine keeps mirror = WeakMap<ISymbioteNode, …> in commit.ts; every imperative API does mirror.get(node) and bails if absent, so a node must be held by IDENTITY, never wrapped (Vue reactive Proxy is the classic break — see vue-adapter-reactivity). (3) THE COMMIT — SymbioteSurface.commit() (sync, React resetAfterCommit) vs requestCommit() (microtask-coalesced, reactive frameworks) → commitChildren → reconcile → completeRoot; clone-bubble (a leaf change re-clones ancestors); anchors are skipped. (4) THE IMPERATIVE/NATIVE BRIDGE in commit.ts — dispatchViewCommand / measure / measureInWindow / measureLayout / getNativeTag / getNativeNode / setNativeProps / sendAccessibilityEvent, all mirror-gated, all SILENT no-ops before commit, DEBUG=1 logs 'node not committed'. (5) whenCommitted(node, action) + the post-commit.ts seam — the fix for any native call wired before the tag exists under async commit. (6) dlog / isDebug gating. Trigger on engine work, on writing/porting a renderer seam, on any imperative native call, or on a 'command silently does nothing' / 'works on React, dead on Vue' symptom."
---

# Symbiote engine core — driving `@symbiote-native/engine`

The engine is the shared half every adapter sits on. It does exactly two things:
it holds a **retained, mutable shadow-tree** of `ISymbioteNode`s that adapters
mutate cheaply, and it translates that tree into Fabric's **persistent,
clone-on-write** child sets at commit. The mutable-tree → persistent-mirror
trick is the R2 core (`.docs/decisions/0010`) and it lives ONCE here, so no
adapter re-implements persistence (`<clone_on_write_lives_in_engine>`).

If you are writing a renderer seam (React host config, Vue `createRenderer`,
Angular `Renderer2`), your whole job is to map your framework's node ops onto the
API in §2 and pick a commit strategy in §4. Everything below the mutation API —
clone-on-write, Fabric tags, ViewConfig event inference, responder negotiation,
platform routing — is the engine's, not yours.

## 1. The one fact: mutable tree in, persistent tree out

```
adapter (React / Vue / Angular)
   │  createElement / appendChild / routeProp / removeChild …   ← cheap, synchronous, mutable
   ▼
ISymbioteNode tree   (core/engine/src/node.ts)                   ← the retained shadow-tree YOU mutate
   │  surface.commit() | requestCommit()                        ← §4
   ▼
reconcile + mirror WeakMap   (core/engine/src/commit.ts)        ← clone-on-write, ENGINE-owned
   │  createChildSet / cloneNodeWithNewProps / completeRoot
   ▼
nativeFabricUIManager  →  Fabric C++ / Yoga / RCTFabricSurface  ← never forked
```

You mutate the node tree directly (it's a plain mutable object graph). The engine
diffs it against what Fabric currently holds and clones only what changed.

## 2. The mutation API — `core/engine/src/node.ts`

The entire surface an adapter drives. Read `node.ts` first (it's ~215 lines and
self-contained); it is the canonical entry point to the whole engine.

```
createElement(component: string, isText = false): ISymbioteNode   // component IS the Fabric view name (RCTView, RCTImageView…)
createRawText(text: string): ISymbioteNode                        // RCTRawText with { text } pre-set
createAnchor(): ISymbioteNode                                     // '#anchor' — retained for sibling order, SKIPPED at commit

appendChild(parent, child)                                        // detaches child from old parent first
insertBefore(parent, child, beforeChild)
removeChild(parent, child)

routeProp(node, key, value)     // ← THE flat-bag entry point (React/Vue/Solid). See below.
setEventListener(node, name, value)   // explicit event channel (Angular listen / Svelte addEventListener call directly)
setProp(node, key, value)             // pure prop set, no event inference (undefined deletes)
setText(node, text)
```

**`routeProp` is the one call a flat-bag adapter routes every prop through — do
NOT pre-split events yourself.** It decides, per the shared ViewConfig:

- an `onX` prop becomes an **event listener** ONLY if the node's `component`
  actually declares `x` as an event (`isEventFor`). So `onTintColor` on a Switch
  (whose only event is `change`) is a plain prop and reaches Fabric — naming
  never decides.
- it attaches the PanResponder responder events (`startShouldSetResponder`…),
  which are a JS protocol, not ViewConfig events.
- it strips React's JSX dev metadata (`__self` / `__source`) — a JSX-based adapter
  that forwards these paints the surface black on Android (`folly::dynamic`
  rejects the function-bearing `__self`). The engine drops them once, here.

A **structural** adapter (Angular `Renderer2.listen`, Svelte `addEventListener`)
already knows the event name, so it calls `setEventListener(node, 'press', cb)`
directly and routes only `[prop]` bindings through `routeProp`.

## 3. Node identity — the rule that bites every adapter

`ISymbioteNode` (`node.ts`) is a branded plain object: `{ component, isText,
props, listeners, children, parent }`. The engine tracks each node by **object
identity** in a `mirror = new WeakMap<ISymbioteNode, …>()` (`commit.ts`) mapping
the retained node → its committed Fabric handle/tag. **Every** imperative API
(§5) resolves through `mirror.get(node)`.

**Hold engine nodes by identity. Never wrap one in a structure that proxies it.**
The classic break is Vue's `ref(node)` deep-wrapping the node in a reactive
Proxy — a different object than the WeakMap key, so `mirror.get` misses and every
imperative command silently no-ops. The Vue-specific manifestation and fix
(`shallowRef` / `markRaw`) is its own skill: **`vue-adapter-reactivity`** (Gotcha
1). The engine-side contract is just: same object in, or the mirror misses.

## 4. The commit — sync vs async is the adapter's choice

A `SymbioteSurface` (`core/engine/src/surface.ts`) is one mounted root. It holds
the top-level nodes and offers two commit strategies. **This is the single
biggest decision a renderer seam makes:**

```
surface.commit()         SYNCHRONOUS   commitChildren now.
                         React's react-reconciler calls this in resetAfterCommit
                         (it already batches per logical update). Tag exists the
                         moment a React effect runs.

surface.requestCommit()  COALESCED     queueMicrotask(() => commit()), de-duped.
                         Reactive frameworks (Vue, Svelte, zoneless Angular) emit
                         many mutations per tick; this collapses them to ONE
                         completeRoot at the microtask boundary. The Fabric tag is
                         assigned INSIDE that microtask — AFTER onMounted /
                         watch(flush:'post') has already run. ← root of §6/§7.
```

`commitChildren(rootTag, children)` (`commit.ts`) walks the tree via `reconcile`,
clones only changed nodes (each carries its last-committed props/childIds/tag in
the mirror), builds one childSet, and calls `completeRoot` — Fabric assigns fresh
tags atomically. **Clone-bubble:** if a leaf's props change, every ancestor
re-clones (a persistent parent holds specific child handles). This is intentional
and identical to React's own Fabric renderer; it means high-frequency updates to
deeply nested leaves are not free. Anchors (`createAnchor`) are filtered out of
the walk — they never reach Fabric.

## 5. The imperative / native bridge — `core/engine/src/commit.ts`

The backdoor for focus/blur, measurement, Animated, gestures. Every one is
**mirror-gated**: it does `mirror.get(node)` and, if the node hasn't committed,
**silently returns** — no throw.

```
dispatchViewCommand(node, name, args)    // e.g. TextInput focus, Switch setValue
measure(node, cb) / measureInWindow / measureLayout(node, relativeTo, ok, fail)
getNativeTag(node): number | undefined   // undefined ⇒ not committed yet
getNativeNode(node)
setNativeProps(node, partial)            // imperative prop write, bypasses the tree
sendAccessibilityEvent(node, type)
```

`DEBUG=1` surfaces the skip: `dispatchViewCommand "X" skipped: node not
committed` (and the `measure` / `setNativeProps` equivalents). That log means the
node has no tag at call time — either you're holding a Proxy (§3) or you called
too early (§6), not that the bridge is broken.

## 6. `whenCommitted` — calling native before the tag exists

Under `requestCommit()` (§4), lifecycle code runs **before** the commit that
assigns the tag. A native call that reads the tag at mount and bails on
`undefined` with no retry is **dead on device** while the JS-path headless smoke
(which never needs a tag) stays green — the nastiest failure shape in the repo.

The fix is the engine primitive built on the post-commit seam
(`core/engine/src/post-commit.ts` — `registerPostCommit` / `runPostCommitHooks`,
fired after every `completeRoot` that assigned tags):

```ts
import { whenCommitted } from '@symbiote-native/engine'
// instead of:  dispatchViewCommand(node, 'focus', [])     // no-ops if tag not ready
const cancel = whenCommitted(node, () => dispatchViewCommand(node, 'focus', []))
// run the action now if the node already has a tag, else after the commit that assigns it
onBeforeUnmount(() => cancel())   // drop the pending retry if we never commit
```

**Rule:** any native/imperative call wired at lifecycle time (`onMounted`,
`afterNextRender`, a node-ref-driven or `immediate` watch) on an async-committing
adapter MUST go through `whenCommitted`. A value-driven watch that only fires on a
LATER user change is safe (the node is committed by then). React skips this whole
class — it commits synchronously. Full diagnosis tree + the Vue/Angular specifics:
**`vue-adapter-reactivity`** (Gotcha 2) and **`angular-adapter`** §5.

## 7. Diagnostic logging — `dlog` / `isDebug` (`core/engine/src/debug.ts`)

All engine logging goes through `dlog`, never a bare `console.log`. Off by
default (one property read), on via `DEBUG=1` (Node / inlined into the canary
bundle) or `globalThis.__SYMBIOTE_DEBUG__ = true` (runtime). Output is prefixed
`[symbiote] `.

```ts
import { dlog, isDebug } from '@symbiote-native/engine'
dlog(`commit root=${rootTag} pre-completeRoot`)   // gated, zero-cost when off
```

New code with non-trivial runtime behavior (a commit path, an event, a native
bring-up) should leave a `dlog` at its seam. Logs are an asset — only add, never
delete (`<keep_logs_gate_behind_DEBUG>`).

## 8. Gotchas for anyone driving the engine

1. **Route props through `routeProp`, not your own `onX` check** — the ViewConfig,
   not the key name, decides event-vs-prop (`onTintColor` is a prop). Re-splitting
   in the adapter both duplicates engine logic and gets the edge cases wrong.
2. **Hold nodes by identity** (§3). A reactive wrapper breaks every imperative
   command while the render path looks fine.
3. **Pick your commit strategy deliberately** (§4). Sync (`commit`) if your
   framework already batches (React); coalesced (`requestCommit`) if it emits many
   mutations per tick (Vue/Svelte/Angular).
4. **Async commit ⇒ `whenCommitted` for native calls** (§6). The headless smoke
   will NOT catch a missing tag — only a device/simulator does.
5. **Clone-bubble is real** (§4): a deep leaf update re-clones its ancestors.
6. **Anchors are tree-only** — no Fabric tag, no measure, no native effect.
7. **`getNativeTag` is your probe** — `undefined` when you expected a tag is always
   either §3 (Proxy) or §6 (too early). Log it first; don't theorize.
8. **Every commit — not just `setNativeProps` — sends `cloneNodeWithNewProps` a
   MINIMAL diff**, never the full flat prop set (`diffProps` in `commit.ts`); real
   Fabric merges that diff onto the native view's already-retained props, and a
   removed key arrives as literal `null` (reset to default), not absence. The
   shared test double (`core/test-utils/src/fake-fabric.ts`) mirrors this: its
   `cloneNodeWithNewProps`/`cloneNodeWithNewChildrenAndProps` MERGE the diff onto
   the previous fake node's props (keeping an explicit `null`, never deleting the
   key). If you assert a node's `.props` after a SECOND commit (an update, a
   targeted `setNativeProps`, a directive), read via `fabric.committed` (the
   latest clone), never `fabric.find`/`fabric.created` (only the original
   `createNode`'d object — it never reflects a later clone at all). Forgetting the
   merge fix here once silently dropped every unrelated prop on a second commit;
   caught only because a test asserted a sibling prop survived one.

## Reference

- Mutation API + node shape: `core/engine/src/node.ts` (read this first).
- Clone-on-write commit, the `mirror` WeakMap, `commitChildren`, the imperative
  bridge, and `whenCommitted`: `core/engine/src/commit.ts`.
- Surface + commit strategies (`commit` / `requestCommit`): `core/engine/src/surface.ts`.
- Post-commit retry seam: `core/engine/src/post-commit.ts`.
- ViewConfig event inference (`isEventFor`): `core/engine/src/view-config.ts`.
- Diagnostic logging: `core/engine/src/debug.ts`.
- Public barrel (what `@symbiote-native/engine` exports): `core/engine/src/index.ts`.
- Reactive-adapter manifestations of §3/§6: the `vue-adapter-reactivity` and
  `angular-adapter` skills. Building a NEW adapter on this API: `symbiote-new-adapter`.
- Decisions: `.docs/decisions/0010` (incremental clone-on-write), `0002`
  (adapter seam + shared retained tree).
</content>
</invoke>
