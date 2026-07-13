// StatusBar on iOS: the declarative React half only. The native `StatusBarManager`
// TurboModule driving (applyStatusBarProps), the imperative statics (statusBarImperative),
// and the iOS currentHeight stub all live in @symbiote-native/engine, shared verbatim with
// every adapter (Vue's status-bar.ts, Angular's status-bar.ts drive the exact same functions).
// This file supplies only what's React-specific: an FC that renders null and re-applies props
// via useEffect on mount + every prop change, with the imperative statics attached to the
// function object, exactly like RN's own StatusBar.
//
// Metro picks this file on an iOS host; the headless/tsx base (status-bar/index.ts) re-exports
// it, which is also what a bare '@symbiote-native/engine' import resolves to under vitest — so
// this file's own engine import is already vitest-correct, no platform-selection subtlety here.

import { useEffect, type FC } from 'react';
import { applyStatusBarProps, statusBarImperative } from '@symbiote-native/engine';
import type { IStatusBarComponent, IStatusBarProps } from './shared';
export type { IStatusBarProps, IStatusBarStyle } from './shared';

// StatusBar renders null and applies its props to the native module in an effect,
// on mount and on every prop change. Simplification vs RN: RN maintains a
// prop-merge stack so nested StatusBars compose (deepest/last wins). This module
// direct-applies a single component's props, which is correct for one StatusBar.
const StatusBarComponent: FC<IStatusBarProps> = props => {
  const { barStyle, hidden, animated, networkActivityIndicatorVisible } = props;

  useEffect(() => {
    applyStatusBarProps(props);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are the primitive fields, not `props` itself, so an unchanged prop shape doesn't re-fire.
  }, [barStyle, hidden, animated, networkActivityIndicatorVisible]);

  return null;
};

// The imperative statics mirror the declarative component: non-throwing, a missing optional
// native module is a no-op. currentHeight is Android-only; absent on iOS (RN sets it to null
// on iOS), so it's intentionally not attached here.
export const StatusBar: IStatusBarComponent = Object.assign(
  StatusBarComponent,
  statusBarImperative,
);
