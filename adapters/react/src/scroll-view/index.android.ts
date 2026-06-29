// ScrollView on Android: an Android ScrollView accepts only ONE child, so a RefreshControl
// can't be a sibling of the content the way iOS allows ("addViewAt: failed to insert view
// ... at index 1"). Instead the RefreshControl (AndroidSwipeRefreshLayout) WRAPS the
// scroll view, with the scroll view nested inside and nestedScrollEnabled so the inner
// scroll handles the gesture before the refresh parent, which mirrors RN's ScrollView.js
// android branch (cloneElement(refreshControl, {style}, <ScrollView nestedScrollEnabled
// style={flex:1}>{content}</ScrollView>)). Metro picks this on an Android host; no
// Platform.OS read. See ADR 0020.
// device-verify-pending: the wrap shape mirrors RN, proven on a real host by the absence
// of the "addViewAt: failed to insert" crash.

import { cloneElement, createElement, forwardRef, useImperativeHandle, useRef } from 'react';
import { dlog, type ISymbioteNode } from '@symbiote/engine';
import { buildScrollViewHandle, splitLayoutProps } from '@symbiote/components';
import {
  usePreparedScrollView,
  useNativeStickyScrollAttach,
  type IScrollViewHandle,
  type IScrollViewProps,
} from './shared';
export type { IScrollViewProps, IScrollViewHandle } from './shared';

export const ScrollView = forwardRef<IScrollViewHandle, IScrollViewProps>((props, forwardedRef) => {
  const {
    scrollViewIntrinsic,
    scrollViewBaseStyle,
    outerProps,
    style,
    content,
    refreshControl,
    scrollAnimatedValue,
    nativeStickyAvailable,
  } = usePreparedScrollView(props);
  // The node ref backs the imperative handle; it attaches to the inner scroll-view element
  // (the wrap shape leaves the scroll view as the command target, not the RefreshControl).
  const ref = useRef<ISymbioteNode | null>(null);
  // Lazy getter, not the ref itself: the node is null until the element commits, so the handle
  // must read ref.current on each command (ADR 0024 §3), an eager capture would freeze null.
  useImperativeHandle(forwardedRef, () => buildScrollViewHandle(() => ref.current), []);
  // Drive the sticky scroll value on the native UI thread (RN attachNativeEvent). No-op on a
  // host without the native animated module. The JS sticky path stays in effect.
  useNativeStickyScrollAttach(ref, scrollAnimatedValue, nativeStickyAvailable);
  dlog(
    'ScrollView.ANDROID refreshControl=' + (refreshControl === undefined ? 'NONE(1child)' : 'WRAP'),
  );

  if (refreshControl === undefined) {
    // Base style (flexDirection: row for horizontal) under user style; undefined base
    // (vertical) passes the user style through unchanged.
    const scrollStyle = scrollViewBaseStyle ? [scrollViewBaseStyle, style] : style;
    return createElement(scrollViewIntrinsic, { ...outerProps, style: scrollStyle, ref }, content);
  }

  // RN splits the flattened style across the two boxes (ScrollView.js android branch):
  // LAYOUT props (margin/flex/size/position/transform/gap/…) drive the outer
  // AndroidSwipeRefreshLayout frame; VISUAL props (background/padding/border/opacity/…) paint
  // the inner scroll view. So the wrapper carries `outer`, and the inner scroll view its base
  // (flexDirection/overflow) plus the visual `inner` composed over it, NOT a hardcoded flex:1
  // that would override an explicit user height/width.
  const { outer: outerStyle, inner: innerStyle } = splitLayoutProps(style);
  const scrollStyle = scrollViewBaseStyle ? [scrollViewBaseStyle, innerStyle] : innerStyle;
  const scrollView = createElement(
    scrollViewIntrinsic,
    { ...outerProps, style: scrollStyle, nestedScrollEnabled: true, ref },
    content,
  );
  return cloneElement(refreshControl, { style: outerStyle }, scrollView);
});

ScrollView.displayName = 'ScrollView';
