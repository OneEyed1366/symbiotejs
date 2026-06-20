// Linking module — both directions of the bridge at once. JS->native: open a URL,
// probe canOpenURL, read the launch URL, open Settings, via the LinkingManager
// native module. native->JS: incoming deep links arrive as the device `url` event
// (payload `{ url }`), subscribed through a NativeEventEmitter bound to that same
// module. Mirrors RN's Libraries/Linking/Linking.js, iOS path only.
//
// The native contract is confirmed from RN's TurboModule spec at
// specs_DEPRECATED/modules/NativeLinkingManager.js (`TurboModuleRegistry.get('LinkingManager')`):
//   getInitialURL(): Promise<?string>
//   canOpenURL(url): Promise<boolean>
//   openURL(url): Promise<void>
//   openSettings(): Promise<void>
//   addListener(eventName) / removeListeners(count)   — observe-counters

import {
  installDeviceEventHub,
  NativeEventEmitter,
  getNativeModule,
  type EventEmitterModule,
  type EventSubscription,
  dlog,
} from '@symbiote/shared'

// RN registers the iOS linking module under this name.
const LINKING_MANAGER_MODULE = 'LinkingManager'

// The one event symbiote observes — an incoming deep link. RN's LinkingEventDefinitions.
const URL_EVENT = 'url'

// The payload native delivers with the `url` event.
export interface UrlEvent {
  url: string
}

// The LinkingManager native module typed as the interface we vouch for — the four
// imperative methods plus the observe-counters (EventEmitterModule), the single
// point that accepts the native shape (no per-call `as`).
interface NativeLinkingManager extends EventEmitterModule {
  getInitialURL(): Promise<string | null>
  canOpenURL(url: string): Promise<boolean>
  openURL(url: string): Promise<void>
  openSettings(): Promise<void>
  addListener(eventName: string): void
  removeListeners(count: number): void
}

// Lazily resolved so importing this module has no native side effect: a headless
// run without a fake __turboModuleProxy still loads it; resolution happens on first
// use. Null when the module isn't linked.
let linkingModule: NativeLinkingManager | null | undefined
let emitter: NativeEventEmitter | undefined

function getModule(): NativeLinkingManager | null {
  if (linkingModule === undefined) {
    linkingModule = getNativeModule<NativeLinkingManager>(LINKING_MANAGER_MODULE)
    dlog(`Linking: LinkingManager module ${linkingModule ? 'resolved' : 'NOT resolved (null)'}`)
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
    if (module === null) return Promise.reject(new Error('Linking: LinkingManager native module unavailable'))
    return module.openURL(url)
  },

  // Whether an installed app can handle `url`.
  canOpenURL(url: string): Promise<boolean> {
    validateUrl(url)
    dlog(`Linking.canOpenURL -> ${url}`)
    const module = getModule()
    if (module === null) return Promise.reject(new Error('Linking: LinkingManager native module unavailable'))
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
    if (module === null) return Promise.reject(new Error('Linking: LinkingManager native module unavailable'))
    return module.openSettings()
  },
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
