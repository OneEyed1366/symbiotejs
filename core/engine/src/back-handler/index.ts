// BackHandler module: intercepts the Android hardware back button. Native emits
// the device event `hardwareBackPress` through the device hub; this subscribes via a
// NativeEventEmitter and runs the registered handlers in REVERSE registration order
// (last-registered first). The first handler to return true consumes the press and
// stops the chain; if none consume it, the native default fires (the app exits).
// Android-only by intent: iOS has no hardware back button, so the whole module
// degrades to a no-op when the native module is absent, matching RN's
// BackHandler.ios.js stub. Mirrors RN's Libraries/Utilities/BackHandler.android.js.

import { createDeviceEventModule } from '../native-modules';
import { type IEventEmitterModule, type IEventSubscription } from '../native-events';
import { dlog } from '../debug';

// The native module name RN registers this under. NOTE: this is the name the
// INativeDeviceEventManager spec resolves via
// `TurboModuleRegistry.get('DeviceEventManager')`, NOT the spec filename
// `INativeDeviceEventManager`. A module name is only provable on a real host (a
// headless fake answers to any name); this name is device-verify-pending (Android).
const DEVICE_EVENT_MANAGER_MODULE = 'DeviceEventManager';

// The device event native emits when the hardware back button is pressed.
const DEVICE_BACK_EVENT = 'hardwareBackPress';

// The public event names callers subscribe to. `backPress` is RN's legacy alias
// for `hardwareBackPress`; both map to the same chain.
const BACK_PRESS_EVENT = {
  backPress: 'backPress',
  hardwareBackPress: 'hardwareBackPress',
} as const;

export type IBackPressEventName = (typeof BACK_PRESS_EVENT)[keyof typeof BACK_PRESS_EVENT];

// A handler returns true to consume the back press (stop the chain); any
// falsy/void result lets earlier-registered handlers run, and ultimately the
// native default. RN passes a HardwareBackPressEvent; we keep the signature
// event-less since the slot has no Event class yet and handlers ignore it.
export type IBackPressHandler = () => boolean | null | undefined | void;

// The native DeviceEventManager: a single method that triggers Android's default
// back behavior (finishing the activity / exiting the app).
interface INativeDeviceEventManager extends IEventEmitterModule {
  invokeDefaultBackPressHandler(): void;
}

// The registry, in registration order. Invoked in reverse on a back press.
const backPressSubscriptions: IBackPressHandler[] = [];

function isHandled(result: ReturnType<IBackPressHandler>): boolean {
  return result === true;
}

// Lazily resolved so importing this module has no native side effect: a headless
// run without a fake __turboModuleProxy still loads it; resolution happens on the
// first use. `null` when the module isn't linked (e.g. iOS).
//
// The self-subscription policy that diverges from a plain lazy-resolve+emitter:
// BackHandler wires the native back-press event to the reverse-order chain exactly
// once, permanently.
const deviceEventModule = createDeviceEventModule<INativeDeviceEventManager>({
  moduleName: DEVICE_EVENT_MANAGER_MODULE,
  moduleLogPrefix: 'BackHandler: module',
  onEmitterCreated: emitter => {
    emitter.addListener(DEVICE_BACK_EVENT, dispatchBackPress);
  },
});

function getModule(): INativeDeviceEventManager | null {
  return deviceEventModule.getModule();
}

function getEmitter() {
  return deviceEventModule.getEmitter();
}

// Run handlers last-registered-first; the first to return true consumes the press
// and the rest are skipped. If none consume it, fall through to the native default.
function dispatchBackPress(): void {
  for (let i = backPressSubscriptions.length - 1; i >= 0; i--) {
    const handler = backPressSubscriptions[i];
    if (handler !== undefined && isHandled(handler())) {
      dlog(`BackHandler: back press consumed by handler ${i}`);
      return;
    }
  }
  dlog('BackHandler: back press unhandled -> native default');
  BackHandler.exitApp();
}

class BackHandlerImpl {
  // Trigger Android's default back behavior (exit the app). No-op without a module
  // (e.g. iOS); never throws, mirroring RN's BackHandler.ios.js stub.
  exitApp(): void {
    const module = getModule();
    if (module === null) {
      dlog('BackHandler.exitApp -> no module (no-op)');
      return;
    }
    module.invokeDefaultBackPressHandler();
  }

  // Register a hardware-back handler. The returned subscription's remove()
  // unregisters it. Idempotent on the same handler reference (RN semantics).
  addEventListener(
    _eventName: IBackPressEventName,
    handler: IBackPressHandler,
  ): IEventSubscription {
    // Install the hub/emitter on first subscribe so native back presses reach the chain.
    getEmitter();
    dlog('BackHandler.addEventListener -> hardwareBackPress');
    if (backPressSubscriptions.indexOf(handler) === -1) {
      backPressSubscriptions.push(handler);
    }
    return {
      remove: (): void => {
        const index = backPressSubscriptions.indexOf(handler);
        if (index !== -1) {
          backPressSubscriptions.splice(index, 1);
        }
      },
    };
  }

  // Legacy unsubscribe kept for RN parity. The modern path is the subscription's
  // remove() returned by addEventListener.
  removeEventListener(_eventName: IBackPressEventName, handler: IBackPressHandler): void {
    const index = backPressSubscriptions.indexOf(handler);
    if (index !== -1) {
      backPressSubscriptions.splice(index, 1);
    }
  }
}

export const BackHandler = new BackHandlerImpl();
