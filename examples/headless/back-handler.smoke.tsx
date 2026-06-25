// Headless proof of the BackHandler module — no simulator. A fake __turboModuleProxy
// returns a DeviceEventManager native module (invokeDefaultBackPressHandler, which we
// count); a fake RN$registerCallableModule captures the device hub so the test can play
// "native" and emit `hardwareBackPress`. We assert the four load-bearing behaviors of
// the reverse-order chain: (a) a handler returning true consumes the press and the
// lower handler is NOT called; (b) handlers run last-registered-first; (c) when nobody
// consumes, the native default fires once; (d) remove() unsubscribes. A failure here is
// in JS.

import { BackHandler } from '../../adapters/react/src/back-handler'

// ---- fake native-module + device-hub globals ----------------------------

let exitAppCount = 0
const fakeDeviceEventManager = {
  invokeDefaultBackPressHandler: (): void => {
    exitAppCount += 1
  },
  addListener: (): void => {},
  removeListeners: (): void => {},
}
const registeredModules: Record<string, unknown> = {
  DeviceEventManager: fakeDeviceEventManager,
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

function emitBack(): void {
  if (deviceHub === undefined) {
    throw new Error('BackHandler must install the device hub')
  }
  deviceHub.emit('hardwareBackPress')
}

// ---- case 1: reverse order + a true result consumes the press ------------
// Two handlers, both registered. The LAST-registered runs first and returns true,
// so the FIRST-registered must NOT be called and the native default must NOT fire.

{
  const calls: string[] = []
  const subFirst = BackHandler.addEventListener('hardwareBackPress', () => {
    calls.push('first')
    return false
  })
  const subSecond = BackHandler.addEventListener('hardwareBackPress', () => {
    calls.push('second')
    return true
  })

  const exitsBefore = exitAppCount
  emitBack()

  if (calls.length !== 1 || calls[0] !== 'second') {
    throw new Error(`expected only the last handler to run, got [${calls.join(',')}]`)
  }
  if (exitAppCount !== exitsBefore) {
    throw new Error('a consumed back press must NOT call the native default')
  }

  subFirst.remove()
  subSecond.remove()
}

// ---- case 2: no consumer -> native default fires once --------------------

{
  const calls: string[] = []
  const subA = BackHandler.addEventListener('hardwareBackPress', () => {
    calls.push('a')
    return false
  })
  const subB = BackHandler.addEventListener('hardwareBackPress', () => {
    calls.push('b')
    return false
  })

  const exitsBefore = exitAppCount
  emitBack()

  if (calls.length !== 2 || calls[0] !== 'b' || calls[1] !== 'a') {
    throw new Error(`expected reverse order [b,a], got [${calls.join(',')}]`)
  }
  if (exitAppCount !== exitsBefore + 1) {
    throw new Error('an unhandled back press must call the native default exactly once')
  }

  subA.remove()
  subB.remove()
}

// ---- case 3: remove() unsubscribes ---------------------------------------

{
  let received = false
  const sub = BackHandler.addEventListener('hardwareBackPress', () => {
    received = true
    return true
  })

  sub.remove()
  const exitsBefore = exitAppCount
  emitBack()

  if (received) throw new Error('a removed handler must not fire')
  if (exitAppCount !== exitsBefore + 1) {
    throw new Error('with the only handler removed, the native default must fire')
  }
}

console.log('back-handler.smoke OK')
