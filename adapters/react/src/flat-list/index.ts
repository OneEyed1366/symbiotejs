// FlatList: the convenience surface over VirtualizedList. It takes a plain `data` array and
// derives getItem/getItemCount, so callers never touch the VirtualizedList data-access protocol.
// `numColumns` packs that many items into each row (a horizontal sub-View), so the virtualized
// stream is rows, not items (RN's FlatList). All windowing, viewability, batching, and imperative
// scrolling are inherited from VirtualizedList; the data shaping and the row/viewability/separator
// transforms are shared from @symbiote/components. This file only adapts to React's lifecycle
// (element creation + ref threading).

import {
  createElement,
  type ComponentType,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { dlog, type ISymbioteEvent } from '@symbiote/engine';
import {
  SINGLE_COLUMN,
  chunkIntoRows,
  expandRowViewability,
  firstItemOfRow,
  lastItemOfRow,
  rowKeyExtractor,
  type IRow,
} from '@symbiote/components';
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
  // Style for the auto-generated row View when numColumns > 1 (RN's columnWrapperStyle).
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
    // onViewableItemsChanged/viewability are typed against ItemT here; in the multi-column path
    // the underlying stream is IRow<ItemT>, so they are dropped from `rest` and pulled out.
    onViewableItemsChanged,
    viewabilityConfigCallbackPairs,
    // ItemSeparatorComponent is typed on ItemT; the multi-column stream is IRow<ItemT>, so it is
    // wrapped there to unwrap rows back to items, exactly like viewability above.
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

  // Multi-column: the virtualized stream is rows. Each cell renders its items side by side in a
  // flex-row View so windowing accounts for whole rows.
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
      // The row IS the virtualized cell, so every item in it shares the row's separators handle
      // (the divider sits between rows, not columns), like RN's multi-column FlatList.
      return createElement(
        'symbiote-view',
        { key, style: { flex: 1 } },
        renderItem({ item, index, separators: info.separators }),
      );
    });
    return createElement('symbiote-view', { style: rowStyle }, ...cells);
  };

  // Viewability over rows expands back to per-item tokens so the caller sees item-level
  // visibility, not row-level (shared expandRowViewability).
  const rowOnViewableItemsChanged =
    onViewableItemsChanged !== undefined
      ? (rowInfo: IViewableItemsChangedInfo<IRow<ItemT>>): void => {
          onViewableItemsChanged(expandRowViewability(rowInfo, keyExtractor));
        }
      : undefined;
  const rowViewabilityPairs = viewabilityConfigCallbackPairs?.map(pair => ({
    viewabilityConfig: pair.viewabilityConfig,
    onViewableItemsChanged: (rowInfo: IViewableItemsChangedInfo<IRow<ItemT>>): void => {
      pair.onViewableItemsChanged(expandRowViewability(rowInfo, keyExtractor));
    },
  }));

  // The divider between rows shows real items (last of the row above, first of the row below), so
  // the user's separator, typed on ItemT, sees items rather than the IRow wrapper.
  const rowSeparatorComponent: ComponentType<ISeparatorProps<IRow<ItemT>>> | undefined =
    ItemSeparatorComponent === undefined
      ? undefined
      : (rowProps): ReactNode =>
          createElement(ItemSeparatorComponent, {
            ...rowProps,
            leadingItem: lastItemOfRow(rowProps.leadingItem),
            trailingItem: firstItemOfRow(rowProps.trailingItem),
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
