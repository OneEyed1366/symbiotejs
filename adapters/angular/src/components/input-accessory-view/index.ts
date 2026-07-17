// InputAccessoryView, the Angular lifecycle half (iOS). RCTInputAccessoryView is a real Fabric
// host node that docks its content above the keyboard; a TextInput points at it by nativeID through
// its inputAccessoryViewID. The host-node assembly (nativeID / backgroundColor / style /
// accessibility forwarding) lives framework-agnostic in
// @symbiote-native/components/renderInputAccessoryView and is shared verbatim with React/Vue; here
// Angular supplies only the lifecycle — it folds aria/role, reads the resolved props off the
// Descriptor, and nests the user children under the host via <ng-content>. The Angular twin of the
// React/Vue InputAccessoryView. No platform branch, so this stays flat.

import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  inject,
  Input,
  Output,
} from '@angular/core';
import {
  renderInputAccessoryView,
  resolveAccessibilityProps,
  type IAccessibilityProps,
  type IAccessibilityStateValue,
  type IAriaProps,
} from '@symbiote-native/components';
import {
  isSymbioteEvent,
  type IStyleProp,
  type ISymbioteEvent,
  type IViewStyle,
} from '@symbiote-native/engine';
import {
  anchorHostStyle,
  InputAccessoryViewHost,
  SymbioteHostPropsDirective,
} from '../../primitives';

// Mirrors React's IInputAccessoryViewProps minus children (Angular takes children via
// <ng-content>), declared per-adapter over the shared a11y base.
export interface IAngularInputAccessoryViewProps extends IAccessibilityProps, IAriaProps {
  // The id a TextInput's inputAccessoryViewID points at to dock above its keyboard.
  nativeID?: string;
  backgroundColor?: string;
  style?: IStyleProp<IViewStyle>;
}

// What the component itself takes as plain @Input()s: the full surface minus the accessibility
// callbacks, which it exposes as real @Output() EventEmitters instead (see the class below),
// mirroring Pressable's IAngularPressableInputs split.
export type IAngularInputAccessoryViewInputs = Omit<
  IAngularInputAccessoryViewProps,
  'onAccessibilityAction' | 'onAccessibilityTap' | 'onMagicTap' | 'onAccessibilityEscape'
>;

@Component({
  selector: 'InputAccessoryView',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [InputAccessoryViewHost, SymbioteHostPropsDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <symbiote-input-accessory-view
      [symbioteHostProps]="hostProps"
      (accessibilityAction)="emit(accessibilityAction, $event)"
      (accessibilityTap)="emit(accessibilityTap, $event)"
      (magicTap)="emit(magicTap, $event)"
      (accessibilityEscape)="emit(accessibilityEscape, $event)"
    >
      <ng-content></ng-content>
    </symbiote-input-accessory-view>
  `,
})
export class InputAccessoryView implements IAngularInputAccessoryViewInputs {
  @Input() nativeID?: string;
  @Input() backgroundColor?: string;
  @Input() style?: IStyleProp<IViewStyle>;
  @Output() readonly accessibilityAction = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityTap = new EventEmitter<ISymbioteEvent>();
  @Output() readonly magicTap = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityEscape = new EventEmitter<ISymbioteEvent>();
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

  // This component's OWN host — the non-painting anchor `class="..."` at the use site resolves
  // onto (see anchorHostStyle's doc comment). InputAccessoryView has no inner ViewChild, so this
  // is the only ElementRef in the class.
  private readonly elementRef = inject(ElementRef);

  // Forward an engine event to the matching @Output(), narrowing the template's untyped $event.
  emit(emitter: EventEmitter<ISymbioteEvent>, event: unknown): void {
    if (isSymbioteEvent(event)) emitter.emit(event);
  }

  // renderInputAccessoryView owns the host-node assembly (shared with React/Vue); the adapter reads
  // the resolved host props off the Descriptor it returns.
  private get descriptor() {
    return renderInputAccessoryView({
      nativeID: this.nativeID,
      backgroundColor: this.backgroundColor,
      style: this.style,
      passthrough: resolveAccessibilityProps(this.accessibilityInputs()),
    });
  }

  // The anchor's class-derived style goes FIRST, the Descriptor's resolved style SECOND —
  // flattenStyle's later-wins collapse keeps an explicit [style] winning over its ambient class.
  get hostProps(): Record<string, unknown> {
    const descriptorProps = this.descriptor.props;
    return { ...descriptorProps, style: [anchorHostStyle(this.elementRef), descriptorProps.style] };
  }

  // Typed as the a11y intersection WITH the string index (the bag renderInputAccessoryView spreads
  // into the host props), so resolveAccessibilityProps's result stays assignable to passthrough.
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
