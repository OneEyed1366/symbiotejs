// ScrollView: shared core. The Fabric tree is nested: the scroll view wraps a content
// view that holds the children (RN's own ScrollView.js shape). Building that content
// node, resolving decelerationRate, and the prop plumbing are platform-invariant and
// live here. What diverges (ADR 0020) is how a RefreshControl integrates: on iOS it is a
// CHILD of the scroll view (sibling of the content), on Android it WRAPS the scroll view
// (AndroidSwipeRefreshLayout is the parent, ScrollView nested inside). So the .ios/.android
// files assemble the final element; the filename selects, no Platform.OS read.
//
// The framework-agnostic pieces (decelerationRate, the per-axis intrinsics/base style, the
// content-size dedupe, the imperative handle, splitLayoutProps, the sticky math, the native
// scroll-attach) live in @symbiote/components (ADR 0024); this file holds only the React
// lifecycle (refs/state/effects) and the element assembly that consumes them.

import {
  createElement,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  AnimatedValue,
  dlog,
  event as animatedEvent,
  isNativeAnimatedAvailable,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '@symbiote/engine';
import {
  attachStickyScroll,
  didContentSizeChange,
  forwardScrollEvent,
  readLayoutDimension,
  resolveDecelerationRate,
  selectScrollIntrinsics,
  type ISymbioteIntrinsic,
} from '@symbiote/components';
import {
  resolveAccessibilityProps,
  type IAccessibilityProps,
  type IAriaProps,
} from '@symbiote/components';
import type { IStyleProp, IViewStyle } from '../styles';
import { wrapStickyHeaders, type IStickyHeaderComponentType } from './sticky-header';

export type { IScrollViewHandle } from '@symbiote/components';

type IScrollHandler = (event: ISymbioteEvent) => void;
type ILayoutHandler = (event: ISymbioteEvent) => void;

export interface IScrollViewProps extends IAccessibilityProps, IAriaProps {
  // testID / nativeID inherited from IAccessibilityProps (shared host-anchor base).
  style?: IStyleProp<IViewStyle>;
  contentContainerStyle?: IStyleProp<IViewStyle>;
  horizontal?: boolean;
  scrollEnabled?: boolean;
  showsVerticalScrollIndicator?: boolean;
  showsHorizontalScrollIndicator?: boolean;
  pagingEnabled?: boolean;
  bounces?: boolean;
  decelerationRate?: 'normal' | 'fast' | number;
  scrollEventThrottle?: number;
  contentInset?: { top?: number; left?: number; bottom?: number; right?: number };
  contentOffset?: { x: number; y: number };
  refreshControl?: ReactElement<IClonableRefreshControl>;
  removeClippedSubviews?: boolean;
  // Fired when the content container's size changes. RN synthesizes this in JS by
  // putting an onLayout on the inner content view (ScrollView.js _handleContentOnLayout):
  // the native scroll view has no such event of its own. (width, height) in points.
  onContentSizeChange?: (width: number, height: number) => void;
  // Snap / paging family, forwarded to the native scroll view via ...rest; the native
  // ViewManager reads them directly, no extra JS wiring (RN ScrollView passes the same
  // props straight through to RCTScrollView / the Android manager).
  snapToInterval?: number;
  snapToOffsets?: number[];
  snapToAlignment?: 'start' | 'center' | 'end';
  snapToStart?: boolean;
  snapToEnd?: boolean;
  disableIntervalMomentum?: boolean;
  // Sticky headers: RN implements stickiness PURELY IN JS (ScrollView.js wraps each
  // flagged child in ScrollViewStickyHeader, driven by the scroll offset). The native
  // scroll view does NOT honor an index array, so we wrap the children here too rather
  // than forward `stickyHeaderIndices` to native (that would be a silent no-op). The
  // keyboard props below ARE read by native directly.
  stickyHeaderIndices?: number[];
  // Stick to the BOTTOM instead of the top (RN invertStickyHeaders). Used by inverted lists.
  invertStickyHeaders?: boolean;
  // Override the wrapper component for sticky headers (RN StickyHeaderComponent), e.g. a
  // SectionList header. Defaults to the built-in sticky header.
  StickyHeaderComponent?: IStickyHeaderComponentType;
  keyboardDismissMode?: 'none' | 'on-drag' | 'interactive';
  keyboardShouldPersistTaps?: boolean | 'always' | 'never' | 'handled';
  maintainVisibleContentPosition?: {
    minIndexForVisible: number;
    autoscrollToTopThreshold?: number;
  };
  // iOS-only forwarding props. Harmless on Android (its manager ignores unknown props);
  // the iOS RCTScrollView reads them directly off the shadow node.
  alwaysBounceHorizontal?: boolean;
  alwaysBounceVertical?: boolean;
  centerContent?: boolean;
  scrollIndicatorInsets?: { top?: number; left?: number; bottom?: number; right?: number };
  indicatorStyle?: 'default' | 'black' | 'white';
  directionalLockEnabled?: boolean;
  automaticallyAdjustKeyboardInsets?: boolean;
  contentInsetAdjustmentBehavior?: 'automatic' | 'scrollableAxes' | 'never' | 'always';
  minimumZoomScale?: number;
  maximumZoomScale?: number;
  zoomScale?: number;
  bouncesZoom?: boolean;
  pinchGestureEnabled?: boolean;
  // Android-only forwarding props. Harmless on iOS; the Android manager reads them.
  nestedScrollEnabled?: boolean;
  overScrollMode?: 'auto' | 'always' | 'never';
  fadingEdgeLength?: number;
  persistentScrollbar?: boolean;
  endFillColor?: string;
  // The scroll view's own frame layout (RN ScrollView _handleLayout). Sticky headers
  // need the viewport height when inverted; also a generally-valid ScrollView prop.
  onLayout?: ILayoutHandler;
  onScroll?: IScrollHandler;
  onScrollBeginDrag?: IScrollHandler;
  onScrollEndDrag?: IScrollHandler;
  onMomentumScrollBegin?: IScrollHandler;
  onMomentumScrollEnd?: IScrollHandler;
  // iOS-only: user tapped the status bar to scroll to top. Inert on Android.
  onScrollToTop?: IScrollHandler;
  children?: ReactNode;
}

// The shape the Android build clones onto a RefreshControl when wrapping the scroll view:
// a layout style and the scroll view as its single child. Typed so cloneElement accepts
// the added props without a cast; any RefreshControl element (its own props are a
// superset) satisfies it.
export interface IClonableRefreshControl {
  style?: IStyleProp<IViewStyle>;
  children?: ReactNode;
}

// The platform-invariant pieces: the outer scroll-view intrinsic (vertical vs horizontal,
// which the name table maps to the right Fabric component per platform), its outer props
// (minus style, placed differently per platform), its style, and the built content node.
// The .ios/.android files take these and assemble the final element with their
// RefreshControl wiring.
export interface IPreparedScrollView {
  scrollViewIntrinsic: ISymbioteIntrinsic;
  // The base style for the scroll-view NODE (flexDirection etc.): set for horizontal,
  // undefined for vertical. The platform files compose it UNDER the user style so an
  // explicit user flexDirection/height still wins.
  scrollViewBaseStyle: IStyleProp<IViewStyle> | undefined;
  outerProps: Record<string, unknown>;
  style: IStyleProp<IViewStyle> | undefined;
  content: ReactElement;
  refreshControl: ReactElement<IClonableRefreshControl> | undefined;
  // The scroll-offset AnimatedValue driving the sticky headers (RN's _scrollAnimatedValue), and
  // whether the native driver is available for it. The platform file feeds both to
  // useNativeStickyScrollAttach so the scroll event binds to the value on the UI thread.
  scrollAnimatedValue: AnimatedValue;
  nativeStickyAvailable: boolean;
}

export function usePreparedScrollView(rawProps: IScrollViewProps): IPreparedScrollView {
  // ScrollView forwards its outer props straight to the native scroll view (not a View
  // wrapper), so it folds aria/role into accessibility* here before forwarding.
  const props = resolveAccessibilityProps(rawProps);
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
  } = props;

  const isHorizontal = horizontal === true;
  const hasStickyHeaders = stickyHeaderIndices !== undefined && stickyHeaderIndices.length > 0;

  // A single AnimatedValue tracks the scroll offset and drives every sticky header's
  // translateY (RN's _scrollAnimatedValue). Stable across renders via a ref so the headers'
  // bindings survive re-renders. Allocated even when no sticky headers are present (hooks
  // run unconditionally: usePreparedScrollView is always called at the top of the render body).
  const scrollAnimatedValueRef = useRef<AnimatedValue | null>(null);
  if (scrollAnimatedValueRef.current === null)
    scrollAnimatedValueRef.current = new AnimatedValue(0);
  const scrollAnimatedValue = scrollAnimatedValueRef.current;
  // Inverted sticky headers stick to the BOTTOM, so they need the viewport height (RN reads
  // it in _handleLayout). Tracked here and fed back into the wrapped headers.
  const [viewportHeight, setViewportHeight] = useState<number | undefined>(undefined);

  // Sticky-header cross-talk (RN ScrollView.js _headerLayoutYs, line 754): a child-index→measured-y
  // map the parent keeps so each header can learn where the NEXT sticky header starts (its push-off
  // collision point). The map lives in a ref (mutated imperatively from each header's onLayout, like
  // RN's _onStickyHeaderLayout), and a state bump forces the re-render that feeds the freshly-recorded
  // y forward into the previous header's nextHeaderLayoutY prop.
  const headerLayoutYsRef = useRef<Map<number, number> | null>(null);
  if (headerLayoutYsRef.current === null) headerLayoutYsRef.current = new Map();
  const headerLayoutYs = headerLayoutYsRef.current;
  const [, bumpHeaderLayout] = useState(0);
  const onHeaderLayoutY = (index: number, y: number): void => {
    if (headerLayoutYs.get(index) === y) return;
    headerLayoutYs.set(index, y);
    dlog(`ScrollView sticky-header layoutY index=${index} y=${y}`);
    bumpHeaderLayout(tick => tick + 1);
  };

  // The per-axis intrinsics, base style, and content style come from the shared selector
  // (@symbiote/components): on Android horizontal resolves to its own ViewManager, on iOS both
  // map back to RCTScrollView; here we only pass the axis.
  const { scrollViewIntrinsic, contentIntrinsic, scrollViewBaseStyle, contentStyle } =
    selectScrollIntrinsics(isHorizontal, contentContainerStyle);

  const outerProps: Record<string, unknown> = { ...outer };
  // RN defaults nested scrolling ON (ScrollView.js:1862 `nestedScrollEnabled ?? true`).
  // Android needs the flag to scroll a scrollable nested inside another scroll view
  // independently; without it the inner one stays put. iOS handles nesting natively, so
  // it is a no-op there. Default to true so nested lists scroll out of the box, like RN.
  outerProps.nestedScrollEnabled = props.nestedScrollEnabled ?? true;
  // iOS needs `horizontal` to flip RCTScrollView's axis; Android's dedicated horizontal
  // manager ignores it. Harmless on Android, load-bearing on iOS, so always forward it.
  if (horizontal !== undefined) outerProps.horizontal = horizontal;
  if (decelerationRate !== undefined) {
    outerProps.decelerationRate = resolveDecelerationRate(decelerationRate);
  }

  // onScroll: when sticky headers are active, the offset must reach the AnimatedValue, so
  // we wrap the user's handler with Animated.event (it fires the listener passthrough). RN
  // does the same with _scrollAnimatedValueAttachment. Without sticky headers, forward as-is.
  const nativeStickyAvailable = hasStickyHeaders && isNativeAnimatedAvailable();
  if (hasStickyHeaders) {
    if (nativeStickyAvailable) {
      // Native path (RN attachNativeEvent): the scroll value is driven on the UI thread by the
      // imperative attach in the platform component's effect (useNativeStickyScrollAttach), so
      // onScroll only forwards to the user, zero JS per frame. RN uses throttle 1 when sticky
      // (ScrollView.js:1798); the native driver can afford it.
      if (onScroll !== undefined) outerProps.onScroll = onScroll;
      outerProps.scrollEventThrottle = scrollEventThrottle ?? 1;
    } else {
      // JS fallback (no native module): Animated.event drives the value each frame and forwards
      // the user's handler as the listener passthrough. Correct, but lags a frame under fast
      // scroll (the jitter), which the native path above removes on a real host.
      outerProps.onScroll = animatedEvent(
        [{ nativeEvent: { contentOffset: { y: scrollAnimatedValue } } }],
        onScroll === undefined
          ? undefined
          : { listener: (...args) => forwardScrollEvent(onScroll, args) },
      );
      outerProps.scrollEventThrottle = scrollEventThrottle ?? 16;
    }
  } else {
    if (onScroll !== undefined) outerProps.onScroll = onScroll;
    if (scrollEventThrottle !== undefined) outerProps.scrollEventThrottle = scrollEventThrottle;
  }

  // onLayout on the scroll-view node: capture the viewport height for inverted sticky headers
  // (RN _handleLayout), then call the user's handler. Pass through unchanged otherwise.
  if (hasStickyHeaders && invertStickyHeaders === true) {
    outerProps.onLayout = (layoutEvent: ISymbioteEvent): void => {
      const height = readLayoutDimension(layoutEvent, 'height');
      if (height !== undefined) setViewportHeight(height);
      onLayout?.(layoutEvent);
    };
  } else if (onLayout !== undefined) {
    outerProps.onLayout = onLayout;
  }

  dlog(
    `ScrollView -> ${scrollViewIntrinsic} (horizontal=${isHorizontal} sticky=${hasStickyHeaders})`,
  );

  // onContentSizeChange is synthesized from the content view's own onLayout (RN
  // _handleContentOnLayout): read width/height off nativeEvent.layout and fire only when the
  // size actually changed (dedupe via a ref, like RN). Composed with any content onLayout.
  const lastContentSizeRef = useRef<{ width: number; height: number } | null>(null);
  const contentProps: Record<string, unknown> = { style: contentStyle, collapsable: false };
  // maintainVisibleContentPosition (and Android snapToAlignment) anchor against the metrics
  // of MOUNTED cell views. Android Fabric view-flattens layout-only cells away, so the native
  // MaintainVisibleScrollPositionHelper has nothing to anchor to and the list jumps on prepend.
  // RN keeps the cells as real views via collapsableChildren={false} on the content container
  // (ScrollView.js:1731-1748 `preserveChildren`). iOS never flattens, so it is a no-op there.
  if (props.maintainVisibleContentPosition !== undefined || props.snapToAlignment !== undefined) {
    contentProps.collapsableChildren = false;
  }
  if (onContentSizeChange !== undefined) {
    contentProps.onLayout = (layoutEvent: ISymbioteEvent): void => {
      const width = readLayoutDimension(layoutEvent, 'width');
      const height = readLayoutDimension(layoutEvent, 'height');
      if (width === undefined || height === undefined) return;
      const last = lastContentSizeRef.current;
      if (!didContentSizeChange(last, { width, height })) return;
      lastContentSizeRef.current = { width, height };
      dlog(`ScrollView onContentSizeChange ${width}x${height}`);
      onContentSizeChange(width, height);
    };
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
    : children;

  // `collapsable: false` is load-bearing on Android. The content container is a
  // layout-only View, which Android Fabric view-flattens away, hoisting the cells
  // up as DIRECT children of the scroll view, which strictly hosts exactly one
  // child ("ScrollView can host only one direct child" → addViewAt crash). RN pins
  // its own NativeScrollContentView the same way (ScrollView.js, collapsable={false};
  // ReactScrollView.java: "the 'content' View … non-collapsable so it will never be
  // View-flattened away"). iOS doesn't flatten, so this is a no-op there.
  const content = createElement(contentIntrinsic, contentProps, contentChildren);

  return {
    scrollViewIntrinsic,
    scrollViewBaseStyle,
    outerProps,
    style,
    content,
    refreshControl,
    scrollAnimatedValue,
    nativeStickyAvailable,
  };
}

// Attach the scroll event to the scroll-offset value on the NATIVE driver, RN's
// _updateAnimatedNodeAttachment / AnimatedImplementation.attachNativeEvent (ScrollView.js:1087).
// Called by each platform ScrollView with its committed scroll-node ref; the value then tracks
// scroll on the UI thread and the sticky-header interpolations ride it natively (no JS jitter).
// No-op when native sticky is unavailable or the node hasn't committed. Detaches on unmount.
// The attach/detach itself lives in @symbiote/components (attachStickyScroll); this is the React
// effect that drives it.
export function useNativeStickyScrollAttach(
  scrollNodeRef: RefObject<ISymbioteNode | null>,
  scrollAnimatedValue: AnimatedValue,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled) return;
    const node = scrollNodeRef.current;
    if (node === null) return;
    return attachStickyScroll(node, scrollAnimatedValue);
  }, [scrollNodeRef, scrollAnimatedValue, enabled]);
}
