// AccessibilityInfo (Android) moved to @symbiotejs/engine. This thin re-export keeps
// @symbiotejs/react's surface identical; Metro selects the engine's accessibility-info.android.ts
// on an Android host.
export { AccessibilityInfo } from '@symbiotejs/engine';
export type {
  IAccessibilityChangeEvent,
  IAccessibilityChangeEventName,
  IAccessibilityChangeEventHandler,
  IAccessibilityAnnouncementFinishedEvent,
  IAnnounceForAccessibilityOptions,
  IAccessibilityEventType,
} from '@symbiotejs/engine';
