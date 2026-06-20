// Headless proof of the Linking module — both directions of the bridge, no
// simulator. JS->native: a fake __turboModuleProxy returns a LinkingManager whose
// canOpenURL resolves true and whose openURL records the url. native->JS: a fake
// RN$registerCallableModule captures the device hub, and we play "native" by
// emitting the `url` deep-link event, asserting the addEventListener callback
// receives { url }. A failure here is in JS, not native.

import { Linking } from '../../packages/react/src/linking'

// ---- fake native-module + device-hub globals ----------------------------

let openedUrl: string | undefined
const fakeLinkingManager = {
  getInitialURL: (): Promise<string | null> => Promise.resolve(null),
  canOpenURL: (_url: string): Promise<boolean> => Promise.resolve(true),
  openURL: (url: string): Promise<void> => {
    openedUrl = url
    return Promise.resolve()
  },
  openSettings: (): Promise<void> => Promise.resolve(),
  addListener: (): void => {},
  removeListeners: (_count: number): void => {},
}

const registeredModules: Record<string, unknown> = { LinkingManager: fakeLinkingManager }

// The device hub our code registers, captured so the test can act as "native".
let deviceHub: { emit: (eventType: string, ...args: unknown[]) => void } | undefined

Object.assign(globalThis, {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// ---- the smoke ----------------------------------------------------------

async function main(): Promise<void> {
  // JS->native: canOpenURL resolves through the native module.
  const can = await Linking.canOpenURL('https://x')
  if (can !== true) throw new Error(`canOpenURL should resolve true, got ${String(can)}`)

  // JS->native: openURL reaches the native module, which records the url.
  await Linking.openURL('https://x')
  if (openedUrl !== 'https://x') {
    throw new Error(`openURL should pass the url to native, got ${String(openedUrl)}`)
  }

  // native->JS: subscribe, then play native by emitting the `url` deep-link event.
  let received: unknown
  const sub = Linking.addEventListener('url', (event) => {
    received = event
  })
  if (deviceHub === undefined) {
    throw new Error('addEventListener must install the device hub')
  }
  deviceHub.emit('url', { url: 'app://deep' })
  if (!isRecord(received) || received.url !== 'app://deep') {
    throw new Error(`url listener should receive { url }, got ${JSON.stringify(received)}`)
  }
  sub.remove()

  console.log('linking.smoke OK')
}

main().catch((error) => {
  throw error
})
