// VirtualizedList — real windowing over the existing ScrollView. Only the cells
// whose computed offset falls inside the visible window (plus a leading/trailing
// buffer) are rendered; everything above and below is collapsed into two spacer
// Views whose sizes sum to the off-screen extent, so the scroll thumb and total
// content size stay correct without mounting all N rows.
//
// Three inputs drive the window:
//   - scrollOffset    — from the ScrollView's onScroll (nativeEvent.contentOffset)
//   - viewportLength  — from the ScrollView's onLayout (nativeEvent.layout)
//   - per-cell extent — getItemLayout when provided, else measured via each
//                        rendered cell's onLayout and cached by index
//
// This is a faithful port of RN's VirtualizedList windowing adapted to our
// primitives: we keep `windowSize` viewport-lengths of cells resident, centered
// on the visible region. maxToRenderPerBatch caps how many NEW cells join the
// resident set per batch tick (updateCellsBatchingPeriod), matching RN's
// incremental fill — the window still snaps fully once the batches catch up. All
// clone-on-write stays in shared; this file only emits host elements and reads
// back layout.
//
// Imperative scrolling (scrollToIndex / scrollToOffset / scrollToItem /
// scrollToEnd) resolves to an offset and rides the ScrollView's native scrollTo
// command via its handle ref — animated by default (RN animates unless told
// otherwise), instant when animated: false. Same path on both platforms, like RN.
// The `contentOffset` prop is only a fallback for the pre-mount window (handle not yet
// attached): pushing it post-mount scrolls on Android but iOS honors it only as an
// initial value.

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
} from 'react'
import { dlog, type SymbioteEvent } from '@symbiote/shared'
import { ScrollView, type ScrollViewHandle, type ScrollViewProps } from './scroll-view'
import { RefreshControl } from './refresh-control'
import type { AccessibilityProps, AriaProps } from './accessibility-props'
import type { ViewStyle } from './styles'

// Defaults match RN. windowSize is measured in viewport-lengths (21 => ten
// screens of buffer on each side of the visible region). onEndReachedThreshold
// is a multiple of the visible length (RN's onEndReachedThresholdOrDefault
// returns `?? 2`, i.e. two viewports). initialNumToRender bounds the first paint
// before any layout has been measured. maxToRenderPerBatch / batching period
// mirror RN's incremental fill defaults.
const DEFAULT_WINDOW_SIZE = 21
const DEFAULT_INITIAL_NUM_TO_RENDER = 10
const DEFAULT_END_REACHED_THRESHOLD = 2
const DEFAULT_MAX_TO_RENDER_PER_BATCH = 10
const DEFAULT_UPDATE_CELLS_BATCHING_PERIOD = 50
const DEFAULT_VIEW_AREA_COVERAGE_PERCENT_THRESHOLD = 0
const FIRST_INDEX = 0
const EMPTY_OFFSET = 0
const NO_INDEX = -1
const FULLY_VISIBLE_PERCENT = 100
// RN floors sub-pixel end distances to 0 so a debounced scroll that stops a
// fraction of a pixel from the bottom still counts as "reached the end"
// (RN VirtualizedList.js: ON_EDGE_REACHED_EPSILON).
const ON_EDGE_REACHED_EPSILON = 0.001
// Sentinel for "onEndReached / onStartReached has not fired for any content
// length yet". Real content lengths are >= 0, so -1 can never collide with one.
const NO_CONTENT_LENGTH_SENT = -1
// onStartReachedThreshold default, mirroring RN's onStartReachedThresholdOrDefault
// (`?? 2`) — a multiple of the visible length, same shape as the end threshold.
const DEFAULT_START_REACHED_THRESHOLD = 2
// Inversion flips the content container along the scroll axis; each cell re-flips
// so its own content stays upright (RN does the same with a scale(-1) transform).
const INVERTED_Y_STYLE: ViewStyle = { transform: [{ scaleY: -1 }] }
const INVERTED_X_STYLE: ViewStyle = { transform: [{ scaleX: -1 }] }

export interface CellLayout {
  length: number
  offset: number
}

// The props RN hands ItemSeparatorComponent (VirtualizedListCellRenderer.js:53-56 plus
// the section fields VirtualizedSectionList layers on): the highlight flag the cell can
// toggle, the items on either side of the gap, and — for section lists — the section the
// separator sits in. `section` stays optional because a flat VirtualizedList has none.
export interface SeparatorProps<ItemT> {
  highlighted: boolean
  leadingItem?: ItemT
  trailingItem?: ItemT
  section?: unknown
  [key: string]: unknown
}

// The imperative separator handle passed to renderItem (RN CellRenderer._separators,
// VirtualizedListCellRenderer.js:92-115). highlight/unhighlight flip the highlighted flag
// on the separators flanking this cell; updateProps merges arbitrary props onto the leading
// (previous gap) or trailing (this gap) separator so a row can drive its own dividers.
export interface Separators {
  highlight(): void
  unhighlight(): void
  updateProps(select: 'leading' | 'trailing', newProps: Record<string, unknown>): void
}

type RenderItem<ItemT> = (info: {
  item: ItemT
  index: number
  separators: Separators
}) => ReactNode

// A viewable item, as reported to onViewableItemsChanged. Mirrors RN's
// ViewToken shape (item + key + index + isViewable), minus the section field
// which only VirtualizedSectionList populates.
export interface ViewToken<ItemT> {
  item: ItemT
  key: string
  index: number
  isViewable: boolean
}

// onViewableItemsChanged callback info, mirroring RN's signature.
export interface ViewableItemsChangedInfo<ItemT> {
  viewableItems: ViewToken<ItemT>[]
  changed: ViewToken<ItemT>[]
}

// Viewability tuning, mirroring RN's ViewabilityConfig. Either a coverage
// percentage OR a minimum visible pixel height qualifies a cell as viewable;
// itemVisiblePercentThreshold is the common one. waitForInteraction gates a
// config so nothing is reported viewable until the first scroll interaction has
// happened (RN's ViewabilityHelper: `waitForInteraction && !_hasInteracted`
// returns no viewable items until recordInteraction, which RN calls on scroll).
export interface ViewabilityConfig {
  minimumViewTime?: number
  viewAreaCoveragePercentThreshold?: number
  itemVisiblePercentThreshold?: number
  waitForInteraction?: boolean
}

// A config paired with its callback, so a list can track several viewability
// definitions at once (RN's viewabilityConfigCallbackPairs).
export interface ViewabilityConfigCallbackPair<ItemT> {
  viewabilityConfig: ViewabilityConfig
  onViewableItemsChanged: (info: ViewableItemsChangedInfo<ItemT>) => void
}

// The imperative API RN exposes on a VirtualizedList/FlatList ref. Every scroll
// resolves to an offset and is pushed via the contentOffset prop. The
// flash/get*/record methods mirror RN's VirtualizedList: flashScrollIndicators
// and the scroll-ref getters route to the inner ScrollView handle;
// recordInteraction flips the interaction flag that ungates waitForInteraction.
export interface VirtualizedListHandle {
  scrollToOffset(params: { offset: number; animated?: boolean }): void
  scrollToIndex(params: {
    index: number
    animated?: boolean
    viewOffset?: number
    viewPosition?: number
  }): void
  scrollToItem(params: { item: unknown; animated?: boolean; viewPosition?: number }): void
  scrollToEnd(params?: { animated?: boolean }): void
  flashScrollIndicators(): void
  // RN returns the native scroll ref / responder / node. We hand back the inner
  // ScrollView handle (or null before it attaches) — no fabricated native tag.
  getNativeScrollRef(): ScrollViewHandle | null
  getScrollableNode(): ScrollViewHandle | null
  getScrollResponder(): ScrollViewHandle | null
  recordInteraction(): void
}

export interface VirtualizedListProps<ItemT> extends AccessibilityProps, AriaProps {
  data: unknown
  getItem: (data: unknown, index: number) => ItemT
  getItemCount: (data: unknown) => number
  renderItem: RenderItem<ItemT>
  keyExtractor?: (item: ItemT, index: number) => string
  getItemLayout?: (
    data: unknown,
    index: number,
  ) => { length: number; offset: number; index: number }
  ItemSeparatorComponent?: ComponentType<SeparatorProps<ItemT>>
  ListHeaderComponent?: ComponentType<Record<string, never>> | ReactElement
  ListFooterComponent?: ComponentType<Record<string, never>> | ReactElement
  ListEmptyComponent?: ComponentType<Record<string, never>> | ReactElement
  horizontal?: boolean
  inverted?: boolean
  // Opaque marker prop: changing it re-renders the list so renderItem closures
  // that read external state stay fresh. We have no PureComponent cell to bust,
  // so this is consumed only as a render dependency (RN's extraData).
  extraData?: unknown
  onEndReached?: (info: { distanceFromEnd: number }) => void
  onEndReachedThreshold?: number
  // Fired once when the scroll position gets within onStartReachedThreshold of the
  // start (the top edge), mirroring onEndReached for the bottom. The threshold is a
  // multiple of the visible length (RN's onStartReachedThresholdOrDefault `?? 2`).
  onStartReached?: (info: { distanceFromStart: number }) => void
  onStartReachedThreshold?: number
  // Pull-to-refresh. When onRefresh is set, RN renders a RefreshControl into the
  // inner ScrollView's refreshControl prop; refreshing is the controlled spinner
  // state (required-by-RN alongside onRefresh, defaulted to false when nullish),
  // and progressViewOffset nudges the spinner's resting position.
  onRefresh?: () => void
  refreshing?: boolean | null
  progressViewOffset?: number
  onViewableItemsChanged?: (info: ViewableItemsChangedInfo<ItemT>) => void
  viewabilityConfig?: ViewabilityConfig
  viewabilityConfigCallbackPairs?: ViewabilityConfigCallbackPair<ItemT>[]
  // Fired when scrollToIndex targets a cell that has not been measured yet and there is
  // no getItemLayout to place it from — RN cannot know the offset, so instead of guessing
  // it hands the caller the failure to recover (e.g. scroll near, then retry). Mirrors RN
  // VirtualizedList.js:162,184-193: {index, highestMeasuredFrameIndex, averageItemLength}.
  onScrollToIndexFailed?: (info: {
    index: number
    highestMeasuredFrameIndex: number
    averageItemLength: number
  }) => void
  initialNumToRender?: number
  initialScrollIndex?: number
  maxToRenderPerBatch?: number
  updateCellsBatchingPeriod?: number
  windowSize?: number
  // Data indices (into the item stream) that should stick to the top as they scroll
  // off — VirtualizedSectionList passes its section-header indices here. We forward the
  // ones currently in the render window to the ScrollView's native stickyHeaderIndices,
  // mapped to their child position. A header collapsed into a spacer (far outside the
  // window) can't stick until it re-enters; with the default ~10-screen window that
  // edge is rarely hit. Headerless lists leave this undefined (no sticky behavior).
  stickyHeaderIndices?: number[]
  // Keep the visually-anchored item in place when content is prepended (RN's
  // maintainVisibleContentPosition). `minIndexForVisible` is the first index treated as
  // "visible" to anchor against; `autoscrollToTopThreshold`, when set and the anchor is
  // within that many pixels of the top, follows the prepended content to the top instead.
  // RN both (a) forwards this to the native ScrollView AND (b) shifts scroll in JS so a
  // prepend doesn't jump the list (VirtualizedList.js:715-768, 1112-1121). We do both.
  maintainVisibleContentPosition?: {
    minIndexForVisible: number
    autoscrollToTopThreshold?: number
  }
  // Scroll-driven UI hook. RN's _onScroll runs its own windowing bookkeeping AND
  // then calls this.props.onScroll(e) (VirtualizedList.js:1695-1697) — the user's
  // handler must COMPOSE with the internal one, never replace it. We destructure
  // it out below so it cannot also arrive raw via ...accessibilityRest and clobber
  // the internal handler, then chain both: internal first, user second.
  onScroll?: (event: SymbioteEvent) => void
  // Scroll-lifecycle callbacks forwarded to the inner ScrollView, mirroring RN's
  // assembly (VirtualizedList.js:1096-1099). The ScrollView already types and fires
  // these; the list only needs to forward them through.
  onScrollBeginDrag?: (event: SymbioteEvent) => void
  onScrollEndDrag?: (event: SymbioteEvent) => void
  onMomentumScrollBegin?: (event: SymbioteEvent) => void
  onMomentumScrollEnd?: (event: SymbioteEvent) => void
  // Throttle for scroll-event delivery, forwarded to the inner ScrollView
  // (RN VirtualizedList.js:1102 defaults it to a near-zero value).
  scrollEventThrottle?: number
  // Tap/keyboard behavior forwarded to the inner ScrollView. These already pass
  // through at runtime via the rest spread; typed here so consumers can set them.
  keyboardShouldPersistTaps?: boolean | 'always' | 'never' | 'handled'
  keyboardDismissMode?: 'none' | 'on-drag' | 'interactive'
  style?: ViewStyle
  contentContainerStyle?: ViewStyle
}

// nativeEvent payload guards. The payloads arrive as `unknown` off the wire, so
// we narrow them with runtime checks rather than casting.
function readNumber(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key]
  return typeof value === 'number' ? value : undefined
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? { ...value } : undefined
}

// onScroll -> the offset along the scroll axis. Vertical reads contentOffset.y,
// horizontal reads contentOffset.x.
function readScrollOffset(event: SymbioteEvent, horizontal: boolean): number | undefined {
  const native = asRecord(event.nativeEvent)
  if (!native) return undefined
  const offset = asRecord(native.contentOffset)
  if (!offset) return undefined
  return readNumber(offset, horizontal ? 'x' : 'y')
}

// onLayout -> the cross-section length of the box along the scroll axis.
function readLayoutLength(event: SymbioteEvent, horizontal: boolean): number | undefined {
  const native = asRecord(event.nativeEvent)
  if (!native) return undefined
  const layout = asRecord(native.layout)
  if (!layout) return undefined
  return readNumber(layout, horizontal ? 'width' : 'height')
}

// A measured cell reports its own box; we take the scroll-axis length.
function readCellLength(event: SymbioteEvent, horizontal: boolean): number | undefined {
  const native = asRecord(event.nativeEvent)
  if (!native) return undefined
  const layout = asRecord(native.layout)
  if (!layout) return undefined
  return readNumber(layout, horizontal ? 'width' : 'height')
}

function resolveElement(
  component: ComponentType<Record<string, never>> | ReactElement | undefined,
): ReactNode {
  if (component === undefined) return undefined
  if (typeof component === 'function') return createElement(component, {})
  return component
}

// Build the ItemSeparatorComponent element for the gap between leadingItem and
// trailingItem, with the highlight flag and any handle-pushed overrides merged on top
// (RN renders `<ItemSeparatorComponent {...separatorProps} />`,
// VirtualizedListCellRenderer.js:205, where separatorProps starts {highlighted, leadingItem}
// and absorbs updateProps writes). A bare element (non-component) is returned as-is.
function renderSeparatorElement<ItemT>(
  component: ComponentType<SeparatorProps<ItemT>> | undefined,
  leadingItem: ItemT,
  trailingItem: ItemT,
  overrides: Partial<SeparatorProps<ItemT>> | undefined,
): ReactNode {
  if (component === undefined) return undefined
  const props: SeparatorProps<ItemT> = {
    highlighted: false,
    leadingItem,
    trailingItem,
    ...overrides,
  }
  return createElement(component, props)
}

// Resolve every cell offset/length from the cache (or getItemLayout), filling
// gaps with the running average so an unmeasured tail still has a plausible
// total. Returns the per-index offset table plus the grand total extent.
function buildOffsets(
  count: number,
  measured: Map<number, number>,
  fixedLayout: ((index: number) => CellLayout) | undefined,
  averageLength: number,
): { offsets: number[]; lengths: number[]; total: number } {
  const offsets: number[] = new Array<number>(count)
  const lengths: number[] = new Array<number>(count)
  let running = EMPTY_OFFSET
  for (let index = FIRST_INDEX; index < count; index += 1) {
    offsets[index] = running
    let length: number
    if (fixedLayout) {
      length = fixedLayout(index).length
    } else {
      const cached = measured.get(index)
      length = cached !== undefined ? cached : averageLength
    }
    lengths[index] = length
    running += length
  }
  return { offsets, lengths, total: running }
}

// Pick the resident window: every index whose box overlaps
// [offset - buffer, offset + viewport + buffer]. The buffer is
// (windowSize - 1) / 2 viewport-lengths on each side, matching RN's symmetric
// leading/trailing overscan.
function computeWindow(
  count: number,
  offsets: number[],
  lengths: number[],
  scrollOffset: number,
  viewportLength: number,
  windowSize: number,
  initialNumToRender: number,
): { first: number; last: number } {
  if (count === FIRST_INDEX) return { first: FIRST_INDEX, last: NO_INDEX }

  // Before the viewport is known, paint a bounded prefix.
  if (viewportLength <= EMPTY_OFFSET) {
    return { first: FIRST_INDEX, last: Math.min(count, initialNumToRender) - 1 }
  }

  const overscan = ((windowSize - 1) / 2) * viewportLength
  const windowTop = scrollOffset - overscan
  const windowBottom = scrollOffset + viewportLength + overscan

  let first = FIRST_INDEX
  while (first < count - 1 && offsets[first] + lengths[first] <= windowTop) {
    first += 1
  }
  let last = first
  while (last < count - 1 && offsets[last] + lengths[last] < windowBottom) {
    last += 1
  }
  return { first, last }
}

// Clamp a freshly computed window against the previously-committed one so at
// most maxToRenderPerBatch new cells are added on each side per tick (RN's
// incremental fill). The window grows toward the target over successive batch
// ticks rather than snapping in one render — cheaper first paint on a big jump.
function throttleWindow(
  target: { first: number; last: number },
  previous: { first: number; last: number },
  maxToRenderPerBatch: number,
): { first: number; last: number } {
  if (previous.last < previous.first) return target
  const first = Math.max(target.first, previous.first - maxToRenderPerBatch)
  const last = Math.min(target.last, previous.last + maxToRenderPerBatch)
  // Never present an empty window when the target is non-empty.
  if (last < first) return target
  return { first, last }
}

// Fraction (0..100) of a cell's box that lies inside the viewport.
function visiblePercent(
  cellOffset: number,
  cellLength: number,
  scrollOffset: number,
  viewportLength: number,
): number {
  if (cellLength <= EMPTY_OFFSET) return EMPTY_OFFSET
  const top = Math.max(cellOffset, scrollOffset)
  const bottom = Math.min(cellOffset + cellLength, scrollOffset + viewportLength)
  const visible = Math.max(EMPTY_OFFSET, bottom - top)
  return (visible / cellLength) * FULLY_VISIBLE_PERCENT
}

// A cell is viewable when its visible fraction clears the configured threshold.
// itemVisiblePercentThreshold compares against the cell's own size;
// viewAreaCoveragePercentThreshold compares against the viewport — we honor the
// former when set, else the latter, matching RN's precedence.
function isCellViewable(
  percent: number,
  config: ViewabilityConfig,
): boolean {
  const itemThreshold = config.itemVisiblePercentThreshold
  if (itemThreshold !== undefined) return percent >= itemThreshold
  const areaThreshold =
    config.viewAreaCoveragePercentThreshold ?? DEFAULT_VIEW_AREA_COVERAGE_PERCENT_THRESHOLD
  return percent > areaThreshold || percent >= FULLY_VISIBLE_PERCENT
}

// React 19 passes `ref` as a regular prop, so a generic function component can
// expose an imperative handle without forwardRef (which erases the ItemT
// generic). The ref is destructured here and wired through useImperativeHandle.
export function VirtualizedList<ItemT>(
  props: VirtualizedListProps<ItemT> & { ref?: Ref<VirtualizedListHandle> },
): ReactElement {
  const forwardedRef = props.ref
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
    // ...accessibilityRest and overwrite the internal windowing handler — instead we
    // compose them below (internal first, user second), matching RN's _onScroll.
    onScroll: userOnScroll,
    // Scroll-lifecycle callbacks forwarded straight to the inner ScrollView, mirroring
    // RN's assembly (VirtualizedList.js:1096-1099). The ScrollView fires the user's
    // handler itself, so these only need to ride through unchanged.
    onScrollBeginDrag,
    onScrollEndDrag,
    onMomentumScrollBegin,
    onMomentumScrollEnd,
    scrollEventThrottle,
    keyboardShouldPersistTaps,
    keyboardDismissMode,
    // The accessibility surface rides down to the underlying ScrollView, which runs
    // resolveAccessibilityProps itself — so the raw aria/role + accessibility* props
    // pass through here and fold there once. ref is pulled separately above, so it is
    // re-listed here only to keep it out of the forwarded rest.
    ref: _ref,
    ...accessibilityRest
  } = props

  const count = getItemCount(data)

  const [scrollOffset, setScrollOffset] = useState(EMPTY_OFFSET)
  const [viewportLength, setViewportLength] = useState(EMPTY_OFFSET)
  // The offset we are imperatively driving native to (scrollTo*). Pushed down as
  // the ScrollView's contentOffset prop; a fresh object identity each time so the
  // commit path always re-applies it. undefined = no imperative scroll pending.
  const [commandedOffset, setCommandedOffset] = useState<{ x: number; y: number } | undefined>(
    undefined,
  )
  // The underlying ScrollView's imperative handle, so an animated scroll can go through
  // its native scrollTo command (smooth) rather than an instant contentOffset push.
  const scrollViewRef = useRef<ScrollViewHandle>(null)
  // Measured cell lengths by index. A ref-backed Map mutated in place plus a
  // version counter to request a re-render only when a NEW measurement lands,
  // so steady-state scrolling doesn't thrash on already-known cells.
  const measuredRef = useRef<Map<number, number>>(new Map())
  const [, setMeasureVersion] = useState(EMPTY_OFFSET)
  // The content length we last fired onEndReached for, mirroring RN's
  // _sentEndForContentLength: dedup by content length, not item count, so a
  // re-approach with the same content does not double-fire, but growing the
  // content (more rows measured/appended) re-arms the callback.
  const sentEndForContentLengthRef = useRef<number>(NO_CONTENT_LENGTH_SENT)
  // The start-edge twin of sentEndForContentLengthRef (RN's _sentStartForContentLength):
  // dedup onStartReached by content length, re-armed on scroll away from the start.
  const sentStartForContentLengthRef = useRef<number>(NO_CONTENT_LENGTH_SENT)
  // The previously committed window, so throttleWindow can grow it by at most
  // maxToRenderPerBatch per batch tick instead of snapping.
  const committedWindowRef = useRef<{ first: number; last: number }>({
    first: FIRST_INDEX,
    last: NO_INDEX,
  })
  // The tokens reported viewable on the last onViewableItemsChanged, keyed by
  // cell key, so we only fire when the set changes (RN dedups the same way) and
  // can build the newly-hidden delta without rescanning all N items.
  const lastViewableRef = useRef<Map<string, ViewToken<ItemT>>>(new Map())
  // Pending minimumViewTime debounce timer (RN ViewabilityHelper._timers). A fresh
  // viewable set recomputed before this fires cancels it, so scrolling straight through a
  // cell (it never stays minimumViewTime ms) never reports it viewable. null = no timer.
  const viewableTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Flips true on the first scroll, mirroring RN's ViewabilityHelper._hasInteracted
  // (set by recordInteraction, which RN calls on scroll). A config with
  // waitForInteraction reports NO viewable items until this is true.
  const hasInteractedRef = useRef(false)
  // Per-gap separator overrides, keyed by the LEADING cell index of the gap (the
  // separator after cell N is N's trailing separator and N+1's leading separator —
  // one entry per gap). Holds whatever `highlight`/`updateProps` pushed; merged over
  // the geometric defaults at render. RN keeps this as per-cell separatorProps state
  // (VirtualizedListCellRenderer.js:67-72); we fold it to one map plus a version bump
  // since our separators are plain elements, not stateful CellRenderer instances.
  const separatorOverridesRef = useRef<Map<number, Partial<SeparatorProps<ItemT>>>>(new Map())
  const [, setSeparatorVersion] = useState(EMPTY_OFFSET)
  // initialScrollIndex is applied once, after the first layout gives us a
  // viewport and offsets to resolve the index into a pixel offset.
  const appliedInitialScrollRef = useRef(false)
  // maintainVisibleContentPosition anchor tracking (RN's State.firstVisibleItemKey): the
  // key of the item at minIndexForVisible on the LAST render. When a prepend moves that key
  // to a higher index, the inserted extent above it is added to scrollOffset so the anchored
  // item stays put instead of jumping (RN getDerivedStateFromProps:715-768). null = no
  // anchor recorded yet (first render / MVCP off).
  const firstVisibleKeyRef = useRef<string | null>(null)

  const fixedLayout = useMemo(() => {
    if (getItemLayout === undefined) return undefined
    return (index: number): CellLayout => {
      const layout = getItemLayout(data, index)
      return { length: layout.length, offset: layout.offset }
    }
  }, [getItemLayout, data])

  // Running average of known cell lengths, used to size not-yet-measured cells
  // and the trailing spacer so the total is plausible before full measurement.
  const averageLength = useMemo(() => {
    if (fixedLayout) return fixedLayout(FIRST_INDEX).length
    const measured = measuredRef.current
    if (measured.size === EMPTY_OFFSET) return EMPTY_OFFSET
    let sum = EMPTY_OFFSET
    for (const length of measured.values()) sum += length
    return sum / measured.size
  }, [fixedLayout, scrollOffset, viewportLength])

  const { offsets, lengths, total } = buildOffsets(
    count,
    measuredRef.current,
    fixedLayout,
    averageLength,
  )

  const targetWindow = computeWindow(
    count,
    offsets,
    lengths,
    scrollOffset,
    viewportLength,
    windowSize,
    initialNumToRender,
  )
  const { first, last } = throttleWindow(
    targetWindow,
    committedWindowRef.current,
    maxToRenderPerBatch,
  )
  committedWindowRef.current = { first, last }

  dlog(
    `VirtualizedList window [${first}, ${last}] of ${count} ` +
      `(offset=${scrollOffset}, viewport=${viewportLength}, rendered=${Math.max(0, last - first + 1)})`,
  )

  // When the throttled window has not yet reached the target, schedule another
  // render after the batching period so the window keeps filling toward target.
  useEffect(() => {
    if (first <= targetWindow.first && last >= targetWindow.last) return
    const timer = setTimeout(() => {
      setMeasureVersion((version) => version + 1)
    }, updateCellsBatchingPeriod)
    return () => clearTimeout(timer)
  }, [first, last, targetWindow.first, targetWindow.last, updateCellsBatchingPeriod])

  const onScroll = useCallback(
    (event: SymbioteEvent): void => {
      const offset = readScrollOffset(event, horizontal)
      if (offset === undefined) return
      dlog(`VirtualizedList onScroll offset=${offset}`)
      // First scroll is the interaction that ungates waitForInteraction configs.
      hasInteractedRef.current = true
      setScrollOffset(offset)
      // A real user/native scroll supersedes any pending commanded offset, so
      // clearing it avoids re-pushing a stale target on the next render.
      setCommandedOffset(undefined)
      // Compose, don't clobber: internal windowing bookkeeping ran first, now hand
      // the same event to the user's onScroll (RN VirtualizedList.js:1695-1697).
      if (userOnScroll !== undefined) userOnScroll(event)
    },
    [horizontal, userOnScroll],
  )

  // onEndReached gating, ported from RN's _maybeCallOnEdgeReached. Run it as an
  // effect against the COMMITTED window (first/last/total just rendered for this
  // scrollOffset) rather than inside onScroll, where last/total still reflect the
  // previous render. Fire only when the actual last cell is rendered AND we are
  // within the threshold; dedup by content length (not item count); re-arm on
  // scroll away from the end.
  useEffect(() => {
    if (onEndReached === undefined || viewportLength <= EMPTY_OFFSET) return
    let distanceFromEnd = total - (scrollOffset + viewportLength)
    // Floor sub-pixel distances so a debounced near-bottom scroll still counts.
    if (distanceFromEnd < ON_EDGE_REACHED_EPSILON) {
      distanceFromEnd = EMPTY_OFFSET
    }
    const threshold = onEndReachedThreshold * viewportLength
    const isWithinEndThreshold = distanceFromEnd <= threshold
    const lastCellRendered = last === count - 1
    if (
      isWithinEndThreshold &&
      lastCellRendered &&
      sentEndForContentLengthRef.current !== total
    ) {
      sentEndForContentLengthRef.current = total
      dlog(
        `VirtualizedList onEndReached distanceFromEnd=${distanceFromEnd} ` +
          `(last=${last} of ${count}, contentLength=${total})`,
      )
      onEndReached({ distanceFromEnd })
    }
    // Scroll away from the end re-arms the callback for the next approach.
    if (!isWithinEndThreshold) {
      sentEndForContentLengthRef.current = NO_CONTENT_LENGTH_SENT
    }
  }, [onEndReached, onEndReachedThreshold, viewportLength, scrollOffset, total, last, count])

  // onStartReached gating: the top-edge twin of the onEndReached effect above
  // (RN folds both into one _maybeCallOnEdgeReached). distanceFromStart is just
  // the scroll offset; fire only when the first cell is rendered AND we are within
  // the start threshold; dedup by content length; re-arm on scroll away from start.
  useEffect(() => {
    if (onStartReached === undefined || viewportLength <= EMPTY_OFFSET) return
    let distanceFromStart = scrollOffset
    // Floor sub-pixel distances so a debounced near-top scroll still counts.
    if (distanceFromStart < ON_EDGE_REACHED_EPSILON) {
      distanceFromStart = EMPTY_OFFSET
    }
    const threshold = onStartReachedThreshold * viewportLength
    const isWithinStartThreshold = distanceFromStart <= threshold
    const firstCellRendered = first === FIRST_INDEX
    if (
      isWithinStartThreshold &&
      firstCellRendered &&
      sentStartForContentLengthRef.current !== total
    ) {
      sentStartForContentLengthRef.current = total
      dlog(
        `VirtualizedList onStartReached distanceFromStart=${distanceFromStart} ` +
          `(first=${first}, contentLength=${total})`,
      )
      onStartReached({ distanceFromStart })
    }
    // Scroll away from the start re-arms the callback for the next approach.
    if (!isWithinStartThreshold) {
      sentStartForContentLengthRef.current = NO_CONTENT_LENGTH_SENT
    }
  }, [onStartReached, onStartReachedThreshold, viewportLength, scrollOffset, total, first])

  // Viewability detection: after each scroll/window change, recompute which
  // rendered cells clear the viewability threshold and, if the viewable set
  // changed, fire onViewableItemsChanged + every config/callback pair. Run over
  // the committed window so offsets/scrollOffset are in sync. Single-config and
  // pairs forms both feed this one pass (RN supports either, not both).
  const viewabilityPairs = useMemo((): ViewabilityConfigCallbackPair<ItemT>[] => {
    const pairs: ViewabilityConfigCallbackPair<ItemT>[] = []
    if (onViewableItemsChanged !== undefined) {
      pairs.push({
        viewabilityConfig: viewabilityConfig ?? {},
        onViewableItemsChanged,
      })
    }
    if (viewabilityConfigCallbackPairs !== undefined) {
      pairs.push(...viewabilityConfigCallbackPairs)
    }
    return pairs
  }, [onViewableItemsChanged, viewabilityConfig, viewabilityConfigCallbackPairs])

  useEffect(() => {
    if (viewabilityPairs.length === EMPTY_OFFSET || viewportLength <= EMPTY_OFFSET) return
    if (count === FIRST_INDEX) return

    const viewableTokens: ViewToken<ItemT>[] = []
    const viewable = new Map<string, ViewToken<ItemT>>()
    for (let index = first; index <= last && index < count; index += 1) {
      const percent = visiblePercent(offsets[index], lengths[index], scrollOffset, viewportLength)
      const item = getItem(data, index)
      const key = keyExtractor ? keyExtractor(item, index) : String(index)
      // The viewable flag is per-config; we compute the geometry once and let
      // each config classify it. A cell counts as viewable if ANY config says so
      // (RN's broadest classification for the viewable/changed arrays). A config
      // with waitForInteraction classifies nothing until the first scroll has
      // happened (RN's _hasInteracted gate), so it is skipped until then.
      let anyViewable = false
      for (const pair of viewabilityPairs) {
        if (pair.viewabilityConfig.waitForInteraction === true && !hasInteractedRef.current) {
          continue
        }
        if (isCellViewable(percent, pair.viewabilityConfig)) {
          anyViewable = true
          break
        }
      }
      if (anyViewable) {
        const token: ViewToken<ItemT> = { item, key, index, isViewable: true }
        viewable.set(key, token)
        viewableTokens.push(token)
      }
    }

    // Only fire when the viewable key set actually changed.
    const previous = lastViewableRef.current
    let changedSet = previous.size !== viewable.size
    if (!changedSet) {
      for (const key of viewable.keys()) {
        if (!previous.has(key)) {
          changedSet = true
          break
        }
      }
    }
    if (!changedSet) return

    // The `changed` delta: newly viewable (true) and newly hidden (false). Hidden
    // ones come straight from the previous map, so no rescan of all N items.
    const changed: ViewToken<ItemT>[] = []
    for (const token of viewableTokens) {
      if (!previous.has(token.key)) changed.push(token)
    }
    for (const [key, token] of previous) {
      if (!viewable.has(key)) changed.push({ ...token, isViewable: false })
    }

    const commitAndFire = (): void => {
      lastViewableRef.current = viewable
      dlog(
        `VirtualizedList viewable=${viewableTokens.length} changed=${changed.length} ` +
          `(window [${first}, ${last}])`,
      )
      const info: ViewableItemsChangedInfo<ItemT> = { viewableItems: viewableTokens, changed }
      for (const pair of viewabilityPairs) pair.onViewableItemsChanged(info)
    }

    // minimumViewTime debounce (RN ViewabilityHelper.onUpdate:228-244): an item must stay
    // viewable this long before the change is reported. The largest configured value gates
    // the unified pass (we fold all pairs into one classification). A new set recomputed
    // before the timer elapses clears it via the cleanup below, so a scroll-through no-ops.
    let minimumViewTime = EMPTY_OFFSET
    for (const pair of viewabilityPairs) {
      const configured = pair.viewabilityConfig.minimumViewTime
      if (configured !== undefined && configured > minimumViewTime) minimumViewTime = configured
    }
    if (viewableTimerRef.current !== null) {
      clearTimeout(viewableTimerRef.current)
      viewableTimerRef.current = null
    }
    if (minimumViewTime > EMPTY_OFFSET) {
      dlog(`VirtualizedList viewability debounce ${minimumViewTime}ms (window [${first}, ${last}])`)
      viewableTimerRef.current = setTimeout(() => {
        viewableTimerRef.current = null
        commitAndFire()
      }, minimumViewTime)
      return
    }
    commitAndFire()
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
  ])

  // Clear any pending minimumViewTime debounce on unmount (RN ViewabilityHelper.dispose
  // clears _timers) so a queued fire never lands after the list is gone.
  useEffect(() => {
    return () => {
      if (viewableTimerRef.current !== null) clearTimeout(viewableTimerRef.current)
    }
  }, [])

  const onViewportLayout = useCallback(
    (event: SymbioteEvent): void => {
      const length = readLayoutLength(event, horizontal)
      if (length === undefined) return
      dlog(`VirtualizedList onLayout viewport=${length}`)
      setViewportLength(length)
    },
    [horizontal],
  )

  const makeCellMeasure = useCallback(
    (index: number) =>
      (event: SymbioteEvent): void => {
        if (fixedLayout) return
        const length = readCellLength(event, horizontal)
        if (length === undefined) return
        const measured = measuredRef.current
        if (measured.get(index) === length) return
        measured.set(index, length)
        dlog(`VirtualizedList cell ${index} measured length=${length}`)
        setMeasureVersion((version) => version + 1)
      },
    [fixedLayout, horizontal],
  )

  // Merge an override onto the separator at a given gap and request a re-render. A gap
  // index outside [0, count-2] has no separator, so the write is a no-op (RN bails the
  // same way when prevCellKey/cellKey is null). Mirrors CellRenderer.updateSeparatorProps.
  const mergeSeparator = useCallback(
    (gapIndex: number, patch: Partial<SeparatorProps<ItemT>>): void => {
      if (gapIndex < FIRST_INDEX || gapIndex > count - 2) return
      const overrides = separatorOverridesRef.current
      overrides.set(gapIndex, { ...overrides.get(gapIndex), ...patch })
      setSeparatorVersion((version) => version + 1)
    },
    [count],
  )

  // The Separators handle for the cell at `index` (RN CellRenderer._separators). The gap
  // after this cell is its TRAILING separator; the gap before it (index-1) is its LEADING
  // separator. highlight/unhighlight flip both flanking gaps; updateProps targets one.
  const makeSeparators = useCallback(
    (index: number): Separators => ({
      highlight: (): void => {
        dlog(`VirtualizedList separator highlight cell=${index}`)
        mergeSeparator(index - 1, { highlighted: true })
        mergeSeparator(index, { highlighted: true })
      },
      unhighlight: (): void => {
        dlog(`VirtualizedList separator unhighlight cell=${index}`)
        mergeSeparator(index - 1, { highlighted: false })
        mergeSeparator(index, { highlighted: false })
      },
      updateProps: (select: 'leading' | 'trailing', newProps: Record<string, unknown>): void => {
        mergeSeparator(select === 'leading' ? index - 1 : index, newProps)
      },
    }),
    [mergeSeparator],
  )

  // Resolve an index to a pixel offset, optionally biasing where in the viewport
  // the item lands (viewPosition 0=top, 1=bottom, 0.5=center) and an absolute
  // viewOffset nudge — mirroring RN's scrollToIndex options.
  const offsetForIndex = useCallback(
    (index: number, viewPosition: number, viewOffset: number): number => {
      const clamped = Math.max(FIRST_INDEX, Math.min(index, count - 1))
      const cellOffset = offsets[clamped] ?? EMPTY_OFFSET
      const cellLength = lengths[clamped] ?? EMPTY_OFFSET
      const positioned = cellOffset - viewPosition * (viewportLength - cellLength)
      return Math.max(EMPTY_OFFSET, positioned - viewOffset)
    },
    [count, offsets, lengths, viewportLength],
  )

  const scrollToPixel = useCallback(
    (offset: number, animated: boolean): void => {
      const clamped = Math.max(EMPTY_OFFSET, offset)
      const target = horizontal ? { x: clamped, y: EMPTY_OFFSET } : { x: EMPTY_OFFSET, y: clamped }
      // Both animated and instant scrolls ride the ScrollView's native scrollTo command
      // (the animated flag goes along) — exactly like RN's VirtualizedList. Pushing
      // contentOffset as a prop scrolls on Android but NOT on iOS post-mount, where iOS
      // honors contentOffset only as an initial value. The prop path stays as a fallback
      // for the pre-mount window, when the handle hasn't attached yet.
      if (scrollViewRef.current !== null) {
        dlog(`VirtualizedList scrollTo offset=${clamped} animated=${animated} (horizontal=${horizontal})`)
        scrollViewRef.current.scrollTo({ x: target.x, y: target.y, animated })
        return
      }
      dlog(`VirtualizedList scrollTo offset=${clamped} pending-ref (horizontal=${horizontal})`)
      setCommandedOffset(target)
    },
    [horizontal],
  )

  // The largest index whose length we have actually measured (RN
  // ListMetricsAggregator.getHighestMeasuredCellIndex). NO_INDEX when nothing is measured.
  // With getItemLayout every index is "measured", so this is irrelevant on that path.
  const highestMeasuredIndex = useCallback((): number => {
    let highest = NO_INDEX
    for (const index of measuredRef.current.keys()) {
      if (index > highest) highest = index
    }
    return highest
  }, [])

  useImperativeHandle(
    forwardedRef ?? null,
    () => ({
      // RN animates every imperative scroll unless the caller passes animated: false.
      scrollToOffset: (params: { offset: number; animated?: boolean }): void => {
        scrollToPixel(params.offset, params.animated ?? true)
      },
      scrollToIndex: (params: {
        index: number
        animated?: boolean
        viewOffset?: number
        viewPosition?: number
      }): void => {
        // No getItemLayout AND the target is past the last measured cell: we have no real
        // offset for it, so report the failure instead of scrolling to a fabricated estimate
        // (RN VirtualizedList.js:179-195). The caller recovers — typically scroll near, wait
        // for measurement, retry. With getItemLayout (fixedLayout) every index is placeable,
        // so this path never trips.
        if (fixedLayout === undefined && params.index > highestMeasuredIndex()) {
          dlog(
            `VirtualizedList onScrollToIndexFailed index=${params.index} ` +
              `highestMeasured=${highestMeasuredIndex()} (no getItemLayout)`,
          )
          onScrollToIndexFailed?.({
            index: params.index,
            highestMeasuredFrameIndex: highestMeasuredIndex(),
            averageItemLength: averageLength,
          })
          return
        }
        scrollToPixel(
          offsetForIndex(params.index, params.viewPosition ?? FIRST_INDEX, params.viewOffset ?? EMPTY_OFFSET),
          params.animated ?? true,
        )
      },
      scrollToItem: (params: { item: unknown; animated?: boolean; viewPosition?: number }): void => {
        for (let index = FIRST_INDEX; index < count; index += 1) {
          if (getItem(data, index) === params.item) {
            scrollToPixel(
              offsetForIndex(index, params.viewPosition ?? FIRST_INDEX, EMPTY_OFFSET),
              params.animated ?? true,
            )
            return
          }
        }
        dlog('VirtualizedList scrollToItem: item not found')
      },
      scrollToEnd: (params?: { animated?: boolean }): void => {
        scrollToPixel(Math.max(EMPTY_OFFSET, total - viewportLength), params?.animated ?? true)
      },
      // Route to the inner ScrollView, which already exposes flashScrollIndicators.
      flashScrollIndicators: (): void => {
        scrollViewRef.current?.flashScrollIndicators?.()
      },
      // RN's getScrollableNode/getScrollResponder/getNativeScrollRef hand back the
      // native scroll ref; we surface the inner ScrollView handle (null pre-mount).
      getNativeScrollRef: (): ScrollViewHandle | null => scrollViewRef.current,
      getScrollableNode: (): ScrollViewHandle | null => scrollViewRef.current,
      getScrollResponder: (): ScrollViewHandle | null => scrollViewRef.current,
      // Manual trigger for RN's recordInteraction: flip the interaction flag so
      // waitForInteraction viewability configs start reporting (the next scroll /
      // window pass picks it up), without waiting for the first scroll.
      recordInteraction: (): void => {
        hasInteractedRef.current = true
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
  )

  // initialScrollIndex: once the first viewport is known, jump to that index a
  // single time. Done as an effect so it runs after offsets resolve.
  useEffect(() => {
    if (initialScrollIndex === undefined || appliedInitialScrollRef.current) return
    if (viewportLength <= EMPTY_OFFSET || count === FIRST_INDEX) return
    appliedInitialScrollRef.current = true
    // The initial jump is instant (RN doesn't animate initialScrollIndex).
    scrollToPixel(offsetForIndex(initialScrollIndex, FIRST_INDEX, EMPTY_OFFSET), false)
  }, [initialScrollIndex, viewportLength, count, scrollToPixel, offsetForIndex])

  // maintainVisibleContentPosition JS anchor adjustment (RN getDerivedStateFromProps:715-768).
  // RN forwards the config to the native ScrollView too (done below), but because our
  // off-window content is collapsed into a SPACER rather than real cells, the native MVCP
  // cannot see prepended items above the window — so we replicate the JS shift here: track
  // the key of the item at minIndexForVisible; when a prepend moves it down by D items, add
  // the inserted extent above it to scrollOffset so the anchored item does not jump. Runs in
  // a layout effect so the correction lands before paint. autoscrollToTopThreshold: when the
  // anchor sat within that many px of the top, follow the new content to the top instead.
  const keyForIndex = useCallback(
    (index: number): string => {
      const item = getItem(data, index)
      return keyExtractor ? keyExtractor(item, index) : String(index)
    },
    [getItem, data, keyExtractor],
  )

  useLayoutEffect(() => {
    if (maintainVisibleContentPosition === undefined || count === FIRST_INDEX) {
      firstVisibleKeyRef.current = null
      return
    }
    const minIndexForVisible = maintainVisibleContentPosition.minIndexForVisible
    const newFirstVisibleKey = count > minIndexForVisible ? keyForIndex(minIndexForVisible) : null
    const prevKey = firstVisibleKeyRef.current

    // A prepend keeps the same anchored key but pushes it to a higher index. Scan forward
    // from minIndexForVisible for the old key; the items before it are the newly-inserted
    // ones (RN's _findItemIndexWithKey with a count-delta hint). Same key at the same slot
    // means no prepend — nothing to correct.
    if (prevKey !== null && newFirstVisibleKey !== null && prevKey !== newFirstVisibleKey) {
      let anchorIndex = NO_INDEX
      for (let index = minIndexForVisible; index < count; index += 1) {
        if (keyForIndex(index) === prevKey) {
          anchorIndex = index
          break
        }
      }
      if (anchorIndex > minIndexForVisible) {
        // The native maintainVisibleContentPosition already anchors the cells it RENDERS — on a
        // real host the native helper shifts the offset by the in-window inserted extent on its
        // own (verified on Android: it adds exactly the prepended height). So the JS shift must
        // cover ONLY the inserted items in the leading SPACER — those above the first rendered
        // index, which the native view collapsed away and cannot see. Counting the full inserted
        // extent here double-corrects (JS +X and native +X) and the list jumps by one extent. RN
        // splits the work the same way: native handles in-window, getDerivedStateFromProps the spacer.
        const spacerEnd = Math.min(anchorIndex, committedWindowRef.current.first)
        const insertedExtent =
          spacerEnd > minIndexForVisible ? offsets[spacerEnd] - offsets[minIndexForVisible] : EMPTY_OFFSET
        if (insertedExtent > EMPTY_OFFSET) {
          const autoThreshold = maintainVisibleContentPosition.autoscrollToTopThreshold
          const anchoredNearTop =
            autoThreshold !== undefined && scrollOffset <= autoThreshold
          if (anchoredNearTop) {
            dlog(
              `VirtualizedList MVCP autoscroll-to-top (offset=${scrollOffset} <= ${autoThreshold})`,
            )
            scrollToPixel(EMPTY_OFFSET, true)
          } else {
            dlog(
              `VirtualizedList MVCP adjust +${insertedExtent}px ` +
                `(anchor "${prevKey}" moved ${minIndexForVisible}->${anchorIndex})`,
            )
            scrollToPixel(scrollOffset + insertedExtent, false)
          }
        }
      }
    }
    firstVisibleKeyRef.current = newFirstVisibleKey
  }, [maintainVisibleContentPosition, count, keyForIndex, offsets, scrollOffset, scrollToPixel])

  // ---- assemble the windowed child list ----------------------------------

  // extraData needs no wiring: this component is not memoized, so any prop change
  // (including extraData) already re-renders and re-runs renderItem with fresh
  // captured state — RN's extraData contract. Accepted for parity; voided to mark
  // the deliberate no-op for the unused-prop lint.
  void extraData

  const children: ReactNode[] = []
  // Sticky data indices we still need to place, and the ScrollView child positions of
  // the ones that landed in the window — filled as cells are pushed so the position
  // accounts for the list header, leading spacer, and separators automatically.
  const stickySet = stickyHeaderIndices !== undefined ? new Set(stickyHeaderIndices) : undefined
  const renderedStickyIndices: number[] = []

  const header = resolveElement(ListHeaderComponent)
  if (header !== undefined) {
    children.push(createElement('symbiote-view', { key: 'list-header' }, header))
  }

  if (count === FIRST_INDEX) {
    const empty = resolveElement(ListEmptyComponent)
    if (empty !== undefined) {
      children.push(createElement('symbiote-view', { key: 'list-empty' }, empty))
    }
  } else {
    // Leading spacer collapses every cell above the window into one box.
    const leadingExtent = first > FIRST_INDEX ? offsets[first] : EMPTY_OFFSET
    if (leadingExtent > EMPTY_OFFSET) {
      children.push(
        createElement('symbiote-view', {
          key: 'spacer-leading',
          style: horizontal ? { width: leadingExtent } : { height: leadingExtent },
        }),
      )
    }

    for (let index = first; index <= last; index += 1) {
      const item = getItem(data, index)
      const key = keyExtractor ? keyExtractor(item, index) : String(index)
      // renderItem gets a separators handle so a row can highlight/update its own dividers
      // (RN CellRenderer._renderElement passes `separators`, VirtualizedListCellRenderer.js:162-167).
      const cell = renderItem({ item, index, separators: makeSeparators(index) })
      // Record this cell's child position before pushing it, if it is a sticky header.
      if (stickySet?.has(index) === true) renderedStickyIndices.push(children.length)
      // Wrap each cell in a measuring View. onLayout is a direct event the
      // shared node-prop scanner picks up automatically; getItemLayout short-
      // circuits measurement (makeCellMeasure returns early when fixedLayout).
      // When inverted, each cell carries the counter-flip so its content reads
      // upright inside the flipped content container (see invertedStyle below).
      children.push(
        createElement(
          'symbiote-view',
          {
            key: `cell-${key}`,
            onLayout: makeCellMeasure(index),
            style: inverted ? (horizontal ? INVERTED_X_STYLE : INVERTED_Y_STYLE) : undefined,
          },
          cell,
        ),
      )
      // The separator after cell `index` carries the gap's leading/trailing items and the
      // highlight flag, merged with whatever a Separators handle pushed (RN passes
      // {highlighted, leadingItem, trailingItem} to ItemSeparatorComponent,
      // VirtualizedListCellRenderer.js:205). Geometric defaults first, overrides on top.
      const separator =
        index < last
          ? renderSeparatorElement(
              ItemSeparatorComponent,
              item,
              getItem(data, index + 1),
              separatorOverridesRef.current.get(index),
            )
          : undefined
      if (separator !== undefined) {
        children.push(
          createElement('symbiote-view', { key: `sep-${key}` }, separator),
        )
      }
    }

    // Trailing spacer collapses every cell below the window.
    const renderedExtent =
      last >= first ? offsets[last] + lengths[last] - offsets[first] : EMPTY_OFFSET
    const trailingExtent = total - leadingExtent - renderedExtent
    if (trailingExtent > EMPTY_OFFSET) {
      children.push(
        createElement('symbiote-view', {
          key: 'spacer-trailing',
          style: horizontal ? { width: trailingExtent } : { height: trailingExtent },
        }),
      )
    }
  }

  const footer = resolveElement(ListFooterComponent)
  if (footer !== undefined) {
    children.push(createElement('symbiote-view', { key: 'list-footer' }, footer))
  }

  // onLayout is not on the ScrollViewProps surface, but ScrollView spreads its
  // unknown props straight onto the outer RCTScrollView node, where the shared
  // node-prop scanner turns onLayout into a direct `layout` listener. Type the
  // extra prop explicitly rather than widening ScrollViewProps from here.
  // A horizontal list must pin the content container to the full row width. The
  // content view otherwise stretches to the ScrollView's frame width (the default
  // cross-axis stretch), so the row is clipped and nothing overflows for iOS to
  // scroll. The vertical axis needs no pinning — stacked children grow it naturally.
  // The inversion flip rides ONLY the outer ScrollView style and each cell — never
  // the content container. RN composes inversionStyle onto the ScrollView `style`
  // and each cell wrapper, but the content view gets only contentContainerStyle
  // (VirtualizedList.js ~L918 cell, ~L1108 ScrollView style; the content view is
  // unflipped). Flipping the content container too would cancel the ScrollView flip
  // — the list reads upright while each cell still flips, rendering cells upside-down.
  const resolvedContentContainerStyle: ViewStyle = horizontal
    ? { ...contentContainerStyle, width: total }
    : { ...contentContainerStyle }
  const resolvedStyle: ViewStyle | undefined = inverted
    ? { ...style, ...(horizontal ? INVERTED_X_STYLE : INVERTED_Y_STYLE) }
    : style

  const scrollProps: ScrollViewProps & { onLayout: (event: SymbioteEvent) => void } = {
    // The list's accessibility surface (aria/role + accessibility*) rides down onto
    // the ScrollView, which folds it via resolveAccessibilityProps. Spread first so
    // the explicit windowing props below always win.
    ...accessibilityRest,
    style: resolvedStyle,
    contentContainerStyle: resolvedContentContainerStyle,
    horizontal,
    onScroll,
    onLayout: onViewportLayout,
  }
  // Scroll-lifecycle callbacks ride straight through to the inner ScrollView, which
  // fires them (RN VirtualizedList.js:1096-1099). Only set when provided so an absent
  // callback stays off the node.
  if (onScrollBeginDrag !== undefined) scrollProps.onScrollBeginDrag = onScrollBeginDrag
  if (onScrollEndDrag !== undefined) scrollProps.onScrollEndDrag = onScrollEndDrag
  if (onMomentumScrollBegin !== undefined) scrollProps.onMomentumScrollBegin = onMomentumScrollBegin
  if (onMomentumScrollEnd !== undefined) scrollProps.onMomentumScrollEnd = onMomentumScrollEnd
  if (scrollEventThrottle !== undefined) scrollProps.scrollEventThrottle = scrollEventThrottle
  if (keyboardShouldPersistTaps !== undefined)
    scrollProps.keyboardShouldPersistTaps = keyboardShouldPersistTaps
  if (keyboardDismissMode !== undefined) scrollProps.keyboardDismissMode = keyboardDismissMode
  // A pending imperative/initial scroll rides down as contentOffset. A fresh
  // object identity each push guarantees the commit path re-applies it even when
  // the numeric value repeats.
  if (commandedOffset !== undefined) scrollProps.contentOffset = commandedOffset
  // Headers in the window stick natively; an empty list leaves the prop off entirely.
  if (renderedStickyIndices.length > 0) scrollProps.stickyHeaderIndices = renderedStickyIndices
  // Forward maintainVisibleContentPosition to the native ScrollView so it anchors the in-window
  // cells (RN VirtualizedList.js:1112-1121). minIndexForVisible is bumped by 1 when a
  // ListHeaderComponent occupies child 0, since that header shifts every cell's child position.
  if (maintainVisibleContentPosition !== undefined) {
    scrollProps.maintainVisibleContentPosition = {
      ...maintainVisibleContentPosition,
      minIndexForVisible:
        maintainVisibleContentPosition.minIndexForVisible + (header !== undefined ? 1 : 0),
    }
  }

  // Pull-to-refresh: when onRefresh is set, build a RefreshControl for the ScrollView's
  // refreshControl prop (iOS sibling / Android wrap, owned by ScrollView). refreshing is
  // RN-required alongside onRefresh, so default it to false when nullish.
  if (onRefresh !== undefined) {
    dlog('VirtualizedList wiring RefreshControl (onRefresh provided)')
    scrollProps.refreshControl = createElement(RefreshControl, {
      refreshing: refreshing ?? false,
      onRefresh,
      progressViewOffset,
    })
  }

  // The ScrollView handle (ref) backs animated imperative scrolls via its native command.
  return createElement(ScrollView, { ...scrollProps, ref: scrollViewRef }, ...children)
}
