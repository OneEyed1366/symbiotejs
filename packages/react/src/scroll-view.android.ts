// ScrollView on Android: an Android ScrollView accepts only ONE child, so a RefreshControl
// can't be a sibling of the content the way iOS allows ("addViewAt: failed to insert view
// ... at index 1"). Instead the RefreshControl (AndroidSwipeRefreshLayout) WRAPS the
// scroll view, with the scroll view nested inside and nestedScrollEnabled so the inner
// scroll handles the gesture before the refresh parent — mirroring RN's ScrollView.js
// android branch (cloneElement(refreshControl, {style}, <ScrollView nestedScrollEnabled
// style={flex:1}>{content}</ScrollView>)). Metro picks this on an Android host; no
// Platform.OS read. See ADR 0020.
// device-verify-pending: the wrap shape mirrors RN, proven on a real host by the absence
// of the "addViewAt: failed to insert" crash.

import { cloneElement, createElement, forwardRef, useImperativeHandle, useRef } from 'react'
import { dlog, type SymbioteNode } from '@symbiote/shared'
import {
  buildScrollViewHandle,
  prepareScrollView,
  type ScrollViewHandle,
  type ScrollViewProps,
} from './scroll-view-shared'
export type { ScrollViewProps, ScrollViewHandle } from './scroll-view-shared'

// The scroll view fills its RefreshControl wrapper; the layout style moved to the wrapper.
const INNER_FILL_STYLE = { flex: 1 }

export const ScrollView = forwardRef<ScrollViewHandle, ScrollViewProps>((props, forwardedRef) => {
  const { scrollViewIntrinsic, scrollViewBaseStyle, outerProps, style, content, refreshControl } =
    prepareScrollView(props)
  // The node ref backs the imperative handle; it attaches to the inner scroll-view element
  // (the wrap shape leaves the scroll view as the command target, not the RefreshControl).
  const ref = useRef<SymbioteNode | null>(null)
  useImperativeHandle(forwardedRef, () => buildScrollViewHandle(ref), [])
  dlog('ScrollView.ANDROID refreshControl=' + (refreshControl === undefined ? 'NONE(1child)' : 'WRAP'))

  if (refreshControl === undefined) {
    // Base style (flexDirection: row for horizontal) under user style; undefined base
    // (vertical) passes the user style through unchanged.
    const scrollStyle = scrollViewBaseStyle ? { ...scrollViewBaseStyle, ...style } : style
    return createElement(scrollViewIntrinsic, { ...outerProps, style: scrollStyle, ref }, content)
  }

  // The style goes on the outer RefreshControl (the laid-out box); the inner scroll view
  // fills it. RN splits layout vs visual style across the two; placing the full style on
  // the wrapper plus flex:1 inside is the close-enough shape that keeps the background and
  // sizing correct for the common case. The scroll view still needs its base (flexDirection)
  // to size content along the scroll axis, so compose it under the fill style.
  const innerStyle = scrollViewBaseStyle
    ? { ...scrollViewBaseStyle, ...INNER_FILL_STYLE }
    : INNER_FILL_STYLE
  const scrollView = createElement(
    scrollViewIntrinsic,
    { ...outerProps, style: innerStyle, nestedScrollEnabled: true, ref },
    content,
  )
  return cloneElement(refreshControl, { style }, scrollView)
})

ScrollView.displayName = 'ScrollView'
