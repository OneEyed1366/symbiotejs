// ScrollView — shared core. The Fabric tree is nested: the scroll view wraps a content
// view that holds the children (RN's own ScrollView.js shape). Building that content
// node, resolving decelerationRate, and the prop plumbing are platform-invariant and
// live here. What diverges (ADR 0020) is how a RefreshControl integrates: on iOS it is a
// CHILD of the scroll view (sibling of the content), on Android it WRAPS the scroll view
// (AndroidSwipeRefreshLayout is the parent, ScrollView nested inside). So the .ios/.android
// files assemble the final element; the filename selects, no Platform.OS read.

import { createElement, useEffect, useRef, useState, type ReactElement, type ReactNode, type RefObject } from 'react'
import {
  AnimatedValue,
  attachNativeEvent,
  dispatchViewCommand,
  dlog,
  event as animatedEvent,
  isNativeAnimatedAvailable,
  type SymbioteEvent,
  type SymbioteNode,
} from '@symbiote/shared'
import { resolveAccessibilityProps, type AccessibilityProps, type AriaProps } from './accessibility-props'
import type { SymbioteIntrinsic } from './component-names-shared'
import type { ViewStyle } from './styles'
import { wrapStickyHeaders, type StickyHeaderComponentType } from './scroll-view-sticky-header'

type ScrollHandler = (event: SymbioteEvent) => void
type LayoutHandler = (event: SymbioteEvent) => void

// Pull a numeric field out of an onLayout event's nativeEvent.layout without a cast:
// SymbioteEvent.nativeEvent is Record<string, unknown>, so the layout box and its
// width/height are narrowed at runtime. A malformed event yields undefined (no-op).
function readLayoutDimension(event: SymbioteEvent, key: 'width' | 'height'): number | undefined {
  const layout = event.nativeEvent.layout
  if (typeof layout !== 'object' || layout === null) return undefined
  const value = Reflect.get(layout, key)
  return typeof value === 'number' ? value : undefined
}

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
  // Fired when the content container's size changes. RN synthesizes this in JS by
  // putting an onLayout on the inner content view (ScrollView.js _handleContentOnLayout):
  // the native scroll view has no such event of its own. (width, height) in points.
  onContentSizeChange?: (width: number, height: number) => void
  // Snap / paging family — forwarded to the native scroll view via ...rest; the native
  // ViewManager reads them directly, no extra JS wiring (RN ScrollView passes the same
  // props straight through to RCTScrollView / the Android manager).
  snapToInterval?: number
  snapToOffsets?: number[]
  snapToAlignment?: 'start' | 'center' | 'end'
  snapToStart?: boolean
  snapToEnd?: boolean
  disableIntervalMomentum?: boolean
  // Sticky headers: RN implements stickiness PURELY IN JS (ScrollView.js wraps each
  // flagged child in ScrollViewStickyHeader, driven by the scroll offset). The native
  // scroll view does NOT honor an index array, so we wrap the children here too rather
  // than forward `stickyHeaderIndices` to native (that would be a silent no-op). The
  // keyboard props below ARE read by native directly.
  stickyHeaderIndices?: number[]
  // Stick to the BOTTOM instead of the top (RN invertStickyHeaders) — used by inverted lists.
  invertStickyHeaders?: boolean
  // Override the wrapper component for sticky headers (RN StickyHeaderComponent), e.g. a
  // SectionList header. Defaults to the built-in sticky header.
  StickyHeaderComponent?: StickyHeaderComponentType
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
  // The scroll view's own frame layout (RN ScrollView _handleLayout). Sticky headers
  // need the viewport height when inverted; also a generally-valid ScrollView prop.
  onLayout?: LayoutHandler
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
// styles.baseHorizontal/baseVertical). Two parts carry weight:
//   - `overflow: 'scroll'` — clips content to the scroll view's frame. On iOS Fabric the
//     node only clips when this is set; without it a fixed-height ScrollView lets its
//     content bleed out over siblings (Android's native ViewGroup clips regardless, which
//     is why the bug showed only on iOS). RN sets it on BOTH axes, so we do too.
//   - `flexDirection: 'row'` (horizontal only) — makes the single content child a MAIN-axis
//     item, so Yoga sizes it to its content width and the view overflows and scrolls.
//     Without it the content is a CROSS-axis item, stretched to the viewport, nothing to
//     scroll. Vertical keeps the default `column`.
// Both axes match RN's baseHorizontal/baseVertical exactly. Composed UNDER the user style,
// so an explicit value still wins.
const SCROLL_VIEW_BASE_HORIZONTAL: ViewStyle = {
  flexGrow: 1,
  flexShrink: 1,
  flexDirection: 'row',
  overflow: 'scroll',
}
const SCROLL_VIEW_BASE_VERTICAL: ViewStyle = {
  flexGrow: 1,
  flexShrink: 1,
  flexDirection: 'column',
  overflow: 'scroll',
}

// RN's splitLayoutProps key partition (StyleSheet/splitLayoutProps.js): the LAYOUT keys
// that belong on the OUTER box when a layout-affecting wrapper sits between the laid-out
// frame and the visual content. Everything NOT in this set (background*, padding*, border*,
// opacity, overflow, …) is VISUAL and stays on the inner view. Replicated exactly from RN's
// switch cases so the Android RefreshControl wrap routes style the way RN does.
const LAYOUT_KEYS: ReadonlySet<string> = new Set([
  'margin',
  'marginHorizontal',
  'marginVertical',
  'marginBottom',
  'marginTop',
  'marginLeft',
  'marginRight',
  'flex',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'alignSelf',
  'height',
  'minHeight',
  'maxHeight',
  'width',
  'minWidth',
  'maxWidth',
  'position',
  'left',
  'right',
  'bottom',
  'top',
  'transform',
  'transformOrigin',
  'rowGap',
  'columnGap',
  'gap',
])

// Split a flattened style into the LAYOUT props that drive the outer wrapper's frame and the
// VISUAL props that paint the inner content — RN's splitLayoutProps. The Android build uses
// this when a RefreshControl wraps the scroll view: layout (margin/flex/size/position/…) goes
// on the AndroidSwipeRefreshLayout wrapper, visual (background/padding/border/…) stays on the
// inner scroll view, instead of dumping the whole style on the wrapper and hardcoding flex:1.
export function splitLayoutProps(style: ViewStyle | undefined): {
  outer: Record<string, unknown>
  inner: Record<string, unknown>
} {
  const outer: Record<string, unknown> = {}
  const inner: Record<string, unknown> = {}
  if (style !== undefined) {
    for (const key of Object.keys(style)) {
      const value = Reflect.get(style, key)
      if (LAYOUT_KEYS.has(key)) outer[key] = value
      else inner[key] = value
    }
  }
  return { outer, inner }
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
  // The scroll-offset AnimatedValue driving the sticky headers (RN's _scrollAnimatedValue), and
  // whether the native driver is available for it. The platform file feeds both to
  // useNativeStickyScrollAttach so the scroll event binds to the value on the UI thread.
  scrollAnimatedValue: AnimatedValue
  nativeStickyAvailable: boolean
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
    onContentSizeChange,
    stickyHeaderIndices,
    invertStickyHeaders,
    StickyHeaderComponent,
    onLayout,
    onScroll,
    scrollEventThrottle,
    ...outer
  } = props

  const isHorizontal = horizontal === true
  const hasStickyHeaders = stickyHeaderIndices !== undefined && stickyHeaderIndices.length > 0

  // A single AnimatedValue tracks the scroll offset and drives every sticky header's
  // translateY (RN's _scrollAnimatedValue). Stable across renders via a ref so the headers'
  // bindings survive re-renders. Allocated even when no sticky headers are present (hooks
  // run unconditionally — prepareScrollView is always called at the top of the render body).
  const scrollAnimatedValueRef = useRef<AnimatedValue | null>(null)
  if (scrollAnimatedValueRef.current === null) scrollAnimatedValueRef.current = new AnimatedValue(0)
  const scrollAnimatedValue = scrollAnimatedValueRef.current
  // Inverted sticky headers stick to the BOTTOM, so they need the viewport height (RN reads
  // it in _handleLayout). Tracked here and fed back into the wrapped headers.
  const [viewportHeight, setViewportHeight] = useState<number | undefined>(undefined)

  // Sticky-header cross-talk (RN ScrollView.js _headerLayoutYs, line 754): a child-index→measured-y
  // map the parent keeps so each header can learn where the NEXT sticky header starts (its push-off
  // collision point). The map lives in a ref (mutated imperatively from each header's onLayout, like
  // RN's _onStickyHeaderLayout), and a state bump forces the re-render that feeds the freshly-recorded
  // y forward into the previous header's nextHeaderLayoutY prop.
  const headerLayoutYsRef = useRef<Map<number, number> | null>(null)
  if (headerLayoutYsRef.current === null) headerLayoutYsRef.current = new Map()
  const headerLayoutYs = headerLayoutYsRef.current
  const [, bumpHeaderLayout] = useState(0)
  const onHeaderLayoutY = (index: number, y: number): void => {
    if (headerLayoutYs.get(index) === y) return
    headerLayoutYs.set(index, y)
    dlog(`ScrollView sticky-header layoutY index=${index} y=${y}`)
    bumpHeaderLayout((tick) => tick + 1)
  }

  // Horizontal scroll resolves to a different native component on Android (its own
  // ViewManager, not RCTScrollView+flag); on iOS both intrinsics map back to RCTScrollView.
  // The name table does the per-platform mapping — here we only pick the intrinsic.
  const scrollViewIntrinsic: SymbioteIntrinsic = isHorizontal
    ? 'symbiote-horizontal-scroll-view'
    : 'symbiote-scroll-view'
  const contentIntrinsic: SymbioteIntrinsic = isHorizontal
    ? 'symbiote-horizontal-scroll-content'
    : 'symbiote-scroll-content'
  const scrollViewBaseStyle = isHorizontal ? SCROLL_VIEW_BASE_HORIZONTAL : SCROLL_VIEW_BASE_VERTICAL

  const contentStyle: ViewStyle = { ...contentContainerStyle }
  if (isHorizontal) contentStyle.flexDirection = 'row'

  const outerProps: Record<string, unknown> = { ...outer }
  // iOS needs `horizontal` to flip RCTScrollView's axis; Android's dedicated horizontal
  // manager ignores it. Harmless on Android, load-bearing on iOS — so always forward it.
  if (horizontal !== undefined) outerProps.horizontal = horizontal
  if (decelerationRate !== undefined) {
    outerProps.decelerationRate = resolveDecelerationRate(decelerationRate)
  }

  // onScroll: when sticky headers are active, the offset must reach the AnimatedValue, so
  // we wrap the user's handler with Animated.event (it fires the listener passthrough). RN
  // does the same with _scrollAnimatedValueAttachment. Without sticky headers, forward as-is.
  const nativeStickyAvailable = hasStickyHeaders && isNativeAnimatedAvailable()
  if (hasStickyHeaders) {
    if (nativeStickyAvailable) {
      // Native path (RN attachNativeEvent): the scroll value is driven on the UI thread by the
      // imperative attach in the platform component's effect (useNativeStickyScrollAttach), so
      // onScroll only forwards to the user — zero JS per frame. RN uses throttle 1 when sticky
      // (ScrollView.js:1798); the native driver can afford it.
      if (onScroll !== undefined) outerProps.onScroll = onScroll
      outerProps.scrollEventThrottle = scrollEventThrottle ?? 1
    } else {
      // JS fallback (no native module): Animated.event drives the value each frame and forwards
      // the user's handler as the listener passthrough. Correct, but lags a frame under fast
      // scroll (the jitter) — which the native path above removes on a real host.
      outerProps.onScroll = animatedEvent(
        [{ nativeEvent: { contentOffset: { y: scrollAnimatedValue } } }],
        onScroll === undefined ? undefined : { listener: (...args) => forwardScrollEvent(onScroll, args) },
      )
      outerProps.scrollEventThrottle = scrollEventThrottle ?? 16
    }
  } else {
    if (onScroll !== undefined) outerProps.onScroll = onScroll
    if (scrollEventThrottle !== undefined) outerProps.scrollEventThrottle = scrollEventThrottle
  }

  // onLayout on the scroll-view node: capture the viewport height for inverted sticky headers
  // (RN _handleLayout), then call the user's handler. Pass through unchanged otherwise.
  if (hasStickyHeaders && invertStickyHeaders === true) {
    outerProps.onLayout = (layoutEvent: SymbioteEvent): void => {
      const height = readLayoutDimension(layoutEvent, 'height')
      if (height !== undefined) setViewportHeight(height)
      onLayout?.(layoutEvent)
    }
  } else if (onLayout !== undefined) {
    outerProps.onLayout = onLayout
  }

  dlog(`ScrollView -> ${scrollViewIntrinsic} (horizontal=${isHorizontal} sticky=${hasStickyHeaders})`)

  // onContentSizeChange is synthesized from the content view's own onLayout (RN
  // _handleContentOnLayout): read width/height off nativeEvent.layout and fire only when the
  // size actually changed (dedupe via a ref, like RN). Composed with any content onLayout.
  const lastContentSizeRef = useRef<{ width: number; height: number } | null>(null)
  const contentProps: Record<string, unknown> = { style: contentStyle, collapsable: false }
  if (onContentSizeChange !== undefined) {
    contentProps.onLayout = (layoutEvent: SymbioteEvent): void => {
      const width = readLayoutDimension(layoutEvent, 'width')
      const height = readLayoutDimension(layoutEvent, 'height')
      if (width === undefined || height === undefined) return
      const last = lastContentSizeRef.current
      if (last !== null && last.width === width && last.height === height) return
      lastContentSizeRef.current = { width, height }
      dlog(`ScrollView onContentSizeChange ${width}x${height}`)
      onContentSizeChange(width, height)
    }
  }

  // Sticky headers are a pure-JS layer (the native scroll view ignores stickyHeaderIndices);
  // wrap the flagged children so they pin to the scroll offset. No-op when none are flagged.
  const contentChildren = hasStickyHeaders
    ? wrapStickyHeaders(
        children,
        stickyHeaderIndices,
        scrollAnimatedValue,
        invertStickyHeaders,
        viewportHeight,
        StickyHeaderComponent,
        headerLayoutYs,
        onHeaderLayoutY,
      )
    : children

  // `collapsable: false` is load-bearing on Android. The content container is a
  // layout-only View, which Android Fabric view-flattens away — hoisting the cells
  // up as DIRECT children of the scroll view, which strictly hosts exactly one
  // child ("ScrollView can host only one direct child" → addViewAt crash). RN pins
  // its own NativeScrollContentView the same way (ScrollView.js, collapsable={false};
  // ReactScrollView.java: "the 'content' View … non-collapsable so it will never be
  // View-flattened away"). iOS doesn't flatten, so this is a no-op there.
  const content = createElement(contentIntrinsic, contentProps, contentChildren)

  return {
    scrollViewIntrinsic,
    scrollViewBaseStyle,
    outerProps,
    style,
    content,
    refreshControl,
    scrollAnimatedValue,
    nativeStickyAvailable,
  }
}

// Forward a wrapped scroll event to the user's ScrollHandler. The Animated.event listener
// Attach the scroll event to the scroll-offset value on the NATIVE driver — RN's
// _updateAnimatedNodeAttachment / AnimatedImplementation.attachNativeEvent (ScrollView.js:1087).
// Called by each platform ScrollView with its committed scroll-node ref; the value then tracks
// scroll on the UI thread and the sticky-header interpolations ride it natively (no JS jitter).
// No-op when native sticky is unavailable or the node hasn't committed. Detaches on unmount.
export function useNativeStickyScrollAttach(
  scrollNodeRef: RefObject<SymbioteNode | null>,
  scrollAnimatedValue: AnimatedValue,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled) return
    const node = scrollNodeRef.current
    if (node === null) return
    const attachment = attachNativeEvent(node, 'onScroll', [
      { nativeEvent: { contentOffset: { y: scrollAnimatedValue } } },
    ])
    return () => attachment.detach()
  }, [scrollNodeRef, scrollAnimatedValue, enabled])
}

// hands raw args; the first is the original SymbioteEvent, which we narrow with a runtime
// guard (no cast) and pass through unchanged so the user sees the same event RN would deliver.
function forwardScrollEvent(handler: ScrollHandler, args: readonly unknown[]): void {
  const first = args[0]
  if (isSymbioteEvent(first)) handler(first)
}

function isSymbioteEvent(value: unknown): value is SymbioteEvent {
  if (typeof value !== 'object' || value === null) return false
  const nativeEvent = Reflect.get(value, 'nativeEvent')
  return typeof nativeEvent === 'object' && nativeEvent !== null
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
