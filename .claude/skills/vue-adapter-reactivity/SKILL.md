---
name: vue-adapter-reactivity
description: "Symbiote Vue adapter reactivity + commit-timing gotchas — read BEFORE writing or debugging any Vue adapter code (adapters/vue/**) that holds an engine SymbioteNode or other engine/native object in Vue reactive state (ref/reactive/computed), or wires a host-element ref, or calls an imperative/native engine API (dispatchViewCommand / measure / measureInWindow / setNativeProps / getNativeTag / focus / blur / sendAccessibilityEvent / connectAnimatedNodeToView / addAnimatedEventToView / attachNativeEvent). TWO distinct gotchas. (1) IDENTITY: a snap-back / imperative command that silently does nothing, the engine dlog 'dispatchViewCommand \"X\" skipped: node not committed' (or '… skipped: node not committed' from measure/setNativeProps), a host ref that 'holds the right node but the command misses' — engine nodes must be held by identity (shallowRef / markRaw), never a deep ref, which wraps the object in a reactive Proxy the engine WeakMap mirror misses. (2) ASYNC-COMMIT TIMING: a NATIVE-driven feature that works on React but is FROZEN/DEAD on Vue (static Animated pulse, sticky headers that don't stick) while the JS-path headless smoke is green — because Vue batches commits on a microtask, so getNativeTag() reads undefined inside onMounted / watch(flush:'post'), the native call no-ops with no retry. Fix: retry after the engine post-commit hook (core/engine/src/post-commit.ts). Trigger on EITHER signature, on any task wiring a native call that needs a committed Fabric tag, or when adding a NEW stateful Vue component that grabs the host node."
---

# Symbiote Vue adapter — reactivity + commit-timing gotchas

Two independent traps bite the Vue adapter. **Gotcha 1 (identity)** — you hold the
wrong object. **Gotcha 2 (timing)** — you hold the right object but ask for its
native tag too early. They look similar (a native call silently does nothing) but
have different causes and fixes. Gotcha 1 is below; Gotcha 2 is the section
"Vue commits async — the tag may not exist yet".

## Gotcha 1 — identity

The Vue adapter drives `@symbiote-native/engine`, which is built on **object identity**:
the engine keeps a `mirror = new WeakMap<SymbioteNode, …>()` (in
`core/engine/src/commit.ts`) mapping each **retained** node → its committed Fabric
handle/tag. Every imperative API resolves through it:

```
dispatchViewCommand(node, …)  measure(node, …)  setNativeProps(node, …)
getNativeTag(node)  getNativeNode(node)  sendAccessibilityEvent(node, …)
```

All of them do `mirror.get(node)` and bail if it's `undefined`. So the node you
hand them must be **the exact same object** the engine committed.

## The gotcha: `ref()` deep-wraps the node in a reactive Proxy

Vue's `ref(x)` (and `reactive`, `computed`, deep `watch` state) runs the assigned
value through `toReactive()`. For an **object**, that stores — and hands back — a
**reactive Proxy**, not the raw object:

```ts
const nodeRef = ref<SymbioteNode | null>(null)
nodeRef.value = engineNode      // Vue stores reactive(engineNode) = a Proxy
nodeRef.value                   // reads back the PROXY, a DIFFERENT identity
mirror.get(nodeRef.value)       // undefined → "node not committed" → command no-ops
```

The Proxy forwards property reads, so `isSymbioteNode(proxy)` still passes and the
node looks fine — but it is a different object than the `WeakMap` key, so every
imperative command silently does nothing. The accepting/normal render path is
unaffected (it never touches the mirror), which is why this hides until a
snap-back / measure / setNativeProps path runs.

## The rule

**Hold engine/native objects by identity — `shallowRef` (or `markRaw`), never a
deep `ref`/`reactive`.**

```ts
import { shallowRef } from '@vue/runtime-core'
const nodeRef = shallowRef<SymbioteNode | null>(null)   // .value stays the raw node
```

`shallowRef` does not wrap `.value`, so `nodeRef.value === engineNode` and
`mirror.get` hits. A node held only for imperative use (read in a watch callback /
effect, never reactively tracked) doesn't even need reactivity — `shallowRef` is
the idiomatic minimal choice; `markRaw(node)` before storing in a deep structure
is the alternative. This is the Vue twin of React's `useRef` (which never wraps).

Applies to anything from the engine or native side kept in Vue state: host
`SymbioteNode`s, Fabric handles, Animated nodes, native module instances.

## Symptom → diagnosis

- **Symptom:** an imperative command does nothing; `DEBUG=1` shows
  `dispatchViewCommand "…" skipped: node not committed` (or the measure/
  setNativeProps equivalent) even though the node was clearly committed.
- **Fast confirm:** in the watch/effect, log `getNativeTag(node)`. `undefined`
  while the same logical node has a tag elsewhere ⇒ you're holding a Proxy.
- **Decisive probe (headless):** the engine node reaches a fake Fabric slot's
  `createNode` as its 5th arg (`instanceHandle`) — compare that raw node by `===`
  against what your ref holds. Same logical node, `!==` ⇒ reactive-Proxy identity
  break. Tag nodes with a `WeakMap<object, id>` to track identity across the async
  timeline; assign a unique id at `createElement` and log it at the ref site and at
  the dispatch site (`#1` in vs `#2` out is the signature).
- **Don't chase:** ref timing, function-vs-object refs, or duplicate engine module
  instances first — those mimic the same "not committed" log. Rule them out, but
  the Proxy wrap is the usual cause. (Confirmed root cause for the Switch
  controlled snap-back, 2026-06.)

## Gotcha 2 — Vue commits async — the tag may not exist yet

Even when you hold the node by identity (Gotcha 1 solved), a node's **Fabric tag**
may not exist yet when your Vue lifecycle code runs. The Vue renderer batches
commits: every mutation calls `surface.requestCommit()`, which `queueMicrotask`s a
single `completeRoot` (`adapters/vue/src/renderer.ts`, `core/engine/src/surface.ts`).
The tag is assigned **inside** that commit. So:

```
mount → inserts → requestCommit() schedules completeRoot on a microtask  (tag NOT assigned)
  onMounted / watch(flush:'post') runs HERE  → getNativeTag(node) === undefined
  ⋯ microtask ⋯ completeRoot → tag assigned ⋯ but your code already ran and didn't retry
```

React's `react-reconciler` commits **synchronously** (`resetAfterCommit → surface.commit()`),
so by the time a React effect runs the tag exists. **Vue is the only adapter that
races its own commit.** A native imperative call that reads the tag at lifecycle
time and bails on `undefined` — with no retry — silently no-ops, and the feature is
**dead on device** while the JS-path / headless smoke (which never needs the tag)
stays green.

Engine calls with this shape (read `getNativeTag`, bail if `undefined`, no retry):

```
AnimatedProps.connectToView      → connectAnimatedNodeToView   (native Animated → view)
attachNativeEvent / __attach     → addAnimatedEventToView      (sticky-header scroll)
```

### Symptom → diagnosis (Gotcha 2)

- **Symptom:** a NATIVE-driven feature works on React, frozen/dead on Vue — a
  native `Animated` view renders static (the pulse), sticky headers don't stick —
  and the JS-driven headless smoke is GREEN (it never resolves a tag).
- **Confirm:** `DEBUG=1` and look for the native bind log MISSING on Vue but present
  on React (`native: connect node → view`, `attachNativeEvent: onScroll → view=…`).
  Or log `getNativeTag(node)` in the onMounted / `watch(flush:'post')` — `undefined`
  at lifecycle time, defined a microtask later ⇒ this gotcha.
- **Don't confuse with Gotcha 1:** identity break = the command misses for a
  COMMITTED node (tag exists, you hold a Proxy). Timing = you hold the right node
  but the tag doesn't exist YET.

### The fix — `whenCommitted(node, action)`

The engine fires `runPostCommitHooks()` after every `completeRoot` that assigned
tags (`core/engine/src/post-commit.ts`). The canonical primitive built on it is
**`whenCommitted(node, action)`** (`core/engine/src/commit.ts`, exported from
`@symbiote-native/engine`): run `action` now if the node already has a Fabric tag, else
after the commit that assigns it; returns a cancel fn.

```ts
import { whenCommitted } from '@symbiote-native/engine'
// instead of: dispatchViewCommand(node, 'focus', [])   // skipped if tag not ready
const cancel = whenCommitted(node, () => dispatchViewCommand(node, 'focus', []))
onBeforeUnmount(() => cancel())   // drop the pending retry if we never commit
```

**Rule for adapter/engine authors:** any native/imperative call that needs a
committed Fabric tag — and is wired at Vue lifecycle time (`onMounted`,
`watch(nodeRef, …)`, `watch(…, {flush:'post'})`) — must NOT assume the tag exists;
wrap it in `whenCommitted` (or, in the engine, defer the bind through it). A
`watch(() => someValueProp, …)` that only fires on a LATER user change is safe (the
node is committed by then) — the trap is specifically the FIRST-mount fire
(node-ref-driven or `immediate`). (Confirmed root cause for the static
native-Animated pulse, the non-sticky SectionList headers, TextInput autoFocus, and
native `Animated.event` binding, 2026-06.)

## Test-only gotcha — a root that renders nothing commits NOTHING, not an empty AppContainer

`requestCommit()` is only ever called FROM a nodeOp (`insert`/`remove`/`patchProp`,
`adapters/vue/src/renderer.ts`) — never unconditionally after render. If the
mounted component tree produces **zero** host nodes on its first render (e.g. a
test whose whole app is `h(Modal, { visible: false }, …)` and Modal itself
renders `null`), no nodeOp ever fires, so `commit()`/`completeRoot` never runs —
`fabric.committed` stays `[]`, there is no AppContainer to unwrap.
`fabric.appRoot()` (which asserts exactly one box-none root) throws
`expected a single box-none AppContainer root, got 0 node(s)` in this case.

**React's host config differs here**: `resetAfterCommit` fires unconditionally
every commit (`react-reconciler`'s own commit phase), so the SAME empty-root
scenario still produces an empty AppContainer on React. This is a genuine
adapter asymmetry, not a bug — the mirror has no entry for the root container
either way, so the next REAL insert (e.g. the modal becoming visible) still does
a correct full first-mount commit, AppContainer included. A Vue test asserting
"nothing rendered" should check `fabric.committed.length === 0` (or
`fabric.find(...)` for the specific node), not call `fabric.appRoot()`.
See `adapters/vue/src/components/modal.test.ts` ("commits no modal node when
visible is false") for the fixed pattern.

## Related gotcha — Vue events vs `$attrs`

This skill covers Vue reactivity and commit timing. For event typing, read
`.claude/skills/vue-adapter-events/SKILL.md` before changing any Vue component
`emits`, public `onX` props, or host event callbacks.

Short rule: typed Vue `emits` are for wrapper-synthesized/normalized events;
raw Fabric/native passthrough listeners must stay in attrs unless the wrapper
manually re-supplies the host `onX` callback. Vue removes declared emit listeners
from `$attrs`, so adding `emits` without a bridge can break native event routing.

## Reference

- Vue event typing + attrs routing: `.claude/skills/vue-adapter-events/SKILL.md`.
- Engine mirror + imperative APIs: `core/engine/src/commit.ts`.
- Async commit batching: `core/engine/src/surface.ts` (`requestCommit`),
  `adapters/vue/src/renderer.ts` (the microtask-coalesced recommit).
- Post-commit retry mechanism: `core/engine/src/post-commit.ts`; the
  `whenCommitted` primitive: `core/engine/src/commit.ts`. Applied in
  `core/engine/src/animated/props.ts` (`connectToView`),
  `core/engine/src/animated/event.ts` (`attachNativeEvent` + `attachNativeEventHandler`),
  and `adapters/vue/src/text-input/index.ts` (autoFocus).
- Gotcha-1 fixed instance: `adapters/vue/src/switch/shared.ts` (`shallowRef` for the
  host node + a comment stating the rule).
- Gotcha-2 regression guards (headless, fake NativeAnimated):
  `adapters/vue/src/animated/animated-native-driver.test.ts` (pulse),
  `adapters/vue/src/scroll-view/sticky-native-attach.test.ts` (sticky scroll),
  `adapters/vue/src/text-input/autofocus.test.ts` (autoFocus),
  `adapters/vue/src/animated/animated-native-event.test.ts` (native Animated.event).
- Safe by construction (no fix needed, value-driven watches firing post-commit):
  Switch snap-back, TextInput controlled setTextAndSelection, Modal visibility,
  VirtualizedList metrics/scroll watches.
