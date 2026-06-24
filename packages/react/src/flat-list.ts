// FlatList — the convenience surface over VirtualizedList. It takes a plain
// `data` array and derives getItem/getItemCount, so callers never touch the
// VirtualizedList data-access protocol. `numColumns` packs that many items into
// each row (a horizontal sub-View), so the virtualized stream is rows, not items
// — matching RN's FlatList behavior. All windowing, viewability, batching, and
// imperative scrolling are inherited from VirtualizedList; this file only adapts
// the data shape and grouping, and threads the imperative ref straight through.

import { createElement, type ComponentType, type ReactElement, type ReactNode, type Ref } from 'react'
import { dlog } from '@symbiote/shared'
import {
  VirtualizedList,
  type ViewabilityConfig,
  type ViewabilityConfigCallbackPair,
  type ViewableItemsChangedInfo,
  type VirtualizedListHandle,
} from './virtualized-list'
import type { AccessibilityProps, AriaProps } from './accessibility-props'
import type { ViewStyle } from './styles'

const SINGLE_COLUMN = 1

type RenderItem<ItemT> = (info: { item: ItemT; index: number }) => ReactNode

// FlatList's imperative handle is exactly VirtualizedList's — scrollTo* forwarded
// down to the underlying list.
export type FlatListHandle = VirtualizedListHandle

export interface FlatListProps<ItemT> extends AccessibilityProps, AriaProps {
  data: readonly ItemT[]
  renderItem: RenderItem<ItemT>
  keyExtractor?: (item: ItemT, index: number) => string
  getItemLayout?: (
    data: unknown,
    index: number,
  ) => { length: number; offset: number; index: number }
  numColumns?: number
  // Style for the auto-generated row View when numColumns > 1 (RN's
  // columnWrapperStyle). Ignored for a single column — there is no wrapping row.
  columnWrapperStyle?: ViewStyle
  ItemSeparatorComponent?: ComponentType<Record<string, never>>
  ListHeaderComponent?: ComponentType<Record<string, never>> | ReactElement
  ListFooterComponent?: ComponentType<Record<string, never>> | ReactElement
  ListEmptyComponent?: ComponentType<Record<string, never>> | ReactElement
  horizontal?: boolean
  inverted?: boolean
  extraData?: unknown
  onEndReached?: (info: { distanceFromEnd: number }) => void
  onEndReachedThreshold?: number
  // Top-edge twin of onEndReached, forwarded straight through to VirtualizedList.
  onStartReached?: (info: { distanceFromStart: number }) => void
  onStartReachedThreshold?: number
  // Pull-to-refresh, forwarded to VirtualizedList (which builds the RefreshControl).
  onRefresh?: () => void
  refreshing?: boolean | null
  progressViewOffset?: number
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

// A row is the slice of items packed into one virtualized cell when numColumns>1.
interface Row<ItemT> {
  items: ItemT[]
  startIndex: number
}

function chunkIntoRows<ItemT>(data: readonly ItemT[], columns: number): Row<ItemT>[] {
  const rows: Row<ItemT>[] = []
  for (let start = 0; start < data.length; start += columns) {
    rows.push({ items: data.slice(start, start + columns), startIndex: start })
  }
  return rows
}

export function FlatList<ItemT>(
  props: FlatListProps<ItemT> & { ref?: Ref<FlatListHandle> },
): ReactElement {
  const {
    ref,
    data,
    renderItem,
    keyExtractor,
    numColumns = SINGLE_COLUMN,
    columnWrapperStyle,
    // onViewableItemsChanged/viewability are typed against ItemT here; in the
    // multi-column path the underlying stream is Row<ItemT>, so they are dropped
    // from `rest` (they cannot be forwarded as-is) and pulled out explicitly.
    onViewableItemsChanged,
    viewabilityConfigCallbackPairs,
    ...rest
  } = props

  dlog(`FlatList over ${data.length} items, ${numColumns} column(s)`)

  if (numColumns <= SINGLE_COLUMN) {
    return createElement(VirtualizedList<ItemT>, {
      ref,
      data,
      getItem: (_source: unknown, index: number): ItemT => data[index],
      getItemCount: (): number => data.length,
      renderItem,
      keyExtractor,
      onViewableItemsChanged,
      viewabilityConfigCallbackPairs,
      ...rest,
    })
  }

  // Multi-column: the virtualized stream is rows. Each cell renders its items
  // side by side in a flex-row View so windowing accounts for whole rows.
  const rows = chunkIntoRows(data, numColumns)
  const rowStyle: ViewStyle = { flexDirection: 'row', ...columnWrapperStyle }

  const renderRow = (info: { item: Row<ItemT>; index: number }): ReactNode => {
    const cells = info.item.items.map((item, column) => {
      const index = info.item.startIndex + column
      const key = keyExtractor ? keyExtractor(item, index) : String(index)
      return createElement('symbiote-view', { key, style: { flex: 1 } }, renderItem({ item, index }))
    })
    return createElement('symbiote-view', { style: rowStyle }, ...cells)
  }

  const rowKeyExtractor = (row: Row<ItemT>): string => `row-${row.startIndex}`

  // Viewability over rows: map a row's viewable tokens back to per-item tokens so
  // the caller sees item-level visibility, not row-level. Each row token expands
  // to one token per item in that row, all sharing the row's isViewable flag.
  const wrapRowViewability = (
    callback: (info: ViewableItemsChangedInfo<ItemT>) => void,
  ): ((info: ViewableItemsChangedInfo<Row<ItemT>>) => void) => {
    return (rowInfo): void => {
      const expand = (
        tokens: ViewableItemsChangedInfo<Row<ItemT>>['viewableItems'],
      ): ViewableItemsChangedInfo<ItemT>['viewableItems'] =>
        tokens.flatMap((token) =>
          token.item.items.map((item, column) => {
            const index = token.item.startIndex + column
            const key = keyExtractor ? keyExtractor(item, index) : String(index)
            return { item, key, index, isViewable: token.isViewable }
          }),
        )
      callback({ viewableItems: expand(rowInfo.viewableItems), changed: expand(rowInfo.changed) })
    }
  }

  const rowOnViewableItemsChanged =
    onViewableItemsChanged !== undefined ? wrapRowViewability(onViewableItemsChanged) : undefined
  const rowViewabilityPairs = viewabilityConfigCallbackPairs?.map((pair) => ({
    viewabilityConfig: pair.viewabilityConfig,
    onViewableItemsChanged: wrapRowViewability(pair.onViewableItemsChanged),
  }))

  return createElement(VirtualizedList<Row<ItemT>>, {
    ref,
    data: rows,
    getItem: (_source: unknown, index: number): Row<ItemT> => rows[index],
    getItemCount: (): number => rows.length,
    renderItem: renderRow,
    keyExtractor: rowKeyExtractor,
    onViewableItemsChanged: rowOnViewableItemsChanged,
    viewabilityConfigCallbackPairs: rowViewabilityPairs,
    ...rest,
  })
}
