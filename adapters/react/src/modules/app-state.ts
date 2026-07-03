// AppState moved to @symbiotejs/engine (a framework-agnostic device-state module re-exported
// by every adapter). This thin re-export keeps @symbiotejs/react's public surface identical.
export { AppState } from '@symbiotejs/engine';
export type { IAppStateStatus, IAppStateEvent } from '@symbiotejs/engine';
