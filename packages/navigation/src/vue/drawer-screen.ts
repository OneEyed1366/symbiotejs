// Drawer.Screen: a declarative marker, never rendered on its own - Drawer reads its props via a
// default-slot scan (see drawer.ts's collectRegistry) to build the static name -> {component,
// options} registry, then mounts the FOCUSED route's component. The Vue twin of
// react/drawer-screen.ts's DrawerScreen, mirroring tab-screen.ts's slot-scanning marker (Tab is
// the closer sibling - both are fixed-route-list/no-push navigators) and screen.ts's; see
// CLAUDE.md <third_party_rn_packages_are_react_only> - this and Drawer import nothing from
// react-native.

import { defineComponent } from '@vue/runtime-core';
import type { Component } from '@vue/runtime-core';
import type { IDrawerScreenOptions, IRoute, IDrawerNavigatorHandle } from '../core';

export type IDrawerScreenOptionsArgs = {
  route: IRoute<unknown>;
  navigation: IDrawerNavigatorHandle;
};

export type IDrawerScreenOptionsResolver = (
  props: IDrawerScreenOptionsArgs,
) => IDrawerScreenOptions;

export type IDrawerScreenProps = {
  name: string;
  component: Component;
  options?: IDrawerScreenOptions | IDrawerScreenOptionsResolver;
  initialParams?: unknown;
};

export const DrawerScreen = defineComponent<IDrawerScreenProps>(() => () => null, {
  name: 'DrawerScreen',
  inheritAttrs: false,
});
