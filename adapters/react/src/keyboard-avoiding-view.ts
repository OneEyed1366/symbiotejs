// KeyboardAvoidingView — composes the host View and shifts it out of the
// keyboard's way as the keyboard shows/hides. It subscribes to the Keyboard
// module (native->JS events) and recomputes a bottom inset from the keyboard
// frame and the view's own measured frame. Mirrors RN's
// Libraries/Components/Keyboard/KeyboardAvoidingView.js, as a function component.

import {
  createElement,
  useEffect,
  useRef,
  useState,
  type FC,
  type ReactElement,
  type ReactNode,
} from 'react'
import { dlog, type SymbioteEvent } from '@symbiote/engine'
import { View, type ViewProps } from './components'
import { Keyboard, KEYBOARD_EVENT } from './keyboard'
import type { AccessibilityProps, AriaProps } from './accessibility-props'
import type { ViewStyle } from './styles'

export type KeyboardAvoidingBehavior = 'height' | 'position' | 'padding'

export interface KeyboardAvoidingViewProps extends AccessibilityProps, AriaProps {
  behavior?: KeyboardAvoidingBehavior
  // When false, the view passes through untouched — no inset is applied in any
  // behavior mode. RN gates every inset/height computation on `enabled ?? true`
  // (KeyboardAvoidingView.js); default true.
  enabled?: boolean
  // Distance from the top of the screen to this view; subtracted from the inset
  // so a view that doesn't start at y=0 still clears the keyboard exactly.
  keyboardVerticalOffset?: number
  // Style of the inner content container, used only when behavior is 'position'.
  contentContainerStyle?: ViewStyle
  style?: ViewStyle
  children?: ReactNode
  onLayout?: (event: SymbioteEvent) => void
}

const DEFAULT_VERTICAL_OFFSET = 0

// The wrapper frame as RN's onLayout reports it: nativeEvent.layout.{ y, height }.
interface MeasuredFrame {
  y: number
  height: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// Pull the keyboard's top edge (screenY) and height off the raw native payload.
// The shape is the consumer's knowledge, so we narrow `unknown` here rather than
// trust a type — no `as`. Returns undefined when the payload isn't a keyboard frame.
function readKeyboardFrame(payload: unknown): { screenY: number; height: number } | undefined {
  if (!isRecord(payload)) return undefined
  const end = payload.endCoordinates
  if (!isRecord(end)) return undefined
  const { screenY, height } = end
  if (typeof screenY !== 'number' || typeof height !== 'number') return undefined
  return { screenY, height }
}

// RN's _relativeKeyboardHeight: how far up the view must move so it no longer
// overlaps the keyboard. keyboardY is the keyboard's top edge minus the caller's
// vertical offset; the inset is the overlap of the view's bottom past that edge,
// clamped at 0.
function computeInset(
  frame: MeasuredFrame | undefined,
  keyboard: { screenY: number; height: number } | undefined,
  verticalOffset: number,
): number {
  if (frame === undefined || keyboard === undefined) return 0
  const keyboardY = keyboard.screenY - verticalOffset
  return Math.max(frame.y + frame.height - keyboardY, 0)
}

export const KeyboardAvoidingView: FC<KeyboardAvoidingViewProps> = (props) => {
  const {
    behavior,
    enabled = true,
    keyboardVerticalOffset = DEFAULT_VERTICAL_OFFSET,
    contentContainerStyle,
    style,
    children,
    onLayout,
    // The wrapper is the View FC, which runs resolveAccessibilityProps itself, so
    // the raw aria/role + accessibility* props pass through untouched here and fold
    // there once.
    ...accessibilityRest
  } = props

  const [inset, setInset] = useState(0)
  // Mutable, not state: changing the frame alone shouldn't re-render; it feeds the
  // next keyboard event's inset math.
  const frameRef = useRef<MeasuredFrame | undefined>(undefined)
  const initialHeightRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    const onShow = (payload: unknown): void => {
      const keyboard = readKeyboardFrame(payload)
      const next = computeInset(frameRef.current, keyboard, keyboardVerticalOffset)
      dlog(`KeyboardAvoidingView show -> inset ${next}`)
      setInset(next)
    }
    const onHide = (): void => {
      dlog('KeyboardAvoidingView hide -> inset 0')
      setInset(0)
    }

    const subscriptions = [
      Keyboard.addListener(KEYBOARD_EVENT.didShow, onShow),
      Keyboard.addListener(KEYBOARD_EVENT.didChangeFrame, onShow),
      Keyboard.addListener(KEYBOARD_EVENT.didHide, onHide),
    ]
    return () => {
      for (const subscription of subscriptions) subscription.remove()
    }
  }, [keyboardVerticalOffset])

  const handleLayout = (event: SymbioteEvent): void => {
    const layout = event.nativeEvent.layout
    if (isRecord(layout) && typeof layout.y === 'number' && typeof layout.height === 'number') {
      frameRef.current = { y: layout.y, height: layout.height }
      if (initialHeightRef.current === undefined) initialHeightRef.current = layout.height
    }
    onLayout?.(event)
  }

  // When disabled the inset is forced to 0, so every behavior mode renders the view
  // untouched (RN gates each bottomHeight/height computation on `enabled ?? true`).
  const effectiveInset = enabled ? inset : 0

  // 'position' nests the content in an inner View pushed up by `bottom: inset`;
  // the others adjust the wrapper directly. 'height' shrinks the wrapper from its
  // initial measured height (only while the keyboard is up, matching RN).
  if (behavior === 'position') {
    const innerStyle: ViewStyle = { ...contentContainerStyle, bottom: effectiveInset }
    return renderWrapper(style, createElement(View, { style: innerStyle }, children))
  }

  let wrapperStyle: ViewStyle | undefined = style
  if (behavior === 'padding') {
    wrapperStyle = { ...style, paddingBottom: effectiveInset }
  } else if (
    behavior === 'height' &&
    effectiveInset > 0 &&
    initialHeightRef.current !== undefined
  ) {
    wrapperStyle = { ...style, height: initialHeightRef.current - effectiveInset, flex: 0 }
  }

  return renderWrapper(wrapperStyle, children)

  // The wrapper carries onLayout. The View FC's public props don't surface it, but
  // `symbiote-view` routes the base layout event at runtime; widen the props through
  // a typed variable (no inline-literal excess-property check, no `as`) so the
  // onLayout reaches the host without editing View's public type.
  function renderWrapper(wrapStyle: ViewStyle | undefined, content: ReactNode): ReactElement {
    const wrapperProps: ViewProps & { onLayout: (event: SymbioteEvent) => void } = {
      ...accessibilityRest,
      style: wrapStyle,
      onLayout: handleLayout,
      children: content,
    }
    return createElement(View, wrapperProps)
  }
}
