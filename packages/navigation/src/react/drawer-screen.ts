// Drawer.Screen: a declarative marker, never rendered on its own - Drawer reads its props via
// React.Children to build the static name -> {component, options} registry, then mounts the
// FOCUSED route's component. Mirrors react/tab-screen.ts (Tab's twin - the closer sibling, both
// are fixed-route-list/no-push navigators) and react/screen.ts (Stack's twin); see CLAUDE.md
// <third_party_rn_packages_are_react_only> - this and Drawer import nothing from react-native.

import type { FC, ReactElement } from 'react';
import type { IDrawerNavigatorHandle, IDrawerScreenOptions, IRoute } from '../core';

// The options resolver runs INSIDE Drawer while it computes a screen's options, closing over the
// live navigator handle - not the mounted screen component (that reads navigation/route via the
// hooks). See react/screen.ts's IScreenOptionsArgs for the same distinction.
export type IDrawerScreenOptionsArgs = {
  route: IRoute<unknown>;
  navigation: IDrawerNavigatorHandle;
};

export type IDrawerScreenOptionsResolver = (args: IDrawerScreenOptionsArgs) => IDrawerScreenOptions;

export type IDrawerScreenProps = {
  name: string;
  component: FC;
  options?: IDrawerScreenOptions | IDrawerScreenOptionsResolver;
  initialParams?: unknown;
};

export function DrawerScreen(_props: IDrawerScreenProps): ReactElement | null {
  return null;
}
