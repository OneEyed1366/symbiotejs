// StatusBar, the Vue lifecycle half. The native StatusBarManager driving (applyStatusBarProps),
// the imperative statics (statusBarImperative), and the Android bar-height constant all live in
// @symbiotejs/engine, shared verbatim with React; Metro selects the engine's status-bar.ios.ts /
// status-bar.android.ts per host, so the platform divergence never reaches this file. Vue supplies
// only the declarative shape: a component that renders NOTHING and re-applies the props through a
// watchEffect on mount + every prop change, with the imperative statics attached to the component
// object (RN's StatusBar: the value doubles as the imperative namespace, like the Vue Image).
//
// Renders null (no Fabric view), so it follows neither the descriptor split nor a host-node ref:
// the "else keep its current shape" path of the StatusBar component. Inputs arrive as attrs
// (untyped) and run through normalizeVueAttrs (kebab→camel) before each is narrowed by a guard.

import { defineComponent, watchEffect, type SetupContext } from '@vue/runtime-core';
import {
  applyStatusBarProps,
  statusBarImperative,
  statusBarCurrentHeight,
  isOpaqueColorValue,
  type IColorValue,
  type IStatusBarProps,
  type IStatusBarStyle,
} from '@symbiotejs/engine';
export type { IStatusBarProps, IStatusBarStyle } from '@symbiotejs/engine';
import { normalizeVueAttrs } from '../utils/normalize-attrs';

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function asBarStyle(value: unknown): IStatusBarStyle | undefined {
  return value === 'default' || value === 'light-content' || value === 'dark-content'
    ? value
    : undefined;
}

// backgroundColor is a string / int / opaque PlatformColor; any other shape is dropped. A runtime
// guard at the untyped-attrs boundary, not a cast.
function asColorValue(value: unknown): IColorValue | undefined {
  if (typeof value === 'string') return value;
  if (isOpaqueColorValue(value)) return value;
  return undefined;
}

function buildProps(attrs: Record<string, unknown>): IStatusBarProps {
  return {
    barStyle: asBarStyle(attrs.barStyle),
    hidden: asBoolean(attrs.hidden),
    animated: asBoolean(attrs.animated),
    networkActivityIndicatorVisible: asBoolean(attrs.networkActivityIndicatorVisible),
    backgroundColor: asColorValue(attrs.backgroundColor),
    translucent: asBoolean(attrs.translucent),
  };
}

const StatusBarComponent = defineComponent({
  name: 'StatusBar',
  inheritAttrs: false,
  setup(_props, { attrs: rawAttrs }: SetupContext) {
    // watchEffect tracks rawAttrs (reactive), so reading it here re-applies on every prop change:
    // the Vue twin of React's useEffect over the prop deps. Resolution is lazy inside the engine
    // (a missing StatusBarManager is a no-op), so this never crashes a render.
    watchEffect(() => {
      applyStatusBarProps(buildProps(normalizeVueAttrs(rawAttrs)));
    });
    // Renders nothing: StatusBar has no Fabric view, exactly like React's `return null`.
    return () => null;
  },
});

const StatusBarWithStatics = Object.assign(StatusBarComponent, statusBarImperative);

// Android exposes the bar height as a native constant; undefined on iOS / when absent. Read lazily
// (getter) so nothing touches native at import time; the Android engine impl resolves on access.
Object.defineProperty(StatusBarWithStatics, 'currentHeight', {
  get: statusBarCurrentHeight,
  enumerable: true,
});

// currentHeight is optional, so the defineProperty-added accessor doesn't need to appear on the
// runtime object's inferred type for this assignment to hold (no cast).
export const StatusBar: typeof StatusBarWithStatics & { readonly currentHeight?: number } =
  StatusBarWithStatics;
