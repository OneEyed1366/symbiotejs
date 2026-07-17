// VirtualizedList, the Vue lifecycle half. The orchestration — window recompute, batch throttle,
// viewability, edge-reached, initial-scroll, MVCP, the imperative scrolls — is the framework-agnostic
// `reduceList` state machine in @symbiote-native/components (state/virtualized-list-reducer), shared verbatim
// with React and Angular. Here Vue supplies only the reactivity: it turns native events into ACTIONS,
// holds ONE plain state cell (listState), runs the returned EFFECTS with Vue primitives (a native
// scrollTo, an emit, a setTimeout, a version bump), and builds the cell/spacer VNodes off the plan.
// A single `metrics` computed derives the window once per render (refresh-metrics); a single
// post-flush watcher on the windowing signature runs the after-commit `commit` pass. This is the Vue
// twin of the React adapter's one-state-cell + dispatch + runEffects. It drives the Vue ScrollView,
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
// Lists have no Descriptor render fn (the cell content is the framework's own children).
// Cells/spacers are built with h() directly off the plan.
//
// Reactivity gotcha: the ScrollView's exposed handle is held in a shallowRef so the engine
// node it closes over is reached by identity; a deep ref would proxy it and the imperative
// scroll commands would silently no-op. The folded listState is a PLAIN object (not reactive) —
// mutating it never triggers Vue; the `version` ref is bumped when a transition changes render state.

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
  buildListPlan,
  buildViewabilityPairs,
  createInitialListState,
  isSeparatorGapInRange,
  listEffectSignature,
  readLayoutLength,
  readScrollOffset,
  reduceList,
  resolveItemKey,
  type IListAction,
  type IListEffect,
  type IListReducerInputs,
  type IListState,
  type IScrollViewHandle,
  type ISeparatorProps,
  type ISeparators,
  type IViewabilityConfig,
  type IViewabilityConfigCallbackPair,
  type IViewableItemsChangedInfo,
  type IVirtualizedListHandle,
} from '@symbiote-native/components';
import {
  dlog,
  type IStyleProp,
  type ISymbioteEvent,
  type ISymbioteNode,
  type IViewStyle,
} from '@symbiote-native/engine';
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
} from '@symbiote-native/components';

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
  // Raw native scroll passthrough: NOT emits, they ride through $attrs onto the
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
    // Bumped when a transition changes render-relevant state, so the `metrics` computed and the
    // render fn re-run (listState is plain, non-reactive, so mutating it triggers nothing itself).
    const version = ref(EMPTY_OFFSET);
    const separatorVersion = ref(EMPTY_OFFSET);
    // The offset we are imperatively driving native to. A fresh object identity each push so the
    // commit path re-applies it even when the numeric value repeats. undefined = none pending.
    const commandedOffset = ref<{ x: number; y: number } | undefined>(undefined);

    // shallowRef, NOT ref: the ScrollView handle closes over the engine scroll node, reached by
    // identity through the engine's WeakMap mirror. A deep ref would proxy the object and every
    // imperative scroll (scrollToOffset/Index/…) would miss the node and silently no-op.
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

    // The one folded state cell (the Vue twin of React's stateRef); plus the per-gap separator
    // overrides + the adapter-owned debounce/fill timers.
    const listState: IListState<ItemT> = createInitialListState<ItemT>();
    const separatorOverrides = new Map<number, Partial<ISeparatorProps<unknown>>>();
    let viewableTimer: ReturnType<typeof setTimeout> | null = null;
    let batchTimer: ReturnType<typeof setTimeout> | null = null;

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

    // The reducer inputs, folded off `narrowed`. Rebuilt per call (cheap); the viewability pairs are
    // rebuilt here so the reduce and the effect fire against the same set.
    const buildInputs = (): IListReducerInputs<ItemT> => {
      const p = narrowed.value;
      return {
        data: p.data,
        getItem: p.getItem,
        getItemCount: p.getItemCount,
        keyExtractor: p.keyExtractor,
        getItemLayout: p.getItemLayout,
        horizontal: p.horizontal,
        windowSize: p.windowSize,
        initialNumToRender: p.initialNumToRender,
        maxToRenderPerBatch: p.maxToRenderPerBatch,
        updateCellsBatchingPeriod: p.updateCellsBatchingPeriod,
        onEndReachedThreshold: p.onEndReachedThreshold,
        onStartReachedThreshold: p.onStartReachedThreshold,
        onEndReachedActive: p.onEndReached !== undefined,
        onStartReachedActive: p.onStartReached !== undefined,
        viewabilityPairs: buildViewabilityPairs(
          p.onViewableItemsChanged,
          p.viewabilityConfig,
          p.viewabilityConfigCallbackPairs,
        ),
        maintainVisibleContentPosition: p.maintainVisibleContentPosition,
        initialScrollIndex: p.initialScrollIndex,
      };
    };

    const keyFor = (index: number): string => {
      const p = narrowed.value;
      return resolveItemKey(p.getItem(p.data, index), index, p.keyExtractor);
    };

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

    // Execute the reducer's effects with Vue primitives. `inputs` is threaded through so a
    // fire-viewable fires against the same pairs the reduce used.
    const runEffects = (effects: IListEffect<ItemT>[], inputs: IListReducerInputs<ItemT>): void => {
      const p = narrowed.value;
      for (const effect of effects) {
        switch (effect.kind) {
          case 'scroll-to':
            scrollToPixel(effect.offset, effect.animated);
            break;
          case 'fire-end-reached':
            p.onEndReached?.({ distanceFromEnd: effect.distanceFromEnd });
            break;
          case 'fire-start-reached':
            p.onStartReached?.({ distanceFromStart: effect.distanceFromStart });
            break;
          case 'fire-scroll-to-index-failed':
            p.onScrollToIndexFailed?.({
              index: effect.index,
              highestMeasuredFrameIndex: effect.highestMeasuredFrameIndex,
              averageItemLength: effect.averageItemLength,
            });
            break;
          case 'schedule-refill': {
            if (batchTimer !== null) clearTimeout(batchTimer);
            batchTimer = setTimeout(() => {
              batchTimer = null;
              dispatch({ kind: 'batch-tick' });
            }, effect.delay);
            break;
          }
          case 'fire-viewable': {
            const pairs = inputs.viewabilityPairs;
            const info = effect.info;
            const map = effect.map;
            const fire = (): void => {
              for (const pair of pairs) pair.onViewableItemsChanged(info);
              dispatch({ kind: 'viewable-fired', map });
            };
            if (viewableTimer !== null) {
              clearTimeout(viewableTimer);
              viewableTimer = null;
            }
            if (effect.delay > EMPTY_OFFSET) {
              viewableTimer = setTimeout(() => {
                viewableTimer = null;
                fire();
              }, effect.delay);
            } else {
              fire();
            }
            break;
          }
        }
      }
    };

    const dispatch = (action: IListAction<ItemT>): void => {
      const inputs = buildInputs();
      const result = reduceList(listState, action, inputs);
      runEffects(result.effects, inputs);
      if (result.changed) version.value += 1;
    };

    // The single derive-per-render: the window is recomputed once here (refresh-metrics) and cached
    // by the computed until `version` or the narrowed props change, so the render fn and the commit
    // signature both read it without re-deriving (which would double-advance the throttle).
    const metrics = computed(() => {
      void version.value;
      reduceList(listState, { kind: 'refresh-metrics' }, buildInputs());
      return listState.metrics;
    });

    const commitSignature = computed(() => {
      void metrics.value;
      return listEffectSignature(listState);
    });

    const onScroll = (event: ISymbioteEvent): void => {
      const p = narrowed.value;
      const offset = readScrollOffset(event, p.horizontal);
      if (offset === undefined) return;
      dlog(`Vue VirtualizedList onScroll offset=${offset}`);
      // A real native scroll supersedes any pending commanded offset.
      commandedOffset.value = undefined;
      dispatch({ kind: 'scroll', offset });
      // Compose, don't clobber: internal windowing ran first, now the user's onScroll.
      if (p.userOnScroll !== undefined) p.userOnScroll(event);
    };

    const onViewportLayout = (event: ISymbioteEvent): void => {
      const length = readLayoutLength(event, narrowed.value.horizontal);
      if (length === undefined) return;
      dlog(`Vue VirtualizedList onLayout viewport=${length}`);
      dispatch({ kind: 'layout', length });
    };

    const makeCellMeasure =
      (index: number) =>
      (event: ISymbioteEvent): void => {
        const length = readLayoutLength(event, narrowed.value.horizontal);
        if (length === undefined) return;
        dlog(`Vue VirtualizedList cell ${index} measured length=${length}`);
        dispatch({ kind: 'measure', index, length });
      };

    const mergeSeparator = (gapIndex: number, patch: Partial<ISeparatorProps<unknown>>): void => {
      if (!isSeparatorGapInRange(gapIndex, listState.metrics.count)) return;
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
        dispatch({
          kind: 'scroll-to-offset',
          offset: params.offset,
          animated: params.animated ?? true,
        });
      },
      scrollToIndex: (params): void => {
        dispatch({
          kind: 'scroll-to-index',
          index: params.index,
          animated: params.animated ?? true,
          viewPosition: params.viewPosition ?? FIRST_INDEX,
          viewOffset: params.viewOffset ?? EMPTY_OFFSET,
        });
      },
      scrollToItem: (params): void => {
        dispatch({
          kind: 'scroll-to-item',
          item: params.item,
          animated: params.animated ?? true,
          viewPosition: params.viewPosition ?? FIRST_INDEX,
        });
      },
      scrollToEnd: (params): void => {
        dispatch({ kind: 'scroll-to-end', animated: params?.animated ?? true });
      },
      flashScrollIndicators: (): void => {
        scrollHandle.value?.flashScrollIndicators();
      },
      getNativeScrollRef: (): IScrollViewHandle | null => scrollHandle.value,
      getScrollableNode: (): IScrollViewHandle | null => scrollHandle.value,
      getScrollResponder: (): IScrollViewHandle | null => scrollHandle.value,
      getScrollNode: (): ISymbioteNode | null => scrollHandle.value?.getScrollNode() ?? null,
      recordInteraction: (): void => {
        dispatch({ kind: 'record-interaction' });
      },
    };
    expose(handle);

    // ---- after-commit pass (one post-flush watcher, the Vue twin of the layout effect) ----
    // Runs the deferred effects (batch fill, edge-reached, viewability, initial-scroll, MVCP)
    // whenever the windowing signature changes — the same dedup key every adapter shares.
    watch(
      commitSignature,
      () => {
        const inputs = buildInputs();
        const result = reduceList(listState, { kind: 'commit' }, inputs);
        runEffects(result.effects, inputs);
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
          `(offset=${listState.scrollOffset}, viewport=${listState.viewportLength}, rendered=${Math.max(0, m.last - m.first + 1)})`,
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
