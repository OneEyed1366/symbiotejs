// AccessibilityInfo, shared contract. The component renders NO Fabric view; it
// imperatively queries an accessibility native module and subscribes to its device
// events. What DIVERGES by platform is the native module (iOS `AccessibilityManager`
// with callback getters; Android stock `AccessibilityInfo` with single-callback
// getters), which getters exist, and the DEVICE-EVENT NAME a public
// event maps to (iOS `screenReaderChanged` vs Android `touchExplorationDidChange`).
// So the .ios/.android files own the native calls and per-platform event-name map;
// the public types + the shared method surface live here. Filename selects, no
// Platform.OS read: the native module name is resolved per platform inside those
// files, not derived from this file's name. Mirrors
// RN's Libraries/Components/AccessibilityInfo/AccessibilityInfo.js.

import { isSymbioteNode, type ISymbioteNode } from '../node';
import type { IEventSubscription } from '../native-events';
import { sendAccessibilityEvent as dispatchAccessibilityEvent } from '../commit';
import { dlog } from '../debug';
export { isBoolean } from '../type-guards';

// The public event names a caller can subscribe to. A superset of both platforms:
// some only ever fire on iOS, some only on Android. On a platform that never emits a
// given event the subscription is inert (no device event arrives), mirroring RN.
export type IAccessibilityChangeEventName =
  | 'screenReaderChanged'
  | 'reduceMotionChanged'
  | 'boldTextChanged'
  | 'grayscaleChanged'
  | 'invertColorsChanged'
  | 'reduceTransparencyChanged'
  | 'darkerSystemColorsChanged'
  | 'announcementFinished'
  | 'accessibilityServiceChanged'
  | 'highTextContrastChanged';

// Back-compat alias for the pre-split name. The old iOS file exported
// `IAccessibilityChangeEvent`; keep it so existing imports keep resolving.
export type IAccessibilityChangeEvent = IAccessibilityChangeEventName;

// What sendAccessibilityEvent accepts as its target: a host node (a host ref's public
// instance IS a SymbioteNode), a bare native tag, or nothing: exactly the input
// findNodeHandle resolves. The adapter's IHostInstance extends ISymbioteNode, so it is
// already assignable here; the engine names only the agnostic node type.
export type IAccessibilityHandle = ISymbioteNode | number | null | undefined;

// The `announcementFinished` payload (iOS). All other events carry a bare boolean.
export interface IAccessibilityAnnouncementFinishedEvent {
  announcement: string;
  success: boolean;
}

// A change handler receives either a boolean (most events) or the announcement
// payload (`announcementFinished`). Callers narrow as needed.
export type IAccessibilityChangeEventHandler = (
  state: boolean | IAccessibilityAnnouncementFinishedEvent,
) => void;

// Options for announceForAccessibilityWithOptions. Both fields are iOS-only; on
// Android they are ignored and the announcement is posted plainly (mirrors RN).
export interface IAnnounceForAccessibilityOptions {
  queue?: boolean;
  priority?: 'low' | 'default' | 'high';
}

// The unified imperative surface both platform impls satisfy. Every getter resolves
// to a boolean (false on a platform whose native module lacks the query, mirroring
// RN); getRecommendedTimeoutMillis resolves to a number.
export interface IAccessibilityInfoStatic {
  isScreenReaderEnabled(): Promise<boolean>;
  isReduceMotionEnabled(): Promise<boolean>;
  isBoldTextEnabled(): Promise<boolean>;
  isGrayscaleEnabled(): Promise<boolean>;
  isInvertColorsEnabled(): Promise<boolean>;
  isReduceTransparencyEnabled(): Promise<boolean>;
  isHighTextContrastEnabled(): Promise<boolean>;
  isAccessibilityServiceEnabled(): Promise<boolean>;
  isDarkerSystemColorsEnabled(): Promise<boolean>;
  prefersCrossFadeTransitions(): Promise<boolean>;
  announceForAccessibility(announcement: string): void;
  announceForAccessibilityWithOptions(
    announcement: string,
    options: IAnnounceForAccessibilityOptions,
  ): void;
  setAccessibilityFocus(reactTag: number): void;
  getRecommendedTimeoutMillis(originalTimeout: number): Promise<number>;
  sendAccessibilityEvent(handle: IAccessibilityHandle, eventType: IAccessibilityEventType): void;
  addEventListener(
    eventName: IAccessibilityChangeEventName,
    handler: IAccessibilityChangeEventHandler,
  ): IEventSubscription;
}

// The named events sendAccessibilityEvent can dispatch (RN's AccessibilityEventTypes).
export type IAccessibilityEventType = 'click' | 'focus' | 'viewHoverEnter' | 'windowStateChange';

// The routing behind IAccessibilityInfoStatic.sendAccessibilityEvent, shared by both
// platforms: resolve the handle to a real SymbioteNode and dispatch through the Fabric
// slot. RN's Fabric path hands the public-instance handle straight to
// nativeFabricUIManager.sendAccessibilityEvent with the STRING eventType, and the C++
// side maps it; the handle here IS the SymbioteNode (symbiote augments the node in
// place as its public instance).
//
// The one thing that genuinely diverges by platform - iOS's early return on 'click'
// (VoiceOver has no click producer, AccessibilityInfo.js) - is NOT decided here: a
// platform passes `shouldSkip`, which both decides AND logs its own skip (so iOS keeps
// its exact "iOS no-op (RN parity)" message); Android omits it and every event reaches
// the slot.
export function routeSendAccessibilityEvent(
  platformLabel: string,
  handle: IAccessibilityHandle,
  eventType: IAccessibilityEventType,
  shouldSkip?: () => boolean,
): void {
  if (shouldSkip?.() === true) return;
  if (!isSymbioteNode(handle)) {
    dlog(
      `AccessibilityInfo(${platformLabel}).sendAccessibilityEvent("${eventType}") -> handle is not a node (no-op)`,
    );
    return;
  }
  dlog(`AccessibilityInfo(${platformLabel}).sendAccessibilityEvent("${eventType}") -> slot`);
  dispatchAccessibilityEvent(handle, eventType);
}
