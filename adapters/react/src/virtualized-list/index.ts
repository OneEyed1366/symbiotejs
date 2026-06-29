// VirtualizedList: real windowing over the existing ScrollView. Only the cells
// whose computed offset falls inside the visible window (plus a leading/trailing
// buffer) are rendered; everything above and below is collapsed into two spacer
// Views whose sizes sum to the off-screen extent, so the scroll thumb and total
// content size stay correct without mounting all N rows.
//
// The windowing engine (offset table, window compute, batch throttle, viewability,
// edge-reached, the child PLAN, the imperative-handle surface) lives in
// @symbiote/components/state, shared verbatim with the Vue adapter — a windowing or
// viewability bug is fixed once for all adapters (<adapters_reach_full_feature_parity>).
// React supplies only its lifecycle (state/refs/effects), the imperative-handle wiring,
// and the per-cell element creation (createElement). Lists have no Descriptor render fn
// (the cell content is React's own children); see core/components/.docs-note-lists.md.
//
// Imperative scrolling (scrollToIndex / scrollToOffset / scrollToItem / scrollToEnd)
// resolves to an offset and rides the ScrollView's native scrollTo command via its handle
// ref, animated by default. The `contentOffset` prop is only a fallback for the pre-mount
// window (handle not yet attached).

import {
  createElement,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { dlog, type ISymbioteEvent, type ISymbioteNode } from '@symbiote/engine';
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
  highestMeasuredIndex as findHighestMeasuredIndex,
  maxMinimumViewTime,
  offsetForIndex as resolveOffsetForIndex,
  readLayoutLength,
  readScrollOffset,
  throttleWindow,
  type ICellLayout,
  type ISeparators,
  type ISeparatorProps,
  type IViewToken,
  type IViewableItemsChangedInfo,
  type IViewabilityConfig,
  type IViewabilityConfigCallbackPair,
  type IVirtualizedListHandle,
} from '@symbiote/components';
import { ScrollView, type IScrollViewHandle, type IScrollViewProps } from '../scroll-view';
import { RefreshControl } from '../refresh-control';
import type { IAccessibilityProps, IAriaProps } from '@symbiote/components';
import type { IStyleProp, IViewStyle } from '../styles';

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

  const count = getItemCount(data);

  const [scrollOffset, setScrollOffset] = useState(EMPTY_OFFSET);
  const [viewportLength, setViewportLength] = useState(EMPTY_OFFSET);
  // The offset we are imperatively driving native to (scrollTo*). Pushed down as the
  // ScrollView's contentOffset prop; fresh object identity each time. undefined = none pending.
  const [commandedOffset, setCommandedOffset] = useState<{ x: number; y: number } | undefined>(
    undefined,
  );
  const scrollViewRef = useRef<IScrollViewHandle>(null);
  // Measured cell lengths by index. A ref-backed Map mutated in place plus a version counter to
  // request a re-render only when a NEW measurement lands.
  const measuredRef = useRef<Map<number, number>>(new Map());
  const [, setMeasureVersion] = useState(EMPTY_OFFSET);
  // The content length we last fired onEndReached / onStartReached for (RN's
  // _sentEndForContentLength / _sentStartForContentLength): dedup by content length, re-armed
  // on scroll away from the edge.
  const sentEndForContentLengthRef = useRef<number>(NO_CONTENT_LENGTH_SENT);
  const sentStartForContentLengthRef = useRef<number>(NO_CONTENT_LENGTH_SENT);
  // The previously committed window, so throttleWindow can grow it by at most
  // maxToRenderPerBatch per batch tick instead of snapping.
  const committedWindowRef = useRef<{ first: number; last: number }>({
    first: FIRST_INDEX,
    last: -1,
  });
  // The tokens reported viewable on the last onViewableItemsChanged, keyed by cell key.
  const lastViewableRef = useRef<Map<string, IViewToken<ItemT>>>(new Map());
  // Pending minimumViewTime debounce timer (RN ViewabilityHelper._timers). null = no timer.
  const viewableTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Flips true on the first scroll (RN's ViewabilityHelper._hasInteracted).
  const hasInteractedRef = useRef(false);
  // Per-gap separator overrides, keyed by the LEADING cell index of the gap.
  const separatorOverridesRef = useRef<Map<number, Partial<ISeparatorProps<ItemT>>>>(new Map());
  const [, setSeparatorVersion] = useState(EMPTY_OFFSET);
  // initialScrollIndex is applied once, after the first layout gives a viewport.
  const appliedInitialScrollRef = useRef(false);
  // maintainVisibleContentPosition anchor tracking (RN's State.firstVisibleItemKey).
  const firstVisibleKeyRef = useRef<string | null>(null);

  const fixedLayout = useMemo(() => {
    if (getItemLayout === undefined) return undefined;
    return (index: number): ICellLayout => {
      const layout = getItemLayout(data, index);
      return { length: layout.length, offset: layout.offset };
    };
  }, [getItemLayout, data]);

  // Running average of known cell lengths, used to size not-yet-measured cells and the trailing
  // spacer so the total is plausible before full measurement.
  const averageLength = useMemo(() => {
    if (fixedLayout) return fixedLayout(FIRST_INDEX).length;
    return averageMeasuredLength(measuredRef.current);
  }, [fixedLayout, scrollOffset, viewportLength]);

  const { offsets, lengths, total } = buildOffsets(
    count,
    measuredRef.current,
    fixedLayout,
    averageLength,
  );

  const targetWindow = computeWindow(
    count,
    offsets,
    lengths,
    scrollOffset,
    viewportLength,
    windowSize,
    initialNumToRender,
  );
  const { first, last } = throttleWindow(
    targetWindow,
    committedWindowRef.current,
    maxToRenderPerBatch,
  );
  committedWindowRef.current = { first, last };

  dlog(
    `VirtualizedList window [${first}, ${last}] of ${count} ` +
      `(offset=${scrollOffset}, viewport=${viewportLength}, rendered=${Math.max(0, last - first + 1)})`,
  );

  // When the throttled window has not yet reached the target, schedule another render after the
  // batching period so the window keeps filling toward target.
  useEffect(() => {
    if (first <= targetWindow.first && last >= targetWindow.last) return;
    const timer = setTimeout(() => {
      setMeasureVersion(version => version + 1);
    }, updateCellsBatchingPeriod);
    return () => clearTimeout(timer);
  }, [first, last, targetWindow.first, targetWindow.last, updateCellsBatchingPeriod]);

  const onScroll = useCallback(
    (event: ISymbioteEvent): void => {
      const offset = readScrollOffset(event, horizontal);
      if (offset === undefined) return;
      dlog(`VirtualizedList onScroll offset=${offset}`);
      // First scroll is the interaction that ungates waitForInteraction configs.
      hasInteractedRef.current = true;
      setScrollOffset(offset);
      // A real user/native scroll supersedes any pending commanded offset.
      setCommandedOffset(undefined);
      // Compose, don't clobber: internal windowing ran first, now the user's onScroll.
      if (userOnScroll !== undefined) userOnScroll(event);
    },
    [horizontal, userOnScroll],
  );

  // onEndReached gating (RN _maybeCallOnEdgeReached). Run against the COMMITTED window. Fire only
  // when the last cell is rendered AND within threshold; dedup by content length; re-arm on
  // scroll away from the end.
  useEffect(() => {
    if (onEndReached === undefined || viewportLength <= EMPTY_OFFSET) return;
    const { distanceFromEnd, withinThreshold } = computeEndReached(
      total,
      scrollOffset,
      viewportLength,
      onEndReachedThreshold,
    );
    const lastCellRendered = last === count - 1;
    if (withinThreshold && lastCellRendered && sentEndForContentLengthRef.current !== total) {
      sentEndForContentLengthRef.current = total;
      dlog(
        `VirtualizedList onEndReached distanceFromEnd=${distanceFromEnd} ` +
          `(last=${last} of ${count}, contentLength=${total})`,
      );
      onEndReached({ distanceFromEnd });
    }
    if (!withinThreshold) {
      sentEndForContentLengthRef.current = NO_CONTENT_LENGTH_SENT;
    }
  }, [onEndReached, onEndReachedThreshold, viewportLength, scrollOffset, total, last, count]);

  // onStartReached gating: the top-edge twin of the onEndReached effect.
  useEffect(() => {
    if (onStartReached === undefined || viewportLength <= EMPTY_OFFSET) return;
    const { distanceFromStart, withinThreshold } = computeStartReached(
      scrollOffset,
      viewportLength,
      onStartReachedThreshold,
    );
    const firstCellRendered = first === FIRST_INDEX;
    if (withinThreshold && firstCellRendered && sentStartForContentLengthRef.current !== total) {
      sentStartForContentLengthRef.current = total;
      dlog(
        `VirtualizedList onStartReached distanceFromStart=${distanceFromStart} ` +
          `(first=${first}, contentLength=${total})`,
      );
      onStartReached({ distanceFromStart });
    }
    if (!withinThreshold) {
      sentStartForContentLengthRef.current = NO_CONTENT_LENGTH_SENT;
    }
  }, [onStartReached, onStartReachedThreshold, viewportLength, scrollOffset, total, first]);

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

  // Viewability detection: after each scroll/window change, recompute which rendered cells clear
  // the threshold and, if the viewable set changed, fire onViewableItemsChanged + every pair.
  useEffect(() => {
    if (viewabilityPairs.length === EMPTY_OFFSET || viewportLength <= EMPTY_OFFSET) return;
    if (count === FIRST_INDEX) return;

    const { tokens, map } = computeViewableSet<ItemT>({
      first,
      last,
      count,
      offsets,
      lengths,
      scrollOffset,
      viewportLength,
      data,
      getItem,
      keyExtractor,
      pairs: viewabilityPairs,
      hasInteracted: hasInteractedRef.current,
    });
    const diff = diffViewable(lastViewableRef.current, map, tokens);
    if (!diff.hasChanged) return;

    const commitAndFire = (): void => {
      lastViewableRef.current = map;
      dlog(
        `VirtualizedList viewable=${tokens.length} changed=${diff.changed.length} ` +
          `(window [${first}, ${last}])`,
      );
      const info: IViewableItemsChangedInfo<ItemT> = {
        viewableItems: tokens,
        changed: diff.changed,
      };
      for (const pair of viewabilityPairs) pair.onViewableItemsChanged(info);
    };

    const minimumViewTime = maxMinimumViewTime(viewabilityPairs);
    if (viewableTimerRef.current !== null) {
      clearTimeout(viewableTimerRef.current);
      viewableTimerRef.current = null;
    }
    if (minimumViewTime > EMPTY_OFFSET) {
      dlog(
        `VirtualizedList viewability debounce ${minimumViewTime}ms (window [${first}, ${last}])`,
      );
      viewableTimerRef.current = setTimeout(() => {
        viewableTimerRef.current = null;
        commitAndFire();
      }, minimumViewTime);
      return;
    }
    commitAndFire();
  }, [
    viewabilityPairs,
    viewportLength,
    scrollOffset,
    first,
    last,
    count,
    data,
    getItem,
    keyExtractor,
    offsets,
    lengths,
  ]);

  // Clear any pending minimumViewTime debounce on unmount (RN ViewabilityHelper.dispose).
  useEffect(() => {
    return () => {
      if (viewableTimerRef.current !== null) clearTimeout(viewableTimerRef.current);
    };
  }, []);

  const onViewportLayout = useCallback(
    (event: ISymbioteEvent): void => {
      const length = readLayoutLength(event, horizontal);
      if (length === undefined) return;
      dlog(`VirtualizedList onLayout viewport=${length}`);
      setViewportLength(length);
    },
    [horizontal],
  );

  const makeCellMeasure = useCallback(
    (index: number) =>
      (event: ISymbioteEvent): void => {
        if (fixedLayout) return;
        const length = readLayoutLength(event, horizontal);
        if (length === undefined) return;
        const measured = measuredRef.current;
        if (measured.get(index) === length) return;
        measured.set(index, length);
        dlog(`VirtualizedList cell ${index} measured length=${length}`);
        setMeasureVersion(version => version + 1);
      },
    [fixedLayout, horizontal],
  );

  // Merge an override onto the separator at a given gap and request a re-render. A gap index
  // outside [0, count-2] has no separator, so the write is a no-op (RN bails the same way).
  const mergeSeparator = useCallback(
    (gapIndex: number, patch: Partial<ISeparatorProps<ItemT>>): void => {
      if (gapIndex < FIRST_INDEX || gapIndex > count - 2) return;
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

  // Resolve an index to a pixel offset (RN's scrollToIndex options), via the shared math.
  const offsetForIndex = useCallback(
    (index: number, viewPosition: number, viewOffset: number): number =>
      resolveOffsetForIndex(
        index,
        viewPosition,
        viewOffset,
        count,
        offsets,
        lengths,
        viewportLength,
      ),
    [count, offsets, lengths, viewportLength],
  );

  const scrollToPixel = useCallback(
    (offset: number, animated: boolean): void => {
      const clamped = Math.max(EMPTY_OFFSET, offset);
      const target = horizontal ? { x: clamped, y: EMPTY_OFFSET } : { x: EMPTY_OFFSET, y: clamped };
      // Both animated and instant scrolls ride the ScrollView's native scrollTo command, exactly
      // like RN. The contentOffset prop path stays as a fallback for the pre-mount window.
      if (scrollViewRef.current !== null) {
        dlog(
          `VirtualizedList scrollTo offset=${clamped} animated=${animated} (horizontal=${horizontal})`,
        );
        scrollViewRef.current.scrollTo({ x: target.x, y: target.y, animated });
        return;
      }
      dlog(`VirtualizedList scrollTo offset=${clamped} pending-ref (horizontal=${horizontal})`);
      setCommandedOffset(target);
    },
    [horizontal],
  );

  // The largest index whose length we have actually measured (RN
  // ListMetricsAggregator.getHighestMeasuredCellIndex). With getItemLayout this is irrelevant.
  const highestMeasuredIndex = useCallback(
    (): number => findHighestMeasuredIndex(measuredRef.current),
    [],
  );

  useImperativeHandle(
    forwardedRef ?? null,
    () => ({
      // RN animates every imperative scroll unless the caller passes animated: false.
      scrollToOffset: (params: { offset: number; animated?: boolean }): void => {
        scrollToPixel(params.offset, params.animated ?? true);
      },
      scrollToIndex: (params: {
        index: number;
        animated?: boolean;
        viewOffset?: number;
        viewPosition?: number;
      }): void => {
        // No getItemLayout AND the target is past the last measured cell: report the failure
        // instead of scrolling to a fabricated estimate (RN VirtualizedList.js:179-195).
        if (fixedLayout === undefined && params.index > highestMeasuredIndex()) {
          dlog(
            `VirtualizedList onScrollToIndexFailed index=${params.index} ` +
              `highestMeasured=${highestMeasuredIndex()} (no getItemLayout)`,
          );
          onScrollToIndexFailed?.({
            index: params.index,
            highestMeasuredFrameIndex: highestMeasuredIndex(),
            averageItemLength: averageLength,
          });
          return;
        }
        scrollToPixel(
          offsetForIndex(
            params.index,
            params.viewPosition ?? FIRST_INDEX,
            params.viewOffset ?? EMPTY_OFFSET,
          ),
          params.animated ?? true,
        );
      },
      scrollToItem: (params: {
        item: unknown;
        animated?: boolean;
        viewPosition?: number;
      }): void => {
        for (let index = FIRST_INDEX; index < count; index += 1) {
          if (getItem(data, index) === params.item) {
            scrollToPixel(
              offsetForIndex(index, params.viewPosition ?? FIRST_INDEX, EMPTY_OFFSET),
              params.animated ?? true,
            );
            return;
          }
        }
        dlog('VirtualizedList scrollToItem: item not found');
      },
      scrollToEnd: (params?: { animated?: boolean }): void => {
        scrollToPixel(Math.max(EMPTY_OFFSET, total - viewportLength), params?.animated ?? true);
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
        hasInteractedRef.current = true;
      },
    }),
    [
      scrollToPixel,
      offsetForIndex,
      count,
      data,
      getItem,
      total,
      viewportLength,
      fixedLayout,
      highestMeasuredIndex,
      onScrollToIndexFailed,
      averageLength,
    ],
  );

  // initialScrollIndex: once the first viewport is known, jump to that index a single time.
  useEffect(() => {
    if (initialScrollIndex === undefined || appliedInitialScrollRef.current) return;
    if (viewportLength <= EMPTY_OFFSET || count === FIRST_INDEX) return;
    appliedInitialScrollRef.current = true;
    // The initial jump is instant (RN doesn't animate initialScrollIndex).
    scrollToPixel(offsetForIndex(initialScrollIndex, FIRST_INDEX, EMPTY_OFFSET), false);
  }, [initialScrollIndex, viewportLength, count, scrollToPixel, offsetForIndex]);

  const keyForIndex = useCallback(
    (index: number): string => {
      const item = getItem(data, index);
      return keyExtractor ? keyExtractor(item, index) : String(index);
    },
    [getItem, data, keyExtractor],
  );

  // maintainVisibleContentPosition JS anchor adjustment (RN getDerivedStateFromProps:715-768): the
  // native MVCP cannot see prepended items above the window (they are collapsed into the leading
  // SPACER), so we replicate the JS shift for exactly those. Runs in a layout effect so the
  // correction lands before paint.
  useLayoutEffect(() => {
    if (maintainVisibleContentPosition === undefined || count === FIRST_INDEX) {
      firstVisibleKeyRef.current = null;
      return;
    }
    const minIndexForVisible = maintainVisibleContentPosition.minIndexForVisible;
    const newFirstVisibleKey = count > minIndexForVisible ? keyForIndex(minIndexForVisible) : null;
    const prevKey = firstVisibleKeyRef.current;

    if (prevKey !== null && newFirstVisibleKey !== null && prevKey !== newFirstVisibleKey) {
      let anchorIndex = -1;
      for (let index = minIndexForVisible; index < count; index += 1) {
        if (keyForIndex(index) === prevKey) {
          anchorIndex = index;
          break;
        }
      }
      if (anchorIndex > minIndexForVisible) {
        // Native MVCP shifts in-window cells itself; the JS shift covers ONLY the inserted items
        // in the leading SPACER (above the first rendered index). Counting the full inserted extent
        // here would double-correct.
        const spacerEnd = Math.min(anchorIndex, committedWindowRef.current.first);
        const insertedExtent =
          spacerEnd > minIndexForVisible
            ? offsets[spacerEnd] - offsets[minIndexForVisible]
            : EMPTY_OFFSET;
        if (insertedExtent > EMPTY_OFFSET) {
          const autoThreshold = maintainVisibleContentPosition.autoscrollToTopThreshold;
          const anchoredNearTop = autoThreshold !== undefined && scrollOffset <= autoThreshold;
          if (anchoredNearTop) {
            dlog(
              `VirtualizedList MVCP autoscroll-to-top (offset=${scrollOffset} <= ${autoThreshold})`,
            );
            scrollToPixel(EMPTY_OFFSET, true);
          } else {
            dlog(
              `VirtualizedList MVCP adjust +${insertedExtent}px ` +
                `(anchor "${prevKey}" moved ${minIndexForVisible}->${anchorIndex})`,
            );
            scrollToPixel(scrollOffset + insertedExtent, false);
          }
        }
      }
    }
    firstVisibleKeyRef.current = newFirstVisibleKey;
  }, [maintainVisibleContentPosition, count, keyForIndex, offsets, scrollOffset, scrollToPixel]);

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
