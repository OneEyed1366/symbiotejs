// TextInput — the controlled-value / event-count handshake primitive. There is
// NO `value` Fabric prop: JS folds value/defaultValue into a single private
// `text` prop plus a `mostRecentEventCount` counter. Native increments its own
// counter per keystroke and rejects stale writes by eventLag = nativeCount -
// mostRecentEventCount, so a controlled JS write must push the ACKNOWLEDGED count
// (the one native last reported) and go through the setTextAndSelection view
// command — never a plain prop re-push, which would fight the cursor.

import {
  createElement,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { dispatchViewCommand, dlog, type SymbioteEvent, type SymbioteNode } from '@symbiote/shared'
import { blurTextInput, setInputBlurred, setInputFocused } from './text-input-state'
import { resolveAccessibilityProps, type AccessibilityProps, type AriaProps } from './accessibility-props'
import type { TextStyle } from './styles'

type EventHandler = (event: SymbioteEvent) => void

type InputMode = 'none' | 'text' | 'decimal' | 'numeric' | 'tel' | 'search' | 'email' | 'url'
type EnterKeyHint = 'enter' | 'done' | 'go' | 'next' | 'previous' | 'search' | 'send'
type SubmitBehavior = 'submit' | 'blurAndSubmit' | 'newline'

// RN's inputMode -> keyboardType map (TextInput.js:815). `search` is platform-split
// (iOS 'web-search', else 'default'); we use the Android/default branch since the
// folded prop is forwarded verbatim and the simulator target is iOS-first only for
// the canary — the safe default avoids an unknown keyboardType on Android.
const inputModeToKeyboardType: Record<InputMode, string> = {
  decimal: 'decimal-pad',
  email: 'email-address',
  none: 'default',
  numeric: 'number-pad',
  search: 'default',
  tel: 'phone-pad',
  text: 'default',
  url: 'url',
}

// RN's enterKeyHint -> returnKeyType map (TextInput.js:805). Note `enter` -> 'default'.
const enterKeyHintToReturnKeyType: Record<EnterKeyHint, string> = {
  done: 'done',
  enter: 'default',
  go: 'go',
  next: 'next',
  previous: 'previous',
  search: 'search',
  send: 'send',
}

// RN's W3C autocomplete -> Android `autoComplete` map (TextInput.js:828). A token
// with no native equivalent passes through unchanged (RN's `?? autoComplete`).
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
}

// RN's W3C autocomplete -> iOS `textContentType` map (TextInput.js:862). A token absent
// here leaves textContentType undefined on iOS (RN's `autoComplete in map` guard).
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
}

// Safe lookup into the W3C->native maps (no `as`): own-property guard, undefined if
// the token has no native equivalent. The caller decides the per-platform fallback.
function mapAutoComplete(map: Record<string, string>, token: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(map, token) ? map[token] : undefined
}

// RN folds W3C `autoComplete` per platform (TextInput.js:938): Android takes the mapped
// `autoComplete` token (falling back to the raw token), iOS takes the mapped
// `textContentType` (and only when the token is in the map, else leaves it untouched).
// Symbiote is Metro-built per platform but folds platform-agnostically (like the
// inputMode/enterKeyHint folds above), so we resolve BOTH native props from the one
// token: the iOS-only `textContentType` is inert on Android and the Android `autoComplete`
// token is inert on iOS, so emitting both is safe — same shape as the dual-keyed events.
function foldAutoComplete(token: string | undefined): {
  autoComplete: string | undefined
  textContentType: string | undefined
} {
  if (token === undefined) return { autoComplete: undefined, textContentType: undefined }
  return {
    autoComplete: mapAutoComplete(autoCompleteWebToAndroid, token) ?? token,
    textContentType: mapAutoComplete(autoCompleteWebToTextContentType, token),
  }
}

// RN's submitBehavior reconciliation (TextInput.js:559). Explicit submitBehavior
// wins (with single-line 'newline' coerced to 'blurAndSubmit'); else it is derived
// from the legacy blurOnSubmit per multiline.
function foldSubmitBehavior(
  submitBehavior: SubmitBehavior | undefined,
  blurOnSubmit: boolean | undefined,
  multiline: boolean,
): SubmitBehavior {
  if (submitBehavior !== undefined) {
    if (!multiline && submitBehavior === 'newline') return 'blurAndSubmit'
    return submitBehavior
  }
  if (multiline) return blurOnSubmit === true ? 'blurAndSubmit' : 'newline'
  return blurOnSubmit !== false ? 'blurAndSubmit' : 'submit'
}

export interface TextInputProps extends AccessibilityProps, AriaProps {
  value?: string
  defaultValue?: string
  placeholder?: string
  placeholderTextColor?: string
  editable?: boolean
  keyboardType?: string
  secureTextEntry?: boolean
  maxLength?: number
  multiline?: boolean
  selection?: { start: number; end?: number }
  // Input behavior props — forwarded to Fabric via ...rest (the native TextInput
  // ViewManager reads them directly); declared here so app code is type-checked.
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters'
  autoCorrect?: boolean
  // W3C autocomplete token. RN folds it to the Android `autoComplete` / iOS
  // `textContentType` native prop in JS (TextInput.js:938) — see foldAutoComplete.
  autoComplete?: string
  // iOS content-type hint. An explicit value wins over the autoComplete-derived one.
  textContentType?: string
  autoFocus?: boolean
  // iOS keyboard suppression. RN derives it from inputMode (`inputMode !== 'none'`)
  // when inputMode is set, else uses the explicit value (TextInput.js:935).
  showSoftInputOnFocus?: boolean
  returnKeyType?: string
  selectTextOnFocus?: boolean
  scrollEnabled?: boolean
  numberOfLines?: number
  textAlign?: 'left' | 'center' | 'right'
  blurOnSubmit?: boolean
  // Modern W3C-aligned aliases. RN folds each to its legacy native prop in JS
  // before reaching Fabric (TextInput.js) — the raw aliases are inert at the
  // native layer, so we fold them here and forward only the legacy value.
  inputMode?: InputMode
  enterKeyHint?: EnterKeyHint
  readOnly?: boolean
  submitBehavior?: SubmitBehavior
  cursorColor?: string
  selectionColor?: string
  selectionHandleColor?: string
  // Android-only: color of the platform EditText underline. RN defaults it to
  // 'transparent' so the Material default bar is hidden (TextInput.js:908, doc
  // TextInput.js:347); iOS has no underline concept and ignores it.
  underlineColorAndroid?: string
  // Pairs this input with an InputAccessoryView whose nativeID matches; native docks
  // that view above the keyboard while the input is focused. Forwarded via ...rest.
  inputAccessoryViewID?: string
  style?: TextStyle

  onChangeText?: (text: string) => void
  onChange?: EventHandler
  onFocus?: EventHandler
  onBlur?: EventHandler
  onEndEditing?: EventHandler
  onSubmitEditing?: EventHandler
  onKeyPress?: EventHandler
  onSelectionChange?: EventHandler
  onContentSizeChange?: EventHandler
}

// The imperative handle RN exposes on a TextInput ref. focus/blur/clear drive native
// view commands; isFocused is tracked JS-side from the focus/blur event pair (RN keeps
// the same state in TextInputState — there is no native getter to query).
export interface TextInputHandle {
  focus(): void
  blur(): void
  clear(): void
  isFocused(): boolean
  setSelection(start: number, end: number): void
}

// RN's fold: value wins, else defaultValue, else leave undefined (uncontrolled).
function foldText(value: string | undefined, defaultValue: string | undefined): string | undefined {
  if (typeof value === 'string') return value
  if (typeof defaultValue === 'string') return defaultValue
  return undefined
}

function textFromChange(event: SymbioteEvent): string | undefined {
  const text = event.nativeEvent.text
  return typeof text === 'string' ? text : undefined
}

function eventCountFromChange(event: SymbioteEvent): number | undefined {
  const count = event.nativeEvent.eventCount
  return typeof count === 'number' ? count : undefined
}

export const TextInput = forwardRef<TextInputHandle, TextInputProps>((rawProps, forwardedRef) => {
  // TextInput is its own host element (not a View wrapper), so it folds aria/role here.
  const props = resolveAccessibilityProps(rawProps)
  // Pull out the modern W3C aliases so they don't reach Fabric raw (RN strips them
  // in JS) — each is folded to its legacy native prop below.
  const {
    value,
    defaultValue,
    multiline,
    selection,
    onChange,
    onChangeText,
    onFocus,
    onBlur,
    inputMode,
    enterKeyHint,
    readOnly,
    submitBehavior,
    blurOnSubmit,
    cursorColor,
    selectionColor,
    selectionHandleColor,
    keyboardType,
    returnKeyType,
    editable,
    autoComplete,
    textContentType,
    autoFocus,
    showSoftInputOnFocus,
    underlineColorAndroid,
    ...rest
  } = props

  const isMultiline = multiline === true
  // inputMode wins over keyboardType; enterKeyHint over returnKeyType; readOnly
  // over editable (inverted). RN does each fold in TextInput.js:928-934.
  const foldedKeyboardType = inputMode !== undefined ? inputModeToKeyboardType[inputMode] : keyboardType
  const foldedReturnKeyType =
    enterKeyHint !== undefined ? enterKeyHintToReturnKeyType[enterKeyHint] : returnKeyType
  const foldedEditable = readOnly !== undefined ? !readOnly : editable
  const foldedSubmitBehavior = foldSubmitBehavior(submitBehavior, blurOnSubmit, isMultiline)
  // RN defaults the cursor/selection-handle color from selectionColor when unset
  // (TextInput.js:747) for iOS↔Android consistency.
  const foldedCursorColor = cursorColor !== undefined ? cursorColor : selectionColor
  const foldedSelectionHandleColor =
    selectionHandleColor !== undefined ? selectionHandleColor : selectionColor
  // RN folds the W3C autoComplete token to the per-platform native prop; an explicit
  // textContentType still wins over the derived one (TextInput.js:946).
  const foldedAutoComplete = foldAutoComplete(autoComplete)
  const foldedTextContentType =
    textContentType !== undefined ? textContentType : foldedAutoComplete.textContentType
  // inputMode forces softInput visibility ('none' hides it); else the explicit prop
  // stands (TextInput.js:935).
  const foldedShowSoftInputOnFocus =
    inputMode !== undefined ? inputMode !== 'none' : showSoftInputOnFocus
  // RN defaults underlineColorAndroid to 'transparent' to hide the platform
  // EditText underline (TextInput.js:908); an explicit value wins.
  const foldedUnderlineColorAndroid =
    underlineColorAndroid !== undefined ? underlineColorAndroid : 'transparent'

  const ref = useRef<SymbioteNode | null>(null)
  // JS-side focus state, mirrored from the focus/blur events for isFocused(). RN's
  // TextInputState holds the same — native exposes no synchronous focus getter.
  const focused = useRef(false)
  // The count native last acknowledged. We echo it back on every controlled
  // write so native's eventLag lands on 0 and the write applies.
  const [mostRecentEventCount, setMostRecentEventCount] = useState(0)
  // The last text native holds, as far as JS knows. Seeded from the mount-time
  // value because the `text` prop already carries that value down via createNode
  // — so the FIRST controlled value is not a divergence and must NOT re-command.
  // Only later, post-keystroke divergences flow through setTextAndSelection.
  const lastNativeText = useRef<string | undefined>(foldText(value, defaultValue))

  const handleChange = useCallback(
    (event: SymbioteEvent): void => {
      // Event seam: the controlled handshake hinges on the change payload carrying
      // `text` (+ `eventCount`). iOS and Android Fabric can key these differently, so
      // log the actual shape here — a missing `text` means onChangeText never fires.
      dlog(
        `TextInput change keys=[${Object.keys(event.nativeEvent).join(',')}] ` +
          `text=${JSON.stringify(event.nativeEvent.text)} count=${JSON.stringify(event.nativeEvent.eventCount)}`,
      )
      const text = textFromChange(event)
      if (text !== undefined) {
        lastNativeText.current = text
        onChangeText?.(text)
      }
      // Ordering matters: record the text first, then bump the acknowledged
      // count, so the count never runs ahead of the text it stands for.
      const count = eventCountFromChange(event)
      if (count !== undefined) setMostRecentEventCount(count)
      onChange?.(event)
    },
    [onChange, onChangeText],
  )

  const text = foldText(value, defaultValue)

  // Controlled write: when JS-side `value` diverges from what native reported,
  // command the new text down with the acknowledged count. A plain prop re-push
  // would race the user's keystrokes; the command is the only stale-safe path.
  useLayoutEffect(() => {
    const node = ref.current
    if (node === null) return
    if (typeof value !== 'string') return
    if (lastNativeText.current === value) return

    const selStart = selection?.start ?? -1
    const selEnd = selection?.end ?? selection?.start ?? -1
    dlog(`TextInput setTextAndSelection count=${mostRecentEventCount} text=${JSON.stringify(value)}`)
    dispatchViewCommand(node, 'setTextAndSelection', [mostRecentEventCount, value, selStart, selEnd])
    lastNativeText.current = value
  })

  // autoFocus is driven in JS, not as a native prop: on mount, command `focus` down
  // once (RN does the same via TextInputState.focusInput, TextInput.js:538). Empty deps
  // so it fires only on mount; the native `focus` command is idempotent if already focused.
  useEffect(() => {
    if (autoFocus !== true) return
    const node = ref.current
    if (node === null) return
    dlog('TextInput autoFocus -> focus command')
    dispatchViewCommand(node, 'focus', [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleFocus = useCallback(
    (event: SymbioteEvent): void => {
      focused.current = true
      // Track focus app-wide so Keyboard.dismiss can blur this input without a ref.
      if (ref.current !== null) setInputFocused(ref.current)
      onFocus?.(event)
    },
    [onFocus],
  )

  const handleBlur = useCallback(
    (event: SymbioteEvent): void => {
      focused.current = false
      if (ref.current !== null) setInputBlurred(ref.current)
      onBlur?.(event)
    },
    [onBlur],
  )

  // The imperative API RN exposes on the ref. focus/blur drive native view commands;
  // clear and setSelection reuse setTextAndSelection — the same stale-safe path as a
  // controlled write — echoing the acknowledged event count so native applies them.
  useImperativeHandle(
    forwardedRef,
    () => ({
      focus: (): void => {
        const node = ref.current
        if (node !== null) dispatchViewCommand(node, 'focus', [])
      },
      blur: (): void => {
        // Routes through TextInputState so the app-wide focus tracking clears too.
        blurTextInput(ref.current)
      },
      clear: (): void => {
        const node = ref.current
        if (node === null) return
        dispatchViewCommand(node, 'setTextAndSelection', [mostRecentEventCount, '', 0, 0])
        lastNativeText.current = ''
      },
      isFocused: (): boolean => focused.current,
      setSelection: (start: number, end: number): void => {
        const node = ref.current
        if (node === null) return
        const current = lastNativeText.current ?? ''
        dispatchViewCommand(node, 'setTextAndSelection', [mostRecentEventCount, current, start, end])
      },
    }),
    [mostRecentEventCount],
  )

  const intrinsic = isMultiline ? 'symbiote-text-input-multiline' : 'symbiote-text-input'

  return createElement(intrinsic, {
    ...rest,
    ref,
    text,
    mostRecentEventCount,
    selection,
    keyboardType: foldedKeyboardType,
    returnKeyType: foldedReturnKeyType,
    editable: foldedEditable,
    submitBehavior: foldedSubmitBehavior,
    selectionColor,
    cursorColor: foldedCursorColor,
    selectionHandleColor: foldedSelectionHandleColor,
    underlineColorAndroid: foldedUnderlineColorAndroid,
    autoComplete: foldedAutoComplete.autoComplete,
    textContentType: foldedTextContentType,
    showSoftInputOnFocus: foldedShowSoftInputOnFocus,
    onChange: handleChange,
    onFocus: handleFocus,
    onBlur: handleBlur,
  })
})

TextInput.displayName = 'TextInput'
