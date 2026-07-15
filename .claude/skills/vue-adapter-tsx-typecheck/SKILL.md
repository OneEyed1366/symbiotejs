---
name: vue-adapter-tsx-typecheck
description: "Symbiote raw-Vue-TSX (.tsx, @vue/babel-plugin-jsx) typecheck setup — read BEFORE adding a typecheck script to any Vue app authored in raw TSX (not .vue SFC — those go through vue-tsc's Volar plugin and don't hit this), or when vue-tsc/tsc reports a component 'is not a valid JSX element type... missing properties from type Component<any,any,any>: context, setState, forceUpdate, render' or 'Tag X expects at least 2 arguments, but the JSX factory React.createElement provides at most 1'. Root cause: TS's JSX checker resolves JSX.* via the configured jsxFactory's OWN namespace FIRST (default 'React.createElement' -> 'React.JSX', which @types/react exports) and only falls back to a global JSX namespace if that lookup finds nothing — so a plain `declare global { namespace JSX {...} }` shim has ZERO effect whenever react/react-native are also top-level deps in the same tsconfig program, which every symbiote example app requires. Fix: point jsxFactory at a dummy namespace React never touches so the fallback actually triggers. Triggers: vue-tsx typecheck script, vue-tsc JSX errors, React.createElement JSX factory error in a Vue file, JSX element class does not support attributes, wiring typecheck for examples/vue-tsx or any raw-TSX Vue app."
---

# Symbiote raw-Vue-TSX — why typecheck needs a jsxFactory shim

`.examples/vue-tsx` (and any future raw-TSX Vue app in this monorepo — NOT `.vue` SFC apps like
`.examples/vue-sfc`, which vue-tsc typechecks correctly out of the box via its Volar language
service plugin) had **no working typecheck** until this was diagnosed: adding a naive `vue-tsc
--noEmit` produced ~786 errors, every one shaped like React demanding the file be React.

## Root cause: jsxFactory-namespace lookup order, not a declaration-merge conflict

TS's JSX type-checker does NOT check a global `JSX` namespace first. It checks the configured
`jsxFactory`'s own namespace **first** (default `"React.createElement"` → looks up `React.JSX`,
which `@types/react` genuinely exports as a module-scoped namespace) and only falls back to a
bare global `JSX` namespace if `React.JSX` doesn't resolve. Since `react`/`react-native` are
mandatory top-level deps of every example app (`<react_native_is_an_explicit_top_level_peer>`),
`React.JSX` is ALWAYS resolvable in the program — so a plain

```ts
declare global { namespace JSX { interface ElementClass { $props: {} } ... } }
```

has **zero effect**: TS never gets past the first lookup to consult it. This is why the symptom
reads like React fighting Vue (`'View' cannot be used as a JSX component... missing properties
from type Component<any,any,any>: context, setState, forceUpdate, render` — React's class-component
shape) even though nothing in the file imports React.

Runtime is never affected by any of this — `@vue/babel-plugin-jsx` (listed first in
`babel.config.js`'s `plugins`) fully rewrites every JSXElement into a `createVNode` call before
React's own JSX babel plugin ever sees the file. This is a pure, dormant type-checking gap,
invisible until a typecheck script actually exists for the app.

## Fix: redirect jsxFactory to a namespace React never touches

Two files (see `.examples/vue-tsx/vue-jsx.d.ts` and `tsconfig.typecheck.json` for the working
copy):

1. **`vue-jsx.d.ts`** — declare a throwaway global namespace + const, and put YOUR global `JSX`
   namespace under it:
   ```ts
   import type { VNode } from '@vue/runtime-core';

   declare global {
     namespace VueJsx {
       namespace JSX {
         interface Element extends VNode {}
         interface ElementClass { $props: {} }
         interface ElementAttributesProperty { $props: {} }
         interface IntrinsicElements { [name: string]: any }
         interface IntrinsicAttributes {
           key?: string | number | symbol;
           [name: string]: unknown;   // see "IntrinsicAttributes needs an index signature" below
         }
       }
     }
     const VueJsx: { createElement: (...args: any[]) => any };
   }
   ```
2. **`tsconfig.typecheck.json`** — point `jsxFactory` at it, keep `"jsx": "preserve"` (emit is
   irrelevant, babel already did the real transform):
   ```json
   { "compilerOptions": { "jsx": "preserve", "jsxFactory": "VueJsx.createElement" } }
   ```

`VueJsx.JSX` doesn't exist anywhere real, so the factory-namespace lookup fails and TS falls
through to the global `JSX` namespace declared inside it — which is now the ONLY one in scope,
since it lives under a namespace nothing else touches. No declaration-merge fight with React.

## `IntrinsicAttributes` needs an index signature, not just `key`

Several `@symbiote-native/vue` components declare **no `props` schema at all** — they forward
everything through Vue's untyped `$attrs` fallthrough by design (`adapters/vue/src/components/
safe-area-view.ts`'s own header comment: "Inputs arrive as attrs (untyped)"). Known offenders:
`SafeAreaView`, `StatusBar`, `ActivityIndicator`, `Animated.View`/`Animated.ScrollView` (accessed
off the `Animated` namespace — dotted JSX tags lose prop-type inference the same way). `.vue` SFCs
never flag this: the template compiler doesn't excess-property-check against JSX's
`IntrinsicAttributes`. Raw TSX does, because JSX attribute checking always intersects a
component's `$props` with `IntrinsicAttributes` — so `<SafeAreaView testID="x">` fails with
`Property 'testID' does not exist on type '... & Partial<{}> & ...'` even though `testID` forwards
correctly at runtime. Fix: give `IntrinsicAttributes` an index signature (`[name: string]:
unknown`) — this is a deliberate widening of the excess-property check, matching the permissiveness
`.vue` SFCs already have, not a loosening of real prop types (each component's own declared props,
where it has any, are still checked normally).

## Verify

```bash
npx vue-tsc --noEmit -p tsconfig.typecheck.json
```
Should be 0 errors. If you still see `React.createElement`-flavored errors after adding both
files, check `npx tsc --showConfig -p tsconfig.typecheck.json | grep jsx` — confirm `jsxFactory`
actually resolved (a typo in the tsconfig path, or the `.d.ts` not being in `include`/`files`,
silently no-ops the fix and you're back to the default `React.createElement` lookup).

## A note on live diagnostics during this investigation

IDE/LSP "new-diagnostics" style live feedback lagged real file state significantly during and
after heavy concurrent file writes (multiple agents editing the same package tree) — it kept
reporting already-fixed errors (`Cannot find module './stack'` for files that existed and
typechecked cleanly; this exact JSX collision, minutes after the fix landed) for several turns
after the underlying files were correct. Always re-verify with a fresh, direct `tsc --build` /
`vue-tsc --noEmit` run rather than trusting a live diagnostics stream at face value, especially
right after a burst of concurrent edits.
