// TextInput — the controlled-value / event-count handshake primitive. There is
// NO `value` Fabric prop: JS folds value/defaultValue into a single private
// `text` prop plus a `mostRecentEventCount` counter. Native increments its own
// counter per keystroke and rejects stale writes by eventLag = nativeCount -
// mostRecentEventCount, so a controlled JS write must push the ACKNOWLEDGED count
// (the one native last reported) and go through the setTextAndSelection view
// command — never a plain prop re-push, which would fight the cursor.

import { createElement, useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { FC } from 'react'
import { dispatchViewCommand, dlog, type SymbioteEvent, type SymbioteNode } from '@symbiote/shared'
import type { TextStyle } from './styles'

type EventHandler = (event: SymbioteEvent) => void

export interface TextInputProps {
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

export const TextInput: FC<TextInputProps> = (props) => {
  const { value, defaultValue, multiline, selection, onChange, onChangeText, ...rest } = props

  const ref = useRef<SymbioteNode | null>(null)
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

  const intrinsic = multiline === true ? 'symbiote-text-input-multiline' : 'symbiote-text-input'

  return createElement(intrinsic, {
    ...rest,
    ref,
    text,
    mostRecentEventCount,
    selection,
    onChange: handleChange,
  })
}
