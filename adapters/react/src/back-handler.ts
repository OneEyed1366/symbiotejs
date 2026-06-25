// BackHandler module — intercepts the Android hardware back button. Native emits
// the device event `hardwareBackPress` through the device hub; this subscribes via a
// NativeEventEmitter and runs the registered handlers in REVERSE registration order
// (last-registered first). The first handler to return true consumes the press and
// stops the chain; if none consume it, the native default fires (the app exits).
// Android-only by intent: iOS has no hardware back button, so the whole module
// degrades to a no-op when the native module is absent — matching RN's
// BackHandler.ios.js stub. Mirrors RN's Libraries/Utilities/BackHandler.android.js.

import {
  installDeviceEventHub,
  NativeEventEmitter,
  getNativeModule,
  type EventEmitterModule,
  type EventSubscription,
  dlog,
} from '@symbiote/engine'

// The native module name RN registers this under. NOTE: this is the name the
// NativeDeviceEventManager spec resolves via
// `TurboModuleRegistry.get('DeviceEventManager')` — NOT the spec filename
// `NativeDeviceEventManager`. Per the symbiote invariant, a module name is only
// provable on a real host (a headless fake answers to any name); this name is
// device-verify-pending (Android). See .docs/native-module-platform-routing.md.
const DEVICE_EVENT_MANAGER_MODULE = 'DeviceEventManager'

// The device event native emits when the hardware back button is pressed.
const DEVICE_BACK_EVENT = 'hardwareBackPress'

// The public event names callers subscribe to. `backPress` is RN's legacy alias
// for `hardwareBackPress`; both map to the same chain.
const BACK_PRESS_EVENT = {
  backPress: 'backPress',
  hardwareBackPress: 'hardwareBackPress',
} as const

export type BackPressEventName =
  (typeof BACK_PRESS_EVENT)[keyof typeof BACK_PRESS_EVENT]

// A handler returns true to consume the back press (stop the chain); any
// falsy/void result lets earlier-registered handlers run, and ultimately the
// native default. RN passes a HardwareBackPressEvent; we keep the signature
// event-less since the slot has no Event class yet and handlers ignore it.
export type BackPressHandler = () => boolean | null | undefined | void

// The native DeviceEventManager: a single method that triggers Android's default
// back behavior (finishing the activity / exiting the app).
interface NativeDeviceEventManager extends EventEmitterModule {
  invokeDefaultBackPressHandler(): void
}

// The registry, in registration order. Invoked in reverse on a back press.
const backPressSubscriptions: BackPressHandler[] = []

function isHandled(result: ReturnType<BackPressHandler>): boolean {
  return result === true
}

// Lazily resolved so importing this module has no native side effect: a headless
// run without a fake __turboModuleProxy still loads it; resolution happens on the
// first use. `null` when the module isn't linked (e.g. iOS).
let deviceEventManager: NativeDeviceEventManager | null | undefined
let emitter: NativeEventEmitter | undefined

function getModule(): NativeDeviceEventManager | null {
  if (deviceEventManager === undefined) {
    deviceEventManager = getNativeModule<NativeDeviceEventManager>(DEVICE_EVENT_MANAGER_MODULE)
    dlog(`BackHandler: module ${deviceEventManager ? 'resolved' : 'NOT resolved (null)'}`)
  }
  return deviceEventManager
}

function getEmitter(): NativeEventEmitter {
  if (emitter === undefined) {
    // WHY lazy: install on first subscribe so the hub exists before native emits,
    // without a hard bootstrap-order dependency. Idempotent.
    installDeviceEventHub()
    emitter = new NativeEventEmitter(getModule() ?? undefined)
    // Wire the native back-press event to the reverse-order chain exactly once.
    emitter.addListener(DEVICE_BACK_EVENT, dispatchBackPress)
  }
  return emitter
}

// Run handlers last-registered-first; the first to return true consumes the press
// and the rest are skipped. If none consume it, fall through to the native default.
function dispatchBackPress(): void {
  for (let i = backPressSubscriptions.length - 1; i >= 0; i--) {
    const handler = backPressSubscriptions[i]
    if (handler !== undefined && isHandled(handler())) {
      dlog(`BackHandler: back press consumed by handler ${i}`)
      return
    }
  }
  dlog('BackHandler: back press unhandled -> native default')
  BackHandler.exitApp()
}

class BackHandlerImpl {
  // Trigger Android's default back behavior (exit the app). No-op without a module
  // (e.g. iOS) — never throws, mirroring RN's BackHandler.ios.js stub.
  exitApp(): void {
    const module = getModule()
    if (module === null) {
      dlog('BackHandler.exitApp -> no module (no-op)')
      return
    }
    module.invokeDefaultBackPressHandler()
  }

  // Register a hardware-back handler. The returned subscription's remove()
  // unregisters it. Idempotent on the same handler reference (RN semantics).
  addEventListener(_eventName: BackPressEventName, handler: BackPressHandler): EventSubscription {
    // Install the hub/emitter on first subscribe so native back presses reach the chain.
    getEmitter()
    dlog('BackHandler.addEventListener -> hardwareBackPress')
    if (backPressSubscriptions.indexOf(handler) === -1) {
      backPressSubscriptions.push(handler)
    }
    return {
      remove: (): void => {
        const index = backPressSubscriptions.indexOf(handler)
        if (index !== -1) {
          backPressSubscriptions.splice(index, 1)
        }
      },
    }
  }

  // Legacy unsubscribe kept for RN parity. The modern path is the subscription's
  // remove() returned by addEventListener.
  removeEventListener(_eventName: BackPressEventName, handler: BackPressHandler): void {
    const index = backPressSubscriptions.indexOf(handler)
    if (index !== -1) {
      backPressSubscriptions.splice(index, 1)
    }
  }
}

export const BackHandler = new BackHandlerImpl()
