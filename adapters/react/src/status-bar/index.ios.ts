// StatusBar on iOS: drives the iOS `StatusBarManager` TurboModule from its props
// (and from static methods). The native contract is RN's spec at
// .vendors/react-native/.../src/private/specs_DEPRECATED/modules/NativeStatusBarManagerIOS.js:
//   setStyle(statusBarStyle?: string, animated: boolean)
//   setHidden(hidden: boolean, withAnimation: 'none' | 'fade' | 'slide')
//   setNetworkActivityIndicatorVisible(visible: boolean)
// Only those three setters are mirrored as the hand-written interface, the typed trust
// boundary getNativeModule<T> resolves against. Metro picks this on an iOS host.
//
// The native-call logic stays in the adapter (not the engine): the platform module shape
// diverges iOS/Android and the headless smokes import this file by name (tsx has no
// platform picker, so routing through the engine barrel would resolve the iOS base on every
// platform). The engine owns only the pure shared contract: types, constants, hideTransition.

import { useEffect } from 'react';
import {
  dlog,
  getNativeModule,
  STATUS_BAR_MANAGER,
  STATIC_HIDE_TRANSITION,
  hideTransition,
} from '@symbiote/engine';
import type { IStatusBarAnimation, IStatusBarComponent, IStatusBarStyle } from './shared';
export type { IStatusBarProps, IStatusBarStyle } from './shared';

// The native module typed as the interface this file vouches for: only the setters used.
// The single point that accepts the native shape (no per-call `as`).
interface INativeStatusBarManager {
  setStyle(statusBarStyle: IStatusBarStyle, animated: boolean): void;
  setHidden(hidden: boolean, withAnimation: IStatusBarAnimation): void;
  setNetworkActivityIndicatorVisible(visible: boolean): void;
}

// StatusBar renders null and applies its props to the native module in an effect,
// on mount and on every prop change. Simplification vs RN: RN maintains a
// prop-merge stack so nested StatusBars compose (deepest/last wins). This module
// direct-applies a single component's props, which is correct for one StatusBar.
export const StatusBar: IStatusBarComponent = props => {
  const { barStyle, hidden, animated = false, networkActivityIndicatorVisible } = props;

  useEffect(() => {
    // Resolve lazily inside the effect, not at import, keeps this module importable
    // headless before a fake __turboModuleProxy is installed. Non-enforcing: a
    // declarative StatusBar must NOT crash the whole render if the module can't resolve.
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
  }, [barStyle, hidden, animated, networkActivityIndicatorVisible]);

  return null;
};

// The static API mirrors the declarative component: non-throwing. A missing optional
// native module is a no-op.
StatusBar.setBarStyle = (style, animated = false) => {
  dlog('StatusBar.setBarStyle');
  getNativeModule<INativeStatusBarManager>(STATUS_BAR_MANAGER)?.setStyle(style, animated);
};

StatusBar.setHidden = (hidden, animation = STATIC_HIDE_TRANSITION) => {
  dlog('StatusBar.setHidden');
  getNativeModule<INativeStatusBarManager>(STATUS_BAR_MANAGER)?.setHidden(hidden, animation);
};

StatusBar.setNetworkActivityIndicatorVisible = visible => {
  dlog('StatusBar.setNetworkActivityIndicatorVisible');
  getNativeModule<INativeStatusBarManager>(STATUS_BAR_MANAGER)?.setNetworkActivityIndicatorVisible(
    visible,
  );
};

// Android-only on RN, inert on iOS (the iOS status bar has no background color and
// is never translucent in RN's sense). Present so the contract is platform-uniform.
StatusBar.setBackgroundColor = () => {
  dlog('StatusBar.setBackgroundColor (ios no-op)');
};
StatusBar.setTranslucent = () => {
  dlog('StatusBar.setTranslucent (ios no-op)');
};
// currentHeight is Android-only; absent on iOS (RN sets it to null on iOS).
