// ScrollView — shared core. The Fabric tree is nested: the scroll view wraps a content
// view that holds the children (RN's own ScrollView.js shape). Building that content
// node, resolving decelerationRate, and the prop plumbing are platform-invariant and
// live here. What diverges (ADR 0020) is how a RefreshControl integrates: on iOS it is a
// CHILD of the scroll view (sibling of the content), on Android it WRAPS the scroll view
// (AndroidSwipeRefreshLayout is the parent, ScrollView nested inside). So the .ios/.android
// files assemble the final element; the filename selects, no Platform.OS read.

import { createElement, type ReactElement, type ReactNode, type RefObject } from 'react'
import { dispatchViewCommand, dlog, type SymbioteEvent, type SymbioteNode } from '@symbiote/shared'
import { resolveAccessibilityProps, type AccessibilityProps, type AriaProps } from './accessibility-props'
import type { SymbioteIntrinsic } from './component-names-shared'
import type { ViewStyle } from './styles'

type ScrollHandler = (event: SymbioteEvent) => void

const DECELERATION_RATE: Readonly<Record<string, number>> = {
  normal: 0.998,
  fast: 0.99,
}

// The imperative API RN exposes on a ScrollView ref. Each method drives a native
// view command on the scroll-view node (RN ScrollViewCommands): scrollTo carries
// [x, y, animated], scrollToEnd [animated], flashScrollIndicators no args. The
// platform files wrap the component in forwardRef and back this with the scroll node.
export interface ScrollViewHandle {
  scrollTo(options?: { x?: number; y?: number; animated?: boolean }): void
  scrollToEnd(options?: { animated?: boolean }): void
  flashScrollIndicators(): void
}

export interface ScrollViewProps extends AccessibilityProps, AriaProps {
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
  refreshControl?: ReactElement<ClonableRefreshControl>
  removeClippedSubviews?: boolean
  // Snap / paging family — forwarded to the native scroll view via ...rest; the native
  // ViewManager reads them directly, no extra JS wiring (RN ScrollView passes the same
  // props straight through to RCTScrollView / the Android manager).
  snapToInterval?: number
  snapToOffsets?: number[]
  snapToAlignment?: 'start' | 'center' | 'end'
  snapToStart?: boolean
  snapToEnd?: boolean
  disableIntervalMomentum?: boolean
  // Sticky headers and keyboard interaction — native reads these directly.
  stickyHeaderIndices?: number[]
  keyboardDismissMode?: 'none' | 'on-drag' | 'interactive'
  keyboardShouldPersistTaps?: boolean | 'always' | 'never' | 'handled'
  maintainVisibleContentPosition?: {
    minIndexForVisible: number
    autoscrollToTopThreshold?: number
  }
  // iOS-only forwarding props. Harmless on Android (its manager ignores unknown props);
  // the iOS RCTScrollView reads them directly off the shadow node.
  alwaysBounceHorizontal?: boolean
  alwaysBounceVertical?: boolean
  centerContent?: boolean
  scrollIndicatorInsets?: { top?: number; left?: number; bottom?: number; right?: number }
  indicatorStyle?: 'default' | 'black' | 'white'
  directionalLockEnabled?: boolean
  automaticallyAdjustKeyboardInsets?: boolean
  contentInsetAdjustmentBehavior?: 'automatic' | 'scrollableAxes' | 'never' | 'always'
  minimumZoomScale?: number
  maximumZoomScale?: number
  zoomScale?: number
  bouncesZoom?: boolean
  pinchGestureEnabled?: boolean
  // Android-only forwarding props. Harmless on iOS; the Android manager reads them.
  nestedScrollEnabled?: boolean
  overScrollMode?: 'auto' | 'always' | 'never'
  fadingEdgeLength?: number
  persistentScrollbar?: boolean
  endFillColor?: string
  onScroll?: ScrollHandler
  onScrollBeginDrag?: ScrollHandler
  onScrollEndDrag?: ScrollHandler
  onMomentumScrollBegin?: ScrollHandler
  onMomentumScrollEnd?: ScrollHandler
  // iOS-only: user tapped the status bar to scroll to top. Inert on Android.
  onScrollToTop?: ScrollHandler
  children?: ReactNode
}

function resolveDecelerationRate(rate: 'normal' | 'fast' | number): number {
  if (typeof rate === 'number') return rate
  return DECELERATION_RATE[rate]
}

// RN applies a base style to the scroll-view NODE itself, per axis (ScrollView.js
// styles.baseHorizontal/baseVertical). For horizontal, `flexDirection: 'row'` is
// load-bearing: it makes the single content child a MAIN-axis item, so Yoga sizes it to
// its content width (the sum of the row's children) and the view overflows and scrolls.
// Without it the scroll view defaults to `column`, the content child is a CROSS-axis item,
// and its width is stretched/clamped to the viewport — leaving nothing to scroll. Vertical
// gets the equivalent for free (column is the default direction), so only the horizontal
// base is needed here.
const SCROLL_VIEW_BASE_HORIZONTAL: ViewStyle = {
  flexGrow: 1,
  flexShrink: 1,
  flexDirection: 'row',
  overflow: 'scroll',
}

// The shape the Android build clones onto a RefreshControl when wrapping the scroll view:
// a layout style and the scroll view as its single child. Typed so cloneElement accepts
// the added props without a cast; any RefreshControl element (its own props are a
// superset) satisfies it.
export interface ClonableRefreshControl {
  style?: ViewStyle
  children?: ReactNode
}

// The platform-invariant pieces: the outer scroll-view intrinsic (vertical vs horizontal,
// which the name table maps to the right Fabric component per platform), its outer props
// (minus style, placed differently per platform), its style, and the built content node.
// The .ios/.android files take these and assemble the final element with their
// RefreshControl wiring.
export interface PreparedScrollView {
  scrollViewIntrinsic: SymbioteIntrinsic
  // The base style for the scroll-view NODE (flexDirection etc.) — set for horizontal,
  // undefined for vertical. The platform files compose it UNDER the user style so an
  // explicit user flexDirection/height still wins.
  scrollViewBaseStyle: ViewStyle | undefined
  outerProps: Record<string, unknown>
  style: ViewStyle | undefined
  content: ReactElement
  refreshControl: ReactElement<ClonableRefreshControl> | undefined
}

export function prepareScrollView(rawProps: ScrollViewProps): PreparedScrollView {
  // ScrollView forwards its outer props straight to the native scroll view (not a View
  // wrapper), so it folds aria/role into accessibility* here before forwarding.
  const props = resolveAccessibilityProps(rawProps)
  const {
    style,
    contentContainerStyle,
    horizontal,
    decelerationRate,
    refreshControl,
    children,
    ...outer
  } = props

  const isHorizontal = horizontal === true

  // Horizontal scroll resolves to a different native component on Android (its own
  // ViewManager, not RCTScrollView+flag); on iOS both intrinsics map back to RCTScrollView.
  // The name table does the per-platform mapping — here we only pick the intrinsic.
  const scrollViewIntrinsic: SymbioteIntrinsic = isHorizontal
    ? 'symbiote-horizontal-scroll-view'
    : 'symbiote-scroll-view'
  const contentIntrinsic: SymbioteIntrinsic = isHorizontal
    ? 'symbiote-horizontal-scroll-content'
    : 'symbiote-scroll-content'
  const scrollViewBaseStyle = isHorizontal ? SCROLL_VIEW_BASE_HORIZONTAL : undefined

  const contentStyle: ViewStyle = { ...contentContainerStyle }
  if (isHorizontal) contentStyle.flexDirection = 'row'

  const outerProps: Record<string, unknown> = { ...outer }
  // iOS needs `horizontal` to flip RCTScrollView's axis; Android's dedicated horizontal
  // manager ignores it. Harmless on Android, load-bearing on iOS — so always forward it.
  if (horizontal !== undefined) outerProps.horizontal = horizontal
  if (decelerationRate !== undefined) {
    outerProps.decelerationRate = resolveDecelerationRate(decelerationRate)
  }

  dlog(`ScrollView -> ${scrollViewIntrinsic} (horizontal=${isHorizontal})`)

  // `collapsable: false` is load-bearing on Android. The content container is a
  // layout-only View, which Android Fabric view-flattens away — hoisting the cells
  // up as DIRECT children of the scroll view, which strictly hosts exactly one
  // child ("ScrollView can host only one direct child" → addViewAt crash). RN pins
  // its own NativeScrollContentView the same way (ScrollView.js, collapsable={false};
  // ReactScrollView.java: "the 'content' View … non-collapsable so it will never be
  // View-flattened away"). iOS doesn't flatten, so this is a no-op there.
  const content = createElement(
    contentIntrinsic,
    { style: contentStyle, collapsable: false },
    children,
  )

  return { scrollViewIntrinsic, scrollViewBaseStyle, outerProps, style, content, refreshControl }
}

// The imperative handle is identical across platforms — every method dispatches a view
// command on the SAME scroll-view node; only the surrounding element assembly diverges
// (iOS sibling RefreshControl vs Android wrap). So it is built once here and both platform
// files back it with their scroll node ref. Commands and arg order mirror RN's
// ScrollViewCommands: scrollTo [x, y, animated], scrollToEnd [animated], flashScrollIndicators [].
export function buildScrollViewHandle(
  ref: RefObject<SymbioteNode | null>,
): ScrollViewHandle {
  return {
    scrollTo: (options): void => {
      const node = ref.current
      if (node === null) return
      const x = options?.x ?? 0
      const y = options?.y ?? 0
      const animated = options?.animated ?? true
      dlog(`ScrollView.scrollTo x=${x} y=${y} animated=${animated}`)
      dispatchViewCommand(node, 'scrollTo', [x, y, animated])
    },
    scrollToEnd: (options): void => {
      const node = ref.current
      if (node === null) return
      const animated = options?.animated ?? true
      dlog(`ScrollView.scrollToEnd animated=${animated}`)
      dispatchViewCommand(node, 'scrollToEnd', [animated])
    },
    flashScrollIndicators: (): void => {
      const node = ref.current
      if (node === null) return
      dlog('ScrollView.flashScrollIndicators')
      dispatchViewCommand(node, 'flashScrollIndicators', [])
    },
  }
}
