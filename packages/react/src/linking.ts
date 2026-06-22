// Linking module — both directions of the bridge at once. JS->native: open a URL,
// probe canOpenURL, read the launch URL, open Settings, via the platform's linking
// native module. native->JS: incoming deep links arrive as the device `url` event
// (payload `{ url }`), subscribed through a NativeEventEmitter bound to that same
// module. Mirrors RN's Libraries/Linking/Linking.js.
//
// Per-platform native module — like RN we branch on Platform.OS in this one file
// (NOT a .ios/.android split — the tsx smoke harness has no Metro platform
// resolution): iOS routes to `LinkingManager`, Android to `IntentAndroid`. The four
// URL methods overlap; Android adds `sendIntent` (no iOS counterpart).
//
// The iOS contract is confirmed from RN's TurboModule spec at
// specs_DEPRECATED/modules/NativeLinkingManager.js (`TurboModuleRegistry.get('LinkingManager')`):
//   getInitialURL(): Promise<?string>
//   canOpenURL(url): Promise<boolean>
//   openURL(url): Promise<void>
//   openSettings(): Promise<void>
//   addListener(eventName) / removeListeners(count)   — observe-counters
// The Android contract is specs_DEPRECATED/modules/NativeIntentAndroid.js
// (`TurboModuleRegistry.get('IntentAndroid')`): the same four URL methods plus
//   sendIntent(action, extras?): Promise<void>
// device-verify-pending: the Android `IntentAndroid` name and routing are confirmed
// from RN source but not yet exercised on a real Android host.

import {
  installDeviceEventHub,
  NativeEventEmitter,
  getNativeModule,
  Platform,
  type EventEmitterModule,
  type EventSubscription,
  type PlatformOSType,
  dlog,
} from '@symbiote/shared'

// RN registers the linking native module under a different name per platform.
const LINKING_MODULE_BY_OS: Partial<Record<PlatformOSType, string>> = {
  ios: 'LinkingManager',
  android: 'IntentAndroid',
}
const DEFAULT_LINKING_MODULE = 'LinkingManager'

function linkingModuleName(): string {
  return LINKING_MODULE_BY_OS[Platform.OS] ?? DEFAULT_LINKING_MODULE
}

// The one event symbiote observes — an incoming deep link. RN's LinkingEventDefinitions.
const URL_EVENT = 'url'

// The payload native delivers with the `url` event.
export interface UrlEvent {
  url: string
}

// One Android intent extra, mirroring RN's sendIntent extras entry.
export interface IntentExtra {
  key: string
  value: string | number | boolean
}

// The linking native module typed as the interface we vouch for — the four
// imperative URL methods plus the observe-counters (EventEmitterModule), and the
// Android-only `sendIntent` (absent on iOS's LinkingManager, hence optional). The
// single point that accepts the native shape (no per-call `as`).
interface NativeLinkingModule extends EventEmitterModule {
  getInitialURL(): Promise<string | null>
  canOpenURL(url: string): Promise<boolean>
  openURL(url: string): Promise<void>
  openSettings(): Promise<void>
  sendIntent?(action: string, extras?: IntentExtra[]): Promise<void>
  addListener(eventName: string): void
  removeListeners(count: number): void
}

// Lazily resolved so importing this module has no native side effect: a headless
// run without a fake __turboModuleProxy still loads it; resolution happens on first
// use. Null when the module isn't linked.
let linkingModule: NativeLinkingModule | null | undefined
let emitter: NativeEventEmitter | undefined

function getModule(): NativeLinkingModule | null {
  if (linkingModule === undefined) {
    const name = linkingModuleName()
    linkingModule = getNativeModule<NativeLinkingModule>(name)
    dlog(`Linking: ${name} module ${linkingModule ? 'resolved' : 'NOT resolved (null)'}`)
  }
  return linkingModule
}

function getEmitter(): NativeEventEmitter {
  if (emitter === undefined) {
    // Lazy install on first subscribe — the hub exists before native emits without
    // a hard bootstrap-order dependency. Idempotent.
    installDeviceEventHub()
    emitter = new NativeEventEmitter(getModule() ?? undefined)
  }
  return emitter
}

// RN's _validateURL — a typo / empty URL must fail loudly at the call, not reach native.
function validateUrl(url: string): void {
  if (typeof url !== 'string' || url.length === 0) {
    throw new Error(`Invalid URL: ${url}`)
  }
}

export const Linking = {
  // Subscribe to incoming deep links. The listener receives `{ url }`; the returned
  // subscription's `remove()` unsubscribes and decrements the native observe-counter.
  addEventListener(eventType: typeof URL_EVENT, listener: (event: UrlEvent) => void): EventSubscription {
    dlog(`Linking.addEventListener -> ${eventType}`)
    return getEmitter().addListener(eventType, (payload) => {
      listener(toUrlEvent(payload))
    })
  },

  // Try to open `url` in any installed app. Rejects (not throws) when the module is
  // absent, so a tree-unmount on device can't be triggered by a synchronous throw.
  openURL(url: string): Promise<void> {
    validateUrl(url)
    dlog(`Linking.openURL -> ${url}`)
    const module = getModule()
    if (module === null) return Promise.reject(moduleUnavailable())
    return module.openURL(url)
  },

  // Whether an installed app can handle `url`.
  canOpenURL(url: string): Promise<boolean> {
    validateUrl(url)
    dlog(`Linking.canOpenURL -> ${url}`)
    const module = getModule()
    if (module === null) return Promise.reject(moduleUnavailable())
    return module.canOpenURL(url)
  },

  // The URL the app was launched with (deep link), or null.
  getInitialURL(): Promise<string | null> {
    dlog('Linking.getInitialURL')
    const module = getModule()
    if (module === null) return Promise.resolve(null)
    return module.getInitialURL()
  },

  // Open the OS settings page for this app.
  openSettings(): Promise<void> {
    dlog('Linking.openSettings')
    const module = getModule()
    if (module === null) return Promise.reject(moduleUnavailable())
    return module.openSettings()
  },

  // Launch an Android intent with optional extras. Android-only: iOS's LinkingManager
  // has no sendIntent, so off Android we reject with RN's 'Unsupported' (matching
  // Linking.js) rather than reaching native.
  sendIntent(action: string, extras?: IntentExtra[]): Promise<void> {
    dlog(`Linking.sendIntent -> ${action}`)
    if (Platform.OS !== 'android') {
      dlog('Linking.sendIntent: unsupported off Android')
      return Promise.reject(new Error('Unsupported'))
    }
    const module = getModule()
    if (module === null || module.sendIntent === undefined) {
      return Promise.reject(moduleUnavailable())
    }
    return module.sendIntent(action, extras)
  },
}

// One message for an absent native module — names the platform's module so a device
// failure points at the right one.
function moduleUnavailable(): Error {
  return new Error(`Linking: ${linkingModuleName()} native module unavailable`)
}

// Narrow the native event payload to UrlEvent at the trust boundary, no `as`.
function toUrlEvent(payload: unknown): UrlEvent {
  if (typeof payload === 'object' && payload !== null && 'url' in payload) {
    const { url } = payload
    if (typeof url === 'string') return { url }
  }
  dlog('Linking: url event payload missing string url')
  return { url: '' }
}
