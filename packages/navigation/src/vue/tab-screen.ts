// Tab.Screen: a declarative marker, never rendered on its own - Tab reads its props via a
// default-slot scan (see tabs.ts's collectRegistry) to build the static name -> {component,
// options} registry, then mounts the FOCUSED route's component itself. The Vue twin of
// react/tab-screen.ts's TabScreen, mirroring screen.ts's slot-scanning marker pattern minus the
// stack-only concepts (no push/pop lifecycle events to wire); see CLAUDE.md
// <third_party_rn_packages_are_react_only> - this and Tab import nothing from react-native.

import { defineComponent } from '@vue/runtime-core';
import type { Component } from '@vue/runtime-core';
import type { IRoute, ITabOptions, ITabNavigatorHandle } from '../core';

export type ITabScreenOptionsArgs = {
  route: IRoute<unknown>;
  navigation: ITabNavigatorHandle;
};

export type ITabScreenOptionsResolver = (props: ITabScreenOptionsArgs) => ITabOptions;

export type ITabScreenProps = {
  name: string;
  component: Component;
  options?: ITabOptions | ITabScreenOptionsResolver;
  initialParams?: unknown;
};

export const TabScreen = defineComponent<ITabScreenProps>(() => () => null, {
  name: 'TabScreen',
  inheritAttrs: false,
});
