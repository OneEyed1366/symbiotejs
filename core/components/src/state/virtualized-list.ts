// VirtualizedList logic: the framework-agnostic windowing engine. Every adapter
// (React hooks, Vue reactivity) drives the SAME math from here, so a windowing /
// viewability / edge-reached bug is fixed once for all adapters. The adapter
// supplies only its lifecycle (refs/state/effects), the imperative handle
// wiring, and the per-cell element creation (createElement / h) - never the
// geometry.
//
// What lives here:
//   - the RN-matching defaults + sentinels,
//   - the nativeEvent payload readers (scroll offset / layout length),
//   - offset table + window computation + batch throttling,
//   - viewability classification, the viewable-set diff, and the minimumViewTime fold,
//   - the edge-reached (onEndReached / onStartReached) distance + threshold compute,
//   - the assembled child PLAN (spacer extents, in-window cell keys, sticky child
//     positions) the adapter maps onto its host elements,
//   - the shared data + imperative-handle types.
//
// What stays in the adapter (genuinely framework-bound): the cell CONTENT is the
// framework's own children (renderItem -> ReactNode / VNode), so there is no
// Descriptor render fn for a list - the shared layer for lists is this STATE/logic
// module, not a view/render-*.ts.

import { dlog } from '@symbiote-native/engine';
import type { IViewStyle } from '@symbiote-native/engine';
import type { ISymbioteEvent } from '@symbiote-native/engine';
import type { IScrollRoutingHandle } from './scroll-routing-handle';

// Defaults match RN. windowSize is measured in viewport-lengths (21 => ten screens
// of buffer on each side of the visible region). onEndReachedThreshold is a multiple
// of the visible length (RN's onEndReachedThresholdOrDefault returns `?? 2`).
// initialNumToRender bounds the first paint before any layout is measured.
// maxToRenderPerBatch / batching period mirror RN's incremental fill defaults.
export const DEFAULT_WINDOW_SIZE = 21;
export const DEFAULT_INITIAL_NUM_TO_RENDER = 10;
export const DEFAULT_END_REACHED_THRESHOLD = 2;
export const DEFAULT_MAX_TO_RENDER_PER_BATCH = 10;
export const DEFAULT_UPDATE_CELLS_BATCHING_PERIOD = 50;
export const DEFAULT_VIEW_AREA_COVERAGE_PERCENT_THRESHOLD = 0;
// onStartReachedThreshold default, mirroring RN's onStartReachedThresholdOrDefault.
export const DEFAULT_START_REACHED_THRESHOLD = 2;
export const FIRST_INDEX = 0;
export const EMPTY_OFFSET = 0;
export const NO_INDEX = -1;
export const FULLY_VISIBLE_PERCENT = 100;
// RN floors sub-pixel end distances to 0 so a debounced scroll that stops a fraction
// of a pixel from the bottom still counts as "reached the end" (RN VirtualizedList.js).
export const ON_EDGE_REACHED_EPSILON = 0.001;
// Sentinel for "onEndReached / onStartReached has not fired for any content length
// yet". Real content lengths are >= 0, so -1 can never collide with one.
export const NO_CONTENT_LENGTH_SENT = -1;
// Inversion flips the content container along the scroll axis; each cell re-flips so
// its own content stays upright (RN does the same with a scale(-1) transform).
export const INVERTED_Y_STYLE: IViewStyle = { transform: [{ scaleY: -1 }] };
export const INVERTED_X_STYLE: IViewStyle = { transform: [{ scaleX: -1 }] };

export interface ICellLayout {
  length: number;
  offset: number;
}

// The props RN hands ItemSeparatorComponent (VirtualizedListCellRenderer.js plus the
// section fields VirtualizedSectionList layers on): the highlight flag the cell can
// toggle, the items on either side of the gap, and (for section lists) the section the
// separator sits in. `section` stays optional because a flat VirtualizedList has none.
export interface ISeparatorProps<ItemT> {
  highlighted: boolean;
  leadingItem?: ItemT;
  trailingItem?: ItemT;
  section?: unknown;
  [key: string]: unknown;
}

// The imperative separator handle passed to renderItem (RN CellRenderer._separators).
// highlight/unhighlight flip the highlighted flag on the separators flanking this cell;
// updateProps merges arbitrary props onto the leading (previous gap) or trailing
// (this gap) separator so a row can drive its own dividers.
export interface ISeparators {
  highlight(): void;
  unhighlight(): void;
  updateProps(select: 'leading' | 'trailing', newProps: Record<string, unknown>): void;
}

// A viewable item, as reported to onViewableItemsChanged. Mirrors RN's IViewToken
// (item + key + index + isViewable), minus the section field VirtualizedSectionList adds.
export interface IViewToken<ItemT> {
  item: ItemT;
  key: string;
  index: number;
  isViewable: boolean;
}

export interface IViewableItemsChangedInfo<ItemT> {
  viewableItems: IViewToken<ItemT>[];
  changed: IViewToken<ItemT>[];
}

// Viewability tuning, mirroring RN's IViewabilityConfig. Either a coverage percentage
// OR a minimum visible pixel height qualifies a cell as viewable;
// itemVisiblePercentThreshold is the common one. waitForInteraction gates a config so
// nothing is reported viewable until the first scroll interaction has happened.
export interface IViewabilityConfig {
  minimumViewTime?: number;
  viewAreaCoveragePercentThreshold?: number;
  itemVisiblePercentThreshold?: number;
  waitForInteraction?: boolean;
}

export interface IViewabilityConfigCallbackPair<ItemT> {
  viewabilityConfig: IViewabilityConfig;
  onViewableItemsChanged: (info: IViewableItemsChangedInfo<ItemT>) => void;
}

// The imperative API RN exposes on a VirtualizedList/FlatList ref. Every scroll
// resolves to an offset. The scrollTo* family is this handle's own primary surface; the
// flash/get*/record tail is the inner-scroll routing shared with VirtualizedSectionList
// (see IScrollRoutingHandle) - extending it, rather than re-declaring it, is what keeps
// the two handle types from drifting from each other.
export interface IVirtualizedListHandle extends IScrollRoutingHandle {
  scrollToOffset(params: { offset: number; animated?: boolean }): void;
  scrollToIndex(params: {
    index: number;
    animated?: boolean;
    viewOffset?: number;
    viewPosition?: number;
  }): void;
  scrollToItem(params: { item: unknown; animated?: boolean; viewPosition?: number }): void;
  scrollToEnd(params?: { animated?: boolean }): void;
}

// nativeEvent payload guards. The payloads arrive as `unknown` off the wire, so they
// are narrowed with runtime checks rather than cast.
function readNumber(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key];
  return typeof value === 'number' ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? { ...value } : undefined;
}

// onScroll -> the offset along the scroll axis. Vertical reads contentOffset.y,
// horizontal reads contentOffset.x.
export function readScrollOffset(event: ISymbioteEvent, horizontal: boolean): number | undefined {
  const native = asRecord(event.nativeEvent);
  if (native === undefined) return undefined;
  const offset = asRecord(native.contentOffset);
  if (offset === undefined) return undefined;
  return readNumber(offset, horizontal ? 'x' : 'y');
}

// onLayout -> the cross-section length of the box along the scroll axis.
export function readLayoutLength(event: ISymbioteEvent, horizontal: boolean): number | undefined {
  const native = asRecord(event.nativeEvent);
  if (native === undefined) return undefined;
  const layout = asRecord(native.layout);
  if (layout === undefined) return undefined;
  return readNumber(layout, horizontal ? 'width' : 'height');
}

// Resolve every cell offset/length from the cache (or getItemLayout), filling gaps with
// the running average so an unmeasured tail still has a plausible total. Returns the
// per-index offset table plus the grand total extent.
export function buildOffsets(
  count: number,
  measured: Map<number, number>,
  fixedLayout: ((index: number) => ICellLayout) | undefined,
  averageLength: number,
): { offsets: number[]; lengths: number[]; total: number } {
  const offsets: number[] = new Array<number>(count);
  const lengths: number[] = new Array<number>(count);
  let running = EMPTY_OFFSET;
  for (let index = FIRST_INDEX; index < count; index += 1) {
    offsets[index] = running;
    let length: number;
    if (fixedLayout !== undefined) {
      length = fixedLayout(index).length;
    } else {
      length = measured.get(index) ?? averageLength;
    }
    lengths[index] = length;
    running += length;
  }
  return { offsets, lengths, total: running };
}

// Pick the resident window: every index whose box overlaps
// [offset - buffer, offset + viewport + buffer]. The buffer is (windowSize - 1) / 2
// viewport-lengths on each side, matching RN's symmetric leading/trailing overscan.
export function computeWindow(
  count: number,
  offsets: number[],
  lengths: number[],
  scrollOffset: number,
  viewportLength: number,
  windowSize: number,
  initialNumToRender: number,
): { first: number; last: number } {
  if (count === FIRST_INDEX) return { first: FIRST_INDEX, last: NO_INDEX };

  // Before the viewport is known, paint a bounded prefix.
  if (viewportLength <= EMPTY_OFFSET) {
    return { first: FIRST_INDEX, last: Math.min(count, initialNumToRender) - 1 };
  }

  const overscan = ((windowSize - 1) / 2) * viewportLength;
  const windowTop = scrollOffset - overscan;
  const windowBottom = scrollOffset + viewportLength + overscan;

  let first = FIRST_INDEX;
  while (first < count - 1 && offsets[first] + lengths[first] <= windowTop) {
    first += 1;
  }
  let last = first;
  while (last < count - 1 && offsets[last] + lengths[last] < windowBottom) {
    last += 1;
  }
  return { first, last };
}

// Clamp a freshly computed window against the previously-committed one so at most
// maxToRenderPerBatch new cells are added on each side per tick (RN's incremental fill).
// The window grows toward the target over successive batch ticks rather than snapping in
// one render: cheaper first paint on a big jump.
export function throttleWindow(
  target: { first: number; last: number },
  previous: { first: number; last: number },
  maxToRenderPerBatch: number,
): { first: number; last: number } {
  if (previous.last < previous.first) return target;
  const first = Math.max(target.first, previous.first - maxToRenderPerBatch);
  const last = Math.min(target.last, previous.last + maxToRenderPerBatch);
  // Never present an empty window when the target is non-empty.
  if (last < first) return target;
  return { first, last };
}

// Fraction (0..100) of a cell's box that lies inside the viewport.
export function visiblePercent(
  cellOffset: number,
  cellLength: number,
  scrollOffset: number,
  viewportLength: number,
): number {
  if (cellLength <= EMPTY_OFFSET) return EMPTY_OFFSET;
  const top = Math.max(cellOffset, scrollOffset);
  const bottom = Math.min(cellOffset + cellLength, scrollOffset + viewportLength);
  const visible = Math.max(EMPTY_OFFSET, bottom - top);
  return (visible / cellLength) * FULLY_VISIBLE_PERCENT;
}

// A cell is viewable when its visible fraction clears the configured threshold.
// itemVisiblePercentThreshold compares against the cell's own size;
// viewAreaCoveragePercentThreshold compares against the viewport. The former wins when
// set, else the latter, matching RN's precedence.
export function isCellViewable(percent: number, config: IViewabilityConfig): boolean {
  const itemThreshold = config.itemVisiblePercentThreshold;
  if (itemThreshold !== undefined) return percent >= itemThreshold;
  const areaThreshold =
    config.viewAreaCoveragePercentThreshold ?? DEFAULT_VIEW_AREA_COVERAGE_PERCENT_THRESHOLD;
  return percent > areaThreshold || percent >= FULLY_VISIBLE_PERCENT;
}

// Resolve an index to a pixel offset, optionally biasing where in the viewport the item
// lands (viewPosition 0=top, 1=bottom, 0.5=center) and an absolute viewOffset nudge,
// mirroring RN's scrollToIndex options.
export function offsetForIndex(
  index: number,
  viewPosition: number,
  viewOffset: number,
  count: number,
  offsets: number[],
  lengths: number[],
  viewportLength: number,
): number {
  const clamped = Math.max(FIRST_INDEX, Math.min(index, count - 1));
  const cellOffset = offsets[clamped] ?? EMPTY_OFFSET;
  const cellLength = lengths[clamped] ?? EMPTY_OFFSET;
  const positioned = cellOffset - viewPosition * (viewportLength - cellLength);
  return Math.max(EMPTY_OFFSET, positioned - viewOffset);
}

// Running average of known cell lengths, used to size not-yet-measured cells and the
// trailing spacer so the total is plausible before full measurement.
export function averageMeasuredLength(measured: Map<number, number>): number {
  if (measured.size === EMPTY_OFFSET) return EMPTY_OFFSET;
  let sum = EMPTY_OFFSET;
  for (const length of measured.values()) sum += length;
  return sum / measured.size;
}

// The largest index whose length has actually been measured (RN
// ListMetricsAggregator.getHighestMeasuredCellIndex). NO_INDEX when nothing is measured.
export function highestMeasuredIndex(measured: Map<number, number>): number {
  let highest = NO_INDEX;
  for (const index of measured.keys()) {
    if (index > highest) highest = index;
  }
  return highest;
}

// onEndReached distance + threshold test (RN _maybeCallOnEdgeReached). The adapter still
// gates on "the last cell is actually rendered" and dedups by content length via its own
// ref; this returns only the pure geometry.
export function computeEndReached(
  total: number,
  scrollOffset: number,
  viewportLength: number,
  thresholdMultiplier: number,
): { distanceFromEnd: number; withinThreshold: boolean } {
  let distanceFromEnd = total - (scrollOffset + viewportLength);
  if (distanceFromEnd < ON_EDGE_REACHED_EPSILON) distanceFromEnd = EMPTY_OFFSET;
  const threshold = thresholdMultiplier * viewportLength;
  return { distanceFromEnd, withinThreshold: distanceFromEnd <= threshold };
}

// onStartReached twin of computeEndReached. distanceFromStart is just the scroll offset.
export function computeStartReached(
  scrollOffset: number,
  viewportLength: number,
  thresholdMultiplier: number,
): { distanceFromStart: number; withinThreshold: boolean } {
  let distanceFromStart = scrollOffset;
  if (distanceFromStart < ON_EDGE_REACHED_EPSILON) distanceFromStart = EMPTY_OFFSET;
  const threshold = thresholdMultiplier * viewportLength;
  return { distanceFromStart, withinThreshold: distanceFromStart <= threshold };
}

// Fold the single-config and pairs forms into one list (RN supports either, not both).
export function buildViewabilityPairs<ItemT>(
  onViewableItemsChanged: ((info: IViewableItemsChangedInfo<ItemT>) => void) | undefined,
  viewabilityConfig: IViewabilityConfig | undefined,
  pairs: IViewabilityConfigCallbackPair<ItemT>[] | undefined,
): IViewabilityConfigCallbackPair<ItemT>[] {
  const result: IViewabilityConfigCallbackPair<ItemT>[] = [];
  if (onViewableItemsChanged !== undefined) {
    result.push({ viewabilityConfig: viewabilityConfig ?? {}, onViewableItemsChanged });
  }
  if (pairs !== undefined) result.push(...pairs);
  return result;
}

export interface IViewableSetParams<ItemT> {
  first: number;
  last: number;
  count: number;
  offsets: number[];
  lengths: number[];
  scrollOffset: number;
  viewportLength: number;
  data: unknown;
  getItem: (data: unknown, index: number) => ItemT;
  keyExtractor?: (item: ItemT, index: number) => string;
  pairs: IViewabilityConfigCallbackPair<ItemT>[];
  hasInteracted: boolean;
}

// Classify every rendered cell against the viewability configs. A cell counts as
// viewable if ANY config says so (RN's broadest classification); a config with
// waitForInteraction classifies nothing until the first scroll has happened.
export function computeViewableSet<ItemT>(params: IViewableSetParams<ItemT>): {
  tokens: IViewToken<ItemT>[];
  map: Map<string, IViewToken<ItemT>>;
} {
  const tokens: IViewToken<ItemT>[] = [];
  const map = new Map<string, IViewToken<ItemT>>();
  for (let index = params.first; index <= params.last && index < params.count; index += 1) {
    const percent = visiblePercent(
      params.offsets[index],
      params.lengths[index],
      params.scrollOffset,
      params.viewportLength,
    );
    const item = params.getItem(params.data, index);
    const key = params.keyExtractor ? params.keyExtractor(item, index) : String(index);
    let anyViewable = false;
    for (const pair of params.pairs) {
      if (pair.viewabilityConfig.waitForInteraction === true && !params.hasInteracted) {
        continue;
      }
      if (isCellViewable(percent, pair.viewabilityConfig)) {
        anyViewable = true;
        break;
      }
    }
    if (anyViewable) {
      const token: IViewToken<ItemT> = { item, key, index, isViewable: true };
      map.set(key, token);
      tokens.push(token);
    }
  }
  return { tokens, map };
}

// The `changed` delta between two viewable sets: newly viewable (true) and newly hidden
// (false). hasChanged is false when the viewable KEY set is identical, so the adapter can
// skip firing (RN dedups the same way). Hidden tokens come straight from the previous map,
// so no rescan of all N items.
export function diffViewable<ItemT>(
  previous: Map<string, IViewToken<ItemT>>,
  current: Map<string, IViewToken<ItemT>>,
  currentTokens: IViewToken<ItemT>[],
): { changed: IViewToken<ItemT>[]; hasChanged: boolean } {
  let hasChanged = previous.size !== current.size;
  if (!hasChanged) {
    for (const key of current.keys()) {
      if (!previous.has(key)) {
        hasChanged = true;
        break;
      }
    }
  }
  if (!hasChanged) return { changed: [], hasChanged: false };
  const changed: IViewToken<ItemT>[] = [];
  for (const token of currentTokens) {
    if (!previous.has(token.key)) changed.push(token);
  }
  for (const [key, token] of previous) {
    if (!current.has(key)) changed.push({ ...token, isViewable: false });
  }
  return { changed, hasChanged: true };
}

// The largest configured minimumViewTime across all pairs (RN gates the unified pass on
// the largest value, since we fold all pairs into one classification).
export function maxMinimumViewTime<ItemT>(pairs: IViewabilityConfigCallbackPair<ItemT>[]): number {
  let max = EMPTY_OFFSET;
  for (const pair of pairs) {
    const configured = pair.viewabilityConfig.minimumViewTime;
    if (configured !== undefined && configured > max) max = configured;
  }
  return max;
}

export interface IListCellPlan {
  index: number;
  key: string;
}

export interface IListPlan {
  leadingExtent: number;
  trailingExtent: number;
  cells: IListCellPlan[];
  // Child positions (in the final emitted child array) of the sticky headers that landed
  // in the window. Accounts for the list header, leading spacer, and the per-gap
  // separators, so the adapter forwards these straight to the ScrollView.
  stickyChildPositions: number[];
}

export interface IListPlanParams {
  count: number;
  first: number;
  last: number;
  offsets: number[];
  lengths: number[];
  total: number;
  keyFor: (index: number) => string;
  stickyIndices?: ReadonlySet<number>;
  hasHeader: boolean;
  hasSeparators: boolean;
}

// Compute the windowed child PLAN: the two spacer extents, the in-window cells (index +
// key), and the sticky child positions. The adapter walks this plan and creates the host
// elements (createElement / h) plus the framework cell content. This is the shared half of
// the render; only the element creation and the user's renderItem stay per-adapter.
export function buildListPlan(params: IListPlanParams): IListPlan {
  const cells: IListCellPlan[] = [];
  const leadingExtent = params.first > FIRST_INDEX ? params.offsets[params.first] : EMPTY_OFFSET;
  const renderedExtent =
    params.last >= params.first
      ? params.offsets[params.last] + params.lengths[params.last] - params.offsets[params.first]
      : EMPTY_OFFSET;
  const trailingExtent = params.total - leadingExtent - renderedExtent;

  const stickyChildPositions: number[] = [];
  // The header (when present) is child 0; the leading spacer (when non-empty) is the next
  // child. Each cell is one child; a separator after it (when ItemSeparatorComponent is set
  // and this is not the last cell) is another.
  let childPosition = (params.hasHeader ? 1 : 0) + (leadingExtent > EMPTY_OFFSET ? 1 : 0);
  for (let index = params.first; index <= params.last; index += 1) {
    cells.push({ index, key: params.keyFor(index) });
    if (params.stickyIndices?.has(index) === true) stickyChildPositions.push(childPosition);
    childPosition += 1;
    if (params.hasSeparators && index < params.last) childPosition += 1;
  }
  return { leadingExtent, trailingExtent, cells, stickyChildPositions };
}

// maintainVisibleContentPosition JS anchor adjustment (RN getDerivedStateFromProps): native MVCP
// cannot see prepended items collapsed into the leading SPACER above the window, so JS replicates
// the shift for exactly those. This is the pure DECISION: track the key at minIndexForVisible; when
// a prepend moves it down, return the inserted extent to add to scrollOffset (or an autoscroll-to-top
// when the anchor sits within autoscrollToTopThreshold). The adapter owns the timing (layout effect /
// post-flush watch) and the imperative scroll — this returns only WHAT to do, framework-agnostic.
export type IMvcpAction =
  { kind: 'none' } | { kind: 'autoscroll-top' } | { kind: 'shift'; offset: number };

export interface IMvcpAdjustmentParams {
  // undefined when maintainVisibleContentPosition is off; the adapter unwraps the prop.
  minIndexForVisible: number | undefined;
  autoscrollToTopThreshold: number | undefined;
  count: number;
  committedFirst: number;
  offsets: number[];
  scrollOffset: number;
  prevFirstVisibleKey: string | null;
  keyFor: (index: number) => string;
}

export interface IMvcpAdjustmentResult {
  // the new firstVisibleKey the adapter stores back after acting.
  firstVisibleKey: string | null;
  action: IMvcpAction;
}

export function computeMvcpAdjustment(params: IMvcpAdjustmentParams): IMvcpAdjustmentResult {
  const { minIndexForVisible, count, keyFor } = params;
  if (minIndexForVisible === undefined || count === FIRST_INDEX) {
    return { firstVisibleKey: null, action: { kind: 'none' } };
  }
  const newFirstVisibleKey = count > minIndexForVisible ? keyFor(minIndexForVisible) : null;
  const prevKey = params.prevFirstVisibleKey;
  const settled: IMvcpAdjustmentResult = {
    firstVisibleKey: newFirstVisibleKey,
    action: { kind: 'none' },
  };

  if (prevKey === null || newFirstVisibleKey === null || prevKey === newFirstVisibleKey) {
    return settled;
  }

  let anchorIndex = NO_INDEX;
  for (let index = minIndexForVisible; index < count; index += 1) {
    if (keyFor(index) === prevKey) {
      anchorIndex = index;
      break;
    }
  }
  if (anchorIndex <= minIndexForVisible) return settled;

  // Native MVCP shifts in-window cells itself; the JS shift covers ONLY the inserted items in the
  // leading SPACER (above the first rendered index). Counting the full inserted extent would
  // double-correct.
  const spacerEnd = Math.min(anchorIndex, params.committedFirst);
  const insertedExtent =
    spacerEnd > minIndexForVisible
      ? params.offsets[spacerEnd] - params.offsets[minIndexForVisible]
      : EMPTY_OFFSET;
  if (insertedExtent <= EMPTY_OFFSET) return settled;

  const autoThreshold = params.autoscrollToTopThreshold;
  const anchoredNearTop = autoThreshold !== undefined && params.scrollOffset <= autoThreshold;
  if (anchoredNearTop) {
    dlog(
      `VirtualizedList MVCP autoscroll-to-top (offset=${params.scrollOffset} <= ${autoThreshold})`,
    );
    return { firstVisibleKey: newFirstVisibleKey, action: { kind: 'autoscroll-top' } };
  }
  dlog(
    `VirtualizedList MVCP adjust +${insertedExtent}px ` +
      `(anchor "${prevKey}" moved ${minIndexForVisible}->${anchorIndex})`,
  );
  return {
    firstVisibleKey: newFirstVisibleKey,
    action: { kind: 'shift', offset: params.scrollOffset + insertedExtent },
  };
}

// The default key extractor: the caller's keyExtractor when set, else the index as a string (RN's
// default). Centralized so every adapter's keyForIndex resolves keys identically.
export function resolveItemKey<ItemT>(
  item: ItemT,
  index: number,
  keyExtractor: ((item: ItemT, index: number) => string) | undefined,
): string {
  return keyExtractor ? keyExtractor(item, index) : String(index);
}

// Linear item -> index lookup for scrollToItem (RN scans by reference identity). NO_INDEX when the
// item is not in data.
export function indexOfItem(
  data: unknown,
  getItem: (data: unknown, index: number) => unknown,
  count: number,
  item: unknown,
): number {
  for (let index = FIRST_INDEX; index < count; index += 1) {
    if (getItem(data, index) === item) return index;
  }
  return NO_INDEX;
}

// The pixel offset that scrolls the last content to the bottom edge (scrollToEnd). Never negative
// when the content is shorter than the viewport.
export function offsetForEnd(total: number, viewportLength: number): number {
  return Math.max(EMPTY_OFFSET, total - viewportLength);
}

// A gap index addresses a real separator only inside [0, count-2]; outside it there is no gap and
// the write is a no-op (RN bails on the same bounds).
export function isSeparatorGapInRange(gapIndex: number, count: number): boolean {
  return gapIndex >= FIRST_INDEX && gapIndex <= count - 2;
}

// onEndReached / onStartReached fire decision + content-length dedup (RN _maybeCallOnEdgeReached).
// The geometry (withinThreshold) comes from computeEndReached/computeStartReached; this folds in the
// "edge cell actually rendered" gate, the dedup against the last-fired content length, and the
// re-arm once scrolled away from the edge. Returns whether to fire plus the next dedup sentinel.
export function decideEdgeReached(params: {
  withinThreshold: boolean;
  edgeCellRendered: boolean;
  total: number;
  sentForContentLength: number;
}): { shouldFire: boolean; nextSentForContentLength: number } {
  const { withinThreshold, edgeCellRendered, total, sentForContentLength } = params;
  if (withinThreshold && edgeCellRendered && sentForContentLength !== total) {
    return { shouldFire: true, nextSentForContentLength: total };
  }
  // Re-arm once out of threshold so the next approach can fire again.
  if (!withinThreshold) {
    return { shouldFire: false, nextSentForContentLength: NO_CONTENT_LENGTH_SENT };
  }
  return { shouldFire: false, nextSentForContentLength: sentForContentLength };
}

// Section headers stick by default only on iOS (RN); the explicit prop overrides. Returns the
// header indices to stick, or undefined when sticking is off.
export function resolveStickySectionHeaders(
  enabled: boolean | undefined,
  headerIndices: number[],
  platformOS: string,
): number[] | undefined {
  const stickyEnabled = enabled ?? platformOS === 'ios';
  return stickyEnabled ? headerIndices : undefined;
}

// Wrap the user's getItemLayout into an (index) => ICellLayout resolver (dropping the `index` field
// RN's getItemLayout returns), or undefined when there is no getItemLayout.
export function wrapFixedLayout(
  data: unknown,
  getItemLayout:
    | ((data: unknown, index: number) => { length: number; offset: number; index: number })
    | undefined,
): ((index: number) => ICellLayout) | undefined {
  if (getItemLayout === undefined) return undefined;
  return (index: number): ICellLayout => {
    const layout = getItemLayout(data, index);
    return { length: layout.length, offset: layout.offset };
  };
}

// The average cell length that sizes unmeasured cells and the trailing spacer: the fixed layout's
// first cell length when getItemLayout is set (guarded against an empty list so it never calls
// fixedLayout on a non-existent cell), else the running average of the measured cells.
export function resolveAverageLength(
  fixedLayout: ((index: number) => ICellLayout) | undefined,
  count: number,
  measured: Map<number, number>,
): number {
  if (fixedLayout === undefined) return averageMeasuredLength(measured);
  return count > FIRST_INDEX ? fixedLayout(FIRST_INDEX).length : EMPTY_OFFSET;
}
