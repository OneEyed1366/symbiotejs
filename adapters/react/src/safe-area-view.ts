// SafeAreaView primitive. A plain view whose native side insets its children to
// the safe area (notch, rounded corners, system bars). There is no JS-side
// translation — RN just renders the native RCTSafeAreaView and lets the host do
// the inset math — so this maps style + children straight onto the intrinsic.

import { createElement, type FC, type ReactNode } from 'react'
import { dlog, type SymbioteEvent } from '@symbiote/engine'
import { resolveAccessibilityProps, type AccessibilityProps, type AriaProps } from './accessibility-props'
import type { ViewStyle } from './styles'

export interface SafeAreaViewProps extends AccessibilityProps, AriaProps {
  style?: ViewStyle
  children?: ReactNode
  // Standard ViewProps, forwarded onto the native safe-area node.
  testID?: string
  onLayout?: (event: SymbioteEvent) => void
}

export const SafeAreaView: FC<SafeAreaViewProps> = (rawProps) => {
  // Owns its host element (symbiote-safe-area-view), so it folds aria/role here;
  // the resolved accessibility* surface rides the node via `...accessibilityRest`.
  const props = resolveAccessibilityProps(rawProps)
  const { style, children, onLayout, ...accessibilityRest } = props

  dlog('SafeAreaView -> SafeAreaView')

  const nodeProps: Record<string, unknown> = { ...accessibilityRest, style }
  if (onLayout !== undefined) nodeProps.onLayout = onLayout

  return createElement('symbiote-safe-area-view', nodeProps, children)
}
