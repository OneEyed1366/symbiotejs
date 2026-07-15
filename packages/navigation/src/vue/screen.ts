// Stack.Screen: a declarative marker, never rendered on its own - Stack reads its props via a
// default-slot scan (see stack.ts's collectRegistry) to build the static name -> {component,
// options} registry, then mounts the registered component itself for each pushed route. The Vue
// twin of react/screen.ts's Screen, using the slot-scanning pattern real Vue component libraries
// use for this exact declarative-marker-child shape (Element Plus's `<el-collapse-item>`, Ant
// Design Vue's `<a-menu-item>`): the parent inspects `vnode.type === Screen` and reads
// `vnode.props` directly, so Screen's own setup() never actually runs.

import { defineComponent } from '@vue/runtime-core';
import type { Component, Ref } from '@vue/runtime-core';
import type { IRoute } from '../core';
import type {
  ISearchBarCommands,
  ISearchBarOptions,
  IScreenOptions,
  INavigatorHandle,
} from '../core';

// The imperative ref (focus/blur/clearText/setText/cancelSearch/toggleCancelButton) carries a Vue
// ref type, so per CLAUDE.md's <prop_types_split_agnostic_vs_per_adapter> it cannot live in
// the shared, agnostic ISearchBarOptions (core/navigator-props.ts). This adapter-only overlay adds
// it on top of the agnostic field base, the Vue twin of react/screen.ts's IReactSearchBarOptions
// (a plain `Ref<T | null>` here instead of React's `RefObject<T | null>`).
export type IVueSearchBarOptions = ISearchBarOptions & {
  ref?: Ref<ISearchBarCommands | null>;
};

export type IVueScreenOptions = Omit<IScreenOptions, 'headerSearchBarOptions'> & {
  headerSearchBarOptions?: IVueSearchBarOptions;
};

// The options resolver runs OUTSIDE render (during the options fold), so it still receives the
// route + navigator handle explicitly - screens read those through composables, but a resolver has
// no component scope to inject from.
export type IScreenOptionsArgs = {
  route: IRoute<unknown>;
  navigation: INavigatorHandle;
};

export type IScreenOptionsResolver = (args: IScreenOptionsArgs) => IVueScreenOptions;

export type IScreenProps = {
  name: string;
  component: Component;
  options?: IVueScreenOptions | IScreenOptionsResolver;
  initialParams?: unknown;
};

export const Screen = defineComponent<IScreenProps>(() => () => null, {
  name: 'Screen',
  inheritAttrs: false,
});
