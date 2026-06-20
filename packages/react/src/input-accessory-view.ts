// InputAccessoryView primitive (iOS). A real Fabric host node — RCTInputAccessoryView —
// that docks its content above the keyboard. It is referenced by `nativeID`, which a
// TextInput points at through its `inputAccessoryViewID` prop; native pairs the two by id.
// There is no JS-side translation: style/nativeID/backgroundColor map straight onto the
// intrinsic and children nest under it.

import { createElement, type FC, type ReactNode } from 'react'
import { dlog } from '@symbiote/shared'
import type { ViewStyle } from './styles'

export interface InputAccessoryViewProps {
  // The id a TextInput's inputAccessoryViewID points at to dock above its keyboard.
  nativeID?: string
  backgroundColor?: string
  style?: ViewStyle
  children?: ReactNode
}

export const InputAccessoryView: FC<InputAccessoryViewProps> = (props) => {
  const { nativeID, backgroundColor, style, children } = props

  dlog('InputAccessoryView -> RCTInputAccessoryView')

  const nodeProps: Record<string, unknown> = { style }
  if (nativeID !== undefined) nodeProps.nativeID = nativeID
  if (backgroundColor !== undefined) nodeProps.backgroundColor = backgroundColor

  return createElement('symbiote-input-accessory-view', nodeProps, children)
}
