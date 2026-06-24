// Headless proof of the Keyboard module's secondary surface — no simulator. A fake
// __turboModuleProxy returns a KeyboardObserver (observe-counters only); a fake
// RN$registerCallableModule captures the device hub so the test can play "native"
// and emit keyboardDidShow / keyboardDidHide. We assert: a tracked addListener fires
// and the cache (isVisible/metrics) tracks show/hide; removeAllListeners tears down
// the caller subscriptions but the cache feed survives. A failure here is in JS.

import { Keyboard, type KeyboardEvent } from '../../packages/react/src/keyboard'

// ---- fake native-module + device-hub globals ----------------------------

let observerAdded = 0
let observerRemoved = 0
const fakeKeyboardObserver = {
  addListener: (): void => {
    observerAdded += 1
  },
  removeListeners: (count: number): void => {
    observerRemoved += count
  },
}
const registeredModules: Record<string, unknown> = { KeyboardObserver: fakeKeyboardObserver }

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

const showEvent: KeyboardEvent = {
  duration: 250,
  easing: 'keyboard',
  endCoordinates: { screenX: 0, screenY: 300, width: 390, height: 346 },
}

// ---- case 1: a tracked listener fires; the cache tracks show then hide -----

{
  let received: unknown
  const sub = Keyboard.addListener('keyboardDidShow', (payload) => {
    received = payload
  })
  if (deviceHub === undefined) throw new Error('Keyboard must install the device hub')
  if (observerAdded < 1) throw new Error('Keyboard must ping the observer addListener counter')

  if (Keyboard.isVisible()) throw new Error('isVisible() must be false before any show event')

  deviceHub.emit('keyboardDidShow', showEvent)
  if (received !== showEvent) {
    throw new Error('keyboardDidShow listener should receive the event payload')
  }
  if (!Keyboard.isVisible()) throw new Error('isVisible() must be true after keyboardDidShow')

  const metrics = Keyboard.metrics()
  if (metrics === undefined || metrics.height !== 346 || metrics.screenY !== 300) {
    throw new Error(`metrics() should return the show event coords, got ${JSON.stringify(metrics)}`)
  }

  deviceHub.emit('keyboardDidHide', showEvent)
  if (Keyboard.isVisible()) throw new Error('isVisible() must be false after keyboardDidHide')
  if (Keyboard.metrics() !== undefined) throw new Error('metrics() must be undefined when hidden')

  const removedBefore = observerRemoved
  sub.remove()
  if (observerRemoved !== removedBefore + 1) {
    throw new Error('remove() must ping the observer removeListeners(1)')
  }
}

// ---- case 2: removeAllListeners tears down callers, cache feed survives ----

{
  let firstCount = 0
  let secondCount = 0
  Keyboard.addListener('keyboardDidShow', () => {
    firstCount += 1
  })
  Keyboard.addListener('keyboardDidShow', () => {
    secondCount += 1
  })
  if (deviceHub === undefined) throw new Error('device hub must be installed')

  deviceHub.emit('keyboardDidShow', showEvent)
  if (firstCount !== 1 || secondCount !== 1) {
    throw new Error(`both listeners should fire once, got ${firstCount}/${secondCount}`)
  }

  Keyboard.removeAllListeners('keyboardDidShow')
  deviceHub.emit('keyboardDidShow', showEvent)
  if (firstCount !== 1 || secondCount !== 1) {
    throw new Error('removeAllListeners must stop the caller listeners')
  }

  // The internal cache feed is untracked, so it still updated on that last emit.
  if (!Keyboard.isVisible()) {
    throw new Error('removeAllListeners must NOT tear down the cache self-subscription')
  }
}

console.log('keyboard.smoke OK')
