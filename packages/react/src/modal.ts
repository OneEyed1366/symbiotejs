// Modal primitive. RCTModalHostView is an ordinary Fabric host node: it lives in
// the SAME childSet and commits through the SAME completeRoot as the rest of the
// tree. The native iOS/Android view presents its own window internally — there is
// no second root or second surface on the JS side. So this is a thin component
// exactly like the others: it maps to the `symbiote-modal` intrinsic the host
// config already routes to `ModalHostView`.
//
// Behavior mirrors RN's own Modal.js: the `visible` gate, the full-screen
// container View RN wraps the children in (collapsable={false} plus a flex:1 box
// anchored top/left), the transparent-aware backdrop, the position:absolute host
// style, and the iOS keep-alive that lets `onDismiss` fire on a visible→hidden
// transition. Children always live UNDER that container, under the modal node —
// never as a direct sibling of the host.
//
// Deferred vs RN: RN routes `onDismiss` through the native `modalDismissed` event
// (NativeModalManager + a per-modal identifier), which fires when the native exit
// animation completes (Modal.js componentDidMount / ModalEventEmitter). That
// native plumbing needs host support we don't have here, so we implement the
// JS-observable part only — the isRendered keep-alive plus firing `onDismiss` on
// the visible→hidden transition. The native exit-animation timing is what's
// deferred, not the callback contract.

import { createElement, useEffect, useState, type FC, type ReactNode } from 'react'
import { dlog } from '@symbiote/shared'
import { resolveAccessibilityProps, type AccessibilityProps, type AriaProps } from './accessibility-props'
import type { ViewStyle } from './styles'

export type ModalAnimationType = 'none' | 'slide' | 'fade'

export type ModalPresentationStyle =
  | 'fullScreen'
  | 'pageSheet'
  | 'formSheet'
  | 'overFullScreen'

export type ModalOrientation =
  | 'portrait'
  | 'portrait-upside-down'
  | 'landscape'
  | 'landscape-left'
  | 'landscape-right'

export interface ModalOrientationChangeEvent {
  orientation: 'portrait' | 'landscape'
}

export interface ModalProps extends AccessibilityProps, AriaProps {
  visible?: boolean
  transparent?: boolean
  backdropColor?: string
  animationType?: ModalAnimationType
  presentationStyle?: ModalPresentationStyle
  supportedOrientations?: ReadonlyArray<ModalOrientation>
  hardwareAccelerated?: boolean
  statusBarTranslucent?: boolean
  // navigationBarTranslucent makes the Android nav bar translucent; RN requires
  // statusBarTranslucent true alongside it (Modal.js ~172 / confirmProps ~193).
  navigationBarTranslucent?: boolean
  // allowSwipeDismissal lets a swipe-down dismiss the modal on iOS; RN pairs it
  // with onRequestClose to handle the dismissal (Modal.js ~155).
  allowSwipeDismissal?: boolean
  testID?: string
  onShow?: () => void
  onDismiss?: () => void
  onRequestClose?: () => void
  onOrientationChange?: (event: ModalOrientationChangeEvent) => void
  style?: ViewStyle
  children?: ReactNode
}

// The full-screen box RN anchors the modal content in (Modal.js styles.container:
// [side]:0, top:0, flex:1, backgroundColor:'white'). It is NOT position:absolute —
// it is a flex child that fills the ModalHostView, whose shadow node self-sizes to
// the screen (ModalHostViewComponentDescriptor sets the node size to screenSize).
// An absolute container with only top/left would collapse to its content instead.
// The backdrop color is layered on at render time so transparent/backdropColor win.
const CONTAINER_STYLE: Readonly<ViewStyle> = {
  left: 0,
  top: 0,
  flex: 1,
}

// RN sets styles.modal (position:'absolute') on RCTModalHostView itself (Modal.js
// styles.modal + style={styles.modal} on the host).
const MODAL_HOST_STYLE: Readonly<ViewStyle> = {
  position: 'absolute',
}

const TRANSPARENT_BACKDROP = 'transparent'
const OPAQUE_BACKDROP = 'white'
const DEFAULT_ANIMATION_TYPE: ModalAnimationType = 'none'

// presentationStyle default (Modal.js: undefined -> 'fullScreen', but transparent
// flips it to 'overFullScreen').
const PRESENTATION_FULL_SCREEN: ModalPresentationStyle = 'fullScreen'
const PRESENTATION_OVER_FULL_SCREEN: ModalPresentationStyle = 'overFullScreen'

// Wrap an optional event handler so its delivery is visible under DEBUG without
// changing behavior: the wrapper logs the seam, then calls through to the real
// handler. Undefined stays undefined (no node prop, nothing to log).
function loggedEvent<TArgs extends ReadonlyArray<unknown>>(
  name: string,
  handler: ((...args: TArgs) => void) | undefined,
): ((...args: TArgs) => void) | undefined {
  if (handler === undefined) return undefined
  return (...args: TArgs) => {
    dlog(`Modal event delivered -> ${name}`)
    handler(...args)
  }
}

export const Modal: FC<ModalProps> = (rawProps) => {
  // Modal owns its host element (symbiote-modal), so it folds aria/role into
  // accessibility* here; the resolved fields ride the host node via `...passthrough`.
  const props = resolveAccessibilityProps(rawProps)
  const {
    visible,
    transparent,
    backdropColor,
    animationType,
    presentationStyle,
    // Named-forward the platform props RN passes explicitly on RCTModalHostView
    // (Modal.js ~336-350) rather than letting them ride ...passthrough raw.
    supportedOrientations,
    hardwareAccelerated,
    statusBarTranslucent,
    navigationBarTranslucent,
    allowSwipeDismissal,
    style,
    children,
    onShow,
    onDismiss,
    onRequestClose,
    onOrientationChange,
    ...passthrough
  } = props

  // RN keeps the modal mounted through its exit animation (Modal.js
  // _shouldShowModal: visible===true || state.isRendered===true) so the native
  // onDismiss event can arrive before the node unmounts. isRendered is PURELY that
  // keep-alive — it never itself calls onDismiss. On Fabric, onDismiss is a real
  // native DirectEvent (topDismiss -> 'dismiss'), routed by MODAL_EVENTS and
  // delivered via the node-prop onDismiss below; RN never simulates it in JS
  // (Modal.js ~318-339; the modalDismissed emitter path is old-renderer iOS-only).
  // The keep-alive only holds the node mounted through the exit transition.
  const [isRendered, setIsRendered] = useState(visible === true)

  useEffect(() => {
    if (visible === true) {
      // visible false->true: re-arm the keep-alive (Modal.js componentDidUpdate).
      if (!isRendered) setIsRendered(true)
      return
    }
    // visible->hidden while still rendered: drop the keep-alive so the node can
    // unmount after the native exit transition. onDismiss is NOT fired here — the
    // native topDismiss event is its single source (Modal.js render setState
    // isRendered:false; no JS onDismiss call).
    if (isRendered) {
      dlog('Modal isRendered transition -> false (visible->hidden); keep-alive dropped')
      setIsRendered(false)
    }
  }, [visible, isRendered])

  // The visible gate with iOS keep-alive: a fully hidden modal (not visible and no
  // longer rendered) contributes no node, exactly as RN's render returns null when
  // _shouldShowModal() is false.
  if (visible !== true && !isRendered) {
    dlog('Modal hidden -> no node committed')
    return null
  }

  // Only override backgroundColor when transparent or backdropColor are explicitly
  // set, so these Modal-specific props take precedence over the generic style prop
  // (Modal.js: containerStyles composed LAST in [styles.container, props.style,
  // containerStyles]).
  const backdropOverride: ViewStyle =
    transparent === true
      ? { backgroundColor: TRANSPARENT_BACKDROP }
      : backdropColor !== undefined
        ? { backgroundColor: backdropColor }
        : {}

  const containerStyle: ViewStyle = {
    ...CONTAINER_STYLE,
    backgroundColor: OPAQUE_BACKDROP,
    ...style,
    ...backdropOverride,
  }

  const resolvedPresentationStyle =
    presentationStyle ??
    (transparent === true ? PRESENTATION_OVER_FULL_SCREEN : PRESENTATION_FULL_SCREEN)

  dlog('Modal visible -> committing ModalHostView(container View)')

  // collapsable:false keeps the container as a real shadow node (RN sets this so
  // the wrapper is never flattened away under the host).
  const container = createElement(
    'symbiote-view',
    { style: containerStyle, collapsable: false },
    children,
  )

  return createElement(
    'symbiote-modal',
    {
      ...passthrough,
      style: MODAL_HOST_STYLE,
      transparent,
      animationType: animationType ?? DEFAULT_ANIMATION_TYPE,
      presentationStyle: resolvedPresentationStyle,
      // Platform props named-forwarded to match RCTModalHostView (Modal.js
      // ~336-350): iOS supportedOrientations/allowSwipeDismissal,
      // Android hardwareAccelerated/statusBarTranslucent/navigationBarTranslucent.
      supportedOrientations,
      hardwareAccelerated,
      statusBarTranslucent,
      navigationBarTranslucent,
      allowSwipeDismissal,
      onShow: loggedEvent('onShow', onShow),
      onDismiss: loggedEvent('onDismiss', onDismiss),
      onRequestClose: loggedEvent('onRequestClose', onRequestClose),
      onOrientationChange: loggedEvent('onOrientationChange', onOrientationChange),
      visible,
    },
    container,
  )
}
