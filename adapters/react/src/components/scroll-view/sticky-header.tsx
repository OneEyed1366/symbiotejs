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
  useReducer,
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
  createInitialStickyState,
  nextStickyHeaderY,
  readLayoutNumber,
  reduceSticky,
  STICKY_HEADER_Z_INDEX,
  type IStickyAction,
  type IStickyEffect,
  type IStickyHeaderProps,
  type IStickyHeaderState,
  type IStickyReducerInputs,
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
// the pin tracks scroll on the UI thread (no JS jitter). The DECISIONS — the zero-swallow gate, the
// debounce delay, the rebuild-on-input-change ranges — live in `reduceSticky`
// (@symbiote-native/components); this component supplies only the React lifecycle: the ONE folded
// state cell, the interpolation-node + listener wiring, the debounce setTimeout, and the re-render.
export const ScrollViewStickyHeader: IStickyHeaderComponentType = props => {
  const { inverted, scrollViewHeight, scrollAnimatedValue, nextHeaderLayoutY, children } = props;

  // The one folded state cell (RN's scattered useState/useRef collapsed into IStickyHeaderState),
  // mutated in place by reduceSticky. Lazily created once.
  const stateRef = useRef<IStickyHeaderState | null>(null);
  const state = (stateRef.current ??= createInitialStickyState());
  const [, forceRender] = useReducer((tick: number): number => tick + 1, 0);

  // The animated node that drives the transform (RN's animatedTranslateY), rebuilt by the
  // rebuild-interpolation effect. When the scroll value is native, this interpolation runs on the
  // UI thread: the smooth pin.
  const [animatedTranslateY, setAnimatedTranslateY] = useState<AnimatedInterpolation>(() =>
    scrollAnimatedValue.interpolate({ inputRange: [-1, 0], outputRange: [0, 0] }),
  );

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The current interpolation node + its settled-value listener id, held so the next rebuild can
  // detach the old listener (engine calls the reducer does NOT own) and unmount can clean up.
  const interpolationRef = useRef<AnimatedInterpolation | null>(null);
  const listenerIdRef = useRef<string | null>(null);

  const inputsRef = useRef<IStickyReducerInputs>({
    os: Platform.OS,
    inverted,
    scrollViewHeight,
    nextHeaderLayoutY,
  });
  inputsRef.current = { os: Platform.OS, inverted, scrollViewHeight, nextHeaderLayoutY };

  // dispatch reaches through a ref because the effect executors dispatch follow-up actions
  // (the listener -> animated-tick, the debounce timer -> debounce-fired).
  const dispatchRef = useRef<(action: IStickyAction) => void>(() => {});

  const runEffects = useCallback(
    (effects: IStickyEffect[]): void => {
      for (const effect of effects) {
        switch (effect.kind) {
          case 'rebuild-interpolation': {
            // Detach the old listener, build a fresh interpolation onto the shared scroll value, and
            // wire the settled-value listener (symbiote is always Fabric; RN attaches it only there).
            const previous = interpolationRef.current;
            if (previous !== null && listenerIdRef.current !== null) {
              previous.removeListener(listenerIdRef.current);
              listenerIdRef.current = null;
            }
            const next = scrollAnimatedValue.interpolate({
              inputRange: effect.inputRange,
              outputRange: effect.outputRange,
            });
            listenerIdRef.current = next.addListener(({ value }): void => {
              if (typeof value === 'number') dispatchRef.current({ kind: 'animated-tick', value });
            });
            interpolationRef.current = next;
            setAnimatedTranslateY(next);
            break;
          }
          case 'schedule-debounce': {
            // The animated value updates several times per frame; debounce the settled value into the
            // committed transform so hit detection stays current (a Fabric issue, worse on Android).
            if (debounceTimer.current !== null) clearTimeout(debounceTimer.current);
            debounceTimer.current = setTimeout(() => {
              debounceTimer.current = null;
              dispatchRef.current({ kind: 'debounce-fired', value: effect.value });
            }, effect.delay);
            break;
          }
          case 'apply-passthrough':
            forceRender();
            break;
          case 'record-header-y':
            // React records through the wrapper's onLayout closure (props.onLayout, below), which
            // honors the public IStickyHeaderProps contract; the reducer emits no index for it.
            break;
        }
      }
    },
    [scrollAnimatedValue],
  );

  const dispatch = useCallback(
    (action: IStickyAction): void => {
      const current = stateRef.current;
      if (current === null) return;
      runEffects(reduceSticky(current, action, inputsRef.current).effects);
    },
    [runEffects],
  );
  dispatchRef.current = dispatch;

  // Rebuild when the collision/viewport inputs change (RN effect deps minus the layout state, which
  // dispatches 'layout' itself); also does the initial identity build on mount.
  useEffect(() => {
    dispatchRef.current({ kind: 'inputs-changed' });
  }, [inverted, scrollViewHeight, nextHeaderLayoutY, scrollAnimatedValue]);

  // Detach the listener + clear the debounce on unmount.
  useEffect(
    () => (): void => {
      const previous = interpolationRef.current;
      if (previous !== null && listenerIdRef.current !== null)
        previous.removeListener(listenerIdRef.current);
      if (debounceTimer.current !== null) clearTimeout(debounceTimer.current);
    },
    [],
  );

  const onLayout = (event: ISymbioteEvent): void => {
    const y = readLayoutNumber(event, 'y');
    const height = readLayoutNumber(event, 'height');
    // Keep the previous value when a field is absent (RN sets state only on a defined read).
    dispatch({ kind: 'layout', y: y ?? state.layoutY, height: height ?? state.layoutHeight });
    props.onLayout(event);
    const child = firstChild(children);
    const childOnLayout = child === undefined ? undefined : readChildOnLayout(child);
    childOnLayout?.(event);
  };

  // The EXPLICIT debounced translateY overrides the committed transform for hit-testing, while
  // `animatedTranslateY` does the smooth (native-driven) pin, per RN ScrollViewStickyHeader.js.
  const passthroughAnimatedPropExplicitValues =
    state.translateY !== null ? { style: { transform: [{ translateY: state.translateY }] } } : null;

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
