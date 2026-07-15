// Stack.Screen: a declarative marker, never rendered on its own - Stack reads its props via
// React.Children to build the static name -> {component, options} registry, then mounts the
// registered component itself for each pushed route. Mirrors @react-navigation's JSX-config
// screens, minus the linking/param-list generics (v1 scope).

import type { FC, ReactElement, RefObject } from 'react';
import type { IRoute } from '../core';
import type { ISearchBarCommands, ISearchBarOptions, IScreenOptions } from '../core';
import type { INavigatorHandle } from '../core';

// The imperative ref (focus/blur/clearText/setText/cancelSearch/toggleCancelButton) carries a
// React ref type, so - per CLAUDE.md's <prop_types_split_agnostic_vs_per_adapter> - it cannot
// live in the shared, agnostic ISearchBarOptions (core/navigator-props.ts). This adapter-only
// overlay adds it on top of the agnostic field base, mirroring react-native-screens' own
// SearchBarProps.ref: React.RefObject<SearchBarCommands | null>.
export type IReactSearchBarOptions = ISearchBarOptions & {
  ref?: RefObject<ISearchBarCommands | null>;
};

export type IReactScreenOptions = Omit<IScreenOptions, 'headerSearchBarOptions'> & {
  headerSearchBarOptions?: IReactSearchBarOptions;
};

// The options resolver runs INSIDE the Stack while it computes a screen's options - its
// bar-button/menu onPress handlers close over the live navigator handle. This is NOT the mounted
// screen component (that one reads navigation/route via the hooks); it's a config callback with no
// lifecycle, so hooks aren't available to it and the handle arrives as an argument instead.
export type IScreenOptionsArgs = {
  route: IRoute<unknown>;
  navigation: INavigatorHandle;
};

export type IScreenOptionsResolver = (args: IScreenOptionsArgs) => IReactScreenOptions;

export type IScreenProps = {
  name: string;
  component: FC;
  options?: IReactScreenOptions | IScreenOptionsResolver;
  initialParams?: unknown;
};

export function Screen(_props: IScreenProps): ReactElement | null {
  return null;
}
