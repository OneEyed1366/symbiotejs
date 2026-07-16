// VirtualizedList orchestration reducer: the framework-agnostic STATE MACHINE that folds every
// per-adapter effect skeleton into one place. Before this, each adapter (React useEffect, Vue
// watch, Angular ngAfterViewChecked) re-wrote the same sequence — recompute the window, gate
// onEndReached on `last === count - 1`, dedup by content length, run viewability, apply MVCP — in
// its own reactive dialect, and the predicates in that glue (`last === count - 1`, `first === 0`,
// the batch-fill catch-up test, the viewability guards) lived THREE times and quietly drifted.
//
// Here the whole decision half is one pure `reduceList(state, action, inputs) -> {state, effects}`.
// The adapter keeps only what is genuinely framework-bound: translate a native event into an
// ACTION, hold ONE state cell, and EXECUTE the returned EFFECTS with its own primitives (a native
// scrollTo, a callback/emit, a setTimeout, a re-render). The geometry leaves (buildOffsets /
// computeWindow / computeMvcpAdjustment / …) still live in ./virtualized-list; this module composes
// them into the ordered transition every adapter shares.
//
// Effect EXECUTION stays per-adapter by design: which framework hook fires the commit, how a
// native scrollTo is dispatched, how a debounce timer is held — an effect-list DESCRIBES the work,
// it does not run it. State TRANSITIONS (including the derived window metrics) are owned entirely
// here, so a windowing / edge / viewability / MVCP bug — and the drift between three copies of it —
// is fixed once for all adapters.

import { dlog } from '@symbiote-native/engine';
import {
  EMPTY_OFFSET,
  FIRST_INDEX,
  NO_CONTENT_LENGTH_SENT,
  NO_INDEX,
  buildOffsets,
  computeEndReached,
  computeMvcpAdjustment,
  computeStartReached,
  computeViewableSet,
  computeWindow,
  decideEdgeReached,
  diffViewable,
  highestMeasuredIndex,
  indexOfItem,
  maxMinimumViewTime,
  offsetForEnd,
  offsetForIndex,
  resolveAverageLength,
  resolveItemKey,
  throttleWindow,
  wrapFixedLayout,
  type ICellLayout,
  type IViewToken,
  type IViewabilityConfigCallbackPair,
  type IViewableItemsChangedInfo,
} from './virtualized-list';

// The derived window snapshot, recomputed on every render-relevant transition and read straight by
// the adapter's render (buildListPlan + the cell walk). `fixedLayout` is the wrapped getItemLayout
// (undefined when the list measures cells itself); the adapter re-uses it for its own cell metrics.
export interface IListMetrics {
  count: number;
  offsets: number[];
  lengths: number[];
  total: number;
  first: number;
  last: number;
  target: { first: number; last: number };
  averageLength: number;
  fixedLayout: ((index: number) => ICellLayout) | undefined;
}

// The folded list state — everything that was scattered across each adapter's refs/fields. Maps are
// mutated in place (they were ref-backed, never render state); `metrics` is the derived cache the
// render reads. The adapter holds ONE reference to this and re-reads it after each reduceList call.
export interface IListState<ItemT> {
  scrollOffset: number;
  viewportLength: number;
  measured: Map<number, number>;
  committedWindow: { first: number; last: number };
  sentEndForContentLength: number;
  sentStartForContentLength: number;
  lastViewable: Map<string, IViewToken<ItemT>>;
  hasInteracted: boolean;
  firstVisibleKey: string | null;
  appliedInitialScroll: boolean;
  metrics: IListMetrics;
}

// The config the reducer reads each call (it comes off the adapter's props, so it is passed in
// rather than stored). The edge/viewability CALLBACKS never reach the reducer — it only needs to
// know whether a listener is ACTIVE (so it can decide to emit) and the viewability PAIRS (for the
// classification + minimumViewTime); the adapter fires the actual callbacks from the effect.
export interface IListReducerInputs<ItemT> {
  data: unknown;
  getItem: (data: unknown, index: number) => ItemT;
  getItemCount: (data: unknown) => number;
  keyExtractor?: (item: ItemT, index: number) => string;
  getItemLayout?: (
    data: unknown,
    index: number,
  ) => { length: number; offset: number; index: number };
  horizontal: boolean;
  windowSize: number;
  initialNumToRender: number;
  maxToRenderPerBatch: number;
  updateCellsBatchingPeriod: number;
  onEndReachedThreshold: number;
  onStartReachedThreshold: number;
  onEndReachedActive: boolean;
  onStartReachedActive: boolean;
  viewabilityPairs: IViewabilityConfigCallbackPair<ItemT>[];
  maintainVisibleContentPosition?: {
    minIndexForVisible: number;
    autoscrollToTopThreshold?: number;
  };
  initialScrollIndex?: number;
}

// The events the adapter turns native callbacks / imperative calls into. `commit` is the
// after-render pass (produces the deferred effects); `viewable-fired` folds a completed
// minimumViewTime debounce back into lastViewable; `batch-tick` is the refill timer firing.
export type IListAction<ItemT> =
  | { kind: 'scroll'; offset: number }
  | { kind: 'layout'; length: number }
  | { kind: 'measure'; index: number; length: number }
  | { kind: 'refresh-metrics' }
  | { kind: 'batch-tick' }
  | { kind: 'record-interaction' }
  | { kind: 'viewable-fired'; map: Map<string, IViewToken<ItemT>> }
  | { kind: 'commit' }
  | { kind: 'scroll-to-offset'; offset: number; animated: boolean }
  | {
      kind: 'scroll-to-index';
      index: number;
      animated: boolean;
      viewPosition: number;
      viewOffset: number;
    }
  | { kind: 'scroll-to-item'; item: unknown; animated: boolean; viewPosition: number }
  | { kind: 'scroll-to-end'; animated: boolean };

// The work the adapter executes with its own primitives. `scroll-to` rides the native scrollTo (or
// the pre-mount contentOffset fallback); `fire-*` invoke callbacks/emits; `fire-viewable` carries
// the debounce `delay` and the `map` to fold back on completion; `schedule-refill` sets the batch
// timer; `fire-scroll-to-index-failed` reports an unmeasured scroll target.
export type IListEffect<ItemT> =
  | { kind: 'scroll-to'; offset: number; animated: boolean }
  | { kind: 'fire-end-reached'; distanceFromEnd: number }
  | { kind: 'fire-start-reached'; distanceFromStart: number }
  | {
      kind: 'fire-viewable';
      info: IViewableItemsChangedInfo<ItemT>;
      delay: number;
      map: Map<string, IViewToken<ItemT>>;
    }
  | { kind: 'schedule-refill'; delay: number }
  | {
      kind: 'fire-scroll-to-index-failed';
      index: number;
      highestMeasuredFrameIndex: number;
      averageItemLength: number;
    };

export interface IListReduceResult<ItemT> {
  state: IListState<ItemT>;
  effects: IListEffect<ItemT>[];
  // Whether render-relevant state (the window metrics) changed, so the adapter knows to re-render. A
  // measure that repeats a known length, or a pure bookkeeping action, returns false.
  changed: boolean;
}

export function createInitialListState<ItemT>(): IListState<ItemT> {
  return {
    scrollOffset: EMPTY_OFFSET,
    viewportLength: EMPTY_OFFSET,
    measured: new Map<number, number>(),
    committedWindow: { first: FIRST_INDEX, last: NO_INDEX },
    sentEndForContentLength: NO_CONTENT_LENGTH_SENT,
    sentStartForContentLength: NO_CONTENT_LENGTH_SENT,
    lastViewable: new Map<string, IViewToken<ItemT>>(),
    hasInteracted: false,
    firstVisibleKey: null,
    appliedInitialScroll: false,
    metrics: {
      count: EMPTY_OFFSET,
      offsets: [],
      lengths: [],
      total: EMPTY_OFFSET,
      first: FIRST_INDEX,
      last: NO_INDEX,
      target: { first: FIRST_INDEX, last: NO_INDEX },
      averageLength: EMPTY_OFFSET,
      fixedLayout: undefined,
    },
  };
}

// A cheap signature over the render-relevant state. The adapter skips the after-commit pass when it
// is unchanged (the same dedup Angular's lastEffectSignature did), so the batch-fill timer is not
// thrashed by unrelated re-renders. Shared so the key CANNOT drift between adapters.
export function listEffectSignature<ItemT>(state: IListState<ItemT>): string {
  const m = state.metrics;
  return `${state.scrollOffset}|${state.viewportLength}|${m.first}|${m.last}|${m.count}|${m.total}`;
}

// Recompute the derived window metrics off the current state + inputs. Owns the controlled
// committedWindow throttle (the side effect React ran during render): committedWindow is plain
// state, so growing it toward target one batch-step at a time triggers no reactivity loop.
function deriveMetrics<ItemT>(
  state: IListState<ItemT>,
  inputs: IListReducerInputs<ItemT>,
): IListState<ItemT> {
  const count = inputs.getItemCount(inputs.data);
  const fixedLayout = wrapFixedLayout(inputs.data, inputs.getItemLayout);
  const averageLength = resolveAverageLength(fixedLayout, count, state.measured);
  const { offsets, lengths, total } = buildOffsets(
    count,
    state.measured,
    fixedLayout,
    averageLength,
  );
  const target = computeWindow(
    count,
    offsets,
    lengths,
    state.scrollOffset,
    state.viewportLength,
    inputs.windowSize,
    inputs.initialNumToRender,
  );
  const throttled = throttleWindow(target, state.committedWindow, inputs.maxToRenderPerBatch);
  state.committedWindow = throttled;
  state.metrics = {
    count,
    offsets,
    lengths,
    total,
    first: throttled.first,
    last: throttled.last,
    target,
    averageLength,
    fixedLayout,
  };
  return state;
}

function keyForOf<ItemT>(inputs: IListReducerInputs<ItemT>): (index: number) => string {
  return (index: number): string =>
    resolveItemKey(inputs.getItem(inputs.data, index), index, inputs.keyExtractor);
}

// The after-render pass: every deferred effect, in the order 2 of 3 adapters already ran them
// (batch-fill -> end -> start -> viewability -> initial-scroll -> MVCP). Each is guarded by its own
// dedup state (sent*ForContentLength, lastViewable, appliedInitialScroll, firstVisibleKey), so
// running commit on every render is safe — the guards prevent a redundant fire.
function commitList<ItemT>(
  state: IListState<ItemT>,
  inputs: IListReducerInputs<ItemT>,
): IListReduceResult<ItemT> {
  const effects: IListEffect<ItemT>[] = [];
  const m = state.metrics;

  // Batch fill: when the throttled window has not reached the target, ask for another render tick so
  // it keeps filling toward target (RN's incremental fill).
  if (!(m.first <= m.target.first && m.last >= m.target.last)) {
    effects.push({ kind: 'schedule-refill', delay: inputs.updateCellsBatchingPeriod });
  }

  // onEndReached: fire only when the actual last cell is rendered AND within threshold; dedup by
  // content length; re-arm on scroll away from the end (RN _maybeCallOnEdgeReached).
  if (inputs.onEndReachedActive && state.viewportLength > EMPTY_OFFSET) {
    const { distanceFromEnd, withinThreshold } = computeEndReached(
      m.total,
      state.scrollOffset,
      state.viewportLength,
      inputs.onEndReachedThreshold,
    );
    const decision = decideEdgeReached({
      withinThreshold,
      edgeCellRendered: m.last === m.count - 1,
      total: m.total,
      sentForContentLength: state.sentEndForContentLength,
    });
    state.sentEndForContentLength = decision.nextSentForContentLength;
    if (decision.shouldFire) {
      dlog(
        `VirtualizedList onEndReached distanceFromEnd=${distanceFromEnd} ` +
          `(last=${m.last} of ${m.count}, contentLength=${m.total})`,
      );
      effects.push({ kind: 'fire-end-reached', distanceFromEnd });
    }
  }

  // onStartReached: the top-edge twin of onEndReached.
  if (inputs.onStartReachedActive && state.viewportLength > EMPTY_OFFSET) {
    const { distanceFromStart, withinThreshold } = computeStartReached(
      state.scrollOffset,
      state.viewportLength,
      inputs.onStartReachedThreshold,
    );
    const decision = decideEdgeReached({
      withinThreshold,
      edgeCellRendered: m.first === FIRST_INDEX,
      total: m.total,
      sentForContentLength: state.sentStartForContentLength,
    });
    state.sentStartForContentLength = decision.nextSentForContentLength;
    if (decision.shouldFire) {
      dlog(
        `VirtualizedList onStartReached distanceFromStart=${distanceFromStart} ` +
          `(first=${m.first}, contentLength=${m.total})`,
      );
      effects.push({ kind: 'fire-start-reached', distanceFromStart });
    }
  }

  // Viewability: reclassify the rendered cells; if the viewable set changed, hand the adapter an
  // info payload to fire (after minimumViewTime, if any). lastViewable is folded back only when the
  // fire actually lands (the 'viewable-fired' action), so a debounce that is superseded mid-flight
  // still diffs against the last COMMITTED set.
  if (
    inputs.viewabilityPairs.length > EMPTY_OFFSET &&
    state.viewportLength > EMPTY_OFFSET &&
    m.count !== FIRST_INDEX
  ) {
    const { tokens, map } = computeViewableSet<ItemT>({
      first: m.first,
      last: m.last,
      count: m.count,
      offsets: m.offsets,
      lengths: m.lengths,
      scrollOffset: state.scrollOffset,
      viewportLength: state.viewportLength,
      data: inputs.data,
      getItem: inputs.getItem,
      keyExtractor: inputs.keyExtractor,
      pairs: inputs.viewabilityPairs,
      hasInteracted: state.hasInteracted,
    });
    const diff = diffViewable(state.lastViewable, map, tokens);
    if (diff.hasChanged) {
      dlog(
        `VirtualizedList viewable=${tokens.length} changed=${diff.changed.length} ` +
          `(window [${m.first}, ${m.last}])`,
      );
      effects.push({
        kind: 'fire-viewable',
        info: { viewableItems: tokens, changed: diff.changed },
        delay: maxMinimumViewTime(inputs.viewabilityPairs),
        map,
      });
    }
  }

  // initialScrollIndex: once the first viewport is known, jump to that index a single time.
  if (
    inputs.initialScrollIndex !== undefined &&
    !state.appliedInitialScroll &&
    state.viewportLength > EMPTY_OFFSET &&
    m.count !== FIRST_INDEX
  ) {
    state.appliedInitialScroll = true;
    const offset = offsetForIndex(
      inputs.initialScrollIndex,
      FIRST_INDEX,
      EMPTY_OFFSET,
      m.count,
      m.offsets,
      m.lengths,
      state.viewportLength,
    );
    // The initial jump is instant (RN does not animate initialScrollIndex).
    effects.push({ kind: 'scroll-to', offset, animated: false });
  }

  // maintainVisibleContentPosition: shift for the prepended items collapsed into the leading spacer
  // that native MVCP cannot see (RN getDerivedStateFromProps). computeMvcpAdjustment owns the pure
  // decision; here it becomes a scroll-to effect.
  const mvcp = computeMvcpAdjustment({
    minIndexForVisible: inputs.maintainVisibleContentPosition?.minIndexForVisible,
    autoscrollToTopThreshold: inputs.maintainVisibleContentPosition?.autoscrollToTopThreshold,
    count: m.count,
    committedFirst: state.committedWindow.first,
    offsets: m.offsets,
    scrollOffset: state.scrollOffset,
    prevFirstVisibleKey: state.firstVisibleKey,
    keyFor: keyForOf(inputs),
  });
  if (mvcp.action.kind === 'autoscroll-top') {
    effects.push({ kind: 'scroll-to', offset: EMPTY_OFFSET, animated: true });
  } else if (mvcp.action.kind === 'shift') {
    effects.push({ kind: 'scroll-to', offset: mvcp.action.offset, animated: false });
  }
  state.firstVisibleKey = mvcp.firstVisibleKey;

  return { state, effects, changed: false };
}

// Resolve an imperative scrollToIndex: report the failure when there is no getItemLayout and the
// target is past the last measured cell (RN VirtualizedList.js), else scroll to the resolved offset.
function resolveScrollToIndex<ItemT>(
  state: IListState<ItemT>,
  inputs: IListReducerInputs<ItemT>,
  action: { index: number; animated: boolean; viewPosition: number; viewOffset: number },
): IListReduceResult<ItemT> {
  const m = state.metrics;
  const measuredCeiling = highestMeasuredIndex(state.measured);
  if (inputs.getItemLayout === undefined && action.index > measuredCeiling) {
    dlog(
      `VirtualizedList onScrollToIndexFailed index=${action.index} ` +
        `highestMeasured=${measuredCeiling} (no getItemLayout)`,
    );
    return {
      state,
      effects: [
        {
          kind: 'fire-scroll-to-index-failed',
          index: action.index,
          highestMeasuredFrameIndex: measuredCeiling,
          averageItemLength: m.averageLength,
        },
      ],
      changed: false,
    };
  }
  const offset = offsetForIndex(
    action.index,
    action.viewPosition,
    action.viewOffset,
    m.count,
    m.offsets,
    m.lengths,
    state.viewportLength,
  );
  return {
    state,
    effects: [{ kind: 'scroll-to', offset, animated: action.animated }],
    changed: false,
  };
}

// The single transition every adapter shares. The adapter maps a native event / imperative call to
// an action, calls this, stores the returned state, and executes the returned effects.
export function reduceList<ItemT>(
  state: IListState<ItemT>,
  action: IListAction<ItemT>,
  inputs: IListReducerInputs<ItemT>,
): IListReduceResult<ItemT> {
  switch (action.kind) {
    // Scalar transitions never recompute the window — they set the input and ask for a render; the
    // metrics derive runs exactly ONCE per render, in the 'refresh-metrics' the adapter fires from
    // its render body. That single-derive-per-render invariant is what advances the throttled
    // committedWindow one step per frame (deriving here too would advance it twice).
    case 'scroll':
      // First scroll is the interaction that ungates waitForInteraction viewability configs.
      state.hasInteracted = true;
      state.scrollOffset = action.offset;
      return { state, effects: [], changed: true };
    case 'layout':
      state.viewportLength = action.length;
      return { state, effects: [], changed: true };
    case 'measure':
      // A fixed getItemLayout owns cell sizes, so a measured length is ignored; a repeat of a known
      // length changes nothing. Both guards keep an idle onLayout from forcing a render.
      if (inputs.getItemLayout !== undefined) return { state, effects: [], changed: false };
      if (state.measured.get(action.index) === action.length) {
        return { state, effects: [], changed: false };
      }
      state.measured.set(action.index, action.length);
      return { state, effects: [], changed: true };
    case 'batch-tick':
      // The refill timer fired: ask for a render, whose refresh-metrics grows the window one step.
      return { state, effects: [], changed: true };
    case 'refresh-metrics':
      return { state: deriveMetrics(state, inputs), effects: [], changed: true };
    case 'record-interaction':
      state.hasInteracted = true;
      return { state, effects: [], changed: false };
    case 'viewable-fired':
      state.lastViewable = action.map;
      return { state, effects: [], changed: false };
    case 'commit':
      return commitList(state, inputs);
    case 'scroll-to-offset':
      return {
        state,
        effects: [{ kind: 'scroll-to', offset: action.offset, animated: action.animated }],
        changed: false,
      };
    case 'scroll-to-index':
      return resolveScrollToIndex(state, inputs, action);
    case 'scroll-to-item': {
      const index = indexOfItem(inputs.data, inputs.getItem, state.metrics.count, action.item);
      if (index === NO_INDEX) {
        dlog('VirtualizedList scrollToItem: item not found');
        return { state, effects: [], changed: false };
      }
      const offset = offsetForIndex(
        index,
        action.viewPosition,
        EMPTY_OFFSET,
        state.metrics.count,
        state.metrics.offsets,
        state.metrics.lengths,
        state.viewportLength,
      );
      return {
        state,
        effects: [{ kind: 'scroll-to', offset, animated: action.animated }],
        changed: false,
      };
    }
    case 'scroll-to-end':
      return {
        state,
        effects: [
          {
            kind: 'scroll-to',
            offset: offsetForEnd(state.metrics.total, state.viewportLength),
            animated: action.animated,
          },
        ],
        changed: false,
      };
  }
}
