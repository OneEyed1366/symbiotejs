// Headless proof of the Linking module — both directions of the bridge and both
// platform branches, no simulator. JS->native: a fake __turboModuleProxy returns a
// LinkingManager (iOS) and an IntentAndroid (Android) whose canOpenURL resolves true
// and whose openURL records the url. native->JS: a fake RN$registerCallableModule
// captures the device hub, and we play "native" by emitting the `url` deep-link
// event, asserting the addEventListener callback receives { url }. The Android branch
// also exercises sendIntent (forwards to IntentAndroid) and asserts sendIntent rejects
// off Android. A failure here is in JS, not native.

import { Platform } from '@symbiote/shared'
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

// Android routes to IntentAndroid instead, and adds sendIntent. Separate record state
// so the test can prove the Android branch hit IntentAndroid, not LinkingManager.
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
  // === iOS branch (default Platform.OS) — routes to LinkingManager ===

  // JS->native: canOpenURL resolves through the native module.
  const can = await Linking.canOpenURL('https://x')
  if (can !== true) throw new Error(`canOpenURL should resolve true, got ${String(can)}`)

  // JS->native: openURL reaches LinkingManager, which records the url.
  await Linking.openURL('https://x')
  if (openedUrl !== 'https://x') {
    throw new Error(`iOS openURL should pass the url to LinkingManager, got ${String(openedUrl)}`)
  }

  // getInitialURL routes to the iOS module too.
  await Linking.getInitialURL()

  // sendIntent has no iOS counterpart: it must reject, not reach native.
  let iosSendIntentRejected = false
  await Linking.sendIntent('android.intent.action.VIEW').catch(() => {
    iosSendIntentRejected = true
  })
  if (!iosSendIntentRejected) throw new Error('iOS sendIntent should reject (Unsupported)')
  if (sentIntent !== undefined) throw new Error('iOS sendIntent must not reach IntentAndroid')

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

  // === Android branch — flip Platform.OS, reset the cache, route to IntentAndroid ===
  // Platform.OS is a runtime const object; defineProperty rewrites it without a type
  // cast. Restore it after so the toggle doesn't leak into other smokes.
  const originalOS = Platform.OS
  Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true })
  try {
    // Linking caches the resolved module from the iOS run; re-import a fresh copy so
    // the lazy getModule re-resolves under the Android platform.
    const androidLinking = (await import('../../packages/react/src/linking?android')).Linking

    const canAndroid = await androidLinking.canOpenURL('https://a')
    if (canAndroid !== true) throw new Error(`Android canOpenURL should resolve true, got ${String(canAndroid)}`)

    await androidLinking.openURL('intent://a')
    if (androidOpenedUrl !== 'intent://a') {
      throw new Error(`Android openURL should route to IntentAndroid, got ${String(androidOpenedUrl)}`)
    }

    // sendIntent forwards action + extras to IntentAndroid on Android.
    const extras = [{ key: 'foo', value: 'bar' }]
    await androidLinking.sendIntent('android.intent.action.VIEW', extras)
    if (sentIntent === undefined || sentIntent.action !== 'android.intent.action.VIEW') {
      throw new Error(`Android sendIntent should forward action, got ${JSON.stringify(sentIntent)}`)
    }
    if (JSON.stringify(sentIntent.extras) !== JSON.stringify(extras)) {
      throw new Error(`Android sendIntent should forward extras, got ${JSON.stringify(sentIntent?.extras)}`)
    }
  } finally {
    Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true })
  }

  console.log('linking.smoke OK')
}

main().catch((error) => {
  throw error
})
