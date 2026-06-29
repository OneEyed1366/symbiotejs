// Keyboard moved to @symbiote/engine (a framework-agnostic device-state module re-exported
// by every adapter). This thin re-export keeps @symbiote/react's public surface identical.
export { Keyboard, KEYBOARD_EVENT } from '@symbiote/engine';
export type { IKeyboardEventName, IKeyboardEvent, IKeyboardMetrics } from '@symbiote/engine';
