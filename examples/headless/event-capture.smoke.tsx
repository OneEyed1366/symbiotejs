// Headless proof of two-phase event delivery: the capture pass (root -> target)
// must fire each node's `<Event>Capture` listener BEFORE the bubble pass
// (target -> root), mirroring RN's accumulateTwoPhaseDispatches. A fake Fabric slot
// captures the single event handler shared registers; we drive it against a
// hand-built tree and assert capture-before-bubble ordering and stopPropagation in
// the capture phase.

import { appendChild, createElement, type SymbioteEvent } from '@symbiote/engine'
import { installEventHandler } from '../../core/engine/src/events'
// `change` (and thus `changeCapture`) is not a ViewConfig event for a bare RCTView, so
// routeProp would route onChange/onChangeCapture to props, not listeners. The dispatch
// layer reads the raw listener keys (`change`, `changeCapture`); register them through
// the low-level setter directly so the test drives dispatch ordering, not routeProp's
// ViewConfig gate.
import { setEventListener } from '../../core/engine/src/node'

type EventHandler = (
  instanceHandle: unknown,
  topLevelType: string,
  nativeEvent: Record<string, unknown>,
) => void

let eventHandler: EventHandler | undefined

const slot = {
  createNode: (
    _tag: number,
    _viewName: string,
    _rootTag: number,
    _props: Record<string, unknown>,
    instanceHandle: unknown,
  ): unknown => instanceHandle,
  cloneNodeWithNewProps: (node: unknown): unknown => node,
  cloneNodeWithNewChildren: (node: unknown): unknown => node,
  createChildSet: (): unknown[] => [],
  appendChild: (parent: unknown): unknown => parent,
  appendChildToSet: (): void => {},
  completeRoot: (): void => {},
  registerEventHandler(handler: EventHandler): void {
    eventHandler = handler
  },
}

Object.assign(globalThis, { nativeFabricUIManager: slot })

installEventHandler()

function fire(target: unknown, topLevelType: string, nativeEvent: Record<string, unknown> = {}): void {
  if (!eventHandler) throw new Error('no event handler was registered')
  eventHandler(target, topLevelType, nativeEvent)
}

// ---- retained tree: root > parent > child -------------------------------

const root = createElement('RCTView')
const parent = createElement('RCTView')
const child = createElement('RCTView')
appendChild(root, parent)
appendChild(parent, child)

// `topChange` -> `change` is a generic bubbling event (BUBBLING_EVENTS).

// ---- 1. capture (root -> target) precedes bubble (target -> root) --------

const order: string[] = []
setEventListener(root, 'changeCapture', () => order.push('root capture'))
setEventListener(parent, 'changeCapture', () => order.push('parent capture'))
setEventListener(child, 'change', () => order.push('child bubble'))
setEventListener(parent, 'change', () => order.push('parent bubble'))
setEventListener(root, 'change', () => order.push('root bubble'))

fire(child, 'topChange')
const expected = 'root capture,parent capture,child bubble,parent bubble,root bubble'
if (order.join(',') !== expected) {
  throw new Error(`two-phase order wrong:\n  expected ${expected}\n  got      ${order.join(',')}`)
}

// The target's own capture listener also fires (still part of root -> target).
order.length = 0
setEventListener(child, 'changeCapture', () => order.push('child capture'))
fire(child, 'topChange')
if (order[2] !== 'child capture') {
  throw new Error(`target's own capture listener must fire last in capture: got ${order.join(',')}`)
}

// ---- 2. stopPropagation in capture halts before bubble ever runs ---------

const seen: string[] = []
const child2 = createElement('RCTView')
appendChild(parent, child2)
setEventListener(parent, 'changeCapture', (event: SymbioteEvent) => {
  seen.push('parent capture')
  event.stopPropagation()
})
setEventListener(child2, 'change', () => seen.push('child bubble'))
fire(child2, 'topChange')
if (seen.join(',') !== 'parent capture') {
  throw new Error(`capture stopPropagation must halt before bubble: got ${seen.join(',')}`)
}

// ---- 3. currentTarget tracks the capturing node; target stays the dispatch node ----

const targets: string[] = []
const child3 = createElement('RCTView')
appendChild(parent, child3)
// reset parent's capture listener (cleared its stopPropagation closure)
setEventListener(parent, 'changeCapture', (event: SymbioteEvent) => {
  if (event.target === child3 && event.currentTarget === parent) targets.push('ok')
})
fire(child3, 'topChange')
if (targets.join(',') !== 'ok') {
  throw new Error(`capture currentTarget/target wrong: got ${targets.join(',')}`)
}

console.log('event-capture.smoke OK')
