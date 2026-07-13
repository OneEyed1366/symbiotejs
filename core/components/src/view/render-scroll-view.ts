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
