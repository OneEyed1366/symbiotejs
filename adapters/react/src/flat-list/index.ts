// FlatList: the convenience surface over VirtualizedList. It takes a plain
// `data` array and derives getItem/getItemCount, so callers never touch the
// VirtualizedList data-access protocol. `numColumns` packs that many items into
// each row (a horizontal sub-View), so the virtualized stream is rows, not
// items, matching RN's FlatList behavior. All windowing, viewability, batching, and
// imperative scrolling are inherited from VirtualizedList; this file only adapts
// the data shape and grouping, and threads the imperative ref straight through.

import {
  createElement,
  type ComponentType,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { dlog, type ISymbioteEvent } from '@symbiote/engine';
import {
  VirtualizedList,
  type ISeparators,
  type ISeparatorProps,
  type IViewabilityConfig,
  type IViewabilityConfigCallbackPair,
  type IViewableItemsChangedInfo,
  type IVirtualizedListHandle,
} from '../virtualized-list';
import type { IAccessibilityProps, IAriaProps } from '@symbiote/components';
import type { IStyleProp, IViewStyle } from '../styles';

const SINGLE_COLUMN = 1;

type IRenderItem<ItemT> = (info: {
  item: ItemT;
  index: number;
  separators: ISeparators;
}) => ReactNode;

// FlatList's imperative handle is exactly VirtualizedList's: scrollTo* forwarded
// down to the underlying list.
export type IFlatListHandle = IVirtualizedListHandle;

export interface IFlatListProps<ItemT> extends IAccessibilityProps, IAriaProps {
  data: readonly ItemT[];
  renderItem: IRenderItem<ItemT>;
  keyExtractor?: (item: ItemT, index: number) => string;
  getItemLayout?: (
    data: unknown,
    index: number,
  ) => { length: number; offset: number; index: number };
  numColumns?: number;
  // Style for the auto-generated row View when numColumns > 1 (RN's
  // columnWrapperStyle). Ignored for a single column (there is no wrapping row).
  columnWrapperStyle?: IStyleProp<IViewStyle>;
  ItemSeparatorComponent?: ComponentType<ISeparatorProps<ItemT>>;
  ListHeaderComponent?: ComponentType<Record<string, never>> | ReactElement;
  ListFooterComponent?: ComponentType<Record<string, never>> | ReactElement;
  ListEmptyComponent?: ComponentType<Record<string, never>> | ReactElement;
  horizontal?: boolean;
  inverted?: boolean;
  extraData?: unknown;
  onEndReached?: (info: { distanceFromEnd: number }) => void;
  onEndReachedThreshold?: number;
  // Top-edge twin of onEndReached, forwarded straight through to VirtualizedList.
  onStartReached?: (info: { distanceFromStart: number }) => void;
  onStartReachedThreshold?: number;
  // Pull-to-refresh, forwarded to VirtualizedList (which builds the RefreshControl).
  onRefresh?: () => void;
  refreshing?: boolean | null;
  progressViewOffset?: number;
  onViewableItemsChanged?: (info: IViewableItemsChangedInfo<ItemT>) => void;
  viewabilityConfig?: IViewabilityConfig;
  viewabilityConfigCallbackPairs?: IViewabilityConfigCallbackPair<ItemT>[];
  // Forwarded to VirtualizedList: fires when scrollToIndex targets an unmeasured cell
  // with no getItemLayout (RN VirtualizedList.js:184-193).
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
  // Forwarded to VirtualizedList: anchor the visible item so a prepend doesn't jump
  // (RN maintainVisibleContentPosition).
  maintainVisibleContentPosition?: {
    minIndexForVisible: number;
    autoscrollToTopThreshold?: number;
  };
  // Scroll callbacks forwarded through to VirtualizedList (via the rest spread),
  // which composes onScroll with its internal windowing handler and forwards the
  // lifecycle callbacks to the inner ScrollView (RN VirtualizedList.js:1096-1099,1695-1697).
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

// A row is the slice of items packed into one virtualized cell when numColumns>1.
interface IRow<ItemT> {
  items: ItemT[];
  startIndex: number;
}

function chunkIntoRows<ItemT>(data: readonly ItemT[], columns: number): IRow<ItemT>[] {
  const rows: IRow<ItemT>[] = [];
  for (let start = 0; start < data.length; start += columns) {
    rows.push({ items: data.slice(start, start + columns), startIndex: start });
  }
  return rows;
}

export function FlatList<ItemT>(
  props: IFlatListProps<ItemT> & { ref?: Ref<IFlatListHandle> },
): ReactElement {
  const {
    ref,
    data,
    renderItem,
    keyExtractor,
    numColumns = SINGLE_COLUMN,
    columnWrapperStyle,
    // onViewableItemsChanged/viewability are typed against ItemT here; in the
    // multi-column path the underlying stream is IRow<ItemT>, so they are dropped
    // from `rest` (they cannot be forwarded as-is) and pulled out explicitly.
    onViewableItemsChanged,
    viewabilityConfigCallbackPairs,
    // ItemSeparatorComponent is typed on ItemT; the multi-column stream is IRow<ItemT>, so it
    // is wrapped there to unwrap rows back to items, exactly like viewability above.
    ItemSeparatorComponent,
    ...rest
  } = props;

  dlog(`FlatList over ${data.length} items, ${numColumns} column(s)`);

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
      ItemSeparatorComponent,
      ...rest,
    });
  }

  // Multi-column: the virtualized stream is rows. Each cell renders its items
  // side by side in a flex-row View so windowing accounts for whole rows.
  const rows = chunkIntoRows(data, numColumns);
  const rowStyle: IStyleProp<IViewStyle> = [{ flexDirection: 'row' }, columnWrapperStyle];

  const renderRow = (info: {
    item: IRow<ItemT>;
    index: number;
    separators: ISeparators;
  }): ReactNode => {
    const cells = info.item.items.map((item, column) => {
      const index = info.item.startIndex + column;
      const key = keyExtractor ? keyExtractor(item, index) : String(index);
      // The row IS the virtualized cell, so every item in it shares the row's separators
      // handle (the divider sits between rows, not between columns). RN's multi-column
      // FlatList drives separators at the row level the same way.
      return createElement(
        'symbiote-view',
        { key, style: { flex: 1 } },
        renderItem({ item, index, separators: info.separators }),
      );
    });
    return createElement('symbiote-view', { style: rowStyle }, ...cells);
  };

  const rowKeyExtractor = (row: IRow<ItemT>): string => `row-${row.startIndex}`;

  // Viewability over rows: map a row's viewable tokens back to per-item tokens so
  // the caller sees item-level visibility, not row-level. Each row token expands
  // to one token per item in that row, all sharing the row's isViewable flag.
  const wrapRowViewability = (
    callback: (info: IViewableItemsChangedInfo<ItemT>) => void,
  ): ((info: IViewableItemsChangedInfo<IRow<ItemT>>) => void) => {
    return (rowInfo): void => {
      const expand = (
        tokens: IViewableItemsChangedInfo<IRow<ItemT>>['viewableItems'],
      ): IViewableItemsChangedInfo<ItemT>['viewableItems'] =>
        tokens.flatMap(token =>
          token.item.items.map((item, column) => {
            const index = token.item.startIndex + column;
            const key = keyExtractor ? keyExtractor(item, index) : String(index);
            return { item, key, index, isViewable: token.isViewable };
          }),
        );
      callback({ viewableItems: expand(rowInfo.viewableItems), changed: expand(rowInfo.changed) });
    };
  };

  const rowOnViewableItemsChanged =
    onViewableItemsChanged !== undefined ? wrapRowViewability(onViewableItemsChanged) : undefined;
  const rowViewabilityPairs = viewabilityConfigCallbackPairs?.map(pair => ({
    viewabilityConfig: pair.viewabilityConfig,
    onViewableItemsChanged: wrapRowViewability(pair.onViewableItemsChanged),
  }));

  // The divider between rows: its leading item is the LAST item of the row above, its
  // trailing item the FIRST item of the row below, so the user's separator, typed on ItemT,
  // sees real items rather than the IRow wrapper the multi-column stream uses internally.
  const lastItemOf = (row: IRow<ItemT> | undefined): ItemT | undefined =>
    row !== undefined ? row.items[row.items.length - 1] : undefined;
  const firstItemOf = (row: IRow<ItemT> | undefined): ItemT | undefined =>
    row !== undefined ? row.items[0] : undefined;
  const rowSeparatorComponent: ComponentType<ISeparatorProps<IRow<ItemT>>> | undefined =
    ItemSeparatorComponent === undefined
      ? undefined
      : (rowProps): ReactNode =>
          createElement(ItemSeparatorComponent, {
            ...rowProps,
            leadingItem: lastItemOf(rowProps.leadingItem),
            trailingItem: firstItemOf(rowProps.trailingItem),
          });

  return createElement(VirtualizedList<IRow<ItemT>>, {
    ref,
    data: rows,
    getItem: (_source: unknown, index: number): IRow<ItemT> => rows[index],
    getItemCount: (): number => rows.length,
    renderItem: renderRow,
    keyExtractor: rowKeyExtractor,
    onViewableItemsChanged: rowOnViewableItemsChanged,
    viewabilityConfigCallbackPairs: rowViewabilityPairs,
    ItemSeparatorComponent: rowSeparatorComponent,
    ...rest,
  });
}
