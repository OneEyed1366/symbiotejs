// ScrollView primitive. The Fabric tree is nested: RCTScrollView wraps an
// RCTScrollContentView that holds the actual children. This component renders
// that nesting in JS (exactly as RN's own ScrollView.js does), so the rest of the
// stack only ever sees the two host intrinsics the host config already maps.
//
// Two props are translated here, not passed through native: contentContainerStyle
// becomes the inner content node's style, and `horizontal` injects
// flexDirection:'row' into that same style (on iOS horizontal is realized by the
// content's main axis, not a native bool). decelerationRate's string aliases map
// to their float values before they reach native.

import { createElement, type FC, type ReactNode } from 'react'
import { dlog, type SymbioteEvent } from '@symbiote/shared'
import type { ViewStyle } from './styles'

type ScrollHandler = (event: SymbioteEvent) => void

const DECELERATION_RATE: Readonly<Record<string, number>> = {
  normal: 0.998,
  fast: 0.99,
}

export interface ScrollViewProps {
  style?: ViewStyle
  contentContainerStyle?: ViewStyle
  horizontal?: boolean
  scrollEnabled?: boolean
  showsVerticalScrollIndicator?: boolean
  showsHorizontalScrollIndicator?: boolean
  pagingEnabled?: boolean
  bounces?: boolean
  decelerationRate?: 'normal' | 'fast' | number
  scrollEventThrottle?: number
  contentInset?: { top?: number; left?: number; bottom?: number; right?: number }
  contentOffset?: { x: number; y: number }
  onScroll?: ScrollHandler
  onScrollBeginDrag?: ScrollHandler
  onScrollEndDrag?: ScrollHandler
  onMomentumScrollBegin?: ScrollHandler
  onMomentumScrollEnd?: ScrollHandler
  children?: ReactNode
}

function resolveDecelerationRate(rate: 'normal' | 'fast' | number): number {
  if (typeof rate === 'number') return rate
  return DECELERATION_RATE[rate]
}

export const ScrollView: FC<ScrollViewProps> = (props) => {
  const {
    style,
    contentContainerStyle,
    horizontal,
    decelerationRate,
    children,
    ...outer
  } = props

  const contentStyle: ViewStyle = { ...contentContainerStyle }
  if (horizontal === true) contentStyle.flexDirection = 'row'

  const outerProps: Record<string, unknown> = { ...outer, style }
  if (decelerationRate !== undefined) {
    outerProps.decelerationRate = resolveDecelerationRate(decelerationRate)
  }

  dlog('ScrollView -> RCTScrollView(RCTScrollContentView)')

  return createElement(
    'symbiote-scroll-view',
    outerProps,
    createElement('symbiote-scroll-content', { style: contentStyle }, children),
  )
}
