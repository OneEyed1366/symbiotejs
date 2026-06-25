// AccessibilityInfo on Android — wraps the stock RN `AccessibilityInfo` native module
// (NO native code added; it ships with react-native). Android's getters take a SINGLE
// success callback (no error callback) and a different method set than iOS: screen-reader
// is `isTouchExplorationEnabled`, plus reduce-motion / invert-colors / grayscale /
// high-text-contrast / accessibility-service, and `getRecommendedTimeoutMillis`. The
// device-event NAMES also differ from iOS (e.g. screen-reader is `touchExplorationDidChange`,
// reduce-motion is `reduceMotionDidChange`). Metro picks this on an Android host. Mirrors
// RN's AccessibilityInfo.js Android branches.

import {
  installDeviceEventHub,
  NativeEventEmitter,
  getNativeModule,
  isSymbioteNode,
  sendAccessibilityEvent as sharedSendAccessibilityEvent,
  type EventEmitterModule,
  type EventSubscription,
  dlog,
} from '@symbiote/engine'
import {
  isBoolean,
  type AccessibilityChangeEventName,
  type AccessibilityChangeEventHandler,
  type AccessibilityInfoStatic,
  type AnnounceForAccessibilityOptions,
  type AccessibilityEventType,
  type AccessibilityHandle,
} from './accessibility-info-shared'
export type {
  AccessibilityChangeEvent,
  AccessibilityChangeEventName,
  AccessibilityChangeEventHandler,
  AccessibilityAnnouncementFinishedEvent,
  AnnounceForAccessibilityOptions,
  AccessibilityEventType,
} from './accessibility-info-shared'

// The Android native module name. This is the module the Android JS wrapper
// (NativeAccessibilityInfoAndroid) resolves — the stock RN `AccessibilityInfo` Turbo/legacy
// module. Per the symbiote invariant, a module name is only provable on a real host (a
// headless fake answers to any name); this Android name is DEVICE-VERIFY-PENDING. See
// .docs/native-module-platform-routing.md.
const ACCESSIBILITY_MODULE = 'AccessibilityInfo'

// Public event name -> the Android device event the native side emits. Android renames
// most of them; events with no Android source (iOS-only) are absent and yield an inert
// subscription. (RN maps both `change` and `screenReaderChanged` to touchExplorationDidChange.)
const ANDROID_DEVICE_EVENT: Partial<Record<AccessibilityChangeEventName, string>> = {
  screenReaderChanged: 'touchExplorationDidChange',
  reduceMotionChanged: 'reduceMotionDidChange',
  highTextContrastChanged: 'highTextContrastDidChange',
  accessibilityServiceChanged: 'accessibilityServiceDidChange',
  invertColorsChanged: 'invertColorDidChange',
  grayscaleChanged: 'grayscaleModeDidChange',
}

type StateCallback = (enabled: boolean) => void

// The Android AccessibilityInfo native module: single-callback boolean getters, announce,
// and the recommended-timeout query. Optional methods guard older hosts. No error callback
// and no setAccessibilityFocus — focus is a 'focus' accessibility event routed through the
// Fabric slot (see sendAccessibilityEvent below).
interface NativeAccessibilityInfoAndroid extends EventEmitterModule {
  isTouchExplorationEnabled(onSuccess: StateCallback): void
  isReduceMotionEnabled(onSuccess: StateCallback): void
  isInvertColorsEnabled?(onSuccess: StateCallback): void
  isGrayscaleEnabled?(onSuccess: StateCallback): void
  isHighTextContrastEnabled?(onSuccess: StateCallback): void
  isAccessibilityServiceEnabled?(onSuccess: StateCallback): void
  announceForAccessibility(announcement: string): void
  getRecommendedTimeoutMillis?(original: number, onSuccess: (timeout: number) => void): void
  addListener(eventType: string): void
  removeListeners(count: number): void
}

// Lazily resolved so importing this module has no native side effect. `null` when unlinked.
let accessibilityModule: NativeAccessibilityInfoAndroid | null | undefined
let emitter: NativeEventEmitter | undefined

function getModule(): NativeAccessibilityInfoAndroid | null {
  if (accessibilityModule === undefined) {
    accessibilityModule = getNativeModule<NativeAccessibilityInfoAndroid>(ACCESSIBILITY_MODULE)
    dlog(`AccessibilityInfo(android): module ${accessibilityModule ? 'resolved' : 'NOT resolved (null)'}`)
  }
  return accessibilityModule
}

function getEmitter(): NativeEventEmitter {
  if (emitter === undefined) {
    installDeviceEventHub()
    emitter = new NativeEventEmitter(getModule() ?? undefined)
  }
  return emitter
}

// Run a single-callback Android getter as a Promise. Resolves false when the module is
// unlinked OR the optional method is absent on this host — mirrors RN's "missing query ->
// false" contract for the cross-platform getters. The dlog records the miss.
function queryState(
  pick: (module: NativeAccessibilityInfoAndroid) => ((s: StateCallback) => void) | undefined,
  label: string,
): Promise<boolean> {
  const module = getModule()
  if (module === null) {
    dlog(`AccessibilityInfo(android).${label} -> no module (false)`)
    return Promise.resolve(false)
  }
  const getter = pick(module)
  if (getter === undefined) {
    dlog(`AccessibilityInfo(android).${label} -> method absent (false)`)
    return Promise.resolve(false)
  }
  return new Promise((resolve) => {
    getter.call(module, (enabled) => resolve(enabled))
  })
}

class AccessibilityInfoAndroid implements AccessibilityInfoStatic {
  // Screen reader on Android == touch exploration (TalkBack).
  isScreenReaderEnabled(): Promise<boolean> {
    return queryState((m) => m.isTouchExplorationEnabled, 'isScreenReaderEnabled')
  }

  isReduceMotionEnabled(): Promise<boolean> {
    return queryState((m) => m.isReduceMotionEnabled, 'isReduceMotionEnabled')
  }

  // iOS-only query; Android has no bold-text setting, so resolve false (RN parity).
  isBoldTextEnabled(): Promise<boolean> {
    return Promise.resolve(false)
  }

  isGrayscaleEnabled(): Promise<boolean> {
    return queryState((m) => m.isGrayscaleEnabled, 'isGrayscaleEnabled')
  }

  isInvertColorsEnabled(): Promise<boolean> {
    return queryState((m) => m.isInvertColorsEnabled, 'isInvertColorsEnabled')
  }

  // iOS-only query; resolve false (RN parity).
  isReduceTransparencyEnabled(): Promise<boolean> {
    return Promise.resolve(false)
  }

  isHighTextContrastEnabled(): Promise<boolean> {
    return queryState((m) => m.isHighTextContrastEnabled, 'isHighTextContrastEnabled')
  }

  // iOS-only "Increase Contrast"; Android has no equivalent, so resolve false (RN parity).
  isDarkerSystemColorsEnabled(): Promise<boolean> {
    return Promise.resolve(false)
  }

  // iOS-only reduce-motion sub-setting; resolve false on Android (RN parity).
  prefersCrossFadeTransitions(): Promise<boolean> {
    return Promise.resolve(false)
  }

  isAccessibilityServiceEnabled(): Promise<boolean> {
    return queryState((m) => m.isAccessibilityServiceEnabled, 'isAccessibilityServiceEnabled')
  }

  // Post a string to be announced by the screen reader. No-op without a module.
  announceForAccessibility(announcement: string): void {
    const module = getModule()
    if (module === null) {
      dlog('AccessibilityInfo(android).announceForAccessibility -> no module (no-op)')
      return
    }
    module.announceForAccessibility(announcement)
  }

  // Android ignores queue/priority options (iOS-only) and posts the announcement plainly
  // (RN parity).
  announceForAccessibilityWithOptions(
    announcement: string,
    _options: AnnounceForAccessibilityOptions,
  ): void {
    this.announceForAccessibility(announcement)
  }

  // Deprecated focus-by-tag entry. The Fabric slot keys on a node's committed handle, and a
  // bare reactTag can't be resolved back to its SymbioteNode (the mirror is node-keyed), so
  // this best-effort path is a logged no-op. Callers should use sendAccessibilityEvent(node,
  // 'focus') with a host ref, which routes a real node through the slot.
  setAccessibilityFocus(reactTag: number): void {
    dlog(`AccessibilityInfo(android).setAccessibilityFocus(${reactTag}) -> tag-only, no node to route (no-op)`)
  }

  // Recommended UI-change timeout for this user. Resolves the original when the module or
  // the query is absent (RN parity).
  getRecommendedTimeoutMillis(originalTimeout: number): Promise<number> {
    const module = getModule()
    if (module === null || module.getRecommendedTimeoutMillis === undefined) {
      return Promise.resolve(originalTimeout)
    }
    const query = module.getRecommendedTimeoutMillis
    return new Promise((resolve) => {
      query.call(module, originalTimeout, (timeout) => resolve(timeout))
    })
  }

  // Emit a named accessibility event at a view through the Fabric slot. RN's Fabric path
  // hands the public-instance handle to nativeFabricUIManager.sendAccessibilityEvent with the
  // STRING eventType; the C++ side maps it to the platform's AccessibilityEvent kind. The
  // handle here IS the SymbioteNode (symbiote augments the node in place as its public
  // instance), so resolve it with the runtime guard and route through shared.
  sendAccessibilityEvent(handle: AccessibilityHandle, eventType: AccessibilityEventType): void {
    if (!isSymbioteNode(handle)) {
      dlog(`AccessibilityInfo(android).sendAccessibilityEvent("${eventType}") -> handle is not a node (no-op)`)
      return
    }
    dlog(`AccessibilityInfo(android).sendAccessibilityEvent("${eventType}") -> slot`)
    sharedSendAccessibilityEvent(handle, eventType)
  }

  // Subscribe to an accessibility-state change. Android events all carry a bare boolean.
  // Never throws — a public event with no Android device mapping yields an inert
  // subscription; a missing module yields a live-but-silent one.
  addEventListener(
    eventName: AccessibilityChangeEventName,
    handler: AccessibilityChangeEventHandler,
  ): EventSubscription {
    const deviceEvent = ANDROID_DEVICE_EVENT[eventName]
    dlog(`AccessibilityInfo(android).addEventListener -> ${eventName} (device: ${deviceEvent ?? 'none'})`)
    if (deviceEvent === undefined) {
      return { remove(): void {} }
    }
    const eventEmitter = getEmitter()
    return eventEmitter.addListener(deviceEvent, (payload) => {
      if (!isBoolean(payload)) return
      handler(payload)
    })
  }
}

export const AccessibilityInfo: AccessibilityInfoStatic = new AccessibilityInfoAndroid()
