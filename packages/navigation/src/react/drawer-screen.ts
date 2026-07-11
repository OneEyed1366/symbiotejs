// Drawer.Screen: a declarative marker, never rendered on its own — Drawer reads its props via
// React.Children to build the static name -> {component, options} registry, then mounts the
// FOCUSED route's component. Mirrors react/tab-screen.ts (Tab's twin — the closer sibling, both
// are fixed-route-list/no-push navigators) and react/screen.ts (Stack's twin); see CLAUDE.md
// <third_party_rn_packages_are_react_only> — this and Drawer import nothing from react-native.

import type { FC, ReactElement } from 'react';
import type { IDrawerNavigatorHandle, IDrawerScreenOptions, IRoute } from '../core';

export type IDrawerScreenComponentProps = {
  route: IRoute<unknown>;
  navigation: IDrawerNavigatorHandle;
};

export type IDrawerScreenOptionsResolver = (
  props: IDrawerScreenComponentProps,
) => IDrawerScreenOptions;

export type IDrawerScreenProps = {
  name: string;
  component: FC<IDrawerScreenComponentProps>;
  options?: IDrawerScreenOptions | IDrawerScreenOptionsResolver;
  initialParams?: unknown;
};

export function DrawerScreen(_props: IDrawerScreenProps): ReactElement | null {
  return null;
}
