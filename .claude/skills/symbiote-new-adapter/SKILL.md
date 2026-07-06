---
name: symbiote-new-adapter
description: "Symbiote new-adapter workflow — building a NEW framework adapter (Svelte, Solid, …) or porting/debugging an existing one's renderer seam. Read ALONGSIDE symbiote-engine-core (that skill is the engine API you target; this one is how a framework attaches to it). The core idea: every modern UI framework exposes a framework-agnostic rendering abstraction — Vue createRenderer(RendererOptions), React react-reconciler host config, Angular Renderer2/RendererFactory2 — and the adapter is just that abstraction's methods mapped onto the engine mutation API (createElement / appendChild / insertBefore / removeChild / routeProp / setText), nothing more. Covers (1) the seam mapping, with the LITERAL Vue nodeOps table (adapters/vue/src/renderer.ts) as the reference. (2) COMMIT STRATEGY — the single biggest choice: sync surface.commit() (React, already batches) vs microtask-coalesced surface.requestCommit() after every mutation (Vue/Svelte/Angular). (3) toPublicInstance graft on createElement so a host ref exposes measure/focus/setNativeProps. (4) text-inside-<Text> validation + empty-text/comment → createAnchor. (5) the 8-file minimal checklist: index.ts, render.ts (mount/unmount + global.RN$stopSurface), renderer.ts|host-config.ts, components.ts, descriptor-to-<fw>, host-instance, the lifecycle bucket (hooks/ or composables/), and the one-time setEventDispatcher wiring. (6) what is the ENGINE's job, not yours (clone-on-write, tags, ViewConfig event inference, responder negotiation). Trigger on new-adapter bootstrap, seam/nodeOps mapping, mount/unmount, descriptor bridge, or commit-scheduling design."
---

# Symbiote new-adapter — attaching a framework to the engine

A new adapter is **thin** (`<adapters_stay_thin>`): it maps your framework's node
operations onto the engine's mutation API and picks a commit strategy. That's the
whole job. Everything heavy — clone-on-write, Fabric tags, event inference,
responder negotiation, platform routing — already lives in `@symbiote-native/engine`.
Read `symbiote-engine-core` first; it is the API every method below targets.

The reference shapes already in-tree: React `adapters/react/src/host-config.ts`
(react-reconciler, mutation mode), Vue `adapters/vue/src/renderer.ts`
(`createRenderer`). The wolf-tui twins (`wolf-tui/packages/{react,vue,svelte,solid,
angular}`) are the same architecture on an ANSI target — the framework seam
transfers verbatim, only the host-call targets differ.

## 1. The seam — your framework already has it

Every framework that can render to something other than the DOM exposes a
host-agnostic abstraction. Find it; that IS the adapter:

```
Vue       createRenderer(RendererOptions)          adapters/vue/src/renderer.ts
React     react-reconciler host config             adapters/react/src/host-config.ts
Angular   Renderer2 + RendererFactory2             (planned — angular-adapter skill)
Svelte    a tiny set of DOM-ish ops you provide
Solid     its universal/runtime custom renderer
```

## 2. The nodeOps mapping (Vue, literal — your template)

Every method does its mutation + (for coalesced adapters) `surface.requestCommit()`.
This is the actual `adapters/vue/src/renderer.ts`:

```
createElement(type)      → descriptor = descriptorFor(type)        // 'View' → { component:'RCTView', isText }
                           createElement(descriptor.component, descriptor.isText)
                           return toPublicInstance(node)            // §4 — grafts measure/focus, SAME identity
createText(text)         → text === '' ? createAnchor() : createRawText(text)   // empty = positional anchor
createComment()          → createAnchor()                          // fragment/v-if/v-for boundary, skipped at commit
setText(node, text)      → setText(node, text)                     + requestCommit()
insert(child, parent, a) → isSurface(parent) ? parent.appendChild/insertBefore
                                             : appendChild/insertBefore(parent, child, a)   + requestCommit()
                           // THROW if a raw-text child lands outside a Text container
remove(child)            → child.parent ? removeChild(parent, child) : surface.removeChild(child)  + requestCommit()
parentNode(node)         → node.parent ?? surface
nextSibling(node)        → sibling lookup in (node.parent ?? surface).children
patchProp(el, k, _p, n)  → routeProp(el, k, n)                     + requestCommit()   // ← never pre-split events
```

`patchProp` routes EVERY prop through `routeProp` — the engine decides
event-vs-prop from the ViewConfig, identical to React. Do not write your own
`onX` check (`symbiote-engine-core` §2).

## 3. Commit strategy — the one big decision

```
surface.commit()         SYNC. Use when your framework already batches per update.
                         React calls it in resetAfterCommit. Tag exists when an effect runs.

surface.requestCommit()  COALESCED. Use when your framework emits many mutations per tick.
                         queueMicrotask(commit), de-duped — Vue/Svelte/zoneless-Angular.
                         ⚠ The Fabric tag is assigned INSIDE that microtask, AFTER lifecycle
                           code (onMounted / mount effect) runs. Any native call wired there
                           MUST go through whenCommitted (engine-core §6, vue-adapter-reactivity §2).
```

Choosing `requestCommit` signs you up for the async-commit-timing class of bugs —
budget for `whenCommitted` from the start, not as a follow-up.

## 4. `toPublicInstance` + host refs

`createElement` returns `toPublicInstance(node)` — it grafts the imperative public
API (`measure` / `setNativeProps` / `focus` / …) onto the node **in place and
returns the SAME object identity**, so the engine's commit mirror still resolves
it. The framework's ref to a host element therefore exposes RN's public-instance
API, exactly like React's `getPublicInstance`. The ref MUST keep holding this raw
node by identity — in a reactive framework that means `shallowRef`/`markRaw`, never
a deep ref (`vue-adapter-reactivity` §1).

## 5. The 8-file minimal checklist

```
[ ] src/index.ts              public barrel — components + lifecycle + re-export @symbiote-native/engine utils
[ ] src/render.ts             mount(rootTag, root) / unmount(rootTag); install globalThis.RN$stopSurface
[ ] src/renderer.ts           your createRenderer / host-config — the §2 mapping
    (or host-config.ts)
[ ] src/components.ts         thin wrappers per primitive + the re-export barrel
[ ] src/descriptor-to-<fw>.ts the Descriptor → framework element bridge (h() / createElement / imperative)
[ ] src/host-instance(/.ts)   findNodeHandle(ref) → native tag (framework-shaped ref input)
[ ] src/<hooks|composables>/  framework-idiomatic lifecycle: use-color-scheme, use-window-dimensions, …
[ ] one-time wiring           setEventDispatcher(run => …) once at app entry (see React render.ts:
                              it wraps run in discrete priority + flushSyncWork; a coalesced adapter
                              may simply run it — the engine's dispatch is pre-wired)
```

The lifecycle bucket name is framework-idiomatic — `hooks/` for React, `composables/`
for Vue (`symbiote-file-layout` §3). The reconciler wiring stays flat at the package
root, never in a bucket.

## 6. What is NOT your job (engine owns it)

Do not reimplement, in the adapter, any of: clone-on-write / `completeRoot`, Fabric
tag allocation, `onX`→event inference (`routeProp` does it), responder negotiation,
the imperative bridge (`dispatchViewCommand`/`measure`/…), platform routing, the
pure utilities (`Platform`/`StyleSheet`/`Dimensions` — re-export them from the
engine). If adapter code starts growing any of these, it belongs in the engine
(`<adapters_stay_thin>`).

## 7. Build it in layers

So a break localizes (the Vue/Angular plan, `.docs/decisions/0007`):

```
L1  Static paint   View/Text/Image, no reactivity  → surface paints
L2  Reactive       a counter increments             → requestCommit/commit wired
L3  Events         press / change                   → routeProp → setEventListener
L4  Parity (P0)    @symbiote-native/components via descriptorTo<fw> + lifecycle  → symbiote-add-component
```

Mount/build every layer against `.examples/<app>` (workspace:*-linked dev harness),
never `examples/<app>` (published-catalog canary) — `symbiote-dev-examples`.

## Reference

- The engine API you target: the `symbiote-engine-core` skill + `core/engine/src/node.ts`.
- Reference seams: `adapters/vue/src/renderer.ts`, `adapters/react/src/host-config.ts`,
  `adapters/{react,vue}/src/render.ts` (mount/unmount + `RN$stopSurface`).
- Angular's Renderer2 mapping, AOT-under-Metro, version floor: the `angular-adapter` skill.
- Async-commit landmines on a coalesced adapter: `vue-adapter-reactivity`.
- Component parity (L4): the `symbiote-add-component` skill.
- Prior art: `wolf-tui/packages/{react,vue,svelte,solid,angular}` (same architecture, ANSI target).
- Decisions: `.docs/decisions/0002` (adapter seam), `0007` (build in layers), `0008`
  (React goes through the engine in mutation mode, not native persistent mode).
</content>
