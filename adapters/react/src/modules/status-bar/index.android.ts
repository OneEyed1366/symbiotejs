// StatusBar on Android: the declarative React half only. The native StatusBarManager driving
// (applyStatusBarProps), the imperative statics (statusBarImperative), and the Android
// currentHeight getter (statusBarCurrentHeight) all live in @symbiote-native/engine, shared
// verbatim with every adapter (Vue's status-bar.ts, Angular's status-bar.ts drive the exact
// same functions). This file supplies only what's React-specific: an FC that renders null and
// re-applies props via useEffect on mount + every prop change, with the imperative statics
// attached to the function object, exactly like RN's own StatusBar.
//
// Metro picks this file on an Android host, resolving '@symbiote-native/engine's relative
// './status-bar' import to its own index.android.ts in turn (Android's native module is a
// DIFFERENT shape from iOS — single-arg setHidden(hidden)/setStyle(style) plus
// setColor/setTranslucent — all handled inside that engine module, not here).

import { useEffect, type FC } from 'react';
import {
  applyStatusBarProps,
  statusBarImperative,
  statusBarCurrentHeight,
} from '@symbiote-native/engine';
import type { IStatusBarComponent, IStatusBarProps } from './shared';
export type { IStatusBarProps, IStatusBarStyle } from './shared';

// Renders null and applies its props to the native module in an effect, on mount and on
// every prop change, same contract as iOS.
const StatusBarAndroidComponent: FC<IStatusBarProps> = props => {
  const { barStyle, hidden, animated, backgroundColor, translucent } = props;

  useEffect(() => {
    applyStatusBarProps(props);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are the primitive fields, not `props` itself, so an unchanged prop shape doesn't re-fire.
  }, [barStyle, hidden, animated, backgroundColor, translucent]);

  return null;
};

const StatusBarAndroid = Object.assign(StatusBarAndroidComponent, statusBarImperative);

// Android exposes the bar height as a native constant; undefined if the module or the
// constant is absent. Read lazily (getter, not a value) so nothing touches native at import
// time — the engine's Android impl resolves it on access.
Object.defineProperty(StatusBarAndroid, 'currentHeight', {
  get: statusBarCurrentHeight,
  enumerable: true,
});

export const StatusBar: IStatusBarComponent = StatusBarAndroid;
