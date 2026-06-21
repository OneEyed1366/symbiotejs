// Headless proof of derive-by-default for a THIRD-PARTY native view, exercised
// through the RAW Fabric name with NO symbiote wrapper — the way the library's own
// component reaches us (its codegen resolves to the string 'RNCSlider'). The engine
// is told nothing about the slider; it DERIVES everything from a ViewConfig. Here we
// inject a fake source (on a real host this is RN's ReactNativeViewConfigRegistry.get,
// populated by the library's codegen) shaped exactly like codegen emits, and assert:
//   1. the Fabric view name 'RNCSlider' and plain props pass through,
//   2. tint props run through the processor DERIVED from validAttributes[*].process,
//   3. a bubbling event (onChange) derived from bubblingEventTypes dispatches,
//   4. a DIRECT event (slidingComplete) derived from directEventTypes dispatches.
// No simulator — a failure here is in JS, not native.

import { createElement } from 'react'
import { mount } from '@symbiote/react'
import { setNativeViewConfigSource, type SymbioteEvent } from '@symbiote/shared'

// ---- fake Fabric slot ---------------------------------------------------

interface FakeNode {
  tag: number
  viewName: string
  props: Record<string, unknown>
  children: FakeNode[]
  instanceHandle: unknown
}

type EventHandler = (
  instanceHandle: unknown,
  topLevelType: string,
  nativeEvent: Record<string, unknown>,
) => void

let eventHandler: EventHandler | undefined
const allCreated: FakeNode[] = []

const slot = {
  createNode(
    tag: number,
    viewName: string,
    _rootTag: number,
    props: Record<string, unknown>,
    instanceHandle: unknown,
  ): FakeNode {
    const node: FakeNode = { tag, viewName, props, children: [], instanceHandle }
    allCreated.push(node)
    return node
  },
  cloneNode(node: FakeNode): FakeNode {
    const clone: FakeNode = { ...node, props: { ...node.props }, children: [...node.children] }
    allCreated.push(clone)
    return clone
  },
  cloneNodeWithNewChildren(node: FakeNode): FakeNode {
    const clone: FakeNode = { ...node, props: { ...node.props }, children: [] }
    allCreated.push(clone)
    return clone
  },
  cloneNodeWithNewProps(node: FakeNode, props: Record<string, unknown>): FakeNode {
    const clone: FakeNode = { ...node, props: { ...node.props, ...props }, children: [...node.children] }
    allCreated.push(clone)
    return clone
  },
  cloneNodeWithNewChildrenAndProps(node: FakeNode, props: Record<string, unknown>): FakeNode {
    const clone: FakeNode = { ...node, props: { ...node.props, ...props }, children: [] }
    allCreated.push(clone)
    return clone
  },
  createChildSet(): FakeNode[] {
    return []
  },
  appendChild(parent: FakeNode, child: FakeNode): void {
    parent.children.push(child)
  },
  appendChildToSet(): void {},
  completeRoot(): void {},
  registerEventHandler(handler: EventHandler): void {
    eventHandler = handler
  },
  dispatchCommand(): void {},
}

Object.assign(globalThis, { nativeFabricUIManager: slot })

// ---- fake ViewConfig source (the codegen-shaped config we DERIVE from) ----------
const fakeColor = (value: unknown): string => `processed(${value})`

const RNC_SLIDER_VIEW_CONFIG = {
  bubblingEventTypes: {
    topChange: { phasedRegistrationNames: { bubbled: 'onChange', captured: 'onChangeCapture' } },
    topRNCSliderValueChange: {
      phasedRegistrationNames: { bubbled: 'onRNCSliderValueChange', captured: 'onRNCSliderValueChangeCapture' },
    },
  },
  directEventTypes: {
    topRNCSliderSlidingStart: { registrationName: 'onRNCSliderSlidingStart' },
    topRNCSliderSlidingComplete: { registrationName: 'onRNCSliderSlidingComplete' },
  },
  validAttributes: {
    value: true,
    minimumValue: true,
    maximumValue: true,
    step: true,
    minimumTrackTintColor: { process: fakeColor },
    maximumTrackTintColor: { process: fakeColor },
    thumbTintColor: { process: fakeColor },
  },
}

setNativeViewConfigSource((name) => (name === 'RNCSlider' ? RNC_SLIDER_VIEW_CONFIG : undefined))

// ---- helpers ------------------------------------------------------------

const SLIDER_VIEW = 'RNCSlider'

function sliderNode(): FakeNode {
  const node = allCreated.find((n) => n.viewName === SLIDER_VIEW)
  if (!node) throw new Error(`no ${SLIDER_VIEW} was created`)
  return node
}

function reset(): void {
  allCreated.length = 0
}

function fire(node: FakeNode, topLevelType: string, nativeEvent: Record<string, unknown>): void {
  if (!eventHandler) throw new Error('no event handler was registered')
  eventHandler(node.instanceHandle, topLevelType, nativeEvent)
}

function numberFromEvent(event: SymbioteEvent): number | undefined {
  const value = event.nativeEvent.value
  return typeof value === 'number' ? value : undefined
}

// ---- case 1: raw 'RNCSlider' renders and passes plain props through -------------

reset()
mount(30, createElement('RNCSlider', { value: 0.5, minimumValue: 0, maximumValue: 1, step: 0.1 }))

{
  const node = sliderNode()
  if (node.props.value !== 0.5) {
    throw new Error(`value did not pass through, got ${JSON.stringify(node.props.value)}`)
  }
  if (node.props.minimumValue !== 0 || node.props.maximumValue !== 1) {
    throw new Error(`min/max did not pass through, got ${JSON.stringify([node.props.minimumValue, node.props.maximumValue])}`)
  }
  if (node.props.step !== 0.1) {
    throw new Error(`step did not pass through, got ${JSON.stringify(node.props.step)}`)
  }
}

// ---- case 2: tint props run through the DERIVED processor -----------------------

reset()
mount(
  31,
  createElement('RNCSlider', {
    value: 0.2,
    minimumTrackTintColor: '#ff0000',
    maximumTrackTintColor: '#00ff00',
    thumbTintColor: '#0000ff',
  }),
)

{
  const node = sliderNode()
  if (node.props.minimumTrackTintColor !== 'processed(#ff0000)') {
    throw new Error(`minimumTrackTintColor was not processed, got ${JSON.stringify(node.props.minimumTrackTintColor)}`)
  }
  if (node.props.maximumTrackTintColor !== 'processed(#00ff00)') {
    throw new Error(`maximumTrackTintColor was not processed, got ${JSON.stringify(node.props.maximumTrackTintColor)}`)
  }
  if (node.props.thumbTintColor !== 'processed(#0000ff)') {
    throw new Error(`thumbTintColor was not processed, got ${JSON.stringify(node.props.thumbTintColor)}`)
  }
}

// ---- case 3: a DERIVED bubbling event (onChange) reaches its handler -------------

reset()
let changed: number | undefined
const onChange = (event: SymbioteEvent): void => {
  changed = numberFromEvent(event)
}
mount(32, createElement('RNCSlider', { value: 0.2, onChange, onRNCSliderValueChange: onChange }))

{
  const node = sliderNode()
  const lastChanged = (): number | undefined => changed
  fire(node, 'topChange', { value: 0.7 })
  if (lastChanged() !== 0.7) {
    throw new Error(`onChange (topChange) did not fire with 0.7, got ${JSON.stringify(lastChanged())}`)
  }
  // The other value rail, derived from bubblingEventTypes — must reach the same handler.
  fire(node, 'topRNCSliderValueChange', { value: 0.42 })
  if (lastChanged() !== 0.42) {
    throw new Error(`onRNCSliderValueChange did not fire with 0.42, got ${JSON.stringify(lastChanged())}`)
  }
}

// ---- case 4: a DERIVED DIRECT event (slidingComplete) reaches its handler --------

reset()
let completedAt: number | undefined
mount(
  33,
  createElement('RNCSlider', {
    value: 0.2,
    onRNCSliderSlidingComplete: (event: SymbioteEvent): void => {
      completedAt = numberFromEvent(event)
    },
  }),
)

{
  const node = sliderNode()
  const completed = (): number | undefined => completedAt
  fire(node, 'topRNCSliderSlidingComplete', { value: 0.9 })
  if (completed() !== 0.9) {
    throw new Error(`onSlidingComplete did not fire with 0.9, got ${JSON.stringify(completed())}`)
  }
}

console.log('slider.smoke OK')
