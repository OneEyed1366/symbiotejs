// StatusBar on iOS drives the iOS `StatusBarManager` TurboModule from props (via
// applyStatusBarProps) and from the static methods (statusBarImperative). The native
// contract is RN's spec at
// .vendors/react-native/.../src/private/specs_DEPRECATED/modules/NativeStatusBarManagerIOS.js:
//   setStyle(statusBarStyle?: string, animated: boolean)
//   setHidden(hidden: boolean, withAnimation: 'none' | 'fade' | 'slide')
//   setNetworkActivityIndicatorVisible(visible: boolean)
// We mirror only those three setters as our hand-written interface: the typed trust
// boundary getNativeModule<T> resolves against. Metro picks this on an iOS host; the base
// status-bar.ts re-exports it for tsc / tsx / headless. Each adapter wraps these with its own
// declarative component.

import { getNativeModule } from '../native-modules';
import { dlog } from '../debug';
import {
  STATUS_BAR_MANAGER,
  STATIC_HIDE_TRANSITION,
  hideTransition,
  type IStatusBarAnimation,
  type IStatusBarImperative,
  type IStatusBarProps,
  type IStatusBarStyle,
} from './shared';
export type { IStatusBarProps, IStatusBarStyle } from './shared';

// The native module typed as the interface we vouch for: only the setters we use.
// This is the single point that accepts the native shape (no per-call `as`).
interface INativeStatusBarManager {
  setStyle(statusBarStyle: IStatusBarStyle, animated: boolean): void;
  setHidden(hidden: boolean, withAnimation: IStatusBarAnimation): void;
  setNetworkActivityIndicatorVisible(visible: boolean): void;
}

// Apply a StatusBar component's props to the native module. The adapter calls this from its
// declarative component's effect, on mount and on every prop change. Resolves lazily inside
// the call, not at import; keeps this module importable headless before a fake
// __turboModuleProxy is installed. Non-enforcing: a declarative StatusBar must NOT crash the
// whole render if the module can't resolve.
//
// Simplification vs RN: RN maintains a prop-merge stack so nested StatusBars compose
// (deepest/last wins); we direct-apply a single component's props, which is correct for one
// StatusBar and a fine first cut.
export function applyStatusBarProps(props: IStatusBarProps): void {
  const { barStyle, hidden, animated = false, networkActivityIndicatorVisible } = props;
  const manager = getNativeModule<INativeStatusBarManager>(STATUS_BAR_MANAGER);
  if (manager === null) {
    dlog('StatusBar: StatusBarManager not resolvable via __turboModuleProxy — skipping');
    return;
  }
  dlog('StatusBar -> applying props to StatusBarManager');

  if (barStyle !== undefined) manager.setStyle(barStyle, animated);
  if (hidden !== undefined) manager.setHidden(hidden, hideTransition(animated));
  if (networkActivityIndicatorVisible !== undefined) {
    manager.setNetworkActivityIndicatorVisible(networkActivityIndicatorVisible);
  }
}

// The static API mirrors the declarative component: non-throwing, a missing optional
// native module is a no-op, never a crash. Android-only setters are inert on iOS (the iOS
// status bar has no background color and is never translucent in RN's sense).
export const statusBarImperative: IStatusBarImperative = {
  setBarStyle(style, animated = false) {
    dlog('StatusBar.setBarStyle');
    getNativeModule<INativeStatusBarManager>(STATUS_BAR_MANAGER)?.setStyle(style, animated);
  },
  setHidden(hidden, animation = STATIC_HIDE_TRANSITION) {
    dlog('StatusBar.setHidden');
    getNativeModule<INativeStatusBarManager>(STATUS_BAR_MANAGER)?.setHidden(hidden, animation);
  },
  setNetworkActivityIndicatorVisible(visible) {
    dlog('StatusBar.setNetworkActivityIndicatorVisible');
    getNativeModule<INativeStatusBarManager>(
      STATUS_BAR_MANAGER,
    )?.setNetworkActivityIndicatorVisible(visible);
  },
  setBackgroundColor() {
    dlog('StatusBar.setBackgroundColor (ios no-op)');
  },
  setTranslucent() {
    dlog('StatusBar.setTranslucent (ios no-op)');
  },
};

// currentHeight is Android-only; absent on iOS (RN sets it to null on iOS).
export function statusBarCurrentHeight(): number | undefined {
  return undefined;
}
