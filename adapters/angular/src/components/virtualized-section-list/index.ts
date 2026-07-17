// VirtualizedSectionList, the Angular wrapper that flattens sections into one virtualized stream
// over VirtualizedList. Each section contributes a header row, its item rows, then a footer row
// (RN counts 2 per section); the flattened tagged sequence is fed to VirtualizedList as one list,
// so headers/items/footers are all windowed by the same machinery. The flattening, entry keying,
// separator-item unwrap, and scrollToLocation mapping are shared from @symbiote-native/components; this
// file wires Angular's lifecycle (typed @Input/@Output surface + the imperative handle + the
// per-cell-tag template dispatch). The Angular twin of the React/Vue adapters' VirtualizedSectionList.
//
// The KEY mechanic — per-cell-tag template dispatch. VirtualizedList renders every cell through ONE
// `vListItem` template, but a section list has DIFFERENT cell types (section header, item, section
// footer, between-section separators). So VSL supplies the inner list a SINGLE synthesized
// `vListItem` template that @switch-es on the flattened entry's tag and stamps the matching app
// template (captured via @ContentChild on the vSection* directives) through VListOutletDirective.
// list-level header/footer/empty/item-separator reuse VirtualizedList's own directives, forwarded
// the same way. Only the cell-AUTHORING shape is framework-specific; the rest of the surface
// stays shared with React/Vue.
//
// Accessibility / aria props are forwarded unchanged to the inner VirtualizedList, which owns the
// shared aria→accessibility* fold before the props reach the ScrollView host.

import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ContentChild,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
  inject,
  type DoCheck,
} from '@angular/core';
import {
  flattenSections,
  resolveStickySectionHeaders,
  scrollLocationToFlatIndex,
  sectionEntryKey,
  unwrapEntryItem,
  type IAccessibilityProps,
  type IAccessibilityStateValue,
  type IAriaProps,
  type ISection,
  type ISectionEntry,
  type ISeparators,
  type IScrollViewHandle,
  type IVirtualizedSectionListHandle,
} from '@symbiote-native/components';
import {
  Platform,
  dlog,
  type IStyleProp,
  type ISymbioteEvent,
  type ISymbioteNode,
  type IViewStyle,
} from '@symbiote-native/engine';
import {
  VirtualizedList,
  VListEmptyDirective,
  VListFooterDirective,
  VListHeaderDirective,
  VListItemDirective,
  VListSeparatorDirective,
  type IVListSeparatorContext,
} from '../virtualized-list';
import { VListOutletDirective } from '../virtualized-list/directives';
import { stableAnchorStyle } from '../../primitives';
import {
  VSectionFooterDirective,
  VSectionHeaderDirective,
  VSectionItemDirective,
  VSectionSeparatorDirective,
  type IVSectionContext,
  type IVSectionItemContext,
} from './directives';

export type { ISection } from '@symbiote-native/components';
// Re-export the shared handle type so section-list imports it from '../virtualized-section-list'.
export type { IVirtualizedSectionListHandle } from '@symbiote-native/components';
// Re-export the section authoring directives + their contexts so flat consumers (and SectionList)
// import them from '../virtualized-section-list', mirroring how VirtualizedList re-exports its own.
export {
  VSectionFooterDirective,
  VSectionHeaderDirective,
  VSectionItemDirective,
  VSectionSeparatorDirective,
} from './directives';
export type { IVSectionContext, IVSectionItemContext } from './directives';

// The Angular VirtualizedSectionList prop surface. Mirrors React/Vue's IVirtualizedSectionListProps
// MINUS the element-returning props (renderItem, renderSectionHeader/Footer, the *Component slots):
// those are the per-adapter children/render fields and become `<ng-template>` directives in Angular.
// Everything agnostic is the SAME surface as the
// React/Vue adapters, including the a11y/aria prop family forwarded through VirtualizedList.
export interface IVirtualizedSectionListProps<ItemT> extends IAccessibilityProps, IAriaProps {
  sections: ReadonlyArray<ISection<ItemT>>;
  keyExtractor?: (item: ItemT, index: number) => string;
  // Stick each section header to the top as the next section scrolls up. Routed to the inner
  // VirtualizedList's stickyHeaderIndices. Defaults to `Platform.OS === 'ios'`; Android does not
  // stick by default. Pass true/false to override.
  stickySectionHeadersEnabled?: boolean;
  extraData?: unknown;
  onEndReached?: (info: { distanceFromEnd: number }) => void;
  onEndReachedThreshold?: number;
  onStartReached?: (info: { distanceFromStart: number }) => void;
  onStartReachedThreshold?: number;
  onRefresh?: () => void;
  refreshing?: boolean | null;
  progressViewOffset?: number;
  initialNumToRender?: number;
  initialScrollIndex?: number;
  maxToRenderPerBatch?: number;
  updateCellsBatchingPeriod?: number;
  windowSize?: number;
  inverted?: boolean;
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

// What the VirtualizedSectionList component itself takes as plain @Input()s: the full surface
// minus the list-lifecycle events, which it exposes as real @Output() EventEmitters instead (see
// the class below) — mirrors IAngularPressableInputs in pressable/index.ts.
export type IVirtualizedSectionListInputs<ItemT> = Omit<
  IVirtualizedSectionListProps<ItemT>,
  | 'onEndReached'
  | 'onStartReached'
  | 'onRefresh'
  | 'onAccessibilityAction'
  | 'onAccessibilityTap'
  | 'onMagicTap'
  | 'onAccessibilityEscape'
>;

@Component({
  selector: 'VirtualizedSectionList',
  standalone: true,
  imports: [
    VirtualizedList,
    VListItemDirective,
    VListHeaderDirective,
    VListFooterDirective,
    VListEmptyDirective,
    VListSeparatorDirective,
    VListOutletDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <VirtualizedList
      [data]="flatEntries"
      [getItem]="getEntry"
      [getItemCount]="getEntryCount"
      [keyExtractor]="entryKeyExtractor"
      [stickyHeaderIndices]="stickyHeaderIndices"
      [extraData]="extraData"
      [inverted]="inverted"
      [refreshing]="refreshing"
      [progressViewOffset]="progressViewOffset"
      [refreshRequested]="refreshRequested ?? refresh.observed"
      (refresh)="resolvedOnRefresh?.()"
      (endReached)="resolvedOnEndReached?.($event)"
      [onEndReachedThreshold]="onEndReachedThreshold"
      (startReached)="resolvedOnStartReached?.($event)"
      [onStartReachedThreshold]="onStartReachedThreshold"
      [initialNumToRender]="initialNumToRender"
      [initialScrollIndex]="initialScrollIndex"
      [maxToRenderPerBatch]="maxToRenderPerBatch"
      [updateCellsBatchingPeriod]="updateCellsBatchingPeriod"
      [windowSize]="windowSize"
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
      [testID]="testID"
      [nativeID]="nativeID"
      [accessible]="accessible"
      [accessibilityLabel]="accessibilityLabel"
      [accessibilityHint]="accessibilityHint"
      [accessibilityRole]="accessibilityRole"
      [accessibilityState]="accessibilityState"
      [accessibilityValue]="accessibilityValue"
      [accessibilityActions]="accessibilityActions"
      [accessibilityLabelledBy]="accessibilityLabelledBy"
      [importantForAccessibility]="importantForAccessibility"
      [accessibilityLiveRegion]="accessibilityLiveRegion"
      [screenReaderFocusable]="screenReaderFocusable"
      [accessibilityViewIsModal]="accessibilityViewIsModal"
      [accessibilityElementsHidden]="accessibilityElementsHidden"
      [accessibilityIgnoresInvertColors]="accessibilityIgnoresInvertColors"
      [accessibilityLanguage]="accessibilityLanguage"
      [accessibilityRespondsToUserInteraction]="accessibilityRespondsToUserInteraction"
      [accessibilityShowsLargeContentViewer]="accessibilityShowsLargeContentViewer"
      [accessibilityLargeContentTitle]="accessibilityLargeContentTitle"
      (accessibilityAction)="resolvedOnAccessibilityAction?.($event)"
      (accessibilityTap)="resolvedOnAccessibilityTap?.($event)"
      (magicTap)="resolvedOnMagicTap?.($event)"
      (accessibilityEscape)="resolvedOnAccessibilityEscape?.($event)"
      [role]="role"
      [ariaLabel]="ariaLabel"
      [ariaLabelledBy]="ariaLabelledBy"
      [ariaLive]="ariaLive"
      [ariaHidden]="ariaHidden"
      [ariaBusy]="ariaBusy"
      [ariaChecked]="ariaChecked"
      [ariaDisabled]="ariaDisabled"
      [ariaExpanded]="ariaExpanded"
      [ariaSelected]="ariaSelected"
      [ariaModal]="ariaModal"
      [ariaValueMax]="ariaValueMax"
      [ariaValueMin]="ariaValueMin"
      [ariaValueNow]="ariaValueNow"
      [ariaValueText]="ariaValueText"
    >
      <!-- The single synthesized cell template: dispatch per flattened entry tag. -->
      <ng-template vListItem let-entry let-separators="separators">
        @switch (entryKind(entry)) {
          @case ('header') {
            <ng-container
              [vListOutlet]="sectionHeaderDir?.templateRef"
              [vListOutletContext]="sectionContextOf(entry)"
            ></ng-container>
          }
          @case ('footer') {
            <ng-container
              [vListOutlet]="sectionFooterDir?.templateRef"
              [vListOutletContext]="sectionContextOf(entry)"
            ></ng-container>
          }
          @case ('section-separator') {
            <ng-container [vListOutlet]="sectionSeparatorDir?.templateRef"></ng-container>
          }
          @case ('item') {
            <ng-container
              [vListOutlet]="sectionItemDir?.templateRef"
              [vListOutletContext]="itemContextOf(entry, separators)"
            ></ng-container>
          }
        }
      </ng-template>

      <!-- list-level slots: forward the app's VirtualizedList directives to the inner list. -->
      @if (listHeaderDir !== undefined) {
        <ng-template vListHeader>
          <ng-container [vListOutlet]="listHeaderDir.templateRef"></ng-container>
        </ng-template>
      }
      @if (listFooterDir !== undefined) {
        <ng-template vListFooter>
          <ng-container [vListOutlet]="listFooterDir.templateRef"></ng-container>
        </ng-template>
      }
      @if (listEmptyDir !== undefined) {
        <ng-template vListEmpty>
          <ng-container [vListOutlet]="listEmptyDir.templateRef"></ng-container>
        </ng-template>
      }
      <!-- item separator: forward, unwrapping each flattened entry back to its ItemT. -->
      @if (itemSeparatorDir !== undefined) {
        <ng-template
          vListSeparator
          let-highlighted
          let-leadingItem="leadingItem"
          let-trailingItem="trailingItem"
        >
          <ng-container
            [vListOutlet]="itemSeparatorDir.templateRef"
            [vListOutletContext]="itemSeparatorContextOf(highlighted, leadingItem, trailingItem)"
          ></ng-container>
        </ng-template>
      }
    </VirtualizedList>
  `,
})
export class VirtualizedSectionList<ItemT = unknown>
  implements IVirtualizedSectionListInputs<ItemT>, IVirtualizedSectionListHandle, DoCheck
{
  @Input({ required: true }) sections!: ReadonlyArray<ISection<ItemT>>;
  @Input() keyExtractor?: (item: ItemT, index: number) => string;
  @Input() stickySectionHeadersEnabled?: boolean;
  @Input() extraData?: unknown;
  @Output() readonly endReached = new EventEmitter<{ distanceFromEnd: number }>();
  @Input() onEndReachedThreshold?: number;
  @Output() readonly startReached = new EventEmitter<{ distanceFromStart: number }>();
  @Input() onStartReachedThreshold?: number;
  @Output() readonly refresh = new EventEmitter<void>();
  @Input() refreshing?: boolean | null;
  @Input() progressViewOffset?: number;
  // See VirtualizedList's own refreshRequested doc comment: `(refresh)="resolvedOnRefresh?.()"`
  // above always subscribes to the inner VirtualizedList's refresh output (to re-forward it),
  // which would otherwise make its `.observed` permanently true. SectionList passes ITS OWN
  // public `refresh.observed` here; direct usage falls back to this component's own `.observed`.
  @Input() refreshRequested?: boolean;
  @Input() initialNumToRender?: number;
  @Input() initialScrollIndex?: number;
  @Input() maxToRenderPerBatch?: number;
  @Input() updateCellsBatchingPeriod?: number;
  @Input() windowSize?: number;
  @Input() inverted?: boolean;
  @Input() maintainVisibleContentPosition?: {
    minIndexForVisible: number;
    autoscrollToTopThreshold?: number;
  };
  @Input() onScroll?: (event: ISymbioteEvent) => void;
  @Input() onScrollBeginDrag?: (event: ISymbioteEvent) => void;
  @Input() onScrollEndDrag?: (event: ISymbioteEvent) => void;
  @Input() onMomentumScrollBegin?: (event: ISymbioteEvent) => void;
  @Input() onMomentumScrollEnd?: (event: ISymbioteEvent) => void;
  @Input() scrollEventThrottle?: number;
  @Input() keyboardShouldPersistTaps?: boolean | 'always' | 'never' | 'handled';
  @Input() keyboardDismissMode?: 'none' | 'on-drag' | 'interactive';
  @Input() style?: IStyleProp<IViewStyle>;
  @Input() contentContainerStyle?: IStyleProp<IViewStyle>;
  @Input() testID?: string;
  @Input() nativeID?: string;

  // Bound to the template's `[style]="resolvedStyle"`, which Angular compiles to the built-in
  // ɵɵstyleMap instruction — it only understands a flat object, never an array (RN's own
  // `style={[a, b]}` composition idiom crashes deep inside Angular's styling engine), so this
  // flattens `style` via the engine's own flattenStyle before it ever reaches that binding.
  // anchorHostStyle merges in this component's OWN anchor's class-derived style (see its doc
  // comment) — `elementRef` below is VirtualizedSectionList's OWN host, not `list`'s inner
  // VirtualizedList. A plain `flattenStyle([...])` here would allocate a FRESH object on every
  // getter read, which — bound onto the inner VirtualizedList's own `@Input() style` — defeats
  // its `ngDoCheck` dedup gate and free-runs change detection forever (see stableAnchorStyle's
  // doc comment and the `flat-list-array-style.test.ts` regression it fixes).
  // `cachedResolvedStyle` is the getter's own persisted "previous" value across reads.
  private cachedResolvedStyle: Record<string, unknown> | undefined;
  get resolvedStyle(): IViewStyle {
    this.cachedResolvedStyle = stableAnchorStyle(
      this.elementRef,
      this.style,
      this.cachedResolvedStyle,
    );
    return this.cachedResolvedStyle;
  }
  @Input() accessible?: boolean;
  @Input() accessibilityLabel?: string;
  @Input() accessibilityHint?: string;
  @Input() accessibilityRole?: IAccessibilityProps['accessibilityRole'];
  @Input() accessibilityState?: IAccessibilityStateValue;
  @Input() accessibilityValue?: IAccessibilityProps['accessibilityValue'];
  @Input() accessibilityActions?: IAccessibilityProps['accessibilityActions'];
  @Input() accessibilityLabelledBy?: string | string[];
  @Input() importantForAccessibility?: IAccessibilityProps['importantForAccessibility'];
  @Input() accessibilityLiveRegion?: IAccessibilityProps['accessibilityLiveRegion'];
  @Input() screenReaderFocusable?: boolean;
  @Input() accessibilityViewIsModal?: boolean;
  @Input() accessibilityElementsHidden?: boolean;
  @Input() accessibilityIgnoresInvertColors?: boolean;
  @Input() accessibilityLanguage?: string;
  @Input() accessibilityRespondsToUserInteraction?: boolean;
  @Input() accessibilityShowsLargeContentViewer?: boolean;
  @Input() accessibilityLargeContentTitle?: string;
  @Output() readonly accessibilityAction = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityTap = new EventEmitter<ISymbioteEvent>();
  @Output() readonly magicTap = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityEscape = new EventEmitter<ISymbioteEvent>();
  @Input() role?: IAriaProps['role'];
  @Input() ariaLabel?: string;
  @Input() ariaLabelledBy?: string;
  @Input() ariaLive?: IAriaProps['aria-live'];
  @Input() ariaHidden?: boolean;
  @Input() ariaBusy?: boolean;
  @Input() ariaChecked?: boolean | 'mixed';
  @Input() ariaDisabled?: boolean;
  @Input() ariaExpanded?: boolean;
  @Input() ariaSelected?: boolean;
  @Input() ariaModal?: boolean;
  @Input() ariaValueMax?: number;
  @Input() ariaValueMin?: number;
  @Input() ariaValueNow?: number;
  @Input() ariaValueText?: string;

  // The section cell templates the app authors (the Angular twin of renderItem /
  // renderSectionHeader / renderSectionFooter / SectionSeparatorComponent), captured from projected
  // <ng-template> content and stamped by the synthesized vListItem dispatch.
  @ContentChild(VSectionItemDirective) sectionItemDir?: VSectionItemDirective<ItemT>;
  @ContentChild(VSectionHeaderDirective) sectionHeaderDir?: VSectionHeaderDirective<ItemT>;
  @ContentChild(VSectionFooterDirective) sectionFooterDir?: VSectionFooterDirective<ItemT>;
  @ContentChild(VSectionSeparatorDirective) sectionSeparatorDir?: VSectionSeparatorDirective;

  // list-level slots reuse VirtualizedList's own directives; VSL forwards them to the inner list.
  @ContentChild(VListHeaderDirective) listHeaderDir?: VListHeaderDirective;
  @ContentChild(VListFooterDirective) listFooterDir?: VListFooterDirective;
  @ContentChild(VListEmptyDirective) listEmptyDir?: VListEmptyDirective;
  @ContentChild(VListSeparatorDirective) itemSeparatorDir?: VListSeparatorDirective<ItemT>;

  // The composed inner VirtualizedList. Its instance IS an IVirtualizedListHandle, so the section
  // handle delegates straight to it. Available from ngAfterViewInit; reads lazily, no-ops pre-commit.
  @ViewChild(VirtualizedList) private list?: VirtualizedList<ISectionEntry<ItemT>>;

  // This component's OWN host — the non-painting anchor `class="..."` at the use site resolves
  // onto (see anchorHostStyle's doc comment) — NOT `list` above, which targets the real inner
  // `<VirtualizedList>` one level down (itself its own separate anchor host).
  private readonly elementRef = inject(ElementRef);

  // --- template-bound state, recomputed in ngDoCheck when sections / separator presence change ---
  flatEntries: ISectionEntry<ItemT>[] = [];
  stickyHeaderIndices: number[] | undefined = undefined;

  // headerIndices are the flat positions of every section header; scrollToLocation maps a
  // (sectionIndex, itemIndex) coordinate through them without re-deriving the flat layout.
  private headerIndices: number[] = [];
  // Memo guards so flattenSections does not re-run on every CD (the inner list marks for check on
  // every scroll tick, which re-runs VSL's ngDoCheck too).
  private lastSectionsRef: ReadonlyArray<ISection<ItemT>> | null = null;
  private lastHasSectionSeparator = false;

  private readonly cdr = inject(ChangeDetectorRef);

  ngDoCheck(): void {
    const hasSectionSeparator = this.sectionSeparatorDir !== undefined;
    if (
      this.sections === this.lastSectionsRef &&
      hasSectionSeparator === this.lastHasSectionSeparator
    ) {
      return;
    }
    this.lastSectionsRef = this.sections;
    this.lastHasSectionSeparator = hasSectionSeparator;

    const sections = this.sections ?? [];
    const { entries, headerIndices } = flattenSections(sections, hasSectionSeparator);
    this.flatEntries = entries;
    this.headerIndices = headerIndices;

    // RN sticks section headers by default only on iOS; Android does not unless asked.
    this.stickyHeaderIndices = resolveStickySectionHeaders(
      this.stickySectionHeadersEnabled,
      headerIndices,
      Platform.OS,
    );

    dlog(
      `Angular VirtualizedSectionList: ${sections.length} sections flattened to ${entries.length} entries`,
    );
    this.cdr.markForCheck();
  }

  // The derived flat-stream accessors handed to the inner VirtualizedList. Stable arrow fields so
  // the bindings keep a constant identity; they read the live flatEntries.
  getEntry = (_source: unknown, index: number): ISectionEntry<ItemT> => this.flatEntries[index];
  getEntryCount = (): number => this.flatEntries.length;
  entryKeyExtractor = (entry: ISectionEntry<ItemT>, index: number): string =>
    sectionEntryKey(entry, index, this.keyExtractor);

  // Adapts each @Output() into the plain callback VirtualizedList's own @Input() still wants,
  // gated on `.observed` so an unlistened event forwards `undefined` — the same "nobody cares"
  // contract the old @Input() callback passthrough had (e.g. onRefresh presence gates whether a
  // RefreshControl is built downstream; see the Vue twin's `listens('onRefresh')` gate).
  get resolvedOnEndReached(): ((info: { distanceFromEnd: number }) => void) | undefined {
    return this.endReached.observed ? info => this.endReached.emit(info) : undefined;
  }

  get resolvedOnStartReached(): ((info: { distanceFromStart: number }) => void) | undefined {
    return this.startReached.observed ? info => this.startReached.emit(info) : undefined;
  }

  get resolvedOnRefresh(): (() => void) | undefined {
    return this.refresh.observed ? () => this.refresh.emit() : undefined;
  }

  get resolvedOnAccessibilityAction(): ((event: ISymbioteEvent) => void) | undefined {
    return this.accessibilityAction.observed
      ? event => this.accessibilityAction.emit(event)
      : undefined;
  }

  get resolvedOnAccessibilityTap(): ((event: ISymbioteEvent) => void) | undefined {
    return this.accessibilityTap.observed ? event => this.accessibilityTap.emit(event) : undefined;
  }

  get resolvedOnMagicTap(): ((event: ISymbioteEvent) => void) | undefined {
    return this.magicTap.observed ? event => this.magicTap.emit(event) : undefined;
  }

  get resolvedOnAccessibilityEscape(): ((event: ISymbioteEvent) => void) | undefined {
    return this.accessibilityEscape.observed
      ? event => this.accessibilityEscape.emit(event)
      : undefined;
  }

  // --- per-cell-tag dispatch (the inner vListItem context is typed `unknown` under strictTemplates,
  // since VListItemDirective's generic is not bound here; narrow with a runtime guard, no casts). ---

  private isEntry(value: unknown): value is ISectionEntry<ItemT> {
    return typeof value === 'object' && value !== null && 'kind' in value;
  }

  entryKind(value: unknown): ISectionEntry<ItemT>['kind'] | 'unknown' {
    return this.isEntry(value) ? value.kind : 'unknown';
  }

  sectionContextOf(value: unknown): IVSectionContext<ItemT> | undefined {
    if (!this.isEntry(value)) return undefined;
    if (value.kind !== 'header' && value.kind !== 'footer') return undefined;
    return { $implicit: value.section, section: value.section };
  }

  itemContextOf(value: unknown, separators: ISeparators): IVSectionItemContext<ItemT> | undefined {
    if (!this.isEntry(value) || value.kind !== 'item') return undefined;
    return {
      $implicit: value.item,
      item: value.item,
      index: value.itemIndex,
      section: value.section,
      separators,
    };
  }

  // The inner list's separator context carries the flattened ENTRY as leading/trailing; unwrap each
  // back to its ItemT (shared unwrapEntryItem) so the app's item separator, typed on ItemT, sees
  // real items (header/footer/section-separator gaps unwrap to undefined). Mirrors the React/Vue
  // entrySeparatorComponent wrap.
  itemSeparatorContextOf(
    highlighted: unknown,
    leadingItem: unknown,
    trailingItem: unknown,
  ): IVListSeparatorContext<ItemT> {
    return {
      $implicit: highlighted === true,
      highlighted: highlighted === true,
      leadingItem: this.isEntry(leadingItem) ? unwrapEntryItem(leadingItem) : undefined,
      trailingItem: this.isEntry(trailingItem) ? unwrapEntryItem(trailingItem) : undefined,
    };
  }

  // ---- imperative handle (the shared IVirtualizedSectionListHandle surface) ----

  scrollToLocation(params: {
    sectionIndex: number;
    itemIndex: number;
    viewOffset?: number;
    viewPosition?: number;
    animated?: boolean;
  }): void {
    const flatIndex = scrollLocationToFlatIndex(
      this.headerIndices,
      params.sectionIndex,
      params.itemIndex,
    );
    if (flatIndex === undefined) {
      dlog(
        `Angular VirtualizedSectionList scrollToLocation: section ${params.sectionIndex} out of range`,
      );
      return;
    }
    dlog(
      `Angular VirtualizedSectionList scrollToLocation section=${params.sectionIndex} ` +
        `item=${params.itemIndex} -> flat ${flatIndex}`,
    );
    this.list?.scrollToIndex({
      index: flatIndex,
      viewOffset: params.viewOffset,
      viewPosition: params.viewPosition,
      animated: params.animated,
    });
  }

  flashScrollIndicators(): void {
    this.list?.flashScrollIndicators();
  }

  getNativeScrollRef(): IScrollViewHandle | null {
    return this.list?.getNativeScrollRef() ?? null;
  }

  getScrollableNode(): IScrollViewHandle | null {
    return this.list?.getScrollableNode() ?? null;
  }

  getScrollResponder(): IScrollViewHandle | null {
    return this.list?.getScrollResponder() ?? null;
  }

  getScrollNode(): ISymbioteNode | null {
    return this.list?.getScrollNode() ?? null;
  }

  recordInteraction(): void {
    this.list?.recordInteraction();
  }
}
