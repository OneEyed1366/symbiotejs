// StatusBar on Android: drives the Android StatusBarManager from props (and from the
// static methods). Android's native module is a DIFFERENT shape from iOS: single-arg
// setHidden(hidden) / setStyle(style) plus setColor/setTranslucent, same module name
// ('StatusBarManager'). Metro picks this on an Android host; iOS keeps its own shape.
//
// The native-call logic stays in the adapter (not the engine): the platform module shape
// diverges iOS/Android and the headless smokes import this file by name (tsx has no platform
// picker, so routing through the engine barrel would resolve the iOS base on every platform).
// The engine owns only the pure shared contract: types, constants, hideTransition.
//
// History: this used to be a no-op. Driving the window flags from the bridgeless surface
// blanked the app: a status-bar relayout triggered stopSurface, which threw "Global was
// not installed" because RN installs global.RN$stopSurface from its own renderer, which this
// renderer replaces. Now that render.ts installs RN$stopSurface and tears surfaces down cleanly, the
// relayout survives and the bar updates without blanking (verified on device: show/hide +
// light/dark text). See render.ts installStopSurfaceGlobal + native-module-platform-routing.

import { useEffect } from 'react';
import {
  dlog,
  getNativeModule,
  processColor,
  STATUS_BAR_MANAGER,
  type IColorValue,
} from '@symbiote/engine';
import type { IStatusBarComponent } from './shared';
export type { IStatusBarProps, IStatusBarStyle } from './shared';

// The native module typed as the interface this file vouches for: only the Android setters
// called here. Single point that accepts the native shape (no per-call `as`). setColor takes a
// processed platform color int; getConstants().HEIGHT is the status-bar height (dp).
interface INativeStatusBarManagerAndroid {
  setHidden(hidden: boolean): void;
  setStyle(statusBarStyle?: string): void;
  setColor(color: number, animated: boolean): void;
  setTranslucent(translucent: boolean): void;
  getConstants?(): { HEIGHT?: number };
}

// processColor returns `unknown` (its result is platform-dependent); narrow to the
// number Fabric/native expects, like RN's invariant before setColor. A non-number
// (null for an unparseable color, headless identity passthrough of a string) is dropped.
function applyBackgroundColor(
  manager: INativeStatusBarManagerAndroid,
  color: IColorValue,
  animated: boolean,
): void {
  const processed = processColor(color);
  if (typeof processed !== 'number') {
    dlog(
      `StatusBar android: backgroundColor ${String(color)} did not process to an int — skipping`,
    );
    return;
  }
  // RISK: driving the window background flag once blanked the bridgeless surface
  // (see header). Routed cleanly here but DEVICE-VERIFY-PENDING.
  dlog(`StatusBar android setColor -> ${processed} animated=${animated}`);
  manager.setColor(processed, animated);
}

// Renders null and applies its props to the native module in an effect, on mount and on
// every prop change, same contract as iOS, with the single-arg Android setters.
const StatusBarAndroid: IStatusBarComponent = props => {
  const { barStyle, hidden, animated = false, backgroundColor, translucent } = props;

  useEffect(() => {
    const manager = getNativeModule<INativeStatusBarManagerAndroid>(STATUS_BAR_MANAGER);
    if (manager === null) {
      dlog('StatusBar android: StatusBarManager not resolvable — skipping');
      return;
    }
    dlog(
      `StatusBar android -> barStyle=${barStyle} hidden=${hidden} translucent=${translucent} bg=${String(backgroundColor)}`,
    );
    if (barStyle !== undefined) manager.setStyle(barStyle);
    if (hidden !== undefined) manager.setHidden(hidden);
    if (translucent !== undefined) manager.setTranslucent(translucent);
    if (backgroundColor !== undefined) applyBackgroundColor(manager, backgroundColor, animated);
  }, [barStyle, hidden, animated, backgroundColor, translucent]);

  return null;
};

StatusBarAndroid.setBarStyle = style => {
  dlog(`StatusBar.setBarStyle android ${style}`);
  getNativeModule<INativeStatusBarManagerAndroid>(STATUS_BAR_MANAGER)?.setStyle(style);
};
StatusBarAndroid.setHidden = hidden => {
  dlog(`StatusBar.setHidden android ${hidden}`);
  getNativeModule<INativeStatusBarManagerAndroid>(STATUS_BAR_MANAGER)?.setHidden(hidden);
};
StatusBarAndroid.setNetworkActivityIndicatorVisible = () => {
  // No Android equivalent, an iOS-only concept.
  dlog('StatusBar.setNetworkActivityIndicatorVisible (android no-op)');
};
StatusBarAndroid.setBackgroundColor = (color, animated = false) => {
  dlog(`StatusBar.setBackgroundColor android ${String(color)}`);
  const manager = getNativeModule<INativeStatusBarManagerAndroid>(STATUS_BAR_MANAGER);
  if (manager === null) return;
  applyBackgroundColor(manager, color, animated);
};
StatusBarAndroid.setTranslucent = translucent => {
  // RISK: window translucent flag is device-verify-pending (may blank the surface).
  dlog(`StatusBar.setTranslucent android ${translucent}`);
  getNativeModule<INativeStatusBarManagerAndroid>(STATUS_BAR_MANAGER)?.setTranslucent(translucent);
};

// Android exposes the bar height as a native constant; undefined if the module or the
// constant is absent (older RN, or a fake that doesn't define getConstants). Read lazily
// (getter, not a value) so nothing touches native at import time.
Object.defineProperty(StatusBarAndroid, 'currentHeight', {
  get(): number | undefined {
    return getNativeModule<INativeStatusBarManagerAndroid>(STATUS_BAR_MANAGER)?.getConstants?.()
      .HEIGHT;
  },
  enumerable: true,
});

export const StatusBar = StatusBarAndroid;
