// TouchableNativeFeedback — Android's ripple/state-drawable touchable, built on
// Pressable like the rest of the Touchable* family. RN realizes its feedback by
// cloning the child into an RCTView carrying native ripple props; we instead
// nest the child under a feedback View that carries those props, inside a
// Pressable that owns the press wiring. The native props
// (nativeBackgroundAndroid / nativeForegroundAndroid) are read by Android's
// ReactViewManager; on iOS (no native ripple) they are inert props on that
// View, so the component still renders its child with working press wiring —
// the same graceful degrade as the rest of the family. Pressable only forwards
// a fixed prop set onto its own View, so the native props ride a dedicated
// child View rather than being spread onto the Pressable.

import { createElement, type FC, type ReactNode } from 'react'
import { dlog, Platform } from '@symbiote/shared'
import { View } from './components'
import { Pressable, type PressableProps } from './pressable'

// The two background dict shapes RN's static factories produce. Modelled as a
// discriminated union on `type` so a caller can narrow without a cast.
export interface ThemeAttrBackground {
  type: 'ThemeAttrAndroid'
  attribute: 'selectableItemBackground' | 'selectableItemBackgroundBorderless'
  rippleRadius?: number
}

export interface RippleBackground {
  type: 'RippleAndroid'
  color: string | null
  borderless: boolean
  rippleRadius?: number
}

export type NativeFeedbackBackground = ThemeAttrBackground | RippleBackground

type TouchableNativeFeedbackBaseProps = Omit<PressableProps, 'style' | 'children'> & {
  background?: NativeFeedbackBackground
  useForeground?: boolean
  // A single child element, mirroring RN (it accepts only one View child).
  children?: ReactNode
}

export interface TouchableNativeFeedbackProps extends TouchableNativeFeedbackBaseProps {}

// The static helpers are pure: each returns the plain config dict RN's native
// ripple manager understands. They live as properties on the component value so
// callers reach them as `TouchableNativeFeedback.Ripple(...)`, exactly like RN.
interface TouchableNativeFeedbackComponent extends FC<TouchableNativeFeedbackProps> {
  SelectableBackground: (rippleRadius?: number) => ThemeAttrBackground
  SelectableBackgroundBorderless: (rippleRadius?: number) => ThemeAttrBackground
  Ripple: (color: string, borderless: boolean, rippleRadius?: number) => RippleBackground
  canUseNativeForeground: () => boolean
}

// Maps the resolved background + useForeground onto the native prop Android
// reads. `useForeground` only paints the foreground when the platform supports
// it (canUseNativeForeground); otherwise it falls back to the background slot,
// matching RN. On iOS both props are inert.
function backgroundProps(
  background: NativeFeedbackBackground,
  useForeground: boolean,
): Record<string, NativeFeedbackBackground> {
  if (useForeground && TouchableNativeFeedback.canUseNativeForeground()) {
    return { nativeForegroundAndroid: background }
  }
  return { nativeBackgroundAndroid: background }
}

const TouchableNativeFeedbackImpl: FC<TouchableNativeFeedbackProps> = (props) => {
  const { background, useForeground = false, children, ...rest } = props

  // RN defaults a missing background to SelectableBackground() so the touchable
  // always has feedback; mirror that here.
  const resolved = background ?? TouchableNativeFeedback.SelectableBackground()
  dlog(`TouchableNativeFeedback render ${resolved.type} useForeground ${useForeground}`)

  const nativeProps = backgroundProps(resolved, useForeground)
  // The native ripple props ride a dedicated feedback View nested under the
  // Pressable; the Pressable owns the press wiring, the feedback View owns the
  // drawable. (RN injects both onto one cloned child node — we keep the press
  // responder and the drawable on adjacent nodes, which Android resolves the
  // same way.)
  const feedback = createElement(View, nativeProps, children)
  return createElement(Pressable, rest, feedback)
}

// Attach the static factories to the component value. They are deeply-immutable
// literals up to the caller's inputs, so the `type` discriminants are `as const`.
const TouchableNativeFeedback: TouchableNativeFeedbackComponent = Object.assign(
  TouchableNativeFeedbackImpl,
  {
    SelectableBackground: (rippleRadius?: number): ThemeAttrBackground => ({
      type: 'ThemeAttrAndroid' as const,
      attribute: 'selectableItemBackground',
      rippleRadius,
    }),
    SelectableBackgroundBorderless: (rippleRadius?: number): ThemeAttrBackground => ({
      type: 'ThemeAttrAndroid' as const,
      attribute: 'selectableItemBackgroundBorderless',
      rippleRadius,
    }),
    // RN runs the color string through processColor (→ a native int); we have no
    // native bridge here, so we keep the string and let Android resolve it. A
    // null color is the documented "no tint" value.
    Ripple: (color: string, borderless: boolean, rippleRadius?: number): RippleBackground => ({
      type: 'RippleAndroid' as const,
      color,
      borderless,
      rippleRadius,
    }),
    // Native foreground ripple is Android-only (API 23+). RN gates this on
    // Platform.OS === 'android' && Platform.Version >= 23. Version is a string on
    // iOS (where the gate is irrelevant) and a number on Android, so guard the
    // type at runtime before the numeric compare — no cast.
    canUseNativeForeground: (): boolean =>
      Platform.OS === 'android' &&
      typeof Platform.Version === 'number' &&
      Platform.Version >= 23,
  },
)

export { TouchableNativeFeedback }
