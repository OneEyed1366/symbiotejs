// ScrollView, the Vue lifecycle half (Phase 1: base, ADR 0024). The Fabric tree is nested:
// a scroll view wraps a content view that holds the children (RN's ScrollView.js shape). The
// platform-invariant math (decelerationRate, the per-axis intrinsics/base style, the
// content-size dedupe, the imperative handle, the aria/role fold) lives in @symbiote/components,
// shared verbatim with React. Here Vue supplies only the reactivity: a shallowRef holds the host
// node, a setup-scope `lastContentSize` dedupes onContentSizeChange, and expose() wires the
// imperative handle. This is the Vue twin of the React adapter's useRef + buildScrollViewHandle.
//
// Inputs arrive as attrs (untyped), so each is narrowed with a runtime guard rather than a cast.
// onContentSizeChange MUST be consumed (it is NOT a ViewConfig event; forwarding a function prop
// would reach Fabric and crash Android's folly::dynamic). Scroll events (onScroll/onLayout/…) ARE
// ViewConfig events, so they forward raw and routeProp turns them into listeners.
//
// Phase 2 (ADR 0024 §4): RefreshControl is wired through the platform assemble (iOS sibling /
// Android wrap). Phase 3 (§5): sticky headers are real. The scroll AnimatedValue (markRaw, held by
// identity), the headerLayoutYs cross-talk map + bump, the viewport-height capture, and the
// onScroll composition (native attach vs Animated.event) all live here; the per-header component and
// the children wrap live in scroll-view-sticky-header.ts (the Vue twin of the React file).

import {
  defineComponent,
  h,
  isVNode,
  markRaw,
  onBeforeUnmount,
  ref,
  shallowRef,
  watch,
  type Component,
  type SetupContext,
  type VNode,
} from '@vue/runtime-core';
import {
  attachStickyScroll,
  buildScrollViewHandle,
  didContentSizeChange,
  forwardScrollEvent,
  readLayoutDimension,
  resolveAccessibilityProps,
  resolveDecelerationRate,
  selectScrollIntrinsics,
  type IAccessibilityProps,
  type IAriaProps,
  type IContentSize,
  type ISymbioteIntrinsic,
} from '@symbiote/components';
import {
  AnimatedValue,
  dlog,
  event as animatedEvent,
  isNativeAnimatedAvailable,
  isSymbioteNode,
  type IStyleProp,
  type ISymbioteEvent,
  type ISymbioteNode,
  type IViewStyle,
} from '@symbiote/engine';
import { wrapStickyHeaders, type IStickyHeaderComponentType } from './sticky-header';
import { normalizeVueAttrs } from '../normalize-attrs';

export type { IScrollViewHandle } from '@symbiote/components';

type IScrollHandler = (event: ISymbioteEvent) => void;
type IContentSizeHandler = (width: number, height: number) => void;

// The Vue-facing prop surface. React's ScrollViewProps is React-coupled (ReactNode children,
// ReactElement refreshControl); Vue takes children via slots, so this mirrors the same
// pass-through surface minus those. Every prop is accepted and typed even when Phase 1 ignores
// it (refreshControl/stickyHeaderIndices/…), so app code type-checks against the full surface now.
export interface IScrollViewProps extends IAccessibilityProps, IAriaProps {
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
  // The RefreshControl element (Vue VNode). iOS renders it as a sibling before content; Android
  // re-invokes its type to wrap the scroll view (ADR 0024 Phase 2).
  refreshControl?: VNode;
  removeClippedSubviews?: boolean;
  // Fired when the content container's size changes, synthesized in JS from the inner content
  // view's onLayout (RN _handleContentOnLayout); the native scroll view has no such event.
  onContentSizeChange?: IContentSizeHandler;
  // Snap / paging family: forwarded straight to the native scroll view.
  snapToInterval?: number;
  snapToOffsets?: number[];
  snapToAlignment?: 'start' | 'center' | 'end';
  snapToStart?: boolean;
  snapToEnd?: boolean;
  disableIntervalMomentum?: boolean;
  // Sticky headers: RN implements stickiness PURELY IN JS (ScrollView.js wraps each flagged child
  // in ScrollViewStickyHeader, driven by the scroll offset). The native scroll view does NOT honor
  // an index array, so we wrap the children here too rather than forward `stickyHeaderIndices` to
  // native (a silent no-op). The keyboard props below ARE read by native directly. (Phase 3.)
  stickyHeaderIndices?: number[];
  // Stick to the BOTTOM instead of the top (RN invertStickyHeaders), used by inverted lists.
  invertStickyHeaders?: boolean;
  // Override the wrapper component for sticky headers (RN StickyHeaderComponent), e.g. a SectionList
  // header. Defaults to the built-in sticky header.
  StickyHeaderComponent?: IStickyHeaderComponentType;
  keyboardDismissMode?: 'none' | 'on-drag' | 'interactive';
  keyboardShouldPersistTaps?: boolean | 'always' | 'never' | 'handled';
  maintainVisibleContentPosition?: {
    minIndexForVisible: number;
    autoscrollToTopThreshold?: number;
  };
  // iOS-only forwarding props (harmless on Android: its manager ignores unknown props).
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
  // Android-only forwarding props (harmless on iOS).
  nestedScrollEnabled?: boolean;
  overScrollMode?: 'auto' | 'always' | 'never';
  fadingEdgeLength?: number;
  persistentScrollbar?: boolean;
  endFillColor?: string;
  onLayout?: IScrollHandler;
  onScroll?: IScrollHandler;
  onScrollBeginDrag?: IScrollHandler;
  onScrollEndDrag?: IScrollHandler;
  onMomentumScrollBegin?: IScrollHandler;
  onMomentumScrollEnd?: IScrollHandler;
  // iOS-only: user tapped the status bar to scroll to top. Inert on Android.
  onScrollToTop?: IScrollHandler;
}

// The platform piece: how the .ios/.android files assemble the final element. The RefreshControl
// integration diverges by platform (ADR 0020/0024): iOS places it as a SIBLING before content,
// Android WRAPS the scroll view with it (+ splitLayoutProps style routing). Supplied whole by
// scroll-view.ios.ts / scroll-view.android.ts (Metro filename-selected).
export interface IScrollViewAssembleInput {
  scrollViewIntrinsic: ISymbioteIntrinsic;
  // Base scroll props (outerProps + style:[base,user] + ref). The iOS sibling path and the Android
  // no-refresh path use these as-is; the Android wrap rebuilds the inner view from the pieces below.
  scrollProps: Record<string, unknown>;
  content: VNode;
  // The user's RefreshControl element (the parity-equivalent of React's refreshControl={<RefreshControl/>}).
  // undefined when absent. iOS renders it as-is before content; Android re-invokes its type to WRAP the
  // scroll view (Vue has no cloneElement) using the rebuild pieces below.
  refreshControl: VNode | undefined;
  // Pieces the Android wrap needs to rebuild the inner scroll view with a splitLayoutProps style:
  scrollViewBaseStyle: IViewStyle;
  userStyle: IStyleProp<IViewStyle> | undefined;
  // The scroll props WITHOUT style/ref: the wrap re-composes the inner (visual) style + the SAME
  // node ref onto the inner scroll view, so dispatchViewCommand keeps targeting it.
  scrollOuterProps: Record<string, unknown>;
  setNodeRef: (el: unknown) => void;
}
export interface IScrollViewPlatform {
  assemble: (input: IScrollViewAssembleInput) => VNode;
}

type IUnknownHandler = (...args: readonly unknown[]) => void;

function isHandler(value: unknown): value is IUnknownHandler {
  return typeof value === 'function';
}

// Objects and arrays are valid StyleProp<ViewStyle> (ViewStyle | RecursiveArray | falsy; the
// engine omits RN's RegisteredStyle brand, so no numeric form). Primitives/null degrade to
// undefined; the engine flattens whatever object/array reaches it.
function isStyleProp(value: unknown): value is IStyleProp<IViewStyle> {
  return typeof value === 'object' && value !== null;
}

// decelerationRate is resolved per-platform (resolveDecelerationRate), so it must be narrowed to
// its declared shape before that call, unlike the raw pass-through props.
function asDecelerationRate(value: unknown): 'normal' | 'fast' | number | undefined {
  if (typeof value === 'number') return value;
  if (value === 'normal' || value === 'fast') return value;
  return undefined;
}

// stickyHeaderIndices arrives untyped (attrs); narrow to a number[] before the wrap reads it.
function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(entry => typeof entry === 'number');
}

// A StickyHeaderComponent override is a Vue component: a function (functional) or an object
// (defineComponent). Narrowed before it is handed to wrapStickyHeaders (no cast).
function isComponent(value: unknown): value is Component {
  return typeof value === 'function' || (typeof value === 'object' && value !== null);
}

// The prop/handler keys the lifecycle consumes itself; everything else (the scroll events,
// snap/keyboard/zoom families, accessibility, testID, …) forwards onto the scroll-view node.
// onContentSizeChange is consumed (synthesized from the content onLayout, never forwarded);
// refreshControl is consumed by the platform assemble; the sticky-header props (indices / invert /
// StickyHeaderComponent) are lifecycle-consumed by the children wrap and must NEVER reach Fabric.
// style / contentContainerStyle / horizontal / decelerationRate are recomposed.
const HANDLED_ATTRS = [
  'style',
  'contentContainerStyle',
  'horizontal',
  'decelerationRate',
  'onContentSizeChange',
  'refreshControl',
  'stickyHeaderIndices',
  'invertStickyHeaders',
  'StickyHeaderComponent',
];

// The forwarded bag carries the aria/role aliases, so it is typed as the a11y intersection (a
// genuine narrowing, not a cast: the accumulator is BUILT at that type); resolveAccessibilityProps
// then folds aria-* into accessibility* over it before it reaches the host node.
type IForwardBag = IAccessibilityProps & IAriaProps & Record<string, unknown>;

function forwardAttrs(attrs: Record<string, unknown>): IForwardBag {
  const result: IForwardBag = {};
  for (const key of Object.keys(attrs)) {
    if (!HANDLED_ATTRS.includes(key)) result[key] = attrs[key];
  }
  return result;
}

export function createScrollView(platform: IScrollViewPlatform) {
  return defineComponent({
    name: 'ScrollView',
    inheritAttrs: false,
    setup(_props, { slots, attrs: rawAttrs, expose }: SetupContext) {
      // shallowRef, NOT ref: the engine node must be held by IDENTITY. A plain ref() runs the
      // node through Vue's toReactive(), handing back a reactive Proxy, a different object than
      // the raw node the engine's mirror (a WeakMap) is keyed on, so dispatchViewCommand would
      // miss and every scrollTo/scrollToEnd/flashScrollIndicators silently no-op. See
      // .claude/skills/vue-adapter-reactivity. This is the same rule as the Switch host node.
      const nodeRef = shallowRef<ISymbioteNode | null>(null);
      const setNodeRef = (el: unknown): void => {
        nodeRef.value = isSymbioteNode(el) ? el : null;
      };

      // The imperative handle reads the node through a LAZY getter (() => nodeRef.value), not the
      // node captured once: it is null until the element commits, so an eager capture would freeze
      // null and every command would no-op (ADR 0024 §3). expose() makes it the value a parent ref
      // sees: the Vue twin of React's useImperativeHandle(forwardedRef, buildScrollViewHandle(…)).
      expose(buildScrollViewHandle(() => nodeRef.value));

      // The last-seen content size, kept here (setup scope, persists across renders) to dedupe
      // onContentSizeChange: RN fires the content onLayout on every layout pass; only real size
      // changes reach the user handler (didContentSizeChange).
      let lastContentSize: IContentSize | null = null;

      // A single AnimatedValue tracks the scroll offset and drives every sticky header's translateY
      // (RN's _scrollAnimatedValue). A setup-scope const (allocated once, stable across renders) so
      // the headers' bindings survive re-renders, the Vue twin of React's useRef-stable value.
      // markRaw: it is an engine object, held by IDENTITY, never run through toReactive (the
      // reactivity rule; a deep ref would hand back a Proxy the engine's mirror misses). Allocated
      // unconditionally (like React's unconditional hook); unused when no sticky headers are flagged.
      const scrollAnimatedValue = markRaw(new AnimatedValue(0));

      // Inverted sticky headers stick to the BOTTOM, so they need the viewport height (RN reads it
      // in _handleLayout). Tracked here and fed back into the wrapped headers on the next render.
      const viewportHeight = ref<number | undefined>(undefined);

      // Sticky-header cross-talk (RN ScrollView.js _headerLayoutYs, line 754): a child-index→measured-y
      // map the parent keeps so each header can learn where the NEXT sticky header starts (its push-off
      // collision point). The map is a setup-scope const mutated imperatively from each header's onLayout
      // (like RN's _onStickyHeaderLayout); a reactive bump ref forces the re-render that feeds the
      // freshly-recorded y forward into the previous header's nextHeaderLayoutY (via nextStickyHeaderY).
      const headerLayoutYs = new Map<number, number>();
      const bumpHeaderLayout = ref(0);
      const onHeaderLayoutY = (index: number, y: number): void => {
        if (headerLayoutYs.get(index) === y) return;
        headerLayoutYs.set(index, y);
        dlog(`Vue ScrollView sticky-header layoutY index=${index} y=${y}`);
        bumpHeaderLayout.value += 1;
      };

      // Native sticky-scroll attach (RN attachNativeEvent / _updateAnimatedNodeAttachment): when the
      // native module is available, the scroll value is driven on the UI thread so the interpolations
      // ride scroll natively (no JS jitter). A plain flag set in render (like createAnimatedComponent's
      // wantsNative: non-reactive so writing it in render triggers no effect); the post-commit watch
      // reads it once the node commits. The JS path needs no attach: Animated.event drives the value
      // each frame. flush:'post' so the engine has committed the node before attachStickyScroll reads
      // its Fabric handle. Detached on unmount (and re-detached if the node identity changes).
      let nativeStickyWanted = false;
      let detachStickyScroll: (() => void) | undefined;
      watch(
        () => nodeRef.value,
        node => {
          if (detachStickyScroll !== undefined) {
            detachStickyScroll();
            detachStickyScroll = undefined;
          }
          if (!nativeStickyWanted || node === null) return;
          detachStickyScroll = attachStickyScroll(node, scrollAnimatedValue);
        },
        { flush: 'post' },
      );
      onBeforeUnmount(() => {
        if (detachStickyScroll !== undefined) detachStickyScroll();
      });

      return () => {
        // Read the bump so a recorded header y re-runs render and feeds nextStickyHeaderY forward.
        void bumpHeaderLayout.value;
        // Fold kebab template props (:content-container-style) to the RN camelCase contract; idiomatic
        // Vue templates use kebab, but the prop surface (and HANDLED_ATTRS below) is camelCase.
        const attrs = normalizeVueAttrs(rawAttrs);
        const isHorizontal = attrs.horizontal === true;
        const userStyle = isStyleProp(attrs.style) ? attrs.style : undefined;
        const contentContainerStyle = isStyleProp(attrs.contentContainerStyle)
          ? attrs.contentContainerStyle
          : undefined;

        // Sticky headers (Phase 3, ADR 0024): a pure-JS layer; the native scroll view ignores
        // stickyHeaderIndices, so we wrap the flagged children below and drive their translateY off
        // the scroll offset. invertStickyHeaders narrows to the inverted (stick-to-bottom) branch.
        const stickyHeaderIndices = isNumberArray(attrs.stickyHeaderIndices)
          ? attrs.stickyHeaderIndices
          : undefined;
        const hasStickyHeaders =
          stickyHeaderIndices !== undefined && stickyHeaderIndices.length > 0;
        const invertStickyHeaders = attrs.invertStickyHeaders === true ? true : undefined;
        const stickyHeaderComponent = isComponent(attrs.StickyHeaderComponent)
          ? attrs.StickyHeaderComponent
          : undefined;

        const { scrollViewIntrinsic, contentIntrinsic, scrollViewBaseStyle, contentStyle } =
          selectScrollIntrinsics(isHorizontal, contentContainerStyle);

        // Outer props: fold aria/role, then layer the lifecycle-managed values on top. RN defaults
        // nested scrolling ON (ScrollView.js `nestedScrollEnabled ?? true`); horizontal forwards
        // only when defined (load-bearing on iOS's RCTScrollView axis, ignored by Android's
        // dedicated manager); decelerationRate is resolved per-platform.
        const outerProps: Record<string, unknown> = {
          ...resolveAccessibilityProps(forwardAttrs(attrs)),
        };
        outerProps.nestedScrollEnabled =
          typeof attrs.nestedScrollEnabled === 'boolean' ? attrs.nestedScrollEnabled : true;
        if (attrs.horizontal !== undefined) outerProps.horizontal = attrs.horizontal;
        const decel = asDecelerationRate(attrs.decelerationRate);
        if (decel !== undefined) outerProps.decelerationRate = resolveDecelerationRate(decel);

        // onScroll: when sticky headers are active, the offset must reach the AnimatedValue. RN does
        // the same with _scrollAnimatedValueAttachment. forwardAttrs already put the user's onScroll /
        // onLayout / scrollEventThrottle on outerProps; here we override them for the sticky branch.
        const nativeStickyAvailable = hasStickyHeaders && isNativeAnimatedAvailable();
        nativeStickyWanted = nativeStickyAvailable;
        if (hasStickyHeaders) {
          const userOnScroll = isHandler(attrs.onScroll) ? attrs.onScroll : undefined;
          const userThrottle =
            typeof attrs.scrollEventThrottle === 'number' ? attrs.scrollEventThrottle : undefined;
          if (nativeStickyAvailable) {
            // Native path (RN attachNativeEvent): the scroll value is driven on the UI thread by the
            // post-commit watch above, so onScroll only forwards to the user: zero JS per frame. RN
            // uses throttle 1 when sticky (ScrollView.js:1798); the native driver can afford it. The
            // user onScroll is already on outerProps via forwardAttrs.
            outerProps.scrollEventThrottle = userThrottle ?? 1;
          } else {
            // JS fallback (no native module): Animated.event drives the value each frame and forwards
            // the user's handler as the listener passthrough. Correct, but lags a frame under fast
            // scroll (the jitter), which the native path above removes on a real host.
            outerProps.onScroll = animatedEvent(
              [{ nativeEvent: { contentOffset: { y: scrollAnimatedValue } } }],
              userOnScroll === undefined
                ? undefined
                : { listener: (...args) => forwardScrollEvent(userOnScroll, args) },
            );
            outerProps.scrollEventThrottle = userThrottle ?? 16;
          }
          // onLayout on the scroll-view node: capture the viewport height for inverted sticky headers
          // (RN _handleLayout), then call the user's handler. Non-inverted leaves onLayout as forwarded.
          if (invertStickyHeaders === true) {
            const userOnLayout = isHandler(attrs.onLayout) ? attrs.onLayout : undefined;
            outerProps.onLayout = (event: ISymbioteEvent): void => {
              const height = readLayoutDimension(event, 'height');
              if (height !== undefined) viewportHeight.value = height;
              if (userOnLayout !== undefined) userOnLayout(event);
            };
          }
        }

        dlog(
          `Vue ScrollView -> ${scrollViewIntrinsic} (horizontal=${isHorizontal} sticky=${hasStickyHeaders})`,
        );

        // Content props: `collapsable: false` keeps the layout-only content view as a real native
        // view: Android Fabric view-flattens it away otherwise, hoisting the cells as direct
        // children of the scroll view (which hosts exactly one), an addViewAt crash. collapsableChildren
        // false also preserves the cell views maintainVisibleContentPosition / snapToAlignment
        // anchor against (RN preserveChildren). iOS never flattens; both are no-ops there.
        const contentProps: Record<string, unknown> = { style: contentStyle, collapsable: false };
        if (
          attrs.maintainVisibleContentPosition !== undefined ||
          attrs.snapToAlignment !== undefined
        ) {
          contentProps.collapsableChildren = false;
        }
        // onContentSizeChange is synthesized from the content view's own onLayout (RN
        // _handleContentOnLayout): read width/height, fire only on a real size change (dedupe via
        // the setup-scope lastContentSize). The handler reads onContentSizeChange off attrs LIVE so
        // a re-supplied handler is honored.
        if (isHandler(attrs.onContentSizeChange)) {
          contentProps.onLayout = (event: ISymbioteEvent): void => {
            const width = readLayoutDimension(event, 'width');
            const height = readLayoutDimension(event, 'height');
            if (width === undefined || height === undefined) return;
            if (!didContentSizeChange(lastContentSize, { width, height })) return;
            lastContentSize = { width, height };
            dlog(`Vue ScrollView onContentSizeChange ${width}x${height}`);
            const handler = attrs.onContentSizeChange;
            if (isHandler(handler)) handler(width, height);
          };
        }

        // Sticky headers are a pure-JS layer (the native scroll view ignores stickyHeaderIndices);
        // wrap the flagged children so they pin to the scroll offset. No-op when none are flagged.
        const slotChildren = slots.default !== undefined ? slots.default() : [];
        const contentChildren = hasStickyHeaders
          ? wrapStickyHeaders(
              slotChildren,
              stickyHeaderIndices,
              scrollAnimatedValue,
              invertStickyHeaders,
              viewportHeight.value,
              stickyHeaderComponent,
              headerLayoutYs,
              onHeaderLayoutY,
            )
          : slotChildren;

        const content = h(contentIntrinsic, contentProps, contentChildren);

        // Base style UNDER user style so an explicit user value (height, flexDirection) still wins;
        // the scroll node carries overflow:'scroll' (frame clipping) + the per-axis flexDirection.
        const scrollProps: Record<string, unknown> = {
          ...outerProps,
          style: [scrollViewBaseStyle, userStyle],
          ref: setNodeRef,
        };

        // refreshControl arrives as a Vue VNode the app passes (h(RefreshControl, …)); narrow it
        // with isVNode (no cast). Stripped from forwardAttrs (it is in HANDLED_ATTRS) so it never
        // reaches the host as a prop: it is lifecycle-consumed by the platform assemble.
        const refreshControl = isVNode(attrs.refreshControl) ? attrs.refreshControl : undefined;

        return platform.assemble({
          scrollViewIntrinsic,
          scrollProps,
          content,
          refreshControl,
          scrollViewBaseStyle,
          userStyle,
          scrollOuterProps: outerProps,
          setNodeRef,
        });
      };
    },
  });
}
