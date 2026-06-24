// ScrollView on iOS: the RefreshControl is a CHILD of the scroll view, rendered as a
// sibling BEFORE the content container (RN ScrollView.js: {refreshControl}{contentContainer}).
// Also the base (scroll-view.ts re-exports it) for headless / web. See ADR 0020.

import { createElement, forwardRef, useImperativeHandle, useRef } from 'react'
import type { SymbioteNode } from '@symbiote/shared'
import {
  buildScrollViewHandle,
  prepareScrollView,
  type ScrollViewHandle,
  type ScrollViewProps,
} from './scroll-view-shared'
export type { ScrollViewProps, ScrollViewHandle } from './scroll-view-shared'

export const ScrollView = forwardRef<ScrollViewHandle, ScrollViewProps>((props, forwardedRef) => {
  const { scrollViewIntrinsic, scrollViewBaseStyle, outerProps, style, content, refreshControl } =
    prepareScrollView(props)
  // The node ref backs the imperative handle; it attaches to the scroll-view element below
  // (passing `ref` through createElement props binds it to the SymbioteNode, as TextInput does).
  const ref = useRef<SymbioteNode | null>(null)
  useImperativeHandle(forwardedRef, () => buildScrollViewHandle(ref), [])

  // Base style under user style so an explicit user value wins; undefined base (vertical)
  // passes the user style through unchanged.
  const scrollStyle = scrollViewBaseStyle ? { ...scrollViewBaseStyle, ...style } : style
  const scrollProps = { ...outerProps, style: scrollStyle, ref }

  if (refreshControl === undefined) {
    return createElement(scrollViewIntrinsic, scrollProps, content)
  }
  return createElement(scrollViewIntrinsic, scrollProps, refreshControl, content)
})

ScrollView.displayName = 'ScrollView'
