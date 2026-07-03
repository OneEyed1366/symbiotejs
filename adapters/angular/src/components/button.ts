// Button for Angular. The minimal cross-platform button in RN's iOS shape (Button.js): a
// TouchableOpacity wrapping a Text. The base text style, the role constant, and the color fold are
// shared in @symbiotejs/components/view; here Angular only composes its TouchableOpacity + a
// symbiote-text child and re-maps the few Button-owned props. The Angular twin of the React/Vue
// adapter's Button. No JS-side platform branch, so this stays a flat single file (ADR 0026).
//
// RN's Button fixes accessibilityRole="button", marks the root accessible, and propagates `disabled`
// into the accessibility state; those three win over any caller value. `title` becomes the Text
// child; disabled forwards straight; touchSoundDisabled maps to the pressable's android_disableSound.
// Every OTHER field of the shared IButtonProps (title, color, disabled, touchSoundDisabled, testID,
// TV-focus, accessibility state) is agnostic and stays RE-EXPORTED from @symbiotejs/components verbatim
// (<prop_types_split_agnostic_vs_per_adapter>). onPress and the four accessibility callbacks are the
// exceptions: each is a real @Output() here (`press`, `accessibilityAction`, `accessibilityTap`,
// `magicTap`, `accessibilityEscape`), mirroring the Vue adapter's Button, which forks the SAME onPress
// field the same way (`Omit<ICoreButtonProps, 'onPress'>` + a `press` emit) — not a new precedent, the
// existing one extended to accessibility.

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
  BUTTON_ACCESSIBILITY_ROLE,
  resolveButtonTextStyle,
  type IAccessibilityProps,
  type IAccessibilityStateValue,
  type IAriaProps,
  type IButtonProps as ICoreButtonProps,
} from '@symbiotejs/components';
import type { ISymbioteEvent, ITextStyle, IStyleProp, IViewStyle } from '@symbiotejs/engine';
import { anchorStyleProp, TextHost } from '../primitives';
import { TouchableOpacity } from './touchable';

export type IButtonProps = Omit<
  ICoreButtonProps,
  | 'onPress'
  | 'onAccessibilityAction'
  | 'onAccessibilityTap'
  | 'onMagicTap'
  | 'onAccessibilityEscape'
>;

@Component({
  selector: 'Button',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [TouchableOpacity, TextHost],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <TouchableOpacity
      [style]="anchorStyle"
      (press)="press.emit($event)"
      [disabled]="disabled"
      [android_disableSound]="touchSoundDisabled"
      [accessibilityRole]="buttonRole"
      [accessible]="true"
      [accessibilityState]="{ disabled }"
      [testID]="testID"
      [nativeID]="nativeID"
      [hasTVPreferredFocus]="hasTVPreferredFocus"
      [nextFocusDown]="nextFocusDown"
      [nextFocusForward]="nextFocusForward"
      [nextFocusLeft]="nextFocusLeft"
      [nextFocusRight]="nextFocusRight"
      [nextFocusUp]="nextFocusUp"
      [accessibilityLabel]="accessibilityLabel"
      [accessibilityHint]="accessibilityHint"
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
      [ariaLabel]="ariaLabel"
      [ariaBusy]="ariaBusy"
      [ariaChecked]="ariaChecked"
      [ariaDisabled]="ariaDisabled"
      [ariaExpanded]="ariaExpanded"
      [ariaHidden]="ariaHidden"
      [ariaLabelledBy]="ariaLabelledBy"
      [ariaLive]="ariaLive"
      [ariaSelected]="ariaSelected"
      [ariaModal]="ariaModal"
      [ariaValueMax]="ariaValueMax"
      [ariaValueMin]="ariaValueMin"
      [ariaValueNow]="ariaValueNow"
      [ariaValueText]="ariaValueText"
      [role]="role"
    >
      <symbiote-text [style]="textStyle">{{ title }}</symbiote-text>
    </TouchableOpacity>
  `,
})
export class Button implements IButtonProps {
  // This component's OWN host — the non-painting anchor `class="..."` at the use site resolves
  // onto (see anchorHostStyle's doc comment in primitives/shared.ts) — NOT the inner
  // TouchableOpacity/Pressable one level down. RN's real Button takes no `style` prop, so this
  // is the only style source forwarded.
  private readonly elementRef = inject(ElementRef);

  @Output() readonly press = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityAction = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityTap = new EventEmitter<ISymbioteEvent>();
  @Output() readonly magicTap = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityEscape = new EventEmitter<ISymbioteEvent>();

  // Button-owned props: title is the Text child, color/disabled fold into the label style, and
  // touchSoundDisabled re-maps onto TouchableOpacity.
  @Input() title = '';
  @Input() color?: string;
  @Input() disabled?: boolean;
  @Input() touchSoundDisabled?: boolean;
  @Input() testID?: string;

  // TV-focus props (Button.js): inert on a phone host, forwarded through TouchableOpacity.
  @Input() hasTVPreferredFocus?: boolean;
  @Input() nextFocusDown?: number;
  @Input() nextFocusForward?: number;
  @Input() nextFocusLeft?: number;
  @Input() nextFocusRight?: number;
  @Input() nextFocusUp?: number;

  // Accessibility surface (IAccessibilityProps). accessibilityRole, accessible, and
  // accessibilityState are declared for surface completeness but Button forces its own
  // (button / true / { disabled }); the caller value is ignored, mirroring RN's Button.js.
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

  // Web-alias a11y surface (IAriaProps). External dashed aliases are exposed as Angular inputs and
  // forwarded to TouchableOpacity's camelCase aria inputs.
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

  // RN's Button is always accessibilityRole="button"; the shared role constant, not a literal.
  readonly buttonRole = BUTTON_ACCESSIBILITY_ROLE;

  // The label style with the caller color tinted in and `disabled` greying it out (disabled wins),
  // computed by the shared fold so every adapter paints the identical button.
  get textStyle(): ITextStyle {
    return resolveButtonTextStyle(this.color, this.disabled);
  }

  get anchorStyle(): IStyleProp<IViewStyle> | undefined {
    return anchorStyleProp<IViewStyle>(this.elementRef);
  }
}
