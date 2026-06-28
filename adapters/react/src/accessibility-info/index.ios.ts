// AccessibilityInfo (iOS) moved to @symbiote/engine. This thin re-export keeps @symbiote/react's
// surface identical; Metro selects the engine's accessibility-info.ios.ts on an iOS host.
export { AccessibilityInfo } from '@symbiote/engine';
export type {
  IAccessibilityChangeEvent,
  IAccessibilityChangeEventName,
  IAccessibilityChangeEventHandler,
  IAccessibilityAnnouncementFinishedEvent,
  IAnnounceForAccessibilityOptions,
  IAccessibilityEventType,
} from '@symbiote/engine';
