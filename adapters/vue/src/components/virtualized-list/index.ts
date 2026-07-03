// VirtualizedList, the Vue lifecycle half. The windowing engine (offset table, window
// compute, batch throttle, viewability, edge-reached, the child PLAN, the imperative-handle
// surface) lives in @symbiotejs/components/state, shared verbatim with the React adapter. Here
// Vue supplies only the reactivity: refs for scroll offset / viewport / measurement bumps, a
// `computed` that runs the shared windowing math, post-flush watchers for the after-commit
// work (batch fill, onEndReached/onStartReached, viewability, initialScroll, MVCP), and the
// imperative handle via expose(). This is the Vue twin of the React adapter's
// useState/useRef/useEffect over the same shared functions. It drives the Vue ScrollView,
// exactly as the React list drives the React ScrollView.
//
// Typed-emits generic component (mirrors FlatList): a GENERIC setup function
// `<ItemT,>(props: IVirtualizedListProps<ItemT>, ctx: ICtx<IVirtualizedListEmits<ItemT>>)` so the
// five adapter-synthesized events emit with ItemT-typed payloads (`@viewable-items-changed` carries
// ItemT, not unknown). For that to infer at the call site, the generic INPUTS (data/getItem/
// renderItem/…) are read from typed `props`, declared in the runtime `props` array; the raw native
// scroll events (onScroll/onScrollBeginDrag/…) + any unknown attrs ride through `$attrs` onto the
// inner ScrollView. RefreshControl + viewability stay GATED on listener presence, so each emit
// bridge is wired ONLY when the consumer actually listens (read off the instance vnode props),
// keeping behavior identical to the prop-callback era.
//
// Lists have no Descriptor render fn (the cell content is the framework's own children); see
// core/components/.docs-note-lists.md. Cells/spacers are built with h() directly off the plan.
//
// Reactivity gotcha (.claude/skills/vue-adapter-reactivity): the ScrollView's exposed handle
// is held in a shallowRef so the engine node it closes over is reached by identity; a deep
// ref would proxy it and the imperative scroll commands would silently no-op.

import {
  computed,
  defineComponent,
  getCurrentInstance,
  h,
  isVNode,
  onBeforeUnmount,
  ref,
  shallowRef,
  watch,
  type Component,
  type VNode,
} from '@vue/runtime-core';
import {
  DEFAULT_END_REACHED_THRESHOLD,
  DEFAULT_INITIAL_NUM_TO_RENDER,
  DEFAULT_MAX_TO_RENDER_PER_BATCH,
  DEFAULT_START_REACHED_THRESHOLD,
  DEFAULT_UPDATE_CELLS_BATCHING_PERIOD,
  DEFAULT_WINDOW_SIZE,
  EMPTY_OFFSET,
  FIRST_INDEX,
  INVERTED_X_STYLE,
  INVERTED_Y_STYLE,
  NO_CONTENT_LENGTH_SENT,
  averageMeasuredLength,
  buildListPlan,
  buildOffsets,
  buildViewabilityPairs,
  computeEndReached,
  computeStartReached,
  computeViewableSet,
  computeWindow,
  diffViewable,
  highestMeasuredIndex,
  maxMinimumViewTime,
  offsetForIndex,
  readLayoutLength,
  readScrollOffset,
  throttleWindow,
  type ICellLayout,
  type IScrollViewHandle,
  type ISeparatorProps,
  type ISeparators,
  type IViewToken,
  type IViewabilityConfig,
  type IViewabilityConfigCallbackPair,
  type IViewableItemsChangedInfo,
  type IVirtualizedListHandle,
} from '@symbiotejs/components';
import {
  dlog,
  type IStyleProp,
  type ISymbioteEvent,
  type ISymbioteNode,
  type IViewStyle,
} from '@symbiotejs/engine';
import { ScrollView } from '../scroll-view';
import { RefreshControl } from '../refresh-control';
import { normalizeVueAttrs } from '../../utils/normalize-attrs';
import { componentFromSlot } from '../../utils/slots-to-render-props';
import type { ICtx } from '../../utils/component-helpers';

// Re-export the shared list types so flat-list / virtualized-section-list keep importing them
// from '../virtualized-list', exactly as the React adapter re-exports them. One source of truth.
export type {
  ICellLayout,
  ISeparators,
  ISeparatorProps,
  IViewToken,
  IViewableItemsChangedInfo,
  IViewabilityConfig,
  IViewabilityConfigCallbackPair,
  IVirtualizedListHandle,
} from '@symbiotejs/components';

type IRenderItem<ItemT> = (info: {
  item: ItemT;
  index: number;
  separators: ISeparators;
}) => VNode | VNode[] | undefined;

export interface IVirtualizedListProps<ItemT> {
  data: unknown;
  getItem: (data: unknown, index: number) => ItemT;
  getItemCount: (data: unknown) => number;
  // The cell renderer + separator / header / footer / empty are the Vue idiom — scoped slots
  // (#item / #separator / #header / #footer / #empty), typed by IVirtualizedListSlots. React's
  // renderItem / ItemSeparatorComponent prop family is deliberately NOT on the Vue contract (no
  // duality); the slot→render-fn bridge lives in utils/slots-to-render-props.
  keyExtractor?: (item: ItemT, index: number) => string;
  getItemLayout?: (
    data: unknown,
    index: number,
  ) => { length: number; offset: number; index: number };
  horizontal?: boolean;
  inverted?: boolean;
  extraData?: unknown;
  onEndReachedThreshold?: number;
  onStartReachedThreshold?: number;
  refreshing?: boolean | null;
  progressViewOffset?: number;
  viewabilityConfig?: IViewabilityConfig;
  viewabilityConfigCallbackPairs?: IViewabilityConfigCallbackPair<ItemT>[];
  initialNumToRender?: number;
  initialScrollIndex?: number;
  maxToRenderPerBatch?: number;
  updateCellsBatchingPeriod?: number;
  windowSize?: number;
  stickyHeaderIndices?: number[];
  maintainVisibleContentPosition?: {
    minIndexForVisible: number;
    autoscrollToTopThreshold?: number;
  };
  // Raw native scroll passthrough: NOT emits (skill Rule 5), they ride through $attrs onto the
  // inner ScrollView untouched. onScroll is additionally intercepted for the windowing offset, then
  // the user's onScroll is composed (never clobbered).
  onScroll?: (event: ISymbioteEvent) => void;
  onScrollBeginDrag?: (event: ISymbioteEvent) => void;
  onScrollEndDrag?: (event: ISymbioteEvent) => void;
  onMomentumScrollBegin?: (event: ISymbioteEvent) => void;
  onMomentumScrollEnd?: (event: ISymbioteEvent) => void;
  scrollEventThrottle?: number;
  keyboardShouldPersistTaps?: boolean | 'always' | 'never' | 'handled';
  keyboardDismissMode?: 'none' | 'on-drag' | 'interactive';
  style?: IStyleProp<IViewStyle>;
  contentContainerStyle?: IStyleProp<IViewStyle>;
  // The remaining passthrough tail (raw scroll above, keyboard, accessibility, testID, …) is
  // loosely typed so it forwards onto the inner ScrollView without redeclaring every prop.
  [key: string]: unknown;
}

// The Vue cell/chrome surface — scoped slots, the idiomatic twin of React's renderItem /
// ItemSeparatorComponent / List*Component. ItemT flows in from `data`, so #item is typed without
// any annotation at the call site. Slots return VNode[] (Vue scoped-slot contract); the
// slots-to-render-props bridge folds them into the single-VNode render-fns the windowing layer wants.
export type IVirtualizedListSlots<ItemT> = {
  item: (info: { item: ItemT; index: number; separators: ISeparators }) => VNode[] | VNode;
  separator?: (props: ISeparatorProps<ItemT>) => VNode[] | VNode;
  header?: () => VNode[] | VNode;
  footer?: () => VNode[] | VNode;
  empty?: () => VNode[] | VNode;
};

// The adapter-synthesized list events, emitted with ItemT-typed payloads. The raw native scroll
// events stay raw $attrs passthrough (see IVirtualizedListProps), NOT emits.
export type IVirtualizedListEmits<ItemT> = {
  viewableItemsChanged: (info: IViewableItemsChangedInfo<ItemT>) => void;
  endReached: (info: { distanceFromEnd: number }) => void;
  startReached: (info: { distanceFromStart: number }) => void;
  refresh: () => void;
  scrollToIndexFailed: (info: {
    index: number;
    highestMeasuredFrameIndex: number;
    averageItemLength: number;
  }) => void;
};

// The typed inputs VirtualizedList reads off `props`; everything else (raw scroll, keyboard*,
// accessibility, testID, …) falls through $attrs onto the inner ScrollView. Listed for the runtime
// `props` declaration (keyof can't derive it: the index signature widens keyof to `string`). The
// five raw-scroll events and the five emit events are deliberately absent.
const PROP_KEYS = [
  'data',
  'getItem',
  'getItemCount',
  'keyExtractor',
  'getItemLayout',
  'viewabilityConfig',
  'viewabilityConfigCallbackPairs',
  'extraData',
  'horizontal',
  'inverted',
  'onEndReachedThreshold',
  'onStartReachedThreshold',
  'refreshing',
  'progressViewOffset',
  'initialNumToRender',
  'initialScrollIndex',
  'maxToRenderPerBatch',
  'updateCellsBatchingPeriod',
  'windowSize',
  'stickyHeaderIndices',
  'maintainVisibleContentPosition',
  'style',
  'contentContainerStyle',
  'keyboardShouldPersistTaps',
  'keyboardDismissMode',
];

const EMIT_KEYS = [
  'viewableItemsChanged',
  'endReached',
  'startReached',
  'refresh',
  'scrollToIndexFailed',
];

type IScrollHandler = (event: ISymbioteEvent) => void;

// The narrowed snapshot the lifecycle works against. The generic inputs come typed from `props`
// (defaults applied here); the raw-scroll passthrough + unknown attrs ride through `forwarded`; the
// five adapter-synthesized events are gated emit bridges (each wired only when the consumer listens,
// so VL keeps building RefreshControl / computing viewability strictly on demand).
interface INarrowedProps<ItemT> {
  data: unknown;
  getItem: (data: unknown, index: number) => ItemT;
  getItemCount: (data: unknown) => number;
  // Optional: derived from the #item slot, absent when the consumer supplied none (a usage error
  // RN would also hit). The render guards it and logs rather than throwing.
  renderItem?: IRenderItem<ItemT>;
  keyExtractor?: (item: ItemT, index: number) => string;
  getItemLayout?: (
    data: unknown,
    index: number,
  ) => { length: number; offset: number; index: number };
  itemSeparatorComponent?: Component;
  listHeaderComponent?: unknown;
  listFooterComponent?: unknown;
  listEmptyComponent?: unknown;
  horizontal: boolean;
  inverted: boolean;
  onEndReached?: (info: { distanceFromEnd: number }) => void;
  onEndReachedThreshold: number;
  onStartReached?: (info: { distanceFromStart: number }) => void;
  onStartReachedThreshold: number;
  onRefresh?: () => void;
  refreshing: boolean;
  progressViewOffset?: number;
  onViewableItemsChanged?: (info: IViewableItemsChangedInfo<ItemT>) => void;
  viewabilityConfig?: IViewabilityConfig;
  viewabilityConfigCallbackPairs?: IViewabilityConfigCallbackPair<ItemT>[];
  onScrollToIndexFailed?: (info: {
    index: number;
    highestMeasuredFrameIndex: number;
    averageItemLength: number;
  }) => void;
  initialNumToRender: number;
  initialScrollIndex?: number;
  maxToRenderPerBatch: number;
  updateCellsBatchingPeriod: number;
  windowSize: number;
  stickyHeaderIndices?: number[];
  maintainVisibleContentPosition?: {
    minIndexForVisible: number;
    autoscrollToTopThreshold?: number;
  };
  userOnScroll?: IScrollHandler;
  style?: IStyleProp<IViewStyle>;
  contentContainerStyle?: IStyleProp<IViewStyle>;
  keyboardShouldPersistTaps?: boolean | 'always' | 'never' | 'handled';
  keyboardDismissMode?: 'none' | 'on-drag' | 'interactive';
  // The remaining attrs (raw scroll-lifecycle callbacks, scrollEventThrottle, accessibility,
  // testID, …) that ride straight onto the inner ScrollView.
  forwarded: Record<string, unknown>;
}

type IUnknownHandler = (...args: readonly unknown[]) => unknown;

function isHandler(value: unknown): value is IUnknownHandler {
  return typeof value === 'function';
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isComponent(value: unknown): value is Component {
  return typeof value === 'function' || (typeof value === 'object' && value !== null);
}
function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

// The attrs that arrive via $attrs but must NOT be forwarded raw onto the inner ScrollView: VL
// composes its own onScroll (windowing offset + the user's onScroll) and its own onLayout (viewport
// measure), so a consumer-passed one is dropped here and re-set explicitly on the scroll props.
const HANDLED_ATTRS = ['onScroll', 'onLayout'];

function forwardAttrs(attrs: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(attrs)) {
    if (!HANDLED_ATTRS.includes(key)) result[key] = attrs[key];
  }
  return result;
}

// A list component element (ListHeaderComponent / ListEmptyComponent / ListFooterComponent) is
// either a Vue component (invoked via h) or a ready VNode (passed through). RN resolves the same
// `Component | element` union; we narrow with isVNode before isComponent (a VNode is an object).
function resolveElement(value: unknown): VNode | undefined {
  if (value === undefined || value === null) return undefined;
  if (isVNode(value)) return value;
  if (isComponent(value)) return h(value);
  return undefined;
}

function renderSeparatorElement(
  component: Component | undefined,
  leadingItem: unknown,
  trailingItem: unknown,
  overrides: Partial<ISeparatorProps<unknown>> | undefined,
): VNode | undefined {
  if (component === undefined) return undefined;
  const props: ISeparatorProps<unknown> = {
    highlighted: false,
    leadingItem,
    trailingItem,
    ...overrides,
  };
  return h(component, props);
}

function isScrollViewHandle(value: unknown): value is IScrollViewHandle {
  return isRecord(value) && typeof value.scrollTo === 'function';
}

export const VirtualizedList = defineComponent(
  <ItemT>(
    props: IVirtualizedListProps<ItemT>,
    {
      attrs,
      expose,
      emit,
      slots,
    }: ICtx<IVirtualizedListEmits<ItemT>, IVirtualizedListSlots<ItemT>>,
  ) => {
    // Reactive lifecycle state (the Vue twin of React's useState): a change in any of these
    // re-runs the windowing `computed` and the render fn.
    const scrollOffset = ref(EMPTY_OFFSET);
    const viewportLength = ref(EMPTY_OFFSET);
    // The offset we are imperatively driving native to. A fresh object identity each push so the
    // commit path re-applies it even when the numeric value repeats. undefined = none pending.
    const commandedOffset = ref<{ x: number; y: number } | undefined>(undefined);
    // Bumped when a NEW cell measurement lands or a batch tick fires, to request a re-render
    // without thrashing on already-known cells (React's measuredRef + setMeasureVersion).
    const measureVersion = ref(EMPTY_OFFSET);
    const separatorVersion = ref(EMPTY_OFFSET);

    // shallowRef, NOT ref: the ScrollView handle closes over the engine scroll node, reached by
    // identity through the engine's WeakMap mirror. A deep ref would proxy the object and every
    // imperative scroll (scrollToOffset/Index/…) would miss the node and silently no-op. See
    // .claude/skills/vue-adapter-reactivity.
    const scrollHandle = shallowRef<IScrollViewHandle | null>(null);
    const setScrollHandle = (instance: unknown): void => {
      scrollHandle.value = isScrollViewHandle(instance) ? instance : null;
    };

    // The five list events are emits, so Vue strips their onX listeners from $attrs. Detect listener
    // presence off the instance's own vnode props (what the parent passed), exactly like FlatList, so
    // an emit bridge is wired ONLY when the consumer actually listens (preserving the RefreshControl /
    // viewability gating of the prop-callback era).
    const instance = getCurrentInstance();
    const listens = (onName: string): boolean => {
      const vnodeProps = instance?.vnode.props;
      return vnodeProps != null && typeof vnodeProps[onName] === 'function';
    };

    // Non-reactive setup-scope state (the Vue twin of React's refs that never trigger a render):
    const measured = new Map<number, number>();
    // The previously committed window, so throttleWindow grows it by at most maxToRenderPerBatch
    // per tick instead of snapping.
    let committedWindow: { first: number; last: number } = { first: FIRST_INDEX, last: -1 };
    let sentEndForContentLength = NO_CONTENT_LENGTH_SENT;
    let sentStartForContentLength = NO_CONTENT_LENGTH_SENT;
    let lastViewable = new Map<string, IViewToken<ItemT>>();
    let viewableTimer: ReturnType<typeof setTimeout> | null = null;
    let batchTimer: ReturnType<typeof setTimeout> | null = null;
    let hasInteracted = false;
    const separatorOverrides = new Map<number, Partial<ISeparatorProps<unknown>>>();
    let appliedInitialScroll = false;
    let firstVisibleKey: string | null = null;

    const narrowed = computed<INarrowedProps<ItemT>>(() => {
      // extraData has no field of its own; reading it tracks it so a change forces a re-render
      // (RN's extraData contract).
      void props.extraData;
      const folded = normalizeVueAttrs(attrs);
      return {
        data: props.data,
        getItem: props.getItem,
        getItemCount: props.getItemCount,
        // Cell + chrome come from scoped slots. #item IS the render fn (a slot fn returning
        // VNode|VNode[], which the cell wrapper accepts directly). #separator carries scope props
        // (h(component, props)) so it goes through componentFromSlot; #header/#footer/#empty are
        // scopeless, so the bare slot fn is handed to resolveElement (its isComponent branch).
        renderItem: slots.item,
        keyExtractor: props.keyExtractor,
        getItemLayout: props.getItemLayout,
        itemSeparatorComponent: componentFromSlot(slots.separator),
        listHeaderComponent: slots.header,
        listFooterComponent: slots.footer,
        listEmptyComponent: slots.empty,
        horizontal: props.horizontal === true,
        inverted: props.inverted === true,
        onEndReached: listens('onEndReached')
          ? (info: { distanceFromEnd: number }): void => emit('endReached', info)
          : undefined,
        onEndReachedThreshold: asNumber(props.onEndReachedThreshold, DEFAULT_END_REACHED_THRESHOLD),
        onStartReached: listens('onStartReached')
          ? (info: { distanceFromStart: number }): void => emit('startReached', info)
          : undefined,
        onStartReachedThreshold: asNumber(
          props.onStartReachedThreshold,
          DEFAULT_START_REACHED_THRESHOLD,
        ),
        onRefresh: listens('onRefresh') ? (): void => emit('refresh') : undefined,
        refreshing: props.refreshing === true,
        progressViewOffset: props.progressViewOffset,
        onViewableItemsChanged: listens('onViewableItemsChanged')
          ? (info: IViewableItemsChangedInfo<ItemT>): void => emit('viewableItemsChanged', info)
          : undefined,
        viewabilityConfig: props.viewabilityConfig,
        viewabilityConfigCallbackPairs: props.viewabilityConfigCallbackPairs,
        onScrollToIndexFailed: listens('onScrollToIndexFailed')
          ? (info: {
              index: number;
              highestMeasuredFrameIndex: number;
              averageItemLength: number;
            }): void => emit('scrollToIndexFailed', info)
          : undefined,
        initialNumToRender: asNumber(props.initialNumToRender, DEFAULT_INITIAL_NUM_TO_RENDER),
        initialScrollIndex: props.initialScrollIndex,
        maxToRenderPerBatch: asNumber(props.maxToRenderPerBatch, DEFAULT_MAX_TO_RENDER_PER_BATCH),
        updateCellsBatchingPeriod: asNumber(
          props.updateCellsBatchingPeriod,
          DEFAULT_UPDATE_CELLS_BATCHING_PERIOD,
        ),
        windowSize: asNumber(props.windowSize, DEFAULT_WINDOW_SIZE),
        stickyHeaderIndices: props.stickyHeaderIndices,
        maintainVisibleContentPosition: props.maintainVisibleContentPosition,
        userOnScroll: isHandler(folded.onScroll) ? folded.onScroll : undefined,
        style: props.style,
        contentContainerStyle: props.contentContainerStyle,
        keyboardShouldPersistTaps: props.keyboardShouldPersistTaps,
        keyboardDismissMode: props.keyboardDismissMode,
        forwarded: forwardAttrs(folded),
      };
    });

    const keyFor = (index: number): string => {
      const p = narrowed.value;
      const item = p.getItem(p.data, index);
      return p.keyExtractor ? p.keyExtractor(item, index) : String(index);
    };

    // The windowing math, run through the shared @symbiotejs/components functions. It mutates the
    // non-reactive committedWindow as it throttles (the controlled side effect React runs during
    // render): committedWindow is plain state, so the write triggers no reactivity loop.
    const metrics = computed(() => {
      const p = narrowed.value;
      void measureVersion.value;
      const count = p.getItemCount(p.data);
      const gil = p.getItemLayout;
      const data = p.data;
      const fixedLayout =
        gil !== undefined
          ? (index: number): ICellLayout => {
              const layout = gil(data, index);
              return { length: layout.length, offset: layout.offset };
            }
          : undefined;
      const averageLength =
        fixedLayout !== undefined
          ? count > FIRST_INDEX
            ? fixedLayout(FIRST_INDEX).length
            : EMPTY_OFFSET
          : averageMeasuredLength(measured);
      const { offsets, lengths, total } = buildOffsets(count, measured, fixedLayout, averageLength);
      const target = computeWindow(
        count,
        offsets,
        lengths,
        scrollOffset.value,
        viewportLength.value,
        p.windowSize,
        p.initialNumToRender,
      );
      const throttled = throttleWindow(target, committedWindow, p.maxToRenderPerBatch);
      committedWindow = throttled;
      return {
        count,
        offsets,
        lengths,
        total,
        first: throttled.first,
        last: throttled.last,
        target,
        fixedLayout,
        averageLength,
      };
    });

    const scrollToPixel = (offset: number, animated: boolean): void => {
      const p = narrowed.value;
      const clamped = Math.max(EMPTY_OFFSET, offset);
      const targetOffset = p.horizontal
        ? { x: clamped, y: EMPTY_OFFSET }
        : { x: EMPTY_OFFSET, y: clamped };
      const handle = scrollHandle.value;
      if (handle !== null) {
        dlog(
          `Vue VirtualizedList scrollTo offset=${clamped} animated=${animated} (horizontal=${p.horizontal})`,
        );
        handle.scrollTo({ x: targetOffset.x, y: targetOffset.y, animated });
        return;
      }
      dlog(`Vue VirtualizedList scrollTo offset=${clamped} pending-ref`);
      commandedOffset.value = targetOffset;
    };

    const offsetForIndexLocal = (
      index: number,
      viewPosition: number,
      viewOffset: number,
    ): number => {
      const m = metrics.value;
      return offsetForIndex(
        index,
        viewPosition,
        viewOffset,
        m.count,
        m.offsets,
        m.lengths,
        viewportLength.value,
      );
    };

    const onScroll = (event: ISymbioteEvent): void => {
      const p = narrowed.value;
      const offset = readScrollOffset(event, p.horizontal);
      if (offset === undefined) return;
      dlog(`Vue VirtualizedList onScroll offset=${offset}`);
      // First scroll is the interaction that ungates waitForInteraction configs.
      hasInteracted = true;
      scrollOffset.value = offset;
      // A real native scroll supersedes any pending commanded offset.
      commandedOffset.value = undefined;
      // Compose, don't clobber: internal windowing ran first, now the user's onScroll.
      if (p.userOnScroll !== undefined) p.userOnScroll(event);
    };

    const onViewportLayout = (event: ISymbioteEvent): void => {
      const length = readLayoutLength(event, narrowed.value.horizontal);
      if (length === undefined) return;
      dlog(`Vue VirtualizedList onLayout viewport=${length}`);
      viewportLength.value = length;
    };

    const makeCellMeasure =
      (index: number) =>
      (event: ISymbioteEvent): void => {
        const p = narrowed.value;
        if (p.getItemLayout !== undefined) return;
        const length = readLayoutLength(event, p.horizontal);
        if (length === undefined) return;
        if (measured.get(index) === length) return;
        measured.set(index, length);
        dlog(`Vue VirtualizedList cell ${index} measured length=${length}`);
        measureVersion.value += 1;
      };

    const mergeSeparator = (gapIndex: number, patch: Partial<ISeparatorProps<unknown>>): void => {
      const count = metrics.value.count;
      if (gapIndex < FIRST_INDEX || gapIndex > count - 2) return;
      separatorOverrides.set(gapIndex, { ...separatorOverrides.get(gapIndex), ...patch });
      separatorVersion.value += 1;
    };

    const makeSeparators = (index: number): ISeparators => ({
      highlight: (): void => {
        dlog(`Vue VirtualizedList separator highlight cell=${index}`);
        mergeSeparator(index - 1, { highlighted: true });
        mergeSeparator(index, { highlighted: true });
      },
      unhighlight: (): void => {
        dlog(`Vue VirtualizedList separator unhighlight cell=${index}`);
        mergeSeparator(index - 1, { highlighted: false });
        mergeSeparator(index, { highlighted: false });
      },
      updateProps: (select: 'leading' | 'trailing', newProps: Record<string, unknown>): void => {
        mergeSeparator(select === 'leading' ? index - 1 : index, newProps);
      },
    });

    // ---- imperative handle (the shared IVirtualizedListHandle surface) ------
    const handle: IVirtualizedListHandle = {
      scrollToOffset: (params): void => {
        scrollToPixel(params.offset, params.animated ?? true);
      },
      scrollToIndex: (params): void => {
        const p = narrowed.value;
        const m = metrics.value;
        // No getItemLayout AND the target is past the last measured cell: report the failure
        // instead of scrolling to a fabricated estimate (RN VirtualizedList.js:179-195).
        if (p.getItemLayout === undefined && params.index > highestMeasuredIndex(measured)) {
          dlog(
            `Vue VirtualizedList onScrollToIndexFailed index=${params.index} ` +
              `highestMeasured=${highestMeasuredIndex(measured)} (no getItemLayout)`,
          );
          p.onScrollToIndexFailed?.({
            index: params.index,
            highestMeasuredFrameIndex: highestMeasuredIndex(measured),
            averageItemLength: m.averageLength,
          });
          return;
        }
        scrollToPixel(
          offsetForIndexLocal(
            params.index,
            params.viewPosition ?? FIRST_INDEX,
            params.viewOffset ?? EMPTY_OFFSET,
          ),
          params.animated ?? true,
        );
      },
      scrollToItem: (params): void => {
        const p = narrowed.value;
        const count = metrics.value.count;
        for (let index = FIRST_INDEX; index < count; index += 1) {
          if (p.getItem(p.data, index) === params.item) {
            scrollToPixel(
              offsetForIndexLocal(index, params.viewPosition ?? FIRST_INDEX, EMPTY_OFFSET),
              params.animated ?? true,
            );
            return;
          }
        }
        dlog('Vue VirtualizedList scrollToItem: item not found');
      },
      scrollToEnd: (params): void => {
        scrollToPixel(
          Math.max(EMPTY_OFFSET, metrics.value.total - viewportLength.value),
          params?.animated ?? true,
        );
      },
      flashScrollIndicators: (): void => {
        scrollHandle.value?.flashScrollIndicators();
      },
      getNativeScrollRef: (): IScrollViewHandle | null => scrollHandle.value,
      getScrollableNode: (): IScrollViewHandle | null => scrollHandle.value,
      getScrollResponder: (): IScrollViewHandle | null => scrollHandle.value,
      getScrollNode: (): ISymbioteNode | null => scrollHandle.value?.getScrollNode() ?? null,
      recordInteraction: (): void => {
        hasInteracted = true;
      },
    };
    expose(handle);

    // ---- after-commit effects (post-flush watchers, the Vue twin of useEffect) ----

    // Batch fill: when the throttled window has not reached the target, schedule a re-render so
    // the window keeps filling toward target over successive ticks (React's batch effect).
    watch(
      metrics,
      m => {
        if (batchTimer !== null) {
          clearTimeout(batchTimer);
          batchTimer = null;
        }
        if (m.first <= m.target.first && m.last >= m.target.last) return;
        batchTimer = setTimeout(() => {
          batchTimer = null;
          measureVersion.value += 1;
        }, narrowed.value.updateCellsBatchingPeriod);
      },
      { flush: 'post' },
    );

    // onEndReached: fire only when the actual last cell is rendered AND within threshold; dedup by
    // content length; re-arm on scroll away from the end (RN _maybeCallOnEdgeReached).
    watch(
      () => [narrowed.value, scrollOffset.value, viewportLength.value, metrics.value],
      () => {
        const p = narrowed.value;
        if (p.onEndReached === undefined || viewportLength.value <= EMPTY_OFFSET) return;
        const m = metrics.value;
        const { distanceFromEnd, withinThreshold } = computeEndReached(
          m.total,
          scrollOffset.value,
          viewportLength.value,
          p.onEndReachedThreshold,
        );
        const lastCellRendered = m.last === m.count - 1;
        if (withinThreshold && lastCellRendered && sentEndForContentLength !== m.total) {
          sentEndForContentLength = m.total;
          dlog(
            `Vue VirtualizedList onEndReached distanceFromEnd=${distanceFromEnd} ` +
              `(last=${m.last} of ${m.count}, contentLength=${m.total})`,
          );
          p.onEndReached({ distanceFromEnd });
        }
        if (!withinThreshold) sentEndForContentLength = NO_CONTENT_LENGTH_SENT;
      },
      { flush: 'post' },
    );

    // onStartReached: the top-edge twin of onEndReached.
    watch(
      () => [narrowed.value, scrollOffset.value, viewportLength.value, metrics.value],
      () => {
        const p = narrowed.value;
        if (p.onStartReached === undefined || viewportLength.value <= EMPTY_OFFSET) return;
        const m = metrics.value;
        const { distanceFromStart, withinThreshold } = computeStartReached(
          scrollOffset.value,
          viewportLength.value,
          p.onStartReachedThreshold,
        );
        const firstCellRendered = m.first === FIRST_INDEX;
        if (withinThreshold && firstCellRendered && sentStartForContentLength !== m.total) {
          sentStartForContentLength = m.total;
          dlog(
            `Vue VirtualizedList onStartReached distanceFromStart=${distanceFromStart} ` +
              `(first=${m.first}, contentLength=${m.total})`,
          );
          p.onStartReached({ distanceFromStart });
        }
        if (!withinThreshold) sentStartForContentLength = NO_CONTENT_LENGTH_SENT;
      },
      { flush: 'post' },
    );

    // Viewability: recompute which rendered cells clear the threshold and, if the viewable set
    // changed, fire onViewableItemsChanged + every config/callback pair, honoring minimumViewTime.
    watch(
      () => [narrowed.value, scrollOffset.value, viewportLength.value, metrics.value],
      () => {
        const p = narrowed.value;
        const m = metrics.value;
        const pairs = buildViewabilityPairs(
          p.onViewableItemsChanged,
          p.viewabilityConfig,
          p.viewabilityConfigCallbackPairs,
        );
        if (pairs.length === EMPTY_OFFSET || viewportLength.value <= EMPTY_OFFSET) return;
        if (m.count === FIRST_INDEX) return;

        const { tokens, map } = computeViewableSet({
          first: m.first,
          last: m.last,
          count: m.count,
          offsets: m.offsets,
          lengths: m.lengths,
          scrollOffset: scrollOffset.value,
          viewportLength: viewportLength.value,
          data: p.data,
          getItem: p.getItem,
          keyExtractor: p.keyExtractor,
          pairs,
          hasInteracted,
        });
        const diff = diffViewable(lastViewable, map, tokens);
        if (!diff.hasChanged) return;

        const commitAndFire = (): void => {
          lastViewable = map;
          dlog(
            `Vue VirtualizedList viewable=${tokens.length} changed=${diff.changed.length} ` +
              `(window [${m.first}, ${m.last}])`,
          );
          const info: IViewableItemsChangedInfo<ItemT> = {
            viewableItems: tokens,
            changed: diff.changed,
          };
          for (const pair of pairs) pair.onViewableItemsChanged(info);
        };

        const minimumViewTime = maxMinimumViewTime(pairs);
        if (viewableTimer !== null) {
          clearTimeout(viewableTimer);
          viewableTimer = null;
        }
        if (minimumViewTime > EMPTY_OFFSET) {
          dlog(
            `Vue VirtualizedList viewability debounce ${minimumViewTime}ms (window [${m.first}, ${m.last}])`,
          );
          viewableTimer = setTimeout(() => {
            viewableTimer = null;
            commitAndFire();
          }, minimumViewTime);
          return;
        }
        commitAndFire();
      },
      { flush: 'post' },
    );

    // initialScrollIndex: once the first viewport is known, jump to that index a single time.
    watch(
      () => [narrowed.value, viewportLength.value, metrics.value],
      () => {
        const p = narrowed.value;
        if (p.initialScrollIndex === undefined || appliedInitialScroll) return;
        if (viewportLength.value <= EMPTY_OFFSET || metrics.value.count === FIRST_INDEX) return;
        appliedInitialScroll = true;
        // The initial jump is instant (RN does not animate initialScrollIndex).
        scrollToPixel(offsetForIndexLocal(p.initialScrollIndex, FIRST_INDEX, EMPTY_OFFSET), false);
      },
      { flush: 'post' },
    );

    // maintainVisibleContentPosition JS anchor adjustment: track the key of the item at
    // minIndexForVisible; when a prepend moves it down, add the inserted extent in the leading
    // SPACER (the off-window items native MVCP cannot see) to scrollOffset so the anchored item
    // does not jump (RN getDerivedStateFromProps). Runs post-flush so the correction lands fast.
    watch(
      () => [narrowed.value, metrics.value, scrollOffset.value],
      () => {
        const p = narrowed.value;
        const m = metrics.value;
        if (p.maintainVisibleContentPosition === undefined || m.count === FIRST_INDEX) {
          firstVisibleKey = null;
          return;
        }
        const minIndexForVisible = p.maintainVisibleContentPosition.minIndexForVisible;
        const newFirstVisibleKey = m.count > minIndexForVisible ? keyFor(minIndexForVisible) : null;
        const prevKey = firstVisibleKey;

        if (prevKey !== null && newFirstVisibleKey !== null && prevKey !== newFirstVisibleKey) {
          let anchorIndex = -1;
          for (let index = minIndexForVisible; index < m.count; index += 1) {
            if (keyFor(index) === prevKey) {
              anchorIndex = index;
              break;
            }
          }
          if (anchorIndex > minIndexForVisible) {
            const spacerEnd = Math.min(anchorIndex, committedWindow.first);
            const insertedExtent =
              spacerEnd > minIndexForVisible
                ? m.offsets[spacerEnd] - m.offsets[minIndexForVisible]
                : EMPTY_OFFSET;
            if (insertedExtent > EMPTY_OFFSET) {
              const autoThreshold = p.maintainVisibleContentPosition.autoscrollToTopThreshold;
              const anchoredNearTop =
                autoThreshold !== undefined && scrollOffset.value <= autoThreshold;
              if (anchoredNearTop) {
                dlog(
                  `Vue VirtualizedList MVCP autoscroll-to-top (offset=${scrollOffset.value} <= ${autoThreshold})`,
                );
                scrollToPixel(EMPTY_OFFSET, true);
              } else {
                dlog(
                  `Vue VirtualizedList MVCP adjust +${insertedExtent}px ` +
                    `(anchor "${prevKey}" moved ${minIndexForVisible}->${anchorIndex})`,
                );
                scrollToPixel(scrollOffset.value + insertedExtent, false);
              }
            }
          }
        }
        firstVisibleKey = newFirstVisibleKey;
      },
      { flush: 'post' },
    );

    onBeforeUnmount(() => {
      if (viewableTimer !== null) clearTimeout(viewableTimer);
      if (batchTimer !== null) clearTimeout(batchTimer);
    });

    return () => {
      const p = narrowed.value;
      const m = metrics.value;
      // Read the version refs so a separator/measurement bump re-renders.
      void separatorVersion.value;

      if (p.renderItem === undefined)
        dlog('Vue VirtualizedList: no #item slot provided — cells render empty');

      dlog(
        `Vue VirtualizedList window [${m.first}, ${m.last}] of ${m.count} ` +
          `(offset=${scrollOffset.value}, viewport=${viewportLength.value}, rendered=${Math.max(0, m.last - m.first + 1)})`,
      );

      const children: VNode[] = [];
      const stickySet =
        p.stickyHeaderIndices !== undefined ? new Set(p.stickyHeaderIndices) : undefined;

      const header = resolveElement(p.listHeaderComponent);
      if (header !== undefined) {
        children.push(h('symbiote-view', { key: 'list-header' }, [header]));
      }

      let renderedStickyIndices: number[] = [];

      if (m.count === FIRST_INDEX) {
        const empty = resolveElement(p.listEmptyComponent);
        if (empty !== undefined) {
          children.push(h('symbiote-view', { key: 'list-empty' }, [empty]));
        }
      } else {
        const plan = buildListPlan({
          count: m.count,
          first: m.first,
          last: m.last,
          offsets: m.offsets,
          lengths: m.lengths,
          total: m.total,
          keyFor,
          stickyIndices: stickySet,
          hasHeader: header !== undefined,
          hasSeparators: p.itemSeparatorComponent !== undefined,
        });
        renderedStickyIndices = plan.stickyChildPositions;

        if (plan.leadingExtent > EMPTY_OFFSET) {
          children.push(
            h('symbiote-view', {
              key: 'spacer-leading',
              style: p.horizontal ? { width: plan.leadingExtent } : { height: plan.leadingExtent },
            }),
          );
        }

        const cellInverted = p.inverted
          ? p.horizontal
            ? INVERTED_X_STYLE
            : INVERTED_Y_STYLE
          : undefined;
        for (let cellPos = 0; cellPos < plan.cells.length; cellPos += 1) {
          const cell = plan.cells[cellPos];
          const item = p.getItem(p.data, cell.index);
          const content = p.renderItem?.({
            item,
            index: cell.index,
            separators: makeSeparators(cell.index),
          });
          children.push(
            h(
              'symbiote-view',
              {
                key: `cell-${cell.key}`,
                onLayout: makeCellMeasure(cell.index),
                style: cellInverted,
              },
              [content],
            ),
          );
          if (cell.index < m.last) {
            const separator = renderSeparatorElement(
              p.itemSeparatorComponent,
              item,
              p.getItem(p.data, cell.index + 1),
              separatorOverrides.get(cell.index),
            );
            if (separator !== undefined) {
              children.push(h('symbiote-view', { key: `sep-${cell.key}` }, [separator]));
            }
          }
        }

        if (plan.trailingExtent > EMPTY_OFFSET) {
          children.push(
            h('symbiote-view', {
              key: 'spacer-trailing',
              style: p.horizontal
                ? { width: plan.trailingExtent }
                : { height: plan.trailingExtent },
            }),
          );
        }
      }

      const footer = resolveElement(p.listFooterComponent);
      if (footer !== undefined) {
        children.push(h('symbiote-view', { key: 'list-footer' }, [footer]));
      }

      const resolvedContentContainerStyle: IStyleProp<IViewStyle> = p.horizontal
        ? [p.contentContainerStyle, { width: m.total }]
        : p.contentContainerStyle;
      const resolvedStyle: IStyleProp<IViewStyle> | undefined = p.inverted
        ? [p.style, p.horizontal ? INVERTED_X_STYLE : INVERTED_Y_STYLE]
        : p.style;

      const scrollProps: Record<string, unknown> = {
        ...p.forwarded,
        style: resolvedStyle,
        contentContainerStyle: resolvedContentContainerStyle,
        horizontal: p.horizontal,
        onScroll,
        onLayout: onViewportLayout,
        ref: setScrollHandle,
      };
      // The raw scroll-lifecycle callbacks (onScrollBeginDrag/…) and scrollEventThrottle are NOT in
      // PROP_KEYS, so they already ride through via ...p.forwarded. The keyboard props come from
      // typed props (PROP_KEYS), so re-set them explicitly here (only when provided).
      if (p.keyboardShouldPersistTaps !== undefined) {
        scrollProps.keyboardShouldPersistTaps = p.keyboardShouldPersistTaps;
      }
      if (p.keyboardDismissMode !== undefined) {
        scrollProps.keyboardDismissMode = p.keyboardDismissMode;
      }
      // A pending imperative/initial scroll rides down as contentOffset (fallback for the
      // pre-mount window before the handle attaches).
      if (commandedOffset.value !== undefined) scrollProps.contentOffset = commandedOffset.value;
      // Headers in the window stick; an empty list leaves the prop off entirely.
      if (renderedStickyIndices.length > 0) scrollProps.stickyHeaderIndices = renderedStickyIndices;
      // Forward maintainVisibleContentPosition to the ScrollView so it anchors the in-window cells.
      // minIndexForVisible is bumped by 1 when a ListHeaderComponent occupies child 0.
      if (p.maintainVisibleContentPosition !== undefined) {
        scrollProps.maintainVisibleContentPosition = {
          ...p.maintainVisibleContentPosition,
          minIndexForVisible:
            p.maintainVisibleContentPosition.minIndexForVisible + (header !== undefined ? 1 : 0),
        };
      }
      // Pull-to-refresh: when a @refresh listener is present, build a RefreshControl for the
      // ScrollView's refreshControl prop (iOS sibling / Android wrap, owned by ScrollView). The
      // onRefresh bridge is gated on the listener, so an unlistened list builds no control.
      if (p.onRefresh !== undefined) {
        dlog('Vue VirtualizedList wiring RefreshControl (@refresh listened)');
        scrollProps.refreshControl = h(RefreshControl, {
          refreshing: p.refreshing,
          onRefresh: p.onRefresh,
          progressViewOffset: p.progressViewOffset,
        });
      }

      return h(ScrollView, scrollProps, { default: () => children });
    };
  },
  {
    name: 'VirtualizedList',
    inheritAttrs: false,
    props: PROP_KEYS,
    emits: EMIT_KEYS,
  } as unknown as undefined,
);
