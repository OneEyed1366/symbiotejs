// The Touchable* family for Angular, all built on Pressable (the Angular twin of the React/Vue
// adapter). The press-timing constants and the deactivation-floor math are shared with every
// adapter (@symbiote-native/components/state/touchable); here Angular owns only the Animated wiring + the
// press scheduling state:
//   TouchableOpacity:   animate an Animated.Value opacity toward activeOpacity on press-in and back
//     to 1 on press-out, driven from Pressable's onPressIn/onPressOut. The opacity Value is held by
//     IDENTITY as a plain field (an engine object, never an @Input / reactive wrap) and the
//     <symbiote-animated-view> leaf commits it every frame.
//   TouchableHighlight: paint underlayColor + lower child opacity while pressed, via Pressable's
//     style-as-function (Pressable drives the pressed flag through its own responder lifecycle).
//   TouchableWithoutFeedback: no visual change, just the press wiring forwarded through Pressable.
//
// Every Touchable's own press/hover/accessibility events are now real @Output() EventEmitters too,
// matching Pressable (which they wrap) — `(press)="handler($event)"`, never `[onPress]="handler"`.
// Non-event config (delayLongPress, hitSlop, ...) still rides down as plain @Input() bindings.
// Accessibility EVENTS forward straight through to Pressable's own outputs
// (`(accessibilityAction)="accessibilityAction.emit($event)"`); accessibility STATE folds the web
// aria-*/role aliases and merges `disabled` into the a11y state on Pressable's own host — no re-fold
// here (the a11y host is Pressable's view, mirroring React's `...rest` -> Pressable). No JS-side
// platform branch, so this stays a flat single file, mirroring React/Vue. Each Touchable
// forwards the Angular Pressable surface verbatim; parity is against that surface, exactly as
// React's Touchable parity is against
// the React Pressable surface.

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
  createTouchableFeedbackHandlers,
  createTouchableFeedbackRuntime,
  highlightPressedStyle,
  DEFAULT_ACTIVE_OPACITY,
  DEFAULT_HIGHLIGHT_CHILD_OPACITY,
  DEFAULT_MIN_PRESS_DURATION_MS,
  DEFAULT_UNDERLAY_COLOR,
  OPACITY_ACTIVE_DURATION_MS,
  OPACITY_INACTIVE_DURATION_MS,
  RESTING_OPACITY,
  type IAccessibilityProps,
  type IAccessibilityStateValue,
  type IAriaProps,
  type IPressableAndroidRippleConfig,
  type IPressState,
  type IPressTimingProps,
  type IRectOffset,
  type ITouchableFeedbackHandlers,
} from '@symbiote-native/components';
import { type ISymbioteEvent, type IStyleProp, type IViewStyle } from '@symbiote-native/engine';
import { anchorHostStyle, anchorStyleProp } from '../../primitives';
import { Pressable, type IAngularPressableInputs } from '../pressable';
import { Animated, AnimatedView } from '../../modules/animated';

// The shared field base for all three: the Pressable INPUT surface (minus style, which each
// Touchable routes differently, and minus the press/hover events, which each Touchable declares as
// its OWN @Output()s below) + RN's press-timing config + the public style. Mirrors React/Vue's
// ITouchableBaseProps. Declared per-adapter over the Angular Pressable surface, since children
// ride <ng-content> here rather than a field, unlike React/Vue's element-returning props.
type IAngularTouchableBaseProps = Omit<IAngularPressableInputs, 'style'> &
  IPressTimingProps & {
    style?: IStyleProp<IViewStyle>;
  };

export type IAngularTouchableOpacityProps = IAngularTouchableBaseProps & {
  activeOpacity?: number;
};

export type IAngularTouchableHighlightProps = IAngularTouchableBaseProps & {
  activeOpacity?: number;
  underlayColor?: string;
};

export type IAngularTouchableWithoutFeedbackProps = IAngularTouchableBaseProps;

// The real setTimeout the shared feedback machine schedules its deferred activation/deactivation on
// (core/components has no timer globals). Returns a canceller so an early release flushes the timer.
function scheduleTimeout(callback: () => void, ms: number): () => void {
  const id = setTimeout(callback, ms);
  return () => clearTimeout(id);
}

@Component({
  selector: 'TouchableOpacity',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [Pressable, AnimatedView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <Pressable
      (press)="press.emit($event)"
      (pressIn)="handlePressIn($event)"
      (pressOut)="handlePressOut($event)"
      (pressMove)="pressMove.emit($event)"
      (longPress)="longPress.emit($event)"
      (hoverIn)="hoverIn.emit($event)"
      (hoverOut)="hoverOut.emit($event)"
      [delayLongPress]="delayLongPress"
      [delayHoverIn]="delayHoverIn"
      [delayHoverOut]="delayHoverOut"
      [disabled]="disabled"
      [cancelable]="cancelable"
      [hitSlop]="hitSlop"
      [pressRetentionOffset]="pressRetentionOffset"
      [unstable_pressDelay]="unstable_pressDelay"
      [android_ripple]="android_ripple"
      [android_disableSound]="android_disableSound"
      [testID]="testID"
      [nativeID]="nativeID"
      [hasTVPreferredFocus]="hasTVPreferredFocus"
      [nextFocusDown]="nextFocusDown"
      [nextFocusForward]="nextFocusForward"
      [nextFocusLeft]="nextFocusLeft"
      [nextFocusRight]="nextFocusRight"
      [nextFocusUp]="nextFocusUp"
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
      [id]="id"
      [role]="role"
    >
      <symbiote-animated-view [style]="animatedStyle">
        <ng-content></ng-content>
      </symbiote-animated-view>
    </Pressable>
  `,
})
export class TouchableOpacity implements IAngularTouchableOpacityProps {
  @Output() readonly press = new EventEmitter<ISymbioteEvent>();
  @Output() readonly pressIn = new EventEmitter<ISymbioteEvent>();
  @Output() readonly pressOut = new EventEmitter<ISymbioteEvent>();
  @Output() readonly pressMove = new EventEmitter<ISymbioteEvent>();
  @Output() readonly longPress = new EventEmitter<ISymbioteEvent>();
  @Output() readonly hoverIn = new EventEmitter<ISymbioteEvent>();
  @Output() readonly hoverOut = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityAction = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityTap = new EventEmitter<ISymbioteEvent>();
  @Output() readonly magicTap = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityEscape = new EventEmitter<ISymbioteEvent>();
  @Input() activeOpacity?: number;
  @Input() delayPressIn?: number;
  @Input() delayPressOut?: number;
  @Input() minPressDuration?: number;
  @Input() style?: IStyleProp<IViewStyle>;
  @Input() delayLongPress?: number;
  @Input() delayHoverIn?: number;
  @Input() delayHoverOut?: number;
  @Input() disabled?: boolean;
  @Input() cancelable?: boolean;
  @Input() hitSlop?: IRectOffset;
  @Input() pressRetentionOffset?: IRectOffset;
  @Input() unstable_pressDelay?: number;
  @Input() android_ripple?: IPressableAndroidRippleConfig;
  @Input() android_disableSound?: boolean;
  @Input() testID?: string;
  @Input() nativeID?: string;
  @Input() hasTVPreferredFocus?: boolean;
  @Input() nextFocusDown?: number;
  @Input() nextFocusForward?: number;
  @Input() nextFocusLeft?: number;
  @Input() nextFocusRight?: number;
  @Input() nextFocusUp?: number;
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
  @Input() ariaLabel?: string;
  @Input() ariaBusy?: boolean;
  @Input() ariaChecked?: boolean | 'mixed';
  @Input() ariaDisabled?: boolean;
  @Input() ariaExpanded?: boolean;
  @Input() ariaHidden?: boolean;
  @Input() ariaLabelledBy?: string;
  @Input() ariaLive?: IAriaProps['aria-live'];
  @Input() ariaSelected?: boolean;
  @Input() ariaModal?: boolean;
  @Input() ariaValueMax?: number;
  @Input() ariaValueMin?: number;
  @Input() ariaValueNow?: number;
  @Input() ariaValueText?: string;
  @Input() id?: string;
  @Input() role?: IAriaProps['role'];

  // One Animated.Value per mount, resting at full opacity. Held by IDENTITY as a plain field (an
  // engine object, never an @Input / reactive wrap); the <symbiote-animated-view> leaf rasterizes
  // it for the first paint and drives it through setNativeProps every frame.
  private readonly opacity = new Animated.Value(RESTING_OPACITY);
  // The shared press-scheduling cell (delayPressIn timer + activation clock), persisted on the
  // instance; the machine's handlers are rebuilt per event over live @Input()s.
  private readonly runtime = createTouchableFeedbackRuntime();
  // This component's OWN host — the non-painting anchor `class="..."` at the use site resolves
  // onto (see anchorHostStyle's doc comment) — NOT the <symbiote-animated-view> leaf one level down.
  private readonly elementRef = inject(ElementRef);

  // The (possibly animated) style the leaf reduces: the anchor's class-derived style first, then
  // the user's explicit style, then the live opacity layered on top (last wins via the style array
  // the commit layer flattens). `unknown` because the array mixes a plain style with an
  // AnimatedNode, exactly the bag AnimatedView's `style` input accepts.
  get animatedStyle(): unknown {
    return [anchorHostStyle(this.elementRef), this.style, { opacity: this.opacity }];
  }

  private setOpacityTo(toValue: number, duration: number): void {
    Animated.timing(this.opacity, {
      toValue,
      duration,
      easing: Animated.Easing.inOut(Animated.Easing.quad),
      useNativeDriver: false,
    }).start();
  }

  // Built per event so the machine reads live @Input()s (delay/opacity); the runtime persists across
  // calls. The shared machine owns the scheduling — the adapter supplies only the native seam: the
  // Animated opacity fade + the @Output() emit, as activate/deactivate.
  private feedbackHandlers(): ITouchableFeedbackHandlers {
    return createTouchableFeedbackHandlers(
      {
        delayPressIn: this.delayPressIn ?? 0,
        delayPressOut: this.delayPressOut ?? 0,
        minPressDuration: this.minPressDuration ?? DEFAULT_MIN_PRESS_DURATION_MS,
        schedule: scheduleTimeout,
        now: Date.now,
      },
      this.runtime,
      {
        activate: (event: ISymbioteEvent): void => {
          this.setOpacityTo(
            this.activeOpacity ?? DEFAULT_ACTIVE_OPACITY,
            OPACITY_ACTIVE_DURATION_MS,
          );
          this.pressIn.emit(event);
        },
        deactivate: (event: ISymbioteEvent): void => {
          this.setOpacityTo(RESTING_OPACITY, OPACITY_INACTIVE_DURATION_MS);
          this.pressOut.emit(event);
        },
      },
    );
  }

  // Arrow fields (stable identity for OnPush, `this` intact when Pressable's `(pressIn)` invokes
  // them). The delayPressIn defer + minPressDuration/delayPressOut hold live in the shared machine.
  handlePressIn = (event: ISymbioteEvent): void => {
    this.feedbackHandlers().handlePressIn(event);
  };

  handlePressOut = (event: ISymbioteEvent): void => {
    this.feedbackHandlers().handlePressOut(event);
  };
}

@Component({
  selector: 'TouchableHighlight',
  standalone: true,
  imports: [Pressable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <Pressable
      [style]="pressedStyle"
      (press)="press.emit($event)"
      (pressIn)="pressIn.emit($event)"
      (pressOut)="pressOut.emit($event)"
      (pressMove)="pressMove.emit($event)"
      (longPress)="longPress.emit($event)"
      (hoverIn)="hoverIn.emit($event)"
      (hoverOut)="hoverOut.emit($event)"
      [delayLongPress]="delayLongPress"
      [delayHoverIn]="delayHoverIn"
      [delayHoverOut]="delayHoverOut"
      [disabled]="disabled"
      [cancelable]="cancelable"
      [hitSlop]="hitSlop"
      [pressRetentionOffset]="pressRetentionOffset"
      [unstable_pressDelay]="unstable_pressDelay"
      [android_ripple]="android_ripple"
      [android_disableSound]="android_disableSound"
      [testID]="testID"
      [nativeID]="nativeID"
      [hasTVPreferredFocus]="hasTVPreferredFocus"
      [nextFocusDown]="nextFocusDown"
      [nextFocusForward]="nextFocusForward"
      [nextFocusLeft]="nextFocusLeft"
      [nextFocusRight]="nextFocusRight"
      [nextFocusUp]="nextFocusUp"
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
      [id]="id"
      [role]="role"
    >
      <ng-content></ng-content>
    </Pressable>
  `,
})
export class TouchableHighlight implements IAngularTouchableHighlightProps {
  @Output() readonly press = new EventEmitter<ISymbioteEvent>();
  @Output() readonly pressIn = new EventEmitter<ISymbioteEvent>();
  @Output() readonly pressOut = new EventEmitter<ISymbioteEvent>();
  @Output() readonly pressMove = new EventEmitter<ISymbioteEvent>();
  @Output() readonly longPress = new EventEmitter<ISymbioteEvent>();
  @Output() readonly hoverIn = new EventEmitter<ISymbioteEvent>();
  @Output() readonly hoverOut = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityAction = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityTap = new EventEmitter<ISymbioteEvent>();
  @Output() readonly magicTap = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityEscape = new EventEmitter<ISymbioteEvent>();
  @Input() activeOpacity?: number;
  @Input() underlayColor?: string;
  @Input() delayPressIn?: number;
  @Input() delayPressOut?: number;
  @Input() minPressDuration?: number;
  @Input() style?: IStyleProp<IViewStyle>;
  @Input() delayLongPress?: number;
  @Input() delayHoverIn?: number;
  @Input() delayHoverOut?: number;
  @Input() disabled?: boolean;
  @Input() cancelable?: boolean;
  @Input() hitSlop?: IRectOffset;
  @Input() pressRetentionOffset?: IRectOffset;
  @Input() unstable_pressDelay?: number;
  @Input() android_ripple?: IPressableAndroidRippleConfig;
  @Input() android_disableSound?: boolean;
  @Input() testID?: string;
  @Input() nativeID?: string;
  @Input() hasTVPreferredFocus?: boolean;
  @Input() nextFocusDown?: number;
  @Input() nextFocusForward?: number;
  @Input() nextFocusLeft?: number;
  @Input() nextFocusRight?: number;
  @Input() nextFocusUp?: number;
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
  @Input() ariaLabel?: string;
  @Input() ariaBusy?: boolean;
  @Input() ariaChecked?: boolean | 'mixed';
  @Input() ariaDisabled?: boolean;
  @Input() ariaExpanded?: boolean;
  @Input() ariaHidden?: boolean;
  @Input() ariaLabelledBy?: string;
  @Input() ariaLive?: IAriaProps['aria-live'];
  @Input() ariaSelected?: boolean;
  @Input() ariaModal?: boolean;
  @Input() ariaValueMax?: number;
  @Input() ariaValueMin?: number;
  @Input() ariaValueNow?: number;
  @Input() ariaValueText?: string;
  @Input() id?: string;
  @Input() role?: IAriaProps['role'];

  // This component's OWN host — the non-painting anchor `class="..."` at the use site resolves
  // onto (see anchorHostStyle's doc comment) — NOT the Pressable one level down.
  private readonly elementRef = inject(ElementRef);

  // Pressable accepts a style-as-function and calls it with the live pressed state. Arrow field so
  // `this` stays bound when Pressable invokes it; it reads the inputs LIVE at call time. The
  // anchor's class-derived style goes first, then the user's explicit style, so an explicit
  // [style] still beats the ambient class. When pressed, paint the underlay color + lower the
  // child opacity (RN drives this with setState, not Animated, so we mirror that faithfully
  // through Pressable's pressed flag, no tween) — the overlay always goes last so it wins.
  pressedStyle = (state: IPressState): IStyleProp<IViewStyle> => {
    const base: IStyleProp<IViewStyle> = [anchorStyleProp<IViewStyle>(this.elementRef), this.style];
    return highlightPressedStyle(
      state.pressed,
      base,
      this.underlayColor ?? DEFAULT_UNDERLAY_COLOR,
      this.activeOpacity ?? DEFAULT_HIGHLIGHT_CHILD_OPACITY,
    );
  };
}

@Component({
  selector: 'TouchableWithoutFeedback',
  standalone: true,
  imports: [Pressable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <Pressable
      [style]="mergedStyle"
      (press)="press.emit($event)"
      (pressIn)="pressIn.emit($event)"
      (pressOut)="pressOut.emit($event)"
      (pressMove)="pressMove.emit($event)"
      (longPress)="longPress.emit($event)"
      (hoverIn)="hoverIn.emit($event)"
      (hoverOut)="hoverOut.emit($event)"
      [delayLongPress]="delayLongPress"
      [delayHoverIn]="delayHoverIn"
      [delayHoverOut]="delayHoverOut"
      [disabled]="disabled"
      [cancelable]="cancelable"
      [hitSlop]="hitSlop"
      [pressRetentionOffset]="pressRetentionOffset"
      [unstable_pressDelay]="unstable_pressDelay"
      [android_ripple]="android_ripple"
      [android_disableSound]="android_disableSound"
      [testID]="testID"
      [nativeID]="nativeID"
      [hasTVPreferredFocus]="hasTVPreferredFocus"
      [nextFocusDown]="nextFocusDown"
      [nextFocusForward]="nextFocusForward"
      [nextFocusLeft]="nextFocusLeft"
      [nextFocusRight]="nextFocusRight"
      [nextFocusUp]="nextFocusUp"
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
      [id]="id"
      [role]="role"
    >
      <ng-content></ng-content>
    </Pressable>
  `,
})
export class TouchableWithoutFeedback implements IAngularTouchableWithoutFeedbackProps {
  // delayPressIn/delayPressOut/minPressDuration ride the prop type for surface parity with the
  // other two, but TouchableWithoutFeedback has no visual feedback, so nothing schedules off them
  // (RN's TouchableWithoutFeedback is the same pure passthrough).
  @Output() readonly press = new EventEmitter<ISymbioteEvent>();
  @Output() readonly pressIn = new EventEmitter<ISymbioteEvent>();
  @Output() readonly pressOut = new EventEmitter<ISymbioteEvent>();
  @Output() readonly pressMove = new EventEmitter<ISymbioteEvent>();
  @Output() readonly longPress = new EventEmitter<ISymbioteEvent>();
  @Output() readonly hoverIn = new EventEmitter<ISymbioteEvent>();
  @Output() readonly hoverOut = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityAction = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityTap = new EventEmitter<ISymbioteEvent>();
  @Output() readonly magicTap = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityEscape = new EventEmitter<ISymbioteEvent>();
  @Input() delayPressIn?: number;
  @Input() delayPressOut?: number;
  @Input() minPressDuration?: number;
  @Input() style?: IStyleProp<IViewStyle>;
  @Input() delayLongPress?: number;
  @Input() delayHoverIn?: number;
  @Input() delayHoverOut?: number;
  @Input() disabled?: boolean;
  @Input() cancelable?: boolean;
  @Input() hitSlop?: IRectOffset;
  @Input() pressRetentionOffset?: IRectOffset;
  @Input() unstable_pressDelay?: number;
  @Input() android_ripple?: IPressableAndroidRippleConfig;
  @Input() android_disableSound?: boolean;
  @Input() testID?: string;
  @Input() nativeID?: string;
  @Input() hasTVPreferredFocus?: boolean;
  @Input() nextFocusDown?: number;
  @Input() nextFocusForward?: number;
  @Input() nextFocusLeft?: number;
  @Input() nextFocusRight?: number;
  @Input() nextFocusUp?: number;
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
  @Input() ariaLabel?: string;
  @Input() ariaBusy?: boolean;
  @Input() ariaChecked?: boolean | 'mixed';
  @Input() ariaDisabled?: boolean;
  @Input() ariaExpanded?: boolean;
  @Input() ariaHidden?: boolean;
  @Input() ariaLabelledBy?: string;
  @Input() ariaLive?: IAriaProps['aria-live'];
  @Input() ariaSelected?: boolean;
  @Input() ariaModal?: boolean;
  @Input() ariaValueMax?: number;
  @Input() ariaValueMin?: number;
  @Input() ariaValueNow?: number;
  @Input() ariaValueText?: string;
  @Input() id?: string;
  @Input() role?: IAriaProps['role'];

  // This component's OWN host — the non-painting anchor `class="..."` at the use site resolves
  // onto (see anchorHostStyle's doc comment) — NOT the Pressable one level down.
  private readonly elementRef = inject(ElementRef);

  // The anchor's class-derived style goes first, then the explicit style, so an explicit [style]
  // still beats the ambient class.
  get mergedStyle(): IStyleProp<IViewStyle> {
    return [anchorStyleProp<IViewStyle>(this.elementRef), this.style];
  }
}
