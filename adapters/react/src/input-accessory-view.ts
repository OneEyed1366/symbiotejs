// InputAccessoryView primitive (iOS). A real Fabric host node — RCTInputAccessoryView —
// that docks its content above the keyboard. It is referenced by `nativeID`, which a
// TextInput points at through its `inputAccessoryViewID` prop; native pairs the two by id.
// There is no JS-side translation: style/nativeID/backgroundColor map straight onto the
// intrinsic and children nest under it.

import { createElement, type FC, type ReactNode } from 'react'
import { dlog } from '@symbiote/engine'
import { resolveAccessibilityProps, type AccessibilityProps, type AriaProps } from './accessibility-props'
import type { ViewStyle } from './styles'

export interface InputAccessoryViewProps extends AccessibilityProps, AriaProps {
  // The id a TextInput's inputAccessoryViewID points at to dock above its keyboard.
  nativeID?: string
  backgroundColor?: string
  style?: ViewStyle
  children?: ReactNode
}

export const InputAccessoryView: FC<InputAccessoryViewProps> = (rawProps) => {
  // Owns its host element (symbiote-input-accessory-view), so it folds aria/role
  // here; the resolved accessibility* surface rides the node via `...accessibilityRest`.
  const props = resolveAccessibilityProps(rawProps)
  const { nativeID, backgroundColor, style, children, ...accessibilityRest } = props

  dlog('InputAccessoryView -> RCTInputAccessoryView')

  const nodeProps: Record<string, unknown> = { ...accessibilityRest, style }
  if (nativeID !== undefined) nodeProps.nativeID = nativeID
  if (backgroundColor !== undefined) nodeProps.backgroundColor = backgroundColor

  return createElement('symbiote-input-accessory-view', nodeProps, children)
}
