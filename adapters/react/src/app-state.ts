// AppState moved to @symbiote/engine (a framework-agnostic device-state module re-exported
// by every adapter). This thin re-export keeps @symbiote/react's public surface identical.
export { AppState } from '@symbiote/engine';
export type { IAppStateStatus, IAppStateEvent } from '@symbiote/engine';
