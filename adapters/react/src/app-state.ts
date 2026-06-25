// AppState module — reports whether the app is foreground/background/inactive and
// notifies on change, memory warnings, and (iOS) focus/blur. Native emits the
// device events `appStateDidChange` ({ app_state }), `memoryWarning`, and
// `appStateFocusChange` (boolean) through the device hub; this subscribes via a
// NativeEventEmitter bound to the AppState native module and maps them onto the
// public 'change'/'memoryWarning'/'focus'/'blur' listeners, mirroring RN's
// Libraries/AppState/AppState.js.

import {
  installDeviceEventHub,
  NativeEventEmitter,
  getNativeModule,
  type EventEmitterModule,
  type EventSubscription,
  dlog,
} from '@symbiote/engine'

// The native module name RN registers AppState under — confirmed from its spec
// (specs_DEPRECATED/modules/NativeAppState.js, `TurboModuleRegistry.getEnforcing('AppState')`).
const APP_STATE_MODULE = 'AppState'

// The device events native emits. RN's NativeAppStateEventDefinitions.
const NATIVE_EVENT = {
  stateDidChange: 'appStateDidChange',
  focusChange: 'appStateFocusChange',
  memoryWarning: 'memoryWarning',
} as const

// The public event names callers subscribe to. RN's AppStateEvent.
const APP_STATE_EVENT = {
  change: 'change',
  memoryWarning: 'memoryWarning',
  focus: 'focus',
  blur: 'blur',
} as const

export type AppStateStatus = 'inactive' | 'background' | 'active' | 'extension' | 'unknown'
export type AppStateEvent = (typeof APP_STATE_EVENT)[keyof typeof APP_STATE_EVENT]

// The AppState native module: getConstants (initial state) plus the observe-counters.
interface NativeAppState extends EventEmitterModule {
  getConstants(): { initialAppState: string }
  addListener(eventType: string): void
  removeListeners(count: number): void
}

function isStateChangePayload(value: unknown): value is { app_state: string } {
  return typeof value === 'object' && value !== null && 'app_state' in value
}

// Lazily resolved so importing this module has no native side effect: a headless
// run without a fake __turboModuleProxy still loads it; resolution happens on first
// use. `null` when the module isn't linked.
let appStateModule: NativeAppState | null | undefined
let emitter: NativeEventEmitter | undefined
let currentState: string | null = null

function getModule(): NativeAppState | null {
  if (appStateModule === undefined) {
    appStateModule = getNativeModule<NativeAppState>(APP_STATE_MODULE)
    dlog(`AppState: module ${appStateModule ? 'resolved' : 'NOT resolved (null)'}`)
  }
  return appStateModule
}

function getEmitter(): NativeEventEmitter {
  if (emitter === undefined) {
    // WHY lazy: install on first use so the hub exists before native emits, without
    // a hard bootstrap-order dependency. Idempotent.
    installDeviceEventHub()
    const module = getModule()
    if (module !== null) {
      currentState = module.getConstants().initialAppState
    }
    emitter = new NativeEventEmitter(module ?? undefined)
    // Keep `currentState` fresh even when nobody listens, so a read after a state
    // change returns the new value — RN registers the same always-on observer.
    emitter.addListener(NATIVE_EVENT.stateDidChange, (payload) => {
      if (!isStateChangePayload(payload)) return
      dlog(`AppState: ${NATIVE_EVENT.stateDidChange} -> ${payload.app_state}`)
      currentState = payload.app_state
    })
  }
  return emitter
}

class AppStateImpl {
  // Feature-detect: true when the native AppState module resolved, false when it
  // isn't linked. RN exposes the same field so callers can guard before subscribing.
  get isAvailable(): boolean {
    return getModule() !== null
  }

  // The current foreground/background state, populated from getConstants and kept
  // fresh by the change observer. Null until the module resolves (or never linked).
  get currentState(): string | null {
    getEmitter()
    return currentState
  }

  // Subscribe to an AppState event. Native delivers `appStateDidChange`,
  // `memoryWarning`, and `appStateFocusChange`; this maps each onto the requested
  // public event. Never throws — a missing module yields a live-but-silent
  // subscription (the counters are no-ops without a module).
  addEventListener(type: AppStateEvent, handler: (...args: unknown[]) => void): EventSubscription {
    const eventEmitter = getEmitter()
    dlog(`AppState.addEventListener -> ${type}`)
    switch (type) {
      case APP_STATE_EVENT.change:
        return eventEmitter.addListener(NATIVE_EVENT.stateDidChange, (payload) => {
          if (!isStateChangePayload(payload)) return
          handler(payload.app_state)
        })
      case APP_STATE_EVENT.memoryWarning:
        return eventEmitter.addListener(NATIVE_EVENT.memoryWarning, () => handler())
      case APP_STATE_EVENT.focus:
        return eventEmitter.addListener(NATIVE_EVENT.focusChange, (hasFocus) => {
          if (hasFocus === true) handler()
        })
      case APP_STATE_EVENT.blur:
        return eventEmitter.addListener(NATIVE_EVENT.focusChange, (hasFocus) => {
          if (hasFocus === false) handler()
        })
    }
  }
}

export const AppState = new AppStateImpl()
