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
  autoComplete?: string
  autoFocus?: boolean
  returnKeyType?: string
  selectTextOnFocus?: boolean
  scrollEnabled?: boolean
  numberOfLines?: number
  textAlign?: 'left' | 'center' | 'right'
  blurOnSubmit?: boolean
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
  const { value, defaultValue, multiline, selection, onChange, onChangeText, onFocus, onBlur, ...rest } =
    props

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

  const intrinsic = multiline === true ? 'symbiote-text-input-multiline' : 'symbiote-text-input'

  return createElement(intrinsic, {
    ...rest,
    ref,
    text,
    mostRecentEventCount,
    selection,
    onChange: handleChange,
    onFocus: handleFocus,
    onBlur: handleBlur,
  })
})

TextInput.displayName = 'TextInput'
