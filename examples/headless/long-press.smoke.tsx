/** @jsxRuntime automatic */
// Headless proof of the long-press SYNTHESIS in shared/events.ts. There is no native
// longPress event — shared arms a hold timer on topTouchStart when a node in the press
// path listens for it, fires a bubbling `longPress` after the delay, and suppresses the
// tap on release. We drive raw touch primitives over the fake Fabric slot and assert:
// a sustained hold fires longPress once and eats the press, while a quick tap fires
// press and never longPress. The 500ms delay is RN's Touchable default, so the hold
// case waits real wall-clock — a failure here is in the synthesis, not native.

import { mount } from '@symbiote/react'
import { Text } from '../../adapters/react/src/components'

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
  cloneNodeWithNewProps: (node: FakeNode, newProps: Record<string, unknown>): FakeNode => ({
    ...node,
    props: { ...node.props, ...newProps },
  }),
  cloneNodeWithNewChildren: (node: FakeNode): FakeNode => ({ ...node, children: [] }),
  cloneNodeWithNewChildrenAndProps: (
    node: FakeNode,
    newProps: Record<string, unknown>,
  ): FakeNode => ({ ...node, props: { ...node.props, ...newProps }, children: [] }),
  createChildSet: (): FakeNode[] => [],
  appendChild(parent: FakeNode, child: FakeNode): FakeNode {
    parent.children.push(child)
    return parent
  },
  appendChildToSet(childSet: FakeNode[], child: FakeNode): void {
    childSet.push(child)
  },
  completeRoot(): void {},
  registerEventHandler(handler: EventHandler): void {
    eventHandler = handler
  },
}

Object.assign(globalThis, { nativeFabricUIManager: slot })

const TOUCH_START = 'topTouchStart'
const TOUCH_MOVE = 'topTouchMove'
const TOUCH_END = 'topTouchEnd'
// Longer than the 500ms synthesis delay so the hold timer has surely fired.
const HOLD_WAIT_MS = 600

function handleFor(testID: string): unknown {
  const node = allCreated.find((n) => n.props.testID === testID)
  if (!node) throw new Error(`no node created with testID=${testID}`)
  return node.instanceHandle
}

function fire(handle: unknown, type: string, nativeEvent: Record<string, unknown> = {}): void {
  if (!eventHandler) throw new Error('no event handler was registered')
  eventHandler(handle, type, nativeEvent)
}

function reset(): void {
  allCreated.length = 0
}

function expect(actual: number, want: number, label: string): void {
  if (actual !== want) throw new Error(`${label}: got ${actual}, want ${want}`)
}

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

async function main(): Promise<void> {
  // ---- case 1: sustained hold fires longPress once and suppresses the tap --------
  {
    reset()
    let longPress = 0
    let press = 0
    mount(
      31,
      <Text
        testID="hold"
        onLongPress={() => {
          longPress++
        }}
        onPress={() => {
          press++
        }}
      >
        hold me
      </Text>,
    )
    const h = handleFor('hold')
    fire(h, TOUCH_START)
    await wait(HOLD_WAIT_MS)
    expect(longPress, 1, 'longPress should fire once after the hold delay')
    expect(press, 0, 'press must not fire while still held')
    fire(h, TOUCH_END)
    expect(longPress, 1, 'longPress must not re-fire on release')
    expect(press, 0, 'a fired longPress suppresses the tap on release')
  }

  // ---- case 2: a quick tap fires press and never longPress ----------------------
  {
    reset()
    let longPress = 0
    let press = 0
    mount(
      32,
      <Text
        testID="tap"
        onLongPress={() => {
          longPress++
        }}
        onPress={() => {
          press++
        }}
      >
        tap me
      </Text>,
    )
    const h = handleFor('tap')
    fire(h, TOUCH_START)
    fire(h, TOUCH_END)
    expect(press, 1, 'a quick tap fires press')
    expect(longPress, 0, 'a quick tap must not fire longPress')
    // The timer was armed at start; let any stray fire surface before asserting.
    await wait(HOLD_WAIT_MS)
    expect(longPress, 0, 'the long-press timer must be disarmed on release')
  }

  // ---- case 3: a move past the deactivation distance cancels the pending longPress --
  // Touch starts at (0,0); a move to (20,0) is >10px away, so Pressability cancels the
  // hold timer and no longPress fires even after the full delay.
  {
    reset()
    let longPress = 0
    mount(
      33,
      <Text
        testID="drift"
        onLongPress={() => {
          longPress++
        }}
      >
        drift me
      </Text>,
    )
    const h = handleFor('drift')
    fire(h, TOUCH_START, { pageX: 0, pageY: 0 })
    fire(h, TOUCH_MOVE, { pageX: 20, pageY: 0 })
    await wait(HOLD_WAIT_MS)
    expect(longPress, 0, 'a move past 10px cancels the pending longPress')
    fire(h, TOUCH_END)
  }

  // ---- case 4: a small move within the deactivation distance does NOT cancel --------
  // A move to (5,5) is hypot≈7.07px < 10px, so the timer survives and longPress fires.
  {
    reset()
    let longPress = 0
    mount(
      34,
      <Text
        testID="nudge"
        onLongPress={() => {
          longPress++
        }}
      >
        nudge me
      </Text>,
    )
    const h = handleFor('nudge')
    fire(h, TOUCH_START, { pageX: 0, pageY: 0 })
    fire(h, TOUCH_MOVE, { pageX: 5, pageY: 5 })
    await wait(HOLD_WAIT_MS)
    expect(longPress, 1, 'a small move keeps the longPress timer armed')
    fire(h, TOUCH_END)
  }

  console.log('long-press.smoke OK')
}

void main()
