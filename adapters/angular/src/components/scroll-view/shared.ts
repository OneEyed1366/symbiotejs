// ScrollView, the Angular lifecycle half. The Fabric tree is nested: a scroll view
// wraps a content view that holds the children (RN's ScrollView.js shape). The platform-invariant
// math (decelerationRate, the per-axis intrinsics/base style, the content-size dedupe, the
// imperative handle, the native sticky scroll-attach, the aria/role fold) lives in
// @symbiote-native/components, shared verbatim with React/Vue. Here Angular supplies only the lifecycle:
// the host node held by IDENTITY through a directive's ElementRef, a forwarded-prop bag set onto
// that node through Renderer2 (-> routeProp), the imperative handle (scrollTo/scrollToEnd/
// flashScrollIndicators), the content-size dedupe, and the native sticky scroll-attach wired
// through whenCommitted. This is the Angular twin of the React useRef + Vue shallowRef host.
//
// What diverges per platform, how a RefreshControl integrates, stays in the
// .ios/.android files (Metro filename-selected): iOS renders the RefreshControl as a SIBLING
// before the content container; on Android an AndroidSwipeRefreshLayout WRAPS the scroll view.
//
// Angular cannot transform <ng-content> children in the template the way React children.map /
// Vue slots() can, so ScrollView owns a tiny projection bridge: the content host registers a
// ScrollViewProjectionController with the Angular renderer, and the renderer wraps direct projected
// children whose indices match stickyHeaderIndices. Android RefreshControl projection is handled by
// re-rendering the projected component's native prop surface as the wrapper around the scroll view
// (RN's Android shape), while excluding the original projected node from the content slot.

import {
  Directive,
  ElementRef,
  EventEmitter,
  Output,
  ViewChild,
  ContentChild,
  inject,
  type AfterViewInit,
  type OnDestroy,
} from '@angular/core';
import {
  attachStickyScroll,
  buildScrollViewHandle,
  didContentSizeChange,
  forwardScrollEvent,
  readLayoutDimension,
  resolveAccessibilityProps,
  resolveDecelerationRate,
  resolveScrollForwarding,
  selectScrollIntrinsics,
  splitLayoutProps,
  type IAccessibilityProps,
  type IAccessibilityStateValue,
  type IAriaProps,
  type IContentSize,
  type IScrollViewHandle,
} from '@symbiote-native/components';
import {
  AnimatedValue,
  dlog,
  event as animatedEvent,
  isNativeAnimatedAvailable,
  isSymbioteNode,
  resolveClassName,
  whenCommitted,
  type IStyleProp,
  type ISymbioteEvent,
  type ISymbioteNode,
  type IViewStyle,
} from '@symbiote-native/engine';
import { SymbioteHostPropsDirective } from '../../primitives';
import { RefreshControl } from '../refresh-control';
import { ScrollViewProjectionController } from './projection';

export type { IScrollViewHandle } from '@symbiote-native/components';

type IScrollHandler = (event: ISymbioteEvent) => void;
type IContentSizeHandler = (width: number, height: number) => void;

// The inputs every platform ScrollView accepts, listed on each concrete @Component (the adapter
// convention, mirroring Switch/Animated) so the base fields bind consistently. The aria-* /
// role aliases ride here too and are folded by resolveAccessibilityProps before reaching native.
export const SCROLL_VIEW_INPUTS = [
  'style',
  'contentContainerStyle',
  'horizontal',
  'scrollEnabled',
  'showsVerticalScrollIndicator',
  'showsHorizontalScrollIndicator',
  'pagingEnabled',
  'bounces',
  'decelerationRate',
  'scrollEventThrottle',
  'contentInset',
  'contentOffset',
  'removeClippedSubviews',
  'snapToInterval',
  'snapToOffsets',
  'snapToAlignment',
  'snapToStart',
  'snapToEnd',
  'disableIntervalMomentum',
  'stickyHeaderIndices',
  'invertStickyHeaders',
  'StickyHeaderComponent',
  'keyboardDismissMode',
  'keyboardShouldPersistTaps',
  'maintainVisibleContentPosition',
  'alwaysBounceHorizontal',
  'alwaysBounceVertical',
  'centerContent',
  'scrollIndicatorInsets',
  'indicatorStyle',
  'directionalLockEnabled',
  'automaticallyAdjustKeyboardInsets',
  'contentInsetAdjustmentBehavior',
  'minimumZoomScale',
  'maximumZoomScale',
  'zoomScale',
  'bouncesZoom',
  'pinchGestureEnabled',
  'nestedScrollEnabled',
  'overScrollMode',
  'fadingEdgeLength',
  'persistentScrollbar',
  'endFillColor',
  'onScroll',
  'onScrollBeginDrag',
  'onScrollEndDrag',
  'onMomentumScrollBegin',
  'onMomentumScrollEnd',
  'testID',
  'nativeID',
  'accessible',
  'accessibilityLabel',
  'accessibilityHint',
  'accessibilityRole',
  'accessibilityState',
  'accessibilityValue',
  'accessibilityActions',
  'accessibilityLabelledBy',
  'importantForAccessibility',
  'accessibilityLiveRegion',
  'screenReaderFocusable',
  'accessibilityViewIsModal',
  'accessibilityElementsHidden',
  'accessibilityIgnoresInvertColors',
  'accessibilityLanguage',
  'accessibilityRespondsToUserInteraction',
  'accessibilityShowsLargeContentViewer',
  'accessibilityLargeContentTitle',
  'role',
  'aria-label',
  'aria-labelledby',
  'aria-live',
  'aria-hidden',
  'aria-busy',
  'aria-checked',
  'aria-disabled',
  'aria-expanded',
  'aria-selected',
  'aria-modal',
  'aria-valuemax',
  'aria-valuemin',
  'aria-valuenow',
  'aria-valuetext',
];

// The Angular-facing prop surface. React's IScrollViewProps is React-coupled (ReactNode children,
// ReactElement refreshControl); Angular takes children via <ng-content> and composes the
// RefreshControl through projection / an outer wrap, so this mirrors the same pass-through surface
// minus those, declared per-adapter over the shared accessibility base since a framework element/ref
// field can't live in a shared agnostic type. Every prop is accepted and typed against the full
// React surface so app code type-checks against parity now.
export interface IAngularScrollViewProps extends IAccessibilityProps, IAriaProps {
  style?: IStyleProp<IViewStyle>;
  // A bare string resolves through the shared style registry, like `class` on the host node.
  contentContainerStyle?: IStyleProp<IViewStyle> | string;
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
  removeClippedSubviews?: boolean;
  snapToInterval?: number;
  snapToOffsets?: number[];
  snapToAlignment?: 'start' | 'center' | 'end';
  snapToStart?: boolean;
  snapToEnd?: boolean;
  disableIntervalMomentum?: boolean;
  // Sticky headers: RN implements stickiness PURELY IN JS (ScrollView.js wraps each flagged child
  // in ScrollViewStickyHeader, driven by the scroll offset). The native scroll view does NOT honor
  // an index array. See the header note on the Angular projection boundary for the auto-wrap.
  stickyHeaderIndices?: number[];
  invertStickyHeaders?: boolean;
  // Angular auto projection is renderer-node based, so this input is intentionally explicit-
  // composition only: custom sticky wrappers must be written in the template; auto stickyHeaderIndices
  // uses the built-in wrapper to stay AOT-safe.
  StickyHeaderComponent?: unknown;
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
  // Synthesized in JS from the content view's onLayout (RN _handleContentOnLayout); deduped.
  onContentSizeChange?: IContentSizeHandler;
  onAccessibilityAction?: (event: ISymbioteEvent) => void;
  onAccessibilityTap?: (event: ISymbioteEvent) => void;
  onMagicTap?: (event: ISymbioteEvent) => void;
  onAccessibilityEscape?: (event: ISymbioteEvent) => void;
}

// What ScrollView itself takes as plain @Input()s: the full surface minus the layout/content-size/
// accessibility events it exposes as real @Output() EventEmitters instead (see ScrollViewBase below).
// onScroll and the drag/momentum family stay callback @Input()s permanently — they must also accept
// an Animated.event(...) native-driver marker, which no @Output() binding can carry.
export type IAngularScrollViewInputs = Omit<
  IAngularScrollViewProps,
  | 'onLayout'
  | 'onScrollToTop'
  | 'onContentSizeChange'
  | 'onAccessibilityAction'
  | 'onAccessibilityTap'
  | 'onMagicTap'
  | 'onAccessibilityEscape'
>;

// Strip undefined entries so a prop the user never set is not forwarded to the host (an undefined
// reaching Fabric is at best a no-op, at worst clears a default). The Angular twin of React/Vue
// destructuring `...rest` past the defined props.
function compact(bag: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(bag)) {
    if (bag[key] !== undefined) result[key] = bag[key];
  }
  return result;
}

// ScrollView's forwarded surface (scroll events + the snap/keyboard/zoom families) is exactly the
// flat-bag shape SymbioteHostPropsDirective spreads onto a host element via Renderer2 (-> routeProp).
// The scroll-event callbacks ride this bag (not the (event) channel) because routeProp must be free
// to wire onScroll as an Animated.event when sticky headers drive the value natively, which the
// listen()/setEventListener channel cannot carry. This mirrors React/Vue putting onScroll on
// outerProps.
@Directive({
  selector: '[symbioteScrollViewProjection]',
  standalone: true,
  inputs: ['symbioteScrollViewProjection'],
})
export class ScrollViewProjectionDirective {
  private readonly elementRef = inject<ElementRef<unknown>>(ElementRef);

  set symbioteScrollViewProjection(controller: ScrollViewProjectionController) {
    const node = this.elementRef.nativeElement;
    if (isSymbioteNode(node)) controller.bindContentNode(node);
  }
}

// @Directive() (no selector) is the Angular-sanctioned decorator for an abstract base that
// declares lifecycle hooks and @ViewChild queries (mirrors AnimatedComponentBase) — without it
// ngtsc rejects the inherited hooks/queries (NG2007). The concrete platform @Components add ONLY a
// decorator + their platform template; all behavior lives here.
@Directive()
export abstract class ScrollViewBase implements IAngularScrollViewInputs, AfterViewInit, OnDestroy {
  style: IStyleProp<IViewStyle> | undefined;
  contentContainerStyle: IStyleProp<IViewStyle> | string | undefined;
  horizontal: boolean | undefined;
  scrollEnabled: boolean | undefined;
  showsVerticalScrollIndicator: boolean | undefined;
  showsHorizontalScrollIndicator: boolean | undefined;
  pagingEnabled: boolean | undefined;
  bounces: boolean | undefined;
  decelerationRate: 'normal' | 'fast' | number | undefined;
  scrollEventThrottle: number | undefined;
  contentInset: IAngularScrollViewProps['contentInset'];
  contentOffset: IAngularScrollViewProps['contentOffset'];
  removeClippedSubviews: boolean | undefined;
  snapToInterval: number | undefined;
  snapToOffsets: number[] | undefined;
  snapToAlignment: IAngularScrollViewProps['snapToAlignment'];
  snapToStart: boolean | undefined;
  snapToEnd: boolean | undefined;
  disableIntervalMomentum: boolean | undefined;
  stickyHeaderIndices: number[] | undefined;
  invertStickyHeaders: boolean | undefined;
  StickyHeaderComponent: unknown;
  keyboardDismissMode: IAngularScrollViewProps['keyboardDismissMode'];
  keyboardShouldPersistTaps: IAngularScrollViewProps['keyboardShouldPersistTaps'];
  maintainVisibleContentPosition: IAngularScrollViewProps['maintainVisibleContentPosition'];
  alwaysBounceHorizontal: boolean | undefined;
  alwaysBounceVertical: boolean | undefined;
  centerContent: boolean | undefined;
  scrollIndicatorInsets: IAngularScrollViewProps['scrollIndicatorInsets'];
  indicatorStyle: IAngularScrollViewProps['indicatorStyle'];
  directionalLockEnabled: boolean | undefined;
  automaticallyAdjustKeyboardInsets: boolean | undefined;
  contentInsetAdjustmentBehavior: IAngularScrollViewProps['contentInsetAdjustmentBehavior'];
  minimumZoomScale: number | undefined;
  maximumZoomScale: number | undefined;
  zoomScale: number | undefined;
  bouncesZoom: boolean | undefined;
  pinchGestureEnabled: boolean | undefined;
  nestedScrollEnabled: boolean | undefined;
  overScrollMode: IAngularScrollViewProps['overScrollMode'];
  fadingEdgeLength: number | undefined;
  persistentScrollbar: boolean | undefined;
  endFillColor: string | undefined;
  onScroll: IScrollHandler | undefined;
  onScrollBeginDrag: IScrollHandler | undefined;
  onScrollEndDrag: IScrollHandler | undefined;
  onMomentumScrollBegin: IScrollHandler | undefined;
  onMomentumScrollEnd: IScrollHandler | undefined;

  // The layout/content-size/accessibility events as real Angular events: `(layout)="…"`, not
  // `[onLayout]="…"`. onScroll and the drag/momentum family stay plain @Input() callbacks above —
  // they must also accept an Animated.event(...) native-driver marker (see the file header note),
  // which no @Output() binding can carry.
  @Output() readonly layout = new EventEmitter<ISymbioteEvent>();
  @Output() readonly scrollToTop = new EventEmitter<ISymbioteEvent>();
  @Output() readonly contentSizeChange = new EventEmitter<IContentSize>();
  @Output() readonly accessibilityAction = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityTap = new EventEmitter<ISymbioteEvent>();
  @Output() readonly magicTap = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityEscape = new EventEmitter<ISymbioteEvent>();

  testID: string | undefined;
  nativeID: string | undefined;
  accessible: boolean | undefined;
  accessibilityLabel: string | undefined;
  accessibilityHint: string | undefined;
  accessibilityRole: IAccessibilityProps['accessibilityRole'];
  accessibilityState: IAccessibilityStateValue | undefined;
  accessibilityValue: IAccessibilityProps['accessibilityValue'];
  accessibilityActions: IAccessibilityProps['accessibilityActions'];
  accessibilityLabelledBy: string | string[] | undefined;
  importantForAccessibility: IAccessibilityProps['importantForAccessibility'];
  accessibilityLiveRegion: IAccessibilityProps['accessibilityLiveRegion'];
  screenReaderFocusable: boolean | undefined;
  accessibilityViewIsModal: boolean | undefined;
  accessibilityElementsHidden: boolean | undefined;
  accessibilityIgnoresInvertColors: boolean | undefined;
  accessibilityLanguage: string | undefined;
  accessibilityRespondsToUserInteraction: boolean | undefined;
  accessibilityShowsLargeContentViewer: boolean | undefined;
  accessibilityLargeContentTitle: string | undefined;
  role: IAriaProps['role'];
  'aria-label': string | undefined;
  'aria-labelledby': string | undefined;
  'aria-live': IAriaProps['aria-live'];
  'aria-hidden': boolean | undefined;
  'aria-busy': boolean | undefined;
  'aria-checked': boolean | 'mixed' | undefined;
  'aria-disabled': boolean | undefined;
  'aria-expanded': boolean | undefined;
  'aria-selected': boolean | undefined;
  'aria-modal': boolean | undefined;
  'aria-valuemax': number | undefined;
  'aria-valuemin': number | undefined;
  'aria-valuenow': number | undefined;
  'aria-valuetext': string | undefined;

  // The host directive on the scroll-view intrinsic; `.node` is the committed SymbioteNode held by
  // IDENTITY (Renderer2.createElement returned the engine node, ElementRef hands it back unwrapped).
  // Inherited by the decorated subclass — Angular collects base-class @ViewChild queries.
  @ViewChild('host', { read: SymbioteHostPropsDirective })
  private hostDirective?: SymbioteHostPropsDirective;

  @ContentChild(RefreshControl) protected projectedRefreshControl?: RefreshControl;

  // A single AnimatedValue tracks the scroll offset and drives every sticky header's translateY
  // (RN's _scrollAnimatedValue). A stable field (allocated once, held by identity — Angular does
  // not proxy class fields, so no markRaw needed); the native attach below feeds it on the UI
  // thread. Allocated unconditionally; inert until a sticky header consumes it.
  protected readonly scrollAnimatedValue = new AnimatedValue(0);

  // The last-seen content size, used to dedupe onContentSizeChange: RN fires the content onLayout
  // on every layout pass; only real size changes emit (didContentSizeChange).
  private lastContentSize: IContentSize | null = null;
  // Inverted sticky headers stick to the BOTTOM, so they need the viewport height (RN _handleLayout).
  private viewportHeight: number | undefined = undefined;

  protected readonly projectionController = new ScrollViewProjectionController({
    stickyHeaderIndices: undefined,
    invertStickyHeaders: undefined,
    scrollViewHeight: undefined,
    scrollAnimatedValue: this.scrollAnimatedValue,
    customStickyHeaderComponent: undefined,
    excludeRefreshControl: false,
  });

  // Native sticky-scroll attach (RN attachNativeEvent): when the native module is available the
  // scroll value is driven on the UI thread so the interpolations ride scroll natively (no JS
  // jitter). Through whenCommitted because under Angular's zoneless batched CD the host's Fabric
  // tag does not exist yet at ngAfterViewInit time (the async-commit gotcha Vue documents); the
  // bind runs now if committed, else after the commit that assigns the tag. Detached on destroy.
  private detachStickyScroll: (() => void) | undefined;
  private cancelStickyBind: (() => void) | undefined;

  private lastLoggedIsHorizontal: boolean | undefined = undefined;

  // Stable reference (bound once): inverted sticky headers need the viewport height captured off
  // the scroll-view's own onLayout before forwarding to the user (RN _handleLayout). A getter that
  // built this arrow function fresh on every `scrollProps` access would hand `[symbioteHostProps]`
  // a new function reference every change-detection pass touching this component — jsonEqual
  // (commit.ts) falls back to Object.is on a function leaf, so even a structurally-identical bag
  // reads as "props changed" and forces a real Fabric re-clone that cascades up every ancestor
  // (see AnimatedComponentBase.reconcile()'s identical warning).
  private readonly handleInvertedStickyLayout = (event: ISymbioteEvent): void => {
    const height = readLayoutDimension(event, 'height');
    if (height !== undefined) this.viewportHeight = height;
    this.layout.emit(event);
  };

  // Same reasoning as handleInvertedStickyLayout: the content view's onLayout synthesizes
  // onContentSizeChange (deduped) and must stay a stable reference across `contentProps` re-reads.
  private readonly handleContentLayout = (event: ISymbioteEvent): void => {
    const width = readLayoutDimension(event, 'width');
    const height = readLayoutDimension(event, 'height');
    if (width === undefined || height === undefined) return;
    if (!didContentSizeChange(this.lastContentSize, { width, height })) return;
    this.lastContentSize = { width, height };
    dlog(`Angular ScrollView contentSizeChange ${width}x${height}`);
    this.contentSizeChange.emit({ width, height });
  };

  // Memoizes the wrapper each `emitterCallback` builds, keyed by the emitter it closes over
  // (identity holds across ScrollViewBase's own @Output()s and a projected RefreshControl's,
  // since a WeakMap key is just object identity). Without this, `scrollProps`/`refreshControlProps`
  // handed a fresh `(event) => emitter.emit(event)` closure to the forwarded prop bag on every
  // evaluation — the same jsonEqual/Object.is function-leaf problem as the arrow fields above, one
  // level further removed. `.observed` is checked BEFORE the cache so an unbound event still
  // resolves to `undefined` (the "nobody cares" contract `emitterCallback`'s own comment documents),
  // not a stale cached wrapper from before the last subscriber unsubscribed.
  private readonly emitterCallbackCache = new WeakMap<
    EventEmitter<ISymbioteEvent>,
    IScrollHandler
  >();

  // The sticky JS-path Animated.event handler depends on a REAL input (onScroll), so it can't be a
  // plain stable field the way handleInvertedStickyLayout/handleContentLayout are — it must track
  // `this.onScroll` genuinely changing, mirroring sticky-header.ts's own rebuildInterpolation cache
  // (rebuild only when the tracked dependency's reference actually differs, not on every getter
  // read). A fresh `animatedEvent(...)` call every `scrollProps` access would otherwise construct a
  // new listener wrapper (and a new AnimatedEvent walking `collectMappedValues`) on every unrelated
  // change-detection pass while sticky headers are active.
  private cachedStickyOnScrollSource: IScrollHandler | undefined;
  private cachedStickyOnScrollHandler: ((...args: readonly unknown[]) => void) | undefined;

  get isHorizontal(): boolean {
    const value = this.horizontal === true;
    if (value !== this.lastLoggedIsHorizontal) {
      this.lastLoggedIsHorizontal = value;
      dlog(
        `Angular ScrollView isHorizontal changed to ${value} (horizontal input=${this.horizontal})`,
      );
    }
    return value;
  }

  private get hasStickyHeaders(): boolean {
    return this.stickyHeaderIndices !== undefined && this.stickyHeaderIndices.length > 0;
  }

  // A class-name string resolves through the shared registry before it reaches
  // selectScrollIntrinsics, which only understands style objects/arrays.
  private get resolvedContentContainerStyle(): IStyleProp<IViewStyle> | undefined {
    return typeof this.contentContainerStyle === 'string'
      ? resolveClassName(this.contentContainerStyle)
      : this.contentContainerStyle;
  }

  private get scrollViewBaseStyle(): IViewStyle {
    return selectScrollIntrinsics(this.isHorizontal, this.resolvedContentContainerStyle)
      .scrollViewBaseStyle;
  }

  // The forwarded host-prop bag for the scroll-view node: aria/role folded, the native pass-through
  // families, the scroll-event callbacks, then the lifecycle-managed overrides (nestedScrollEnabled
  // default ON, horizontal when defined, decelerationRate resolved per-platform, the sticky onScroll
  // path). Base style UNDER user style so an explicit user value still wins. Mirrors Vue's outerProps
  // + scrollProps assembly.
  get scrollProps(): Record<string, unknown> {
    const bag: Record<string, unknown> = compact({
      ...resolveAccessibilityProps(this.accessibilityInputs()),
      scrollEnabled: this.scrollEnabled,
      showsVerticalScrollIndicator: this.showsVerticalScrollIndicator,
      showsHorizontalScrollIndicator: this.showsHorizontalScrollIndicator,
      pagingEnabled: this.pagingEnabled,
      bounces: this.bounces,
      contentInset: this.contentInset,
      contentOffset: this.contentOffset,
      removeClippedSubviews: this.removeClippedSubviews,
      snapToInterval: this.snapToInterval,
      snapToOffsets: this.snapToOffsets,
      snapToAlignment: this.snapToAlignment,
      snapToStart: this.snapToStart,
      snapToEnd: this.snapToEnd,
      disableIntervalMomentum: this.disableIntervalMomentum,
      keyboardDismissMode: this.keyboardDismissMode,
      keyboardShouldPersistTaps: this.keyboardShouldPersistTaps,
      maintainVisibleContentPosition: this.maintainVisibleContentPosition,
      alwaysBounceHorizontal: this.alwaysBounceHorizontal,
      alwaysBounceVertical: this.alwaysBounceVertical,
      centerContent: this.centerContent,
      scrollIndicatorInsets: this.scrollIndicatorInsets,
      indicatorStyle: this.indicatorStyle,
      directionalLockEnabled: this.directionalLockEnabled,
      automaticallyAdjustKeyboardInsets: this.automaticallyAdjustKeyboardInsets,
      contentInsetAdjustmentBehavior: this.contentInsetAdjustmentBehavior,
      minimumZoomScale: this.minimumZoomScale,
      maximumZoomScale: this.maximumZoomScale,
      zoomScale: this.zoomScale,
      bouncesZoom: this.bouncesZoom,
      pinchGestureEnabled: this.pinchGestureEnabled,
      overScrollMode: this.overScrollMode,
      fadingEdgeLength: this.fadingEdgeLength,
      persistentScrollbar: this.persistentScrollbar,
      endFillColor: this.endFillColor,
      onScrollBeginDrag: this.onScrollBeginDrag,
      onScrollEndDrag: this.onScrollEndDrag,
      onMomentumScrollBegin: this.onMomentumScrollBegin,
      onMomentumScrollEnd: this.onMomentumScrollEnd,
      onScrollToTop: this.emitterCallback(this.scrollToTop),
      onAccessibilityAction: this.emitterCallback(this.accessibilityAction),
      onAccessibilityTap: this.emitterCallback(this.accessibilityTap),
      onMagicTap: this.emitterCallback(this.magicTap),
      onAccessibilityEscape: this.emitterCallback(this.accessibilityEscape),
    });

    // RN defaults nested scrolling ON (ScrollView.js `nestedScrollEnabled ?? true`); Android needs
    // it to scroll a nested scrollable independently, iOS handles nesting natively (a no-op there).
    bag.nestedScrollEnabled = this.nestedScrollEnabled ?? true;
    // iOS needs `horizontal` to flip RCTScrollView's axis; Android's dedicated manager ignores it.
    if (this.horizontal !== undefined) bag.horizontal = this.horizontal;
    if (this.decelerationRate !== undefined) {
      bag.decelerationRate = resolveDecelerationRate(this.decelerationRate);
    }

    // onScroll: when sticky headers are active, the offset must reach the AnimatedValue (RN
    // _scrollAnimatedValueAttachment). With the native module, the value is driven on the UI thread
    // by the post-commit attach below, so onScroll forwards to the user with throttle 1
    // (ScrollView.js:1798). Without it, Animated.event drives the value each frame (the JS jitter)
    // and forwards the user handler as the listener passthrough.
    // The scroll-forwarding DECISIONS (which onScroll path, the 1/16 throttle defaults, whether to
    // capture the viewport height) are folded out to the shared resolveScrollForwarding; here Angular
    // only EXECUTES them, keeping its stable-reference handlers (stickyOnScrollHandler /
    // handleInvertedStickyLayout / emitterCallback) so a fresh closure never forces a re-clone cascade.
    const nativeStickyAvailable = this.hasStickyHeaders && isNativeAnimatedAvailable();
    const forwarding = resolveScrollForwarding({
      hasStickyHeaders: this.hasStickyHeaders,
      nativeStickyAvailable,
      invertStickyHeaders: this.invertStickyHeaders,
      scrollEventThrottle: this.scrollEventThrottle,
      maintainVisibleContentPosition: this.maintainVisibleContentPosition,
      snapToAlignment: this.snapToAlignment,
    });
    // onScroll: the JS-fallback path uses the cached Animated.event handler; the native + plain paths
    // forward the user handler as-is (the native driver attaches the value on the UI thread).
    if (forwarding.mode === 'sticky-js') {
      bag.onScroll = this.stickyOnScrollHandler(this.onScroll);
    } else if (this.onScroll !== undefined) {
      bag.onScroll = this.onScroll;
    }
    if (forwarding.scrollEventThrottle !== undefined) {
      bag.scrollEventThrottle = forwarding.scrollEventThrottle;
    }
    // Inverted sticky headers need the viewport height (RN _handleLayout): capture it on the
    // scroll-view onLayout, then call the user's handler. Otherwise forward the layout emitter.
    if (forwarding.capturesViewportHeight) {
      bag.onLayout = this.handleInvertedStickyLayout;
    } else {
      const layoutCallback = this.emitterCallback(this.layout);
      if (layoutCallback !== undefined) bag.onLayout = layoutCallback;
    }

    dlog(
      `Angular ScrollView -> ${this.isHorizontal ? 'horizontal' : 'vertical'} (sticky=${this.hasStickyHeaders})`,
    );

    bag.style = [this.scrollViewBaseStyle, this.style];
    this.updateProjectionController();
    return bag;
  }

  // Overridable hook, NOT `this.style` directly: `splitLayoutProps` below decides which layout
  // properties (flex/height/gap/…) go on the Android outer refresh-control wrapper vs. the inner
  // scroll view. `this.style` alone only ever carries the explicit `[style]` @Input — a composed
  // component's OWN anchor host (see anchorHostStyle's doc comment in primitives/shared.ts) can
  // hold ADDITIONAL class-derived layout style that's otherwise invisible to this split, so its
  // wrapper never gets its needed layout (collapses to zero size — the Android outer wrapper
  // shows literally nothing on screen). This mirrors the Vue adapter's identical
  // `layoutSplitStyle` field and the real Android device bug it fixes; the Angular Android
  // ScrollView (index.android.ts) overrides this to merge in `anchorHostStyle`. Default here is
  // `this.style` alone, preserving current behavior for anything that doesn't override it.
  protected get layoutSplitStyle(): IStyleProp<IViewStyle> {
    return this.style;
  }

  get androidWrappedScrollProps(): Record<string, unknown> {
    const props = { ...this.scrollProps };
    const { inner, outer } = splitLayoutProps(this.layoutSplitStyle);
    dlog(
      `Angular ScrollView splitProbe layoutSplitStyle=${JSON.stringify(this.layoutSplitStyle)} ` +
        `outer=${JSON.stringify(outer)} inner=${JSON.stringify(inner)}`,
    );
    props.style = [this.scrollViewBaseStyle, inner];
    props.nestedScrollEnabled = true;
    return props;
  }

  get iosRefreshControlProps(): Record<string, unknown> {
    return this.refreshControlProps();
  }

  get androidRefreshControlProps(): Record<string, unknown> {
    const { outer } = splitLayoutProps(this.layoutSplitStyle);
    dlog(
      `Angular ScrollView refreshControlProbe outer=${JSON.stringify(outer)} ` +
        `hasRefresh=${this.projectedRefreshControl !== undefined}`,
    );
    return this.refreshControlProps(outer);
  }

  protected handleProjectedRefresh(nativeNode: unknown): void {
    this.projectedRefreshControl?.handleRefresh(nativeNode);
  }

  private refreshControlProps(style?: IStyleProp<IViewStyle>): Record<string, unknown> {
    const refresh = this.projectedRefreshControl;
    if (refresh === undefined) return {};
    return compact({
      ...refresh.folded,
      refreshing: refresh.refreshing,
      tintColor: refresh.tintColor,
      title: refresh.title,
      titleColor: refresh.titleColor,
      progressViewOffset: refresh.progressViewOffset,
      colors: refresh.colors,
      progressBackgroundColor: refresh.progressBackgroundColor,
      size: refresh.size,
      enabled: refresh.enabled,
      style,
      testID: refresh.testID,
      nativeID: refresh.nativeID,
      accessible: refresh.accessible,
      onAccessibilityAction: this.emitterCallback(refresh.accessibilityAction),
      onAccessibilityTap: this.emitterCallback(refresh.accessibilityTap),
      onMagicTap: this.emitterCallback(refresh.magicTap),
      onAccessibilityEscape: this.emitterCallback(refresh.accessibilityEscape),
    });
  }

  get hasProjectedRefreshControl(): boolean {
    return this.projectedRefreshControl !== undefined;
  }

  // The content (inner) view's prop bag. `collapsable: false` keeps the layout-only content view a
  // real native view (Android Fabric view-flattens it away otherwise, hoisting cells as direct
  // children of a scroll view that hosts exactly one — an addViewAt crash). collapsableChildren
  // false preserves the cell views maintainVisibleContentPosition/snapToAlignment anchor against.
  // onLayout synthesizes onContentSizeChange (deduped). iOS never flattens; both are no-ops there.
  get contentProps(): Record<string, unknown> {
    const { contentStyle } = selectScrollIntrinsics(
      this.isHorizontal,
      this.resolvedContentContainerStyle,
    );
    const bag: Record<string, unknown> = { style: contentStyle, collapsable: false };
    if (this.maintainVisibleContentPosition !== undefined || this.snapToAlignment !== undefined) {
      bag.collapsableChildren = false;
    }
    bag.onLayout = this.handleContentLayout;
    return bag;
  }

  // Wraps an @Output() as a plain callback only while it has a subscriber, so an unbound event
  // still leaves the forwarded prop bag key absent — the same "undefined means nobody cares"
  // contract the old @Input() callbacks had. Mirrors Pressable's emitterHandler. The wrapper itself
  // is memoized per emitter (emitterCallbackCache) rather than rebuilt on every call: see that
  // field's comment for why an unstable closure here breaks the forwarded prop bag.
  private emitterCallback(emitter: EventEmitter<ISymbioteEvent>): IScrollHandler | undefined {
    if (!emitter.observed) return undefined;
    let cached = this.emitterCallbackCache.get(emitter);
    if (cached === undefined) {
      cached = (event: ISymbioteEvent) => emitter.emit(event);
      this.emitterCallbackCache.set(emitter, cached);
    }
    return cached;
  }

  // Rebuilds the JS-path Animated.event handler only when the tracked `onScroll` input actually
  // changes reference (see cachedStickyOnScrollHandler's comment).
  private stickyOnScrollHandler(
    userOnScroll: IScrollHandler | undefined,
  ): (...args: readonly unknown[]) => void {
    if (
      this.cachedStickyOnScrollHandler === undefined ||
      this.cachedStickyOnScrollSource !== userOnScroll
    ) {
      this.cachedStickyOnScrollSource = userOnScroll;
      this.cachedStickyOnScrollHandler = animatedEvent(
        [{ nativeEvent: { contentOffset: { y: this.scrollAnimatedValue } } }],
        userOnScroll === undefined
          ? undefined
          : { listener: (...args: readonly unknown[]) => forwardScrollEvent(userOnScroll, args) },
      );
    }
    return this.cachedStickyOnScrollHandler;
  }

  // The committed scroll-view node held by IDENTITY (the directive's ElementRef). null until the
  // element commits; the imperative handle and the sticky attach both read it through this getter.
  private get hostNode(): ISymbioteNode | null {
    const native = this.hostDirective?.node;
    return isSymbioteNode(native) ? native : null;
  }

  // The imperative API a parent reaches via @ViewChild(ScrollView). buildScrollViewHandle is the
  // shared, proven handle (React/Vue use it verbatim); it reads the node through the LAZY getter on
  // every call, so a command before commit no-ops rather than freezing a null node.
  private readonly handle: IScrollViewHandle = buildScrollViewHandle(() => this.hostNode);

  scrollTo(options?: { x?: number; y?: number; animated?: boolean }): void {
    this.handle.scrollTo(options);
  }

  scrollToEnd(options?: { animated?: boolean }): void {
    this.handle.scrollToEnd(options);
  }

  flashScrollIndicators(): void {
    this.handle.flashScrollIndicators();
  }

  getScrollNode(): ISymbioteNode | null {
    return this.handle.getScrollNode();
  }

  ngAfterViewInit(): void {
    this.updateProjectionController();
    this.attachSticky();
  }

  // Wire the native sticky-scroll attach after the view exists. Re-attaches if the node identity
  // changes; no-op when sticky is off or the native module is absent.
  private attachSticky(): void {
    this.cancelStickyBind?.();
    this.cancelStickyBind = undefined;
    if (this.detachStickyScroll !== undefined) {
      this.detachStickyScroll();
      this.detachStickyScroll = undefined;
    }
    if (!this.hasStickyHeaders || !isNativeAnimatedAvailable()) return;
    const node = this.hostNode;
    if (node === null) return;
    this.cancelStickyBind = whenCommitted(node, () => {
      this.detachStickyScroll = attachStickyScroll(node, this.scrollAnimatedValue);
    });
  }

  ngOnDestroy(): void {
    this.cancelStickyBind?.();
    this.cancelStickyBind = undefined;
    if (this.detachStickyScroll !== undefined) this.detachStickyScroll();
  }

  private updateProjectionController(): void {
    this.projectionController.update({
      stickyHeaderIndices: this.stickyHeaderIndices,
      invertStickyHeaders: this.invertStickyHeaders,
      scrollViewHeight: this.viewportHeight,
      scrollAnimatedValue: this.scrollAnimatedValue,
      customStickyHeaderComponent: this.StickyHeaderComponent,
      excludeRefreshControl: this.hasProjectedRefreshControl,
    });
  }

  // Typed as the a11y intersection WITH the string index so resolveAccessibilityProps's result
  // stays assignable into the forwarded bag (a genuine narrowing, built at that type — no cast).
  private accessibilityInputs(): IAccessibilityProps & IAriaProps & Record<string, unknown> {
    return {
      testID: this.testID,
      nativeID: this.nativeID,
      accessible: this.accessible,
      accessibilityLabel: this.accessibilityLabel,
      accessibilityHint: this.accessibilityHint,
      accessibilityRole: this.accessibilityRole,
      accessibilityState: this.accessibilityState,
      accessibilityValue: this.accessibilityValue,
      accessibilityActions: this.accessibilityActions,
      accessibilityLabelledBy: this.accessibilityLabelledBy,
      importantForAccessibility: this.importantForAccessibility,
      accessibilityLiveRegion: this.accessibilityLiveRegion,
      screenReaderFocusable: this.screenReaderFocusable,
      accessibilityViewIsModal: this.accessibilityViewIsModal,
      accessibilityElementsHidden: this.accessibilityElementsHidden,
      accessibilityIgnoresInvertColors: this.accessibilityIgnoresInvertColors,
      accessibilityLanguage: this.accessibilityLanguage,
      accessibilityRespondsToUserInteraction: this.accessibilityRespondsToUserInteraction,
      accessibilityShowsLargeContentViewer: this.accessibilityShowsLargeContentViewer,
      accessibilityLargeContentTitle: this.accessibilityLargeContentTitle,
      role: this.role,
      'aria-label': this['aria-label'],
      'aria-labelledby': this['aria-labelledby'],
      'aria-live': this['aria-live'],
      'aria-hidden': this['aria-hidden'],
      'aria-busy': this['aria-busy'],
      'aria-checked': this['aria-checked'],
      'aria-disabled': this['aria-disabled'],
      'aria-expanded': this['aria-expanded'],
      'aria-selected': this['aria-selected'],
      'aria-modal': this['aria-modal'],
      'aria-valuemax': this['aria-valuemax'],
      'aria-valuemin': this['aria-valuemin'],
      'aria-valuenow': this['aria-valuenow'],
      'aria-valuetext': this['aria-valuetext'],
    };
  }
}
