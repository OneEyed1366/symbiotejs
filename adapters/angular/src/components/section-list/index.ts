// SectionList, the Angular public list-of-sections component. A thin convenience surface over
// VirtualizedSectionList, mirroring RN's layering (SectionList -> VirtualizedSectionList ->
// VirtualizedList). All section-flattening / windowing / sticky-header / imperative-scroll logic
// lives below; this layer re-exposes the same surface under the SectionList name and re-exposes the
// handle (delegating to the inner VirtualizedSectionList). The Angular twin of
// adapters/vue/src/components/section-list/index.ts.
//
// As in the Vue twin, SectionList is a PURE FORWARDER: its public prop surface IS
// VirtualizedSectionList's (RN layers them one-for-one), and the SectionList-flavour defaults
// (stickySectionHeadersEnabled per Platform.OS, the section entry keyExtractor) already live INSIDE
// VirtualizedSectionList — it applies `stickySectionHeadersEnabled ?? (Platform.OS === 'ios')` in
// its ngDoCheck and routes keyExtractor through the shared sectionEntryKey. So SectionList forwards
// each prop unchanged (undefined included) and the default lands one layer down; double-applying
// here would fight VSL. Vue spreads $attrs to do this in one line — Angular has no attrs-spread, so
// every prop is forwarded as an explicit @Input binding, except the seven list-lifecycle events
// (endReached/startReached/refresh/accessibilityAction/accessibilityTap/magicTap/
// accessibilityEscape), which are real @Output() EventEmitters re-emitted via a listener binding.
//
// TEMPLATE FORWARDING — RE-STAMP, the same pattern FlatList's single-column branch was fixed to use
// (see flat-list/index.ts). A bare `<ng-content></ng-content>` passthrough does NOT let
// VirtualizedSectionList's own @ContentChild resolve directives across the SECOND projection hop
// (SectionList's own `<ng-content>` re-projecting content that was actually authored on `<SectionList>`
// by the app, one level further out) — Angular's content queries resolve against what was projected
// directly onto the querying component's OWN tag, not transitively through a nested `<ng-content>`
// relay. So SectionList captures the app's `<ng-template vSectionItem>` / vSectionHeader /
// vSectionFooter / vSectionSeparator / vListHeader / vListFooter / vListEmpty / vListSeparator with
// its OWN @ContentChild (a single, direct projection hop — this always resolves) and re-authors
// equivalent `<ng-template>`s on `<VirtualizedSectionList>`, each forwarding the captured
// templateRef + context through VListOutletDirective, exactly mirroring how VirtualizedSectionList
// itself re-stamps its own captured directives onto its inner VirtualizedList.

import {
  ChangeDetectionStrategy,
  Component,
  ContentChild,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
  inject,
} from '@angular/core';
import type {
  IAccessibilityProps,
  IAccessibilityStateValue,
  IAriaProps,
  IScrollViewHandle,
  ISection,
  IVirtualizedSectionListHandle,
} from '@symbiotejs/components';
import {
  type IStyleProp,
  type ISymbioteEvent,
  type ISymbioteNode,
  type IViewStyle,
} from '@symbiotejs/engine';
import {
  VListEmptyDirective,
  VListFooterDirective,
  VListHeaderDirective,
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
  VirtualizedSectionList,
  type IVirtualizedSectionListProps,
} from '../virtualized-section-list';

// Angular cannot preserve VListSeparatorDirective<ItemT>'s type parameter across this re-stamp
// reuse (the directive is matched structurally in SectionList's own template with no explicit type
// argument to pin ItemT to, so `let-leadingItem`/`let-trailingItem` arrive typed `unknown`) — even
// though VirtualizedSectionList's own unwrap always supplies a real ItemT value. The narrowest
// possible I/O-boundary cast for that gap; not a general-purpose unknown-to-T narrowing (mirrors
// flat-list/index.ts's identical asItem helper).
function asItem<ItemT>(value: unknown): ItemT | undefined {
  return value as ItemT | undefined;
}

// Re-export the shared section type + the imperative handle so app code (and any later layer) imports
// them from SectionList, mirroring how the Vue twin re-exposes ISection + ISectionListHandle.
export type { ISection } from '@symbiotejs/components';
export type ISectionListHandle = IVirtualizedSectionListHandle;

// Re-export the section authoring directives + the list-level slot directives so app code importing
// from '@symbiotejs/angular' gets the full `<ng-template vSection*>` / `vList*` authoring surface
// alongside SectionList (mirrors how virtualized-section-list/index re-exports the section ones and
// FlatList re-exports the list-level ones).
export {
  VSectionFooterDirective,
  VSectionHeaderDirective,
  VSectionItemDirective,
  VSectionSeparatorDirective,
} from '../virtualized-section-list';
export {
  VListEmptyDirective,
  VListFooterDirective,
  VListHeaderDirective,
  VListSeparatorDirective,
} from '../virtualized-list';

// SectionList's public surface is exactly VirtualizedSectionList's (RN layers them one-for-one), so
// the prop type is shared verbatim — no SectionList-only field exists.
export type ISectionListProps<ItemT> = IVirtualizedSectionListProps<ItemT>;

// What the SectionList component itself takes as plain @Input()s: the full surface minus the
// list-lifecycle events, which it exposes as real @Output() EventEmitters instead (see the class
// below) — mirrors IAngularPressableInputs in pressable/index.ts and VirtualizedSectionList's own
// IVirtualizedSectionListInputs.
export type ISectionListInputs<ItemT> = Omit<
  ISectionListProps<ItemT>,
  | 'onEndReached'
  | 'onStartReached'
  | 'onRefresh'
  | 'onAccessibilityAction'
  | 'onAccessibilityTap'
  | 'onMagicTap'
  | 'onAccessibilityEscape'
>;

@Component({
  selector: 'SectionList',
  standalone: true,
  imports: [
    VirtualizedSectionList,
    VSectionItemDirective,
    VSectionHeaderDirective,
    VSectionFooterDirective,
    VSectionSeparatorDirective,
    VListHeaderDirective,
    VListFooterDirective,
    VListEmptyDirective,
    VListSeparatorDirective,
    VListOutletDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <VirtualizedSectionList
      [sections]="sections"
      [keyExtractor]="keyExtractor"
      [stickySectionHeadersEnabled]="stickySectionHeadersEnabled"
      [extraData]="extraData"
      (endReached)="endReached.emit($event)"
      [onEndReachedThreshold]="onEndReachedThreshold"
      (startReached)="startReached.emit($event)"
      [onStartReachedThreshold]="onStartReachedThreshold"
      (refresh)="refresh.emit()"
      [refreshRequested]="refresh.observed"
      [refreshing]="refreshing"
      [progressViewOffset]="progressViewOffset"
      [initialNumToRender]="initialNumToRender"
      [initialScrollIndex]="initialScrollIndex"
      [maxToRenderPerBatch]="maxToRenderPerBatch"
      [updateCellsBatchingPeriod]="updateCellsBatchingPeriod"
      [windowSize]="windowSize"
      [inverted]="inverted"
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
      (accessibilityAction)="accessibilityAction.emit($event)"
      (accessibilityTap)="accessibilityTap.emit($event)"
      (magicTap)="magicTap.emit($event)"
      (accessibilityEscape)="accessibilityEscape.emit($event)"
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
      <ng-template
        vSectionItem
        let-item
        let-index="index"
        let-section="section"
        let-separators="separators"
      >
        <ng-container
          [vListOutlet]="sectionItemDir?.templateRef"
          [vListOutletContext]="{ $implicit: item, item, index, section, separators }"
        ></ng-container>
      </ng-template>
      @if (sectionHeaderDir !== undefined) {
        <ng-template vSectionHeader let-section>
          <ng-container
            [vListOutlet]="sectionHeaderDir.templateRef"
            [vListOutletContext]="{ $implicit: section, section }"
          ></ng-container>
        </ng-template>
      }
      @if (sectionFooterDir !== undefined) {
        <ng-template vSectionFooter let-section>
          <ng-container
            [vListOutlet]="sectionFooterDir.templateRef"
            [vListOutletContext]="{ $implicit: section, section }"
          ></ng-container>
        </ng-template>
      }
      @if (sectionSeparatorDir !== undefined) {
        <ng-template vSectionSeparator>
          <ng-container [vListOutlet]="sectionSeparatorDir.templateRef"></ng-container>
        </ng-template>
      }
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
      @if (itemSeparatorDir !== undefined) {
        <ng-template
          vListSeparator
          let-highlighted="highlighted"
          let-leadingItem="leadingItem"
          let-trailingItem="trailingItem"
        >
          <ng-container
            [vListOutlet]="itemSeparatorDir.templateRef"
            [vListOutletContext]="itemSeparatorContext(highlighted, leadingItem, trailingItem)"
          ></ng-container>
        </ng-template>
      }
    </VirtualizedSectionList>
  `,
})
export class SectionList<ItemT = unknown>
  implements ISectionListInputs<ItemT>, IVirtualizedSectionListHandle
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
  // comment) — `elementRef` below is SectionList's OWN host, not `list`'s inner VirtualizedSectionList.
  // A plain `flattenStyle([...])` here would allocate a FRESH object on every getter read (every CD
  // check), which — bound onto the nested VirtualizedSectionList/VirtualizedList's own `@Input()
  // style` — defeats VirtualizedList's `ngDoCheck` dedup gate and free-runs change detection
  // forever (the exact bug `stableAnchorStyle` exists to prevent, see its doc comment and the
  // `flat-list-array-style.test.ts` regression it fixes). `cachedResolvedStyle` is the getter's own
  // persisted "previous" value across reads, since a getter has no natural field to compare against.
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

  // The app's section/list authoring templates, captured from the app's DIRECT projected content
  // (single hop — always resolves) and re-stamped onto the inner VirtualizedSectionList above.
  @ContentChild(VSectionItemDirective) sectionItemDir?: VSectionItemDirective<ItemT>;
  @ContentChild(VSectionHeaderDirective) sectionHeaderDir?: VSectionHeaderDirective<ItemT>;
  @ContentChild(VSectionFooterDirective) sectionFooterDir?: VSectionFooterDirective<ItemT>;
  @ContentChild(VSectionSeparatorDirective) sectionSeparatorDir?: VSectionSeparatorDirective;
  @ContentChild(VListHeaderDirective) listHeaderDir?: VListHeaderDirective;
  @ContentChild(VListFooterDirective) listFooterDir?: VListFooterDirective;
  @ContentChild(VListEmptyDirective) listEmptyDir?: VListEmptyDirective;
  @ContentChild(VListSeparatorDirective) itemSeparatorDir?: VListSeparatorDirective<ItemT>;

  // The composed inner VirtualizedSectionList. Its instance IS an IVirtualizedSectionListHandle, so
  // SectionList's handle delegates straight to it. Available from ngAfterViewInit; reads lazily.
  @ViewChild(VirtualizedSectionList) private list?: VirtualizedSectionList<ItemT>;

  // This component's OWN host — the non-painting anchor `class="..."` at the use site resolves
  // onto (see anchorHostStyle's doc comment) — NOT `list` above, which targets the real inner
  // `<VirtualizedSectionList>` one level down (itself its own separate anchor host).
  private readonly elementRef = inject(ElementRef);

  // The item separator context: leadingItem/trailingItem arrive `unknown` from the template's `let`
  // bindings (see the asItem boundary comment above), already-unwrapped real items (no envelope to
  // narrow through, unlike a section header/footer entry).
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

  // ---- imperative handle (the shared IVirtualizedSectionListHandle surface) — delegates down ----

  scrollToLocation(params: {
    sectionIndex: number;
    itemIndex: number;
    viewOffset?: number;
    viewPosition?: number;
    animated?: boolean;
  }): void {
    this.list?.scrollToLocation(params);
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
