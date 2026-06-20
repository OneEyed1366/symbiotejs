// Headless proof of the Appearance module + useColorScheme hook — no simulator. A
// fake __turboModuleProxy returns an Appearance native module (getColorScheme ->
// 'light' plus observe-counters); a fake RN$registerCallableModule captures the
// device hub so the test can play "native" and emit `appearanceChanged`. We assert
// the initial read, then drive a system change through the hub and assert both the
// change listener and the cached read track it. A failure here is in JS, not native.

import { Appearance } from '../../packages/react/src/appearance'

// ---- fake native-module + device-hub globals ----------------------------

let appearanceAdded = 0
let appearanceRemoved = 0
let currentNativeScheme: 'light' | 'dark' = 'light'
const fakeAppearance = {
  getColorScheme: (): 'light' | 'dark' => currentNativeScheme,
  setColorScheme: (scheme: 'light' | 'dark' | 'unspecified'): void => {
    if (scheme !== 'unspecified') currentNativeScheme = scheme
  },
  addListener: (): void => {
    appearanceAdded += 1
  },
  removeListeners: (count: number): void => {
    appearanceRemoved += count
  },
}
const registeredModules: Record<string, unknown> = { Appearance: fakeAppearance }

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

// ---- case 1: initial read ------------------------------------------------

if (Appearance.getColorScheme() !== 'light') {
  throw new Error(`expected initial scheme 'light', got ${String(Appearance.getColorScheme())}`)
}

// ---- case 2: change listener + cached read track a native change ---------

{
  let received: unknown
  const sub = Appearance.addChangeListener((preferences) => {
    received = preferences.colorScheme
  })
  if (deviceHub === undefined) {
    throw new Error('Appearance must install the device hub')
  }
  if (appearanceAdded < 1) {
    throw new Error('Appearance must ping the module addListener counter')
  }

  deviceHub.emit('appearanceChanged', { colorScheme: 'dark' })
  if (received !== 'dark') {
    throw new Error(`change listener should receive 'dark', got ${String(received)}`)
  }
  // The cached read must also reflect the system change.
  if (Appearance.getColorScheme() !== 'dark') {
    throw new Error(`getColorScheme should be 'dark' after change, got ${String(Appearance.getColorScheme())}`)
  }

  const removedBefore = appearanceRemoved
  received = undefined
  sub.remove()
  if (appearanceRemoved !== removedBefore + 1) {
    throw new Error('remove() must ping the module removeListeners(1)')
  }
  deviceHub.emit('appearanceChanged', { colorScheme: 'light' })
  if (received !== undefined) throw new Error('a removed listener must not fire')
}

console.log('appearance.smoke OK')
