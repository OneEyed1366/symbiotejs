// Sticky headers: the JS layer RN implements in ScrollView.js / ScrollViewStickyHeader.js.
//
// VERDICT (source-based): RN does stickiness PURELY IN JS. ScrollView.js (render, ~line
// 1690) wraps each child whose index is in `stickyHeaderIndices` in a ScrollViewStickyHeader,
// fed by a single `_scrollAnimatedValue` an Animated.event drives from `onScroll`
// (ScrollView.js ~line 1095). The native Fabric scroll view does NOT honor the index array on
// its own. Forwarding `stickyHeaderIndices` to native is a silent no-op. So we replicate the
// JS layer: subscribe each flagged child to the scroll offset and translate it to stay pinned.
// The interpolation mirrors ScrollViewStickyHeader.js (non-inverted + inverted branches) and now
// lives, framework-agnostic, in @symbiote-native/components (computeStickyInterpolation); this
// file holds the React component shell, the layout state, and the child-wrapping.

import {
  Children,
  createElement,
  isValidElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  AnimatedInterpolation,
  AnimatedValue,
  Platform,
  dlog,
  type ISymbioteEvent,
} from '@symbiote-native/engine';
import {
  computeStickyInterpolation,
  nextStickyHeaderY,
  readLayoutNumber,
  stickyDebounceMs,
  STICKY_HEADER_Z_INDEX,
  type IStickyHeaderProps,
} from '@symbiote-native/components';
import { Animated } from '../../modules/animated';

// The props RN passes a sticky header wrapper (ScrollViewStickyHeader.js): the framework-agnostic
// fields (IStickyHeaderProps) plus the React children slot. A custom StickyHeaderComponent must
// accept the same shape.
export type IStickyHeaderComponentProps = IStickyHeaderProps & {
  children?: ReactNode;
};

export type IStickyHeaderComponentType = ComponentType<IStickyHeaderComponentProps>;

function readChildOnLayout(child: ReactElement): ((event: ISymbioteEvent) => void) | undefined {
  const childProps = child.props;
  if (typeof childProps !== 'object' || childProps === null) return undefined;
  const handler = Reflect.get(childProps, 'onLayout');
  return typeof handler === 'function' ? handler : undefined;
}

function firstChild(children: ReactNode): ReactElement | undefined {
  const first = Children.toArray(children)[0];
  return isValidElement(first) ? first : undefined;
}

// One sticky header. Measures its own y/height via onLayout, interpolates the shared scroll
// offset into a translateY that keeps it pinned to the top (or bottom, inverted) until the next
// header collides with it, and drives that translate through the native driver when available so
// the pin tracks scroll on the UI thread (no JS jitter). Ported from
// ScrollViewStickyHeader.js, including the Fabric ShadowTree debounce path.
export const ScrollViewStickyHeader: IStickyHeaderComponentType = props => {
  const { inverted, scrollViewHeight, scrollAnimatedValue, nextHeaderLayoutY, children } = props;
  const [measured, setMeasured] = useState(false);
  const [layoutY, setLayoutY] = useState(0);
  const [layoutHeight, setLayoutHeight] = useState(0);
  // The animated node that drives the transform (RN's animatedTranslateY). When the scroll value
  // is native (attachNativeEvent), this interpolation runs on the UI thread: the smooth pin.
  const [animatedTranslateY, setAnimatedTranslateY] = useState<AnimatedInterpolation>(() =>
    scrollAnimatedValue.interpolate({ inputRange: [-1, 0], outputRange: [0, 0] }),
  );
  // The debounced EXPLICIT translateY pushed to the committed transform via
  // passthroughAnimatedPropExplicitValues, so the Fabric ShadowTree (hit-testing) knows the pinned
  // position while the native driver animates. null until the listener first fires.
  const [translateY, setTranslateY] = useState<number | null>(null);
  const haveReceivedInitialZeroTranslateY = useRef(true);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (translateY !== 0 && translateY !== null) haveReceivedInitialZeroTranslateY.current = false;
  }, [translateY]);

  // The animated value updates several times per frame during scroll; debounce it and push the
  // settled value into the committed transform so hit detection stays current (RN: a Fabric-only
  // issue, symbiote is always Fabric, and worse on Android).
  const animatedValueListener = useCallback(({ value }: { value: number | string }): void => {
    if (typeof value !== 'number') return;
    const timeout = stickyDebounceMs(Platform.OS);
    // A freshly-rebuilt interpolation re-emits 0 to its listeners; swallow that first zero (RN).
    if (value === 0 && !haveReceivedInitialZeroTranslateY.current) {
      haveReceivedInitialZeroTranslateY.current = true;
      return;
    }
    if (debounceTimer.current !== null) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setTranslateY(value), timeout);
  }, []);

  useEffect(() => {
    const { inputRange, outputRange } = computeStickyInterpolation({
      measured,
      inverted,
      scrollViewHeight,
      layoutY,
      layoutHeight,
      nextHeaderLayoutY,
    });
    const newAnimatedTranslateY = scrollAnimatedValue.interpolate({ inputRange, outputRange });
    // symbiote is always Fabric: listen to the settled value to keep the ShadowTree transform
    // current for hit-testing (RN attaches this listener only under Fabric).
    const listenerId = newAnimatedTranslateY.addListener(animatedValueListener);
    setAnimatedTranslateY(newAnimatedTranslateY);
    return () => {
      newAnimatedTranslateY.removeListener(listenerId);
      if (debounceTimer.current !== null) clearTimeout(debounceTimer.current);
    };
  }, [
    measured,
    layoutY,
    layoutHeight,
    scrollViewHeight,
    nextHeaderLayoutY,
    inverted,
    scrollAnimatedValue,
    animatedValueListener,
  ]);

  const onLayout = (event: ISymbioteEvent): void => {
    const y = readLayoutNumber(event, 'y');
    const height = readLayoutNumber(event, 'height');
    if (y !== undefined) setLayoutY(y);
    if (height !== undefined) setLayoutHeight(height);
    setMeasured(true);
    props.onLayout(event);
    const child = firstChild(children);
    const childOnLayout = child === undefined ? undefined : readChildOnLayout(child);
    childOnLayout?.(event);
  };

  // The EXPLICIT debounced translateY overrides the committed transform for hit-testing, while
  // `animatedTranslateY` does the smooth (native-driven) pin, per RN ScrollViewStickyHeader.js.
  const passthroughAnimatedPropExplicitValues =
    translateY !== null ? { style: { transform: [{ translateY }] } } : null;

  // collapsable:false keeps the wrapper a real Yoga node; zIndex makes the pinned header paint
  // OVER the rows scrolling under it. `style` is `unknown` on Animated.View, so the interpolation
  // transform passes with no cast.
  return createElement(
    Animated.View,
    {
      style: { transform: [{ translateY: animatedTranslateY }], zIndex: STICKY_HEADER_Z_INDEX },
      onLayout,
      collapsable: false,
      passthroughAnimatedPropExplicitValues,
    },
    children,
  );
};
ScrollViewStickyHeader.displayName = 'ScrollViewStickyHeader';

// Wrap each child flagged by `stickyHeaderIndices` in the sticky header component, fed by the
// shared scroll AnimatedValue. Mirrors ScrollView.js's render-time children.map (~line 1690).
// Returns the children unchanged when no indices are flagged.
//
// Cross-talk plumbing (RN's _headerLayoutYs + _onStickyHeaderLayout, ScrollView.js:1115-1143):
// `headerLayoutYs` is a child-index→measured-y map the parent keeps; each header reports its own
// y through `onHeaderLayoutY` as it measures, and we feed every header the y of the NEXT flagged
// header (the collision point past which it scrolls off) by looking up its successor's index in
// `stickyHeaderIndices`. The LAST flagged header has no successor, so its `nextHeaderLayoutY`
// stays undefined and it sticks indefinitely (correct).
export function wrapStickyHeaders(
  children: ReactNode,
  stickyHeaderIndices: number[] | undefined,
  scrollAnimatedValue: AnimatedValue,
  invertStickyHeaders: boolean | undefined,
  scrollViewHeight: number | undefined,
  StickyHeaderComponent: IStickyHeaderComponentType | undefined,
  headerLayoutYs: ReadonlyMap<number, number>,
  onHeaderLayoutY: (index: number, y: number) => void,
): ReactNode {
  if (stickyHeaderIndices === undefined || stickyHeaderIndices.length === 0) return children;
  const Wrapper = StickyHeaderComponent ?? ScrollViewStickyHeader;
  return Children.toArray(children).map((child, index) => {
    const indexOfIndex = stickyHeaderIndices.indexOf(index);
    if (indexOfIndex === -1 || !isValidElement(child)) return child;
    // The next flagged header's measured y, by index order in stickyHeaderIndices (RN
    // ScrollView.js:1695 nextIndex). undefined until that header has measured (or for the last).
    const nextIndex = stickyHeaderIndices[indexOfIndex + 1];
    const nextHeaderLayoutY = nextStickyHeaderY(stickyHeaderIndices, indexOfIndex, headerLayoutYs);
    dlog(
      `ScrollView sticky-header wrap index=${index} next=${nextIndex} nextY=${nextHeaderLayoutY}`,
    );
    return createElement(
      Wrapper,
      {
        key: child.key ?? `sticky-${index}`,
        nextHeaderLayoutY,
        // RN _onStickyHeaderLayout: record this header's own y, then push it to the previous
        // header as its nextHeaderLayoutY. We record into the parent map; the lookup above feeds
        // it forward on the resulting re-render.
        onLayout: (event: ISymbioteEvent): void => {
          const y = readLayoutNumber(event, 'y');
          if (y !== undefined) onHeaderLayoutY(index, y);
        },
        scrollAnimatedValue,
        inverted: invertStickyHeaders,
        scrollViewHeight,
      },
      child,
    );
  });
}
