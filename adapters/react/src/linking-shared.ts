// Shared core of the Linking module — everything that does NOT differ by platform:
// the public contract, the lazy native-module resolver, the `url` device-event
// subscription, URL validation, and payload narrowing. The per-platform files
// (linking.ios.ts / linking.android.ts) supply ONLY what genuinely diverges — the
// native module NAME and the `sendIntent` strategy — and hand them to `createLinking`.
//
// Metro selects the platform file on a real host (linking.android.ts > linking.ts);
// the base linking.ts re-exports the iOS build for web/headless. There is no runtime
// `Platform.OS` read — the filename is the selector. See ADR 0019.

import {
  installDeviceEventHub,
  NativeEventEmitter,
  getNativeModule,
  type EventEmitterModule,
  type EventSubscription,
  dlog,
} from '@symbiote/engine'

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

// The linking native module typed as the interface we vouch for — the four imperative
// URL methods plus the observe-counters, and the Android-only `sendIntent` (absent on
// iOS's LinkingManager, hence optional). The single point that accepts the native shape.
export interface NativeLinkingModule extends EventEmitterModule {
  getInitialURL(): Promise<string | null>
  canOpenURL(url: string): Promise<boolean>
  openURL(url: string): Promise<void>
  openSettings(): Promise<void>
  sendIntent?(action: string, extras?: IntentExtra[]): Promise<void>
  addListener(eventName: string): void
  removeListeners(count: number): void
}

// What every platform's Linking exposes to app code.
export interface LinkingStatic {
  addEventListener(
    eventType: typeof URL_EVENT,
    listener: (event: UrlEvent) => void,
  ): EventSubscription
  openURL(url: string): Promise<void>
  canOpenURL(url: string): Promise<boolean>
  getInitialURL(): Promise<string | null>
  openSettings(): Promise<void>
  sendIntent(action: string, extras?: IntentExtra[]): Promise<void>
}

// The two things a platform file supplies: the native module name, and how `sendIntent`
// behaves (Android launches an intent; iOS has no counterpart and rejects 'Unsupported').
export interface LinkingPlatform {
  moduleName: string
  sendIntent(
    module: NativeLinkingModule | null,
    action: string,
    extras?: IntentExtra[],
  ): Promise<void>
}

// RN's _validateURL — a typo / empty URL must fail loudly at the call, not reach native.
function validateUrl(url: string): void {
  if (typeof url !== 'string' || url.length === 0) {
    throw new Error(`Invalid URL: ${url}`)
  }
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

// Build a platform's Linking from its module name + sendIntent strategy. Each call owns
// its own lazy module/emitter cache, so importing both platform builds in a smoke keeps
// them independent. On a real host only one platform file is ever bundled.
export function createLinking(platform: LinkingPlatform): LinkingStatic {
  let linkingModule: NativeLinkingModule | null | undefined
  let emitter: NativeEventEmitter | undefined

  function getModule(): NativeLinkingModule | null {
    if (linkingModule === undefined) {
      linkingModule = getNativeModule<NativeLinkingModule>(platform.moduleName)
      dlog(
        `Linking: ${platform.moduleName} module ${linkingModule ? 'resolved' : 'NOT resolved (null)'}`,
      )
    }
    return linkingModule
  }

  function getEmitter(): NativeEventEmitter {
    if (emitter === undefined) {
      // Lazy install on first subscribe — the hub exists before native emits without a
      // hard bootstrap-order dependency. Idempotent.
      installDeviceEventHub()
      emitter = new NativeEventEmitter(getModule() ?? undefined)
    }
    return emitter
  }

  function moduleUnavailable(): Error {
    return new Error(`Linking: ${platform.moduleName} native module unavailable`)
  }

  return {
    addEventListener(eventType, listener) {
      dlog(`Linking.addEventListener -> ${eventType}`)
      return getEmitter().addListener(eventType, (payload) => {
        listener(toUrlEvent(payload))
      })
    },

    openURL(url) {
      validateUrl(url)
      dlog(`Linking.openURL -> ${url}`)
      const module = getModule()
      if (module === null) return Promise.reject(moduleUnavailable())
      return module.openURL(url)
    },

    canOpenURL(url) {
      validateUrl(url)
      dlog(`Linking.canOpenURL -> ${url}`)
      const module = getModule()
      if (module === null) return Promise.reject(moduleUnavailable())
      return module.canOpenURL(url)
    },

    getInitialURL() {
      dlog('Linking.getInitialURL')
      const module = getModule()
      if (module === null) return Promise.resolve(null)
      return module.getInitialURL()
    },

    openSettings() {
      dlog('Linking.openSettings')
      const module = getModule()
      if (module === null) return Promise.reject(moduleUnavailable())
      return module.openSettings()
    },

    sendIntent(action, extras) {
      dlog(`Linking.sendIntent -> ${action}`)
      return platform.sendIntent(getModule(), action, extras)
    },
  }
}
