// SafeAreaView, the Angular lifecycle half. A plain view whose native side insets its
// children to the safe area (notch, rounded corners, system bars). There is no JS-side
// translation — RN renders the native RCTSafeAreaView and lets the host do the inset math —
// so this folds aria/role through the shared resolveAccessibilityProps and maps style +
// a11y + onLayout straight onto the symbiote-safe-area-view host, children via <ng-content>.
// The Angular twin of the React/Vue SafeAreaView. No platform branch (one Fabric name both
// platforms), so this stays a flat single file.

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
import { anchorHostStyle, SafeAreaViewHost, SymbioteHostPropsDirective } from '../../primitives';

// Mirrors React's ISafeAreaViewProps minus children (Angular takes children via <ng-content>),
// declared per-adapter over the shared accessibility base since the framework-specific children
// slot keeps it from being fully shared across adapters.
export interface IAngularSafeAreaViewProps extends IAccessibilityProps, IAriaProps {
  style?: IStyleProp<IViewStyle>;
  onLayout?: (event: ISymbioteEvent) => void;
}

// What the component itself takes as plain @Input()s: the full surface minus onLayout and the
// accessibility callbacks, which it exposes as real @Output() EventEmitters instead (see the
// class below), mirroring Pressable's IAngularPressableInputs split.
export type IAngularSafeAreaViewInputs = Omit<
  IAngularSafeAreaViewProps,
  | 'onLayout'
  | 'onAccessibilityAction'
  | 'onAccessibilityTap'
  | 'onMagicTap'
  | 'onAccessibilityEscape'
>;

@Component({
  selector: 'SafeAreaView',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [SafeAreaViewHost, SymbioteHostPropsDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <symbiote-safe-area-view
      [symbioteHostProps]="hostProps"
      (accessibilityAction)="emit(accessibilityAction, $event)"
      (accessibilityTap)="emit(accessibilityTap, $event)"
      (magicTap)="emit(magicTap, $event)"
      (accessibilityEscape)="emit(accessibilityEscape, $event)"
      (layout)="emit(layout, $event)"
    >
      <ng-content></ng-content>
    </symbiote-safe-area-view>
  `,
})
export class SafeAreaView implements IAngularSafeAreaViewInputs {
  @Input() style?: IStyleProp<IViewStyle>;
  // Real @Output()s, not `[onX]="…"` callbacks. Safe to name `layout` the same as the native
  // `layout` event fired inside this component's own template — the engine's bubble() treats
  // ANCHOR_HOST_COMPONENTS as transparent to listener lookup, so there is no double-fire.
  @Output() readonly layout = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityAction = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityTap = new EventEmitter<ISymbioteEvent>();
  @Output() readonly magicTap = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityEscape = new EventEmitter<ISymbioteEvent>();
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
  // onto (see anchorHostStyle's doc comment). SafeAreaView has no inner ViewChild, so this is
  // the only ElementRef in the class.
  private readonly elementRef = inject(ElementRef);

  // Forward an engine event to the matching @Output(), narrowing the template's untyped
  // $event first. layout / accessibility* arrive on the engine's structural event channel
  // (Angular blocks [onX] property bindings; events flow through (event) only).
  emit(emitter: EventEmitter<ISymbioteEvent>, event: unknown): void {
    if (isSymbioteEvent(event)) emitter.emit(event);
  }

  // Folds style/testID/nativeID/accessible alongside the accessibility*/aria-*/role surface into
  // one bag for [symbioteHostProps] — resolveAccessibilityProps takes the whole props object (not
  // just the accessibility slice) and returns it with aria-*/role folded into accessibility*, so
  // the host node never sees an aria-* key (native ignores them), same transform React's
  // SafeAreaView runs over its whole `rawProps`. The anchor's class-derived style goes FIRST, this
  // component's own explicit `style` @Input SECOND — flattenStyle's later-wins collapse keeps an
  // explicit [style] winning over its ambient class.
  get hostProps(): Record<string, unknown> {
    return resolveAccessibilityProps({
      style: [anchorHostStyle(this.elementRef), this.style],
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
}
