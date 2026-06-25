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
import { dlog, type SymbioteEvent } from '@symbiote/engine'
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
// RN's Pressability DEFAULT_MIN_PRESS_DURATION — the floor a press visual is held,
// so a very fast tap still flashes the active feedback (Pressability.js).
const DEFAULT_MIN_PRESS_DURATION_MS = 130

// The press-timing props RN's TouchableOpacity forwards to its Pressability config
// (_createPressabilityConfig). Pressable does not own these, so the Touchable layers
// the delay/floor scheduling on top of its own onPressIn/onPressOut.
interface PressTimingProps {
  delayPressIn?: number
  delayPressOut?: number
  minPressDuration?: number
}

type TouchableBaseProps = Omit<PressableProps, 'style' | 'children'> &
  PressTimingProps & {
    style?: ViewStyle
    children?: ReactNode
  }

export interface TouchableOpacityProps extends TouchableBaseProps {
  activeOpacity?: number
}

export const TouchableOpacity: FC<TouchableOpacityProps> = (props) => {
  const {
    activeOpacity = DEFAULT_ACTIVE_OPACITY,
    style,
    children,
    onPressIn,
    onPressOut,
    delayPressIn = 0,
    delayPressOut = 0,
    minPressDuration = DEFAULT_MIN_PRESS_DURATION_MS,
    ...rest
  } = props

  // One Animated.Value per mount, resting at full opacity. The Animated.View leaf
  // commits its current value every frame, so timing it animates the real view.
  const opacity = useRef(new Animated.Value(RESTING_OPACITY)).current
  // The pending delayPressIn timer, so a release before it fires can flush it.
  const pressInTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // When the active visual actually started, to floor onPressOut by minPressDuration.
  const activatedAt = useRef<number | undefined>(undefined)

  function setOpacityTo(toValue: number, duration: number): void {
    Animated.timing(opacity, {
      toValue,
      duration,
      easing: Animated.Easing.inOut(Animated.Easing.quad),
      useNativeDriver: false,
    }).start()
  }

  function clearPressInTimer(): void {
    if (pressInTimer.current !== undefined) {
      clearTimeout(pressInTimer.current)
      pressInTimer.current = undefined
    }
  }

  // The real activation: lower opacity, fire onPressIn, stamp the activation time.
  function activate(event: SymbioteEvent): void {
    activatedAt.current = Date.now()
    setOpacityTo(activeOpacity, OPACITY_ACTIVE_DURATION_MS)
    onPressIn?.(event)
  }

  // The real deactivation: restore opacity, fire onPressOut.
  function deactivate(event: SymbioteEvent): void {
    activatedAt.current = undefined
    setOpacityTo(RESTING_OPACITY, OPACITY_INACTIVE_DURATION_MS)
    onPressOut?.(event)
  }

  // RN's _createPressabilityConfig forwards delayPressIn: defer the active visual and
  // onPressIn behind the delay (a release before it elapses flushes it synchronously).
  function handlePressIn(event: SymbioteEvent): void {
    if (delayPressIn > 0) {
      dlog(`TouchableOpacity pressIn deferred ${delayPressIn}ms`)
      pressInTimer.current = setTimeout(() => {
        pressInTimer.current = undefined
        activate(event)
      }, delayPressIn)
      return
    }
    activate(event)
  }

  // delayPressOut + minPressDuration (RN _deactivate): the press-out waits at least
  // minPressDuration past activation (so a fast tap holds the active visual) and at
  // least delayPressOut, whichever is longer.
  function handlePressOut(event: SymbioteEvent): void {
    if (pressInTimer.current !== undefined) {
      clearPressInTimer()
      activate(event)
    }
    const heldFor = activatedAt.current === undefined ? 0 : Date.now() - activatedAt.current
    const wait = Math.max(minPressDuration - heldFor, delayPressOut)
    if (wait > 0) {
      dlog(`TouchableOpacity pressOut deferred ${wait}ms`)
      setTimeout(() => deactivate(event), wait)
      return
    }
    deactivate(event)
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
