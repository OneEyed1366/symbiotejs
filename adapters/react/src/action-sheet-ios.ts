// ActionSheetIOS now lives framework-agnostic in @symbiote/engine (imperative
// native-bridge module, no visual, no lifecycle). The React adapter re-exports it
// verbatim so the public surface is unchanged. See ADR 0019.

export { ActionSheetIOS } from '@symbiote/engine';
export type {
  IActionSheetIOSOptions,
  IShareActionSheetIOSOptions,
  IShareActionSheetError,
} from '@symbiote/engine';
