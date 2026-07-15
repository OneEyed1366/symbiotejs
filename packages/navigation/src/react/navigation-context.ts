// The lifecycle half of the framework-agnostic emitter (../core/navigation-events): a plain
// React Context so a screen's subtree can read its own route, navigator handle, and per-route
// emitter without prop-drilling - the same role @react-navigation's NavigationContext /
// NavigationRouteContext play, collapsed into one context since a symbiote screen only ever needs
// its OWN route (no per-navigator param-list generics in v1 scope - see screen.ts). Provided
// per-screen by each of stack.ts/tabs.ts/drawer.ts's render loop, consumed by the hooks in
// ./hooks. `parent` threads the ambient context a navigator read on ITS OWN mount (undefined at
// the root) into the value it provides to its own screens, forming a linked list - this is what
// lets a screen nested inside e.g. a Stack-screen-renders-a-Tab composition reach the enclosing
// Stack via useNavigation().getParent().

import { createContext, useContext } from 'react';
import type { INavigationEmitter, IRoute, IAnyNavigatorHandle } from '../core';
export type { IAnyNavigatorHandle } from '../core';

// A nested navigator (e.g. a Tab rendered as a Stack screen's content) means a screen's OWN
// navigation prop and its PARENT's handle can be different navigator kinds, so the Context
// value's `navigation` field must stay a union rather than Stack-specific. Consumers narrow it
// themselves (e.g. `'push' in handle` picks out a Stack handle) - no `as` casts.
export type INavigationContextValue = {
  route: IRoute<unknown>;
  navigation: IAnyNavigatorHandle;
  emitter: INavigationEmitter;
  parent?: INavigationContextValue;
};

export const NavigationContext = createContext<INavigationContextValue | undefined>(undefined);

// Every hook in ./hooks needs the same `useContext(NavigationContext)` + missing-provider throw,
// so it's co-located here instead of repeated per hook. `hookName` keeps each hook's own name in
// the thrown message.
export function useRequiredNavigationContext(hookName: string): INavigationContextValue {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error(
      `${hookName} must be used within a screen rendered by <Stack>, <Tab>, or <Drawer>`,
    );
  }
  return context;
}
