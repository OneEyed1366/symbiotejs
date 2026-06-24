// The Touchable* family, all built on Pressable. RN realizes their feedback with
// Animated, and so do we now that the shared Animated engine exists:
//   TouchableOpacity   — wrap the children in an Animated.View and animate its
//     opacity (Animated.Value + Animated.timing) toward activeOpacity on press-in
//     and back to 1 on press-out, driven imperatively from onPressIn/onPressOut.
//   TouchableHighlight — paint underlayColor as the background and lower the child
//     opacity while pressed. RN drives this with a setState toggle, NOT Animated,
//     so we mirror that with Pressable's pressed-state style — faithful to RN.
//   TouchableWithoutFeedback — no visual change, just the press wiring.

import { createElement, useRef, type FC, type ReactNode } from 'react'
import type { SymbioteEvent } from '@symbiote/shared'
import { Pressable, type PressableProps, type PressState } from './pressable'
import { Animated } from './animated'
import type { ViewStyle } from './styles'

// Defaults and animation timings ported from RN's Touchable sources.
// TouchableOpacity.js: _opacityActive(150)/_opacityInactive(250), activeOpacity 0.2.
const DEFAULT_ACTIVE_OPACITY = 0.2
const OPACITY_ACTIVE_DURATION_MS = 150
const OPACITY_INACTIVE_DURATION_MS = 250
const RESTING_OPACITY = 1
// TouchableHighlight.js: child opacity 0.85, underlay 'black' when unset.
const DEFAULT_HIGHLIGHT_CHILD_OPACITY = 0.85
const DEFAULT_UNDERLAY_COLOR = 'black'

type TouchableBaseProps = Omit<PressableProps, 'style' | 'children'> & {
  style?: ViewStyle
  children?: ReactNode
}

export interface TouchableOpacityProps extends TouchableBaseProps {
  activeOpacity?: number
}

export const TouchableOpacity: FC<TouchableOpacityProps> = (props) => {
  const { activeOpacity = DEFAULT_ACTIVE_OPACITY, style, children, onPressIn, onPressOut, ...rest } = props

  // One Animated.Value per mount, resting at full opacity. The Animated.View leaf
  // commits its current value every frame, so timing it animates the real view.
  const opacity = useRef(new Animated.Value(RESTING_OPACITY)).current

  function setOpacityTo(toValue: number, duration: number): void {
    Animated.timing(opacity, {
      toValue,
      duration,
      easing: Animated.Easing.inOut(Animated.Easing.quad),
      useNativeDriver: false,
    }).start()
  }

  function handlePressIn(event: SymbioteEvent): void {
    setOpacityTo(activeOpacity, OPACITY_ACTIVE_DURATION_MS)
    onPressIn?.(event)
  }

  function handlePressOut(event: SymbioteEvent): void {
    setOpacityTo(RESTING_OPACITY, OPACITY_INACTIVE_DURATION_MS)
    onPressOut?.(event)
  }

  return createElement(
    Pressable,
    { ...rest, onPressIn: handlePressIn, onPressOut: handlePressOut },
    createElement(Animated.View, { style: [style, { opacity }] }, children),
  )
}

export interface TouchableHighlightProps extends TouchableBaseProps {
  activeOpacity?: number
  underlayColor?: string
}

export const TouchableHighlight: FC<TouchableHighlightProps> = (props) => {
  const {
    activeOpacity = DEFAULT_HIGHLIGHT_CHILD_OPACITY,
    underlayColor = DEFAULT_UNDERLAY_COLOR,
    style,
    children,
    ...rest
  } = props

  function pressedStyle({ pressed }: PressState): ViewStyle {
    if (!pressed) return { ...style }
    return { ...style, backgroundColor: underlayColor, opacity: activeOpacity }
  }

  return createElement(Pressable, { ...rest, style: pressedStyle }, children)
}

export interface TouchableWithoutFeedbackProps extends TouchableBaseProps {}

export const TouchableWithoutFeedback: FC<TouchableWithoutFeedbackProps> = (props) => {
  const { children, ...rest } = props
  return createElement(Pressable, rest, children)
}
