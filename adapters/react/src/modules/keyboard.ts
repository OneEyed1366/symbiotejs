// Keyboard moved to @symbiotejs/engine (a framework-agnostic device-state module re-exported
// by every adapter). This thin re-export keeps @symbiotejs/react's public surface identical.
export { Keyboard, KEYBOARD_EVENT } from '@symbiotejs/engine';
export type { IKeyboardEventName, IKeyboardEvent, IKeyboardMetrics } from '@symbiotejs/engine';
