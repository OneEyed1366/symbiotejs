// VirtualizedList, the Angular lifecycle half. The windowing engine (offset table, window
// compute, batch throttle, viewability, edge-reached, the child PLAN, the imperative-handle
// geometry) lives in @symbiote-native/components/state, shared verbatim with the React and Vue adapters
// so every adapter keeps the same feature surface. Here Angular supplies only the lifecycle: plain fields
// for scroll offset / viewport / measurement bumps, a once-per-CD metrics + view recompute in
// ngDoCheck (the Angular twin of React render / Vue `computed` — it owns the controlled
// committedWindow throttle and assembles the windowed cells before the template bindings are read),
// and the after-commit work (batch fill, onEndReached/onStartReached, viewability, initialScroll, MVCP)
// in ngAfterViewChecked. OnPush + ChangeDetectorRef.markForCheck() drives re-render off the native
// scroll/layout/measure callbacks (they fire outside Angular's own event bindings, so they must
// mark the view dirty). This is the Angular twin of the React useReducer/useEffect and Vue
// ref/computed/watch over the same shared functions. It composes the Angular ScrollView, exactly
// as the React/Vue lists drive their ScrollView.
//
// Per-item rendering is TEMPLATES, not a callback: React/Vue `renderItem: (info) => element` does
// not translate to Angular. The app supplies the cell via `<ng-template vListItem>` (and the
// header/footer/empty/separator slots via vListHeader/vListFooter/vListEmpty/vListSeparator); the
// list captures them with @ContentChild and stamps the WINDOWED slice through VListOutletDirective
// (a core-only NgTemplateOutlet twin — @angular/common is not a dependency). See ./directives.ts.
// Every React/Vue behavior is present (windowing, onEndReached, viewability, headers/footers/empty/
// separators, refresh, imperative scroll, horizontal, inverted, MVCP); only the cell AUTHORING
// shape differs, since a callback prop returning an element has no Angular equivalent.
//
// Lists have no Descriptor render fn — the cell content is the framework's own children.
// Cells/spacers are plain symbiote-view host elements.

import {
  CUSTOM_ELEMENTS_SCHEMA,
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
  type AfterViewChecked,
  type DoCheck,
  type OnDestroy,
} from '@angular/core';
import {
  DEFAULT_END_REACHED_THRESHOLD,
  DEFAULT_INITIAL_NUM_TO_RENDER,
  DEFAULT_MAX_TO_RENDER_PER_BATCH,
  DEFAULT_START_REACHED_THRESHOLD,
  DEFAULT_UPDATE_CELLS_BATCHING_PERIOD,
  DEFAULT_WINDOW_SIZE,
  EMPTY_OFFSET,
  FIRST_INDEX,
  INVERTED_X_STYLE,
  INVERTED_Y_STYLE,
  NO_CONTENT_LENGTH_SENT,
  NO_INDEX,
  averageMeasuredLength,
  buildListPlan,
  buildOffsets,
  buildViewabilityPairs,
  computeEndReached,
  computeMvcpAdjustment,
  computeStartReached,
  computeViewableSet,
  computeWindow,
  decideEdgeReached,
  diffViewable,
  highestMeasuredIndex,
  indexOfItem,
  isSeparatorGapInRange,
  maxMinimumViewTime,
  offsetForEnd,
  offsetForIndex,
  readLayoutLength,
  readScrollOffset,
  resolveAccessibilityProps,
  resolveItemKey,
  throttleWindow,
  type IAccessibilityProps,
  type IAccessibilityStateValue,
  type IAriaProps,
  type ICellLayout,
  type ISeparatorProps,
  type ISeparators,
  type IScrollViewHandle,
  type IViewToken,
  type IViewabilityConfig,
  type IViewabilityConfigCallbackPair,
  type IViewableItemsChangedInfo,
  type IVirtualizedListHandle,
} from '@symbiote-native/components';
import {
  dlog,
  flattenStyle,
  type IStyleProp,
  type ISymbioteEvent,
  type ISymbioteNode,
  type IViewStyle,
} from '@symbiote-native/engine';
import { ScrollView } from '../scroll-view';
import { RefreshControl } from '../refresh-control';
import { anchorHostStyle, ViewHost } from '../../primitives';
import {
  VListEmptyDirective,
  VListFooterDirective,
  VListHeaderDirective,
  VListItemDirective,
  VListOutletDirective,
  VListSeparatorDirective,
  type IVListItemContext,
  type IVListSeparatorContext,
} from './directives';

// Re-export the shared list types + the authoring directives so flat-list / section-list keep
// importing them from '../virtualized-list', exactly as the React/Vue adapters re-export them.
export type {
  ICellLayout,
  ISeparators,
  ISeparatorProps,
  IViewToken,
  IViewableItemsChangedInfo,
  IViewabilityConfig,
  IViewabilityConfigCallbackPair,
  IVirtualizedListHandle,
} from '@symbiote-native/components';
export {
  VListEmptyDirective,
  VListFooterDirective,
  VListHeaderDirective,
  VListItemDirective,
  VListSeparatorDirective,
} from './directives';
export type { IVListItemContext, IVListSeparatorContext } from './directives';

// The Angular VirtualizedList prop surface. Mirrors React/Vue's IVirtualizedListProps MINUS the
// element-returning props (renderItem, ListHeader/Footer/Empty Component, ItemSeparatorComponent):
// those are the per-adapter children/render fields and become `<ng-template>` directives in Angular.
// Everything agnostic is the SAME surface.
export interface IVirtualizedListProps<ItemT> extends IAccessibilityProps, IAriaProps {
  data: unknown;
  getItem: (data: unknown, index: number) => ItemT;
  getItemCount: (data: unknown) => number;
  keyExtractor?: (item: ItemT, index: number) => string;
  getItemLayout?: (
    data: unknown,
    index: number,
  ) => { length: number; offset: number; index: number };
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
  stickyHeaderIndices?: number[];
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

// What the VirtualizedList component itself takes as plain @Input()s: the full surface minus the
// events it exposes as real @Output() EventEmitters instead (see the class below), mirroring how
// pressable/index.ts derives IAngularPressableInputs from IAngularPressableProps.
export type IVirtualizedListInputs<ItemT> = Omit<
  IVirtualizedListProps<ItemT>,
  | 'onEndReached'
  | 'onStartReached'
  | 'onRefresh'
  | 'onViewableItemsChanged'
  | 'onScrollToIndexFailed'
  | 'onAccessibilityAction'
  | 'onAccessibilityTap'
  | 'onMagicTap'
  | 'onAccessibilityEscape'
>;

// The windowing snapshot recomputed once per CD in ngDoCheck. Plain object (not a signal/computed):
// the OnPush + markForCheck cycle re-runs ngDoCheck whenever scroll / layout / measure change.
interface IMetricsCore {
  count: number;
  offsets: number[];
  lengths: number[];
  total: number;
  first: number;
  last: number;
  target: { first: number; last: number };
  averageLength: number;
}

// One in-window cell, assembled in ngDoCheck and stamped by the template's @for. The
// context object is fresh each pass; VListOutletDirective folds it onto the live embedded view, so
// the cell view is reused (the windowing recompute does not tear cells down).
interface IWindowCell<ItemT> {
  key: string;
  index: number;
  context: IVListItemContext<ItemT>;
  measure: (event: ISymbioteEvent) => void;
  separatorContext?: IVListSeparatorContext<ItemT>;
}

@Component({
  selector: 'VirtualizedList',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [ScrollView, RefreshControl, VListOutletDirective, ViewHost],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ScrollView
      [horizontal]="isHorizontal"
      [style]="resolvedStyle"
      [contentContainerStyle]="resolvedContentContainerStyle"
      [testID]="foldedAccessibility.testID"
      [nativeID]="foldedAccessibility.nativeID"
      [accessible]="foldedAccessibility.accessible"
      [accessibilityLabel]="foldedAccessibility.accessibilityLabel"
      [accessibilityHint]="foldedAccessibility.accessibilityHint"
      [accessibilityRole]="foldedAccessibility.accessibilityRole"
      [accessibilityState]="foldedAccessibility.accessibilityState"
      [accessibilityValue]="foldedAccessibility.accessibilityValue"
      [accessibilityActions]="foldedAccessibility.accessibilityActions"
      [accessibilityLabelledBy]="foldedAccessibility.accessibilityLabelledBy"
      [importantForAccessibility]="foldedAccessibility.importantForAccessibility"
      [accessibilityLiveRegion]="foldedAccessibility.accessibilityLiveRegion"
      [screenReaderFocusable]="foldedAccessibility.screenReaderFocusable"
      [accessibilityViewIsModal]="foldedAccessibility.accessibilityViewIsModal"
      [accessibilityElementsHidden]="foldedAccessibility.accessibilityElementsHidden"
      [accessibilityIgnoresInvertColors]="foldedAccessibility.accessibilityIgnoresInvertColors"
      [accessibilityLanguage]="foldedAccessibility.accessibilityLanguage"
      [accessibilityRespondsToUserInteraction]="
        foldedAccessibility.accessibilityRespondsToUserInteraction
      "
      [accessibilityShowsLargeContentViewer]="
        foldedAccessibility.accessibilityShowsLargeContentViewer
      "
      [accessibilityLargeContentTitle]="foldedAccessibility.accessibilityLargeContentTitle"
      (accessibilityAction)="accessibilityActionTick($event)"
      (accessibilityTap)="accessibilityTapTick($event)"
      (magicTap)="magicTapTick($event)"
      (accessibilityEscape)="accessibilityEscapeTick($event)"
      [onScroll]="onScrollTick"
      (layout)="onLayoutTick($event)"
      [onScrollBeginDrag]="onScrollBeginDrag"
      [onScrollEndDrag]="onScrollEndDrag"
      [onMomentumScrollBegin]="onMomentumScrollBegin"
      [onMomentumScrollEnd]="onMomentumScrollEnd"
      [scrollEventThrottle]="scrollEventThrottle"
      [keyboardShouldPersistTaps]="keyboardShouldPersistTaps"
      [keyboardDismissMode]="keyboardDismissMode"
      [contentOffset]="commandedOffset"
      [stickyHeaderIndices]="renderedStickyIndices"
      [maintainVisibleContentPosition]="resolvedMaintainVisibleContentPosition"
    >
      @if (shouldRenderRefreshControl) {
        <RefreshControl
          [refreshing]="refreshing ?? false"
          (refresh)="handleRefresh()"
          [progressViewOffset]="progressViewOffset"
        />
      }

      @if (headerDir !== undefined) {
        <symbiote-view>
          <ng-container [vListOutlet]="headerDir.templateRef"></ng-container>
        </symbiote-view>
      }

      @if (itemCount === 0) {
        @if (emptyDir !== undefined) {
          <symbiote-view>
            <ng-container [vListOutlet]="emptyDir.templateRef"></ng-container>
          </symbiote-view>
        }
      } @else {
        @if (leadingSpacerStyle !== null) {
          <symbiote-view [style]="leadingSpacerStyle"></symbiote-view>
        }
        @for (cell of windowCells; track cell.key) {
          <symbiote-view (layout)="handleCellLayout(cell.measure, $event)" [style]="cellStyle">
            <ng-container
              [vListOutlet]="itemDir?.templateRef"
              [vListOutletContext]="cell.context"
            ></ng-container>
          </symbiote-view>
          @if (cell.separatorContext !== undefined) {
            <symbiote-view>
              <ng-container
                [vListOutlet]="separatorDir?.templateRef"
                [vListOutletContext]="cell.separatorContext"
              ></ng-container>
            </symbiote-view>
          }
        }
        @if (trailingSpacerStyle !== null) {
          <symbiote-view [style]="trailingSpacerStyle"></symbiote-view>
        }
      }

      @if (footerDir !== undefined) {
        <symbiote-view>
          <ng-container [vListOutlet]="footerDir.templateRef"></ng-container>
        </symbiote-view>
      }
    </ScrollView>
  `,
})
export class VirtualizedList<ItemT = unknown>
  implements
    IVirtualizedListInputs<ItemT>,
    IVirtualizedListHandle,
    DoCheck,
    AfterViewChecked,
    OnDestroy
{
  // The list's edge/viewability/failure events as real Angular events: `(endReached)="…"`, not
  // `[onEndReached]="…"`. See handleRefresh/accessibility*Tick below for how the still-callback-
  // shaped ScrollView/RefreshControl @Input()s are fed from these.
  @Output() readonly endReached = new EventEmitter<{ distanceFromEnd: number }>();
  @Output() readonly startReached = new EventEmitter<{ distanceFromStart: number }>();
  @Output() readonly refresh = new EventEmitter<void>();
  @Output() readonly viewableItemsChanged = new EventEmitter<IViewableItemsChangedInfo<ItemT>>();
  @Output() readonly scrollToIndexFailed = new EventEmitter<{
    index: number;
    highestMeasuredFrameIndex: number;
    averageItemLength: number;
  }>();
  @Output() readonly accessibilityAction = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityTap = new EventEmitter<ISymbioteEvent>();
  @Output() readonly magicTap = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityEscape = new EventEmitter<ISymbioteEvent>();
  @Input({ required: true }) data!: unknown;
  @Input({ required: true }) getItem!: (data: unknown, index: number) => ItemT;
  @Input({ required: true }) getItemCount!: (data: unknown) => number;
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
  // Set explicitly by a wrapper (FlatList/VirtualizedSectionList) that ALWAYS binds
  // `(refresh)="refresh.emit()"` on this component to re-forward the event outward — that binding
  // itself makes `this.refresh.observed` permanently true (Angular subscribes unconditionally the
  // moment a template writes `(refresh)="…"`, regardless of what the handler does), so `.observed`
  // can no longer tell "the app actually wants pull-to-refresh" from "a wrapper is just forwarding
  // the event". A wrapper passes its OWN public `refresh.observed` here instead; direct usage
  // (no wrapper) falls back to this component's own `.observed`, unchanged from before.
  @Input() refreshRequested?: boolean;
  @Input() viewabilityConfig?: IViewabilityConfig;
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

  // The cell + slot templates the app authors (the Angular twin of renderItem / ListHeaderComponent
  // / ListFooterComponent / ListEmptyComponent / ItemSeparatorComponent), captured from projected
  // <ng-template> content. Resolved by ngAfterContentInit, read each ngDoCheck (from the 2nd CD on).
  @ContentChild(VListItemDirective) itemDir?: VListItemDirective<ItemT>;
  @ContentChild(VListHeaderDirective) headerDir?: VListHeaderDirective;
  @ContentChild(VListFooterDirective) footerDir?: VListFooterDirective;
  @ContentChild(VListEmptyDirective) emptyDir?: VListEmptyDirective;
  @ContentChild(VListSeparatorDirective) separatorDir?: VListSeparatorDirective<ItemT>;

  // The composed inner scroll view. Its instance IS an IScrollViewHandle (scrollTo / scrollToEnd /
  // flashScrollIndicators / getScrollNode), so the imperative handle delegates straight to it.
  // Available from ngAfterViewInit on; the handle reads the node lazily and no-ops before commit.
  @ViewChild(ScrollView) private scrollView?: ScrollView;

  // --- template-bound view state, assembled in ngDoCheck (recomputeView) ---
  itemCount = EMPTY_OFFSET;
  windowCells: IWindowCell<ItemT>[] = [];
  leadingSpacerStyle: IViewStyle | null = null;
  trailingSpacerStyle: IViewStyle | null = null;
  cellStyle: IViewStyle | undefined = undefined;
  renderedStickyIndices: number[] | undefined = undefined;
  // Bound to the template's `[style]="resolvedStyle"`, which Angular compiles to the built-in
  // ɵɵstyleMap instruction — it only understands a flat object, never an array (RN's own
  // `style={[a, b]}` composition idiom crashes deep inside Angular's styling engine), so this
  // is always pre-flattened via the engine's own flattenStyle, never left as an array.
  resolvedStyle: IViewStyle | undefined = undefined;
  resolvedContentContainerStyle: IStyleProp<IViewStyle> | undefined = undefined;
  resolvedMaintainVisibleContentPosition:
    { minIndexForVisible: number; autoscrollToTopThreshold?: number } | undefined = undefined;
  // The offset we are imperatively driving native to before the scroll handle attaches (rides down
  // as contentOffset). A fresh object identity each push so the commit re-applies a repeated value.
  commandedOffset: { x: number; y: number } | undefined = undefined;

  // --- reactive scalars (mutated by the native callbacks; markForCheck re-runs the CD) ---
  private scrollOffset = EMPTY_OFFSET;
  private viewportLength = EMPTY_OFFSET;
  private measureVersion = EMPTY_OFFSET;

  // --- non-render state (the Angular twin of refs that never trigger a render) ---
  private metricsCore: IMetricsCore = {
    count: EMPTY_OFFSET,
    offsets: [],
    lengths: [],
    total: EMPTY_OFFSET,
    first: FIRST_INDEX,
    last: -1,
    target: { first: FIRST_INDEX, last: -1 },
    averageLength: EMPTY_OFFSET,
  };
  private readonly measured = new Map<number, number>();
  private readonly cellMeasures = new Map<number, (event: ISymbioteEvent) => void>();
  private readonly separatorOverrides = new Map<number, Partial<ISeparatorProps<unknown>>>();
  // The previously committed window, grown by at most maxToRenderPerBatch per tick (no snap).
  private committedWindow: { first: number; last: number } = { first: FIRST_INDEX, last: -1 };
  private sentEndForContentLength = NO_CONTENT_LENGTH_SENT;
  private sentStartForContentLength = NO_CONTENT_LENGTH_SENT;
  private lastViewable = new Map<string, IViewToken<ItemT>>();
  private viewableTimer: ReturnType<typeof setTimeout> | null = null;
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private hasInteracted = false;
  private appliedInitialScroll = false;
  private firstVisibleKey: string | null = null;
  // Dedupes the after-commit effects: they run only when the windowing signature changed.
  private lastEffectSignature = '';
  // Dedupes ngDoCheck's own recompute. WITHOUT this, recomputeView() unconditionally rebuilds
  // windowCells (and each cell's `separators` handle — fresh closures every call) on EVERY CD pass,
  // including ones triggered by something else entirely in the app. A fresh context object flows
  // into VListOutletDirective, which (correctly) sees its `context` @Input() change and calls
  // `viewRef.markForCheck()` — which reschedules ANOTHER change-detection tick via the zoneless
  // scheduler (adapters/angular/src/render.ts). Recomputing unconditionally therefore free-runs
  // forever the moment a list actually has cells to stamp (a real, previously-dormant bug only
  // exposed once flat-list.test.ts's projection fix let cells render for the first time — see that
  // test's comment). Guarding recompute behind "did anything relevant actually change" breaks the
  // cycle: unrelated CD passes reuse the same windowCells/context identities, so
  // VListOutletDirective's ngOnChanges sees no change and never reschedules.
  private lastRecompute: unknown[] | undefined = undefined;

  private readonly cdr = inject(ChangeDetectorRef);
  // This component's OWN host — the non-painting anchor `class="..."` at the use site resolves
  // onto (see anchorHostStyle's doc comment) — NOT `scrollView` above, which targets the real
  // inner `<ScrollView>` one level down (itself its own separate anchor host).
  private readonly elementRef = inject(ElementRef);

  get foldedAccessibility(): IAccessibilityProps & IAriaProps & Record<string, unknown> {
    return resolveAccessibilityProps({
      testID: this.testID,
      nativeID: this.nativeID,
      accessible: this.accessible,
      accessibilityLabel: this.accessibilityLabel,
      accessibilityHint: this.accessibilityHint,
      accessibilityRole: this.accessibilityRole,
      accessibilityState: this.accessibilityState,
      accessibilityValue: this.accessibilityValue,
      accessibilityActions: this.accessibilityActions,
      accessibilityLabelledBy: this.accessibilityLabelledBy,
      importantForAccessibility: this.importantForAccessibility,
      accessibilityLiveRegion: this.accessibilityLiveRegion,
      screenReaderFocusable: this.screenReaderFocusable,
      accessibilityViewIsModal: this.accessibilityViewIsModal,
      accessibilityElementsHidden: this.accessibilityElementsHidden,
      accessibilityIgnoresInvertColors: this.accessibilityIgnoresInvertColors,
      accessibilityLanguage: this.accessibilityLanguage,
      accessibilityRespondsToUserInteraction: this.accessibilityRespondsToUserInteraction,
      accessibilityShowsLargeContentViewer: this.accessibilityShowsLargeContentViewer,
      accessibilityLargeContentTitle: this.accessibilityLargeContentTitle,
      role: this.role,
      'aria-label': this.ariaLabel,
      'aria-labelledby': this.ariaLabelledBy,
      'aria-live': this.ariaLive,
      'aria-hidden': this.ariaHidden,
      'aria-busy': this.ariaBusy,
      'aria-checked': this.ariaChecked,
      'aria-disabled': this.ariaDisabled,
      'aria-expanded': this.ariaExpanded,
      'aria-selected': this.ariaSelected,
      'aria-modal': this.ariaModal,
      'aria-valuemax': this.ariaValueMax,
      'aria-valuemin': this.ariaValueMin,
      'aria-valuenow': this.ariaValueNow,
      'aria-valuetext': this.ariaValueText,
    });
  }

  get shouldRenderRefreshControl(): boolean {
    return this.refreshRequested ?? this.refresh.observed;
  }

  get isHorizontal(): boolean {
    return this.horizontal === true;
  }
  private get isInverted(): boolean {
    return this.inverted === true;
  }
  private get windowSizeValue(): number {
    return this.windowSize ?? DEFAULT_WINDOW_SIZE;
  }
  private get initialNumToRenderValue(): number {
    return this.initialNumToRender ?? DEFAULT_INITIAL_NUM_TO_RENDER;
  }
  private get maxToRenderPerBatchValue(): number {
    return this.maxToRenderPerBatch ?? DEFAULT_MAX_TO_RENDER_PER_BATCH;
  }
  private get updateCellsBatchingPeriodValue(): number {
    return this.updateCellsBatchingPeriod ?? DEFAULT_UPDATE_CELLS_BATCHING_PERIOD;
  }
  private get onEndReachedThresholdValue(): number {
    return this.onEndReachedThreshold ?? DEFAULT_END_REACHED_THRESHOLD;
  }
  private get onStartReachedThresholdValue(): number {
    return this.onStartReachedThreshold ?? DEFAULT_START_REACHED_THRESHOLD;
  }

  // ScrollView's onScroll stays an @Input() callback (an Animated.event(...) target must be able to
  // flow through it, which an @Output() can't carry), so this is a stable arrow field passed
  // straight to [onScroll]. onLayout is a real @Output() now, bound via (layout)="onLayoutTick($event)".
  onScrollTick = (event: ISymbioteEvent): void => {
    const offset = readScrollOffset(event, this.isHorizontal);
    if (offset === undefined) return;
    dlog(`Angular VirtualizedList onScroll offset=${offset}`);
    // First scroll is the interaction that ungates waitForInteraction configs.
    this.hasInteracted = true;
    this.scrollOffset = offset;
    // A real native scroll supersedes any pending commanded offset.
    this.commandedOffset = undefined;
    // Compose, don't clobber: internal windowing ran first, now the user's onScroll.
    this.onScroll?.(event);
    this.cdr.markForCheck();
  };

  onLayoutTick = (event: ISymbioteEvent): void => {
    const length = readLayoutLength(event, this.isHorizontal);
    if (length === undefined) return;
    dlog(`Angular VirtualizedList onLayout viewport=${length}`);
    this.viewportLength = length;
    this.cdr.markForCheck();
  };

  // RefreshControl's refresh and ScrollView's accessibility events are real @Output()s now, bound
  // via (refresh)="handleRefresh()" / (accessibilityAction)="accessibilityActionTick($event)" etc.
  // — these fields just adapt VirtualizedList's own @Output() into a plain re-emit callback.
  handleRefresh = (): void => {
    this.refresh.emit();
  };

  accessibilityActionTick = (event: ISymbioteEvent): void => {
    this.accessibilityAction.emit(event);
  };

  accessibilityTapTick = (event: ISymbioteEvent): void => {
    this.accessibilityTap.emit(event);
  };

  magicTapTick = (event: ISymbioteEvent): void => {
    this.magicTap.emit(event);
  };

  accessibilityEscapeTick = (event: ISymbioteEvent): void => {
    this.accessibilityEscape.emit(event);
  };

  private keyFor = (index: number): string => {
    const item = this.getItem(this.data, index);
    return resolveItemKey(item, index, this.keyExtractor);
  };

  // Once-per-CD recompute, BEFORE the template bindings are read (so the freshly computed
  // template-bound fields render this pass — computing them in ngAfterContentChecked instead would
  // trip ExpressionChangedAfterItHasBeenChecked). recomputeMetrics owns the controlled committedWindow
  // throttle (the side effect React runs during render); ngDoCheck is its single evaluation point, so
  // the window grows exactly one step per CD. The projected templates (ContentChild) are resolved
  // from the second CD on; the first paint (count/viewport still 0) corrects on the layout-driven CD.
  ngDoCheck(): void {
    const recomputeInputs: unknown[] = [
      this.data,
      this.extraData,
      this.getItemLayout,
      this.keyExtractor,
      this.isHorizontal,
      this.isInverted,
      this.windowSizeValue,
      this.initialNumToRenderValue,
      this.maxToRenderPerBatchValue,
      this.stickyHeaderIndices,
      this.maintainVisibleContentPosition,
      this.style,
      this.contentContainerStyle,
      this.scrollOffset,
      this.viewportLength,
      this.measureVersion,
      this.headerDir !== undefined,
      this.footerDir !== undefined,
      this.emptyDir !== undefined,
      this.separatorDir !== undefined,
    ];
    const previous = this.lastRecompute;
    this.lastRecompute = recomputeInputs;
    if (
      previous !== undefined &&
      previous.length === recomputeInputs.length &&
      previous.every((value, index) => value === recomputeInputs[index])
    ) {
      return;
    }
    this.recomputeMetrics();
    this.recomputeView();
  }

  ngAfterViewChecked(): void {
    const m = this.metricsCore;
    const signature = `${this.scrollOffset}|${this.viewportLength}|${m.first}|${m.last}|${m.count}|${m.total}|${this.measureVersion}`;
    if (signature === this.lastEffectSignature) return;
    this.lastEffectSignature = signature;
    this.effectBatchFill();
    this.effectEndReached();
    this.effectStartReached();
    this.effectViewability();
    this.effectInitialScroll();
    this.effectMaintainVisibleContentPosition();
  }

  ngOnDestroy(): void {
    if (this.viewableTimer !== null) clearTimeout(this.viewableTimer);
    if (this.batchTimer !== null) clearTimeout(this.batchTimer);
  }

  private recomputeMetrics(): void {
    const count = this.getItemCount(this.data);
    const gil = this.getItemLayout;
    const data = this.data;
    const fixedLayout =
      gil !== undefined
        ? (index: number): ICellLayout => {
            const layout = gil(data, index);
            return { length: layout.length, offset: layout.offset };
          }
        : undefined;
    const averageLength =
      fixedLayout !== undefined
        ? count > FIRST_INDEX
          ? fixedLayout(FIRST_INDEX).length
          : EMPTY_OFFSET
        : averageMeasuredLength(this.measured);
    const { offsets, lengths, total } = buildOffsets(
      count,
      this.measured,
      fixedLayout,
      averageLength,
    );
    const target = computeWindow(
      count,
      offsets,
      lengths,
      this.scrollOffset,
      this.viewportLength,
      this.windowSizeValue,
      this.initialNumToRenderValue,
    );
    const throttled = throttleWindow(target, this.committedWindow, this.maxToRenderPerBatchValue);
    this.committedWindow = throttled;
    this.metricsCore = {
      count,
      offsets,
      lengths,
      total,
      first: throttled.first,
      last: throttled.last,
      target,
      averageLength,
    };
  }

  private recomputeView(): void {
    const m = this.metricsCore;
    this.itemCount = m.count;
    const hasHeader = this.headerDir !== undefined;
    const hasSeparators = this.separatorDir !== undefined;
    const stickySet =
      this.stickyHeaderIndices !== undefined ? new Set(this.stickyHeaderIndices) : undefined;

    this.resolvedContentContainerStyle = this.isHorizontal
      ? [this.contentContainerStyle, { width: m.total }]
      : this.contentContainerStyle;
    this.resolvedStyle = flattenStyle([
      anchorHostStyle(this.elementRef),
      this.isInverted
        ? [this.style, this.isHorizontal ? INVERTED_X_STYLE : INVERTED_Y_STYLE]
        : this.style,
    ]);
    this.cellStyle = this.isInverted
      ? this.isHorizontal
        ? INVERTED_X_STYLE
        : INVERTED_Y_STYLE
      : undefined;
    this.resolvedMaintainVisibleContentPosition =
      this.maintainVisibleContentPosition === undefined
        ? undefined
        : {
            ...this.maintainVisibleContentPosition,
            minIndexForVisible:
              this.maintainVisibleContentPosition.minIndexForVisible + (hasHeader ? 1 : 0),
          };

    if (m.count === FIRST_INDEX) {
      this.windowCells = [];
      this.leadingSpacerStyle = null;
      this.trailingSpacerStyle = null;
      this.renderedStickyIndices = undefined;
      dlog(`Angular VirtualizedList empty (viewport=${this.viewportLength})`);
      return;
    }

    const plan = buildListPlan({
      count: m.count,
      first: m.first,
      last: m.last,
      offsets: m.offsets,
      lengths: m.lengths,
      total: m.total,
      keyFor: this.keyFor,
      stickyIndices: stickySet,
      hasHeader,
      hasSeparators,
    });
    this.leadingSpacerStyle =
      plan.leadingExtent > EMPTY_OFFSET ? this.spacerStyle(plan.leadingExtent) : null;
    this.trailingSpacerStyle =
      plan.trailingExtent > EMPTY_OFFSET ? this.spacerStyle(plan.trailingExtent) : null;
    this.renderedStickyIndices =
      stickySet !== undefined && plan.stickyChildPositions.length > 0
        ? plan.stickyChildPositions
        : undefined;

    const cells: IWindowCell<ItemT>[] = [];
    for (const planned of plan.cells) {
      const item = this.getItem(this.data, planned.index);
      const context: IVListItemContext<ItemT> = {
        $implicit: item,
        index: planned.index,
        separators: this.makeSeparators(planned.index),
      };
      let separatorContext: IVListSeparatorContext<ItemT> | undefined;
      if (hasSeparators && planned.index < m.last) {
        separatorContext = this.buildSeparatorContext(planned.index, item);
      }
      cells.push({
        key: planned.key,
        index: planned.index,
        context,
        measure: this.cellMeasure(planned.index),
        separatorContext,
      });
    }
    this.windowCells = cells;

    dlog(
      `Angular VirtualizedList window [${m.first}, ${m.last}] of ${m.count} ` +
        `(offset=${this.scrollOffset}, viewport=${this.viewportLength}, rendered=${cells.length})`,
    );
  }

  private buildSeparatorContext(index: number, item: ItemT): IVListSeparatorContext<ItemT> {
    const overrides = this.separatorOverrides.get(index);
    const highlighted = overrides?.highlighted ?? false;
    const context: IVListSeparatorContext<ItemT> = {
      $implicit: highlighted,
      highlighted,
      leadingItem: item,
      trailingItem: this.getItem(this.data, index + 1),
    };
    // Fold any custom updateProps keys through the context's index signature (RN lets a row drive
    // arbitrary separator props); the typed fields above stay authoritative.
    if (overrides !== undefined) {
      for (const key of Object.keys(overrides)) {
        if (key === 'highlighted' || key === 'leadingItem' || key === 'trailingItem') continue;
        context[key] = overrides[key];
      }
    }
    return context;
  }

  private spacerStyle(extent: number): IViewStyle {
    return this.isHorizontal ? { width: extent } : { height: extent };
  }

  private cellMeasure(index: number): (event: ISymbioteEvent) => void {
    const existing = this.cellMeasures.get(index);
    if (existing !== undefined) return existing;
    const measure = (event: ISymbioteEvent): void => {
      if (this.getItemLayout !== undefined) return;
      const length = readLayoutLength(event, this.isHorizontal);
      if (length === undefined) return;
      if (this.measured.get(index) === length) return;
      this.measured.set(index, length);
      dlog(`Angular VirtualizedList cell ${index} measured length=${length}`);
      this.measureVersion += 1;
      this.cdr.markForCheck();
    };
    this.cellMeasures.set(index, measure);
    return measure;
  }

  // Per-cell onLayout rides the engine's structural (layout) event channel — Angular forbids an
  // [onLayout] property binding (NG8002). $event arrives untyped, narrowed before reaching measure.
  handleCellLayout(measure: (event: ISymbioteEvent) => void, event: unknown): void {
    if (this.isSymbioteEvent(event)) measure(event);
  }

  private isSymbioteEvent(value: unknown): value is ISymbioteEvent {
    return typeof value === 'object' && value !== null && 'nativeEvent' in value;
  }

  private mergeSeparator(gapIndex: number, patch: Partial<ISeparatorProps<unknown>>): void {
    const count = this.metricsCore.count;
    if (!isSeparatorGapInRange(gapIndex, count)) return;
    this.separatorOverrides.set(gapIndex, { ...this.separatorOverrides.get(gapIndex), ...patch });
    this.cdr.markForCheck();
  }

  private makeSeparators(index: number): ISeparators {
    return {
      highlight: (): void => {
        dlog(`Angular VirtualizedList separator highlight cell=${index}`);
        this.mergeSeparator(index - 1, { highlighted: true });
        this.mergeSeparator(index, { highlighted: true });
      },
      unhighlight: (): void => {
        dlog(`Angular VirtualizedList separator unhighlight cell=${index}`);
        this.mergeSeparator(index - 1, { highlighted: false });
        this.mergeSeparator(index, { highlighted: false });
      },
      updateProps: (select: 'leading' | 'trailing', newProps: Record<string, unknown>): void => {
        this.mergeSeparator(select === 'leading' ? index - 1 : index, newProps);
      },
    };
  }

  // ---- imperative handle (the shared IVirtualizedListHandle surface) ----

  scrollToOffset(params: { offset: number; animated?: boolean }): void {
    this.scrollToPixel(params.offset, params.animated ?? true);
  }

  scrollToIndex(params: {
    index: number;
    animated?: boolean;
    viewOffset?: number;
    viewPosition?: number;
  }): void {
    const m = this.metricsCore;
    // No getItemLayout AND the target is past the last measured cell: report the failure instead of
    // scrolling to a fabricated estimate (RN VirtualizedList.js).
    if (this.getItemLayout === undefined && params.index > highestMeasuredIndex(this.measured)) {
      dlog(
        `Angular VirtualizedList onScrollToIndexFailed index=${params.index} ` +
          `highestMeasured=${highestMeasuredIndex(this.measured)} (no getItemLayout)`,
      );
      this.scrollToIndexFailed.emit({
        index: params.index,
        highestMeasuredFrameIndex: highestMeasuredIndex(this.measured),
        averageItemLength: m.averageLength,
      });
      return;
    }
    this.scrollToPixel(
      this.offsetForIndexLocal(
        params.index,
        params.viewPosition ?? FIRST_INDEX,
        params.viewOffset ?? EMPTY_OFFSET,
      ),
      params.animated ?? true,
    );
  }

  scrollToItem(params: { item: unknown; animated?: boolean; viewPosition?: number }): void {
    const count = this.metricsCore.count;
    const index = indexOfItem(this.data, this.getItem, count, params.item);
    if (index === NO_INDEX) {
      dlog('Angular VirtualizedList scrollToItem: item not found');
      return;
    }
    this.scrollToPixel(
      this.offsetForIndexLocal(index, params.viewPosition ?? FIRST_INDEX, EMPTY_OFFSET),
      params.animated ?? true,
    );
  }

  scrollToEnd(params?: { animated?: boolean }): void {
    this.scrollToPixel(
      offsetForEnd(this.metricsCore.total, this.viewportLength),
      params?.animated ?? true,
    );
  }

  flashScrollIndicators(): void {
    this.scrollView?.flashScrollIndicators();
  }

  getNativeScrollRef(): IScrollViewHandle | null {
    return this.scrollView ?? null;
  }

  getScrollableNode(): IScrollViewHandle | null {
    return this.scrollView ?? null;
  }

  getScrollResponder(): IScrollViewHandle | null {
    return this.scrollView ?? null;
  }

  getScrollNode(): ISymbioteNode | null {
    return this.scrollView?.getScrollNode() ?? null;
  }

  recordInteraction(): void {
    this.hasInteracted = true;
  }

  private scrollToPixel(offset: number, animated: boolean): void {
    const clamped = Math.max(EMPTY_OFFSET, offset);
    const target = this.isHorizontal
      ? { x: clamped, y: EMPTY_OFFSET }
      : { x: EMPTY_OFFSET, y: clamped };
    if (this.scrollView !== undefined) {
      dlog(
        `Angular VirtualizedList scrollTo offset=${clamped} animated=${animated} (horizontal=${this.isHorizontal})`,
      );
      this.scrollView.scrollTo({ x: target.x, y: target.y, animated });
      return;
    }
    dlog(`Angular VirtualizedList scrollTo offset=${clamped} pending-ref`);
    this.commandedOffset = target;
    this.cdr.markForCheck();
  }

  private offsetForIndexLocal(index: number, viewPosition: number, viewOffset: number): number {
    const m = this.metricsCore;
    return offsetForIndex(
      index,
      viewPosition,
      viewOffset,
      m.count,
      m.offsets,
      m.lengths,
      this.viewportLength,
    );
  }

  // ---- after-commit effects (run in ngAfterViewChecked, the post-render seam) ----

  // Batch fill: when the throttled window has not reached the target, schedule a re-render so the
  // window keeps filling toward target over successive ticks (RN's incremental fill).
  private effectBatchFill(): void {
    const m = this.metricsCore;
    if (this.batchTimer !== null) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    if (m.first <= m.target.first && m.last >= m.target.last) return;
    this.batchTimer = setTimeout(() => {
      this.batchTimer = null;
      this.measureVersion += 1;
      this.cdr.markForCheck();
    }, this.updateCellsBatchingPeriodValue);
  }

  // onEndReached: fire only when the actual last cell is rendered AND within threshold; dedup by
  // content length; re-arm on scroll away from the end (RN _maybeCallOnEdgeReached).
  private effectEndReached(): void {
    if (!this.endReached.observed || this.viewportLength <= EMPTY_OFFSET) return;
    const m = this.metricsCore;
    const { distanceFromEnd, withinThreshold } = computeEndReached(
      m.total,
      this.scrollOffset,
      this.viewportLength,
      this.onEndReachedThresholdValue,
    );
    const { shouldFire, nextSentForContentLength } = decideEdgeReached({
      withinThreshold,
      edgeCellRendered: m.last === m.count - 1,
      total: m.total,
      sentForContentLength: this.sentEndForContentLength,
    });
    this.sentEndForContentLength = nextSentForContentLength;
    if (shouldFire) {
      dlog(
        `Angular VirtualizedList endReached distanceFromEnd=${distanceFromEnd} ` +
          `(last=${m.last} of ${m.count}, contentLength=${m.total})`,
      );
      this.endReached.emit({ distanceFromEnd });
    }
  }

  // startReached: the top-edge twin of endReached.
  private effectStartReached(): void {
    if (!this.startReached.observed || this.viewportLength <= EMPTY_OFFSET) return;
    const m = this.metricsCore;
    const { distanceFromStart, withinThreshold } = computeStartReached(
      this.scrollOffset,
      this.viewportLength,
      this.onStartReachedThresholdValue,
    );
    const { shouldFire, nextSentForContentLength } = decideEdgeReached({
      withinThreshold,
      edgeCellRendered: m.first === FIRST_INDEX,
      total: m.total,
      sentForContentLength: this.sentStartForContentLength,
    });
    this.sentStartForContentLength = nextSentForContentLength;
    if (shouldFire) {
      dlog(
        `Angular VirtualizedList startReached distanceFromStart=${distanceFromStart} ` +
          `(first=${m.first}, contentLength=${m.total})`,
      );
      this.startReached.emit({ distanceFromStart });
    }
  }

  // Viewability: recompute which rendered cells clear the threshold and, if the viewable set
  // changed, fire viewableItemsChanged + every config/callback pair, honoring minimumViewTime.
  private effectViewability(): void {
    const m = this.metricsCore;
    const pairs = buildViewabilityPairs(
      this.viewableItemsChanged.observed
        ? (info: IViewableItemsChangedInfo<ItemT>): void => this.viewableItemsChanged.emit(info)
        : undefined,
      this.viewabilityConfig,
      this.viewabilityConfigCallbackPairs,
    );
    if (pairs.length === EMPTY_OFFSET || this.viewportLength <= EMPTY_OFFSET) return;
    if (m.count === FIRST_INDEX) return;

    const { tokens, map } = computeViewableSet({
      first: m.first,
      last: m.last,
      count: m.count,
      offsets: m.offsets,
      lengths: m.lengths,
      scrollOffset: this.scrollOffset,
      viewportLength: this.viewportLength,
      data: this.data,
      getItem: this.getItem,
      keyExtractor: this.keyExtractor,
      pairs,
      hasInteracted: this.hasInteracted,
    });
    const diff = diffViewable(this.lastViewable, map, tokens);
    if (!diff.hasChanged) return;

    const commitAndFire = (): void => {
      this.lastViewable = map;
      dlog(
        `Angular VirtualizedList viewable=${tokens.length} changed=${diff.changed.length} ` +
          `(window [${m.first}, ${m.last}])`,
      );
      const info: IViewableItemsChangedInfo<ItemT> = {
        viewableItems: tokens,
        changed: diff.changed,
      };
      for (const pair of pairs) pair.onViewableItemsChanged(info);
    };

    const minimumViewTime = maxMinimumViewTime(pairs);
    if (this.viewableTimer !== null) {
      clearTimeout(this.viewableTimer);
      this.viewableTimer = null;
    }
    if (minimumViewTime > EMPTY_OFFSET) {
      dlog(
        `Angular VirtualizedList viewability debounce ${minimumViewTime}ms (window [${m.first}, ${m.last}])`,
      );
      this.viewableTimer = setTimeout(() => {
        this.viewableTimer = null;
        commitAndFire();
      }, minimumViewTime);
      return;
    }
    commitAndFire();
  }

  // initialScrollIndex: once the first viewport is known, jump to that index a single time.
  private effectInitialScroll(): void {
    if (this.initialScrollIndex === undefined || this.appliedInitialScroll) return;
    if (this.viewportLength <= EMPTY_OFFSET || this.metricsCore.count === FIRST_INDEX) return;
    this.appliedInitialScroll = true;
    // The initial jump is instant (RN does not animate initialScrollIndex).
    this.scrollToPixel(
      this.offsetForIndexLocal(this.initialScrollIndex, FIRST_INDEX, EMPTY_OFFSET),
      false,
    );
  }

  // maintainVisibleContentPosition JS anchor adjustment: track the key of the item at
  // minIndexForVisible; when a prepend moves it down, add the inserted extent in the leading SPACER
  // (the off-window items native MVCP cannot see) to scrollOffset so the anchored item does not jump
  // (RN getDerivedStateFromProps).
  private effectMaintainVisibleContentPosition(): void {
    const m = this.metricsCore;
    const { firstVisibleKey, action } = computeMvcpAdjustment({
      minIndexForVisible: this.maintainVisibleContentPosition?.minIndexForVisible,
      autoscrollToTopThreshold: this.maintainVisibleContentPosition?.autoscrollToTopThreshold,
      count: m.count,
      committedFirst: this.committedWindow.first,
      offsets: m.offsets,
      scrollOffset: this.scrollOffset,
      prevFirstVisibleKey: this.firstVisibleKey,
      keyFor: index => this.keyFor(index),
    });
    if (action.kind === 'autoscroll-top') this.scrollToPixel(EMPTY_OFFSET, true);
    else if (action.kind === 'shift') this.scrollToPixel(action.offset, false);
    this.firstVisibleKey = firstVisibleKey;
  }
}
