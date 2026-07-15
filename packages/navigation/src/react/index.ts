// @symbiote-native/navigation/react: the React native-stack navigator over react-native-screens'
// native view primitives. Importing this barrel first registers the native views' ViewConfigs
// (../register, a side-effect import of the three codegen specs - never react-native-screens' own
// React components), then exposes Stack (with Stack.Screen attached) and the navigator handle.

import '../register';

export { Stack } from './stack';
export type { INavigatorHandle, IStackProps } from './stack';
export { Screen } from './screen';
export type { IScreenOptionsArgs, IScreenOptionsResolver, IScreenProps } from './screen';
export type { IScreenOptions, IStackAnimation, IStackPresentation } from '../core';

export { useNavigation, useRoute, useIsFocused, useFocusEffect, useNavigationState } from './hooks';
export type { INavigationHandle } from './hooks';
export { useStackNavigation, useTabNavigation, useDrawerNavigation } from './hooks';
export type {
  IStackNavigationHandle,
  ITabNavigationHandle,
  IDrawerNavigationHandle,
} from './hooks';
export { NavigationContext } from './navigation-context';
export type { INavigationContextValue, IAnyNavigatorHandle } from './navigation-context';

export { useLinkingIntegration } from './linking';
export type { ILinkingConfig, IScreenLinkingConfig } from '../core';

// Tab: the bottom-tabs navigator, a PURE-JS UI (no react-native-screens views involved, so no
// extra ViewConfig registration is needed beyond the ../register import above).
export { Tab } from './tabs';
export type { ITabNavigatorHandle, ITabProps } from './tabs';
export { TabScreen } from './tab-screen';
export type {
  ITabScreenOptionsArgs,
  ITabScreenOptionsResolver,
  ITabScreenProps,
} from './tab-screen';
export type { ITabOptions, ITabBarIcon } from '../core';

// Drawer: the swipeable drawer navigator, a PURE-JS UI (PanResponder + Animated, no
// react-native-screens views involved, so no extra ViewConfig registration is needed beyond the
// ../register import above). See react/drawer.ts's header for the feasibility note re:
// react-native-gesture-handler / react-native-reanimated parity gaps.
export { Drawer } from './drawer';
export type { IDrawerNavigatorHandle, IDrawerProps, IDrawerDescriptorMap } from './drawer';
export { DrawerScreen } from './drawer-screen';
export type {
  IDrawerScreenOptionsArgs,
  IDrawerScreenOptionsResolver,
  IDrawerScreenProps,
} from './drawer-screen';
export type { IDrawerOptions, IDrawerScreenOptions, IDrawerType, IDrawerPosition } from '../core';
