// The lifecycle half of the framework-agnostic emitter (../core/navigation-events): Vue has no
// "Context" concept the way React does. The equivalent here is a plain provide/inject
// getter/setter pair over one shared InjectionKey (mirrors this codebase's own pd-widgets
// convention: `provideX(value)` writes, `injectX()` reads and throws if nothing was provided), so
// a screen's subtree can read its own route, navigator handle, and per-route emitter without
// prop-drilling - the Vue twin of react/navigation-context.ts's React Context, collapsed into one
// key the same way (a symbiote screen only ever needs its OWN route, no per-navigator
// param-list generics in v1 scope, see screen.ts).
//
// Vue's provide() must run once, synchronously, inside a component's OWN setup(). Unlike React,
// which re-creates a fresh `<Context.Provider value={...}>` element (and therefore a fresh value)
// on every render loop iteration, Vue's provide/inject is scoped to the component INSTANCE, not to
// a render-time position. Stack/Tab/Drawer keep every mounted route's screen alive as a SEPARATE
// sibling subtree (Stack keeps every pushed route mounted; see stack.ts), and each one needs its
// OWN distinct provided value (its own route/emitter) invisible to its siblings - that is an
// inherent property of any hierarchical dependency-injection scheme, provide/inject included, not
// a React artifact. NavigationScope is the small setup-boundary component that gives each route
// subtree its own instance to call provideNavigationScope from: stack.ts/tabs.ts/drawer.ts's
// render loop mounts ONE NavigationScope per route (keyed by route.key, exactly like React's
// per-route `<NavigationContext.Provider>`), and that instance's setup() calls the setter ONCE,
// refreshed from the latest `value` prop on every one of ITS OWN re-renders - consumers read
// `.value` off the injected ref, so a later change (e.g. setParams producing a new route object
// for the same key) still reaches them reactively.
//
// `parent` threads the ambient value a navigator read on ITS OWN mount (undefined at the root)
// into the value it provides to its own screens, forming a linked list - this is what lets a
// screen nested inside e.g. a Stack-screen-renders-a-Tab composition reach the enclosing Stack via
// useNavigation().getParent().

import { defineComponent, inject, provide, shallowRef } from '@vue/runtime-core';
import type { InjectionKey, ShallowRef } from '@vue/runtime-core';
import type { INavigationEmitter, IRoute, IAnyNavigatorHandle } from '../core';
export type { IAnyNavigatorHandle };

export type INavigationScopeValue = {
  route: IRoute<unknown>;
  navigation: IAnyNavigatorHandle;
  emitter: INavigationEmitter;
  parent?: INavigationScopeValue;
};

const NAVIGATION_SCOPE_KEY: InjectionKey<ShallowRef<INavigationScopeValue>> =
  Symbol('navigation-scope');

// The setter half of the pair - writes the CURRENT route's scope onto the shared key. Called only
// from NavigationScope's own setup below (never directly by app code).
function provideNavigationScope(value: ShallowRef<INavigationScopeValue>): void {
  provide(NAVIGATION_SCOPE_KEY, value);
}

// The getter half of the pair - every composable in ./composables and every navigator
// (stack.ts/tabs.ts/drawer.ts, reading the AMBIENT/parent scope on their own mount) calls this
// directly; undefined simply means "no ancestor NavigationScope", which is a legitimate state (the
// nesting root) rather than an error - callers that require one throw their own message.
export function injectNavigationScope(): ShallowRef<INavigationScopeValue> | undefined {
  return inject(NAVIGATION_SCOPE_KEY, undefined);
}

// The "throw if missing" half every composable in ./composables needs (useNavigation, useRoute,
// useIsFocused, useFocusEffect, useNavigationState) - they all called injectNavigationScope() and
// threw the same shaped error, differing only in which hook name the message names. Centralized
// here so a wording change lands once instead of five times.
export function requireNavigationScope(hookName: string): ShallowRef<INavigationScopeValue> {
  const scope = injectNavigationScope();
  if (scope === undefined) {
    throw new Error(
      `${hookName} must be used within a screen rendered by <Stack>, <Tab>, or <Drawer>`,
    );
  }
  return scope;
}

// The setup-boundary component described above. `props: ['value']` is a REQUIRED runtime
// declaration here, not stylistic - without it Vue would route the incoming `value` into `attrs`
// instead of a tracked reactive `props` field, and the render closure's refresh below would
// silently keep re-reading a stale initial snapshot.
export const NavigationScope = defineComponent<{ value: INavigationScopeValue }>(
  (props, { slots }) => {
    const current = shallowRef(props.value);
    provideNavigationScope(current);
    return () => {
      current.value = props.value;
      return slots.default?.() ?? null;
    };
  },
  { name: 'NavigationScope', props: ['value'] },
);
