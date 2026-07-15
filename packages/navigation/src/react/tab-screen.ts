// Tab.Screen: a declarative marker, never rendered on its own - Tab reads its props via
// React.Children to build the static name -> {component, options} registry, then mounts the
// FOCUSED route's component itself. Mirrors react/screen.ts's Screen (Stack's twin) minus the
// stack-only concepts (no push/pop lifecycle events to wire); see CLAUDE.md
// <third_party_rn_packages_are_react_only> - this and Tab import nothing from react-native.

import type { FC, ReactElement } from 'react';
import type { IRoute, ITabOptions } from '../core';
import type { ITabNavigatorHandle } from '../core';

// The options resolver runs INSIDE Tab while it computes a screen's tab-bar options, closing over
// the live navigator handle - not the mounted screen component (that reads navigation/route via
// the hooks). See react/screen.ts's IScreenOptionsArgs for the same distinction.
export type ITabScreenOptionsArgs = {
  route: IRoute<unknown>;
  navigation: ITabNavigatorHandle;
};

export type ITabScreenOptionsResolver = (args: ITabScreenOptionsArgs) => ITabOptions;

export type ITabScreenProps = {
  name: string;
  component: FC;
  options?: ITabOptions | ITabScreenOptionsResolver;
  initialParams?: unknown;
};

export function TabScreen(_props: ITabScreenProps): ReactElement | null {
  return null;
}
