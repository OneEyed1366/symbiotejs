// Imperative navigator handles: framework-agnostic (scalars, `unknown`, plain function
// signatures over `INavigatorState`/`IDrawerScreenOptions` - no framework element, ref, or
// children in any field), so each shape is declared once here and every adapter re-exports it
// verbatim (see CLAUDE.md <prop_types_split_agnostic_vs_per_adapter>).

import type { INavigatorState } from '../navigator-state';
import type { IDrawerScreenOptions } from '../drawer-options';

export type INavigatorHandle = {
  push: (name: string, params?: unknown) => void;
  pop: (count?: number) => void;
  popToTop: () => void;
  popTo: (key: string) => void;
  replace: (name: string, params?: unknown) => void;
  setParams: (params: unknown, key?: string) => void;
  reset: (state: INavigatorState) => void;
  canGoBack: () => boolean;
};

export type ITabNavigatorHandle = {
  jumpTo: (name: string, params?: unknown) => void;
  // (params, key) - same order as INavigatorHandle.setParams; key stays required (unlike Stack's
  // optional key, which defaults to the focused route) since a tab must always be identified
  // explicitly.
  setParams: (params: unknown, key: string) => void;
};

export type IDrawerNavigatorHandle = {
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  jumpTo: (name: string) => void;
};

// Keyed by route.key, mirroring @react-navigation/drawer's own `descriptors` prop shape - the
// options a caller's renderDrawerContent/drawerContent reads to label its menu entries (Drawer
// ships no built-in menu UI, matching react-native-drawer-layout's Drawer primitive).
export type IDrawerDescriptorMap = Record<
  string,
  { options: IDrawerScreenOptions; navigation: IDrawerNavigatorHandle }
>;

// Every navigator kind a screen might be rendered under. useNavigation()/injectNavigation()
// return this union since they don't know which navigator mounted the calling component; the
// three guards below narrow it (used once, inside useStackNavigation/useTabNavigation/
// useDrawerNavigation and their Vue/Angular equivalents) so app code never writes the guard itself.
export type IAnyNavigatorHandle = INavigatorHandle | ITabNavigatorHandle | IDrawerNavigatorHandle;

export function isStackNavigatorHandle(handle: IAnyNavigatorHandle): handle is INavigatorHandle {
  return 'push' in handle;
}

export function isDrawerNavigatorHandle(
  handle: IAnyNavigatorHandle,
): handle is IDrawerNavigatorHandle {
  return 'openDrawer' in handle;
}

// jumpTo exists on both Tab and Drawer handles, so a Tab handle is a jumpTo-having handle that
// isn't a Drawer handle (Drawer's own openDrawer/closeDrawer/toggleDrawer rule it out).
export function isTabNavigatorHandle(handle: IAnyNavigatorHandle): handle is ITabNavigatorHandle {
  return 'jumpTo' in handle && !isDrawerNavigatorHandle(handle);
}
