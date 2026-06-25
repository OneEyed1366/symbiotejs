// Appearance module — reads/sets the device color scheme and reports changes.
// Native emits the device event `appearanceChanged` ({ colorScheme }) through the
// device hub; this subscribes via a NativeEventEmitter bound to the Appearance
// native module (which RN keys its appearance events off of) and re-broadcasts to
// JS listeners as a plain `{ colorScheme }` payload. Mirrors RN's
// Libraries/Utilities/Appearance.js, slimmed to the parts we need.

import {
  installDeviceEventHub,
  NativeEventEmitter,
  getNativeModule,
  type EventEmitterModule,
  type EventSubscription,
  dlog,
} from '@symbiote/engine'

// The native module name RN registers the appearance module under — confirmed from
// its spec (specs_DEPRECATED/modules/NativeAppearance.js, `TurboModuleRegistry.get('Appearance')`).
const APPEARANCE_MODULE = 'Appearance'

// The device event native emits when the system color scheme changes. RN's
// NativeAppearance spec / Appearance.js.
const APPEARANCE_CHANGED_EVENT = 'appearanceChanged'

// The resolved color scheme. `setColorScheme` also accepts 'unspecified' (reset to
// the system value); a read only ever yields a concrete scheme or null.
export type ColorSchemeName = 'light' | 'dark'
export type ColorSchemePreference = ColorSchemeName | 'unspecified'

// The Appearance native module. `getColorScheme`/`setColorScheme` plus the
// observe-counters (so native starts/stops watching as JS subscribes).
interface NativeAppearance extends EventEmitterModule {
  getColorScheme(): ColorSchemeName | null
  setColorScheme(colorScheme: ColorSchemePreference): void
  addListener(eventType: string): void
  removeListeners(count: number): void
}

// The change-event payload native delivers.
interface AppearancePreferences {
  colorScheme: ColorSchemeName | null
}

function isAppearancePreferences(value: unknown): value is AppearancePreferences {
  return typeof value === 'object' && value !== null && 'colorScheme' in value
}

// Lazily resolved so importing this module has no native side effect: a headless
// run without a fake __turboModuleProxy still loads it; resolution happens on the
// first use. `null` when the module isn't linked.
let appearanceModule: NativeAppearance | null | undefined
let emitter: NativeEventEmitter | undefined
// Cached scheme, kept fresh by the change listener — mirrors RN's `state.appearance`.
let cachedScheme: ColorSchemeName | null | undefined

function getModule(): NativeAppearance | null {
  if (appearanceModule === undefined) {
    appearanceModule = getNativeModule<NativeAppearance>(APPEARANCE_MODULE)
    dlog(`Appearance: module ${appearanceModule ? 'resolved' : 'NOT resolved (null)'}`)
  }
  return appearanceModule
}

function getEmitter(): NativeEventEmitter {
  if (emitter === undefined) {
    // WHY lazy: install on first subscribe so the hub exists before native emits,
    // without a hard bootstrap-order dependency. Idempotent.
    installDeviceEventHub()
    const module = getModule()
    emitter = new NativeEventEmitter(module ?? undefined)
    // Keep the cached scheme fresh even when nobody is listening, so a later
    // getColorScheme() after a system change reads the new value. RN does the same.
    emitter.addListener(APPEARANCE_CHANGED_EVENT, (payload) => {
      if (!isAppearancePreferences(payload)) return
      dlog(`Appearance: ${APPEARANCE_CHANGED_EVENT} -> ${String(payload.colorScheme)}`)
      cachedScheme = payload.colorScheme
    })
  }
  return emitter
}

export const Appearance = {
  // The current color scheme, or null when no module is linked / the device is in
  // 'unspecified'. Never throws — a missing module reads as null.
  getColorScheme(): ColorSchemeName | null {
    const module = getModule()
    if (module === null) return null
    // Ensure the change listener is wired so the cache stays fresh after this read.
    getEmitter()
    if (cachedScheme === undefined) cachedScheme = module.getColorScheme()
    return cachedScheme
  },

  // Override the color scheme (or 'unspecified' to follow the system). No-op when
  // the module isn't linked.
  setColorScheme(colorScheme: ColorSchemePreference): void {
    const module = getModule()
    if (module === null) {
      dlog('Appearance.setColorScheme -> no module (no-op)')
      return
    }
    module.setColorScheme(colorScheme)
    cachedScheme =
      colorScheme === 'unspecified' ? (module.getColorScheme() ?? null) : colorScheme
  },

  // Subscribe to color-scheme changes. The listener receives `{ colorScheme }`.
  addChangeListener(
    listener: (preferences: AppearancePreferences) => void,
  ): EventSubscription {
    dlog('Appearance.addChangeListener')
    return getEmitter().addListener(APPEARANCE_CHANGED_EVENT, (payload) => {
      if (!isAppearancePreferences(payload)) return
      listener({ colorScheme: payload.colorScheme })
    })
  },
}
