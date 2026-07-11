// TextInput, the Angular lifecycle half. The folds/maps (value->text, the W3C/alias resolution)
// and the controlled-write predicate live in @symbiote-native/components/state, the render (intrinsic
// + native-prop mapping) in @symbiote-native/components/view, both shared verbatim with the React and
// Vue adapters. Here Angular supplies only the lifecycle: renderTextInput picks ONE of two host
// intrinsics at runtime (symbiote-text-input / symbiote-text-input-multiline) via `@if`/`@else`,
// each wired through the shared `SymbioteHostPropsDirective` (`[symbioteHostProps]="hostProps"`,
// `../primitives/shared.ts`) so the flat resolved prop bag doesn't need enumerating as individual
// `[prop]` bindings; a @ViewChild reading that directive (by its `#host` template ref, across
// either branch) exposes `.node` — the host BY IDENTITY (so imperative commands hit the engine's
// WeakMap mirror). A plain field holds the acknowledged event count, ngOnChanges runs the
// controlled-write command, ngAfterViewInit drives the mount autoFocus, and the class itself is
// the imperative handle (ITextInputHandle). The Angular twin of React's useRef/useState +
// useLayoutEffect + useImperativeHandle and Vue's shallowRef + watch(flush:'post') + expose().
//
// Two Angular-specific seams. (1) Events: Angular forbids [onX] property bindings, so the host's
// change/focus/blur + the remaining native events ride the structural (event) channel and route
// to real @Output() EventEmitters (valueChange is DERIVED from change, never a native event —
// React/Vue fold both into one onValueChange(text, event) callback, but Angular's EventEmitter
// only carries one value, so valueChange stays text-only to keep [(value)] banana-in-a-box
// working; `change` stays a second, separate @Output() for the raw event). The
// non-function props travel the flat-bag path via the host-props directive. (2) Commit timing:
// Angular's change detection is async/batched (zoneless), so a native command wired at lifecycle
// time has no Fabric tag yet; the controlled write + autoFocus defer through whenCommitted, the
// same gotcha Vue hits. The controlled handshake hinges on commanding native back with the
// ACKNOWLEDGED event count (setTextAndSelection), never a plain prop re-push — see
// @symbiote-native/components/state/text-input.

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
  type OnDestroy,
  type SimpleChanges,
} from '@angular/core';
import {
  foldText,
  eventCountFromChange,
  textFromChange,
  shouldCommandText,
  renderTextInput,
  resolveAccessibilityProps,
  resolveTextInputProps,
  INITIAL_EVENT_COUNT,
  SELECTION_NONE,
  type IAccessibilityProps,
  type IAccessibilityStateValue,
  type IAriaProps,
  type IEnterKeyHint,
  type IFoldedTextInputProps,
  type IInputMode,
  type ISubmitBehavior,
  type ITextInputEventHandler,
  type ITextInputHandle,
  type ITextInputSelection,
} from '@symbiote-native/components';
import {
  blurTextInput,
  dispatchViewCommand,
  dlog,
  isSymbioteEvent,
  isSymbioteNode,
  setInputBlurred,
  setInputFocused,
  whenCommitted,
  type IStyleProp,
  type ISymbioteEvent,
  type ISymbioteNode,
  type ITextStyle,
} from '@symbiote-native/engine';
import {
  anchorHostStyle,
  MultilineTextInputHost,
  SymbioteHostPropsDirective,
  TextInputHost,
} from '../primitives';

export type { ITextInputHandle, ITextInputSelection, IInputMode, IEnterKeyHint, ISubmitBehavior };

// Mirrors React's ITextInputProps minus nothing (TextInput has no children) — declared
// per-adapter over the shared accessibility base because Angular's input surface aliases the
// aria-* keys to camelCase @Inputs, unlike the plain agnostic fields shared across adapters.
export interface IAngularTextInputProps extends IAccessibilityProps, IAriaProps {
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  placeholderTextColor?: string;
  editable?: boolean;
  keyboardType?: string;
  secureTextEntry?: boolean;
  maxLength?: number;
  multiline?: boolean;
  selection?: ITextInputSelection;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
  autoComplete?: string;
  textContentType?: string;
  autoFocus?: boolean;
  showSoftInputOnFocus?: boolean;
  returnKeyType?: string;
  selectTextOnFocus?: boolean;
  scrollEnabled?: boolean;
  numberOfLines?: number;
  textAlign?: 'left' | 'center' | 'right';
  blurOnSubmit?: boolean;
  inputMode?: IInputMode;
  enterKeyHint?: IEnterKeyHint;
  readOnly?: boolean;
  submitBehavior?: ISubmitBehavior;
  cursorColor?: string;
  selectionColor?: string;
  selectionHandleColor?: string;
  underlineColorAndroid?: string;
  inputAccessoryViewID?: string;
  style?: IStyleProp<ITextStyle>;
  onValueChange?: (text: string) => void;
  onChange?: ITextInputEventHandler;
  onFocus?: ITextInputEventHandler;
  onBlur?: ITextInputEventHandler;
  onEndEditing?: ITextInputEventHandler;
  onSubmitEditing?: ITextInputEventHandler;
  onKeyPress?: ITextInputEventHandler;
  onSelectionChange?: ITextInputEventHandler;
  onContentSizeChange?: ITextInputEventHandler;
}

// What the TextInput component itself takes as plain @Input()s: the full surface minus every
// callback-shaped event, which it exposes as real @Output() EventEmitters instead (see the class
// below) — mirrors Pressable's IAngularPressableInputs / IAngularPressableProps split.
export type IAngularTextInputInputs = Omit<
  IAngularTextInputProps,
  | 'onValueChange'
  | 'onChange'
  | 'onFocus'
  | 'onBlur'
  | 'onEndEditing'
  | 'onSubmitEditing'
  | 'onKeyPress'
  | 'onSelectionChange'
  | 'onContentSizeChange'
  | 'onAccessibilityAction'
  | 'onAccessibilityTap'
  | 'onMagicTap'
  | 'onAccessibilityEscape'
>;

@Component({
  selector: 'TextInput',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [SymbioteHostPropsDirective, TextInputHost, MultilineTextInputHost],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isMultiline) {
      <symbiote-text-input-multiline
        #host
        [symbioteHostProps]="hostProps"
        (change)="handleChange($event)"
        (focus)="handleFocus($event)"
        (blur)="handleBlur($event)"
        (selectionChange)="emit(selectionChange, $event)"
        (submitEditing)="emit(submitEditing, $event)"
        (keyPress)="emit(keyPress, $event)"
        (endEditing)="emit(endEditing, $event)"
        (contentSizeChange)="emit(contentSizeChange, $event)"
        (accessibilityAction)="emit(accessibilityAction, $event)"
        (accessibilityTap)="emit(accessibilityTap, $event)"
        (magicTap)="emit(magicTap, $event)"
        (accessibilityEscape)="emit(accessibilityEscape, $event)"
      ></symbiote-text-input-multiline>
    } @else {
      <symbiote-text-input
        #host
        [symbioteHostProps]="hostProps"
        (change)="handleChange($event)"
        (focus)="handleFocus($event)"
        (blur)="handleBlur($event)"
        (selectionChange)="emit(selectionChange, $event)"
        (submitEditing)="emit(submitEditing, $event)"
        (keyPress)="emit(keyPress, $event)"
        (endEditing)="emit(endEditing, $event)"
        (contentSizeChange)="emit(contentSizeChange, $event)"
        (accessibilityAction)="emit(accessibilityAction, $event)"
        (accessibilityTap)="emit(accessibilityTap, $event)"
        (magicTap)="emit(magicTap, $event)"
        (accessibilityEscape)="emit(accessibilityEscape, $event)"
      ></symbiote-text-input>
    }
  `,
})
export class TextInput
  implements IAngularTextInputInputs, ITextInputHandle, OnChanges, AfterViewInit, OnDestroy
{
  @Input() value?: string;
  @Input() defaultValue?: string;
  @Input() placeholder?: string;
  @Input() placeholderTextColor?: string;
  @Input() editable?: boolean;
  @Input() keyboardType?: string;
  @Input() secureTextEntry?: boolean;
  @Input() maxLength?: number;
  @Input() multiline?: boolean;
  @Input() selection?: ITextInputSelection;
  @Input() autoCapitalize?: IAngularTextInputProps['autoCapitalize'];
  @Input() autoCorrect?: boolean;
  @Input() autoComplete?: string;
  @Input() textContentType?: string;
  @Input() autoFocus?: boolean;
  @Input() showSoftInputOnFocus?: boolean;
  @Input() returnKeyType?: string;
  @Input() selectTextOnFocus?: boolean;
  @Input() scrollEnabled?: boolean;
  @Input() numberOfLines?: number;
  @Input() textAlign?: IAngularTextInputProps['textAlign'];
  @Input() blurOnSubmit?: boolean;
  @Input() inputMode?: IInputMode;
  @Input() enterKeyHint?: IEnterKeyHint;
  @Input() readOnly?: boolean;
  @Input() submitBehavior?: ISubmitBehavior;
  @Input() cursorColor?: string;
  @Input() selectionColor?: string;
  @Input() selectionHandleColor?: string;
  @Input() underlineColorAndroid?: string;
  @Input() inputAccessoryViewID?: string;
  @Input() style?: IStyleProp<ITextStyle>;
  @Input() testID?: string;
  @Input() nativeID?: string;

  // The event lifecycle as real Angular events: `(valueChange)="onText($event)"`, not
  // `[onValueChange]="onText"`. `focus`/`blur` collide with this same class's OWN imperative
  // `focus()`/`blur()` handle methods (ITextInputHandle — the RN ref API a parent calls via
  // `@ViewChild(TextInput)`), so those two alias their public @Output() binding name back to
  // `focus`/`blur` while the class member itself is named `focusEvent`/`blurEvent` — the same
  // `@Output(bindingName) memberName` alias this file already uses for `@Input('aria-label')`.
  // `value`/`valueChange` names match Switch/Slider exactly, so `[(value)]="text"` (banana-in-a-box)
  // works here too — see `valueChange`'s single-arg (text-only) signature above.
  @Output() readonly valueChange = new EventEmitter<string>();
  @Output() readonly change = new EventEmitter<ISymbioteEvent>();
  @Output('focus') readonly focusEvent = new EventEmitter<ISymbioteEvent>();
  @Output('blur') readonly blurEvent = new EventEmitter<ISymbioteEvent>();
  @Output() readonly endEditing = new EventEmitter<ISymbioteEvent>();
  @Output() readonly submitEditing = new EventEmitter<ISymbioteEvent>();
  @Output() readonly keyPress = new EventEmitter<ISymbioteEvent>();
  @Output() readonly selectionChange = new EventEmitter<ISymbioteEvent>();
  @Output() readonly contentSizeChange = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityAction = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityTap = new EventEmitter<ISymbioteEvent>();
  @Output() readonly magicTap = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityEscape = new EventEmitter<ISymbioteEvent>();

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

  @ViewChild('host', { read: SymbioteHostPropsDirective })
  private hostRef?: SymbioteHostPropsDirective;

  // This component's OWN host — the non-painting anchor `class="..."` at the use site resolves
  // onto (see anchorHostStyle's doc comment) — NOT `hostRef` above, which targets the real inner
  // symbiote-text-input(-multiline) one level down.
  private readonly elementRef = inject(ElementRef);

  // The count native last acknowledged; the controlled write / clear / setSelection echo it so
  // native's eventLag lands on 0 and the write applies. A plain field (read live by the imperative
  // handle), the Angular twin of React's useState / Vue's ref.
  private mostRecentEventCount = INITIAL_EVENT_COUNT;
  // The last text native holds, as far as JS knows. Seeded on the first `value` change (the `text`
  // prop already carries the mount value down via createNode, so the FIRST controlled value is not
  // a divergence and must NOT re-command); later divergences flow through setTextAndSelection.
  private lastNativeText: string | undefined;
  // JS-side focus state, mirrored from the focus/blur events for isFocused(): native exposes no
  // synchronous focus getter (RN's TextInputState holds the same).
  private focused = false;
  private cancelAutoFocus?: () => void;

  get isMultiline(): boolean {
    return this.multiline === true;
  }

  get hostProps(): Record<string, unknown> {
    return renderTextInput({
      multiline: this.isMultiline,
      text: foldText(this.value, this.defaultValue),
      mostRecentEventCount: this.mostRecentEventCount,
      selection: this.selection,
      folded: this.foldedNativeProps,
      passthrough: this.buildPassthrough(),
    }).props;
  }

  ngOnChanges(changes: SimpleChanges): void {
    const valueChange = changes['value'];
    if (valueChange === undefined) return;
    // The first value is the seed, not a divergence: record it and do not command.
    if (valueChange.firstChange) {
      this.lastNativeText = foldText(this.value, this.defaultValue);
      return;
    }
    this.commitControlledValue();
  }

  // autoFocus is driven in JS, not as a native prop: once the node is committed, command `focus`
  // down once (RN does the same via TextInputState.focusInput). Under Angular's async-batched
  // commit the node has no Fabric tag at ngAfterViewInit, so whenCommitted defers the command to
  // the commit that assigns the tag; cancelled on destroy so an un-committed pending focus leaks.
  ngAfterViewInit(): void {
    if (this.autoFocus !== true) return;
    const node = this.hostNode;
    if (node === undefined) return;
    dlog('TextInput autoFocus -> focus command');
    this.cancelAutoFocus = whenCommitted(node, () => dispatchViewCommand(node, 'focus', []));
  }

  ngOnDestroy(): void {
    this.cancelAutoFocus?.();
  }

  handleChange(event: unknown): void {
    if (!isSymbioteEvent(event)) return;
    // Event seam: the controlled handshake hinges on the change payload carrying `text`
    // (+ `eventCount`). iOS and Android Fabric can key these differently, so log the actual shape.
    dlog(
      `TextInput change keys=[${Object.keys(event.nativeEvent).join(',')}] ` +
        `text=${JSON.stringify(event.nativeEvent.text)} count=${JSON.stringify(event.nativeEvent.eventCount)}`,
    );
    const text = textFromChange(event);
    if (text !== undefined) {
      // Record the text first, then the count, so the count never runs ahead of the text it
      // stands for. The host re-pushes the count on the parent's value-driven CD, never here:
      // pushing the stale `text` prop now (eventLag 0) would revert the keystroke.
      this.lastNativeText = text;
      this.valueChange.emit(text);
    }
    const count = eventCountFromChange(event);
    if (count !== undefined) this.mostRecentEventCount = count;
    this.change.emit(event);
  }

  handleFocus(event: unknown): void {
    if (!isSymbioteEvent(event)) return;
    this.focused = true;
    // Track focus app-wide so Keyboard.dismiss can blur this input without a ref.
    const node = this.hostNode;
    if (node !== undefined) setInputFocused(node);
    this.focusEvent.emit(event);
  }

  handleBlur(event: unknown): void {
    if (!isSymbioteEvent(event)) return;
    this.focused = false;
    const node = this.hostNode;
    if (node !== undefined) setInputBlurred(node);
    this.blurEvent.emit(event);
  }

  // Forward an engine event onto the matching @Output(), narrowing the template's untyped $event
  // first. Angular blocks [onX] property bindings, so every native event flows through (event).
  emit(emitter: EventEmitter<ISymbioteEvent>, event: unknown): void {
    if (isSymbioteEvent(event)) emitter.emit(event);
  }

  // The imperative API RN exposes on a TextInput ref; in Angular the component instance IS the
  // handle (a parent reads it via @ViewChild(TextInput) and calls these). focus/blur drive native
  // view commands; clear and setSelection reuse setTextAndSelection (the same stale-safe path as a
  // controlled write) echoing the acknowledged event count.
  focus(): void {
    const node = this.hostNode;
    if (node !== undefined) dispatchViewCommand(node, 'focus', []);
  }

  blur(): void {
    // Routes through TextInputState so the app-wide focus tracking clears too.
    blurTextInput(this.hostNode ?? null);
  }

  clear(): void {
    const node = this.hostNode;
    if (node === undefined) return;
    dispatchViewCommand(node, 'setTextAndSelection', [this.mostRecentEventCount, '', 0, 0]);
    this.lastNativeText = '';
  }

  isFocused(): boolean {
    return this.focused;
  }

  setSelection(start: number, end: number): void {
    const node = this.hostNode;
    if (node === undefined) return;
    const current = this.lastNativeText ?? '';
    dispatchViewCommand(node, 'setTextAndSelection', [
      this.mostRecentEventCount,
      current,
      start,
      end,
    ]);
  }

  // Controlled write: when JS-side `value` diverges from what native reported, command the new
  // text down with the acknowledged count; a plain prop re-push would race the user's keystrokes.
  // whenCommitted defers it past the async commit so the node's Fabric tag exists; the predicate
  // narrows `value` to string and makes the call a no-op unless the text diverged.
  private commitControlledValue(): void {
    const node = this.hostNode;
    if (node === undefined) return;
    const value = this.value;
    if (!shouldCommandText(this.lastNativeText, value)) return;
    const selStart = this.selection?.start ?? SELECTION_NONE;
    const selEnd = this.selection?.end ?? this.selection?.start ?? SELECTION_NONE;
    const count = this.mostRecentEventCount;
    dlog(`TextInput setTextAndSelection count=${count} text=${JSON.stringify(value)}`);
    this.lastNativeText = value;
    whenCommitted(node, () =>
      dispatchViewCommand(node, 'setTextAndSelection', [count, value, selStart, selEnd]),
    );
  }

  private buildPassthrough(): Record<string, unknown> {
    return {
      ...this.foldedAccessibility,
      accessible: this.accessible,
      testID: this.testID,
      nativeID: this.nativeID,
      placeholder: this.placeholder,
      placeholderTextColor: this.placeholderTextColor,
      maxLength: this.maxLength,
      secureTextEntry: this.secureTextEntry,
      autoCapitalize: this.autoCapitalize,
      autoCorrect: this.autoCorrect,
      selectTextOnFocus: this.selectTextOnFocus,
      scrollEnabled: this.scrollEnabled,
      numberOfLines: this.numberOfLines,
      textAlign: this.textAlign,
      inputAccessoryViewID: this.inputAccessoryViewID,
      style: [anchorHostStyle(this.elementRef), this.style],
    };
  }

  private get foldedNativeProps(): IFoldedTextInputProps {
    return resolveTextInputProps({
      inputMode: this.inputMode,
      keyboardType: this.keyboardType,
      enterKeyHint: this.enterKeyHint,
      returnKeyType: this.returnKeyType,
      readOnly: this.readOnly,
      editable: this.editable,
      submitBehavior: this.submitBehavior,
      blurOnSubmit: this.blurOnSubmit,
      multiline: this.isMultiline,
      cursorColor: this.cursorColor,
      selectionColor: this.selectionColor,
      selectionHandleColor: this.selectionHandleColor,
      autoComplete: this.autoComplete,
      textContentType: this.textContentType,
      showSoftInputOnFocus: this.showSoftInputOnFocus,
      underlineColorAndroid: this.underlineColorAndroid,
    });
  }

  // Fold the web aria-*/role aliases into the canonical accessibility* props once per render, so
  // the host node never sees an aria-* key (native ignores them) — the shared transform every
  // adapter runs. TextInput is its own host element (not a View wrapper), so it folds a11y here.
  private get foldedAccessibility(): Partial<IAngularTextInputProps> {
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
    });
  }

  private get hostNode(): ISymbioteNode | undefined {
    const native = this.hostRef?.node;
    return isSymbioteNode(native) ? native : undefined;
  }
}
