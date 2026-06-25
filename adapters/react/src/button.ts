// Button — the minimal cross-platform button, rendered in its iOS shape per RN's
// Button.js: a TouchableOpacity wrapping a Text. On iOS `color` tints the text
// (on Android it would tint the background; iOS-first here). `disabled` greys the
// label and drops the press handler.

import { createElement, type FC } from 'react'
import { Text } from './components'
import { TouchableOpacity } from './touchable'
import type { SymbioteEvent } from '@symbiote/engine'
import type { AccessibilityProps, AriaProps } from './accessibility-props'
import type { TextStyle } from './styles'

const IOS_BUTTON_BLUE = '#007AFF'
const IOS_DISABLED_GREY = '#cdcdcd'

const buttonTextStyle: TextStyle = {
  color: IOS_BUTTON_BLUE,
  textAlign: 'center',
  padding: 8,
  fontSize: 18,
}

// RN's Button is `accessibilityRole="button"`; the role string is a native
// accessibility enum value, fine inline.
const BUTTON_ACCESSIBILITY_ROLE = 'button'

export interface ButtonProps extends AccessibilityProps, AriaProps {
  title: string
  onPress?: (event: SymbioteEvent) => void
  color?: string
  disabled?: boolean
  // Suppress the native tap sound (Button.js:50). Forwarded to the pressable, which
  // owns sound suppression via android_disableSound.
  touchSoundDisabled?: boolean
  // Locate this button in end-to-end tests (Button.js:144). Forwarded to the root.
  testID?: string
  // tvOS / Android-TV focus props (Button.js:68,79). Typed and forwarded; inert on
  // a phone host, where native ignores them.
  hasTVPreferredFocus?: boolean
  nextFocusDown?: number
  nextFocusForward?: number
  nextFocusLeft?: number
  nextFocusRight?: number
  nextFocusUp?: number
}

export const Button: FC<ButtonProps> = (props) => {
  const {
    title,
    onPress,
    color,
    disabled,
    touchSoundDisabled,
    testID,
    hasTVPreferredFocus,
    nextFocusDown,
    nextFocusForward,
    nextFocusLeft,
    nextFocusRight,
    nextFocusUp,
    ...accessibilityRest
  } = props

  const textStyle: TextStyle = { ...buttonTextStyle }
  if (color !== undefined) textStyle.color = color
  if (disabled === true) textStyle.color = IOS_DISABLED_GREY

  // The pressable / native View props that TouchableOpacity does not type but
  // forwards to Fabric (testID + TV-focus). Carried as a plain record — the same
  // pass-through idiom Image uses — so excess-property typing does not reject the
  // native-only keys at the TouchableOpacity boundary. TV-focus is inert on a phone.
  const nativeForward: Record<string, unknown> = { testID }
  if (hasTVPreferredFocus !== undefined) nativeForward.hasTVPreferredFocus = hasTVPreferredFocus
  if (nextFocusDown !== undefined) nativeForward.nextFocusDown = nextFocusDown
  if (nextFocusForward !== undefined) nativeForward.nextFocusForward = nextFocusForward
  if (nextFocusLeft !== undefined) nativeForward.nextFocusLeft = nextFocusLeft
  if (nextFocusRight !== undefined) nativeForward.nextFocusRight = nextFocusRight
  if (nextFocusUp !== undefined) nativeForward.nextFocusUp = nextFocusUp

  // RN's Button sets role=button, is accessible, and propagates the disabled
  // accessibility state (Button.js: accessibilityRole="button",
  // accessible={accessible}, accessibilityState={_accessibilityState}). The
  // caller's accessibility props pass through, but Button's fixed role / accessible
  // / disabled-state win — applied after the spread. touchSoundDisabled maps to the
  // pressable's android_disableSound (Button.js:50 -> the native touchable's sound).
  return createElement(
    TouchableOpacity,
    {
      ...accessibilityRest,
      ...nativeForward,
      onPress,
      disabled,
      android_disableSound: touchSoundDisabled,
      accessibilityRole: BUTTON_ACCESSIBILITY_ROLE,
      accessible: true,
      accessibilityState: { disabled },
    },
    createElement(Text, { style: textStyle }, title),
  )
}
