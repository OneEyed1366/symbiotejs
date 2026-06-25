// Headless proof of the event layer: a fake nativeFabricUIManager captures the
// single handler shared registers, then we drive it against a hand-built retained
// tree and assert press correlation, bubbling + stopPropagation, and direct layout
// delivery — no simulator, all in JS.

import { appendChild, createElement, routeProp, type SymbioteEvent } from '@symbiote/engine'
// installEventHandler is not on the public barrel (surface.ts calls it internally);
// reach it directly so the smoke can drive the handler without standing up a surface.
import { installEventHandler } from '../../core/engine/src/events'

// ---- fake Fabric slot (captures the event handler) ----------------------

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

// ---- retained tree: root > button(child) + sibling ----------------------

const root = createElement('RCTView')
const button = createElement('RCTView')
const child = createElement('RCTView')
const sibling = createElement('RCTView')
appendChild(root, button)
appendChild(button, child)
appendChild(root, sibling)

// ---- 1. press fires when touch starts and ends on the button ------------

let buttonPresses = 0
// Read through a function so control-flow analysis can't pin the counter to a
// literal after a `!==` check (it can't see the closure increment between checks).
const pressCount = (): number => buttonPresses
routeProp(button, 'onPress', () => {
  buttonPresses += 1
})

fire(button, 'topTouchStart')
fire(button, 'topTouchEnd')
if (pressCount() !== 1) throw new Error(`press on button: expected 1, got ${buttonPresses}`)

// ending on a descendant of the start target still presses
fire(button, 'topTouchStart')
fire(child, 'topTouchEnd')
if (pressCount() !== 2) throw new Error(`press ending on descendant: expected 2, got ${buttonPresses}`)

// ---- 2. press does NOT fire when touch ends on an unrelated sibling ------

fire(button, 'topTouchStart')
fire(sibling, 'topTouchEnd')
if (pressCount() !== 2) throw new Error(`press ending on sibling must not fire: got ${buttonPresses}`)

// topTouchCancel clears the pending start
fire(button, 'topTouchStart')
fire(button, 'topTouchCancel')
fire(button, 'topTouchEnd')
if (pressCount() !== 2) throw new Error(`cancel must drop the press: got ${buttonPresses}`)

// ---- 3. bubbling + stopPropagation --------------------------------------

const order: string[] = []
let stopAtChild = false

routeProp(button, 'onPress', () => {
  order.push('parent')
})
routeProp(child, 'onPress', (event: SymbioteEvent) => {
  order.push('child')
  if (stopAtChild) event.stopPropagation()
})

// without stopPropagation: child then parent
order.length = 0
stopAtChild = false
fire(child, 'topTouchStart')
fire(child, 'topTouchEnd')
if (order.join(',') !== 'child,parent') {
  throw new Error(`bubble order without stop: expected child,parent, got ${order.join(',')}`)
}

// with stopPropagation at child: parent NOT invoked
order.length = 0
stopAtChild = true
fire(child, 'topTouchStart')
fire(child, 'topTouchEnd')
if (order.join(',') !== 'child') {
  throw new Error(`stopPropagation must halt bubbling: expected child, got ${order.join(',')}`)
}

// currentTarget tracks the node whose listener runs; target stays the dispatch node
order.length = 0
stopAtChild = false
let seenCurrentTargets = 0
routeProp(child, 'onPress', (event: SymbioteEvent) => {
  if (event.target === child && event.currentTarget === child) seenCurrentTargets += 1
})
routeProp(button, 'onPress', (event: SymbioteEvent) => {
  if (event.target === child && event.currentTarget === button) seenCurrentTargets += 1
})
fire(child, 'topTouchStart')
fire(child, 'topTouchEnd')
if (seenCurrentTargets !== 2) {
  throw new Error(`currentTarget/target wrong during bubble: got ${seenCurrentTargets}`)
}

// ---- 4. layout is direct, delivered only to the target's own listener ----

let layoutPayload: unknown
routeProp(sibling, 'onLayout', (event: SymbioteEvent) => {
  layoutPayload = event.nativeEvent.layout
})
// Fabric only emits layout events when the node is flagged: a layout listener must
// also raise the onLayout prop (RN's validAttribute), else native never measures.
if (sibling.props.onLayout !== true) {
  throw new Error('a layout listener must raise the onLayout flag prop for Fabric')
}
const frame = { x: 0, y: 0, width: 100, height: 40 }
fire(sibling, 'topLayout', { layout: frame })
if (layoutPayload !== frame) throw new Error('layout listener did not receive the layout payload')

// layout must NOT bubble to an ancestor
let rootLayoutFired = false
routeProp(root, 'onLayout', () => {
  rootLayoutFired = true
})
fire(sibling, 'topLayout', { layout: frame })
if (rootLayoutFired) throw new Error('layout must not bubble to the ancestor')

// ---- 5. an onX prop the component does NOT declare stays a prop -----------
// The whole point of the ViewConfig split: a name that merely looks like an event
// (no view declares `tintColor` as one) routes to props, not the listener map.
routeProp(sibling, 'onTintColor', '#34c759')
if (sibling.props.onTintColor !== '#34c759') {
  throw new Error(`onTintColor must stay a prop, got ${JSON.stringify(sibling.props.onTintColor)}`)
}
if (sibling.listeners?.has('tintColor')) {
  throw new Error('onTintColor must NOT become a listener')
}

console.log('events.smoke OK')
