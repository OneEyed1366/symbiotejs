// FlatList, the Vue convenience surface over VirtualizedList. It takes a plain `data` array
// and derives getItem/getItemCount; numColumns packs items into rows (a horizontal sub-View),
// so the virtualized stream is rows, not items (RN's FlatList). All windowing / viewability /
// batching / imperative scrolling are inherited from VirtualizedList; the data shaping and the
// row/viewability/separator transforms are shared from @symbiote/components.
//
// This is the FIRST generic component on the typed-emits pattern (the symbiote port of pd-web-kit):
// a GENERIC setup function `<ItemT,>(props, ctx: ICtx<IFlatListEmits<ItemT>>)` so the events emit
// with ItemT-typed payloads (`@viewable-items-changed` carries `ItemT`, not `unknown`). For that to
// infer at the call site, the generic INPUTS (data/renderItem/keyExtractor/…) must be typed `props`,
// not `$attrs` — so they are declared in the runtime `props` array; the long passthrough tail
// (horizontal/inverted/style/getItemLayout/raw scroll/…) still rides through `$attrs` onto the inner
// VirtualizedList. The inner list still GATES RefreshControl + viewability on callback presence, so
// each emit bridge is wired to it ONLY when the consumer actually listens (read off the instance
// vnode props), keeping behavior identical to the prop-callback era.

import {
  defineComponent,
  getCurrentInstance,
  h,
  shallowRef,
  type FunctionalComponent,
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
import {
  dlog,
  resolveClassName,
  type ISymbioteNode,
  type IStyleProp,
  type IViewStyle,
} from '@symbiote/engine';
import { VirtualizedList } from '../virtualized-list';
import { normalizeVueAttrs } from '../../utils/normalize-attrs';
import type { ICtx } from '../../utils/component-helpers';

// VirtualizedList is itself a generic component (generic construct signature), which h()'s overloads
// can't resolve. Drive it through a loose functional-component handle (generic-component h()
// limitation — the ItemT surface is proven at the typed FlatList boundary above).
const VirtualizedListHost = VirtualizedList as unknown as FunctionalComponent<
  Record<string, unknown>
>;

// FlatList's imperative handle is exactly VirtualizedList's.
export type IFlatListHandle = IVirtualizedListHandle;

export interface IFlatListProps<ItemT> {
  data: readonly ItemT[];
  // The cell renderer + separator are Vue scoped slots (#item / #separator / #header / #footer /
  // #empty), typed by IFlatListSlots — not renderItem / ItemSeparatorComponent props (no duality
  // with the React surface). See utils/slots-to-render-props.
  keyExtractor?: (item: ItemT, index: number) => string;
  numColumns?: number;
  // A bare string is a class name, resolved through the shared style registry; a style
  // object/array flows through unchanged.
  columnWrapperStyle?: IStyleProp<IViewStyle> | string;
  viewabilityConfigCallbackPairs?: IViewabilityConfigCallbackPair<ItemT>[];
  // Plus every VirtualizedList passthrough prop (horizontal, inverted, getItemLayout, style, raw
  // scroll events, …), forwarded through $attrs onto the inner list. See IVirtualizedListProps.
  [key: string]: unknown;
}

// FlatList's scoped-slot surface mirrors VirtualizedList's: #item carries { item, index,
// separators } typed by ItemT (inferred from `data`); the chrome slots are forwarded down. In
// multi-column mode #item is invoked per cell inside a packed row, exactly as renderItem was.
export type IFlatListSlots<ItemT> = {
  item: (info: { item: ItemT; index: number; separators: ISeparators }) => VNode[] | VNode;
  separator?: (props: ISeparatorProps<ItemT>) => VNode[] | VNode;
  header?: () => VNode[] | VNode;
  footer?: () => VNode[] | VNode;
  empty?: () => VNode[] | VNode;
};

export type IFlatListEmits<ItemT> = {
  viewableItemsChanged: (info: IViewableItemsChangedInfo<ItemT>) => void;
  endReached: (info: { distanceFromEnd: number }) => void;
  startReached: (info: { distanceFromStart: number }) => void;
  refresh: () => void;
  scrollToIndexFailed: (info: {
    index: number;
    highestMeasuredFrameIndex: number;
    averageItemLength: number;
  }) => void;
};

// The typed inputs FlatList reads off `props`; everything else falls through $attrs onto the inner
// VirtualizedList. Listed for the runtime `props` declaration (keyof can't derive it: the index
// signature widens keyof to `string`).
const PROP_KEYS = [
  'data',
  'keyExtractor',
  'numColumns',
  'columnWrapperStyle',
  'viewabilityConfigCallbackPairs',
];

const EMIT_KEYS = [
  'viewableItemsChanged',
  'endReached',
  'startReached',
  'refresh',
  'scrollToIndexFailed',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isVirtualizedListHandle(value: unknown): value is IVirtualizedListHandle {
  return isRecord(value) && typeof value.scrollToOffset === 'function';
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

export const FlatList = defineComponent(
  <ItemT>(
    props: IFlatListProps<ItemT>,
    { attrs, expose, emit, slots }: ICtx<IFlatListEmits<ItemT>, IFlatListSlots<ItemT>>,
  ) => {
    const inner = shallowRef<IVirtualizedListHandle | null>(null);
    const setInner = (instance: unknown): void => {
      inner.value = isVirtualizedListHandle(instance) ? instance : null;
    };
    expose(buildDelegateHandle(() => inner.value));

    // VirtualizedList gates RefreshControl + viewability on callback presence, so a bridge is wired
    // ONLY when the consumer actually listens. Declared emits are stripped from $attrs, so read the
    // listener off the instance's own vnode props (what the parent passed) instead.
    const instance = getCurrentInstance();
    const listens = (onName: string): boolean => {
      const vnodeProps = instance?.vnode.props;
      return vnodeProps != null && typeof vnodeProps[onName] === 'function';
    };

    return () => {
      const data: readonly ItemT[] = Array.isArray(props.data) ? props.data : [];
      const keyExtractor = props.keyExtractor;
      const numColumns = typeof props.numColumns === 'number' ? props.numColumns : SINGLE_COLUMN;
      const viewabilityPairs = props.viewabilityConfigCallbackPairs;
      // The chrome slots ride straight down to the inner list; #item/#separator are forwarded as-is
      // for a single column and re-wrapped per cell for multi-column below.
      const chromeSlots = { header: slots.header, footer: slots.footer, empty: slots.empty };
      // The passthrough tail: declared props + declared emits' onX are already removed from $attrs,
      // so what's left is the VirtualizedList passthrough (kebab-folded for the inner list).
      const forwarded = normalizeVueAttrs(attrs);

      dlog(`Vue FlatList over ${data.length} items, ${numColumns} column(s)`);

      // The synthesized list events become VL handlers ONLY when listened, so the inner list keeps
      // gating (no parasitic RefreshControl / viewability work for an unlistened event).
      const endReached = listens('onEndReached')
        ? (info: { distanceFromEnd: number }): void => emit('endReached', info)
        : undefined;
      const startReached = listens('onStartReached')
        ? (info: { distanceFromStart: number }): void => emit('startReached', info)
        : undefined;
      const refresh = listens('onRefresh') ? (): void => emit('refresh') : undefined;
      const scrollToIndexFailed = listens('onScrollToIndexFailed')
        ? (info: {
            index: number;
            highestMeasuredFrameIndex: number;
            averageItemLength: number;
          }): void => emit('scrollToIndexFailed', info)
        : undefined;
      const wantsViewability = listens('onViewableItemsChanged');

      if (numColumns <= SINGLE_COLUMN) {
        const onViewableItemsChanged = wantsViewability
          ? (info: IViewableItemsChangedInfo<ItemT>): void => emit('viewableItemsChanged', info)
          : undefined;
        return h(
          VirtualizedListHost,
          {
            ...forwarded,
            ref: setInner,
            data,
            getItem: (_source: unknown, index: number): unknown => data[index],
            getItemCount: (): number => data.length,
            keyExtractor,
            onEndReached: endReached,
            onStartReached: startReached,
            onRefresh: refresh,
            onScrollToIndexFailed: scrollToIndexFailed,
            onViewableItemsChanged,
            viewabilityConfigCallbackPairs: viewabilityPairs,
          },
          // A single column forwards the consumer's slots untouched (#item info shape is identical).
          { ...chromeSlots, item: slots.item, separator: slots.separator },
        );
      }

      // Multi-column: the virtualized stream is rows. Each cell renders its items side by side
      // in a flex-row View so windowing accounts for whole rows.
      const rows = chunkIntoRows(data, numColumns);
      // A class-name string resolves through the shared style registry; an object/array is
      // already style-shaped and passes through as-is.
      const rowStyle: IStyleProp<IViewStyle> = [
        { flexDirection: 'row' },
        typeof props.columnWrapperStyle === 'string'
          ? resolveClassName(props.columnWrapperStyle)
          : isRecord(props.columnWrapperStyle) || Array.isArray(props.columnWrapperStyle)
            ? props.columnWrapperStyle
            : undefined,
      ];

      const rowItemSlot = (info: {
        item: IRow<ItemT>;
        index: number;
        separators: ISeparators;
      }): VNode[] => {
        const cells = info.item.items.map((item, column) => {
          const index = info.item.startIndex + column;
          const key = keyExtractor ? keyExtractor(item, index) : String(index);
          // The row IS the virtualized cell, so every item in it shares the row's separators
          // handle (the divider sits between rows, not columns), like RN's multi-column FlatList.
          return h(
            'symbiote-view',
            { key, style: { flex: 1 } },
            slots.item !== undefined
              ? slots.item({ item, index, separators: info.separators })
              : [],
          );
        });
        return [h('symbiote-view', { style: rowStyle }, cells)];
      };

      // Viewability over rows expands back to per-item tokens so the caller sees item-level
      // visibility, not row-level (shared expandRowViewability).
      const rowOnViewableItemsChanged = wantsViewability
        ? (rowInfo: IViewableItemsChangedInfo<IRow<ItemT>>): void =>
            emit('viewableItemsChanged', expandRowViewability(rowInfo, keyExtractor))
        : undefined;
      const rowViewabilityPairs = viewabilityPairs?.map(pair => ({
        viewabilityConfig: pair.viewabilityConfig,
        onViewableItemsChanged: (rowInfo: IViewableItemsChangedInfo<IRow<ItemT>>): void => {
          pair.onViewableItemsChanged?.(expandRowViewability(rowInfo, keyExtractor));
        },
      }));

      // The divider between rows shows real items (last of the row above, first of the row below),
      // so the user's #separator slot, typed on ItemT, sees items rather than the IRow wrapper.
      const rowSeparatorSlot =
        slots.separator === undefined
          ? undefined
          : (rowProps: ISeparatorProps<IRow<ItemT>>): VNode[] | VNode =>
              slots.separator!({
                ...rowProps,
                leadingItem: lastItemOfRow(rowProps.leadingItem),
                trailingItem: firstItemOfRow(rowProps.trailingItem),
              });

      return h(
        VirtualizedListHost,
        {
          ...forwarded,
          ref: setInner,
          data: rows,
          getItem: (_source: unknown, index: number): IRow<ItemT> => rows[index],
          getItemCount: (): number => rows.length,
          keyExtractor: rowKeyExtractor,
          onEndReached: endReached,
          onStartReached: startReached,
          onRefresh: refresh,
          onScrollToIndexFailed: scrollToIndexFailed,
          onViewableItemsChanged: rowOnViewableItemsChanged,
          viewabilityConfigCallbackPairs: rowViewabilityPairs,
        },
        { ...chromeSlots, item: rowItemSlot, separator: rowSeparatorSlot },
      );
    };
  },
  {
    name: 'FlatList',
    inheritAttrs: false,
    props: PROP_KEYS,
    emits: EMIT_KEYS,
  } as unknown as undefined,
);
