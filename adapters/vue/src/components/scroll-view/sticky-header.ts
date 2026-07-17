// Sticky headers: the Vue twin of adapters/react/src/scroll-view-sticky-header.tsx, the JS layer
// RN implements in ScrollView.js / ScrollViewStickyHeader.js.
//
// Source-based: RN does stickiness PURELY IN JS. ScrollView.js (render, ~line 1690)
// wraps each child whose index is in `stickyHeaderIndices` in a ScrollViewStickyHeader, fed by a
// single `_scrollAnimatedValue` an Animated.event drives from `onScroll` (ScrollView.js ~line
// 1095). The native Fabric scroll view does NOT honor the index array on its own, so forwarding
// `stickyHeaderIndices` to native is a silent no-op. So we replicate the JS layer: subscribe each
// flagged child to the scroll offset and translate it to stay pinned. The interpolation mirrors
// ScrollViewStickyHeader.js (non-inverted + inverted branches) and lives, framework-agnostic, in
// @symbiote-native/components (computeStickyInterpolation); this file holds the Vue component
// shell, the layout state, and the child-wrapping. Render shared verbatim with React via the math.
// Vue supplies only the reactive lifecycle (refs/watch instead of useState/useEffect).

import {
  defineComponent,
  h,
  isVNode,
  onBeforeUnmount,
  ref,
  shallowRef,
  watchEffect,
  markRaw,
  type Component,
  type SetupContext,
  type VNode,
} from '@vue/runtime-core';
import {
  AnimatedValue,
  AnimatedInterpolation,
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
  type IStickyReducerInputs,
} from '@symbiote-native/components';
import { Animated } from '../../modules/animated';

// A custom StickyHeaderComponent override (RN StickyHeaderComponent) must accept the same shape
// the built-in does: the IStickyHeaderProps fields as props/attrs + the wrapped child as its
// default slot. In Vue that surface is just a Component (the framework-agnostic prop names flow
// through attrs); this alias is the Vue analog of React's ComponentType<StickyHeaderProps>.
export type IStickyHeaderComponentType = Component;

type IUnknownHandler = (...args: readonly unknown[]) => void;

function isHandler(value: unknown): value is IUnknownHandler {
  return typeof value === 'function';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isAnimatedValue(value: unknown): value is AnimatedValue {
  return value instanceof AnimatedValue;
}

// Read this header's wrapped child's own onLayout off its VNode props, so the sticky wrapper can
// forward layout to it (RN ScrollViewStickyHeader.js calls the child's onLayout after its own).
function readChildOnLayout(child: VNode): IUnknownHandler | undefined {
  if (!isRecord(child.props)) return undefined;
  const handler = child.props.onLayout;
  return isHandler(handler) ? handler : undefined;
}

// One sticky header. Measures its own y/height via onLayout, interpolates the shared scroll offset
// into a translateY that keeps it pinned to the top (or bottom, inverted) until the next header
// collides with it, and drives that translate through the native driver when available so the pin
// tracks scroll on the UI thread (no JS jitter). Ported from ScrollViewStickyHeader.js,
// including the Fabric ShadowTree debounce path. inheritAttrs:false so the IStickyHeaderProps
// inputs (scrollAnimatedValue/nextHeaderLayoutY/…) never fall through onto Animated.View and reach
// Fabric as props (scrollAnimatedValue on a host node would crash Android's folly::dynamic).
export const ScrollViewStickyHeader = defineComponent({
  name: 'ScrollViewStickyHeader',
  inheritAttrs: false,
  setup(_props, { attrs, slots }: SetupContext) {
    // The scroll-offset value the parent shares, read once (it is stable across renders, the same
    // markRaw'd AnimatedValue), held by IDENTITY in a const (never run through toReactive). A fresh
    // fallback keeps working if the invariant (wrapStickyHeaders always supplies it) ever breaks.
    const scrollAnimatedValue = isAnimatedValue(attrs.scrollAnimatedValue)
      ? attrs.scrollAnimatedValue
      : markRaw(new AnimatedValue(0));

    // The one folded state cell, mutated in place by reduceSticky. A plain object (NOT a ref /
    // reactive): the render reads it gated by the reactive `version` bump + `animatedTranslateY`
    // shallowRef below, so it never needs Vue to proxy it. The DECISIONS — zero-swallow gate,
    // debounce delay, rebuild ranges — all live in reduceSticky.
    const state = createInitialStickyState();
    // A reactive tick bumped when the reducer commits a new translateY, forcing the render to re-read
    // state.translateY (the debounced committed value).
    const version = ref(0);
    // The animated node that drives the transform (RN's animatedTranslateY). Engine node →
    // shallowRef (held by identity, the reactivity rule); the un-measured identity stub until the
    // rebuild-interpolation effect below replaces it.
    const animatedTranslateY = shallowRef<AnimatedInterpolation>(
      scrollAnimatedValue.interpolate({ inputRange: [-1, 0], outputRange: [0, 0] }),
    );

    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    // The current interpolation node + its listener id, held so the next rebuild detaches the old
    // listener (an engine call the reducer does not own) and onBeforeUnmount cleans up.
    let interpolation: AnimatedInterpolation | undefined;
    let listenerId: string | undefined;

    const inputs = (): IStickyReducerInputs => ({
      os: Platform.OS,
      inverted: typeof attrs.inverted === 'boolean' ? attrs.inverted : undefined,
      scrollViewHeight:
        typeof attrs.scrollViewHeight === 'number' ? attrs.scrollViewHeight : undefined,
      nextHeaderLayoutY:
        typeof attrs.nextHeaderLayoutY === 'number' ? attrs.nextHeaderLayoutY : undefined,
    });

    const runEffects = (effects: IStickyEffect[]): void => {
      for (const effect of effects) {
        switch (effect.kind) {
          case 'rebuild-interpolation': {
            // Detach the old listener, build a fresh interpolation onto the shared scroll value, and
            // wire the settled-value listener (symbiote is always Fabric; RN attaches it only there).
            if (interpolation !== undefined && listenerId !== undefined) {
              interpolation.removeListener(listenerId);
              listenerId = undefined;
            }
            const next = scrollAnimatedValue.interpolate({
              inputRange: effect.inputRange,
              outputRange: effect.outputRange,
            });
            listenerId = next.addListener(({ value }: { value: number | string }): void => {
              if (typeof value === 'number') dispatch({ kind: 'animated-tick', value });
            });
            interpolation = next;
            animatedTranslateY.value = next;
            break;
          }
          case 'schedule-debounce':
            // The animated value updates several times per frame; debounce the settled value into the
            // committed transform so hit detection stays current (a Fabric issue, worse on Android).
            if (debounceTimer !== undefined) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
              debounceTimer = undefined;
              dispatch({ kind: 'debounce-fired', value: effect.value });
            }, effect.delay);
            break;
          case 'apply-passthrough':
            version.value += 1;
            break;
          case 'record-header-y':
            // Vue records through attrs.onLayout (the wrapper closure), which honors the public
            // IStickyHeaderProps contract; the reducer emits no index for it.
            break;
        }
      }
    };

    const dispatch = (action: IStickyAction): void => {
      runEffects(reduceSticky(state, action, inputs()).effects);
    };

    // Rebuild whenever the collision/viewport inputs change (the Vue twin of React's inputs-changed
    // effect, tracking [inverted, scrollViewHeight, nextHeaderLayoutY] via inputs()); also the initial
    // build on mount. scrollAnimatedValue is the stable const (never changes for one ScrollView).
    watchEffect(() => {
      dispatch({ kind: 'inputs-changed' });
    });

    onBeforeUnmount(() => {
      if (interpolation !== undefined && listenerId !== undefined) {
        interpolation.removeListener(listenerId);
      }
      if (debounceTimer !== undefined) clearTimeout(debounceTimer);
    });

    // Stable function ref (defined once, not re-created per render): dispatch the layout (record
    // own y/height, mark measured, rebuild), fire the wrapper's recorder (onHeaderLayoutY, in
    // attrs.onLayout), then the child's own onLayout. Matches RN ScrollViewStickyHeader.js._onLayout.
    const onLayout = (event: ISymbioteEvent): void => {
      const y = readLayoutNumber(event, 'y');
      const height = readLayoutNumber(event, 'height');
      // Keep the previous value when a field is absent (RN sets state only on a defined read).
      dispatch({ kind: 'layout', y: y ?? state.layoutY, height: height ?? state.layoutHeight });
      const recorder = attrs.onLayout;
      if (isHandler(recorder)) recorder(event);
      const children = slots.default !== undefined ? slots.default() : [];
      const child = children[0];
      const childOnLayout = isVNode(child) ? readChildOnLayout(child) : undefined;
      if (childOnLayout !== undefined) childOnLayout(event);
    };

    return () => {
      // Read the version bump so a committed translateY re-runs render.
      void version.value;
      // The EXPLICIT debounced translateY overrides the committed transform for hit-testing, while
      // `animatedTranslateY` does the smooth (native-driven) pin. See RN ScrollViewStickyHeader.js.
      const passthroughAnimatedPropExplicitValues =
        state.translateY !== null
          ? { style: { transform: [{ translateY: state.translateY }] } }
          : null;

      // collapsable:false keeps the wrapper a real Yoga node; zIndex makes the pinned header paint
      // OVER the rows scrolling under it. The interpolation node passes inside the transform; the
      // Animated wrapper's reduceProps rasterizes it into a numeric translateY for the committed tree.
      return h(
        Animated.View,
        {
          style: {
            transform: [{ translateY: animatedTranslateY.value }],
            zIndex: STICKY_HEADER_Z_INDEX,
          },
          onLayout,
          collapsable: false,
          passthroughAnimatedPropExplicitValues,
        },
        { default: () => (slots.default !== undefined ? slots.default() : []) },
      );
    };
  },
});

// Wrap each child flagged by `stickyHeaderIndices` in the sticky header component, fed by the
// shared scroll AnimatedValue. Mirrors ScrollView.js's render-time children.map (~line 1690) and
// the React adapter's wrapStickyHeaders. Returns the children unchanged when no indices are flagged.
//
// Cross-talk plumbing (RN's _headerLayoutYs + _onStickyHeaderLayout, ScrollView.js:1115-1143):
// `headerLayoutYs` is a child-index→measured-y map the parent keeps; each header reports its own y
// through `onHeaderLayoutY` as it measures, and we feed every header the y of the NEXT flagged
// header (the collision point past which it scrolls off) by looking up its successor's index in
// `stickyHeaderIndices`. The LAST flagged header has no successor, so its `nextHeaderLayoutY` stays
// undefined and it sticks indefinitely (correct).
export function wrapStickyHeaders(
  children: VNode[],
  stickyHeaderIndices: number[] | undefined,
  scrollAnimatedValue: AnimatedValue,
  invertStickyHeaders: boolean | undefined,
  scrollViewHeight: number | undefined,
  StickyHeaderComponent: IStickyHeaderComponentType | undefined,
  headerLayoutYs: ReadonlyMap<number, number>,
  onHeaderLayoutY: (index: number, y: number) => void,
): VNode[] {
  if (stickyHeaderIndices === undefined || stickyHeaderIndices.length === 0) return children;
  const Wrapper = StickyHeaderComponent ?? ScrollViewStickyHeader;
  return children.map((child, index) => {
    const indexOfIndex = stickyHeaderIndices.indexOf(index);
    if (indexOfIndex === -1 || !isVNode(child)) return child;
    // The next flagged header's measured y, by index order in stickyHeaderIndices (RN
    // ScrollView.js:1695 nextIndex). undefined until that header has measured (or for the last).
    const nextIndex = stickyHeaderIndices[indexOfIndex + 1];
    const nextHeaderLayoutY = nextStickyHeaderY(stickyHeaderIndices, indexOfIndex, headerLayoutYs);
    dlog(
      `Vue ScrollView sticky-header wrap index=${index} next=${nextIndex} nextY=${nextHeaderLayoutY}`,
    );
    const props: IStickyHeaderProps & { key: string | number | symbol } = {
      key: child.key ?? `sticky-${index}`,
      nextHeaderLayoutY,
      // RN _onStickyHeaderLayout: record this header's own y, then push it to the previous header as
      // its nextHeaderLayoutY. We record into the parent map; the lookup above feeds it forward on
      // the resulting re-render (the headerLayoutYs bump in scroll-view-shared).
      onLayout: (event: ISymbioteEvent): void => {
        const y = readLayoutNumber(event, 'y');
        if (y !== undefined) onHeaderLayoutY(index, y);
      },
      scrollAnimatedValue,
      inverted: invertStickyHeaders,
      scrollViewHeight,
    };
    return h(Wrapper, props, { default: () => [child] });
  });
}
