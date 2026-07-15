// Modal: the Angular lifecycle half. RCTModalHostView is an ordinary Fabric host node committing
// through the same childSet as the rest of the tree (no second JS surface). The style math (the
// backdrop override, the container/host styles, the presentationStyle default), the visible gate,
// and the iOS keep-alive reducer all live framework-agnostic in @symbiote-native/components and are shared
// verbatim with React/Vue; here Angular supplies only the lifecycle: the keep-alive state + a
// POST-render transition (ngOnChanges queues the reducer on a microtask so it runs AFTER the render
// that used the OLD state, the Angular twin of React's useEffect / Vue's post-flush watch — one
// keep-alive frame survives the visible→hidden transition), reusing renderModal's resolved props.
// The user children nest UNDER the container View via <ng-content>.

import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  inject,
  Input,
  Output,
  type OnChanges,
  type OnInit,
  type SimpleChanges,
} from '@angular/core';
import {
  createInitialModalState,
  modalReducer,
  renderModal,
  resolveAccessibilityProps,
  shouldRenderModal,
  type IAccessibilityProps,
  type IAccessibilityStateValue,
  type IAriaProps,
  type IModalAnimationType,
  type IModalOrientation,
  type IModalOrientationChangeEvent,
  type IModalPresentationStyle,
  type IModalState,
} from '@symbiote-native/components';
import {
  dlog,
  isSymbioteEvent,
  type IStyleProp,
  type ISymbioteEvent,
  type IViewStyle,
} from '@symbiote-native/engine';
import { anchorHostStyle, ModalHost, SymbioteHostPropsDirective, ViewHost } from '../../primitives';

export type {
  IModalAnimationType,
  IModalPresentationStyle,
  IModalOrientation,
  IModalOrientationChangeEvent,
} from '@symbiote-native/components';

const ORIENTATIONS: ReadonlyArray<IModalOrientation> = ['portrait', 'landscape'];

function readOrientation(event: ISymbioteEvent): IModalOrientationChangeEvent | undefined {
  const native = event.nativeEvent;
  if (typeof native !== 'object' || native === null || !('orientation' in native)) return undefined;
  const orientation = native.orientation;
  return ORIENTATIONS.some(value => value === orientation)
    ? { orientation: orientation === 'landscape' ? 'landscape' : 'portrait' }
    : undefined;
}

// Mirrors React's IModalProps minus children (Angular takes children via <ng-content>).
export interface IAngularModalProps extends IAccessibilityProps, IAriaProps {
  visible?: boolean;
  transparent?: boolean;
  backdropColor?: string;
  animationType?: IModalAnimationType;
  presentationStyle?: IModalPresentationStyle;
  supportedOrientations?: ReadonlyArray<IModalOrientation>;
  hardwareAccelerated?: boolean;
  statusBarTranslucent?: boolean;
  navigationBarTranslucent?: boolean;
  allowSwipeDismissal?: boolean;
  onShow?: () => void;
  onDismiss?: () => void;
  onRequestClose?: () => void;
  onOrientationChange?: (event: IModalOrientationChangeEvent) => void;
  style?: IStyleProp<IViewStyle>;
}

// What the Modal component itself takes as plain @Input()s: the full surface minus the
// show/dismiss/close/orientation and accessibility events, which it exposes as real @Output()
// EventEmitters instead (see the class below), mirroring the Pressable family's onPress -> press
// conversion (adapters/angular/src/components/pressable/index.ts).
export type IAngularModalInputs = Omit<
  IAngularModalProps,
  | 'onShow'
  | 'onDismiss'
  | 'onRequestClose'
  | 'onOrientationChange'
  | 'onAccessibilityAction'
  | 'onAccessibilityTap'
  | 'onMagicTap'
  | 'onAccessibilityEscape'
>;

@Component({
  selector: 'Modal',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [ModalHost, ViewHost, SymbioteHostPropsDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (shouldRender) {
      <symbiote-modal
        [symbioteHostProps]="hostProps"
        (show)="show.emit()"
        (dismiss)="dismiss.emit()"
        (requestClose)="requestClose.emit()"
        (orientationChange)="emitOrientation($event)"
        (accessibilityAction)="emit(accessibilityAction, $event)"
        (accessibilityTap)="emit(accessibilityTap, $event)"
        (magicTap)="emit(magicTap, $event)"
        (accessibilityEscape)="emit(accessibilityEscape, $event)"
      >
        <symbiote-view [style]="containerStyle" [collapsable]="false">
          <ng-content></ng-content>
        </symbiote-view>
      </symbiote-modal>
    }
  `,
})
export class Modal implements IAngularModalInputs, OnInit, OnChanges {
  @Output() readonly show = new EventEmitter<void>();
  @Output() readonly dismiss = new EventEmitter<void>();
  @Output() readonly requestClose = new EventEmitter<void>();
  @Output() readonly orientationChange = new EventEmitter<IModalOrientationChangeEvent>();
  @Output() readonly accessibilityAction = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityTap = new EventEmitter<ISymbioteEvent>();
  @Output() readonly magicTap = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityEscape = new EventEmitter<ISymbioteEvent>();
  @Input() visible?: boolean;
  @Input() transparent?: boolean;
  @Input() backdropColor?: string;
  @Input() animationType?: IModalAnimationType;
  @Input() presentationStyle?: IModalPresentationStyle;
  @Input() supportedOrientations?: ReadonlyArray<IModalOrientation>;
  @Input() hardwareAccelerated?: boolean;
  @Input() statusBarTranslucent?: boolean;
  @Input() navigationBarTranslucent?: boolean;
  @Input() allowSwipeDismissal?: boolean;
  @Input() style?: IStyleProp<IViewStyle>;
  @Input() testID?: string;
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

  // The iOS keep-alive (state/modal.ts): on visible→hidden the node renders one more frame
  // (isRendered still true) before unmounting, so the native onDismiss can arrive.
  private state: IModalState = createInitialModalState(false);

  private readonly changeDetector = inject(ChangeDetectorRef);
  // This component's OWN host — the non-painting anchor `class="..."` at the use site resolves
  // onto (see anchorHostStyle's doc comment) — NOT the inner `symbiote-view [style]="containerStyle"`
  // that hosts the user children; the outer `symbiote-modal` node (bound via `hostProps` below) is
  // the real primitive the anchor sits in front of.
  private readonly elementRef = inject(ElementRef);

  ngOnInit(): void {
    this.state = createInitialModalState(this.visible === true);
  }

  ngOnChanges(changes: SimpleChanges): void {
    const visibleChange = changes.visible;
    // First change is reflected by the ngOnInit seed; only later toggles drive the keep-alive.
    if (visibleChange === undefined || visibleChange.firstChange) return;
    const isVisible = this.visible === true;
    // Queue on a microtask so the reducer runs AFTER this CD pass renders with the OLD state —
    // the keep-alive frame. A synchronous dispatch here would unmount in the same pass.
    queueMicrotask(() => {
      this.state = modalReducer(this.state, isVisible ? { type: 'show' } : { type: 'hide' });
      this.changeDetector.markForCheck();
    });
  }

  get shouldRender(): boolean {
    const render = shouldRenderModal(this.visible === true, this.state);
    if (!render) dlog('Modal hidden -> no node committed');
    return render;
  }

  // renderModal owns the backdrop/presentationStyle/style math (shared with React/Vue); the
  // adapter reads the resolved host + container props off the Descriptor it returns.
  private get descriptor() {
    return renderModal({
      visible: this.visible,
      transparent: this.transparent,
      backdropColor: this.backdropColor,
      animationType: this.animationType,
      presentationStyle: this.presentationStyle,
      supportedOrientations: this.supportedOrientations,
      hardwareAccelerated: this.hardwareAccelerated,
      statusBarTranslucent: this.statusBarTranslucent,
      navigationBarTranslucent: this.navigationBarTranslucent,
      allowSwipeDismissal: this.allowSwipeDismissal,
      style: this.style,
      passthrough: resolveAccessibilityProps(this.accessibilityInputs()),
    });
  }

  // renderModal's own MODAL_HOST_STYLE (position:'absolute') is the outer symbiote-modal node's
  // style; the anchor's class-derived style goes FIRST, that resolved style SECOND —
  // flattenStyle's later-wins collapse keeps the modal's own style winning over its ambient class.
  get hostProps(): Record<string, unknown> {
    const descriptorProps = this.descriptor.props;
    return { ...descriptorProps, style: [anchorHostStyle(this.elementRef), descriptorProps.style] };
  }

  get containerStyle(): unknown {
    const container = this.descriptor.children[0];
    return typeof container === 'string' ? undefined : container.props.style;
  }

  emit(emitter: EventEmitter<ISymbioteEvent>, event: unknown): void {
    if (isSymbioteEvent(event)) emitter.emit(event);
  }

  emitOrientation(event: unknown): void {
    if (!isSymbioteEvent(event)) return;
    const change = readOrientation(event);
    if (change !== undefined) this.orientationChange.emit(change);
  }

  // Typed as the a11y intersection WITH the string index (the bag renderModal spreads into the
  // host props), so resolveAccessibilityProps's result stays assignable to passthrough.
  private accessibilityInputs(): IAccessibilityProps & IAriaProps & Record<string, unknown> {
    return {
      testID: this.testID,
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
    };
  }
}
