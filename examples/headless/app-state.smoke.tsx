// Headless proof of the AppState module — no simulator. A fake __turboModuleProxy
// returns an AppState native module (getConstants -> { initialAppState: 'active' }
// plus observe-counters); a fake RN$registerCallableModule captures the device hub
// so the test can play "native" and emit `appStateDidChange`. We assert the initial
// currentState, then drive a native state change through the hub and assert both the
// 'change' listener and AppState.currentState track it. A failure here is in JS.

import { AppState } from '../../packages/react/src/app-state'

// ---- fake native-module + device-hub globals ----------------------------

let appStateAdded = 0
let appStateRemoved = 0
const fakeAppState = {
  getConstants: (): { initialAppState: string } => ({ initialAppState: 'active' }),
  addListener: (): void => {
    appStateAdded += 1
  },
  removeListeners: (count: number): void => {
    appStateRemoved += count
  },
}
const registeredModules: Record<string, unknown> = { AppState: fakeAppState }

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

// ---- case 0: isAvailable reflects the resolved native module --------------

if (AppState.isAvailable !== true) {
  throw new Error('isAvailable must be true when the AppState native module resolves')
}

// ---- case 1: initial currentState from getConstants ----------------------

if (AppState.currentState !== 'active') {
  throw new Error(`expected initial currentState 'active', got ${String(AppState.currentState)}`)
}

// ---- case 2: 'change' listener + currentState track a native change ------

{
  let received: unknown
  const sub = AppState.addEventListener('change', (state) => {
    received = state
  })
  if (deviceHub === undefined) {
    throw new Error('AppState must install the device hub')
  }
  if (appStateAdded < 1) {
    throw new Error('AppState must ping the module addListener counter')
  }

  deviceHub.emit('appStateDidChange', { app_state: 'background' })
  if (received !== 'background') {
    throw new Error(`change listener should receive 'background', got ${String(received)}`)
  }
  if (AppState.currentState !== 'background') {
    throw new Error(`currentState should be 'background' after change, got ${String(AppState.currentState)}`)
  }

  const removedBefore = appStateRemoved
  received = undefined
  sub.remove()
  if (appStateRemoved !== removedBefore + 1) {
    throw new Error('remove() must ping the module removeListeners(1)')
  }
  deviceHub.emit('appStateDidChange', { app_state: 'active' })
  if (received !== undefined) throw new Error('a removed listener must not fire')
}

console.log('app-state.smoke OK')
