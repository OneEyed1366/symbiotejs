// Pressable — the userland interaction primitive. It composes a single View and
// the press/pressIn/pressOut listeners that shared synthesizes on the responder
// node; there is no new native view and no core change. `pressed` is JS state:
// pressIn sets it true, pressOut sets it false, so style/children can react to it.
// onLongPress has no native event — it is synthesized with a timer armed on
// pressIn and disarmed on pressOut/press, matching RN's Pressability behavior.
//
// Three RN interaction props that change real app feel are layered on top of the
// shared press synthesis, entirely in JS here (shared still fires the raw
// pressIn/press/pressOut):
//   - android_ripple / android_disableSound — Android native-feedback props that
//     ride a dedicated child View (mirroring touchable-native-feedback.ts), inert
//     on iOS.
//   - unstable_pressDelay — a timer that defers pressIn/pressed activation, like
//     the long-press timer (RN Pressable.js:156).
//   - pressRetentionOffset — keeps the press ACTIVE while the finger drifts within
//     the view's measured rect expanded per-edge by hitSlop then this offset; only a
//     drift past that region fires pressOut / cancels the tap (RN Pressable.js:78,
//     Pressability _isTouchWithinResponderRegion). The rect is measured on responder
//     grant; a headless host with no measurable frame falls back to a press-start
//     radius. Wired into the responder-move stream of the same View.

import { createElement, useMemo, useRef, useState, type FC, type ReactNode } from 'react'
import { dlog, Platform, type SymbioteEvent } from '@symbiote/engine'
import { View } from './components'
import type { HostInstance } from './host-instance'
import type { AccessibilityProps, AccessibilityStateValue, AriaProps } from './accessibility-props'
import type { ViewStyle } from './styles'

const DEFAULT_DELAY_LONG_PRESS_MS = 500
// RN's default extra slop kept around a press once it is active, before a drift
// fires pressOut — the PressRect extension (Pressability.js
// DEFAULT_PRESS_RECT_OFFSETS). Per-edge, with a deeper bottom (thumb travel).
const DEFAULT_PRESS_RECT_OFFSETS = { top: 20, left: 20, bottom: 30, right: 20 }
// Per-edge inset rect, the normalized shape every edge test reads (RN's Rect).
interface EdgeInsets {
  top: number
  left: number
  bottom: number
  right: number
}
// The measured on-screen frame the retention test runs against — left/top/right/
// bottom page coordinates, mirroring Pressability.js `_responderRegion`.
interface ResponderRegion {
  top: number
  left: number
  bottom: number
  right: number
}

export interface PressState {
  pressed: boolean
}

type PressHandler = (event: SymbioteEvent) => void
type StyleProp = ViewStyle | ((state: PressState) => ViewStyle)
type ChildrenProp = ReactNode | ((state: PressState) => ReactNode)

// Native ripple config Android's ReactViewManager reads off the inner View
// (nativeBackgroundAndroid). `foreground` routes it to the foreground slot. Inert
// on iOS, where the inner View is a plain box. Mirrors RN's
// PressableAndroidRippleConfig (Pressable.js:146 / useAndroidRippleForView.js).
export interface PressableAndroidRippleConfig {
  color?: string
  borderless?: boolean
  radius?: number
  foreground?: boolean
}

// The RippleAndroid background dict shape Android resolves. Same shape the
// TouchableNativeFeedback.Ripple factory produces; replicated minimally here so
// Pressable owns no cross-import to the touchable family.
interface RippleBackground {
  type: 'RippleAndroid'
  color: string | null
  borderless: boolean
  rippleRadius?: number
}

type RectOffset = number | { top?: number; left?: number; bottom?: number; right?: number }

export interface PressableProps extends AccessibilityProps, AriaProps {
  onPress?: PressHandler
  onPressIn?: PressHandler
  onPressOut?: PressHandler
  // Fires on every responder move while the press is live (RN Pressable.js onPressMove
  // → Pressability onResponderMove). Distinct from the retention drift bookkeeping.
  onPressMove?: PressHandler
  onLongPress?: PressHandler
  delayLongPress?: number
  disabled?: boolean
  // false refuses to yield the responder when another view (e.g. a parent ScrollView)
  // asks to take over — RN forwards this to onResponderTerminationRequest, default true
  // (Pressable.js cancelable → Pressability onResponderTerminationRequest).
  cancelable?: boolean
  hitSlop?: RectOffset
  // Extra distance outside the visual bounds in which a drifting press stays active
  // before pressOut fires (RN Pressable.js:78). A scalar applies to every edge.
  pressRetentionOffset?: RectOffset
  // Delay (ms) between touch-down and pressIn / pressed activation; 0 = immediate
  // (RN Pressable.js:156).
  unstable_pressDelay?: number
  // Android-only ripple feedback; inert on iOS (RN Pressable.js:146).
  android_ripple?: PressableAndroidRippleConfig
  // Suppress the Android system tap sound (RN Pressable.js:141). Forwarded to native.
  android_disableSound?: boolean
  // Pointer-hover callbacks (RN Pressability onHoverIn/onHoverOut). This host has no
  // pointer-enter/leave event — there is no mouse on a touch device — so they are
  // accepted, typed, and forwarded but inert (a dlog notes the no-op). On a future
  // pointer-capable host they would wire to onPointerEnter/onPointerLeave.
  onHoverIn?: PressHandler
  onHoverOut?: PressHandler
  delayHoverIn?: number
  delayHoverOut?: number
  testID?: string
  style?: StyleProp
  children?: ChildrenProp
}

function resolveStyle(style: StyleProp | undefined, state: PressState): ViewStyle | undefined {
  if (typeof style === 'function') return style(state)
  return style
}

function resolveChildren(children: ChildrenProp | undefined, state: PressState): ReactNode {
  if (typeof children === 'function') return children(state)
  return children
}

// A rect offset is a per-edge object (not the scalar shorthand). Used to read the
// asymmetric form without an `as` cast.
function isEdgeInsets(value: RectOffset): value is { top?: number; left?: number; bottom?: number; right?: number } {
  return typeof value === 'object'
}

// Normalize a scalar-or-rect offset to a per-edge rect: a number expands all four
// edges, mirroring RN's normalizeRect (StyleSheet/Rect.js). Absent edges read 0.
function normalizeRect(offset: RectOffset | undefined): EdgeInsets {
  if (offset === undefined) return { top: 0, left: 0, bottom: 0, right: 0 }
  if (isEdgeInsets(offset)) {
    const { top = 0, left = 0, bottom = 0, right = 0 } = offset
    return { top, left, bottom, right }
  }
  return { top: offset, left: offset, bottom: offset, right: offset }
}

// The widest single edge of an offset, for the radius fallback when no measured rect
// is available (headless). RN tracks per-edge; the distance-from-origin check is
// symmetric, so the widest edge is the conservative bound.
function maxEdge(insets: EdgeInsets): number {
  return Math.max(insets.top, insets.left, insets.bottom, insets.right)
}

// Is a touch page-point inside the measured responder region, expanded per-edge by
// hitSlop then pressRectOffset? Direct port of Pressability.js
// `_isTouchWithinResponderRegion` — the authoritative retention test RN runs on
// every move (left/top shrink the bound, right/bottom grow it; strict inequalities).
function isTouchWithinRegion(
  point: { x: number; y: number },
  region: ResponderRegion,
  hitSlop: EdgeInsets,
  pressRectOffset: EdgeInsets,
): boolean {
  const left = region.left - hitSlop.left - pressRectOffset.left
  const right = region.right + hitSlop.right + pressRectOffset.right
  const top = region.top - hitSlop.top - pressRectOffset.top
  const bottom = region.bottom + hitSlop.bottom + pressRectOffset.bottom
  return point.x > left && point.x < right && point.y > top && point.y < bottom
}

// Page coordinate of a single-touch native event, or undefined when it carried no
// numeric coords (then the retention drift check is skipped, never guessed).
function readPoint(event: SymbioteEvent): { x: number; y: number } | undefined {
  const { pageX, pageY } = event.nativeEvent
  if (typeof pageX === 'number' && typeof pageY === 'number') return { x: pageX, y: pageY }
  return undefined
}

// Build the Android native-feedback prop the inner View carries from the ripple
// config. RN runs the color through processColor → a native int; we have no native
// bridge in JS, so we keep the string and let Android resolve it (a null color is
// the documented "no tint"). Returns the prop dict the inner View spreads.
function rippleProps(
  config: PressableAndroidRippleConfig,
): Record<string, RippleBackground> | undefined {
  if (Platform.OS !== 'android') return undefined
  const background: RippleBackground = {
    type: 'RippleAndroid',
    color: config.color ?? null,
    borderless: config.borderless === true,
    rippleRadius: config.radius,
  }
  return config.foreground === true
    ? { nativeForegroundAndroid: background }
    : { nativeBackgroundAndroid: background }
}

export const Pressable: FC<PressableProps> = (props) => {
  const {
    onPress,
    onPressIn,
    onPressOut,
    onPressMove,
    onLongPress,
    delayLongPress = DEFAULT_DELAY_LONG_PRESS_MS,
    disabled,
    cancelable,
    hitSlop,
    pressRetentionOffset,
    unstable_pressDelay = 0,
    android_ripple,
    android_disableSound,
    onHoverIn,
    onHoverOut,
    delayHoverIn,
    delayHoverOut,
    accessibilityState,
    testID,
    style,
    children,
    // The remaining accessibility / aria props are forwarded to View untouched;
    // View runs resolveAccessibilityProps, so aria/role fold there, once.
    ...accessibilityRest
  } = props

  const [pressed, setPressed] = useState(false)
  // Holds the in-flight long-press timer between pressIn and pressOut/press; a
  // ref (not state) so arming/disarming it never triggers a re-render.
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // True once the long-press timer fired, until the next pressIn rearms. RN skips
  // onPress when a long press fired (Pressability.js: isPressCanceledByLongPress);
  // without this flag a completed hold would emit a spurious onPress on release.
  const longPressFired = useRef(false)
  // Holds the in-flight unstable_pressDelay timer; the activation (pressed-state +
  // pressIn + long-press arm) runs inside it, deferred by `unstable_pressDelay` ms.
  const pressDelayTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Page coordinate the active press started at — the radius-fallback origin used
  // only when no measured rect is available (headless).
  const pressOrigin = useRef<{ x: number; y: number } | undefined>(undefined)
  // True once a drift past hitSlop+retention deactivated the press; suppresses the
  // tap on release until the finger returns inside the region (RN Pressability).
  const driftedOut = useRef(false)
  // The View instance, so we can measure its on-screen rect on responder grant — the
  // retention region RN derives from UIManager.measure (Pressability _responderRegion).
  const viewRef = useRef<HostInstance | null>(null)
  // The measured frame from the latest grant; undefined until measure resolves (or on
  // a host where measure is a no-op), which drops the test to the radius fallback.
  const regionRef = useRef<ResponderRegion | undefined>(undefined)

  const handlers = useMemo(() => {
    // Per-edge offsets for the measured-rect retention test (RN's hitSlop +
    // pressRectOffset). pressRetentionOffset defaults to RN's DEFAULT_PRESS_RECT_OFFSETS
    // when unset; hitSlop defaults to a zero rect.
    const hitSlopRect = normalizeRect(hitSlop)
    const pressRectOffset =
      pressRetentionOffset === undefined ? DEFAULT_PRESS_RECT_OFFSETS : normalizeRect(pressRetentionOffset)
    // Radius fallback bound, used only when no measured rect exists (headless): the
    // sum of the widest hitSlop edge and the widest retention edge.
    const fallbackThreshold = maxEdge(hitSlopRect) + maxEdge(pressRectOffset)

    // True iff the touch point still belongs to the active press: against the measured
    // rect when we have one (the RN-faithful path), else the symmetric radius fallback.
    function isWithinRetention(point: { x: number; y: number }): boolean {
      const region = regionRef.current
      if (region !== undefined) {
        return isTouchWithinRegion(point, region, hitSlopRect, pressRectOffset)
      }
      const origin = pressOrigin.current
      if (origin === undefined) return true
      return Math.hypot(point.x - origin.x, point.y - origin.y) <= fallbackThreshold
    }

    // Measure the View's on-screen frame and cache it as the retention region for the
    // life of this press (RN measures on responder grant — Pressability
    // _measureResponderRegion). When measure is unavailable — no ref yet, an uncommitted
    // node, or a host slot without a measure method (headless) — the region stays
    // undefined and the move test falls back to the radius bound. The try/catch guards
    // that last case: a slot lacking measure throws rather than no-opping.
    function measureRegion(): void {
      regionRef.current = undefined
      const view = viewRef.current
      if (view === null) return
      dlog('Pressable measuring responder region')
      try {
        view.measure((_x, _y, width, height, pageX, pageY) => {
          // RN's _measureCallback ignores an all-zero frame (the view is not laid out).
          if (!width && !height && !pageX && !pageY) return
          regionRef.current = { left: pageX, top: pageY, right: pageX + width, bottom: pageY + height }
          dlog('Pressable responder region measured')
        })
      } catch {
        dlog('Pressable measure unavailable — retention falls back to radius')
      }
    }

    function clearLongPress(): void {
      if (longPressTimer.current !== undefined) {
        clearTimeout(longPressTimer.current)
        longPressTimer.current = undefined
      }
    }

    function clearPressDelay(): void {
      if (pressDelayTimer.current !== undefined) {
        clearTimeout(pressDelayTimer.current)
        pressDelayTimer.current = undefined
      }
    }

    // The real activation: flip pressed-state on, arm the long-press timer, fire
    // onPressIn. Split out so unstable_pressDelay can defer it behind a timer while
    // an early release can flush it synchronously (RN: a release before the delay
    // still registers the press).
    function activate(event: SymbioteEvent): void {
      dlog('Pressable pressIn')
      setPressed(true)
      longPressFired.current = false
      if (onLongPress) {
        longPressTimer.current = setTimeout(() => {
          longPressTimer.current = undefined
          longPressFired.current = true
          dlog('Pressable longPress timer fired')
          onLongPress(event)
        }, delayLongPress)
      }
      onPressIn?.(event)
    }

    // Flush a still-pending pressDelay timer immediately, so a pressOut/press that
    // arrives before the delay elapsed still sees an activated press.
    function flushPressDelay(event: SymbioteEvent): void {
      if (pressDelayTimer.current !== undefined) {
        clearPressDelay()
        activate(event)
      }
    }

    return {
      handlePressIn(event: SymbioteEvent): void {
        pressOrigin.current = readPoint(event)
        driftedOut.current = false
        // Measure the on-screen rect now so the move stream tests against the real
        // frame, not a press-start radius (RN measures on grant).
        measureRegion()
        if (unstable_pressDelay > 0) {
          dlog(`Pressable pressIn deferred ${unstable_pressDelay}ms`)
          pressDelayTimer.current = setTimeout(() => {
            pressDelayTimer.current = undefined
            activate(event)
          }, unstable_pressDelay)
          return
        }
        activate(event)
      },
      handlePressOut(event: SymbioteEvent): void {
        dlog('Pressable pressOut')
        flushPressDelay(event)
        clearLongPress()
        pressOrigin.current = undefined
        regionRef.current = undefined
        setPressed(false)
        onPressOut?.(event)
      },
      handlePress(event: SymbioteEvent): void {
        dlog('Pressable press')
        flushPressDelay(event)
        clearLongPress()
        // A drift past the retention region cancels the tap (RN); reset and suppress.
        if (driftedOut.current) {
          driftedOut.current = false
          dlog('Pressable press suppressed by drift past retention region')
          return
        }
        // A fired long press cancels the tap — reset the flag and suppress onPress.
        if (longPressFired.current) {
          longPressFired.current = false
          dlog('Pressable press suppressed by prior longPress')
          return
        }
        onPress?.(event)
      },
      // Responder-move stream of the Pressable's own View. onPressMove fires on every
      // move while the press is live (RN). Then the retention test: a move outside the
      // measured region (expanded by hitSlop+pressRectOffset) fires an early pressOut
      // and marks the tap suppressed; a move back inside re-activates.
      handleResponderMove(event: SymbioteEvent): void {
        onPressMove?.(event)
        const here = readPoint(event)
        if (!here) return
        if (!isWithinRetention(here)) {
          if (!driftedOut.current) {
            dlog('Pressable drifted past retention region — deactivating')
            driftedOut.current = true
            clearLongPress()
            setPressed(false)
            onPressOut?.(event)
          }
        } else if (driftedOut.current) {
          dlog('Pressable returned inside retention region — reactivating')
          driftedOut.current = false
          activate(event)
        }
      },
    }
  }, [
    onPress,
    onPressIn,
    onPressOut,
    onPressMove,
    onLongPress,
    delayLongPress,
    hitSlop,
    pressRetentionOffset,
    unstable_pressDelay,
  ])

  // Hover has no event on a touch host: there is no pointer-enter/leave. Accept the
  // RN props, type them, and forward nothing — a dlog records the no-op so a missing
  // hover callback on device is explained, not silent (RN onHoverIn/onHoverOut).
  if (onHoverIn !== undefined || onHoverOut !== undefined) {
    dlog('Pressable hover is a no-op on this host (no pointer-enter/leave event)')
  }
  void delayHoverIn
  void delayHoverOut

  const state: PressState = { pressed }

  // RN merges `disabled` into the resolved accessibilityState so a disabled
  // Pressable reports the disabled state even if the caller passed none
  // (Pressable.js: `disabled != null ? {...state, disabled} : state`).
  const resolvedAccessibilityState: AccessibilityStateValue | undefined =
    disabled !== undefined ? { ...accessibilityState, disabled } : accessibilityState

  const viewProps: Record<string, unknown> = {
    ...accessibilityRest,
    // The ref is the handle the retention measure reaches through (measure on grant).
    ref: viewRef,
    style: resolveStyle(style, state),
    hitSlop,
    accessibilityState: resolvedAccessibilityState,
    testID,
  }
  // Forward the Android tap-sound suppressor under RN's own key so a future native
  // binding reads it directly; inert on iOS (no Android sound to suppress there).
  if (android_disableSound !== undefined) viewProps.android_disableSound = android_disableSound
  // When disabled, leave the listeners off entirely — a press never fires and
  // pressed-state never flips, exactly as RN's disabled Pressable.
  if (disabled !== true) {
    viewProps.onPress = handlers.handlePress
    viewProps.onPressIn = handlers.handlePressIn
    viewProps.onPressOut = handlers.handlePressOut
    // Claim the responder so the move stream reaches this View; retention reads it.
    viewProps.onStartShouldSetResponder = () => true
    viewProps.onResponderMove = handlers.handleResponderMove
    // cancelable === false refuses to yield the responder (e.g. a press inside a
    // ScrollView that asks to take over). RN routes cancelable straight to
    // onResponderTerminationRequest (default true when unset).
    if (cancelable !== undefined) {
      viewProps.onResponderTerminationRequest = () => cancelable
    }
  } else {
    dlog('Pressable disabled — listeners suppressed')
  }

  // android_ripple rides a dedicated inner View (the Pressable's own View only
  // forwards a fixed prop set), mirroring touchable-native-feedback.ts. On iOS the
  // ripple prop is undefined, so the child renders unwrapped — no extra node.
  const ripple = android_ripple !== undefined ? rippleProps(android_ripple) : undefined
  const content = resolveChildren(children, state)
  const inner = ripple !== undefined ? createElement(View, ripple, content) : content

  return createElement(View, viewProps, inner)
}
