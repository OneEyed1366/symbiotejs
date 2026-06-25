// Headless proof of the native-module bridge primitives — both directions, no
// simulator. JS->native: a fake `__turboModuleProxy` returns fake modules and we
// assert getNativeModule / getEnforcingNativeModule. native->JS: a fake
// `RN$registerCallableModule` captures the hub our installDeviceEventHub registers;
// we then play "native" by calling hub.emit and assert NativeEventEmitter delivers
// the payload and drives the module's addListener/removeListeners counters.

import {
  getNativeModule,
  getEnforcingNativeModule,
  installDeviceEventHub,
  NativeEventEmitter,
} from '@symbiote/engine'

// ---- fake JSI globals ---------------------------------------------------

interface FakeStatusBar {
  setHidden(hidden: boolean): void
}

const fakeStatusBar: FakeStatusBar = { setHidden: () => {} }
const registeredModules: Record<string, unknown> = { StatusBarManager: fakeStatusBar }

// The device hub our code registers, captured so the test can act as "native".
let deviceHub: { emit: (eventType: string, ...args: unknown[]) => void } | undefined

Object.assign(globalThis, {
  __turboModuleProxy: <T>(name: string): T | null => {
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

// The fake proxy hands back a value the caller typed as T; this one guard is the
// fake's own trust boundary (the real native proxy returns a HostObject directly).
function isType<T>(value: unknown): value is T {
  return value !== null && value !== undefined
}

// ---- case 1: getNativeModule resolves a registered module ---------------

{
  const statusBar = getNativeModule<FakeStatusBar>('StatusBarManager')
  if (statusBar === null) throw new Error('StatusBarManager should resolve via __turboModuleProxy')
  if (typeof statusBar.setHidden !== 'function') {
    throw new Error('resolved module should carry its methods')
  }
}

// ---- case 2: a missing module is null / getEnforcing throws --------------

{
  if (getNativeModule('NopeManager') !== null) {
    throw new Error('an unregistered module must resolve to null')
  }
  let threw = false
  try {
    getEnforcingNativeModule('NopeManager')
  } catch {
    threw = true
  }
  if (!threw) throw new Error('getEnforcingNativeModule must throw on a missing module')
}

// ---- case 2b: bridgeless path — resolve via global.nativeModuleProxy ------
// Bridgeless hosts (RCTHost) install no __turboModuleProxy function; modules live
// on a HostObject keyed by name. getNativeModule must fall back to it, as RN does.

{
  const savedTurbo = globalThis.__turboModuleProxy
  Object.assign(globalThis, {
    __turboModuleProxy: undefined,
    nativeModuleProxy: { StatusBarManager: fakeStatusBar },
  })
  const statusBar = getNativeModule<FakeStatusBar>('StatusBarManager')
  if (statusBar === null) {
    throw new Error('bridgeless: StatusBarManager should resolve via global.nativeModuleProxy')
  }
  if (getNativeModule('NopeManager') !== null) {
    throw new Error('bridgeless: an absent module must still resolve to null')
  }
  Object.assign(globalThis, { __turboModuleProxy: savedTurbo, nativeModuleProxy: undefined })
}

// ---- case 3: device events flow native -> JS through the hub -------------

{
  installDeviceEventHub()
  if (deviceHub === undefined) {
    throw new Error('installDeviceEventHub must register a hub under RCTDeviceEventEmitter')
  }

  // A module that reports observe-counters to native, like RN's Keyboard observer.
  let added = 0
  let removed = 0
  const observer = {
    addListener: () => { added += 1 },
    removeListeners: (count: number) => { removed += count },
  }
  const emitter = new NativeEventEmitter(observer)

  let received: unknown
  const sub = emitter.addListener('keyboardDidShow', (payload) => { received = payload })
  if (added !== 1) throw new Error('addListener must ping the module observe-counter')

  // Play native: push an event into the hub.
  deviceHub.emit('keyboardDidShow', { endCoordinates: { height: 336 } })
  if (!isRecord(received) || !isRecord(received.endCoordinates) || received.endCoordinates.height !== 336) {
    throw new Error(`listener should receive the native payload, got ${JSON.stringify(received)}`)
  }

  // Unsubscribe: the module is told to stop, and further emits do not deliver.
  received = undefined
  sub.remove()
  if (removed !== 1) throw new Error('remove() must ping removeListeners(1)')
  deviceHub.emit('keyboardDidShow', { endCoordinates: { height: 0 } })
  if (received !== undefined) throw new Error('a removed listener must not fire')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

console.log('native-bridge.smoke OK')
