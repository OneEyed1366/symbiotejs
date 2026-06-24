// Headless proof of the AccessibilityInfo module — no simulator. A fake
// __turboModuleProxy returns an AccessibilityInfo native module (state getters that
// invoke their success callback with known values, plus observe-counters); a fake
// RN$registerCallableModule captures the device hub so the test can play "native"
// and emit `screenReaderChanged`. We assert the initial isScreenReaderEnabled(),
// then drive a native change through the hub and assert the listener tracks it, then
// that remove() stops it and pings the module's removeListeners counter. A failure
// here is in JS.

import { type ReactElement } from 'react'
import { mount, View } from '@symbiote/react'
import { AccessibilityInfo } from '../../packages/react/src/accessibility-info'

// ---- fake Fabric slot: records sendAccessibilityEvent(node, eventType) ----
// iOS now routes non-'click' accessibility events through the Fabric slot (RN's Fabric
// path), so case 6 needs a slot + a committed host ref, not just the native module.

interface FakeNode {
  tag: number
  viewName: string
  props: Record<string, unknown>
  children: FakeNode[]
}

interface AccessibilityCall {
  node: FakeNode
  eventType: string
}

const a11yEvents: AccessibilityCall[] = []
const slot = {
  createNode: (
    tag: number,
    viewName: string,
    _rootTag: number,
    props: Record<string, unknown>,
  ): FakeNode => ({ tag, viewName, props, children: [] }),
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
  appendChild: (parent: FakeNode, child: FakeNode): FakeNode => {
    parent.children.push(child)
    return parent
  },
  appendChildToSet: (_childSet: FakeNode[], _child: FakeNode): void => {},
  completeRoot: (): void => {},
  registerEventHandler: (): void => {},
  dispatchCommand: (): void => {},
  sendAccessibilityEvent: (node: FakeNode, eventType: string): void => {
    a11yEvents.push({ node, eventType })
  },
}
Object.assign(globalThis, { nativeFabricUIManager: slot })

// ---- fake native-module + device-hub globals ----------------------------

let a11yAdded = 0
let a11yRemoved = 0
const screenReaderState = true
const reduceMotionState = false
let announced: string | undefined
let focusedTag: number | undefined
const fakeAccessibilityInfo = {
  getCurrentVoiceOverState: (onSuccess: (enabled: boolean) => void): void => {
    onSuccess(screenReaderState)
  },
  getCurrentReduceMotionState: (onSuccess: (enabled: boolean) => void): void => {
    onSuccess(reduceMotionState)
  },
  getCurrentBoldTextState: (onSuccess: (enabled: boolean) => void): void => {
    onSuccess(false)
  },
  getCurrentGrayscaleState: (onSuccess: (enabled: boolean) => void): void => {
    onSuccess(true)
  },
  getCurrentInvertColorsState: (onSuccess: (enabled: boolean) => void): void => {
    onSuccess(false)
  },
  getCurrentReduceTransparencyState: (onSuccess: (enabled: boolean) => void): void => {
    onSuccess(true)
  },
  getCurrentDarkerSystemColorsState: (onSuccess: (enabled: boolean) => void): void => {
    onSuccess(true)
  },
  getCurrentPrefersCrossFadeTransitionsState: (onSuccess: (enabled: boolean) => void): void => {
    onSuccess(false)
  },
  announceForAccessibility: (announcement: string): void => {
    announced = announcement
  },
  setAccessibilityFocus: (reactTag: number): void => {
    focusedTag = reactTag
  },
  addListener: (): void => {
    a11yAdded += 1
  },
  removeListeners: (count: number): void => {
    a11yRemoved += count
  },
}
const registeredModules: Record<string, unknown> = {
  AccessibilityManager: fakeAccessibilityInfo,
}

// The device hub our code registers, captured so the test can act as "native".
let deviceHub: { emit: (eventType: string, ...args: unknown[]) => void } | undefined

Object.assign(globalThis, {
  // Trailing comma on the type param: in a .tsx file a bare <T> reads as JSX.
  __turboModuleProxy: <T,>(name: string): T | null => {
    const module = registeredModules[name]
    if (module === undefined || module === null) return null
    if (!isType<T>(module)) return null
    return module
  },
  RN$registerCallableModule: (
    name: string,
    factory: () => { emit: (eventType: string, ...args: unknown[]) => void },
  ): void => {
    if (name === 'RCTDeviceEventEmitter') deviceHub = factory()
  },
})

function isType<T>(value: unknown): value is T {
  return value !== null && value !== undefined
}

// ---- case 1: isScreenReaderEnabled resolves to the module's value --------

{
  const enabled = await AccessibilityInfo.isScreenReaderEnabled()
  if (enabled !== screenReaderState) {
    throw new Error(`expected isScreenReaderEnabled ${screenReaderState}, got ${String(enabled)}`)
  }
}

// ---- case 2: a 'screenReaderChanged' listener tracks a native change ------

{
  let received: unknown
  const sub = AccessibilityInfo.addEventListener('screenReaderChanged', (state) => {
    received = state
  })
  if (deviceHub === undefined) {
    throw new Error('AccessibilityInfo must install the device hub')
  }
  if (a11yAdded < 1) {
    throw new Error('AccessibilityInfo must ping the module addListener counter')
  }

  deviceHub.emit('screenReaderChanged', false)
  if (received !== false) {
    throw new Error(`screenReaderChanged listener should receive false, got ${String(received)}`)
  }

  const removedBefore = a11yRemoved
  received = undefined
  sub.remove()
  if (a11yRemoved !== removedBefore + 1) {
    throw new Error('remove() must ping the module removeListeners(1)')
  }
  deviceHub.emit('screenReaderChanged', true)
  if (received !== undefined) throw new Error('a removed listener must not fire')
}

// ---- case 3: the expanded iOS getters resolve to the module's values ------

{
  const grayscale = await AccessibilityInfo.isGrayscaleEnabled()
  if (grayscale !== true) throw new Error(`isGrayscaleEnabled should be true, got ${String(grayscale)}`)

  const invert = await AccessibilityInfo.isInvertColorsEnabled()
  if (invert !== false) throw new Error(`isInvertColorsEnabled should be false, got ${String(invert)}`)

  const transparency = await AccessibilityInfo.isReduceTransparencyEnabled()
  if (transparency !== true) {
    throw new Error(`isReduceTransparencyEnabled should be true, got ${String(transparency)}`)
  }

  // Android-only queries resolve false on the iOS build (no throw, RN parity).
  const highContrast = await AccessibilityInfo.isHighTextContrastEnabled()
  if (highContrast !== false) throw new Error('isHighTextContrastEnabled should be false on iOS')

  const service = await AccessibilityInfo.isAccessibilityServiceEnabled()
  if (service !== false) throw new Error('isAccessibilityServiceEnabled should be false on iOS')

  // The newer iOS getters resolve to their module's values (optional methods, present here).
  const darker = await AccessibilityInfo.isDarkerSystemColorsEnabled()
  if (darker !== true) throw new Error(`isDarkerSystemColorsEnabled should be true, got ${String(darker)}`)

  const crossFade = await AccessibilityInfo.prefersCrossFadeTransitions()
  if (crossFade !== false) throw new Error(`prefersCrossFadeTransitions should be false, got ${String(crossFade)}`)
}

// ---- case 4: announce + focus drive the native module --------------------

{
  AccessibilityInfo.announceForAccessibility('hello')
  // Capture into a fresh local: a `!== 'hello'` throw-guard would otherwise narrow
  // `announced` to the literal 'hello', making the later 'queued' check a no-overlap
  // type error (TS can't see the fake module mutate `announced` between the calls).
  const firstAnnounce: string | undefined = announced
  if (firstAnnounce !== 'hello') throw new Error(`announceForAccessibility should reach native, got ${String(firstAnnounce)}`)

  // No options-aware method on the fake -> falls back to the plain announce.
  AccessibilityInfo.announceForAccessibilityWithOptions('queued', { queue: true, priority: 'high' })
  const secondAnnounce: string | undefined = announced
  if (secondAnnounce !== 'queued') throw new Error('announceForAccessibilityWithOptions should fall back to announce')

  AccessibilityInfo.setAccessibilityFocus(42)
  if (focusedTag !== 42) throw new Error(`setAccessibilityFocus should reach native, got ${String(focusedTag)}`)
}

// ---- case 5: getRecommendedTimeoutMillis returns the original on iOS ------

{
  const timeout = await AccessibilityInfo.getRecommendedTimeoutMillis(3000)
  if (timeout !== 3000) throw new Error(`getRecommendedTimeoutMillis should resolve the original, got ${String(timeout)}`)
}

// ---- case 6: sendAccessibilityEvent routes a host ref through the Fabric slot ----

{
  // Mount a View and capture its host ref — the public-instance handle RN's Fabric
  // sendAccessibilityEvent expects. iOS routes every non-'click' event through the slot.
  let box: unknown
  function App(): ReactElement {
    return <View ref={(instance) => { box = instance }} style={{ width: 10, height: 10 }} />
  }
  mount(11, <App />)
  if (box == null) throw new Error('host ref handed back nothing')

  AccessibilityInfo.sendAccessibilityEvent(box, 'focus')
  const focus = a11yEvents[a11yEvents.length - 1]
  if (!focus || focus.eventType !== 'focus') {
    throw new Error(`sendAccessibilityEvent('focus') should route 'focus' through the slot, got ${JSON.stringify(focus)}`)
  }

  // RN early-returns 'click' on iOS (VoiceOver has no click producer) -> nothing reaches the slot.
  const before = a11yEvents.length
  AccessibilityInfo.sendAccessibilityEvent(box, 'click')
  if (a11yEvents.length !== before) {
    throw new Error("sendAccessibilityEvent('click') must be a no-op on iOS (RN parity)")
  }
}

console.log('accessibility-info.smoke OK')
