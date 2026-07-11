// Stack.Screen: a declarative marker, never rendered on its own — Stack reads its props via
// React.Children to build the static name -> {component, options} registry, then mounts the
// registered component itself for each pushed route. Mirrors @react-navigation's JSX-config
// screens, minus the linking/param-list generics (v1 scope).

import type { FC, ReactElement, RefObject } from 'react';
import type { IRoute } from '../core';
import type { ISearchBarCommands, ISearchBarOptions, IScreenOptions } from '../core';
import type { INavigatorHandle } from '../core';

export type IScreenComponentProps = {
  route: IRoute<unknown>;
  navigation: INavigatorHandle;
};

// The imperative ref (focus/blur/clearText/setText/cancelSearch/toggleCancelButton) carries a
// React ref type, so — per CLAUDE.md's <prop_types_split_agnostic_vs_per_adapter> — it cannot
// live in the shared, agnostic ISearchBarOptions (core/navigator-props.ts). This adapter-only
// overlay adds it on top of the agnostic field base, mirroring react-native-screens' own
// SearchBarProps.ref: React.RefObject<SearchBarCommands | null>.
export type IReactSearchBarOptions = ISearchBarOptions & {
  ref?: RefObject<ISearchBarCommands | null>;
};

export type IReactScreenOptions = Omit<IScreenOptions, 'headerSearchBarOptions'> & {
  headerSearchBarOptions?: IReactSearchBarOptions;
};

export type IScreenOptionsResolver = (props: IScreenComponentProps) => IReactScreenOptions;

export type IScreenProps = {
  name: string;
  component: FC<IScreenComponentProps>;
  options?: IReactScreenOptions | IScreenOptionsResolver;
  initialParams?: unknown;
};

export function Screen(_props: IScreenProps): ReactElement | null {
  return null;
}
