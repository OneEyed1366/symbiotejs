// Per-tab agnostic options. Mirrors @react-navigation/bottom-tabs' `options` surface (title,
// tabBarLabel, tabBarIcon, tabBarBadge, tint colors, tabBarStyle) minus anything that requires a
// framework element: `tabBarIcon` there is a render prop returning a platform icon element, but
// per <prop_types_split_agnostic_vs_per_adapter> a render-callback-returning-a-framework-element
// field can't live in the shared agnostic type, so here it is EITHER a pre-built `IDescriptor`
// (an adapter can bridge any host node it already resolved, image or vector icon) or a bare icon
// NAME string the renderer paints as a label-style glyph - both framework-agnostic. An adapter
// wanting a `(props) => ReactNode`-style callback resolves it to one of these two forms itself,
// same split as IPressableProps's per-adapter children.

import type { IColorValue } from '@symbiote-native/engine';
import type { IViewStyle, IStyleProp } from '@symbiote-native/engine';
import type { IDescriptor } from '@symbiote-native/components';

export type ITabBarIcon = IDescriptor | string;

export type ITabOptions = {
  title?: string;
  tabBarLabel?: string;
  tabBarIcon?: ITabBarIcon;
  tabBarBadge?: string | number;
  tabBarActiveTintColor?: IColorValue;
  tabBarInactiveTintColor?: IColorValue;
  tabBarStyle?: IStyleProp<IViewStyle>;
};
