// AccessibilityInfo shared contract moved to @symbiotejs/engine (framework-agnostic, no React
// in the impl). This thin re-export keeps the adapter's local import path stable.
export type {
  IAccessibilityChangeEventName,
  IAccessibilityChangeEvent,
  IAccessibilityHandle,
  IAccessibilityAnnouncementFinishedEvent,
  IAccessibilityChangeEventHandler,
  IAnnounceForAccessibilityOptions,
  IAccessibilityInfoStatic,
  IAccessibilityEventType,
} from '@symbiotejs/engine';
