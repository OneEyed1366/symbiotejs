// AccessibilityInfo — shared contract. The component renders NO Fabric view; it
// imperatively queries an accessibility native module and subscribes to its device
// events. What DIVERGES by platform is the native module (iOS `AccessibilityManager`
// with callback getters; Android stock `AccessibilityInfo` with single-callback
// getters), which getters exist, and — critically — the DEVICE-EVENT NAME a public
// event maps to (iOS `screenReaderChanged` vs Android `touchExplorationDidChange`).
// So the .ios/.android files own the native calls and per-platform event-name map;
// the public types + the shared method surface live here. Filename selects, no
// Platform.OS read (see ADR 0012 + native_module_name_is_platform_specific). Mirrors
// RN's Libraries/Components/AccessibilityInfo/AccessibilityInfo.js.

// The public event names a caller can subscribe to. A superset of both platforms:
// some only ever fire on iOS, some only on Android. On a platform that never emits a
// given event the subscription is inert (no device event arrives) — mirrors RN.
export type AccessibilityChangeEventName =
  | 'screenReaderChanged'
  | 'reduceMotionChanged'
  | 'boldTextChanged'
  | 'grayscaleChanged'
  | 'invertColorsChanged'
  | 'reduceTransparencyChanged'
  | 'darkerSystemColorsChanged'
  | 'announcementFinished'
  | 'accessibilityServiceChanged'
  | 'highTextContrastChanged'

// Back-compat alias for the pre-split name. The old iOS file exported
// `AccessibilityChangeEvent`; keep it so existing imports keep resolving.
export type AccessibilityChangeEvent = AccessibilityChangeEventName

// What sendAccessibilityEvent accepts as its target: a host ref/instance, a bare native
// tag, or nothing — exactly the input findNodeHandle resolves. Type-only import from
// host-instance (which never imports accessibility-info, so no cycle).
export type AccessibilityHandle =
  | import('./host-instance').HostInstance
  | import('@symbiote/shared').SymbioteNode
  | number
  | null
  | undefined

// The `announcementFinished` payload (iOS). All other events carry a bare boolean.
export interface AccessibilityAnnouncementFinishedEvent {
  announcement: string
  success: boolean
}

// A change handler receives either a boolean (most events) or the announcement
// payload (`announcementFinished`). Callers narrow as needed.
export type AccessibilityChangeEventHandler = (
  state: boolean | AccessibilityAnnouncementFinishedEvent,
) => void

// Options for announceForAccessibilityWithOptions. Both fields are iOS-only; on
// Android they are ignored and the announcement is posted plainly (mirrors RN).
export interface AnnounceForAccessibilityOptions {
  queue?: boolean
  priority?: 'low' | 'default' | 'high'
}

// The unified imperative surface both platform impls satisfy. Every getter resolves
// to a boolean (false on a platform whose native module lacks the query, mirroring
// RN); getRecommendedTimeoutMillis resolves to a number.
export interface AccessibilityInfoStatic {
  isScreenReaderEnabled(): Promise<boolean>
  isReduceMotionEnabled(): Promise<boolean>
  isBoldTextEnabled(): Promise<boolean>
  isGrayscaleEnabled(): Promise<boolean>
  isInvertColorsEnabled(): Promise<boolean>
  isReduceTransparencyEnabled(): Promise<boolean>
  isHighTextContrastEnabled(): Promise<boolean>
  isAccessibilityServiceEnabled(): Promise<boolean>
  isDarkerSystemColorsEnabled(): Promise<boolean>
  prefersCrossFadeTransitions(): Promise<boolean>
  announceForAccessibility(announcement: string): void
  announceForAccessibilityWithOptions(
    announcement: string,
    options: AnnounceForAccessibilityOptions,
  ): void
  setAccessibilityFocus(reactTag: number): void
  getRecommendedTimeoutMillis(originalTimeout: number): Promise<number>
  sendAccessibilityEvent(handle: AccessibilityHandle, eventType: AccessibilityEventType): void
  addEventListener(
    eventName: AccessibilityChangeEventName,
    handler: AccessibilityChangeEventHandler,
  ): import('@symbiote/shared').EventSubscription
}

// The named events sendAccessibilityEvent can dispatch (RN's AccessibilityEventTypes).
export type AccessibilityEventType = 'click' | 'focus' | 'viewHoverEnter' | 'windowStateChange'

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}
