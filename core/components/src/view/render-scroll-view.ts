// ScrollView: the render half (framework-agnostic). The Fabric tree is nested: the scroll
// view wraps a content view that holds the children (RN's own ScrollView.js shape). Resolving
// decelerationRate, picking the per-axis intrinsics/base style, reading layout dimensions, and
// the content-size dedupe are all platform- and framework-invariant, so they live here. The
// adapter owns the lifecycle (refs/state/effects) and the element assembly; it calls these pure
// helpers from prepareScrollView. What diverges per platform, and how a RefreshControl
// integrates, stays in the adapter's .ios/.android files.

import { Platform } from '@symbiote-native/engine';
import type { IStyleProp, ISymbioteEvent, IViewStyle } from '@symbiote-native/engine';
import type { ISymbioteIntrinsic } from '../component-names/shared';
import { readLayoutField } from './layout-event';

// Thin re-export kept for the existing public surface (adapters import this name from
// `@symbiote-native/components`); the actual field read is shared with render-scroll-sticky's
// y/height read in layout-event.ts.
export function readLayoutDimension(
  event: ISymbioteEvent,
  key: 'width' | 'height',
): number | undefined {
  return readLayoutField(event, key);
}

// 'normal'/'fast' resolve to DIFFERENT friction constants per platform: RN's
// processDecelerationRate.js Platform.select()s them: iOS glides longer (0.998/0.99),
// Android sooner (0.985/0.9). Hardcoding the iOS pair made Android momentum scroll
// glide far too long on 'fast'. This is the file's one Platform read: the header's
// "no Platform.OS" rule governs component-intrinsic selection, not a value transform
// RN itself platform-branches. `default` mirrors iOS so any non-ios/android host stays
// defined (select would otherwise yield undefined). Numeric rates pass through unchanged.
export function resolveDecelerationRate(rate: 'normal' | 'fast' | number): number {
  if (typeof rate === 'number') return rate;
  // select() types as `number | undefined`; the always-present `default` makes the
  // `??` fallback unreachable, but it narrows the return to a plain `number` (no cast).
  if (rate === 'normal')
    return Platform.select({ ios: 0.998, android: 0.985, default: 0.998 }) ?? 0.998;
  return Platform.select({ ios: 0.99, android: 0.9, default: 0.99 }) ?? 0.99;
}

// RN applies a base style to the scroll-view NODE itself, per axis (ScrollView.js
// styles.baseHorizontal/baseVertical). Two parts carry weight:
//   - `overflow: 'scroll'`: clips content to the scroll view's frame. On iOS Fabric the
//     node only clips when this is set; without it a fixed-height ScrollView lets its
//     content bleed out over siblings (Android's native ViewGroup clips regardless, which
//     is why the bug showed only on iOS). RN sets it on BOTH axes, so we do too.
//   - `flexDirection: 'row'` (horizontal only): makes the single content child a MAIN-axis
//     item, so Yoga sizes it to its content width and the view overflows and scrolls.
//     Without it the content is a CROSS-axis item, stretched to the viewport, nothing to
//     scroll. Vertical keeps the default `column`.
// Both axes match RN's baseHorizontal/baseVertical exactly. Composed UNDER the user style,
// so an explicit value still wins.
export const SCROLL_VIEW_BASE_HORIZONTAL: IViewStyle = {
  flexGrow: 1,
  flexShrink: 1,
  flexDirection: 'row',
  overflow: 'scroll',
};
export const SCROLL_VIEW_BASE_VERTICAL: IViewStyle = {
  flexGrow: 1,
  flexShrink: 1,
  flexDirection: 'column',
  overflow: 'scroll',
};

// The per-axis selection: the outer scroll-view intrinsic and its content intrinsic (the name
// table maps each to the right Fabric component per platform: on Android horizontal resolves
// to a dedicated ViewManager, on iOS both map back to RCTScrollView), the base style for the
// scroll-view node, and the content container's style (contentContainerStyle, plus
// flexDirection:'row' for horizontal so the content lays out along the scroll axis).
export type IScrollIntrinsics = {
  scrollViewIntrinsic: ISymbioteIntrinsic;
  contentIntrinsic: ISymbioteIntrinsic;
  scrollViewBaseStyle: IViewStyle;
  contentStyle: IStyleProp<IViewStyle>;
};

export function selectScrollIntrinsics(
  isHorizontal: boolean,
  contentContainerStyle: IStyleProp<IViewStyle> | undefined,
): IScrollIntrinsics {
  // Horizontal scroll resolves to a different native component on Android (its own
  // ViewManager, not RCTScrollView+flag); on iOS both intrinsics map back to RCTScrollView.
  // The name table does the per-platform mapping; here we only pick the intrinsic.
  const scrollViewIntrinsic: ISymbioteIntrinsic = isHorizontal
    ? 'symbiote-horizontal-scroll-view'
    : 'symbiote-scroll-view';
  const contentIntrinsic: ISymbioteIntrinsic = isHorizontal
    ? 'symbiote-horizontal-scroll-content'
    : 'symbiote-scroll-content';
  const scrollViewBaseStyle = isHorizontal
    ? SCROLL_VIEW_BASE_HORIZONTAL
    : SCROLL_VIEW_BASE_VERTICAL;

  const contentStyle: IStyleProp<IViewStyle> = isHorizontal
    ? [contentContainerStyle, { flexDirection: 'row' }]
    : contentContainerStyle;

  return { scrollViewIntrinsic, contentIntrinsic, scrollViewBaseStyle, contentStyle };
}

// When sticky headers are active the scroll offset must reach the AnimatedValue; RN raises the scroll
// event rate for it (ScrollView.js:1798): throttle 1 on the native driver (it can afford every frame),
// 16 on the JS fallback (Animated.event drives the value in JS). Without sticky headers the user's
// throttle passes through untouched. These two magic numbers were copied into all three adapters.
const STICKY_NATIVE_SCROLL_THROTTLE = 1;
const STICKY_JS_SCROLL_THROTTLE = 16;

// Which onScroll path the adapter builds: `plain` forwards the user handler untouched; `sticky-native`
// forwards the user handler while the native driver attaches the scroll value on the UI thread;
// `sticky-js` wraps the user handler in an Animated.event that drives the value each JS frame.
export type IScrollForwardMode = 'plain' | 'sticky-native' | 'sticky-js';

export interface IScrollForwardingInputs {
  hasStickyHeaders: boolean;
  // hasStickyHeaders && isNativeAnimatedAvailable(), computed by the adapter (the engine check is an
  // adapter call), passed in so this stays pure.
  nativeStickyAvailable: boolean;
  invertStickyHeaders: boolean | undefined;
  scrollEventThrottle: number | undefined;
  // Presence-checked only (unknown so every adapter's raw prop/attr shape passes with no cast).
  maintainVisibleContentPosition: unknown;
  snapToAlignment: unknown;
}

// The scroll-forwarding DECISIONS, framework-invariant, folded out of each adapter's onScroll/onLayout
// branch: which onScroll path to build, the resolved scrollEventThrottle (the 1/16 defaults),
// whether to wrap onLayout to capture the viewport height (inverted sticky need it, RN _handleLayout),
// and whether to keep the content cells un-flattened (collapsableChildren=false for MVCP / snap).
// It returns DECISIONS, not built handlers, on purpose: the actual onScroll/onLayout functions must be
// framework-owned — Angular caches them by identity to dodge a jsonEqual re-clone cascade (a fresh
// closure each change-detection pass forces a Fabric re-clone up every ancestor), while React/Vue
// allocate them fresh each render. A shared helper that returned freshly-built handlers would regress
// Angular, so the branch VALUES are shared here and the handler EXECUTION stays per-adapter.
export interface IScrollForwarding {
  mode: IScrollForwardMode;
  scrollEventThrottle: number | undefined;
  capturesViewportHeight: boolean;
  collapsableChildren: boolean;
}

export function resolveScrollForwarding(inputs: IScrollForwardingInputs): IScrollForwarding {
  // maintainVisibleContentPosition (and Android snapToAlignment) anchor against MOUNTED cell views;
  // Android Fabric view-flattens layout-only cells away, so RN keeps them as real views with
  // collapsableChildren={false} on the content container (ScrollView.js preserveChildren). No-op on iOS.
  const collapsableChildren =
    inputs.maintainVisibleContentPosition !== undefined || inputs.snapToAlignment !== undefined;
  if (!inputs.hasStickyHeaders) {
    return {
      mode: 'plain',
      scrollEventThrottle: inputs.scrollEventThrottle,
      capturesViewportHeight: false,
      collapsableChildren,
    };
  }
  const capturesViewportHeight = inputs.invertStickyHeaders === true;
  if (inputs.nativeStickyAvailable) {
    return {
      mode: 'sticky-native',
      scrollEventThrottle: inputs.scrollEventThrottle ?? STICKY_NATIVE_SCROLL_THROTTLE,
      capturesViewportHeight,
      collapsableChildren,
    };
  }
  return {
    mode: 'sticky-js',
    scrollEventThrottle: inputs.scrollEventThrottle ?? STICKY_JS_SCROLL_THROTTLE,
    capturesViewportHeight,
    collapsableChildren,
  };
}

// The last-seen content size, kept by the adapter (in a ref) to dedupe onContentSizeChange.
export type IContentSize = { width: number; height: number };

// Did the content view's measured size actually change since the last fire? RN synthesizes
// onContentSizeChange from the inner content view's onLayout, but that fires on every layout
// pass; RN dedupes so the user handler only sees real size changes (ScrollView.js). First
// measurement (last === null) always counts as a change.
export function didContentSizeChange(last: IContentSize | null, next: IContentSize): boolean {
  if (last === null) return true;
  return last.width !== next.width || last.height !== next.height;
}
