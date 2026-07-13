// AppState module: reports whether the app is foreground/background/inactive and
// notifies on change, memory warnings, and (iOS) focus/blur. Native emits the
// device events `appStateDidChange` ({ app_state }), `memoryWarning`, and
// `appStateFocusChange` (boolean) through the device hub; this subscribes via a
// NativeEventEmitter bound to the AppState native module and maps them onto the
// public 'change'/'memoryWarning'/'focus'/'blur' listeners, mirroring RN's
// Libraries/AppState/AppState.js.

import { createDeviceEventModule } from '../native-modules';
import { type IEventEmitterModule, type IEventSubscription } from '../native-events';
import { dlog } from '../debug';

// The native module name RN registers AppState under, confirmed from its spec
// (specs_DEPRECATED/modules/INativeAppState.js, `TurboModuleRegistry.getEnforcing('AppState')`).
const APP_STATE_MODULE = 'AppState';

// The device events native emits. RN's NativeAppStateEventDefinitions.
const NATIVE_EVENT = {
  stateDidChange: 'appStateDidChange',
  focusChange: 'appStateFocusChange',
  memoryWarning: 'memoryWarning',
} as const;

// The public event names callers subscribe to. RN's IAppStateEvent.
const APP_STATE_EVENT = {
  change: 'change',
  memoryWarning: 'memoryWarning',
  focus: 'focus',
  blur: 'blur',
} as const;

export type IAppStateStatus = 'inactive' | 'background' | 'active' | 'extension' | 'unknown';
export type IAppStateEvent = (typeof APP_STATE_EVENT)[keyof typeof APP_STATE_EVENT];

// The AppState native module: getConstants (initial state) plus the observe-counters.
interface INativeAppState extends IEventEmitterModule {
  getConstants(): { initialAppState: string };
  addListener(eventType: string): void;
  removeListeners(count: number): void;
}

function isStateChangePayload(value: unknown): value is { app_state: string } {
  return typeof value === 'object' && value !== null && 'app_state' in value;
}

// Lazily resolved so importing this module has no native side effect: a headless
// run without a fake __turboModuleProxy still loads it; resolution happens on first
// use. `null` when the module isn't linked.
let currentState: string | null = null;

// The self-subscription policy that diverges from a plain lazy-resolve+emitter:
// AppState hydrates `currentState` from the module's initial constants, then keeps it
// fresh forever via a permanent 'appStateDidChange' listener, so a read after a native
// change returns the new value even with nobody else listening (RN parity).
const deviceEventModule = createDeviceEventModule<INativeAppState>({
  moduleName: APP_STATE_MODULE,
  moduleLogPrefix: 'AppState: module',
  onEmitterCreated: (emitter, module) => {
    if (module !== null) {
      currentState = module.getConstants().initialAppState;
    }
    emitter.addListener(NATIVE_EVENT.stateDidChange, payload => {
      if (!isStateChangePayload(payload)) return;
      dlog(`AppState: ${NATIVE_EVENT.stateDidChange} -> ${payload.app_state}`);
      currentState = payload.app_state;
    });
  },
});

function getModule(): INativeAppState | null {
  return deviceEventModule.getModule();
}

function getEmitter() {
  return deviceEventModule.getEmitter();
}

class AppStateImpl {
  // Feature-detect: true when the native AppState module resolved, false when it
  // isn't linked. RN exposes the same field so callers can guard before subscribing.
  get isAvailable(): boolean {
    return getModule() !== null;
  }

  // The current foreground/background state, populated from getConstants and kept
  // fresh by the change observer. Null until the module resolves (or never linked).
  get currentState(): string | null {
    getEmitter();
    return currentState;
  }

  // Subscribe to an AppState event. Native delivers `appStateDidChange`,
  // `memoryWarning`, and `appStateFocusChange`; this maps each onto the requested
  // public event. Never throws; a missing module yields a live-but-silent
  // subscription (the counters are no-ops without a module).
  addEventListener(
    type: IAppStateEvent,
    handler: (...args: unknown[]) => void,
  ): IEventSubscription {
    const eventEmitter = getEmitter();
    dlog(`AppState.addEventListener -> ${type}`);
    switch (type) {
      case APP_STATE_EVENT.change:
        return eventEmitter.addListener(NATIVE_EVENT.stateDidChange, payload => {
          if (!isStateChangePayload(payload)) return;
          handler(payload.app_state);
        });
      case APP_STATE_EVENT.memoryWarning:
        return eventEmitter.addListener(NATIVE_EVENT.memoryWarning, () => handler());
      case APP_STATE_EVENT.focus:
        return eventEmitter.addListener(NATIVE_EVENT.focusChange, hasFocus => {
          if (hasFocus === true) handler();
        });
      case APP_STATE_EVENT.blur:
        return eventEmitter.addListener(NATIVE_EVENT.focusChange, hasFocus => {
          if (hasFocus === false) handler();
        });
    }
  }
}

export const AppState = new AppStateImpl();
