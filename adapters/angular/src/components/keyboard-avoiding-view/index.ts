// KeyboardAvoidingView: the Angular lifecycle half. A plain View that shifts out of the
// keyboard's way as it shows/hides. The inset math + the behavior → style/structure decision
// live framework-agnostic in @symbiote-native/components (render-keyboard-avoiding-view), shared verbatim
// with React/Vue; Angular supplies only the lifecycle: a plain inset field, ngOnInit subscribes to
// the core Keyboard module (show / changeFrame / hide) and markForCheck pulls the OnPush view (the
// Angular twin of React's setState / Vue's reactive ref), ngOnDestroy tears the subscriptions down,
// and the wrapper's onLayout measures the frame that feeds the next event's inset. The user
// children nest under the wrapper (or, for 'position', an inner View) via <ng-content>. No native
// host of its own — it wraps symbiote-view — so this stays a flat single file.
//
// Full parity: behavior 'height'|'position'|'padding', enabled, keyboardVerticalOffset,
// contentContainerStyle, onLayout, plus the full a11y/aria surface every View carries.

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
  type OnDestroy,
  type OnInit,
} from '@angular/core';
import {
  computeInset,
  readKeyboardFrame,
  readLayoutFrame,
  resolveAccessibilityProps,
  resolveKeyboardAvoidingLayout,
  DEFAULT_VERTICAL_OFFSET,
  type IAccessibilityProps,
  type IAccessibilityStateValue,
  type IAriaProps,
  type IKeyboardAvoidingBehavior,
  type IKeyboardAvoidingLayout,
  type IMeasuredFrame,
} from '@symbiote-native/components';
import {
  Keyboard,
  KEYBOARD_EVENT,
  dlog,
  isSymbioteEvent,
  type IEventSubscription,
  type IStyleProp,
  type ISymbioteEvent,
  type IViewStyle,
} from '@symbiote-native/engine';
import { anchorHostStyle, SymbioteHostPropsDirective, ViewHost } from '../../primitives';

export type { IKeyboardAvoidingBehavior } from '@symbiote-native/components';

// Mirrors React's IKeyboardAvoidingViewProps minus children (Angular takes children via
// <ng-content>), declared per-adapter over the shared accessibility base since a framework-specific
// children field keeps it from being fully shared across adapters.
export interface IAngularKeyboardAvoidingViewProps extends IAccessibilityProps, IAriaProps {
  behavior?: IKeyboardAvoidingBehavior;
  enabled?: boolean;
  keyboardVerticalOffset?: number;
  contentContainerStyle?: IStyleProp<IViewStyle>;
  style?: IStyleProp<IViewStyle>;
  onLayout?: (event: ISymbioteEvent) => void;
}

// What the component itself takes as plain @Input()s: the full surface minus onLayout and the
// accessibility callbacks, which it exposes as real @Output() EventEmitters instead (see the
// class below), mirroring Pressable's IAngularPressableInputs split.
export type IAngularKeyboardAvoidingViewInputs = Omit<
  IAngularKeyboardAvoidingViewProps,
  | 'onLayout'
  | 'onAccessibilityAction'
  | 'onAccessibilityTap'
  | 'onMagicTap'
  | 'onAccessibilityEscape'
>;

@Component({
  selector: 'KeyboardAvoidingView',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [ViewHost, SymbioteHostPropsDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The wrapper carries a11y + onLayout; 'position' ('nested') pushes the children in an inner
  // View by `bottom: inset`, the wrapper modes adjust the single wrapper directly. Only one @if
  // branch is instantiated, so each branch's <ng-content> projects the children unambiguously.
  template: `
    <symbiote-view
      [symbioteHostProps]="hostProps"
      (accessibilityAction)="emit(accessibilityAction, $event)"
      (accessibilityTap)="emit(accessibilityTap, $event)"
      (magicTap)="emit(magicTap, $event)"
      (accessibilityEscape)="emit(accessibilityEscape, $event)"
      (layout)="handleLayout($event)"
    >
      @if (isNested) {
        <symbiote-view [style]="innerStyle">
          <ng-content></ng-content>
        </symbiote-view>
      } @else {
        <ng-content></ng-content>
      }
    </symbiote-view>
  `,
})
export class KeyboardAvoidingView implements IAngularKeyboardAvoidingViewInputs, OnInit, OnDestroy {
  @Input() behavior?: IKeyboardAvoidingBehavior;
  @Input() enabled?: boolean;
  @Input() keyboardVerticalOffset?: number;
  @Input() contentContainerStyle?: IStyleProp<IViewStyle>;
  @Input() style?: IStyleProp<IViewStyle>;
  // The wrapper's onLayout is a real @Output(): `(layout)="…"`, not `[onLayout]="…"`. Safe to
  // name it the same as the native `layout` event fired inside this component's own template
  // (see the class's `handleLayout`) — the engine's bubble() treats ANCHOR_HOST_COMPONENTS as
  // transparent to listener lookup, so there is no double-fire.
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

  // How far the view must move so it no longer overlaps the keyboard. A plain field, not reactive:
  // OnPush + zoneless means a keyboard event mutates it and pulls the view via markForCheck.
  private inset = 0;
  // Mutable, not state: changing the measured frame alone shouldn't re-render; it feeds the next
  // keyboard event's inset math (React's frameRef / initialHeightRef, Vue's frame / initialHeight).
  private frame?: IMeasuredFrame;
  private initialHeight?: number;
  private subscriptions: IEventSubscription[] = [];

  private readonly changeDetector = inject(ChangeDetectorRef);
  // This component's OWN host — the non-painting anchor `class="..."` at the use site resolves
  // onto (see anchorHostStyle's doc comment) — NOT a ViewChild into the inner symbiote-view (this
  // component has none; the wrapper IS the outer template node hostProps binds onto).
  private readonly elementRef = inject(ElementRef);

  ngOnInit(): void {
    this.subscriptions = [
      Keyboard.addListener(KEYBOARD_EVENT.didShow, payload => this.onShow(payload)),
      Keyboard.addListener(KEYBOARD_EVENT.didChangeFrame, payload => this.onShow(payload)),
      Keyboard.addListener(KEYBOARD_EVENT.didHide, () => this.onHide()),
    ];
  }

  ngOnDestroy(): void {
    for (const subscription of this.subscriptions) subscription.remove();
    this.subscriptions = [];
  }

  private onShow(payload: unknown): void {
    const keyboard = readKeyboardFrame(payload);
    const offset = this.keyboardVerticalOffset ?? DEFAULT_VERTICAL_OFFSET;
    const next = computeInset(this.frame, keyboard, offset);
    dlog(`KeyboardAvoidingView show -> inset ${next}`);
    this.inset = next;
    this.changeDetector.markForCheck();
  }

  private onHide(): void {
    dlog('KeyboardAvoidingView hide -> inset 0');
    this.inset = 0;
    this.changeDetector.markForCheck();
  }

  // The wrapper's onLayout measures the frame BEFORE forwarding to the caller's onLayout, so the
  // next keyboard event's inset math has the view's real position (React/Vue's handleLayout).
  handleLayout(event: unknown): void {
    if (!isSymbioteEvent(event)) return;
    const measured = readLayoutFrame(event.nativeEvent.layout);
    if (measured !== undefined) {
      this.frame = measured;
      if (this.initialHeight === undefined) this.initialHeight = measured.height;
    }
    this.layout.emit(event);
  }

  // RN gates every inset on `enabled ?? true`; only an explicit `false` disables, forcing the inset
  // to 0 so every behavior mode renders the view untouched.
  private get effectiveInset(): number {
    return this.enabled === false ? 0 : this.inset;
  }

  // The behavior + effective inset → wrapper/inner styles and the nesting decision (the shared core
  // of RN's render). Recomputed per CD pass, the Angular twin of React/Vue's per-render call.
  // Named `resolvedLayout`, not `layout` — that name is now the onLayout @Output() EventEmitter.
  private get resolvedLayout(): IKeyboardAvoidingLayout {
    return resolveKeyboardAvoidingLayout({
      behavior: this.behavior,
      effectiveInset: this.effectiveInset,
      initialHeight: this.initialHeight,
      style: this.style,
      contentContainerStyle: this.contentContainerStyle,
    });
  }

  get isNested(): boolean {
    return this.resolvedLayout.kind === 'nested';
  }

  get wrapperStyle(): IStyleProp<IViewStyle> | undefined {
    return this.resolvedLayout.wrapperStyle;
  }

  get innerStyle(): IStyleProp<IViewStyle> | undefined {
    return this.resolvedLayout.kind === 'nested' ? this.resolvedLayout.innerStyle : undefined;
  }

  // The wrapper's full prop bag (style + identity + a11y) folded for `[symbioteHostProps]`,
  // the same pattern Modal's `hostProps` uses over its renderModal descriptor. The anchor's
  // class-derived style goes FIRST, the resolved wrapper style SECOND — flattenStyle's later-wins
  // collapse keeps an explicit [style] winning over its ambient class.
  get hostProps(): Record<string, unknown> {
    return {
      style: [anchorHostStyle(this.elementRef), this.wrapperStyle],
      testID: this.testID,
      nativeID: this.nativeID,
      accessible: this.accessible,
      ...this.folded,
    };
  }

  // Forward an engine event to the matching @Output(), narrowing the template's untyped $event
  // first. The accessibility* Outputs ride the engine's structural event channel (Angular blocks
  // [onX] property bindings; events flow through (event) only).
  emit(emitter: EventEmitter<ISymbioteEvent>, event: unknown): void {
    if (isSymbioteEvent(event)) emitter.emit(event);
  }

  // Fold the web aria-*/role aliases into the canonical accessibility* props once per render, so the
  // host node never sees an aria-* key (native ignores them) — the shared transform every adapter runs.
  get folded(): Partial<IAngularKeyboardAvoidingViewProps> {
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
