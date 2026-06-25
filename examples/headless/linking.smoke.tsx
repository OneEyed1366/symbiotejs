// Headless proof of the Linking module — both directions of the bridge and both
// platform builds, no simulator. Per ADR 0019 the platform builds are separate files
// (linking.ios.ts / linking.android.ts), so this imports each DIRECTLY — no Metro, no
// runtime Platform.OS toggle. JS->native: a fake __turboModuleProxy returns a
// LinkingManager (iOS) and an IntentAndroid (Android) whose canOpenURL resolves true
// and whose openURL records the url. native->JS: a fake RN$registerCallableModule
// captures the device hub, and we play "native" by emitting the `url` deep-link event.
// The Android build also exercises sendIntent (forwards to IntentAndroid); the iOS build
// asserts sendIntent rejects (Unsupported). A failure here is in JS, not native.

import { Linking as IosLinking } from '../../adapters/react/src/linking.ios'
import { Linking as AndroidLinking } from '../../adapters/react/src/linking.android'

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

// Android routes to IntentAndroid instead, and adds sendIntent. Separate record state
// so the test can prove the Android build hit IntentAndroid, not LinkingManager.
let androidOpenedUrl: string | undefined
let sentIntent: { action: string; extras?: unknown } | undefined
const fakeIntentAndroid = {
  getInitialURL: (): Promise<string | null> => Promise.resolve(null),
  canOpenURL: (_url: string): Promise<boolean> => Promise.resolve(true),
  openURL: (url: string): Promise<void> => {
    androidOpenedUrl = url
    return Promise.resolve()
  },
  openSettings: (): Promise<void> => Promise.resolve(),
  sendIntent: (action: string, extras?: unknown): Promise<void> => {
    sentIntent = { action, extras }
    return Promise.resolve()
  },
  addListener: (): void => {},
  removeListeners: (_count: number): void => {},
}

const registeredModules: Record<string, unknown> = {
  LinkingManager: fakeLinkingManager,
  IntentAndroid: fakeIntentAndroid,
}

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
  // === iOS build — routes to LinkingManager ===

  const can = await IosLinking.canOpenURL('https://x')
  if (can !== true) throw new Error(`canOpenURL should resolve true, got ${String(can)}`)

  await IosLinking.openURL('https://x')
  if (openedUrl !== 'https://x') {
    throw new Error(`iOS openURL should pass the url to LinkingManager, got ${String(openedUrl)}`)
  }

  await IosLinking.getInitialURL()

  // sendIntent has no iOS counterpart: it must reject, not reach native.
  let iosSendIntentRejected = false
  await IosLinking.sendIntent('android.intent.action.VIEW').catch(() => {
    iosSendIntentRejected = true
  })
  if (!iosSendIntentRejected) throw new Error('iOS sendIntent should reject (Unsupported)')
  if (sentIntent !== undefined) throw new Error('iOS sendIntent must not reach IntentAndroid')

  // native->JS: subscribe, then play native by emitting the `url` deep-link event.
  let received: unknown
  const sub = IosLinking.addEventListener('url', (event) => {
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

  // === Android build — routes to IntentAndroid, adds sendIntent ===

  const canAndroid = await AndroidLinking.canOpenURL('https://a')
  if (canAndroid !== true) {
    throw new Error(`Android canOpenURL should resolve true, got ${String(canAndroid)}`)
  }

  await AndroidLinking.openURL('intent://a')
  if (androidOpenedUrl !== 'intent://a') {
    throw new Error(`Android openURL should route to IntentAndroid, got ${String(androidOpenedUrl)}`)
  }

  const extras = [{ key: 'foo', value: 'bar' }]
  await AndroidLinking.sendIntent('android.intent.action.VIEW', extras)
  if (sentIntent === undefined || sentIntent.action !== 'android.intent.action.VIEW') {
    throw new Error(`Android sendIntent should forward action, got ${JSON.stringify(sentIntent)}`)
  }
  if (JSON.stringify(sentIntent.extras) !== JSON.stringify(extras)) {
    throw new Error(`Android sendIntent should forward extras, got ${JSON.stringify(sentIntent.extras)}`)
  }

  console.log('linking.smoke OK')
}

main().catch((error) => {
  throw error
})
