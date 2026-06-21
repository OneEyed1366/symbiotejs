// Event normalization. Fabric delivers raw touch primitives to a single global
// handler, with the instanceHandle (our SymbioteNode) as the target. There is no
// raw `press` event — a tap is synthesized from a touch sequence: the start and
// end targets are correlated so a press fires only when the touch ends on the
// node it started on (or a descendant). Bubbling events walk target -> root,
// invoking each ancestor's listener until one calls stopPropagation. Layout is a
// direct event in RN and is delivered only to its own target.

import { dlog } from './debug'
import { runWrapped } from './dispatch'
import { getSlot } from './fabric'
import { isSymbioteNode, type SymbioteEvent, type SymbioteNode } from './node'
import { registeredNativeEvent } from './registry'

// Raw Fabric event name -> listener name. Generic bubbling events live here; press
// is synthesized from a touch sequence and layout is direct, so both are handled
// outside this table.
// Raw Fabric event -> listener name, split by dispatch phase. Press is synthesized
// from a touch sequence (handled separately below); everything else is table-driven.
// Bubbling events walk target -> root; direct events fire only on the target.
const BUBBLING_EVENTS: Readonly<Record<string, string>> = {
  topFocus: 'focus',
  topBlur: 'blur',
  topChange: 'change',
  topEndEditing: 'endEditing',
  topSubmitEditing: 'submitEditing',
  topKeyPress: 'keyPress',
}
const DIRECT_EVENTS: Readonly<Record<string, string>> = {
  topLayout: 'layout',
  topScroll: 'scroll',
  topScrollBeginDrag: 'scrollBeginDrag',
  topScrollEndDrag: 'scrollEndDrag',
  topMomentumScrollBegin: 'momentumScrollBegin',
  topMomentumScrollEnd: 'momentumScrollEnd',
  topSelectionChange: 'selectionChange',
  topContentSizeChange: 'contentSizeChange',
  topLoadStart: 'loadStart',
  topLoad: 'load',
  topLoadEnd: 'loadEnd',
  topError: 'error',
  topProgress: 'progress',
  topPartialLoad: 'partialLoad',
  topRefresh: 'refresh',
  topShow: 'show',
  topRequestClose: 'requestClose',
  topDismiss: 'dismiss',
  topOrientationChange: 'orientationChange',
}

const TOUCH_START = 'topTouchStart'
const TOUCH_MOVE = 'topTouchMove'
const TOUCH_END = 'topTouchEnd'
const TOUCH_CANCEL = 'topTouchCancel'
const PRESS = 'press'

// Responder protocol (PanResponder). Minimal RN model: on a touch start, walk
// target -> root asking onStartShouldSetResponder; the first node that claims it
// becomes the responder and receives grant/move/release. Listener names are
// post-listenerName (onResponderMove -> 'responderMove').
const SHOULD_SET_RESPONDER = 'startShouldSetResponder'
const RESPONDER_GRANT = 'responderGrant'
const RESPONDER_MOVE = 'responderMove'
const RESPONDER_RELEASE = 'responderRelease'
const RESPONDER_TERMINATE = 'responderTerminate'
// Synthesized alongside press so Pressable can show pressed-state feedback: both
// fire on the node the touch STARTED on (the responder), pressOut on end/cancel.
const PRESS_IN = 'pressIn'
const PRESS_OUT = 'pressOut'

let installed = false

// Target of the in-flight touch, remembered at topTouchStart and consumed (or
// cleared) at topTouchEnd / topTouchCancel.
let pressStart: SymbioteNode | undefined

// The node that claimed the responder for the in-flight touch (PanResponder), or
// undefined when nobody claimed it. Receives move and release/terminate.
let currentResponder: SymbioteNode | undefined

// Invoke one node's own listener (no bubbling) and hand back its return value, so
// the responder negotiation can read the boolean from onStartShouldSetResponder.
function callOwnListener(
  node: SymbioteNode,
  listenerName: string,
  nativeEvent: Record<string, unknown>,
): unknown {
  const listener = node.listeners?.get(listenerName)
  if (!listener) return undefined
  return listener({
    type: listenerName,
    target: node,
    currentTarget: node,
    nativeEvent,
    stopPropagation: () => {},
  })
}

// Walk target -> root; the first node whose onStartShouldSetResponder returns true
// becomes the responder and is granted. Minimal model: no capture phase, no
// move-should-set, no mid-gesture takeover (enough for a PanResponder drag).
function negotiateResponder(target: SymbioteNode, nativeEvent: Record<string, unknown>): void {
  let node: SymbioteNode | undefined = target
  while (node) {
    if (callOwnListener(node, SHOULD_SET_RESPONDER, nativeEvent) === true) {
      currentResponder = node
      dlog(`responder granted to ${node.component}`)
      callOwnListener(node, RESPONDER_GRANT, nativeEvent)
      return
    }
    node = node.parent
  }
}

export function installEventHandler(): void {
  if (installed) return
  installed = true

  getSlot().registerEventHandler((instanceHandle, topLevelType, nativeEvent) => {
    if (!isSymbioteNode(instanceHandle)) return

    if (topLevelType === TOUCH_START) {
      dlog(`event ${TOUCH_START}`)
      pressStart = instanceHandle
      runWrapped(() => {
        bubble(instanceHandle, PRESS_IN, nativeEvent)
        // Responder negotiation runs alongside press synthesis: a View can be both
        // a Pressable (press) and a PanResponder target (responder).
        negotiateResponder(instanceHandle, nativeEvent)
      })
      return
    }

    if (topLevelType === TOUCH_MOVE) {
      // The only consumer of a move is the responder; without one, RN drops it too.
      const responder = currentResponder
      if (responder) runWrapped(() => callOwnListener(responder, RESPONDER_MOVE, nativeEvent))
      return
    }

    if (topLevelType === TOUCH_END) {
      const start = pressStart
      pressStart = undefined
      const responder = currentResponder
      currentResponder = undefined
      runWrapped(() => {
        if (start) {
          // press fires only on an honest tap (ended within the responder); pressOut
          // always fires on the responder so its pressed-state can release.
          if (endsWithin(instanceHandle, start)) {
            dlog('event press -> dispatch')
            bubble(start, PRESS, nativeEvent)
          }
          bubble(start, PRESS_OUT, nativeEvent)
        } else {
          dlog(`event ${TOUCH_END} ignored (no matching start)`)
        }
        if (responder) callOwnListener(responder, RESPONDER_RELEASE, nativeEvent)
      })
      return
    }

    if (topLevelType === TOUCH_CANCEL) {
      const start = pressStart
      pressStart = undefined
      const responder = currentResponder
      currentResponder = undefined
      runWrapped(() => {
        if (start) bubble(start, PRESS_OUT, nativeEvent)
        if (responder) callOwnListener(responder, RESPONDER_TERMINATE, nativeEvent)
      })
      return
    }

    const direct = DIRECT_EVENTS[topLevelType]
    if (direct !== undefined) {
      dlog(`event ${topLevelType} -> ${direct} (direct)`)
      runWrapped(() => deliverDirect(instanceHandle, direct, nativeEvent))
      return
    }

    const bubbling = BUBBLING_EVENTS[topLevelType]
    if (bubbling !== undefined) {
      dlog(`event ${topLevelType} -> ${bubbling} (bubble)`)
      runWrapped(() => bubble(instanceHandle, bubbling, nativeEvent))
      return
    }

    // Third-party Fabric views (registerComponent) declare their own events; the
    // built-in tables above don't know them, so fall back to the registry, keyed by
    // the node's own component. `direct` events fire only on their target, the rest
    // bubble — same split as the built-ins.
    const registered = registeredNativeEvent(instanceHandle.component, topLevelType)
    if (registered !== undefined) {
      const phase = registered.direct ? 'direct' : 'bubble'
      dlog(`event ${topLevelType} -> ${registered.listener} (${phase}, registered)`)
      runWrapped(() =>
        registered.direct
          ? deliverDirect(instanceHandle, registered.listener, nativeEvent)
          : bubble(instanceHandle, registered.listener, nativeEvent),
      )
      return
    }

    // Nothing claimed this event — neither a built-in table nor the view's derived
    // config. A permanent diagnostic seam: if a native view fires something we drop
    // on the floor (an event the ViewConfig didn't surface, or a name mismatch),
    // this is where it shows up. Keeps "the handler silently did nothing" debuggable.
    dlog(`event ${topLevelType} UNMATCHED on ${instanceHandle.component} (dropped)`)
  })
}

// A press is honest only if the touch ends on the node it started on, or a
// descendant of it: walk parent pointers up from the end target looking for the
// start target. The start node may have been unmounted mid-touch (parent pointer
// cleared) — the walk simply runs out and returns false, no throw.
function endsWithin(endTarget: SymbioteNode, start: SymbioteNode): boolean {
  let node: SymbioteNode | undefined = endTarget
  while (node) {
    if (node === start) return true
    node = node.parent
  }
  return false
}

// True bubbling: walk target -> root, invoking each ancestor's listener for this
// event name in order, until the chain ends or a listener stops propagation.
// `target` stays the original node; `currentTarget` tracks whose listener runs.
function bubble(
  target: SymbioteNode,
  listenerName: string,
  nativeEvent: Record<string, unknown>,
): void {
  let stopped = false
  let node: SymbioteNode | undefined = target
  while (node) {
    const listener = node.listeners?.get(listenerName)
    if (listener) {
      // engine owner adds currentTarget + stopPropagation to SymbioteEvent
      const event: SymbioteEvent = {
        type: listenerName,
        target,
        currentTarget: node,
        nativeEvent,
        stopPropagation: () => {
          stopped = true
        },
      }
      listener(event)
      if (stopped) return
    }
    node = node.parent
  }
}

// Direct (non-bubbling) delivery: only the target's own listener fires.
function deliverDirect(
  target: SymbioteNode,
  listenerName: string,
  nativeEvent: Record<string, unknown>,
): void {
  const listener = target.listeners?.get(listenerName)
  if (!listener) return
  // engine owner adds currentTarget + stopPropagation to SymbioteEvent
  listener({
    type: listenerName,
    target,
    currentTarget: target,
    nativeEvent,
    stopPropagation: () => {},
  })
}
