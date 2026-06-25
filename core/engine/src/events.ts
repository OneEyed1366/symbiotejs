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
  // Text glyph layout (onTextLayout) and the iOS status-bar-tap scroll-to-top.
  topTextLayout: 'textLayout',
  topScrollToTop: 'scrollToTop',
  // Accessibility events from RN's base ViewConfig — any view can emit them.
  // accessibilityAction fires on iOS + Android; the iOS-only three (accessibilityTap,
  // magicTap, accessibilityEscape) have no Android producer, so they are inert there.
  topAccessibilityAction: 'accessibilityAction',
  topAccessibilityTap: 'accessibilityTap',
  topMagicTap: 'magicTap',
  topAccessibilityEscape: 'accessibilityEscape',
}

const TOUCH_START = 'topTouchStart'
const TOUCH_MOVE = 'topTouchMove'
const TOUCH_END = 'topTouchEnd'
const TOUCH_CANCEL = 'topTouchCancel'
const PRESS = 'press'

// Responder protocol (PanResponder / Touchable). RN's two-phase negotiation:
// every should-set is asked CAPTURE (root -> target) then BUBBLE (target -> root),
// and the first node returning true wins — on a touch START *and* on every MOVE,
// so a node can claim the responder mid-gesture. If someone already holds it, the
// incumbent is asked onResponderTerminationRequest; a true answer (or no listener)
// hands it over (terminate + grant), a false answer rejects the taker. Lifecycle
// events are direct (grant/start/move/end/release/terminate/reject). Listener names
// are post-`on` (onResponderMove -> 'responderMove').
const START_SHOULD_SET = 'startShouldSetResponder'
const START_SHOULD_SET_CAPTURE = 'startShouldSetResponderCapture'
const MOVE_SHOULD_SET = 'moveShouldSetResponder'
const MOVE_SHOULD_SET_CAPTURE = 'moveShouldSetResponderCapture'
const RESPONDER_GRANT = 'responderGrant'
const RESPONDER_REJECT = 'responderReject'
const RESPONDER_START = 'responderStart'
const RESPONDER_MOVE = 'responderMove'
const RESPONDER_END = 'responderEnd'
const RESPONDER_RELEASE = 'responderRelease'
const RESPONDER_TERMINATE = 'responderTerminate'
const RESPONDER_TERMINATION_REQUEST = 'responderTerminationRequest'
// Synthesized alongside press so Pressable can show pressed-state feedback: both
// fire on the node the touch STARTED on (the responder), pressOut on end/cancel.
const PRESS_IN = 'pressIn'
const PRESS_OUT = 'pressOut'
// Synthesized from a sustained hold so bare Text/View onLongPress fires without a
// native event (Pressable runs the same timer in JS). Default delay matches RN's
// Touchable (500ms); a fired long press suppresses the tap on release.
const LONG_PRESS = 'longPress'
const DEFAULT_LONG_PRESS_MS = 500
// Pressability cancels the pending long press when the touch drifts past this many
// points from where it started (Pressability.DEFAULT_LONG_PRESS_DEACTIVATION_DISTANCE).
const LONG_PRESS_DEACTIVATION_DISTANCE = 10

// #region responder touch-history store
// Per-touch position/time tracking, ported from RN's
// react-native-renderer/.../legacy-events/ResponderTouchHistoryStore.js. PanResponder's
// multitouch dx/vx math needs each touch's own previous->current delta (RN counts only
// touches that moved since `_accountsForMovesUpTo`), which a grant-relative centroid of
// ALL live touches cannot reconstruct. We maintain the bank as touches flow and ATTACH
// `touchHistory` onto the nativeEvent reaching responder handlers — exactly how
// ResponderEventPlugin.js sets `*.touchHistory`.

// One slot per active touch identifier. Mirrors RN's TouchRecord field-for-field.
interface TouchRecord {
  touchActive: boolean
  startPageX: number
  startPageY: number
  startTimeStamp: number
  currentPageX: number
  currentPageY: number
  currentTimeStamp: number
  previousPageX: number
  previousPageY: number
  previousTimeStamp: number
}

interface TouchHistory {
  touchBank: TouchRecord[]
  numberActiveTouches: number
  // The single active touch's identifier, so TouchHistoryMath skips the bank scan in
  // the common one-finger case (-1 when not exactly one touch is down).
  indexOfSingleActiveTouch: number
  mostRecentTimeStamp: number
}

// RN's bank is indexed by touch identifier and warns above 20; we never warn (headless
// events may carry larger or absent ids), we just skip anything out of a sane range.
const MAX_TOUCH_BANK = 20

const touchBank: TouchRecord[] = []
const touchHistory: TouchHistory = {
  touchBank,
  numberActiveTouches: 0,
  indexOfSingleActiveTouch: -1,
  mostRecentTimeStamp: 0,
}

// A raw touch as it arrives inside the untyped nativeEvent. RN reads pageX/pageY/
// identifier/timestamp; we narrow each defensively so a malformed or coordinate-less
// touch (e.g. the negotiation smoke's `{ target }`-only touches) is skipped, never
// throwing — recording must not perturb the responder negotiation.
interface NormalizedTouch {
  identifier: number
  pageX: number
  pageY: number
  timestamp: number
}

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

// Pull a recordable touch out of an untyped entry, or undefined when it lacks a usable
// identifier or coordinates. RN's getTouchIdentifier throws on a null id; we skip
// instead, so events without touch geometry leave the bank untouched.
function normalizeTouch(raw: unknown): NormalizedTouch | undefined {
  if (!isRecord(raw)) return undefined
  const identifier = toFiniteNumber(raw.identifier)
  const pageX = toFiniteNumber(raw.pageX)
  const pageY = toFiniteNumber(raw.pageY)
  if (identifier === undefined || pageX === undefined || pageY === undefined) return undefined
  if (identifier < 0 || identifier > MAX_TOUCH_BANK) return undefined
  return { identifier, pageX, pageY, timestamp: toFiniteNumber(raw.timestamp) ?? 0 }
}

// The changed touches for this frame (start/move/end), defensively read.
function changedTouchesOf(nativeEvent: Record<string, unknown>): NormalizedTouch[] {
  const raw = nativeEvent.changedTouches
  if (!Array.isArray(raw)) return []
  const out: NormalizedTouch[] = []
  for (const entry of raw) {
    const touch = normalizeTouch(entry)
    if (touch !== undefined) out.push(touch)
  }
  return out
}

// Count of all touches still down (RN reads nativeEvent.touches.length directly).
function activeTouchCount(nativeEvent: Record<string, unknown>): number {
  const raw = nativeEvent.touches
  return Array.isArray(raw) ? raw.length : 0
}

function recordTouchStart(touch: NormalizedTouch): void {
  const record = touchBank[touch.identifier]
  if (record) {
    record.touchActive = true
    record.startPageX = touch.pageX
    record.startPageY = touch.pageY
    record.startTimeStamp = touch.timestamp
    record.currentPageX = touch.pageX
    record.currentPageY = touch.pageY
    record.currentTimeStamp = touch.timestamp
    record.previousPageX = touch.pageX
    record.previousPageY = touch.pageY
    record.previousTimeStamp = touch.timestamp
  } else {
    touchBank[touch.identifier] = {
      touchActive: true,
      startPageX: touch.pageX,
      startPageY: touch.pageY,
      startTimeStamp: touch.timestamp,
      currentPageX: touch.pageX,
      currentPageY: touch.pageY,
      currentTimeStamp: touch.timestamp,
      previousPageX: touch.pageX,
      previousPageY: touch.pageY,
      previousTimeStamp: touch.timestamp,
    }
  }
  touchHistory.mostRecentTimeStamp = touch.timestamp
}

// Move and end share the previous<-current shift; only `touchActive` differs.
function shiftTouchRecord(touch: NormalizedTouch, active: boolean): void {
  const record = touchBank[touch.identifier]
  if (!record) return
  record.touchActive = active
  record.previousPageX = record.currentPageX
  record.previousPageY = record.currentPageY
  record.previousTimeStamp = record.currentTimeStamp
  record.currentPageX = touch.pageX
  record.currentPageY = touch.pageY
  record.currentTimeStamp = touch.timestamp
  touchHistory.mostRecentTimeStamp = touch.timestamp
}

// Maintain the bank as a touch frame flows. Mirrors RN's recordTouchTrack: moveish
// shifts records, startish records + recomputes numberActiveTouches, endish marks the
// record inactive + rescans for the single remaining touch. `kind` is the touch phase.
function recordTouchTrack(
  kind: 'start' | 'move' | 'end',
  nativeEvent: Record<string, unknown>,
): void {
  if (kind === 'move') {
    for (const touch of changedTouchesOf(nativeEvent)) shiftTouchRecord(touch, true)
    return
  }
  if (kind === 'start') {
    for (const touch of changedTouchesOf(nativeEvent)) recordTouchStart(touch)
    touchHistory.numberActiveTouches = activeTouchCount(nativeEvent)
    if (touchHistory.numberActiveTouches === 1) {
      const first = normalizeTouch(arrayFirst(nativeEvent.touches))
      touchHistory.indexOfSingleActiveTouch = first?.identifier ?? -1
    }
    return
  }
  for (const touch of changedTouchesOf(nativeEvent)) shiftTouchRecord(touch, false)
  touchHistory.numberActiveTouches = activeTouchCount(nativeEvent)
  if (touchHistory.numberActiveTouches === 1) {
    for (let i = 0; i < touchBank.length; i++) {
      const record = touchBank[i]
      if (record !== undefined && record.touchActive) {
        touchHistory.indexOfSingleActiveTouch = i
        break
      }
    }
  }
}

function arrayFirst(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : undefined
}

// Drop all touch state. Called on a fully-released / cancelled gesture so a stale bank
// never leaks geometry into the next gesture's first frame.
function resetTouchHistory(): void {
  touchBank.length = 0
  touchHistory.numberActiveTouches = 0
  touchHistory.indexOfSingleActiveTouch = -1
  touchHistory.mostRecentTimeStamp = 0
}

// Attach the live touch history onto the event the responder handlers receive, matching
// ResponderEventPlugin.js (`grantEvent.touchHistory = ...`, etc.). PanResponder reads
// it for the per-touch dx/vx math; handlers that ignore it are unaffected.
function attachTouchHistory(nativeEvent: Record<string, unknown>): void {
  nativeEvent.touchHistory = touchHistory
}
// #endregion

let installed = false

// Target of the in-flight touch, remembered at topTouchStart and consumed (or
// cleared) at topTouchEnd / topTouchCancel.
let pressStart: SymbioteNode | undefined

// The node that claimed the responder for the in-flight touch (PanResponder), or
// undefined when nobody claimed it. Receives move and release/terminate.
let currentResponder: SymbioteNode | undefined

// Long-press synthesis: armed at touch start when some node in the press path listens
// for it, fired once after the hold delay, disarmed on end/cancel — the same arm/clear
// lifecycle Pressable runs in JS. Pressability ALSO cancels the timer when the touch
// drifts past LONG_PRESS_DEACTIVATION_DISTANCE, so we record the start point at touch
// start and clear the timer on a move that exceeds it.
let longPressTimer: ReturnType<typeof setTimeout> | undefined
let longPressFired = false
// Touch coordinate at touch start (pageX/pageY), or undefined when the native event
// carried no coords — then the move-distance cancel is simply skipped.
let longPressStart: { x: number; y: number } | undefined

function clearLongPress(): void {
  if (longPressTimer !== undefined) {
    clearTimeout(longPressTimer)
    longPressTimer = undefined
  }
}

// Read the gesture's page coordinate from a raw native touch event, defensively: RN
// puts pageX/pageY on the event for a single touch, or on the first entry of a
// `touches` array for multi-touch. Returns undefined when neither shape carries
// numbers, so callers skip any coordinate-dependent logic rather than guess.
function readTouchPoint(
  nativeEvent: Record<string, unknown>,
): { x: number; y: number } | undefined {
  const fromPair = (
    source: Record<string, unknown> | undefined,
  ): { x: number; y: number } | undefined => {
    if (!source) return undefined
    const { pageX, pageY } = source
    if (typeof pageX === 'number' && typeof pageY === 'number') return { x: pageX, y: pageY }
    return undefined
  }
  const direct = fromPair(nativeEvent)
  if (direct) return direct
  const touches = nativeEvent.touches
  if (Array.isArray(touches)) {
    const first = touches[0]
    if (isRecord(first)) return fromPair(first)
  }
  return undefined
}

// Narrow an unknown to a plain object so its properties can be read without a cast.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// Whether any touch still down started inside the responder (its target IS the
// responder or a descendant). RN's noResponderTouches walks nativeEvent.touches and
// returns false the moment one is found; a release fires only when none remain. The
// headless smokes fire with an empty `{}` event (no `touches`) → no remaining touch →
// release fires, preserving single-touch behavior. (ResponderEventPlugin.noResponder-
// Touches + isAncestor.)
function hasRemainingResponderTouch(
  responder: SymbioteNode,
  nativeEvent: Record<string, unknown>,
): boolean {
  const touches = nativeEvent.touches
  if (!Array.isArray(touches)) return false
  for (const touch of touches) {
    if (!isRecord(touch)) continue
    const target = touch.target
    if (isSymbioteNode(target) && endsWithin(target, responder)) return true
  }
  return false
}

// Whether any node from `target` up to the root listens for `listenerName` — used to
// arm the long-press timer only when a handler would actually receive it.
function hasListenerInPath(target: SymbioteNode, listenerName: string): boolean {
  for (let node: SymbioteNode | undefined = target; node; node = node.parent) {
    if (node.listeners?.has(listenerName) === true) return true
  }
  return false
}

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

// The node chain from `from` up to the root, deepest first. The single allocation
// the two-phase walk indexes both ways (capture reads it reversed).
function pathToRoot(from: SymbioteNode): SymbioteNode[] {
  const path: SymbioteNode[] = []
  for (let node: SymbioteNode | undefined = from; node; node = node.parent) path.push(node)
  return path
}

// Depth of a node below the root (root = 0). Aligns two nodes before the lockstep
// climb to their lowest common ancestor.
function depthOf(node: SymbioteNode): number {
  let depth = 0
  for (let n: SymbioteNode | undefined = node.parent; n; n = n.parent) depth++
  return depth
}

// RN's getLowestCommonAncestor over our parent pointers: lift the deeper node to the
// shallower one's depth, then climb both in lockstep until they meet (ResponderEvent-
// Plugin.getLowestCommonAncestor). Used to scope the move re-negotiation.
function lowestCommonAncestor(
  a: SymbioteNode,
  b: SymbioteNode,
): SymbioteNode | undefined {
  let da = depthOf(a)
  let db = depthOf(b)
  let na: SymbioteNode | undefined = a
  let nb: SymbioteNode | undefined = b
  while (na && da > db) {
    na = na.parent
    da--
  }
  while (nb && db > da) {
    nb = nb.parent
    db--
  }
  while (na && nb) {
    if (na === nb) return na
    na = na.parent
    nb = nb.parent
  }
  return undefined
}

// RN's two-phase should-set walk: CAPTURE root -> deepest, then BUBBLE deepest -> root;
// the first node returning true wins. `skip` is excluded from both passes — RN skips
// the deepest node when it IS the current responder (you don't ask the holder to
// re-claim), so its should-set callback never consumes the gesture frame out from under
// its own onResponderMove (PanResponder folds geometry in the should-set-capture
// handler, so asking the responder again would zero its move).
function findWantsResponder(
  path: SymbioteNode[],
  captureName: string,
  bubbleName: string,
  nativeEvent: Record<string, unknown>,
  skip: SymbioteNode | undefined,
): SymbioteNode | undefined {
  for (let i = path.length - 1; i >= 0; i--) {
    if (path[i] !== skip && callOwnListener(path[i], captureName, nativeEvent) === true) {
      return path[i]
    }
  }
  for (const node of path) {
    if (node !== skip && callOwnListener(node, bubbleName, nativeEvent) === true) return node
  }
  return undefined
}

// Negotiate (or re-negotiate) the responder for a touch start/move. If nobody holds
// it, the winner is granted. If someone does, the incumbent is asked to relinquish
// via onResponderTerminationRequest (absent listener = implicit yes); on yes it is
// terminated and the taker granted, on no the taker is rejected.
function negotiateResponder(
  target: SymbioteNode,
  phase: 'start' | 'move',
  nativeEvent: Record<string, unknown>,
): void {
  // With no responder, ask the full path from the touch target. With one, RN scopes
  // the walk to the lowest common ancestor of responder+target upward — never below
  // the responder — and skips the deepest node when it IS the responder (Responder-
  // EventPlugin.setResponderAndExtractTransfer). At touch start currentResponder is
  // cleared, so this collapses to the plain target->root start walk.
  const from =
    currentResponder === undefined ? target : lowestCommonAncestor(currentResponder, target)
  if (!from) return
  const path = pathToRoot(from)
  const skip = from === currentResponder ? from : undefined
  const wants =
    phase === 'start'
      ? findWantsResponder(path, START_SHOULD_SET_CAPTURE, START_SHOULD_SET, nativeEvent, skip)
      : findWantsResponder(path, MOVE_SHOULD_SET_CAPTURE, MOVE_SHOULD_SET, nativeEvent, skip)
  if (!wants || wants === currentResponder) return

  if (currentResponder === undefined) {
    currentResponder = wants
    dlog(`responder granted to ${wants.component}`)
    callOwnListener(wants, RESPONDER_GRANT, nativeEvent)
    return
  }

  const incumbent = currentResponder
  // A missing termination-request listener means implicit consent (RN default true);
  // only an explicit non-true answer keeps the incumbent and rejects the taker.
  const guarded = incumbent.listeners?.has(RESPONDER_TERMINATION_REQUEST) === true
  const allowed =
    !guarded || callOwnListener(incumbent, RESPONDER_TERMINATION_REQUEST, nativeEvent) === true
  if (allowed) {
    // RN's transfer order (setResponderAndExtractTransfer): grant the TAKER first, then
    // terminate the incumbent. RN dispatches grant ahead of the terminationRequest too,
    // purely to read the taker's block-native return; we have no native surface to
    // block, so on the REJECT path firing a grant the taker never keeps would be a
    // visible no-op event with no behavioral counterpart. We therefore fire grant
    // before terminate on the consent path (matching RN's grant<terminate ordering) and
    // omit it on reject — the consent OUTCOME is unchanged either way.
    dlog(`responder transferred ${incumbent.component} -> ${wants.component}`)
    callOwnListener(wants, RESPONDER_GRANT, nativeEvent)
    callOwnListener(incumbent, RESPONDER_TERMINATE, nativeEvent)
    currentResponder = wants
  } else {
    dlog(`responder takeover of ${incumbent.component} rejected`)
    callOwnListener(wants, RESPONDER_REJECT, nativeEvent)
  }
}

export function installEventHandler(): void {
  if (installed) return
  installed = true

  getSlot().registerEventHandler((instanceHandle, topLevelType, nativeEvent) => {
    if (!isSymbioteNode(instanceHandle)) return

    if (topLevelType === TOUCH_START) {
      dlog(`event ${TOUCH_START}`)
      // Update the touch bank, then attach it so responder handlers (PanResponder)
      // read each touch's own previous->current delta — RN records before dispatch.
      recordTouchTrack('start', nativeEvent)
      attachTouchHistory(nativeEvent)
      pressStart = instanceHandle
      // Arm long-press synthesis: only when a listener exists in the path, fired once
      // after the hold delay, then suppresses the tap (longPressFired) on release.
      longPressFired = false
      clearLongPress()
      longPressStart = readTouchPoint(nativeEvent)
      if (hasListenerInPath(instanceHandle, LONG_PRESS)) {
        const longPressTarget = instanceHandle
        longPressTimer = setTimeout(() => {
          longPressTimer = undefined
          longPressFired = true
          dlog('synthesized longPress -> dispatch')
          runWrapped(() => bubble(longPressTarget, LONG_PRESS, nativeEvent))
        }, DEFAULT_LONG_PRESS_MS)
      }
      runWrapped(() => {
        bubble(instanceHandle, PRESS_IN, nativeEvent)
        // Responder negotiation runs alongside press synthesis: a View can be both
        // a Pressable (press) and a PanResponder target (responder).
        negotiateResponder(instanceHandle, 'start', nativeEvent)
        // onResponderStart is a direct event to whoever now holds the responder.
        if (currentResponder) callOwnListener(currentResponder, RESPONDER_START, nativeEvent)
      })
      return
    }

    if (topLevelType === TOUCH_MOVE) {
      recordTouchTrack('move', nativeEvent)
      attachTouchHistory(nativeEvent)
      // Cancel the pending long press if the touch drifted too far (Pressability's
      // deactivation-distance check). Skipped when either coord is unknown.
      if (longPressTimer !== undefined && longPressStart) {
        const here = readTouchPoint(nativeEvent)
        if (here) {
          const dx = here.x - longPressStart.x
          const dy = here.y - longPressStart.y
          if (Math.hypot(dx, dy) > LONG_PRESS_DEACTIVATION_DISTANCE) {
            dlog('longPress cancelled (moved past deactivation distance)')
            clearLongPress()
          }
        }
      }
      runWrapped(() => {
        // Re-negotiate first: a node can claim the responder mid-gesture via
        // onMoveShouldSetResponder (the responder itself is skipped, see negotiate).
        negotiateResponder(instanceHandle, 'move', nativeEvent)
        // The only consumer of a move is the responder; without one, RN drops it too.
        if (currentResponder) callOwnListener(currentResponder, RESPONDER_MOVE, nativeEvent)
      })
      return
    }

    if (topLevelType === TOUCH_END) {
      recordTouchTrack('end', nativeEvent)
      attachTouchHistory(nativeEvent)
      const start = pressStart
      pressStart = undefined
      const responder = currentResponder
      // RN releases (and clears) the responder only when no remaining touch still down
      // started inside it; lifting ONE finger in a multi-touch gesture must NOT release.
      // onResponderEnd still fires on every finger-up. (ResponderEventPlugin: responderEnd
      // is unconditional, responderRelease is gated on noResponderTouches.)
      const releases = responder !== undefined && !hasRemainingResponderTouch(responder, nativeEvent)
      if (releases) currentResponder = undefined
      // A completed long press eats the tap (RN), but pressOut still fires below.
      const wasLongPress = longPressFired
      longPressFired = false
      longPressStart = undefined
      clearLongPress()
      runWrapped(() => {
        if (start) {
          // press fires only on an honest tap (ended within the responder); pressOut
          // always fires on the responder so its pressed-state can release.
          if (endsWithin(instanceHandle, start)) {
            if (wasLongPress) {
              dlog('press suppressed (longPress already fired)')
            } else {
              dlog('event press -> dispatch')
              bubble(start, PRESS, nativeEvent)
            }
          }
          bubble(start, PRESS_OUT, nativeEvent)
        } else {
          dlog(`event ${TOUCH_END} ignored (no matching start)`)
        }
        // onResponderEnd fires on every finger-up; onResponderRelease (the final
        // release) only when the last responder touch lifted.
        if (responder) {
          callOwnListener(responder, RESPONDER_END, nativeEvent)
          if (releases) callOwnListener(responder, RESPONDER_RELEASE, nativeEvent)
          else dlog('responderEnd without release (touches remain inside responder)')
        }
      })
      // Once no touch is down, clear the bank so the next gesture starts clean.
      if (touchHistory.numberActiveTouches === 0) resetTouchHistory()
      return
    }

    if (topLevelType === TOUCH_CANCEL) {
      recordTouchTrack('end', nativeEvent)
      attachTouchHistory(nativeEvent)
      const start = pressStart
      pressStart = undefined
      const responder = currentResponder
      currentResponder = undefined
      longPressFired = false
      longPressStart = undefined
      clearLongPress()
      runWrapped(() => {
        if (start) bubble(start, PRESS_OUT, nativeEvent)
        // A cancelled gesture ends then terminates (the responder was taken away).
        if (responder) {
          callOwnListener(responder, RESPONDER_END, nativeEvent)
          callOwnListener(responder, RESPONDER_TERMINATE, nativeEvent)
        }
      })
      if (touchHistory.numberActiveTouches === 0) resetTouchHistory()
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

// Two-phase delivery, mirroring RN's accumulateTwoPhaseDispatches (legacy-events/
// EventPropagators): CAPTURE root -> target first, invoking each node's
// `<EventName>Capture` listener, then BUBBLE target -> root invoking the plain
// listener. The same event object semantics apply to both passes; a stopPropagation
// in capture halts before bubble ever runs. `target` stays the original node;
// `currentTarget` tracks whose listener runs.
function bubble(
  target: SymbioteNode,
  listenerName: string,
  nativeEvent: Record<string, unknown>,
): void {
  let stopped = false
  const stopPropagation = (): void => {
    stopped = true
  }

  // Capture phase: root -> target. RN gathers captured listeners first (the
  // `<EventName>Capture` registration), so on*Capture handlers fire ahead of the
  // bubble pass. The path is built target -> root, then walked in reverse to get
  // root -> target without a second allocation.
  const captureName = `${listenerName}Capture`
  const path = pathToRoot(target)
  for (let i = path.length - 1; i >= 0; i--) {
    const node = path[i]
    const listener = node.listeners?.get(captureName)
    if (listener) {
      dlog(`event ${listenerName} capture on ${node.component}`)
      listener({
        type: listenerName,
        target,
        currentTarget: node,
        nativeEvent,
        stopPropagation,
      })
      if (stopped) return
    }
  }

  // Bubble phase: target -> root, invoking each ancestor's plain listener.
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
        stopPropagation,
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
