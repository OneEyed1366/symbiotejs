// FlatList, the Vue convenience surface over VirtualizedList. It takes a plain `data` array
// and derives getItem/getItemCount; numColumns packs items into rows (a horizontal sub-View),
// so the virtualized stream is rows, not items (RN's FlatList). All windowing / viewability /
// batching / imperative scrolling are inherited from VirtualizedList; the data shaping and the
// row/viewability/separator transforms are shared from @symbiote/components. This file only
// wires Vue lifecycle (attrs narrowing + the handle re-expose) onto that shared logic. The Vue
// twin of the React adapter's FlatList.

import {
  defineComponent,
  h,
  isVNode,
  shallowRef,
  type Component,
  type SetupContext,
  type VNode,
} from '@vue/runtime-core';
import {
  SINGLE_COLUMN,
  chunkIntoRows,
  expandRowViewability,
  firstItemOfRow,
  lastItemOfRow,
  rowKeyExtractor,
  type IRow,
  type ISeparatorProps,
  type ISeparators,
  type IViewabilityConfigCallbackPair,
  type IViewableItemsChangedInfo,
  type IVirtualizedListHandle,
  type IScrollViewHandle,
} from '@symbiote/components';
import { dlog, type ISymbioteNode, type IStyleProp, type IViewStyle } from '@symbiote/engine';
import { VirtualizedList } from '../virtualized-list';
import { normalizeVueAttrs } from '../normalize-attrs';

// FlatList's imperative handle is exactly VirtualizedList's.
export type IFlatListHandle = IVirtualizedListHandle;

type IRenderItem<ItemT> = (info: {
  item: ItemT;
  index: number;
  separators: ISeparators;
}) => VNode | undefined;

export interface IFlatListProps<ItemT> {
  data: readonly ItemT[];
  renderItem: IRenderItem<ItemT>;
  keyExtractor?: (item: ItemT, index: number) => string;
  numColumns?: number;
  columnWrapperStyle?: IStyleProp<IViewStyle>;
  ItemSeparatorComponent?: Component;
  onViewableItemsChanged?: (info: IViewableItemsChangedInfo<ItemT>) => void;
  viewabilityConfigCallbackPairs?: IViewabilityConfigCallbackPair<ItemT>[];
  // Plus every VirtualizedList prop, forwarded straight through (horizontal, inverted,
  // onEndReached, onRefresh, style, getItemLayout, …). See IVirtualizedListProps.
  [key: string]: unknown;
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
function isStyleProp(value: unknown): value is IStyleProp<IViewStyle> {
  return typeof value === 'object' && value !== null;
}
function isVirtualizedListHandle(value: unknown): value is IVirtualizedListHandle {
  return isRecord(value) && typeof value.scrollToOffset === 'function';
}

// The keys FlatList consumes/reshapes itself; everything else forwards onto VirtualizedList.
const HANDLED_ATTRS = [
  'data',
  'renderItem',
  'keyExtractor',
  'numColumns',
  'columnWrapperStyle',
  'onViewableItemsChanged',
  'viewabilityConfigCallbackPairs',
  'ItemSeparatorComponent',
];

function forwardAttrs(attrs: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(attrs)) {
    if (!HANDLED_ATTRS.includes(key)) result[key] = attrs[key];
  }
  return result;
}

// The handle FlatList exposes delegates to the inner VirtualizedList's handle (Vue resolves a
// parent ref to the exposed object, so the wrapper must re-expose rather than forward the ref).
function buildDelegateHandle(getInner: () => IVirtualizedListHandle | null): IFlatListHandle {
  return {
    scrollToOffset: params => getInner()?.scrollToOffset(params),
    scrollToIndex: params => getInner()?.scrollToIndex(params),
    scrollToItem: params => getInner()?.scrollToItem(params),
    scrollToEnd: params => getInner()?.scrollToEnd(params),
    flashScrollIndicators: () => getInner()?.flashScrollIndicators(),
    getNativeScrollRef: (): IScrollViewHandle | null => getInner()?.getNativeScrollRef() ?? null,
    getScrollableNode: (): IScrollViewHandle | null => getInner()?.getScrollableNode() ?? null,
    getScrollResponder: (): IScrollViewHandle | null => getInner()?.getScrollResponder() ?? null,
    getScrollNode: (): ISymbioteNode | null => getInner()?.getScrollNode() ?? null,
    recordInteraction: () => getInner()?.recordInteraction(),
  };
}

export const FlatList = defineComponent({
  name: 'FlatList',
  inheritAttrs: false,
  setup(_props, { attrs: rawAttrs, expose }: SetupContext) {
    const inner = shallowRef<IVirtualizedListHandle | null>(null);
    const setInner = (instance: unknown): void => {
      inner.value = isVirtualizedListHandle(instance) ? instance : null;
    };
    expose(buildDelegateHandle(() => inner.value));

    return () => {
      const attrs = normalizeVueAttrs(rawAttrs);
      const data = Array.isArray(attrs.data) ? attrs.data : [];
      const renderItemRaw = attrs.renderItem;
      const renderItem: IRenderItem<unknown> = isHandler(renderItemRaw)
        ? (info): VNode | undefined => {
            const node = renderItemRaw(info);
            return isVNode(node) ? node : undefined;
          }
        : (): undefined => undefined;
      const keyExtractorRaw = attrs.keyExtractor;
      const keyExtractor = isHandler(keyExtractorRaw)
        ? (item: unknown, index: number): string => {
            const key = keyExtractorRaw(item, index);
            return typeof key === 'string' ? key : String(index);
          }
        : undefined;
      const numColumns = typeof attrs.numColumns === 'number' ? attrs.numColumns : SINGLE_COLUMN;
      const itemSeparatorComponent = isComponent(attrs.ItemSeparatorComponent)
        ? attrs.ItemSeparatorComponent
        : undefined;
      const onViewableItemsChanged = isHandler(attrs.onViewableItemsChanged)
        ? attrs.onViewableItemsChanged
        : undefined;
      const viewabilityPairs = Array.isArray(attrs.viewabilityConfigCallbackPairs)
        ? attrs.viewabilityConfigCallbackPairs
        : undefined;
      const forwarded = forwardAttrs(attrs);

      dlog(`Vue FlatList over ${data.length} items, ${numColumns} column(s)`);

      if (numColumns <= SINGLE_COLUMN) {
        return h(VirtualizedList, {
          ...forwarded,
          ref: setInner,
          data,
          getItem: (_source: unknown, index: number): unknown => data[index],
          getItemCount: (): number => data.length,
          renderItem,
          keyExtractor,
          onViewableItemsChanged,
          viewabilityConfigCallbackPairs: viewabilityPairs,
          ItemSeparatorComponent: itemSeparatorComponent,
        });
      }

      // Multi-column: the virtualized stream is rows. Each cell renders its items side by side
      // in a flex-row View so windowing accounts for whole rows.
      const rows = chunkIntoRows(data, numColumns);
      const rowStyle: IStyleProp<IViewStyle> = [
        { flexDirection: 'row' },
        isStyleProp(attrs.columnWrapperStyle) ? attrs.columnWrapperStyle : undefined,
      ];

      const renderRow = (info: {
        item: IRow<unknown>;
        index: number;
        separators: ISeparators;
      }): VNode => {
        const cells = info.item.items.map((item, column) => {
          const index = info.item.startIndex + column;
          const key = keyExtractor ? keyExtractor(item, index) : String(index);
          // The row IS the virtualized cell, so every item in it shares the row's separators
          // handle (the divider sits between rows, not columns), like RN's multi-column FlatList.
          return h('symbiote-view', { key, style: { flex: 1 } }, [
            renderItem({ item, index, separators: info.separators }),
          ]);
        });
        return h('symbiote-view', { style: rowStyle }, cells);
      };

      // Viewability over rows expands back to per-item tokens so the caller sees item-level
      // visibility, not row-level (shared expandRowViewability).
      const rowOnViewableItemsChanged =
        onViewableItemsChanged !== undefined
          ? (rowInfo: IViewableItemsChangedInfo<IRow<unknown>>): void => {
              onViewableItemsChanged(expandRowViewability(rowInfo, keyExtractor));
            }
          : undefined;
      const rowViewabilityPairs = viewabilityPairs?.map(pair => {
        const config = isRecord(pair) ? pair.viewabilityConfig : undefined;
        const callback =
          isRecord(pair) && isHandler(pair.onViewableItemsChanged)
            ? pair.onViewableItemsChanged
            : undefined;
        return {
          viewabilityConfig: config,
          onViewableItemsChanged: (rowInfo: IViewableItemsChangedInfo<IRow<unknown>>): void => {
            if (callback !== undefined) callback(expandRowViewability(rowInfo, keyExtractor));
          },
        };
      });

      // The divider between rows shows real items (last of the row above, first of the row below),
      // so the user's separator, typed on ItemT, sees items rather than the IRow wrapper.
      const rowSeparatorComponent: Component | undefined =
        itemSeparatorComponent === undefined
          ? undefined
          : (rowProps: ISeparatorProps<IRow<unknown>>): VNode =>
              h(itemSeparatorComponent, {
                ...rowProps,
                leadingItem: lastItemOfRow(rowProps.leadingItem),
                trailingItem: firstItemOfRow(rowProps.trailingItem),
              });

      return h(VirtualizedList, {
        ...forwarded,
        ref: setInner,
        data: rows,
        getItem: (_source: unknown, index: number): IRow<unknown> => rows[index],
        getItemCount: (): number => rows.length,
        renderItem: renderRow,
        keyExtractor: rowKeyExtractor,
        onViewableItemsChanged: rowOnViewableItemsChanged,
        viewabilityConfigCallbackPairs: rowViewabilityPairs,
        ItemSeparatorComponent: rowSeparatorComponent,
      });
    };
  },
});
