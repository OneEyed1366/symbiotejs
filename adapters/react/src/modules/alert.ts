// Alert now lives framework-agnostic in @symbiotejs/engine (imperative native-bridge
// module, no visual, no lifecycle). The React adapter re-exports it verbatim so the
// public surface is unchanged; the platform split (alert.ios/alert.android) lives
// inside engine. See ADR 0019 + the engine relocation.

export { Alert } from '@symbiotejs/engine';
export type {
  IAlertType,
  IAlertButtonStyle,
  IAlertButton,
  IAlertButtons,
  IAlertOptions,
} from '@symbiotejs/engine';
