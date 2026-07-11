// AccessibilityInfo on iOS wraps the `AccessibilityManager` native module: callback-
// based state getters (VoiceOver / reduce-motion / bold-text / grayscale / invert-colors /
// reduce-transparency / darker-system-colors), announce + focus side effects, and the
// observe-counters for the device-event subscription. Subscribes to iOS device events
// (`screenReaderChanged` / `reduceMotionChanged` / `boldTextChanged` / …) via a
// NativeEventEmitter and re-broadcasts to JS listeners. Metro picks this on an iOS host;
// the bare accessibility-info.ts re-exports it as the default for tsc / tsx / headless.
// Mirrors RN's AccessibilityInfo.js iOS branches.

import { createDeviceEventModule } from '../native-modules';
import { type IEventEmitterModule, type IEventSubscription } from '../native-events';
import { dlog } from '../debug';
import {
  isBoolean,
  routeSendAccessibilityEvent,
  type IAccessibilityAnnouncementFinishedEvent,
  type IAccessibilityChangeEventName,
  type IAccessibilityChangeEventHandler,
  type IAccessibilityInfoStatic,
  type IAnnounceForAccessibilityOptions,
  type IAccessibilityEventType,
  type IAccessibilityHandle,
} from './shared';
export type {
  IAccessibilityChangeEvent,
  IAccessibilityChangeEventName,
  IAccessibilityChangeEventHandler,
  IAccessibilityAnnouncementFinishedEvent,
  IAnnounceForAccessibilityOptions,
  IAccessibilityEventType,
} from './shared';

// The iOS native module name RN registers this under. NOTE: this is the name the iOS JS
// wrapper (INativeAccessibilityManagerIOS) resolves via
// `TurboModuleRegistry.get('AccessibilityManager')`, NOT the spec filename
// `NativeAccessibilityManager`. A module name is only provable on a real host (a headless
// fake answers to any name); this iOS name is device-verified (the pre-split file shipped it).
const ACCESSIBILITY_MODULE = 'AccessibilityManager';

// Public event name -> the iOS device event the native side emits. iOS keeps the names
// 1:1; the indirection exists only so the mapping stays explicit (Android renames them).
const IOS_DEVICE_EVENT: Partial<Record<IAccessibilityChangeEventName, string>> = {
  screenReaderChanged: 'screenReaderChanged',
  reduceMotionChanged: 'reduceMotionChanged',
  boldTextChanged: 'boldTextChanged',
  grayscaleChanged: 'grayscaleChanged',
  invertColorsChanged: 'invertColorsChanged',
  reduceTransparencyChanged: 'reduceTransparencyChanged',
  darkerSystemColorsChanged: 'darkerSystemColorsChanged',
  announcementFinished: 'announcementFinished',
};

type IStateCallback = (enabled: boolean) => void;
type IErrorCallback = (error: unknown) => void;

// The iOS AccessibilityManager native module: callback-based state getters, announce /
// focus side effects, plus the observe-counters. announceForAccessibilityWithOptions is
// optional; older hosts only have the plain announce.
interface INativeAccessibilityManagerIOS extends IEventEmitterModule {
  getCurrentVoiceOverState(onSuccess: IStateCallback, onError: IErrorCallback): void;
  getCurrentReduceMotionState(onSuccess: IStateCallback, onError: IErrorCallback): void;
  getCurrentBoldTextState(onSuccess: IStateCallback, onError: IErrorCallback): void;
  getCurrentGrayscaleState(onSuccess: IStateCallback, onError: IErrorCallback): void;
  getCurrentInvertColorsState(onSuccess: IStateCallback, onError: IErrorCallback): void;
  getCurrentReduceTransparencyState(onSuccess: IStateCallback, onError: IErrorCallback): void;
  getCurrentDarkerSystemColorsState?(onSuccess: IStateCallback, onError: IErrorCallback): void;
  getCurrentPrefersCrossFadeTransitionsState?(
    onSuccess: IStateCallback,
    onError: IErrorCallback,
  ): void;
  announceForAccessibility(announcement: string): void;
  announceForAccessibilityWithOptions?(
    announcement: string,
    options: IAnnounceForAccessibilityOptions,
  ): void;
  setAccessibilityFocus(reactTag: number): void;
  addListener(eventType: string): void;
  removeListeners(count: number): void;
}

// Lazily resolved so importing this module has no native side effect: a headless run
// without a fake __turboModuleProxy still loads it; resolution happens on first use.
// `null` when the module isn't linked. The lazy-resolve + lazy-emitter shape itself
// lives in `createDeviceEventModule` (native-modules.ts); iOS adds no self-subscription
// on top of it, unlike app-state/appearance/back-handler/keyboard.
const deviceEventModule = createDeviceEventModule<INativeAccessibilityManagerIOS>({
  moduleName: ACCESSIBILITY_MODULE,
  moduleLogPrefix: 'AccessibilityInfo(ios): module',
});

function getModule(): INativeAccessibilityManagerIOS | null {
  return deviceEventModule.getModule();
}

function getEmitter() {
  return deviceEventModule.getEmitter();
}

// Run a callback-based native getter as a Promise; resolves false when the module is
// unlinked, mirroring RN's "unavailable query -> false" contract for the cross-platform
// getters. (RN rejects on iOS, but a false fallback keeps the unified surface uniform with
// Android's missing-method getters; the dlog records the miss.)
function queryState(
  pick: (module: INativeAccessibilityManagerIOS) => (s: IStateCallback, e: IErrorCallback) => void,
  label: string,
): Promise<boolean> {
  const module = getModule();
  if (module === null) {
    dlog(`AccessibilityInfo(ios).${label} -> no module (false)`);
    return Promise.resolve(false);
  }
  const getter = pick(module);
  return new Promise((resolve, reject) => {
    getter.call(
      module,
      enabled => resolve(enabled),
      error => reject(error),
    );
  });
}

// Like queryState, but for an OPTIONAL native getter (newer iOS surfaces): resolves false
// when the module is unlinked OR the method is absent on this host, instead of throwing.
function queryOptionalState(
  pick: (
    module: INativeAccessibilityManagerIOS,
  ) => ((s: IStateCallback, e: IErrorCallback) => void) | undefined,
  label: string,
): Promise<boolean> {
  const module = getModule();
  if (module === null) {
    dlog(`AccessibilityInfo(ios).${label} -> no module (false)`);
    return Promise.resolve(false);
  }
  const getter = pick(module);
  if (getter === undefined) {
    dlog(`AccessibilityInfo(ios).${label} -> method absent (false)`);
    return Promise.resolve(false);
  }
  return new Promise((resolve, reject) => {
    getter.call(
      module,
      enabled => resolve(enabled),
      error => reject(error),
    );
  });
}

class AccessibilityInfoIOS implements IAccessibilityInfoStatic {
  isScreenReaderEnabled(): Promise<boolean> {
    return queryState(m => m.getCurrentVoiceOverState, 'isScreenReaderEnabled');
  }

  isReduceMotionEnabled(): Promise<boolean> {
    return queryState(m => m.getCurrentReduceMotionState, 'isReduceMotionEnabled');
  }

  isBoldTextEnabled(): Promise<boolean> {
    return queryState(m => m.getCurrentBoldTextState, 'isBoldTextEnabled');
  }

  isGrayscaleEnabled(): Promise<boolean> {
    return queryState(m => m.getCurrentGrayscaleState, 'isGrayscaleEnabled');
  }

  isInvertColorsEnabled(): Promise<boolean> {
    return queryState(m => m.getCurrentInvertColorsState, 'isInvertColorsEnabled');
  }

  isReduceTransparencyEnabled(): Promise<boolean> {
    return queryState(m => m.getCurrentReduceTransparencyState, 'isReduceTransparencyEnabled');
  }

  // iOS "Increase Contrast": Settings > Accessibility > Display & Text Size. The native
  // getter is optional (older hosts lack it); resolve false when absent rather than reject,
  // keeping the unified surface non-throwing (RN rejects, we mirror the false fallback).
  isDarkerSystemColorsEnabled(): Promise<boolean> {
    return queryOptionalState(
      m => m.getCurrentDarkerSystemColorsState,
      'isDarkerSystemColorsEnabled',
    );
  }

  // iOS reduce-motion sub-setting (prefer cross-fade over slide). Optional native getter;
  // resolve false when absent (RN parity for the unavailable case).
  prefersCrossFadeTransitions(): Promise<boolean> {
    return queryOptionalState(
      m => m.getCurrentPrefersCrossFadeTransitionsState,
      'prefersCrossFadeTransitions',
    );
  }

  // Android-only query; iOS has no high-text-contrast concept, so resolve false (RN parity).
  isHighTextContrastEnabled(): Promise<boolean> {
    return Promise.resolve(false);
  }

  // Android-only query; on iOS RN rejects. We resolve false to keep the unified surface
  // non-throwing; the dlog records that it's a no-op on this platform.
  isAccessibilityServiceEnabled(): Promise<boolean> {
    dlog('AccessibilityInfo(ios).isAccessibilityServiceEnabled -> Android-only (false)');
    return Promise.resolve(false);
  }

  // Post a string to be announced by the screen reader. No-op without a module.
  announceForAccessibility(announcement: string): void {
    const module = getModule();
    if (module === null) {
      dlog('AccessibilityInfo(ios).announceForAccessibility -> no module (no-op)');
      return;
    }
    module.announceForAccessibility(announcement);
  }

  // Announce with queue/priority options. Falls back to the plain announce when the host
  // lacks the options-aware method (older iOS), mirroring RN.
  announceForAccessibilityWithOptions(
    announcement: string,
    options: IAnnounceForAccessibilityOptions,
  ): void {
    const module = getModule();
    if (module === null) {
      dlog('AccessibilityInfo(ios).announceForAccessibilityWithOptions -> no module (no-op)');
      return;
    }
    if (module.announceForAccessibilityWithOptions) {
      module.announceForAccessibilityWithOptions(announcement, options);
    } else {
      module.announceForAccessibility(announcement);
    }
  }

  // Move accessibility focus to the view with the given react tag. No-op without a module.
  // RN deprecates this in favor of sendAccessibilityEvent; kept for parity.
  setAccessibilityFocus(reactTag: number): void {
    const module = getModule();
    if (module === null) {
      dlog('AccessibilityInfo(ios).setAccessibilityFocus -> no module (no-op)');
      return;
    }
    dlog(`AccessibilityInfo(ios).setAccessibilityFocus -> ${reactTag}`);
    module.setAccessibilityFocus(reactTag);
  }

  // iOS has no recommended-timeout query; resolve the original (RN parity).
  getRecommendedTimeoutMillis(originalTimeout: number): Promise<number> {
    return Promise.resolve(originalTimeout);
  }

  // Emit an accessibility event at a view through the Fabric slot. The shared routing
  // (isSymbioteNode guard + dispatch) lives in shared.ts, identical on both platforms;
  // the ONE thing iOS adds is its own early return on 'click' (VoiceOver has no click
  // producer, AccessibilityInfo.js), passed as the shouldSkip hook so it keeps its
  // exact log text.
  sendAccessibilityEvent(handle: IAccessibilityHandle, eventType: IAccessibilityEventType): void {
    routeSendAccessibilityEvent('ios', handle, eventType, () => {
      if (eventType !== 'click') return false;
      dlog('AccessibilityInfo(ios).sendAccessibilityEvent("click") -> iOS no-op (RN parity)');
      return true;
    });
  }

  // Subscribe to an accessibility-state change. A handler for a boolean event receives a
  // boolean; the iOS-only `announcementFinished` carries the announcement payload. Never
  // throws: a public event with no iOS device mapping yields an inert subscription, and a
  // missing module yields a live-but-silent one (the counters are no-ops without a module).
  addEventListener(
    eventName: IAccessibilityChangeEventName,
    handler: IAccessibilityChangeEventHandler,
  ): IEventSubscription {
    const deviceEvent = IOS_DEVICE_EVENT[eventName];
    dlog(
      `AccessibilityInfo(ios).addEventListener -> ${eventName} (device: ${deviceEvent ?? 'none'})`,
    );
    if (deviceEvent === undefined) {
      return { remove(): void {} };
    }
    const eventEmitter = getEmitter();
    return eventEmitter.addListener(deviceEvent, payload => {
      // Most events carry a bare boolean; announcementFinished carries an object. Forward
      // each in its own shape, dropping payloads that match neither so we never forward
      // garbage to the handler.
      if (eventName === 'announcementFinished') {
        if (isAnnouncementFinished(payload)) handler(payload);
        return;
      }
      if (!isBoolean(payload)) return;
      handler(payload);
    });
  }
}

function isAnnouncementFinished(
  payload: unknown,
): payload is IAccessibilityAnnouncementFinishedEvent {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'announcement' in payload &&
    typeof payload.announcement === 'string' &&
    'success' in payload &&
    typeof payload.success === 'boolean'
  );
}

export const AccessibilityInfo: IAccessibilityInfoStatic = new AccessibilityInfoIOS();
