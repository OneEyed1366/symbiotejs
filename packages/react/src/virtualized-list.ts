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
// scrollToEnd) is driven by pushing a new `contentOffset` prop down to the
// ScrollView — the only path available without a native ref into the inner
// RCTScrollView node (which lives behind the ScrollView FC). A bumped
// contentOffset re-commits the scroll position; animated scrolling is a deferred
// device-only nicety (see SHARED CHANGES NEEDED).

import {
  createElement,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react'
import { dlog, type SymbioteEvent } from '@symbiote/shared'
import { ScrollView, type ScrollViewProps } from './scroll-view'
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
// Sentinel for "onEndReached has not fired for any content length yet". Real
// content lengths are >= 0, so -1 can never collide with one.
const NO_CONTENT_LENGTH_SENT = -1
// Inversion flips the content container along the scroll axis; each cell re-flips
// so its own content stays upright (RN does the same with a scale(-1) transform).
const INVERTED_Y_STYLE: ViewStyle = { transform: [{ scaleY: -1 }] }
const INVERTED_X_STYLE: ViewStyle = { transform: [{ scaleX: -1 }] }

export interface CellLayout {
  length: number
  offset: number
}

type RenderItem<ItemT> = (info: { item: ItemT; index: number }) => ReactNode

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
// itemVisiblePercentThreshold is the common one. waitForInteraction is a
// device-only nicety we do not honor (see SHARED CHANGES NEEDED).
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
// resolves to an offset and is pushed via the contentOffset prop.
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
  ItemSeparatorComponent?: ComponentType<Record<string, never>>
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
  onViewableItemsChanged?: (info: ViewableItemsChangedInfo<ItemT>) => void
  viewabilityConfig?: ViewabilityConfig
  viewabilityConfigCallbackPairs?: ViewabilityConfigCallbackPair<ItemT>[]
  initialNumToRender?: number
  initialScrollIndex?: number
  maxToRenderPerBatch?: number
  updateCellsBatchingPeriod?: number
  windowSize?: number
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
    onViewableItemsChanged,
    viewabilityConfig,
    viewabilityConfigCallbackPairs,
    initialNumToRender = DEFAULT_INITIAL_NUM_TO_RENDER,
    initialScrollIndex,
    maxToRenderPerBatch = DEFAULT_MAX_TO_RENDER_PER_BATCH,
    updateCellsBatchingPeriod = DEFAULT_UPDATE_CELLS_BATCHING_PERIOD,
    windowSize = DEFAULT_WINDOW_SIZE,
    style,
    contentContainerStyle,
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
  // initialScrollIndex is applied once, after the first layout gives us a
  // viewport and offsets to resolve the index into a pixel offset.
  const appliedInitialScrollRef = useRef(false)

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
      setScrollOffset(offset)
      // A real user/native scroll supersedes any pending commanded offset, so
      // clearing it avoids re-pushing a stale target on the next render.
      setCommandedOffset(undefined)
    },
    [horizontal],
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
      // (RN's broadest classification for the viewable/changed arrays).
      let anyViewable = false
      for (const pair of viewabilityPairs) {
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

    lastViewableRef.current = viewable
    dlog(
      `VirtualizedList viewable=${viewableTokens.length} changed=${changed.length} ` +
        `(window [${first}, ${last}])`,
    )
    const info: ViewableItemsChangedInfo<ItemT> = { viewableItems: viewableTokens, changed }
    for (const pair of viewabilityPairs) pair.onViewableItemsChanged(info)
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
    (offset: number): void => {
      const clamped = Math.max(EMPTY_OFFSET, offset)
      dlog(`VirtualizedList scrollTo offset=${clamped} (horizontal=${horizontal})`)
      setCommandedOffset(horizontal ? { x: clamped, y: EMPTY_OFFSET } : { x: EMPTY_OFFSET, y: clamped })
    },
    [horizontal],
  )

  useImperativeHandle(
    forwardedRef ?? null,
    () => ({
      scrollToOffset: (params: { offset: number; animated?: boolean }): void => {
        scrollToPixel(params.offset)
      },
      scrollToIndex: (params: {
        index: number
        animated?: boolean
        viewOffset?: number
        viewPosition?: number
      }): void => {
        scrollToPixel(offsetForIndex(params.index, params.viewPosition ?? FIRST_INDEX, params.viewOffset ?? EMPTY_OFFSET))
      },
      scrollToItem: (params: { item: unknown; animated?: boolean; viewPosition?: number }): void => {
        for (let index = FIRST_INDEX; index < count; index += 1) {
          if (getItem(data, index) === params.item) {
            scrollToPixel(offsetForIndex(index, params.viewPosition ?? FIRST_INDEX, EMPTY_OFFSET))
            return
          }
        }
        dlog('VirtualizedList scrollToItem: item not found')
      },
      scrollToEnd: (): void => {
        scrollToPixel(Math.max(EMPTY_OFFSET, total - viewportLength))
      },
    }),
    [scrollToPixel, offsetForIndex, count, data, getItem, total, viewportLength],
  )

  // initialScrollIndex: once the first viewport is known, jump to that index a
  // single time. Done as an effect so it runs after offsets resolve.
  useEffect(() => {
    if (initialScrollIndex === undefined || appliedInitialScrollRef.current) return
    if (viewportLength <= EMPTY_OFFSET || count === FIRST_INDEX) return
    appliedInitialScrollRef.current = true
    scrollToPixel(offsetForIndex(initialScrollIndex, FIRST_INDEX, EMPTY_OFFSET))
  }, [initialScrollIndex, viewportLength, count, scrollToPixel, offsetForIndex])

  // ---- assemble the windowed child list ----------------------------------

  // extraData needs no wiring: this component is not memoized, so any prop change
  // (including extraData) already re-renders and re-runs renderItem with fresh
  // captured state — RN's extraData contract. Accepted for parity; voided to mark
  // the deliberate no-op for the unused-prop lint.
  void extraData

  const children: ReactNode[] = []

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
      const cell = renderItem({ item, index })
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
      const separator = resolveElement(ItemSeparatorComponent)
      if (separator !== undefined && index < last) {
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
  // inverted flips the whole content container along the scroll axis; each cell
  // counter-flips (INVERTED_X/Y_STYLE in the loop above) so content stays upright
  // but the list grows bottom-to-top, matching RN's transform-based inversion.
  const resolvedContentContainerStyle: ViewStyle = {
    ...(horizontal ? { ...contentContainerStyle, width: total } : { ...contentContainerStyle }),
    ...(inverted ? (horizontal ? INVERTED_X_STYLE : INVERTED_Y_STYLE) : {}),
  }
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
  // A pending imperative/initial scroll rides down as contentOffset. A fresh
  // object identity each push guarantees the commit path re-applies it even when
  // the numeric value repeats.
  if (commandedOffset !== undefined) scrollProps.contentOffset = commandedOffset

  return createElement(ScrollView, scrollProps, ...children)
}
