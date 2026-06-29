// VirtualizedList, the Vue lifecycle half. The windowing engine (offset table, window
// compute, batch throttle, viewability, edge-reached, the child PLAN, the imperative-handle
// surface) lives in @symbiote/components/state, shared verbatim with the React adapter. Here
// Vue supplies only the reactivity: refs for scroll offset / viewport / measurement bumps, a
// `computed` that runs the shared windowing math, post-flush watchers for the after-commit
// work (batch fill, onEndReached/onStartReached, viewability, initialScroll, MVCP), and the
// imperative handle via expose(). This is the Vue twin of the React adapter's
// useState/useRef/useEffect over the same shared functions. It drives the Vue ScrollView,
// exactly as the React list drives the React ScrollView.
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
  h,
  isVNode,
  onBeforeUnmount,
  ref,
  shallowRef,
  watch,
  type Component,
  type SetupContext,
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
} from '@symbiote/components';
import {
  dlog,
  type IStyleProp,
  type ISymbioteEvent,
  type ISymbioteNode,
  type IViewStyle,
} from '@symbiote/engine';
import { ScrollView } from '../scroll-view';
import { RefreshControl } from '../refresh-control';
import { normalizeVueAttrs } from '../normalize-attrs';

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
} from '@symbiote/components';

type IRenderItem<ItemT> = (info: {
  item: ItemT;
  index: number;
  separators: ISeparators;
}) => VNode | undefined;

export interface IVirtualizedListProps<ItemT> {
  data: unknown;
  getItem: (data: unknown, index: number) => ItemT;
  getItemCount: (data: unknown) => number;
  renderItem: IRenderItem<ItemT>;
  keyExtractor?: (item: ItemT, index: number) => string;
  getItemLayout?: (
    data: unknown,
    index: number,
  ) => { length: number; offset: number; index: number };
  ItemSeparatorComponent?: Component;
  ListHeaderComponent?: Component | VNode;
  ListFooterComponent?: Component | VNode;
  ListEmptyComponent?: Component | VNode;
  horizontal?: boolean;
  inverted?: boolean;
  extraData?: unknown;
  onEndReached?: (info: { distanceFromEnd: number }) => void;
  onEndReachedThreshold?: number;
  onStartReached?: (info: { distanceFromStart: number }) => void;
  onStartReachedThreshold?: number;
  onRefresh?: () => void;
  refreshing?: boolean | null;
  progressViewOffset?: number;
  onViewableItemsChanged?: (info: IViewableItemsChangedInfo<ItemT>) => void;
  viewabilityConfig?: IViewabilityConfig;
  viewabilityConfigCallbackPairs?: IViewabilityConfigCallbackPair<ItemT>[];
  onScrollToIndexFailed?: (info: {
    index: number;
    highestMeasuredFrameIndex: number;
    averageItemLength: number;
  }) => void;
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
}

type IScrollHandler = (event: ISymbioteEvent) => void;

// The narrowed snapshot the lifecycle works against. Attrs arrive untyped (Vue $attrs), so each
// field is narrowed with a runtime guard rather than a cast. ItemT is `unknown` at runtime: Vue
// $attrs carry no generic, the exported IVirtualizedListProps documents the surface for consumers.
interface INarrowedProps {
  data: unknown;
  getItem: (data: unknown, index: number) => unknown;
  getItemCount: (data: unknown) => number;
  renderItem: IRenderItem<unknown>;
  keyExtractor?: (item: unknown, index: number) => string;
  getItemLayout?: (data: unknown, index: number) => { length: number; offset: number };
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
  onViewableItemsChanged?: (info: IViewableItemsChangedInfo<unknown>) => void;
  viewabilityConfig?: IViewabilityConfig;
  viewabilityConfigCallbackPairs?: IViewabilityConfigCallbackPair<unknown>[];
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
  // The remaining attrs (scroll-lifecycle callbacks, keyboard, accessibility, testID, …) that ride
  // straight onto the inner ScrollView.
  forwarded: Record<string, unknown>;
}

type IUnknownHandler = (...args: readonly unknown[]) => unknown;

function isHandler(value: unknown): value is IUnknownHandler {
  return typeof value === 'function';
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isStyleProp(value: unknown): value is IStyleProp<IViewStyle> {
  return typeof value === 'object' && value !== null;
}
function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(entry => typeof entry === 'number');
}
function isComponent(value: unknown): value is Component {
  return typeof value === 'function' || (typeof value === 'object' && value !== null);
}
function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

function noopGetItem(_data: unknown, _index: number): unknown {
  return undefined;
}
function zeroCount(): number {
  return 0;
}
function noopRender(): undefined {
  return undefined;
}

// trackColor-style narrowing for the viewability config: keep only the numeric/boolean fields.
function normalizeViewabilityConfig(value: unknown): IViewabilityConfig | undefined {
  if (!isRecord(value)) return undefined;
  const config: IViewabilityConfig = {};
  if (typeof value.minimumViewTime === 'number') config.minimumViewTime = value.minimumViewTime;
  if (typeof value.viewAreaCoveragePercentThreshold === 'number') {
    config.viewAreaCoveragePercentThreshold = value.viewAreaCoveragePercentThreshold;
  }
  if (typeof value.itemVisiblePercentThreshold === 'number') {
    config.itemVisiblePercentThreshold = value.itemVisiblePercentThreshold;
  }
  if (typeof value.waitForInteraction === 'boolean') {
    config.waitForInteraction = value.waitForInteraction;
  }
  return config;
}

function normalizePairs(value: unknown): IViewabilityConfigCallbackPair<unknown>[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const pairs: IViewabilityConfigCallbackPair<unknown>[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const callback = entry.onViewableItemsChanged;
    if (!isHandler(callback)) continue;
    pairs.push({
      viewabilityConfig: normalizeViewabilityConfig(entry.viewabilityConfig) ?? {},
      onViewableItemsChanged: callback,
    });
  }
  return pairs;
}

function normalizeMaintainVisible(
  value: unknown,
): { minIndexForVisible: number; autoscrollToTopThreshold?: number } | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.minIndexForVisible !== 'number') return undefined;
  const result: { minIndexForVisible: number; autoscrollToTopThreshold?: number } = {
    minIndexForVisible: value.minIndexForVisible,
  };
  if (typeof value.autoscrollToTopThreshold === 'number') {
    result.autoscrollToTopThreshold = value.autoscrollToTopThreshold;
  }
  return result;
}

// The prop keys the lifecycle consumes or reconstructs itself; everything else forwards onto the
// inner ScrollView. The pass-through scroll-lifecycle / keyboard / accessibility props are NOT
// listed (they ride straight through). onLayout is omitted from forwarding by being re-set
// explicitly on the scroll props (the viewport measure), mirroring the React assembly.
const HANDLED_ATTRS = [
  'data',
  'getItem',
  'getItemCount',
  'renderItem',
  'keyExtractor',
  'getItemLayout',
  'ItemSeparatorComponent',
  'ListHeaderComponent',
  'ListFooterComponent',
  'ListEmptyComponent',
  'horizontal',
  'inverted',
  'extraData',
  'onEndReached',
  'onEndReachedThreshold',
  'onStartReached',
  'onStartReachedThreshold',
  'onRefresh',
  'refreshing',
  'progressViewOffset',
  'onViewableItemsChanged',
  'viewabilityConfig',
  'viewabilityConfigCallbackPairs',
  'onScrollToIndexFailed',
  'initialNumToRender',
  'initialScrollIndex',
  'maxToRenderPerBatch',
  'updateCellsBatchingPeriod',
  'windowSize',
  'stickyHeaderIndices',
  'maintainVisibleContentPosition',
  'onScroll',
  'style',
  'contentContainerStyle',
  'onLayout',
];

function forwardAttrs(attrs: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(attrs)) {
    if (!HANDLED_ATTRS.includes(key)) result[key] = attrs[key];
  }
  return result;
}

function narrowProps(raw: Record<string, unknown>): INarrowedProps {
  const attrs = normalizeVueAttrs(raw);
  const getItemLayoutRaw = attrs.getItemLayout;
  const getItemLayout = isHandler(getItemLayoutRaw)
    ? (data: unknown, index: number): { length: number; offset: number } => {
        const layout = getItemLayoutRaw(data, index);
        return isRecord(layout)
          ? {
              length: typeof layout.length === 'number' ? layout.length : EMPTY_OFFSET,
              offset: typeof layout.offset === 'number' ? layout.offset : EMPTY_OFFSET,
            }
          : { length: EMPTY_OFFSET, offset: EMPTY_OFFSET };
      }
    : undefined;

  // getItemCount/renderItem/keyExtractor return non-void (number / VNode / string), so they are
  // wrapped to coerce the untyped handler's return into the typed shape (no cast).
  const getItemCountRaw = attrs.getItemCount;
  const renderItemRaw = attrs.renderItem;
  const keyExtractorRaw = attrs.keyExtractor;

  return {
    data: attrs.data,
    getItem: isHandler(attrs.getItem) ? attrs.getItem : noopGetItem,
    getItemCount: isHandler(getItemCountRaw)
      ? (data: unknown): number => {
          const count = getItemCountRaw(data);
          return typeof count === 'number' ? count : EMPTY_OFFSET;
        }
      : zeroCount,
    renderItem: isHandler(renderItemRaw)
      ? (info): VNode | undefined => {
          const node = renderItemRaw(info);
          return isVNode(node) ? node : undefined;
        }
      : noopRender,
    keyExtractor: isHandler(keyExtractorRaw)
      ? (item: unknown, index: number): string => {
          const key = keyExtractorRaw(item, index);
          return typeof key === 'string' ? key : String(index);
        }
      : undefined,
    getItemLayout,
    itemSeparatorComponent: isComponent(attrs.ItemSeparatorComponent)
      ? attrs.ItemSeparatorComponent
      : undefined,
    listHeaderComponent: attrs.ListHeaderComponent,
    listFooterComponent: attrs.ListFooterComponent,
    listEmptyComponent: attrs.ListEmptyComponent,
    horizontal: attrs.horizontal === true,
    inverted: attrs.inverted === true,
    onEndReached: isHandler(attrs.onEndReached) ? attrs.onEndReached : undefined,
    onEndReachedThreshold: asNumber(attrs.onEndReachedThreshold, DEFAULT_END_REACHED_THRESHOLD),
    onStartReached: isHandler(attrs.onStartReached) ? attrs.onStartReached : undefined,
    onStartReachedThreshold: asNumber(
      attrs.onStartReachedThreshold,
      DEFAULT_START_REACHED_THRESHOLD,
    ),
    onRefresh: isHandler(attrs.onRefresh) ? attrs.onRefresh : undefined,
    refreshing: attrs.refreshing === true,
    progressViewOffset:
      typeof attrs.progressViewOffset === 'number' ? attrs.progressViewOffset : undefined,
    onViewableItemsChanged: isHandler(attrs.onViewableItemsChanged)
      ? attrs.onViewableItemsChanged
      : undefined,
    viewabilityConfig: normalizeViewabilityConfig(attrs.viewabilityConfig),
    viewabilityConfigCallbackPairs: normalizePairs(attrs.viewabilityConfigCallbackPairs),
    onScrollToIndexFailed: isHandler(attrs.onScrollToIndexFailed)
      ? attrs.onScrollToIndexFailed
      : undefined,
    initialNumToRender: asNumber(attrs.initialNumToRender, DEFAULT_INITIAL_NUM_TO_RENDER),
    initialScrollIndex:
      typeof attrs.initialScrollIndex === 'number' ? attrs.initialScrollIndex : undefined,
    maxToRenderPerBatch: asNumber(attrs.maxToRenderPerBatch, DEFAULT_MAX_TO_RENDER_PER_BATCH),
    updateCellsBatchingPeriod: asNumber(
      attrs.updateCellsBatchingPeriod,
      DEFAULT_UPDATE_CELLS_BATCHING_PERIOD,
    ),
    windowSize: asNumber(attrs.windowSize, DEFAULT_WINDOW_SIZE),
    stickyHeaderIndices: isNumberArray(attrs.stickyHeaderIndices)
      ? attrs.stickyHeaderIndices
      : undefined,
    maintainVisibleContentPosition: normalizeMaintainVisible(attrs.maintainVisibleContentPosition),
    userOnScroll: isHandler(attrs.onScroll) ? attrs.onScroll : undefined,
    style: isStyleProp(attrs.style) ? attrs.style : undefined,
    contentContainerStyle: isStyleProp(attrs.contentContainerStyle)
      ? attrs.contentContainerStyle
      : undefined,
    forwarded: forwardAttrs(attrs),
  };
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

export const VirtualizedList = defineComponent({
  name: 'VirtualizedList',
  inheritAttrs: false,
  setup(_props, { attrs: rawAttrs, slots: _slots, expose }: SetupContext) {
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

    // Non-reactive setup-scope state (the Vue twin of React's refs that never trigger a render):
    const measured = new Map<number, number>();
    // The previously committed window, so throttleWindow grows it by at most maxToRenderPerBatch
    // per tick instead of snapping.
    let committedWindow: { first: number; last: number } = { first: FIRST_INDEX, last: -1 };
    let sentEndForContentLength = NO_CONTENT_LENGTH_SENT;
    let sentStartForContentLength = NO_CONTENT_LENGTH_SENT;
    let lastViewable = new Map<string, IViewToken<unknown>>();
    let viewableTimer: ReturnType<typeof setTimeout> | null = null;
    let batchTimer: ReturnType<typeof setTimeout> | null = null;
    let hasInteracted = false;
    const separatorOverrides = new Map<number, Partial<ISeparatorProps<unknown>>>();
    let appliedInitialScroll = false;
    let firstVisibleKey: string | null = null;

    const props = computed<INarrowedProps>(() => narrowProps(rawAttrs));

    const keyFor = (index: number): string => {
      const p = props.value;
      const item = p.getItem(p.data, index);
      return p.keyExtractor ? p.keyExtractor(item, index) : String(index);
    };

    // The windowing math, run through the shared @symbiote/components functions. It mutates the
    // non-reactive committedWindow as it throttles (the controlled side effect React runs during
    // render): committedWindow is plain state, so the write triggers no reactivity loop.
    const metrics = computed(() => {
      const p = props.value;
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
      const p = props.value;
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
      const p = props.value;
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
      const length = readLayoutLength(event, props.value.horizontal);
      if (length === undefined) return;
      dlog(`Vue VirtualizedList onLayout viewport=${length}`);
      viewportLength.value = length;
    };

    const makeCellMeasure =
      (index: number) =>
      (event: ISymbioteEvent): void => {
        const p = props.value;
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
        const p = props.value;
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
        const p = props.value;
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
        }, props.value.updateCellsBatchingPeriod);
      },
      { flush: 'post' },
    );

    // onEndReached: fire only when the actual last cell is rendered AND within threshold; dedup by
    // content length; re-arm on scroll away from the end (RN _maybeCallOnEdgeReached).
    watch(
      () => [props.value, scrollOffset.value, viewportLength.value, metrics.value],
      () => {
        const p = props.value;
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
      () => [props.value, scrollOffset.value, viewportLength.value, metrics.value],
      () => {
        const p = props.value;
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
      () => [props.value, scrollOffset.value, viewportLength.value, metrics.value],
      () => {
        const p = props.value;
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
          const info: IViewableItemsChangedInfo<unknown> = {
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
      () => [props.value, viewportLength.value, metrics.value],
      () => {
        const p = props.value;
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
      () => [props.value, metrics.value, scrollOffset.value],
      () => {
        const p = props.value;
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
      const p = props.value;
      const m = metrics.value;
      // Read the version refs so a separator/measurement bump re-renders.
      void separatorVersion.value;

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
          const content = p.renderItem({
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
      // The scroll-lifecycle callbacks (onScrollBeginDrag/…), scrollEventThrottle, and the
      // keyboard props are NOT in HANDLED_ATTRS, so they already ride through via ...p.forwarded.
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
      // Pull-to-refresh: when onRefresh is set, build a RefreshControl for the ScrollView's
      // refreshControl prop (iOS sibling / Android wrap, owned by ScrollView).
      if (p.onRefresh !== undefined) {
        dlog('Vue VirtualizedList wiring RefreshControl (onRefresh provided)');
        scrollProps.refreshControl = h(RefreshControl, {
          refreshing: p.refreshing,
          onRefresh: p.onRefresh,
          progressViewOffset: p.progressViewOffset,
        });
      }

      return h(ScrollView, scrollProps, { default: () => children });
    };
  },
});
