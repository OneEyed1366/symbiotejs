// VirtualizedList: real windowing over the existing ScrollView. Only the cells
// whose computed offset falls inside the visible window (plus a leading/trailing
// buffer) are rendered; everything above and below is collapsed into two spacer
// Views whose sizes sum to the off-screen extent, so the scroll thumb and total
// content size stay correct without mounting all N rows.
//
// The orchestration — window recompute, edge-reached, viewability, batch fill, MVCP, the
// imperative scrolls — is the framework-agnostic `reduceList` state machine in
// @symbiote-native/components (state/virtualized-list-reducer), shared verbatim with Vue and Angular.
// React supplies ONLY its lifecycle: it turns native events into ACTIONS, holds ONE state cell,
// runs the returned EFFECTS with React primitives (a native scrollTo, a callback, a setTimeout, a
// forced re-render), and builds the per-cell elements (createElement). The single derive-per-render
// invariant is a `refresh-metrics` dispatched from the render body; the after-commit effects come
// from a `commit` dispatched in a layout effect (before paint, so MVCP's shift lands without a
// visible jump). Lists have no Descriptor render fn — the cell content is React's own children.
//
// Imperative scrolling resolves to an offset in the reducer and rides the ScrollView's native
// scrollTo command via its handle ref, animated by default. The `contentOffset` prop is only a
// fallback for the pre-mount window (handle not yet attached).

import {
  createElement,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ComponentType,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { dlog, type ISymbioteEvent, type ISymbioteNode } from '@symbiote-native/engine';
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
  type ICellLayout,
  type IListAction,
  type IListEffect,
  type IListReducerInputs,
  type IListState,
  type ISeparators,
  type ISeparatorProps,
  type IViewToken,
  type IViewableItemsChangedInfo,
  type IViewabilityConfig,
  type IViewabilityConfigCallbackPair,
  type IVirtualizedListHandle,
} from '@symbiote-native/components';
import { ScrollView, type IScrollViewHandle, type IScrollViewProps } from '../scroll-view';
import { RefreshControl } from '../refresh-control';
import type { IAccessibilityProps, IAriaProps } from '@symbiote-native/components';
import type { IStyleProp, IViewStyle } from '../../utils/styles';

// Re-export the shared list types so flat-list / virtualized-section-list keep importing them
// from '../virtualized-list' (their import paths are unchanged). One source of truth in core.
export type {
  ICellLayout,
  ISeparators,
  ISeparatorProps,
  IViewToken,
  IViewableItemsChangedInfo,
  IViewabilityConfig,
  IViewabilityConfigCallbackPair,
  IVirtualizedListHandle,
};

type IRenderItem<ItemT> = (info: {
  item: ItemT;
  index: number;
  separators: ISeparators;
}) => ReactNode;

export interface IVirtualizedListProps<ItemT> extends IAccessibilityProps, IAriaProps {
  data: unknown;
  getItem: (data: unknown, index: number) => ItemT;
  getItemCount: (data: unknown) => number;
  renderItem: IRenderItem<ItemT>;
  keyExtractor?: (item: ItemT, index: number) => string;
  getItemLayout?: (
    data: unknown,
    index: number,
  ) => { length: number; offset: number; index: number };
  ItemSeparatorComponent?: ComponentType<ISeparatorProps<ItemT>>;
  ListHeaderComponent?: ComponentType<Record<string, never>> | ReactElement;
  ListFooterComponent?: ComponentType<Record<string, never>> | ReactElement;
  ListEmptyComponent?: ComponentType<Record<string, never>> | ReactElement;
  horizontal?: boolean;
  inverted?: boolean;
  // Opaque marker prop: changing it re-renders the list so renderItem closures
  // that read external state stay fresh. We have no PureComponent cell to bust,
  // so this is consumed only as a render dependency (RN's extraData).
  extraData?: unknown;
  onEndReached?: (info: { distanceFromEnd: number }) => void;
  onEndReachedThreshold?: number;
  // Fired once when the scroll position gets within onStartReachedThreshold of the
  // start (the top edge), mirroring onEndReached for the bottom.
  onStartReached?: (info: { distanceFromStart: number }) => void;
  onStartReachedThreshold?: number;
  // Pull-to-refresh. When onRefresh is set, RN renders a RefreshControl into the
  // inner ScrollView's refreshControl prop; refreshing is the controlled spinner
  // state (defaulted to false when nullish), progressViewOffset nudges its rest.
  onRefresh?: () => void;
  refreshing?: boolean | null;
  progressViewOffset?: number;
  onViewableItemsChanged?: (info: IViewableItemsChangedInfo<ItemT>) => void;
  viewabilityConfig?: IViewabilityConfig;
  viewabilityConfigCallbackPairs?: IViewabilityConfigCallbackPair<ItemT>[];
  // Fired when scrollToIndex targets an unmeasured cell with no getItemLayout to place it
  // from (RN VirtualizedList.js:184-193): {index, highestMeasuredFrameIndex, averageItemLength}.
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
  // Data indices (into the item stream) that should stick to the top as they scroll off.
  // VirtualizedSectionList passes its section-header indices here; we forward the in-window
  // ones to the ScrollView, mapped to their child position.
  stickyHeaderIndices?: number[];
  // Keep the visually-anchored item in place when content is prepended (RN's
  // maintainVisibleContentPosition). RN both forwards this to native AND shifts scroll in JS;
  // we do both (the JS shift covers the off-window leading spacer native cannot see).
  maintainVisibleContentPosition?: {
    minIndexForVisible: number;
    autoscrollToTopThreshold?: number;
  };
  // Scroll-driven UI hook. RN's _onScroll runs its windowing bookkeeping AND then calls
  // this.props.onScroll(e): the user's handler COMPOSES with the internal one, never replaces
  // it. We destructure it out so it cannot arrive raw via ...accessibilityRest, then chain both.
  onScroll?: (event: ISymbioteEvent) => void;
  // Scroll-lifecycle callbacks forwarded to the inner ScrollView (RN VirtualizedList.js:1096-1099).
  onScrollBeginDrag?: (event: ISymbioteEvent) => void;
  onScrollEndDrag?: (event: ISymbioteEvent) => void;
  onMomentumScrollBegin?: (event: ISymbioteEvent) => void;
  onMomentumScrollEnd?: (event: ISymbioteEvent) => void;
  scrollEventThrottle?: number;
  keyboardShouldPersistTaps?: boolean | 'always' | 'never' | 'handled';
  keyboardDismissMode?: 'none' | 'on-drag' | 'interactive';
  style?: IStyleProp<IViewStyle>;
  contentContainerStyle?: IStyleProp<IViewStyle>;
  // Forwarded onto the inner ScrollView like `style` — resolves through the shared style
  // registry. contentContainerStyle stays JS-only (a plain style-object prop, not style/
  // className itself).
  className?: string;
}

function resolveElement(
  component: ComponentType<Record<string, never>> | ReactElement | undefined,
): ReactNode {
  if (component === undefined) return undefined;
  if (typeof component === 'function') return createElement(component, {});
  return component;
}

// Build the ItemSeparatorComponent element for the gap between leadingItem and trailingItem, with
// the highlight flag and any handle-pushed overrides merged on top (RN renders
// `<ItemSeparatorComponent {...separatorProps} />`). A bare element is returned as-is.
function renderSeparatorElement<ItemT>(
  component: ComponentType<ISeparatorProps<ItemT>> | undefined,
  leadingItem: ItemT,
  trailingItem: ItemT,
  overrides: Partial<ISeparatorProps<ItemT>> | undefined,
): ReactNode {
  if (component === undefined) return undefined;
  const props: ISeparatorProps<ItemT> = {
    highlighted: false,
    leadingItem,
    trailingItem,
    ...overrides,
  };
  return createElement(component, props);
}

// React 19 passes `ref` as a regular prop, so a generic function component can
// expose an imperative handle without forwardRef (which erases the ItemT
// generic). The ref is destructured here and wired through useImperativeHandle.
export function VirtualizedList<ItemT>(
  props: IVirtualizedListProps<ItemT> & { ref?: Ref<IVirtualizedListHandle> },
): ReactElement {
  const forwardedRef = props.ref;
  const {
    data,
    getItem,
    getItemCount,
    renderItem,
    keyExtractor,
    getItemLayout,
    ItemSeparatorComponent,
    ListHeaderComponent,
    ListFooterComponent,
    ListEmptyComponent,
    horizontal = false,
    inverted = false,
    extraData,
    onEndReached,
    onEndReachedThreshold = DEFAULT_END_REACHED_THRESHOLD,
    onStartReached,
    onStartReachedThreshold = DEFAULT_START_REACHED_THRESHOLD,
    onRefresh,
    refreshing,
    progressViewOffset,
    onViewableItemsChanged,
    viewabilityConfig,
    viewabilityConfigCallbackPairs,
    onScrollToIndexFailed,
    initialNumToRender = DEFAULT_INITIAL_NUM_TO_RENDER,
    initialScrollIndex,
    maxToRenderPerBatch = DEFAULT_MAX_TO_RENDER_PER_BATCH,
    updateCellsBatchingPeriod = DEFAULT_UPDATE_CELLS_BATCHING_PERIOD,
    windowSize = DEFAULT_WINDOW_SIZE,
    stickyHeaderIndices,
    maintainVisibleContentPosition,
    style,
    contentContainerStyle,
    // Pulled out of the rest so the user's onScroll does NOT arrive raw via
    // ...accessibilityRest and overwrite the internal windowing handler. Composed below.
    onScroll: userOnScroll,
    onScrollBeginDrag,
    onScrollEndDrag,
    onMomentumScrollBegin,
    onMomentumScrollEnd,
    scrollEventThrottle,
    keyboardShouldPersistTaps,
    keyboardDismissMode,
    // The accessibility surface rides down to the underlying ScrollView, which runs
    // resolveAccessibilityProps itself; ref is pulled separately above, re-listed here only
    // to keep it out of the forwarded rest.
    ref: _ref,
    ...accessibilityRest
  } = props;

  // The single-config and pairs forms both feed one viewability pass (RN supports either).
  const viewabilityPairs = useMemo(
    (): IViewabilityConfigCallbackPair<ItemT>[] =>
      buildViewabilityPairs(
        onViewableItemsChanged,
        viewabilityConfig,
        viewabilityConfigCallbackPairs,
      ),
    [onViewableItemsChanged, viewabilityConfig, viewabilityConfigCallbackPairs],
  );

  // The framework-agnostic reducer inputs (props + defaults). Rebuilt each render; the handlers read
  // it through inputsRef so they stay stable.
  const inputs: IListReducerInputs<ItemT> = {
    data,
    getItem,
    getItemCount,
    keyExtractor,
    getItemLayout,
    horizontal,
    windowSize,
    initialNumToRender,
    maxToRenderPerBatch,
    updateCellsBatchingPeriod,
    onEndReachedThreshold,
    onStartReachedThreshold,
    onEndReachedActive: onEndReached !== undefined,
    onStartReachedActive: onStartReached !== undefined,
    viewabilityPairs,
    maintainVisibleContentPosition,
    initialScrollIndex,
  };
  const inputsRef = useRef(inputs);
  inputsRef.current = inputs;

  // The effect executors read the latest callbacks off this ref (the reducer never sees them).
  const handlersRef = useRef({
    onEndReached,
    onStartReached,
    onScrollToIndexFailed,
    viewabilityPairs,
  });
  handlersRef.current = { onEndReached, onStartReached, onScrollToIndexFailed, viewabilityPairs };

  // The one folded state cell (RN's scattered refs collapsed into IListState). Lazily created once.
  const stateRef = useRef<IListState<ItemT> | null>(null);
  const state = (stateRef.current ??= createInitialListState<ItemT>());

  const [, forceRender] = useReducer((tick: number): number => tick + 1, 0);

  // The offset we are imperatively driving native to (scrollTo* before the handle attaches). Pushed
  // down as the ScrollView's contentOffset prop; fresh object identity each time. undefined = none.
  const [commandedOffset, setCommandedOffset] = useState<{ x: number; y: number } | undefined>(
    undefined,
  );
  const scrollViewRef = useRef<IScrollViewHandle>(null);
  // Pending minimumViewTime debounce timer / the incremental-fill timer (adapter owns the timers;
  // the reducer only asks for a delay).
  const viewableTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Per-gap separator overrides (keyed by the LEADING cell index of the gap) stay adapter-side: they
  // are render state read directly in the cell walk, not part of the windowing orchestration.
  const separatorOverridesRef = useRef<Map<number, Partial<ISeparatorProps<ItemT>>>>(new Map());
  const [, setSeparatorVersion] = useState(EMPTY_OFFSET);

  // Drive a native scroll (or, before the handle attaches, the contentOffset fallback).
  const scrollToPixel = useCallback((offset: number, animated: boolean): void => {
    const clamped = Math.max(EMPTY_OFFSET, offset);
    const isHorizontal = inputsRef.current.horizontal;
    const target = isHorizontal ? { x: clamped, y: EMPTY_OFFSET } : { x: EMPTY_OFFSET, y: clamped };
    if (scrollViewRef.current !== null) {
      dlog(
        `VirtualizedList scrollTo offset=${clamped} animated=${animated} (horizontal=${isHorizontal})`,
      );
      scrollViewRef.current.scrollTo({ x: target.x, y: target.y, animated });
      return;
    }
    dlog(`VirtualizedList scrollTo offset=${clamped} pending-ref (horizontal=${isHorizontal})`);
    setCommandedOffset(target);
  }, []);

  // dispatch and runEffects are mutually recursive (a schedule-refill / fire-viewable effect
  // dispatches a follow-up action), so runEffects reaches dispatch through a ref.
  const dispatchRef = useRef<(action: IListAction<ItemT>) => void>(() => {});

  const runEffects = useCallback(
    (effects: IListEffect<ItemT>[]): void => {
      const handlers = handlersRef.current;
      for (const effect of effects) {
        switch (effect.kind) {
          case 'scroll-to':
            scrollToPixel(effect.offset, effect.animated);
            break;
          case 'fire-end-reached':
            handlers.onEndReached?.({ distanceFromEnd: effect.distanceFromEnd });
            break;
          case 'fire-start-reached':
            handlers.onStartReached?.({ distanceFromStart: effect.distanceFromStart });
            break;
          case 'fire-scroll-to-index-failed':
            handlers.onScrollToIndexFailed?.({
              index: effect.index,
              highestMeasuredFrameIndex: effect.highestMeasuredFrameIndex,
              averageItemLength: effect.averageItemLength,
            });
            break;
          case 'schedule-refill': {
            if (batchTimerRef.current !== null) clearTimeout(batchTimerRef.current);
            batchTimerRef.current = setTimeout(() => {
              batchTimerRef.current = null;
              dispatchRef.current({ kind: 'batch-tick' });
            }, effect.delay);
            break;
          }
          case 'fire-viewable': {
            const pairs = handlers.viewabilityPairs;
            const info = effect.info;
            const map = effect.map;
            const fire = (): void => {
              for (const pair of pairs) pair.onViewableItemsChanged(info);
              dispatchRef.current({ kind: 'viewable-fired', map });
            };
            if (viewableTimerRef.current !== null) {
              clearTimeout(viewableTimerRef.current);
              viewableTimerRef.current = null;
            }
            if (effect.delay > EMPTY_OFFSET) {
              viewableTimerRef.current = setTimeout(() => {
                viewableTimerRef.current = null;
                fire();
              }, effect.delay);
            } else {
              fire();
            }
            break;
          }
        }
      }
    },
    [scrollToPixel],
  );

  const dispatch = useCallback(
    (action: IListAction<ItemT>): void => {
      const current = stateRef.current;
      if (current === null) return;
      const result = reduceList(current, action, inputsRef.current);
      runEffects(result.effects);
      if (result.changed) forceRender();
    },
    [runEffects],
  );
  dispatchRef.current = dispatch;

  // The single derive-per-render: recompute the window off the current state before reading it.
  reduceList(state, { kind: 'refresh-metrics' }, inputs);
  const m = state.metrics;
  const { count, offsets, lengths, total, first, last } = m;
  const commitSignature = listEffectSignature(state);

  dlog(
    `VirtualizedList window [${first}, ${last}] of ${count} ` +
      `(offset=${state.scrollOffset}, viewport=${state.viewportLength}, rendered=${Math.max(0, last - first + 1)})`,
  );

  const onScroll = useCallback(
    (event: ISymbioteEvent): void => {
      const offset = readScrollOffset(event, horizontal);
      if (offset === undefined) return;
      dlog(`VirtualizedList onScroll offset=${offset}`);
      // A real user/native scroll supersedes any pending commanded offset.
      setCommandedOffset(undefined);
      dispatch({ kind: 'scroll', offset });
      // Compose, don't clobber: internal windowing ran first, now the user's onScroll.
      if (userOnScroll !== undefined) userOnScroll(event);
    },
    [horizontal, userOnScroll, dispatch],
  );

  const onViewportLayout = useCallback(
    (event: ISymbioteEvent): void => {
      const length = readLayoutLength(event, horizontal);
      if (length === undefined) return;
      dlog(`VirtualizedList onLayout viewport=${length}`);
      dispatch({ kind: 'layout', length });
    },
    [horizontal, dispatch],
  );

  const makeCellMeasure = useCallback(
    (index: number) =>
      (event: ISymbioteEvent): void => {
        const length = readLayoutLength(event, horizontal);
        if (length === undefined) return;
        dlog(`VirtualizedList cell ${index} measured length=${length}`);
        dispatch({ kind: 'measure', index, length });
      },
    [horizontal, dispatch],
  );

  // Merge an override onto the separator at a given gap and request a re-render. A gap index
  // outside [0, count-2] has no separator, so the write is a no-op (RN bails the same way).
  const mergeSeparator = useCallback(
    (gapIndex: number, patch: Partial<ISeparatorProps<ItemT>>): void => {
      if (!isSeparatorGapInRange(gapIndex, count)) return;
      const overrides = separatorOverridesRef.current;
      overrides.set(gapIndex, { ...overrides.get(gapIndex), ...patch });
      setSeparatorVersion(version => version + 1);
    },
    [count],
  );

  // The ISeparators handle for the cell at `index` (RN CellRenderer._separators).
  const makeSeparators = useCallback(
    (index: number): ISeparators => ({
      highlight: (): void => {
        dlog(`VirtualizedList separator highlight cell=${index}`);
        mergeSeparator(index - 1, { highlighted: true });
        mergeSeparator(index, { highlighted: true });
      },
      unhighlight: (): void => {
        dlog(`VirtualizedList separator unhighlight cell=${index}`);
        mergeSeparator(index - 1, { highlighted: false });
        mergeSeparator(index, { highlighted: false });
      },
      updateProps: (select: 'leading' | 'trailing', newProps: Record<string, unknown>): void => {
        mergeSeparator(select === 'leading' ? index - 1 : index, newProps);
      },
    }),
    [mergeSeparator],
  );

  const keyForIndex = useCallback(
    (index: number): string => resolveItemKey(getItem(data, index), index, keyExtractor),
    [getItem, data, keyExtractor],
  );

  useImperativeHandle(
    forwardedRef ?? null,
    () => ({
      // RN animates every imperative scroll unless the caller passes animated: false. Each resolves
      // to an offset (or a scroll-to-index failure) inside the reducer, then rides scroll-to.
      scrollToOffset: (params: { offset: number; animated?: boolean }): void => {
        dispatch({
          kind: 'scroll-to-offset',
          offset: params.offset,
          animated: params.animated ?? true,
        });
      },
      scrollToIndex: (params: {
        index: number;
        animated?: boolean;
        viewOffset?: number;
        viewPosition?: number;
      }): void => {
        dispatch({
          kind: 'scroll-to-index',
          index: params.index,
          animated: params.animated ?? true,
          viewPosition: params.viewPosition ?? FIRST_INDEX,
          viewOffset: params.viewOffset ?? EMPTY_OFFSET,
        });
      },
      scrollToItem: (params: {
        item: unknown;
        animated?: boolean;
        viewPosition?: number;
      }): void => {
        dispatch({
          kind: 'scroll-to-item',
          item: params.item,
          animated: params.animated ?? true,
          viewPosition: params.viewPosition ?? FIRST_INDEX,
        });
      },
      scrollToEnd: (params?: { animated?: boolean }): void => {
        dispatch({ kind: 'scroll-to-end', animated: params?.animated ?? true });
      },
      flashScrollIndicators: (): void => {
        scrollViewRef.current?.flashScrollIndicators?.();
      },
      getNativeScrollRef: (): IScrollViewHandle | null => scrollViewRef.current,
      getScrollableNode: (): IScrollViewHandle | null => scrollViewRef.current,
      getScrollResponder: (): IScrollViewHandle | null => scrollViewRef.current,
      getScrollNode: (): ISymbioteNode | null => scrollViewRef.current?.getScrollNode() ?? null,
      // Manual trigger for RN's recordInteraction: flip the interaction flag so
      // waitForInteraction viewability configs start reporting.
      recordInteraction: (): void => {
        dispatch({ kind: 'record-interaction' });
      },
    }),
    [dispatch],
  );

  // After-commit pass: run the deferred effects (batch fill, edge-reached, viewability,
  // initial-scroll, MVCP) in a LAYOUT effect so MVCP's shift lands before paint. Re-runs only when
  // the windowing signature changed — the same dedup key every adapter shares.
  useLayoutEffect(() => {
    const current = stateRef.current;
    if (current === null) return;
    const result = reduceList(current, { kind: 'commit' }, inputsRef.current);
    runEffects(result.effects);
  }, [commitSignature, runEffects]);

  // Clear any pending timers on unmount (RN ViewabilityHelper.dispose + the fill timer).
  useEffect(() => {
    return () => {
      if (viewableTimerRef.current !== null) clearTimeout(viewableTimerRef.current);
      if (batchTimerRef.current !== null) clearTimeout(batchTimerRef.current);
    };
  }, []);

  // ---- assemble the windowed child list ----------------------------------

  // extraData needs no wiring: this component is not memoized, so any prop change (including
  // extraData) already re-renders and re-runs renderItem. Voided to mark the deliberate no-op.
  void extraData;

  const children: ReactNode[] = [];
  const stickySet = stickyHeaderIndices !== undefined ? new Set(stickyHeaderIndices) : undefined;
  let renderedStickyIndices: number[] = [];

  const header = resolveElement(ListHeaderComponent);
  if (header !== undefined) {
    children.push(createElement('symbiote-view', { key: 'list-header' }, header));
  }

  if (count === FIRST_INDEX) {
    const empty = resolveElement(ListEmptyComponent);
    if (empty !== undefined) {
      children.push(createElement('symbiote-view', { key: 'list-empty' }, empty));
    }
  } else {
    // The shared plan: spacer extents, in-window cell keys, and the sticky child positions.
    const plan = buildListPlan({
      count,
      first,
      last,
      offsets,
      lengths,
      total,
      keyFor: keyForIndex,
      stickyIndices: stickySet,
      hasHeader: header !== undefined,
      hasSeparators: ItemSeparatorComponent !== undefined,
    });
    renderedStickyIndices = plan.stickyChildPositions;

    if (plan.leadingExtent > EMPTY_OFFSET) {
      children.push(
        createElement('symbiote-view', {
          key: 'spacer-leading',
          style: horizontal ? { width: plan.leadingExtent } : { height: plan.leadingExtent },
        }),
      );
    }

    for (const planCell of plan.cells) {
      const item = getItem(data, planCell.index);
      // renderItem gets a separators handle so a row can highlight/update its own dividers.
      const cell = renderItem({
        item,
        index: planCell.index,
        separators: makeSeparators(planCell.index),
      });
      // Wrap each cell in a measuring View. When inverted, each cell carries the counter-flip so
      // its content reads upright inside the flipped content container.
      children.push(
        createElement(
          'symbiote-view',
          {
            key: `cell-${planCell.key}`,
            onLayout: makeCellMeasure(planCell.index),
            style: inverted ? (horizontal ? INVERTED_X_STYLE : INVERTED_Y_STYLE) : undefined,
          },
          cell,
        ),
      );
      const separator =
        planCell.index < last
          ? renderSeparatorElement(
              ItemSeparatorComponent,
              item,
              getItem(data, planCell.index + 1),
              separatorOverridesRef.current.get(planCell.index),
            )
          : undefined;
      if (separator !== undefined) {
        children.push(createElement('symbiote-view', { key: `sep-${planCell.key}` }, separator));
      }
    }

    if (plan.trailingExtent > EMPTY_OFFSET) {
      children.push(
        createElement('symbiote-view', {
          key: 'spacer-trailing',
          style: horizontal ? { width: plan.trailingExtent } : { height: plan.trailingExtent },
        }),
      );
    }
  }

  const footer = resolveElement(ListFooterComponent);
  if (footer !== undefined) {
    children.push(createElement('symbiote-view', { key: 'list-footer' }, footer));
  }

  // A horizontal list pins the content container to the full row width so the row overflows for
  // iOS to scroll. The inversion flip rides ONLY the outer ScrollView style and each cell, never
  // the content container (flipping it too would cancel the ScrollView flip).
  const resolvedContentContainerStyle: IStyleProp<IViewStyle> = horizontal
    ? [contentContainerStyle, { width: total }]
    : contentContainerStyle;
  const resolvedStyle: IStyleProp<IViewStyle> | undefined = inverted
    ? [style, horizontal ? INVERTED_X_STYLE : INVERTED_Y_STYLE]
    : style;

  const scrollProps: IScrollViewProps & { onLayout: (event: ISymbioteEvent) => void } = {
    // The list's accessibility surface rides down onto the ScrollView. Spread first so the
    // explicit windowing props below always win.
    ...accessibilityRest,
    style: resolvedStyle,
    contentContainerStyle: resolvedContentContainerStyle,
    horizontal,
    onScroll,
    onLayout: onViewportLayout,
  };
  if (onScrollBeginDrag !== undefined) scrollProps.onScrollBeginDrag = onScrollBeginDrag;
  if (onScrollEndDrag !== undefined) scrollProps.onScrollEndDrag = onScrollEndDrag;
  if (onMomentumScrollBegin !== undefined)
    scrollProps.onMomentumScrollBegin = onMomentumScrollBegin;
  if (onMomentumScrollEnd !== undefined) scrollProps.onMomentumScrollEnd = onMomentumScrollEnd;
  if (scrollEventThrottle !== undefined) scrollProps.scrollEventThrottle = scrollEventThrottle;
  if (keyboardShouldPersistTaps !== undefined)
    scrollProps.keyboardShouldPersistTaps = keyboardShouldPersistTaps;
  if (keyboardDismissMode !== undefined) scrollProps.keyboardDismissMode = keyboardDismissMode;
  // A pending imperative/initial scroll rides down as contentOffset (fresh identity each push).
  if (commandedOffset !== undefined) scrollProps.contentOffset = commandedOffset;
  // Headers in the window stick; an empty list leaves the prop off entirely.
  if (renderedStickyIndices.length > 0) scrollProps.stickyHeaderIndices = renderedStickyIndices;
  // Forward maintainVisibleContentPosition to the native ScrollView so it anchors in-window cells.
  // minIndexForVisible is bumped by 1 when a ListHeaderComponent occupies child 0.
  if (maintainVisibleContentPosition !== undefined) {
    scrollProps.maintainVisibleContentPosition = {
      ...maintainVisibleContentPosition,
      minIndexForVisible:
        maintainVisibleContentPosition.minIndexForVisible + (header !== undefined ? 1 : 0),
    };
  }

  // Pull-to-refresh: when onRefresh is set, build a RefreshControl for the ScrollView's
  // refreshControl prop. refreshing is RN-required alongside onRefresh, default false when nullish.
  if (onRefresh !== undefined) {
    dlog('VirtualizedList wiring RefreshControl (onRefresh provided)');
    scrollProps.refreshControl = createElement(RefreshControl, {
      refreshing: refreshing ?? false,
      onRefresh,
      progressViewOffset,
    });
  }

  // The ScrollView handle (ref) backs animated imperative scrolls via its native command.
  return createElement(ScrollView, { ...scrollProps, ref: scrollViewRef }, ...children);
}
