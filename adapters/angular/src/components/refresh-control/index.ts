// RefreshControl, the Angular lifecycle half. On iOS this is the PullToRefreshView Fabric node that
// lives INSIDE a ScrollView (a childless sibling before the content container); on Android it is
// AndroidSwipeRefreshLayout and WRAPS the scroll view, receiving it through <ng-content>.
// The Angular twin of the React/Vue RefreshControl. There is no JS-side platform renaming and no
// shared render fn — every prop forwards straight to the native node, which reads the ones it
// understands and ignores the rest, so the Android-only and iOS-only families ride down harmlessly
// on both. So this folds aria/role through the shared resolveAccessibilityProps and maps the native
// props + a11y + onRefresh straight onto the symbiote-refresh-control host, children via <ng-content>.
// No platform branch (one composed component both platforms), so this stays a flat single file.
//
// `refreshing` is a controlled prop: the parent owns it and pushes it down each commit; native
// reports the gesture via the direct `topRefresh` event, which the engine routes to the host's
// `refresh` listener (Angular blocks [onX] property bindings; events flow through (event) only).

import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  inject,
  Input,
  Output,
  ViewChild,
  type AfterViewInit,
  type OnChanges,
  type OnInit,
  type SimpleChanges,
} from '@angular/core';
import {
  resolveAccessibilityProps,
  type IAccessibilityProps,
  type IAccessibilityStateValue,
  type IAriaProps,
} from '@symbiote-native/components';
import {
  dispatchViewCommand,
  dlog,
  isSymbioteEvent,
  isSymbioteNode,
  type IStyleProp,
  type ISymbioteEvent,
  type IViewStyle,
} from '@symbiote-native/engine';
import { anchorHostStyle, RefreshControlHost, SymbioteHostPropsDirective } from '../../primitives';

// Record<string, unknown> already tolerates `style` holding the [anchorHostStyle, this.style]
// array anchorHostStyle's merge produces (see hostProps below) — no widening needed.
type IHostProps = Record<string, unknown>;

// Mirrors React's IRefreshControlProps minus children (Angular takes the Android-wrapped scroll view
// via <ng-content>), declared per-adapter over the shared accessibility base since the framework-specific
// children slot keeps it from being fully shared across adapters. Read the React reference for the
// native prop names.
export interface IAngularRefreshControlProps extends IAccessibilityProps, IAriaProps {
  refreshing: boolean;
  // RN's onRefresh is `() => void | Promise<void>`, the handler may be async; the promise is
  // fire-and-forget (native already starts refreshing on the gesture).
  onRefresh?: () => void | Promise<void>;
  tintColor?: string;
  title?: string;
  titleColor?: string;
  progressViewOffset?: number;
  // Android-only spinner styling (RN RefreshControlPropsAndroid): `colors` are the indicator's
  // animated stroke colors, `progressBackgroundColor` the disc behind it, `size` the diameter preset.
  // AndroidSwipeRefreshLayout reads them; PullToRefreshView on iOS ignores unknown props.
  colors?: readonly string[];
  progressBackgroundColor?: string;
  size?: 'default' | 'large';
  // Android-only native prop forwarded to AndroidSwipeRefreshLayout; iOS native never reads it.
  enabled?: boolean;
  // The Android scroll-view wrap injects the layout half of the style onto this host; iOS leaves it
  // unset (the RefreshControl is a childless sibling). Harmless to forward on both.
  style?: IStyleProp<IViewStyle>;
}

// What the RefreshControl component itself takes as plain @Input()s: the full surface minus the
// refresh/accessibility events, which it exposes as real @Output() EventEmitters instead (mirrors
// Pressable's IAngularPressableInputs in pressable/index.ts).
export type IAngularRefreshControlInputs = Omit<
  IAngularRefreshControlProps,
  | 'onRefresh'
  | 'onAccessibilityAction'
  | 'onAccessibilityTap'
  | 'onMagicTap'
  | 'onAccessibilityEscape'
>;

@Component({
  selector: 'RefreshControl',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [RefreshControlHost, SymbioteHostPropsDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <symbiote-refresh-control
      #host
      [symbioteHostProps]="hostProps"
      (refresh)="handleRefresh()"
      (accessibilityAction)="emit(accessibilityAction, $event)"
      (accessibilityTap)="emit(accessibilityTap, $event)"
      (magicTap)="emit(magicTap, $event)"
      (accessibilityEscape)="emit(accessibilityEscape, $event)"
    >
      <ng-content></ng-content>
    </symbiote-refresh-control>
  `,
})
export class RefreshControl
  implements IAngularRefreshControlInputs, OnInit, OnChanges, AfterViewInit
{
  // Controlled prop the parent owns; required to match the React reference surface.
  @Input({ required: true }) refreshing!: boolean;
  // RN's onRefresh is `() => void | Promise<void>`, so the callback shape allows an async handler;
  // the @Output() itself only signals the gesture (fire-and-forget, native already starts refreshing).
  @Output() readonly refresh = new EventEmitter<void>();
  @Input() tintColor?: string;
  @Input() title?: string;
  @Input() titleColor?: string;
  @Input() progressViewOffset?: number;
  @Input() colors?: readonly string[];
  @Input() progressBackgroundColor?: string;
  @Input() size?: 'default' | 'large';
  @Input() enabled?: boolean;
  @Input() style?: IStyleProp<IViewStyle>;
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
  @Output() readonly accessibilityAction = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityTap = new EventEmitter<ISymbioteEvent>();
  @Output() readonly magicTap = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityEscape = new EventEmitter<ISymbioteEvent>();
  @Input() role?: IAriaProps['role'];
  @Input('aria-label') ariaLabel?: string;
  @Input('aria-labelledby') ariaLabelledBy?: string;
  @Input('aria-live') ariaLive?: IAriaProps['aria-live'];
  @Input('aria-hidden') ariaHidden?: boolean;
  @Input('aria-busy') ariaBusy?: boolean;
  @Input('aria-checked') ariaChecked?: boolean | 'mixed';
  @Input('aria-disabled') ariaDisabled?: boolean;
  @Input('aria-expanded') ariaExpanded?: boolean;
  @Input('aria-selected') ariaSelected?: boolean;
  @Input('aria-modal') ariaModal?: boolean;
  @Input('aria-valuemax') ariaValueMax?: number;
  @Input('aria-valuemin') ariaValueMin?: number;
  @Input('aria-valuenow') ariaValueNow?: number;
  @Input('aria-valuetext') ariaValueText?: string;

  // The inner symbiote-refresh-control primitive — NOT this component's own anchor host. Used for
  // the imperative dispatchViewCommand calls below.
  @ViewChild('host') private host?: RefreshControlHost;

  // This component's OWN host — the non-painting anchor `class="..."` at the use site resolves
  // onto (see anchorHostStyle's doc comment) — distinct from `host` above, which targets the real
  // inner `symbiote-refresh-control` primitive one level down.
  private readonly elementRef = inject(ElementRef);

  private lastNativeRefreshing = false;
  private refreshNativeNode: unknown;

  ngOnInit(): void {
    dlog('RefreshControl -> PullToRefreshView');
    dlog(`RefreshControl refreshing=${String(this.refreshing)}`);
    if (this.enabled !== undefined)
      dlog(`RefreshControl enabled=${String(this.enabled)} (Android-only)`);
    if (this.refresh.observed) dlog('RefreshControl refresh listener wired');
  }

  ngAfterViewInit(): void {
    this.lastNativeRefreshing = this.refreshing;
  }

  ngOnChanges(changes: SimpleChanges): void {
    const refreshing = changes.refreshing;
    if (refreshing === undefined) return;
    if (refreshing.firstChange) {
      this.lastNativeRefreshing = this.refreshing;
      return;
    }
    this.syncNativeRefreshing(this.refreshNativeNode ?? this.host?.nativeElement);
  }

  // Native starts the spinner before JS runs. Mirror RN's RefreshControl controlled-component
  // handshake: remember that native is refreshing, call the user's callback, then after Angular has
  // had a chance to propagate `[refreshing]`, force native back to the JS value if it stayed false.
  handleRefresh(nativeNode: unknown = this.host?.nativeElement): void {
    this.refreshNativeNode = nativeNode;
    this.lastNativeRefreshing = true;
    this.refresh.emit();
    queueMicrotask(() => this.syncNativeRefreshing(nativeNode));
  }

  private syncNativeRefreshing(nativeNode: unknown): void {
    if (this.refreshing === this.lastNativeRefreshing) return;
    if (!isSymbioteNode(nativeNode)) return;
    dispatchViewCommand(nativeNode, 'setNativeRefreshing', [this.refreshing]);
    this.lastNativeRefreshing = this.refreshing;
  }

  // Forward an engine event to the matching @Output(), narrowing the template's untyped $event
  // first. The accessibility* events arrive on the engine's structural event channel.
  emit(emitter: EventEmitter<ISymbioteEvent>, event: unknown): void {
    if (isSymbioteEvent(event)) emitter.emit(event);
  }

  // The full native + a11y prop bag applied onto the host in one shot via
  // [symbioteHostProps], instead of enumerating each key as its own template binding. The
  // anchor's class-derived style goes FIRST, this component's own explicit `style` @Input SECOND
  // — flattenStyle's later-wins collapse keeps an explicit [style] winning over its ambient class.
  get hostProps(): IHostProps {
    return {
      refreshing: this.refreshing,
      tintColor: this.tintColor,
      title: this.title,
      titleColor: this.titleColor,
      progressViewOffset: this.progressViewOffset,
      colors: this.colors,
      progressBackgroundColor: this.progressBackgroundColor,
      size: this.size,
      enabled: this.enabled,
      style: [anchorHostStyle(this.elementRef), this.style],
      testID: this.testID,
      nativeID: this.nativeID,
      accessible: this.accessible,
      ...this.folded,
    };
  }

  // Fold the web aria-*/role aliases into the canonical accessibility* props once per render, so the
  // host node never sees an aria-* key (native ignores them) — the shared transform every adapter runs.
  get folded(): Partial<IAngularRefreshControlProps> {
    return resolveAccessibilityProps({
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
}
