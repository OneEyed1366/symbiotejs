// StatusBar: shared contract. The component renders NO Fabric view; it imperatively
// drives a status-bar native module. What DIVERGES by platform is the native module's
// method shape: iOS's StatusBarManager takes `setStyle(style, animated)` /
// `setHidden(hidden, withAnimation)`, while Android's takes single-arg `setStyle(style)` /
// `setHidden(hidden)` plus `setColor` / `setTranslucent`, and driving those Android window
// flags from our bridgeless surface blanks it (a window-insets relayout detaches the Fabric
// surface). So the .ios/.android files own the native calls (applyStatusBarProps +
// statusBarImperative); the types + the framework-agnostic imperative surface live here.
// Filename selects, no Platform.OS read (see ADR 0012 + native_module_name_is_platform_specific).
//
// This is the engine half: pure types + the imperative API. Each adapter wraps it with a
// per-framework declarative component (React FC + useEffect, Vue defineComponent + watchEffect)
// that renders null and applies the props through applyStatusBarProps. The imperative API is
// shared verbatim: a single StatusBarManager driver behind both adapters.

import type { IColorValue } from '../platform-color';

// The bar styles RN documents (statusBarStyles), as a closed union so a typo can't
// reach the native call.
export type IStatusBarStyle = 'default' | 'light-content' | 'dark-content';

// The native `withAnimation` argument of iOS setHidden: 'none' | 'fade' | 'slide'.
export type IStatusBarAnimation = 'none' | 'fade' | 'slide';

export const STATUS_BAR_MANAGER = 'StatusBarManager';

// RN's default hide/show transition when `animated` is true (showHideTransition
// defaults to 'fade'); 'none' otherwise.
export const ANIMATED_HIDE_TRANSITION: IStatusBarAnimation = 'fade';
export const STATIC_HIDE_TRANSITION: IStatusBarAnimation = 'none';

export function hideTransition(animated: boolean): IStatusBarAnimation {
  return animated ? ANIMATED_HIDE_TRANSITION : STATIC_HIDE_TRANSITION;
}

export interface IStatusBarProps {
  barStyle?: IStatusBarStyle;
  hidden?: boolean;
  animated?: boolean;
  networkActivityIndicatorVisible?: boolean;
  // Android-only, inert on iOS (RN's StatusBar has no iOS background color).
  backgroundColor?: IColorValue;
  translucent?: boolean;
}

// The framework-agnostic imperative API RN exposes, used widely without rendering a
// component. Each adapter attaches these onto its StatusBar component function object,
// mirroring RN. setBackgroundColor / setTranslucent and currentHeight are Android-only; on
// iOS they are inert/absent per RN, but stay on the contract so a typo can't pass and callers
// don't branch on platform.
export interface IStatusBarImperative {
  setBarStyle(style: IStatusBarStyle, animated?: boolean): void;
  setHidden(hidden: boolean, animation?: IStatusBarAnimation): void;
  setNetworkActivityIndicatorVisible(visible: boolean): void;
  setBackgroundColor(color: IColorValue, animated?: boolean): void;
  setTranslucent(translucent: boolean): void;
}
