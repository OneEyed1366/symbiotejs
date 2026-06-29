// ScrollView on iOS: the RefreshControl is a CHILD of the scroll view, rendered as a
// sibling BEFORE the content container (RN ScrollView.js: {refreshControl}{contentContainer}).
// Also the base (scroll-view.ts re-exports it) for headless / web. See ADR 0020.

import { createElement, forwardRef, useImperativeHandle, useRef } from 'react';
import type { ISymbioteNode } from '@symbiote/engine';
import { buildScrollViewHandle } from '@symbiote/components';
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
  // The node ref backs the imperative handle; it attaches to the scroll-view element below
  // (passing `ref` through createElement props binds it to the SymbioteNode, as TextInput does).
  const ref = useRef<ISymbioteNode | null>(null);
  // Lazy getter, not the ref itself: the node is null until the element commits, so the handle
  // must read ref.current on each command (ADR 0024 §3), an eager capture would freeze null.
  useImperativeHandle(forwardedRef, () => buildScrollViewHandle(() => ref.current), []);
  // Drive the sticky scroll value on the native UI thread (RN attachNativeEvent). No-op on a
  // host without the native animated module. The JS sticky path stays in effect.
  useNativeStickyScrollAttach(ref, scrollAnimatedValue, nativeStickyAvailable);

  // Base style under user style so an explicit user value wins; undefined base (vertical)
  // passes the user style through unchanged.
  const scrollStyle = scrollViewBaseStyle ? [scrollViewBaseStyle, style] : style;
  const scrollProps = { ...outerProps, style: scrollStyle, ref };

  if (refreshControl === undefined) {
    return createElement(scrollViewIntrinsic, scrollProps, content);
  }
  return createElement(scrollViewIntrinsic, scrollProps, refreshControl, content);
});

ScrollView.displayName = 'ScrollView';
