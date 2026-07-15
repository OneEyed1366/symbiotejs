// InputAccessoryView, the Angular lifecycle half (iOS). A real Fabric host node
// (RCTInputAccessoryView) that docks its content above the keyboard; a TextInput points at it by
// nativeID through its inputAccessoryViewID. There is no JS-side translation — style / nativeID /
// backgroundColor map straight onto the intrinsic, children via <ng-content> — so this folds
// aria/role through the shared resolveAccessibilityProps and binds the rest onto the host. The
// Angular twin of the React/Vue InputAccessoryView. No platform branch, so this stays flat.

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

  // Folds every host-bound prop into one record for `symbioteHostProps` — the same fields the
  // template used to bind one-by-one, assembled locally (no shared renderX for this component yet).
  // The anchor's class-derived style goes FIRST, this component's own explicit `style` @Input
  // SECOND — flattenStyle's later-wins collapse keeps an explicit [style] winning over its class.
  get hostProps(): Record<string, unknown> {
    const folded = this.folded;
    return {
      style: [anchorHostStyle(this.elementRef), this.style],
      nativeID: this.nativeID,
      backgroundColor: this.backgroundColor,
      testID: this.testID,
      accessible: this.accessible,
      accessibilityLabel: folded.accessibilityLabel,
      accessibilityHint: folded.accessibilityHint,
      accessibilityRole: folded.accessibilityRole,
      accessibilityState: folded.accessibilityState,
      accessibilityValue: folded.accessibilityValue,
      accessibilityActions: folded.accessibilityActions,
      accessibilityLabelledBy: folded.accessibilityLabelledBy,
      importantForAccessibility: folded.importantForAccessibility,
      accessibilityLiveRegion: folded.accessibilityLiveRegion,
      screenReaderFocusable: folded.screenReaderFocusable,
      accessibilityViewIsModal: folded.accessibilityViewIsModal,
      accessibilityElementsHidden: folded.accessibilityElementsHidden,
      accessibilityIgnoresInvertColors: folded.accessibilityIgnoresInvertColors,
      accessibilityLanguage: folded.accessibilityLanguage,
      accessibilityRespondsToUserInteraction: folded.accessibilityRespondsToUserInteraction,
      accessibilityShowsLargeContentViewer: folded.accessibilityShowsLargeContentViewer,
      accessibilityLargeContentTitle: folded.accessibilityLargeContentTitle,
    };
  }

  // Fold the web aria-*/role aliases into the canonical accessibility* props once per render, so
  // the host node never sees an aria-* key (native ignores them) — the shared transform.
  get folded(): Partial<IAngularInputAccessoryViewProps> {
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
