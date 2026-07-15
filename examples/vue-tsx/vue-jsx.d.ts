// TS's JSX type-checking algorithm resolves `JSX.*` types via the configured `jsxFactory`'s OWN
// namespace FIRST (default factory "React.createElement" → checks "React.JSX", which
// @types/react DOES export) and only falls back to a global `JSX` namespace when that lookup
// finds nothing. That priority order — not a declaration-merge conflict — is why a plain
// `declare global { namespace JSX {...} }` here had no effect: TS never got past the first check.
// The fix: point `jsxFactory` (tsconfig.typecheck.json) at a namespace React never touches
// (`VueJsx.createElement`, declared here) so `VueJsx.JSX` fails to resolve and TS falls through
// to the global `JSX` namespace below — which we DO control. Emit is unaffected (`"jsx": "preserve"`
// never calls the factory; @vue/babel-plugin-jsx already does the real transform in babel.config.js
// before React's own JSX plugin ever sees the file) — this is purely a type-checking concern.
import type { VNode } from '@vue/runtime-core';

declare global {
  namespace VueJsx {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace JSX {
      interface Element extends VNode {}
      interface ElementClass {
        $props: {};
      }
      interface ElementAttributesProperty {
        $props: {};
      }
      interface IntrinsicElements {
        [name: string]: any;
      }
      // Index signature, not just `key`: several adapter components (SafeAreaView, StatusBar,
      // ActivityIndicator, Animated.View/ScrollView accessed off the `Animated` namespace) declare
      // NO `props` schema at all — they forward everything through Vue's untyped `$attrs`
      // fallthrough by design (see adapters/vue/src/components/safe-area-view.ts's own comment).
      // `.vue` SFCs never flag this (the template compiler doesn't excess-property-check against
      // JSX's `IntrinsicAttributes`); TSX does, since JSX attribute checking always intersects a
      // component's `$props` with this interface. Without the index signature here, passing
      // `testID`/`class`/etc. to any of those attrs-passthrough components is a false-positive
      // excess-property error, not a real type mismatch — the props genuinely do forward at runtime.
      interface IntrinsicAttributes {
        key?: string | number | symbol;
        [name: string]: unknown;
      }
    }
  }
  const VueJsx: { createElement: (...args: any[]) => any };
}
