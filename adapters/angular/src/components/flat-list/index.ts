// FlatList, the Angular convenience surface over VirtualizedList. It takes a plain `data` array
// and derives getItem/getItemCount; numColumns packs items into rows (each row a flex-row of N
// columns), so the virtualized stream is rows, not items (RN's FlatList). All windowing /
// viewability / batching / imperative scrolling are inherited from VirtualizedList; the data
// shaping (chunkIntoRows / rowKeyExtractor / expandRowViewability / row-separator unwrap) is shared
// verbatim from @symbiotejs/components, exactly as the React and Vue FlatLists reuse it. This is the
// Angular twin of adapters/vue/src/components/flat-list/index.ts.
//
// TEMPLATE FORWARDING — both paths RE-STAMP; neither uses a bare `<ng-content>` passthrough.
// Angular's @ContentChild does NOT resolve a directive across a SECOND `<ng-content>` re-projection
// hop (it only sees what was projected directly onto the querying component's own tag) — a bare
// `<VirtualizedList ...><ng-content></ng-content></VirtualizedList>` here left VirtualizedList's own
// itemDir/headerDir/etc. undefined, so every cell rendered empty (a real, confirmed device bug — see
// flat-list.test.ts). Fixed for both column modes the same way:
//   * Single column (numColumns <= 1): FlatList captures the app's `<ng-template vListItem>` (and
//     vListHeader/vListFooter/vListEmpty/vListSeparator) with its OWN @ContentChild — a single,
//     direct projection hop, which always resolves — then re-authors equivalent `<ng-template>`s on
//     `<VirtualizedList>`, each forwarding the captured templateRef + context through
//     VListOutletDirective. Item/index/separators pass through 1:1 (no row wrapping).
//   * Multi column (numColumns > 1): the same re-stamp, but the app's vListItem is typed for ItemT
//     while the virtualized stream is rows (IRow<ItemT>), so a plain passthrough couldn't work even if
//     the projection issue didn't exist. The row vListItem lays out the N columns side by side (each
//     cell stamps the app's item template via VListOutletDirective with the per-item context {item,
//     index: row.startIndex + column, separators}), the row vListSeparator unwraps the flanking rows
//     to their last/first item, and onViewableItemsChanged is wrapped with expandRowViewability so the
//     caller still sees per-item visibility. This mirrors exactly how Vue's FlatList intercepts
//     renderItem with renderRow.
//
// The imperative handle (scrollToIndex / scrollToOffset / scrollToEnd / scrollToItem /
// recordInteraction / flashScrollIndicators / getScroll* / getNativeScrollRef) is RN's FlatList
// surface; FlatList re-exposes it by delegating to the inner VirtualizedList (@ViewChild). The
// element-returning props (renderItem / ItemSeparatorComponent / List{Header,Footer,Empty}Component)
// are templates in Angular, so they are absent from IFlatListProps, per the per-adapter
// children/render split of <prop_types_split_agnostic_vs_per_adapter>; everything agnostic mirrors
// IVirtualizedListProps.

import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  ContentChild,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
  inject,
  type OnChanges,
  type SimpleChanges,
} from '@angular/core';
import {
  SINGLE_COLUMN,
  chunkIntoRows,
  expandRowViewability,
  firstItemOfRow,
  lastItemOfRow,
  rowKeyExtractor,
  type IRow,
  type IScrollViewHandle,
  type ISeparators,
  type IViewabilityConfigCallbackPair,
  type IViewableItemsChangedInfo,
  type IVirtualizedListHandle,
} from '@symbiotejs/components';
import {
  dlog,
  flattenStyle,
  resolveClassName,
  type IStyleProp,
  type ISymbioteNode,
  type IViewStyle,
} from '@symbiotejs/engine';
import {
  VirtualizedList,
  VListEmptyDirective,
  VListFooterDirective,
  VListHeaderDirective,
  VListItemDirective,
  VListSeparatorDirective,
  type IVirtualizedListProps,
  type IVListItemContext,
  type IVListSeparatorContext,
} from '../virtualized-list';
import { VListOutletDirective } from '../virtualized-list/directives';
import { stableAnchorStyle, ViewHost } from '../../primitives';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function isRow<ItemT>(value: unknown): value is IRow<ItemT> {
  return (
    isRecord(value) && Array.isArray(value['items']) && typeof value['startIndex'] === 'number'
  );
}
function isSeparators(value: unknown): value is ISeparators {
  return (
    isRecord(value) &&
    typeof value['highlight'] === 'function' &&
    typeof value['unhighlight'] === 'function'
  );
}
// Used only as a type-safe fallback if a row's separators handle is ever absent; VirtualizedList
// always supplies a real one, so in practice the live handle flows through.
const NOOP_SEPARATORS: ISeparators = {
  highlight: (): void => undefined,
  unhighlight: (): void => undefined,
  updateProps: (): void => undefined,
};

// Angular cannot preserve VListSeparatorDirective<ItemT>'s type parameter across this re-stamp
// reuse (the directive is matched structurally in FlatList's own template with no explicit type
// argument to pin ItemT to, so `let-leadingItem`/`let-trailingItem` arrive typed `unknown`) — even
// though VirtualizedList's own buildSeparatorContext always supplies a real ItemT value. The
// narrowest possible I/O-boundary cast for that gap; not a general-purpose unknown-to-T narrowing.
function asItem<ItemT>(value: unknown): ItemT | undefined {
  return value as ItemT | undefined;
}

// Re-export the shared list types + the authoring directives so the app can import the cell/slot
// directives alongside FlatList (mirrors how virtualized-list/index re-exports them).
export type {
  ISeparators,
  IViewableItemsChangedInfo,
  IViewabilityConfigCallbackPair,
  IVirtualizedListHandle,
} from '@symbiotejs/components';
export {
  VListEmptyDirective,
  VListFooterDirective,
  VListHeaderDirective,
  VListItemDirective,
  VListSeparatorDirective,
} from '../virtualized-list';
export type { IVListItemContext, IVListSeparatorContext } from '../virtualized-list';

// FlatList's imperative handle is exactly VirtualizedList's.
export type IFlatListHandle = IVirtualizedListHandle;

// The Angular FlatList prop surface. Mirrors React/Vue's IFlatListProps: every agnostic
// VirtualizedList prop EXCEPT data/getItem/getItemCount (FlatList derives those from a plain `data`
// array), PLUS numColumns + columnWrapperStyle. The element-returning props are templates in
// Angular, so they are absent here (they were already absent from IVirtualizedListProps).
export type IFlatListProps<ItemT> = Omit<
  IVirtualizedListProps<ItemT>,
  'data' | 'getItem' | 'getItemCount'
> & {
  data: readonly ItemT[];
  numColumns?: number;
  // Style for the auto-generated row View when numColumns > 1 (RN's columnWrapperStyle). A bare
  // string resolves through the shared style registry.
  columnWrapperStyle?: IStyleProp<IViewStyle> | string;
};

// What the FlatList component itself takes as plain @Input()s: the full surface minus the events
// it exposes as real @Output() EventEmitters instead (see the class below), mirroring how
// pressable/index.ts derives IAngularPressableInputs from IAngularPressableProps.
export type IFlatListInputs<ItemT> = Omit<
  IFlatListProps<ItemT>,
  | 'onEndReached'
  | 'onStartReached'
  | 'onRefresh'
  | 'onViewableItemsChanged'
  | 'onScrollToIndexFailed'
>;

@Component({
  selector: 'FlatList',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [
    VirtualizedList,
    VListItemDirective,
    VListHeaderDirective,
    VListFooterDirective,
    VListEmptyDirective,
    VListSeparatorDirective,
    VListOutletDirective,
    ViewHost,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isMultiColumn) {
      <VirtualizedList
        [data]="rows"
        [getItem]="getRow"
        [getItemCount]="getRowCount"
        [keyExtractor]="rowKey"
        [getItemLayout]="getItemLayout"
        [horizontal]="horizontal"
        [inverted]="inverted"
        [extraData]="extraData"
        (endReached)="endReached.emit($event)"
        [onEndReachedThreshold]="onEndReachedThreshold"
        (startReached)="startReached.emit($event)"
        [onStartReachedThreshold]="onStartReachedThreshold"
        (refresh)="refresh.emit()"
        [refreshRequested]="refresh.observed"
        [refreshing]="refreshing"
        [progressViewOffset]="progressViewOffset"
        (viewableItemsChanged)="rowViewableItemsChanged($event)"
        [viewabilityConfig]="viewabilityConfig"
        [viewabilityConfigCallbackPairs]="rowViewabilityPairs"
        (scrollToIndexFailed)="scrollToIndexFailed.emit($event)"
        [initialNumToRender]="initialNumToRender"
        [initialScrollIndex]="initialScrollIndex"
        [maxToRenderPerBatch]="maxToRenderPerBatch"
        [updateCellsBatchingPeriod]="updateCellsBatchingPeriod"
        [windowSize]="windowSize"
        [stickyHeaderIndices]="stickyHeaderIndices"
        [maintainVisibleContentPosition]="maintainVisibleContentPosition"
        [onScroll]="onScroll"
        [onScrollBeginDrag]="onScrollBeginDrag"
        [onScrollEndDrag]="onScrollEndDrag"
        [onMomentumScrollBegin]="onMomentumScrollBegin"
        [onMomentumScrollEnd]="onMomentumScrollEnd"
        [scrollEventThrottle]="scrollEventThrottle"
        [keyboardShouldPersistTaps]="keyboardShouldPersistTaps"
        [keyboardDismissMode]="keyboardDismissMode"
        [style]="resolvedStyle"
        [contentContainerStyle]="contentContainerStyle"
      >
        <ng-template vListItem let-row let-separators="separators">
          <symbiote-view [style]="rowStyle">
            @for (cell of rowCells(row, separators); track cell.key) {
              <symbiote-view [style]="columnCellStyle">
                <ng-container
                  [vListOutlet]="itemDir?.templateRef"
                  [vListOutletContext]="cell.context"
                ></ng-container>
              </symbiote-view>
            }
          </symbiote-view>
        </ng-template>
        @if (headerDir !== undefined) {
          <ng-template vListHeader>
            <ng-container [vListOutlet]="headerDir.templateRef"></ng-container>
          </ng-template>
        }
        @if (footerDir !== undefined) {
          <ng-template vListFooter>
            <ng-container [vListOutlet]="footerDir.templateRef"></ng-container>
          </ng-template>
        }
        @if (emptyDir !== undefined) {
          <ng-template vListEmpty>
            <ng-container [vListOutlet]="emptyDir.templateRef"></ng-container>
          </ng-template>
        }
        @if (separatorDir !== undefined) {
          <ng-template
            vListSeparator
            let-highlighted="highlighted"
            let-leadingItem="leadingItem"
            let-trailingItem="trailingItem"
          >
            <ng-container
              [vListOutlet]="separatorDir.templateRef"
              [vListOutletContext]="rowSeparatorContext(highlighted, leadingItem, trailingItem)"
            ></ng-container>
          </ng-template>
        }
      </VirtualizedList>
    } @else {
      <VirtualizedList
        [data]="data"
        [getItem]="getFlatItem"
        [getItemCount]="getFlatCount"
        [keyExtractor]="keyExtractor"
        [getItemLayout]="getItemLayout"
        [horizontal]="horizontal"
        [inverted]="inverted"
        [extraData]="extraData"
        (endReached)="endReached.emit($event)"
        [onEndReachedThreshold]="onEndReachedThreshold"
        (startReached)="startReached.emit($event)"
        [onStartReachedThreshold]="onStartReachedThreshold"
        (refresh)="refresh.emit()"
        [refreshRequested]="refresh.observed"
        [refreshing]="refreshing"
        [progressViewOffset]="progressViewOffset"
        (viewableItemsChanged)="viewableItemsChanged.emit($event)"
        [viewabilityConfig]="viewabilityConfig"
        [viewabilityConfigCallbackPairs]="viewabilityConfigCallbackPairs"
        (scrollToIndexFailed)="scrollToIndexFailed.emit($event)"
        [initialNumToRender]="initialNumToRender"
        [initialScrollIndex]="initialScrollIndex"
        [maxToRenderPerBatch]="maxToRenderPerBatch"
        [updateCellsBatchingPeriod]="updateCellsBatchingPeriod"
        [windowSize]="windowSize"
        [stickyHeaderIndices]="stickyHeaderIndices"
        [maintainVisibleContentPosition]="maintainVisibleContentPosition"
        [onScroll]="onScroll"
        [onScrollBeginDrag]="onScrollBeginDrag"
        [onScrollEndDrag]="onScrollEndDrag"
        [onMomentumScrollBegin]="onMomentumScrollBegin"
        [onMomentumScrollEnd]="onMomentumScrollEnd"
        [scrollEventThrottle]="scrollEventThrottle"
        [keyboardShouldPersistTaps]="keyboardShouldPersistTaps"
        [keyboardDismissMode]="keyboardDismissMode"
        [style]="resolvedStyle"
        [contentContainerStyle]="contentContainerStyle"
      >
        <ng-template vListItem let-item let-index="index" let-separators="separators">
          <ng-container
            [vListOutlet]="itemDir?.templateRef"
            [vListOutletContext]="{ $implicit: item, index, separators }"
          ></ng-container>
        </ng-template>
        @if (headerDir !== undefined) {
          <ng-template vListHeader>
            <ng-container [vListOutlet]="headerDir.templateRef"></ng-container>
          </ng-template>
        }
        @if (footerDir !== undefined) {
          <ng-template vListFooter>
            <ng-container [vListOutlet]="footerDir.templateRef"></ng-container>
          </ng-template>
        }
        @if (emptyDir !== undefined) {
          <ng-template vListEmpty>
            <ng-container [vListOutlet]="emptyDir.templateRef"></ng-container>
          </ng-template>
        }
        @if (separatorDir !== undefined) {
          <ng-template
            vListSeparator
            let-highlighted="highlighted"
            let-leadingItem="leadingItem"
            let-trailingItem="trailingItem"
          >
            <ng-container
              [vListOutlet]="separatorDir.templateRef"
              [vListOutletContext]="itemSeparatorContext(highlighted, leadingItem, trailingItem)"
            ></ng-container>
          </ng-template>
        }
      </VirtualizedList>
    }
  `,
})
export class FlatList<ItemT = unknown>
  implements IFlatListInputs<ItemT>, IVirtualizedListHandle, OnChanges
{
  // The list's edge/viewability/failure events as real Angular events: `(endReached)="…"`, not
  // `[onEndReached]="…"` — re-emitted straight from the inner VirtualizedList's own @Output()s (see
  // the template's `(endReached)="endReached.emit($event)"` style forwarding above).
  @Output() readonly endReached = new EventEmitter<{ distanceFromEnd: number }>();
  @Output() readonly startReached = new EventEmitter<{ distanceFromStart: number }>();
  @Output() readonly refresh = new EventEmitter<void>();
  @Output() readonly viewableItemsChanged = new EventEmitter<IViewableItemsChangedInfo<ItemT>>();
  @Output() readonly scrollToIndexFailed = new EventEmitter<{
    index: number;
    highestMeasuredFrameIndex: number;
    averageItemLength: number;
  }>();
  @Input({ required: true }) data!: readonly ItemT[];
  @Input() numColumns?: number;
  @Input() columnWrapperStyle?: IStyleProp<IViewStyle> | string;
  @Input() keyExtractor?: (item: ItemT, index: number) => string;
  @Input() getItemLayout?: (
    data: unknown,
    index: number,
  ) => { length: number; offset: number; index: number };
  @Input() horizontal?: boolean;
  @Input() inverted?: boolean;
  @Input() extraData?: unknown;
  @Input() onEndReachedThreshold?: number;
  @Input() onStartReachedThreshold?: number;
  @Input() refreshing?: boolean | null;
  @Input() progressViewOffset?: number;
  @Input() viewabilityConfig?: IVirtualizedListProps<ItemT>['viewabilityConfig'];
  @Input() viewabilityConfigCallbackPairs?: IViewabilityConfigCallbackPair<ItemT>[];
  @Input() initialNumToRender?: number;
  @Input() initialScrollIndex?: number;
  @Input() maxToRenderPerBatch?: number;
  @Input() updateCellsBatchingPeriod?: number;
  @Input() windowSize?: number;
  @Input() stickyHeaderIndices?: number[];
  @Input() maintainVisibleContentPosition?: {
    minIndexForVisible: number;
    autoscrollToTopThreshold?: number;
  };
  @Input() onScroll?: IVirtualizedListProps<ItemT>['onScroll'];
  @Input() onScrollBeginDrag?: IVirtualizedListProps<ItemT>['onScrollBeginDrag'];
  @Input() onScrollEndDrag?: IVirtualizedListProps<ItemT>['onScrollEndDrag'];
  @Input() onMomentumScrollBegin?: IVirtualizedListProps<ItemT>['onMomentumScrollBegin'];
  @Input() onMomentumScrollEnd?: IVirtualizedListProps<ItemT>['onMomentumScrollEnd'];
  @Input() scrollEventThrottle?: number;
  @Input() keyboardShouldPersistTaps?: boolean | 'always' | 'never' | 'handled';
  @Input() keyboardDismissMode?: 'none' | 'on-drag' | 'interactive';
  @Input() style?: IStyleProp<IViewStyle>;
  @Input() contentContainerStyle?: IStyleProp<IViewStyle>;

  // The app's cell + slot templates, captured for the multi-column re-stamp path. In the
  // single-column path they are ALSO projected through <ng-content> to the inner list and these
  // captures stay unused (the inner list's own @ContentChild resolves them across the projection).
  @ContentChild(VListItemDirective) itemDir?: VListItemDirective<ItemT>;
  @ContentChild(VListHeaderDirective) headerDir?: VListHeaderDirective;
  @ContentChild(VListFooterDirective) footerDir?: VListFooterDirective;
  @ContentChild(VListEmptyDirective) emptyDir?: VListEmptyDirective;
  @ContentChild(VListSeparatorDirective) separatorDir?: VListSeparatorDirective<ItemT>;

  // The composed inner list (whichever numColumns branch rendered). Its instance IS the
  // IVirtualizedListHandle, so FlatList's handle delegates straight to it.
  @ViewChild(VirtualizedList) private listRef?: VirtualizedList;

  // This component's OWN host — the non-painting anchor `class="..."` at the use site resolves
  // onto (see anchorHostStyle's doc comment) — NOT `listRef` above, which targets the real inner
  // `<VirtualizedList>` one level down (itself its own separate anchor host).
  private readonly elementRef = inject(ElementRef);

  // --- derived view state (recomputed in ngOnChanges, stable identity across CD) ---
  rows: IRow<ItemT>[] = [];
  // Angular's [style]="…" binding compiles to the built-in ɵɵstyleMap instruction (NOT a
  // regular @Input() property write), which only understands a flat object — an array (RN's
  // own `style={[a, b]}` composition idiom) crashes deep inside Angular's styling engine. So
  // every style value this component stamps onto a template `[style]=` binding is flattened
  // via the engine's own flattenStyle first, here at the source rather than at each call site.
  rowStyle: IViewStyle = flattenStyle([{ flexDirection: 'row' }]);
  rowViewabilityPairs?: IViewabilityConfigCallbackPair<IRow<ItemT>>[];
  readonly columnCellStyle: IViewStyle = { flex: 1 };
  resolvedStyle: IViewStyle | undefined = undefined;

  get columns(): number {
    return this.numColumns ?? SINGLE_COLUMN;
  }
  get isMultiColumn(): boolean {
    return this.columns > SINGLE_COLUMN;
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Recomputed on EVERY ngOnChanges call, not gated on `changes['style']`: a class= on the
    // FlatList use site (no matching [style] binding at all) never appears in `changes`, so a
    // guard here would permanently skip picking up anchorHostStyle for that (the actual bug-report
    // shape) — ngOnChanges still fires at least once at mount via the required `data` @Input(), and
    // by then the anchor's class-derived style is already resolved synchronously (routeProp runs
    // inline from Renderer2.addClass, before this component's own lifecycle hooks). stableAnchorStyle
    // (not a bare flattenStyle) keeps `resolvedStyle`'s REFERENCE stable across ticks where nothing
    // actually changed — `[style]="resolvedStyle"` binds onto VirtualizedList's own `@Input() style`,
    // which feeds its `ngDoCheck` dedup gate; a fresh object every tick would defeat that gate and
    // free-run change detection forever (see stableAnchorStyle's doc comment).
    this.resolvedStyle = stableAnchorStyle(this.elementRef, this.style, this.resolvedStyle);
    if (changes['columnWrapperStyle'] !== undefined) {
      // A class-name string resolves through the shared registry before flattenStyle, which
      // only understands style objects/arrays.
      const resolvedColumnWrapperStyle =
        typeof this.columnWrapperStyle === 'string'
          ? resolveClassName(this.columnWrapperStyle)
          : this.columnWrapperStyle;
      this.rowStyle = flattenStyle([{ flexDirection: 'row' }, resolvedColumnWrapperStyle]);
    }
    if (changes['data'] !== undefined || changes['numColumns'] !== undefined) {
      this.rows = this.isMultiColumn ? chunkIntoRows(this.data, this.columns) : [];
      dlog(`Angular FlatList over ${this.data?.length ?? 0} items, ${this.columns} column(s)`);
    }
    if (
      changes['viewabilityConfigCallbackPairs'] !== undefined ||
      changes['numColumns'] !== undefined
    ) {
      this.rowViewabilityPairs = this.buildRowViewabilityPairs();
    }
  }

  // ---- single-column data adaptation (plain array -> getItem/getItemCount) ----
  getFlatItem = (_data: unknown, index: number): ItemT => this.data[index];
  getFlatCount = (_data: unknown): number => this.data.length;

  // ---- multi-column data adaptation (the virtualized stream is rows) ----
  getRow = (_data: unknown, index: number): IRow<ItemT> => this.rows[index];
  getRowCount = (_data: unknown): number => this.rows.length;
  rowKey = (row: IRow<ItemT>, _index: number): string => rowKeyExtractor(row);

  // Viewability over rows expands back to per-item tokens, so the caller sees item-level
  // visibility, not row-level (shared expandRowViewability), matching Vue.
  rowViewableItemsChanged = (info: IViewableItemsChangedInfo<IRow<ItemT>>): void => {
    this.viewableItemsChanged.emit(expandRowViewability(info, this.keyExtractor));
  };

  private buildRowViewabilityPairs(): IViewabilityConfigCallbackPair<IRow<ItemT>>[] | undefined {
    return this.viewabilityConfigCallbackPairs?.map(pair => ({
      viewabilityConfig: pair.viewabilityConfig,
      onViewableItemsChanged: (rowInfo: IViewableItemsChangedInfo<IRow<ItemT>>): void => {
        pair.onViewableItemsChanged?.(expandRowViewability(rowInfo, this.keyExtractor));
      },
    }));
  }

  // Lay out one row's N columns: every item shares the row's separators handle (the divider sits
  // between rows, not columns) and carries its absolute index (row.startIndex + column), like RN's
  // multi-column FlatList. Args arrive `unknown` from the template's `let` bindings (Angular cannot
  // type a generic structural directive's context), narrowed here — no `as`.
  rowCells(
    row: unknown,
    separators: unknown,
  ): { key: string; context: IVListItemContext<ItemT> }[] {
    if (!isRow<ItemT>(row)) return [];
    const handle = isSeparators(separators) ? separators : NOOP_SEPARATORS;
    return row.items.map((item, column) => {
      const index = row.startIndex + column;
      const key = this.keyExtractor ? this.keyExtractor(item, index) : String(index);
      return { key, context: { $implicit: item, index, separators: handle } };
    });
  }

  // The divider between rows shows real items (last of the row above, first of the row below), so the
  // app's separator template, typed on ItemT, sees items rather than the IRow wrapper. Args arrive
  // `unknown` from the template's `let` bindings, narrowed here.
  rowSeparatorContext(
    highlighted: unknown,
    leadingRow: unknown,
    trailingRow: unknown,
  ): IVListSeparatorContext<ItemT> {
    const isHighlighted = highlighted === true;
    return {
      $implicit: isHighlighted,
      highlighted: isHighlighted,
      leadingItem: isRow<ItemT>(leadingRow) ? lastItemOfRow(leadingRow) : undefined,
      trailingItem: isRow<ItemT>(trailingRow) ? firstItemOfRow(trailingRow) : undefined,
    };
  }

  // Single-column separator context: leadingItem/trailingItem are already real items (no row
  // wrapper to narrow through — see the asItem boundary comment above).
  itemSeparatorContext(
    highlighted: unknown,
    leadingItem: unknown,
    trailingItem: unknown,
  ): IVListSeparatorContext<ItemT> {
    const isHighlighted = highlighted === true;
    return {
      $implicit: isHighlighted,
      highlighted: isHighlighted,
      leadingItem: asItem<ItemT>(leadingItem),
      trailingItem: asItem<ItemT>(trailingItem),
    };
  }

  // ---- imperative handle (RN FlatList surface) — delegates to the inner VirtualizedList ----

  scrollToOffset(params: { offset: number; animated?: boolean }): void {
    this.listRef?.scrollToOffset(params);
  }
  scrollToIndex(params: {
    index: number;
    animated?: boolean;
    viewOffset?: number;
    viewPosition?: number;
  }): void {
    this.listRef?.scrollToIndex(params);
  }
  scrollToItem(params: { item: unknown; animated?: boolean; viewPosition?: number }): void {
    this.listRef?.scrollToItem(params);
  }
  scrollToEnd(params?: { animated?: boolean }): void {
    this.listRef?.scrollToEnd(params);
  }
  flashScrollIndicators(): void {
    this.listRef?.flashScrollIndicators();
  }
  getNativeScrollRef(): IScrollViewHandle | null {
    return this.listRef?.getNativeScrollRef() ?? null;
  }
  getScrollableNode(): IScrollViewHandle | null {
    return this.listRef?.getScrollableNode() ?? null;
  }
  getScrollResponder(): IScrollViewHandle | null {
    return this.listRef?.getScrollResponder() ?? null;
  }
  getScrollNode(): ISymbioteNode | null {
    return this.listRef?.getScrollNode() ?? null;
  }
  recordInteraction(): void {
    this.listRef?.recordInteraction();
  }
}
