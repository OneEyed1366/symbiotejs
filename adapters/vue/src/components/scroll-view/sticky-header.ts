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
// @symbiotejs/components (computeStickyInterpolation, ADR 0024); this file holds the Vue component
// shell, the layout state, and the child-wrapping. Render shared verbatim with React via the math.
// Vue supplies only the reactive lifecycle (refs/watch instead of useState/useEffect).

import {
  defineComponent,
  h,
  isVNode,
  ref,
  shallowRef,
  watch,
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
} from '@symbiotejs/engine';
import {
  computeStickyInterpolation,
  nextStickyHeaderY,
  readLayoutNumber,
  stickyDebounceMs,
  STICKY_HEADER_Z_INDEX,
  type IStickyHeaderProps,
} from '@symbiotejs/components';
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

    const measured = ref(false);
    const layoutY = ref(0);
    const layoutHeight = ref(0);
    // The animated node that drives the transform (RN's animatedTranslateY). When the scroll value
    // is native (attachStickyScroll), this interpolation runs on the UI thread: the smooth pin.
    // Engine node → shallowRef (held by identity, the reactivity rule); the un-measured identity
    // stub until the effect below rebuilds it. See .claude/skills/vue-adapter-reactivity.
    const animatedTranslateY = shallowRef<AnimatedInterpolation>(
      scrollAnimatedValue.interpolate({ inputRange: [-1, 0], outputRange: [0, 0] }),
    );
    // The debounced EXPLICIT translateY pushed to the committed transform via
    // passthroughAnimatedPropExplicitValues, so the Fabric ShadowTree (hit-testing) knows the pinned
    // position while the native driver animates. null until the listener first fires.
    const translateY = ref<number | null>(null);
    let haveReceivedInitialZeroTranslateY = true;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;

    watch(translateY, value => {
      if (value !== 0 && value !== null) haveReceivedInitialZeroTranslateY = false;
    });

    // The animated value updates several times per frame during scroll; debounce it and push the
    // settled value into the committed transform so hit detection stays current (RN: a Fabric-only
    // issue; symbiote is always Fabric, and worse on Android).
    const animatedValueListener = ({ value }: { value: number | string }): void => {
      if (typeof value !== 'number') return;
      const timeout = stickyDebounceMs(Platform.OS);
      // A freshly-rebuilt interpolation re-emits 0 to its listeners; swallow that first zero (RN).
      if (value === 0 && !haveReceivedInitialZeroTranslateY) {
        haveReceivedInitialZeroTranslateY = true;
        return;
      }
      if (debounceTimer !== undefined) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        translateY.value = value;
      }, timeout);
    };

    // Rebuild the interpolation whenever the layout / collision inputs change (the Vue twin of RN's
    // effect, deps [measured, layoutY, layoutHeight, scrollViewHeight, nextHeaderLayoutY, inverted]).
    // symbiote is always Fabric: listen to the settled value to keep the ShadowTree transform current
    // for hit-testing (RN attaches this listener only under Fabric). scrollAnimatedValue is the stable
    // const (RN lists it in deps; it never changes for one ScrollView, so the const is faithful).
    watchEffect(onCleanup => {
      const inverted = typeof attrs.inverted === 'boolean' ? attrs.inverted : undefined;
      const scrollViewHeight =
        typeof attrs.scrollViewHeight === 'number' ? attrs.scrollViewHeight : undefined;
      const nextHeaderLayoutY =
        typeof attrs.nextHeaderLayoutY === 'number' ? attrs.nextHeaderLayoutY : undefined;
      const { inputRange, outputRange } = computeStickyInterpolation({
        measured: measured.value,
        inverted,
        scrollViewHeight,
        layoutY: layoutY.value,
        layoutHeight: layoutHeight.value,
        nextHeaderLayoutY,
      });
      const interpolation = scrollAnimatedValue.interpolate({ inputRange, outputRange });
      const listenerId = interpolation.addListener(animatedValueListener);
      animatedTranslateY.value = interpolation;
      onCleanup(() => {
        interpolation.removeListener(listenerId);
        if (debounceTimer !== undefined) clearTimeout(debounceTimer);
      });
    });

    // Stable function ref (defined once, not re-created per render): record own y/height, mark
    // measured, fire the wrapper's recorder (onHeaderLayoutY, in attrs.onLayout), then the child's
    // own onLayout. Matches RN ScrollViewStickyHeader.js._onLayout order.
    const onLayout = (event: ISymbioteEvent): void => {
      const y = readLayoutNumber(event, 'y');
      const height = readLayoutNumber(event, 'height');
      if (y !== undefined) layoutY.value = y;
      if (height !== undefined) layoutHeight.value = height;
      measured.value = true;
      const recorder = attrs.onLayout;
      if (isHandler(recorder)) recorder(event);
      const children = slots.default !== undefined ? slots.default() : [];
      const child = children[0];
      const childOnLayout = isVNode(child) ? readChildOnLayout(child) : undefined;
      if (childOnLayout !== undefined) childOnLayout(event);
    };

    return () => {
      // The EXPLICIT debounced translateY overrides the committed transform for hit-testing, while
      // `animatedTranslateY` does the smooth (native-driven) pin. See RN ScrollViewStickyHeader.js.
      const passthroughAnimatedPropExplicitValues =
        translateY.value !== null
          ? { style: { transform: [{ translateY: translateY.value }] } }
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
