// TextInput: the logic half (framework-agnostic, zero render). TextInput is the controlled-
// value / event-count handshake primitive. There is NO `value` Fabric prop: JS folds
// value/defaultValue into a single private `text` prop plus a `mostRecentEventCount` counter.
// Native increments its own counter per keystroke and rejects stale writes by
// eventLag = nativeCount - mostRecentEventCount, so a controlled JS write must push the
// ACKNOWLEDGED count (the one native last reported) through the setTextAndSelection view
// command, never a plain prop re-push, which would fight the cursor.
//
// Unlike Switch this is NOT a single reducer: the handshake holds two pieces with different
// reactivity needs: `mostRecentEventCount` must re-render so the imperative handle echoes the
// latest count, while `lastNativeText` is bookkeeping the controlled-write effect mutates
// without a render. So the logic layer is the pure folds/maps + the controlled-write predicate;
// each adapter holds the two pieces in ITS own primitives (React useState/useRef, Vue ref/let).

import type { ISymbioteEvent, ITextStyle } from '@symbiote/engine';
import type { IAccessibilityProps, IAriaProps } from '../accessibility-props';

export type IInputMode =
  'none' | 'text' | 'decimal' | 'numeric' | 'tel' | 'search' | 'email' | 'url';
export type IEnterKeyHint = 'enter' | 'done' | 'go' | 'next' | 'previous' | 'search' | 'send';
export type ISubmitBehavior = 'submit' | 'blurAndSubmit' | 'newline';
export type ITextInputSelection = { start: number; end?: number };
export type ITextInputEventHandler = (event: ISymbioteEvent) => void;

// The acknowledged count starts at 0, native has reported nothing yet, so the first
// controlled write echoes 0 and lands on eventLag 0.
export const INITIAL_EVENT_COUNT = 0;
// RN's "no selection" sentinel for setTextAndSelection: a negative index tells native to
// leave the caret where it is rather than move it (used on a controlled write with no
// explicit selection).
export const SELECTION_NONE = -1;

// The W3C/alias → native lookup tables. Typed Record<string, string> (not Record<IInputMode,
// string>) so the one safe-lookup helper (mapAutoComplete) serves every map without a cast;
// the union types above still guard the app-facing prop contract.

// RN's inputMode -> keyboardType map (TextInput.js:815). `search` is platform-split (iOS
// 'web-search', else 'default'); we use the Android/default branch since the folded prop is
// forwarded verbatim and the safe default avoids an unknown keyboardType on Android.
const inputModeToKeyboardType: Record<string, string> = {
  decimal: 'decimal-pad',
  email: 'email-address',
  none: 'default',
  numeric: 'number-pad',
  search: 'default',
  tel: 'phone-pad',
  text: 'default',
  url: 'url',
};

// RN's enterKeyHint -> returnKeyType map (TextInput.js:805). Note `enter` -> 'default'.
const enterKeyHintToReturnKeyType: Record<string, string> = {
  done: 'done',
  enter: 'default',
  go: 'go',
  next: 'next',
  previous: 'previous',
  search: 'search',
  send: 'send',
};

// RN's W3C autocomplete -> Android `autoComplete` map (TextInput.js:828). A token with no
// native equivalent passes through unchanged (RN's `?? autoComplete`).
const autoCompleteWebToAndroid: Record<string, string> = {
  'additional-name': 'name-middle',
  'address-line1': 'postal-address-region',
  'address-line2': 'postal-address-locality',
  bday: 'birthdate-full',
  'bday-day': 'birthdate-day',
  'bday-month': 'birthdate-month',
  'bday-year': 'birthdate-year',
  'cc-csc': 'cc-csc',
  'cc-exp': 'cc-exp',
  'cc-exp-month': 'cc-exp-month',
  'cc-exp-year': 'cc-exp-year',
  'cc-number': 'cc-number',
  country: 'postal-address-country',
  'current-password': 'password',
  email: 'email',
  'family-name': 'name-family',
  'given-name': 'name-given',
  'honorific-prefix': 'name-prefix',
  'honorific-suffix': 'name-suffix',
  name: 'name',
  'new-password': 'password-new',
  off: 'off',
  'one-time-code': 'sms-otp',
  'postal-code': 'postal-code',
  sex: 'gender',
  'street-address': 'street-address',
  tel: 'tel',
  'tel-country-code': 'tel-country-code',
  'tel-national': 'tel-national',
  username: 'username',
};

// RN's W3C autocomplete -> iOS `textContentType` map (TextInput.js:862). A token absent here
// leaves textContentType undefined on iOS (RN's `autoComplete in map` guard).
const autoCompleteWebToTextContentType: Record<string, string> = {
  'additional-name': 'middleName',
  'address-line1': 'streetAddressLine1',
  'address-line2': 'streetAddressLine2',
  bday: 'birthdate',
  'bday-day': 'birthdateDay',
  'bday-month': 'birthdateMonth',
  'bday-year': 'birthdateYear',
  'cc-additional-name': 'creditCardMiddleName',
  'cc-csc': 'creditCardSecurityCode',
  'cc-exp': 'creditCardExpiration',
  'cc-exp-month': 'creditCardExpirationMonth',
  'cc-exp-year': 'creditCardExpirationYear',
  'cc-family-name': 'creditCardFamilyName',
  'cc-given-name': 'creditCardGivenName',
  'cc-name': 'creditCardName',
  'cc-number': 'creditCardNumber',
  'cc-type': 'creditCardType',
  country: 'countryName',
  'current-password': 'password',
  email: 'emailAddress',
  'family-name': 'familyName',
  'given-name': 'givenName',
  'honorific-prefix': 'namePrefix',
  'honorific-suffix': 'nameSuffix',
  name: 'name',
  'new-password': 'newPassword',
  nickname: 'nickname',
  off: 'none',
  'one-time-code': 'oneTimeCode',
  organization: 'organizationName',
  'organization-title': 'jobTitle',
  'postal-code': 'postalCode',
  'street-address': 'fullStreetAddress',
  tel: 'telephoneNumber',
  url: 'URL',
  username: 'username',
};

// Safe lookup into a W3C->native / alias->native map (no `as`): own-property guard, undefined
// if the token has no native equivalent. The caller decides the per-platform fallback. Named
// for its first user (autoComplete), but it is the one generic safe lookup every map shares.
export function mapAutoComplete(map: Record<string, string>, token: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(map, token) ? map[token] : undefined;
}

// RN folds W3C `autoComplete` per platform (TextInput.js:938): Android takes the mapped
// `autoComplete` token (falling back to the raw token), iOS takes the mapped `textContentType`
// (only when the token is in the map, else leaves it untouched). Symbiote is Metro-built per
// platform but folds platform-agnostically, resolving BOTH native props from the one token:
// the iOS-only `textContentType` is inert on Android and the Android `autoComplete` token is
// inert on iOS, so emitting both is safe: same shape as the dual-keyed events.
export function foldAutoComplete(token: string | undefined): {
  autoComplete: string | undefined;
  textContentType: string | undefined;
} {
  if (token === undefined) return { autoComplete: undefined, textContentType: undefined };
  return {
    autoComplete: mapAutoComplete(autoCompleteWebToAndroid, token) ?? token,
    textContentType: mapAutoComplete(autoCompleteWebToTextContentType, token),
  };
}

// RN's submitBehavior reconciliation (TextInput.js:559). Explicit submitBehavior wins (with
// single-line 'newline' coerced to 'blurAndSubmit'); else it is derived from the legacy
// blurOnSubmit per multiline. Input/output are plain strings: the result is forwarded to the
// native prop verbatim, so no ISubmitBehavior union is needed at the seam.
export function foldSubmitBehavior(
  submitBehavior: string | undefined,
  blurOnSubmit: boolean | undefined,
  multiline: boolean,
): string {
  if (submitBehavior !== undefined) {
    if (!multiline && submitBehavior === 'newline') return 'blurAndSubmit';
    return submitBehavior;
  }
  if (multiline) return blurOnSubmit === true ? 'blurAndSubmit' : 'newline';
  return blurOnSubmit !== false ? 'blurAndSubmit' : 'submit';
}

// RN's fold: value wins, else defaultValue, else leave undefined (uncontrolled).
export function foldText(
  value: string | undefined,
  defaultValue: string | undefined,
): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof defaultValue === 'string') return defaultValue;
  return undefined;
}

// The change payload carries the new text + native event counter. nativeEvent is an untyped
// Record, so narrow each.
export function textFromChange(event: ISymbioteEvent): string | undefined {
  const text = event.nativeEvent.text;
  return typeof text === 'string' ? text : undefined;
}

export function eventCountFromChange(event: ISymbioteEvent): number | undefined {
  const count = event.nativeEvent.eventCount;
  return typeof count === 'number' ? count : undefined;
}

// Controlled-write decision: command native back only when JS-side `value` is a string that
// diverges from what native last reported. A plain prop re-push would race the user's
// keystrokes; the setTextAndSelection command is the only stale-safe path. The guard narrows
// `value` to string so the caller can build the command args without re-checking.
export function shouldCommandText(
  lastNativeText: string | undefined,
  value: string | undefined,
): value is string {
  return typeof value === 'string' && lastNativeText !== value;
}

// The raw alias/legacy fields the per-platform fold reads. The union-typed fields accept a
// looser `string` so an adapter that holds attrs untyped (Vue) can pass them without a guard;
// the typed props contract (ITextInputProps) still constrains app code.
export type ITextInputFoldInput = {
  inputMode?: string;
  keyboardType?: string;
  enterKeyHint?: string;
  returnKeyType?: string;
  readOnly?: boolean;
  editable?: boolean;
  submitBehavior?: string;
  blurOnSubmit?: boolean;
  multiline: boolean;
  cursorColor?: string;
  selectionColor?: string;
  selectionHandleColor?: string;
  autoComplete?: string;
  textContentType?: string;
  showSoftInputOnFocus?: boolean;
  underlineColorAndroid?: string;
};

// The resolved native props the render fn forwards onto the host node. Every field here is a
// concrete native prop value (or undefined to omit); the W3C/alias indirection is gone.
export type IFoldedTextInputProps = {
  keyboardType: string | undefined;
  returnKeyType: string | undefined;
  editable: boolean | undefined;
  submitBehavior: string;
  selectionColor: string | undefined;
  cursorColor: string | undefined;
  selectionHandleColor: string | undefined;
  underlineColorAndroid: string;
  autoComplete: string | undefined;
  textContentType: string | undefined;
  showSoftInputOnFocus: boolean | undefined;
};

// The whole per-platform-agnostic prop fold in one place (TextInput.js:928-946), shared by every
// adapter: inputMode wins over keyboardType, enterKeyHint over returnKeyType, readOnly over
// editable (inverted), the cursor/selection-handle colors default from selectionColor, the W3C
// autoComplete token folds to the per-platform native prop (an explicit textContentType still
// wins), inputMode forces softInput visibility, and underlineColorAndroid defaults to
// 'transparent' to hide the Material EditText bar.
export function resolveTextInputProps(input: ITextInputFoldInput): IFoldedTextInputProps {
  const folded = foldAutoComplete(input.autoComplete);
  return {
    keyboardType:
      input.inputMode !== undefined
        ? mapAutoComplete(inputModeToKeyboardType, input.inputMode)
        : input.keyboardType,
    returnKeyType:
      input.enterKeyHint !== undefined
        ? mapAutoComplete(enterKeyHintToReturnKeyType, input.enterKeyHint)
        : input.returnKeyType,
    editable: input.readOnly !== undefined ? !input.readOnly : input.editable,
    submitBehavior: foldSubmitBehavior(input.submitBehavior, input.blurOnSubmit, input.multiline),
    selectionColor: input.selectionColor,
    cursorColor: input.cursorColor !== undefined ? input.cursorColor : input.selectionColor,
    selectionHandleColor:
      input.selectionHandleColor !== undefined ? input.selectionHandleColor : input.selectionColor,
    underlineColorAndroid:
      input.underlineColorAndroid !== undefined ? input.underlineColorAndroid : 'transparent',
    autoComplete: folded.autoComplete,
    textContentType:
      input.textContentType !== undefined ? input.textContentType : folded.textContentType,
    showSoftInputOnFocus:
      input.inputMode !== undefined ? input.inputMode !== 'none' : input.showSoftInputOnFocus,
  };
}

// The app-facing prop contract, shared by every adapter so the surface CANNOT drift. TextInput
// is its own host element (not a View wrapper), so it carries the accessibility/aria aliases.
export type ITextInputProps = IAccessibilityProps &
  IAriaProps & {
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
    // Input behavior props, forwarded to Fabric via passthrough (the native TextInput
    // ViewManager reads them directly); declared here so app code is type-checked.
    autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
    autoCorrect?: boolean;
    // W3C autocomplete token. RN folds it to the Android `autoComplete` / iOS
    // `textContentType` native prop in JS (TextInput.js:938); see foldAutoComplete.
    autoComplete?: string;
    // iOS content-type hint. An explicit value wins over the autoComplete-derived one.
    textContentType?: string;
    autoFocus?: boolean;
    // iOS keyboard suppression. RN derives it from inputMode (`inputMode !== 'none'`)
    // when inputMode is set, else uses the explicit value (TextInput.js:935).
    showSoftInputOnFocus?: boolean;
    returnKeyType?: string;
    selectTextOnFocus?: boolean;
    scrollEnabled?: boolean;
    numberOfLines?: number;
    textAlign?: 'left' | 'center' | 'right';
    blurOnSubmit?: boolean;
    // Modern W3C-aligned aliases. RN folds each to its legacy native prop in JS before
    // reaching Fabric (TextInput.js): the raw aliases are inert at the native layer, so we
    // fold them here and forward only the legacy value.
    inputMode?: IInputMode;
    enterKeyHint?: IEnterKeyHint;
    readOnly?: boolean;
    submitBehavior?: ISubmitBehavior;
    cursorColor?: string;
    selectionColor?: string;
    selectionHandleColor?: string;
    // Android-only: color of the platform EditText underline. RN defaults it to 'transparent'
    // so the Material default bar is hidden (TextInput.js:908); iOS ignores it.
    underlineColorAndroid?: string;
    // Pairs this input with an InputAccessoryView whose nativeID matches; native docks that
    // view above the keyboard while the input is focused. Forwarded via passthrough.
    inputAccessoryViewID?: string;
    style?: ITextStyle;

    onChangeText?: (text: string) => void;
    onChange?: ITextInputEventHandler;
    onFocus?: ITextInputEventHandler;
    onBlur?: ITextInputEventHandler;
    onEndEditing?: ITextInputEventHandler;
    onSubmitEditing?: ITextInputEventHandler;
    onKeyPress?: ITextInputEventHandler;
    onSelectionChange?: ITextInputEventHandler;
    onContentSizeChange?: ITextInputEventHandler;
  };

// The imperative handle RN exposes on a TextInput ref. focus/blur/clear/setSelection drive
// native view commands; isFocused is tracked JS-side from the focus/blur event pair (RN keeps
// the same state in TextInputState (there is no native getter to query).
export type ITextInputHandle = {
  focus(): void;
  blur(): void;
  clear(): void;
  isFocused(): boolean;
  setSelection(start: number, end: number): void;
};
